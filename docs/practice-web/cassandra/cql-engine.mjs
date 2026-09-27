import { parseCql } from "./cql-parser.mjs";

export class CqlExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "CqlExecutionError";
  }
}

const MAX_INT32 = 2 ** 31 - 1;
const MAX_ROWS_PER_TABLE = 5000;
const MIN_INT32 = -(2 ** 31);
const MAX_BIGINT = (2n ** 63n) - 1n;
const MIN_BIGINT = -(2n ** 63n);
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createDatabase() {
  return { tables: new Map() };
}

export function cloneDatabase(database) {
  const clone = createDatabase();
  for (const [name, table] of database.tables) {
    const copy = {
      name: table.name,
      columns: table.columns.map((column) => ({ ...column })),
      columnMap: new Map(table.columns.map((column) => [column.name, column])),
      primaryKey: {
        partitionColumns: [...table.primaryKey.partitionColumns],
        clusteringColumns: [...table.primaryKey.clusteringColumns],
      },
      clusteringOrder: table.clusteringOrder.map((entry) => ({ ...entry })),
      rows: new Map(),
    };
    for (const [key, row] of table.rows) copy.rows.set(key, { ...row });
    clone.tables.set(name, copy);
  }
  return clone;
}

function tableOrError(database, name) {
  const table = database.tables.get(name);
  if (!table) throw new CqlExecutionError(`La tabla «${name}» no existe`);
  return table;
}

function canonicalPart(value) {
  if (value === null) return ["null"];
  if (typeof value === "bigint") return ["bigint", value.toString()];
  if (typeof value === "number") return ["number", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "string") return ["string", value];
  if (value && value.__timestamp === true) return ["timestamp", value.epochMs];
  throw new CqlExecutionError("No se puede usar ese valor en una clave");
}

function keyForValues(values) {
  return JSON.stringify(values.map(canonicalPart));
}

function parseInteger(raw, kind) {
  if (!/^-?\d+$/.test(raw)) throw new CqlExecutionError(`El valor «${raw}» no es un entero`);
  if (kind === "bigint") {
    const value = BigInt(raw);
    if (value < MIN_BIGINT || value > MAX_BIGINT) {
      throw new CqlExecutionError(`El bigint «${raw}» está fuera del rango de 64 bits`);
    }
    return value;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_INT32 || value > MAX_INT32) {
    throw new CqlExecutionError(`El int «${raw}» está fuera del rango de 32 bits`);
  }
  return value;
}

function parseTimestamp(value) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_RE.test(value)) {
    throw new CqlExecutionError(
      "timestamp debe tener formato ISO con zona explícita, por ejemplo 2026-01-03T10:00:00Z",
    );
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) throw new CqlExecutionError(`Timestamp inválido: ${value}`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, zone, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 ||
    day < 1 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day ||
    hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59
  ) throw new CqlExecutionError(`Timestamp inválido: ${value}`);
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs)) throw new CqlExecutionError(`Timestamp inválido: ${value}`);
  return { __timestamp: true, epochMs, iso: new Date(epochMs).toISOString() };
}

function valueFromLiteral(literal, type) {
  if (literal.kind === "null") return null;
  if (type === "text") {
    if (literal.kind !== "string") throw new CqlExecutionError("Una columna text necesita una cadena");
    return literal.value;
  }
  if (type === "timestamp") {
    if (literal.kind !== "string") throw new CqlExecutionError("Un timestamp necesita una cadena ISO");
    return parseTimestamp(literal.value);
  }
  if (type === "boolean") {
    if (literal.kind !== "boolean") throw new CqlExecutionError("Una columna boolean necesita TRUE o FALSE");
    return literal.value;
  }
  if (type === "int" || type === "bigint") {
    if (literal.kind !== "number") throw new CqlExecutionError(`Una columna ${type} necesita un entero`);
    return parseInteger(literal.raw, type);
  }
  throw new CqlExecutionError(`Tipo no soportado: ${type}`);
}

function literalForTypedValue(value, type) {
  if (value === null) return { kind: "null", value: null };
  if (type === "bigint" || type === "int") return { kind: "number", raw: String(value) };
  if (type === "timestamp") return { kind: "string", value: value.iso };
  if (type === "text") return { kind: "string", value };
  if (type === "boolean") return { kind: "boolean", value };
  throw new CqlExecutionError(`Tipo no soportado: ${type}`);
}

function validateSchema(statement) {
  const names = new Set(statement.columns.map((column) => column.name));
  const keyNames = [...statement.primaryKey.partitionColumns, ...statement.primaryKey.clusteringColumns];
  if (new Set(keyNames).size !== keyNames.length) {
    throw new CqlExecutionError("Una columna no puede repetirse en PRIMARY KEY");
  }
  for (const name of keyNames) {
    if (!names.has(name)) throw new CqlExecutionError(`La clave usa una columna inexistente: ${name}`);
  }
}

function makeTable(statement) {
  validateSchema(statement);
  const columns = statement.columns.map((column) => ({ ...column }));
  return {
    name: statement.table,
    columns,
    columnMap: new Map(columns.map((column) => [column.name, column])),
    primaryKey: {
      partitionColumns: [...statement.primaryKey.partitionColumns],
      clusteringColumns: [...statement.primaryKey.clusteringColumns],
    },
    clusteringOrder: statement.primaryKey.clusteringColumns.map((name, index) => {
      const explicit = statement.clusteringOrder.find((entry) => entry.name === name);
      return { name, direction: explicit?.direction ?? "ASC", index };
    }),
    rows: new Map(),
  };
}

function primaryKeyParts(table, row) {
  const names = [...table.primaryKey.partitionColumns, ...table.primaryKey.clusteringColumns];
  return names.map((name) => {
    const value = row[name];
    if (value === null || value === undefined) {
      throw new CqlExecutionError(`La clave primaria no puede contener NULL: ${name}`);
    }
    return value;
  });
}

function partitionKey(table, row) {
  return table.primaryKey.partitionColumns.map((name) => row[name]);
}

function rowKey(table, row) {
  return keyForValues(primaryKeyParts(table, row));
}

function convertInputRow(table, input) {
  const row = {};
  for (const column of table.columns) {
    const raw = input[column.name];
    if (raw === undefined) row[column.name] = null;
    else row[column.name] = valueFromLiteral(raw, column.type);
  }
  return row;
}

function upsert(table, statement) {
  const supplied = new Set(statement.columns);
  const values = {};
  for (const name of statement.columns) {
    const column = table.columnMap.get(name);
    if (!column) throw new CqlExecutionError(`INSERT usa una columna inexistente: ${name}`);
    values[name] = valueFromLiteral(
      statement.values[statement.columns.indexOf(name)],
      column.type,
    );
  }
  for (const name of table.primaryKey.partitionColumns.concat(table.primaryKey.clusteringColumns)) {
    if (!supplied.has(name)) throw new CqlExecutionError(`INSERT debe incluir toda la clave: ${name}`);
    if (values[name] === null) throw new CqlExecutionError(`La clave primaria no puede ser NULL: ${name}`);
  }
  const key = rowKey(table, { ...Object.fromEntries(table.columns.map((column) => [column.name, null])), ...values });
  const previous = table.rows.get(key);
  if (!previous && table.rows.size >= MAX_ROWS_PER_TABLE) {
    throw new CqlExecutionError(`Una tabla no puede superar ${MAX_ROWS_PER_TABLE} filas en este laboratorio`);
  }
  const row = previous ? { ...previous, ...values } : Object.fromEntries(table.columns.map((column) => [column.name, values[column.name] ?? null]));
  table.rows.set(key, row);
  return { created: !previous, row, key };
}

function compareValues(left, right) {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  const leftValue = left?.__timestamp ? left.epochMs : left;
  const rightValue = right?.__timestamp ? right.epochMs : right;
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function sortedRows(table, rows) {
  const order = table.clusteringOrder;
  return [...rows].sort((left, right) => {
    for (const entry of order) {
      const result = compareValues(left[entry.name], right[entry.name]);
      if (result !== 0) return entry.direction === "DESC" ? -result : result;
    }
    return 0;
  });
}

function sameValue(left, right) {
  return compareValues(left, right) === 0;
}

function predicateMatches(row, predicate) {
  const actual = row[predicate.column];
  const expected = predicate.value;
  const comparison = compareValues(actual, expected);
  if (predicate.operator === "=") return sameValue(actual, expected);
  if (predicate.operator === "<") return comparison < 0;
  if (predicate.operator === "<=") return comparison <= 0;
  if (predicate.operator === ">") return comparison > 0;
  if (predicate.operator === ">=") return comparison >= 0;
  throw new CqlExecutionError(`Operador no soportado: ${predicate.operator}`);
}

function normalizePredicates(table, predicates) {
  const seen = new Map();
  return predicates.map((predicate) => {
    const column = table.columnMap.get(predicate.column);
    if (!column) throw new CqlExecutionError(`WHERE usa una columna inexistente: ${predicate.column}`);
    const previous = seen.get(predicate.column) ?? [];
    if (previous.length && (previous.length >= 2 || previous.some((entry) => entry.operator === predicate.operator) || previous.some((entry) => entry.operator === "=") || predicate.operator === "=")) {
      throw new CqlExecutionError(`WHERE repite una condición incompatible para ${predicate.column}`);
    }
    if (predicate.value.kind === "null") {
      throw new CqlExecutionError("No se puede comparar una clave o columna con NULL");
    }
    const value = valueFromLiteral(predicate.value, column.type);
    const normalized = { column: predicate.column, operator: predicate.operator, value };
    seen.set(predicate.column, [...previous, normalized]);
    return normalized;
  });
}

function classifyQuery(table, predicates, allowFiltering) {
  const byColumn = new Map();
  for (const predicate of predicates) {
    const entries = byColumn.get(predicate.column) ?? [];
    entries.push(predicate);
    byColumn.set(predicate.column, entries);
  }
  const partition = table.primaryKey.partitionColumns;
  const clustering = table.primaryKey.clusteringColumns;
  const hasAllPartitionEquality = partition.every((name) => {
    const entries = byColumn.get(name) ?? [];
    return entries.length === 1 && entries[0].operator === "=";
  });
  const nonKey = predicates.filter(
    (predicate) => !partition.includes(predicate.column) && !clustering.includes(predicate.column),
  );
  let contiguous = true;
  let rangeSeen = false;
  for (let index = 0; index < clustering.length; index += 1) {
    const name = clustering[index];
    const entries = byColumn.get(name) ?? [];
    if (!entries.length) {
      if (clustering.slice(index + 1).some((later) => byColumn.has(later))) contiguous = false;
      break;
    }
    if (rangeSeen || entries.some((entry) => entry.operator === "=") && entries.length > 1) contiguous = false;
    if (entries.some((entry) => entry.operator !== "=")) rangeSeen = true;
  }

  if (allowFiltering) {
    return {
      mode: "filtering",
      requiresFiltering: true,
      reason: "ALLOW FILTERING autoriza recorrer y filtrar filas en este ejemplo pequeño.",
    };
  }
  if (!predicates.length) {
    return {
      mode: "table-scan",
      requiresFiltering: false,
      reason: "Sin WHERE se recorre el conjunto sintético completo del laboratorio.",
    };
  }
  if (!hasAllPartitionEquality) {
    return {
      mode: "rejected",
      requiresFiltering: true,
      reason: "Falta la igualdad de todos los componentes de la clave de partición; se necesita ALLOW FILTERING.",
    };
  }
  if (!contiguous) {
    return {
      mode: "rejected",
      requiresFiltering: true,
      reason: "Los filtros de clustering no forman un prefijo contiguo; se necesita ALLOW FILTERING.",
    };
  }
  if (nonKey.length) {
    return {
      mode: "rejected",
      requiresFiltering: true,
      reason: "Una columna ordinaria no forma parte del acceso por clave; se necesita ALLOW FILTERING.",
    };
  }
  return {
    mode: rangeSeen ? "partition-range" : "partition",
    requiresFiltering: false,
    reason: rangeSeen
      ? "Se accede a una partición y a un intervalo contiguo de clustering."
      : "Se accede directamente a la partición indicada.",
  };
}

function candidateRows(table, predicates, classification) {
  if (classification.mode === "partition" || classification.mode === "partition-range") {
    const byColumn = new Map();
    for (const predicate of predicates) {
      const entries = byColumn.get(predicate.column) ?? [];
      entries.push(predicate);
      byColumn.set(predicate.column, entries);
    }
    const expected = table.primaryKey.partitionColumns.map((name) => byColumn.get(name)[0].value);
    return [...table.rows.values()].filter((row) =>
      table.primaryKey.partitionColumns.every((name, index) => sameValue(row[name], expected[index])),
    );
  }
  return [...table.rows.values()];
}

function displayValue(value) {
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (value?.__timestamp) return value.iso;
  return value;
}

function displayRow(row, columns) {
  const names = columns[0] === "*" ? Object.keys(row) : columns;
  return Object.fromEntries(names.map((name) => [name, displayValue(row[name])]));
}

function executeCreate(database, statement) {
  if (database.tables.has(statement.table)) {
    if (statement.ifNotExists) return { kind: "create-table", created: false, table: statement.table };
    throw new CqlExecutionError(`La tabla «${statement.table}» ya existe`);
  }
  const table = makeTable(statement);
  database.tables.set(table.name, table);
  return { kind: "create-table", created: true, table: table.name, schema: schemaView(table) };
}

function executeDrop(database, statement) {
  if (!database.tables.has(statement.table) && !statement.ifExists) {
    throw new CqlExecutionError(`La tabla «${statement.table}» no existe`);
  }
  const dropped = database.tables.delete(statement.table);
  return { kind: "drop-table", dropped, table: statement.table };
}

function executeInsert(database, statement) {
  const table = tableOrError(database, statement.table);
  const result = upsert(table, statement);
  return {
    kind: "insert",
    created: result.created,
    table: statement.table,
    row: displayRow(result.row, ["*"]),
    partitionKey: result.row
      ? table.primaryKey.partitionColumns.map((name) => displayValue(result.row[name]))
      : [],
  };
}

function executeSelect(database, statement) {
  const table = tableOrError(database, statement.table);
  const selectedColumns = statement.columns[0] === "*" ? table.columns.map((column) => column.name) : statement.columns;
  for (const name of selectedColumns) {
    if (!table.columnMap.has(name)) throw new CqlExecutionError(`SELECT usa una columna inexistente: ${name}`);
  }
  const predicates = normalizePredicates(table, statement.predicates);
  const classification = classifyQuery(table, predicates, statement.allowFiltering);
  if (classification.mode === "rejected") {
    throw new CqlExecutionError(`${classification.reason} Añade ALLOW FILTERING si aceptas ese recorrido.`);
  }
  const candidates = candidateRows(table, predicates, classification);
  const matching = sortedRows(table, candidates).filter((row) =>
    predicates.every((predicate) => predicateMatches(row, predicate)),
  );
  const limit = statement.limit === null ? null : parseInteger(statement.limit, "int");
  if (limit !== null && limit <= 0) throw new CqlExecutionError("LIMIT debe ser un entero positivo");
  const rows = (limit === null ? matching : matching.slice(0, limit)).map((row) => displayRow(row, selectedColumns));
  return {
    kind: "select",
    table: statement.table,
    rows,
    explanation: {
      mode: classification.mode,
      requiresFiltering: classification.requiresFiltering,
      reason: classification.reason,
      candidateRows: candidates.length,
      matchingRows: matching.length,
      returnedRows: rows.length,
    },
  };
}

export function execute(database, statement) {
  if (!statement || typeof statement.kind !== "string") throw new TypeError("Sentencia CQL inválida");
  if (statement.kind === "create-table") return executeCreate(database, statement);
  if (statement.kind === "drop-table") return executeDrop(database, statement);
  if (statement.kind === "insert") return executeInsert(database, statement);
  if (statement.kind === "select") return executeSelect(database, statement);
  throw new CqlExecutionError(`Sentencia no implementada: ${statement.kind}`);
}

export function executeCql(database, source) {
  if (source.length > 64 * 1024) throw new CqlExecutionError("La entrada supera el límite de 64 KiB");
  const statements = parseCql(source);
  if (statements.length > 100) throw new CqlExecutionError("Se permiten como máximo 100 sentencias");
  const results = [];
  for (const statement of statements) {
    try {
      results.push(execute(database, statement));
    } catch (error) {
      if (error instanceof Error) {
        error.appliedResults = results;
      }
      throw error;
    }
  }
  return results;
}

export function loadRowsAsCql(database, tableName, rows) {
  const table = tableOrError(database, tableName);
  return rows.map((row) => {
    const columns = table.columns.map((column) => column.name);
    const literals = columns.map((name) => literalForTypedValue(row[name], table.columnMap.get(name).type));
    return execute(database, { kind: "insert", table: tableName, columns, values: literals });
  });
}

export function schemaView(table) {
  return {
    name: table.name,
    columns: table.columns.map((column) => ({ ...column })),
    primaryKey: {
      partitionColumns: [...table.primaryKey.partitionColumns],
      clusteringColumns: [...table.primaryKey.clusteringColumns],
    },
    clusteringOrder: table.clusteringOrder.map(({ name, direction }) => ({ name, direction })),
    rowCount: table.rows.size,
    partitionCount: new Set(
      [...table.rows.values()].map((row) => keyForValues(partitionKey(table, row))),
    ).size,
  };
}

export function tableRows(table) {
  return sortedRows(table, table.rows.values()).map((row) => displayRow(row, ["*"]));
}

export function databaseView(database) {
  return [...database.tables.values()].map(schemaView);
}

export function toCqlLiteral(value, type) {
  const literal = literalForTypedValue(value, type);
  if (literal.kind === "null") return "NULL";
  if (literal.kind === "boolean") return literal.value ? "TRUE" : "FALSE";
  if (literal.kind === "number") return literal.raw;
  return `'${literal.value.replaceAll("'", "''")}'`;
}
