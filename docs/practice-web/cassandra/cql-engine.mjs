import { parseCql } from "./cql-parser.mjs";

export class CqlExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "CqlExecutionError";
  }
}

const MAX_INT32 = 2 ** 31 - 1;
const MAX_ROWS_PER_TABLE = 6000;
export const NODE_COUNT = 4;
const TOKEN_SPACE = 2 ** 32;
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
      indexes: new Map([...table.indexes].map(([indexName, index]) => [indexName, { ...index }])),
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

/** Clave canónica de una partición a partir de sus valores ya tipados. */
export function canonicalKey(values) {
  return keyForValues(values);
}

/**
 * Token didáctico de una partición: FNV-1a de 32 bits sobre la clave
 * canónica. Cassandra usa Murmur3 de 64 bits; aquí sólo importa que el mismo
 * valor de clave caiga siempre en el mismo nodo y que claves distintas se
 * repartan.
 */
export function tokenForPartitionKey(canonicalKey) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonicalKey.length; index += 1) {
    hash ^= canonicalKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Mezcla final para que claves parecidas no queden en tokens contiguos.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

export function nodeForToken(token) {
  return Math.min(NODE_COUNT - 1, Math.floor((token / TOKEN_SPACE) * NODE_COUNT));
}

function partitionKeyString(table, row) {
  return keyForValues(table.primaryKey.partitionColumns.map((name) => row[name]));
}

function placement(table, row) {
  const key = partitionKeyString(table, row);
  const token = tokenForPartitionKey(key);
  return { key, token, node: nodeForToken(token) };
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
    indexes: new Map(),
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
  const placed = new Map();
  const placeOf = (row) => {
    if (!placed.has(row)) placed.set(row, placement(table, row));
    return placed.get(row);
  };
  return [...rows].sort((left, right) => {
    // Como en Cassandra, un recorrido de varias particiones sale en orden de
    // token; dentro de cada partición, en el orden de clustering.
    const leftPlace = placeOf(left);
    const rightPlace = placeOf(right);
    if (leftPlace.token !== rightPlace.token) return leftPlace.token - rightPlace.token;
    if (leftPlace.key !== rightPlace.key) return leftPlace.key < rightPlace.key ? -1 : 1;
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

function groupPredicates(predicates) {
  const byColumn = new Map();
  for (const predicate of predicates) {
    const entries = byColumn.get(predicate.column) ?? [];
    entries.push(predicate);
    byColumn.set(predicate.column, entries);
  }
  return byColumn;
}

function indexedColumns(table) {
  return new Set([...table.indexes.values()].map((index) => index.column));
}

/**
 * Decide qué recorrido representa una consulta, como haría el coordinador:
 * - partition / partition-range: todos los componentes de la clave de
 *   partición por igualdad y, si hay clustering, un prefijo contiguo; se lee
 *   una partición en un nodo;
 * - index: un índice secundario (local a cada nodo) resuelve una condición;
 *   hay que preguntar a todos los nodos, pero cada uno lee sólo lo indexado;
 * - filtering / partition-filtering: ALLOW FILTERING autoriza leer y
 *   descartar filas, en todo el clúster o dentro de una partición;
 * - table-scan: sin WHERE, se recorre la tabla entera.
 */
function classifyQuery(table, predicates, allowFiltering) {
  const byColumn = groupPredicates(predicates);
  const partition = table.primaryKey.partitionColumns;
  const clustering = table.primaryKey.clusteringColumns;
  const indexed = indexedColumns(table);
  const hasAllPartitionEquality = partition.every((name) => {
    const entries = byColumn.get(name) ?? [];
    return entries.length === 1 && entries[0].operator === "=";
  });
  const partialPartition = partition.some((name) => byColumn.has(name)) && !hasAllPartitionEquality;
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
    if (rangeSeen) contiguous = false;
    if (entries.some((entry) => entry.operator !== "=")) rangeSeen = true;
  }

  if (!predicates.length) {
    return {
      mode: "table-scan",
      requiresFiltering: false,
      reason: "Sin WHERE, el coordinador pide a todos los nodos todas sus particiones: es un recorrido completo de la tabla.",
    };
  }

  if (hasAllPartitionEquality && contiguous && !nonKey.length) {
    return {
      mode: rangeSeen ? "partition-range" : "partition",
      requiresFiltering: false,
      reason: rangeSeen
        ? "La clave de partición completa localiza un único nodo; dentro de la partición, el clustering delimita un intervalo contiguo de filas ya ordenadas."
        : "La clave de partición completa localiza un único nodo y una única partición, cuyas filas ya están ordenadas por el clustering.",
    };
  }

  if (hasAllPartitionEquality && allowFiltering) {
    return {
      mode: "partition-filtering",
      requiresFiltering: true,
      reason: "La clave de partición localiza un único nodo, pero ALLOW FILTERING tiene que leer y descartar filas de esa partición que no cumplen el resto de condiciones.",
    };
  }

  const usable = predicates.filter((predicate) => indexed.has(predicate.column));
  if (!hasAllPartitionEquality && usable.length) {
    const rest = predicates.filter((predicate) => !indexed.has(predicate.column) && !partition.includes(predicate.column));
    if (partialPartition && !allowFiltering) {
      return {
        mode: "rejected",
        requiresFiltering: true,
        reason: "La clave de partición está incompleta: o se dan todos sus componentes por igualdad o no se da ninguno.",
      };
    }
    if (rest.length && !allowFiltering) {
      return {
        mode: "rejected",
        requiresFiltering: true,
        reason: `El índice resuelve ${usable.map((predicate) => predicate.column).join(", ")}, pero ${rest.map((predicate) => predicate.column).join(", ")} no está indexada; habría que filtrar.`,
      };
    }
    return {
      mode: "index",
      requiresFiltering: rest.length > 0,
      indexColumns: [...new Set(usable.map((predicate) => predicate.column))],
      reason: "El índice secundario es local: cada nodo indexa sólo sus propias filas. El coordinador tiene que preguntar a todos los nodos, aunque cada uno lee únicamente las filas que el índice señala.",
    };
  }

  if (allowFiltering) {
    return {
      mode: "filtering",
      requiresFiltering: true,
      reason: "ALLOW FILTERING autoriza a recorrer todas las particiones de todos los nodos y descartar las filas que no cumplen la condición: el coste crece con la tabla, no con el resultado.",
    };
  }
  if (!hasAllPartitionEquality) {
    return {
      mode: "rejected",
      requiresFiltering: true,
      reason: `Falta la igualdad de ${partition.filter((name) => !(byColumn.get(name) ?? []).some((entry) => entry.operator === "=")).join(", ")}, que forma la clave de partición: sin ella el coordinador no sabe a qué nodo ir.`,
    };
  }
  if (!contiguous) {
    return {
      mode: "rejected",
      requiresFiltering: true,
      reason: "Las condiciones de clustering no forman un prefijo contiguo: las filas que piden no están juntas dentro de la partición.",
    };
  }
  return {
    mode: "rejected",
    requiresFiltering: true,
    reason: `${nonKey.map((predicate) => predicate.column).join(", ")} no forma parte de la clave ni tiene índice: habría que leer filas para descartarlas.`,
  };
}

const ACCESS_LABELS = Object.freeze({
  "partition": "Una partición",
  "partition-range": "Intervalo dentro de una partición",
  "partition-filtering": "Una partición con filtrado",
  "index": "Índice secundario local",
  "filtering": "Recorrido completo con ALLOW FILTERING",
  "table-scan": "Recorrido completo de la tabla",
});

export function accessLabel(mode) {
  return ACCESS_LABELS[mode] ?? mode;
}

function rowsByIndexedPredicates(table, predicates, classification) {
  const indexedPredicates = predicates.filter((predicate) => classification.indexColumns.includes(predicate.column));
  return [...table.rows.values()].filter((row) => indexedPredicates.every((predicate) => predicateMatches(row, predicate)));
}

function candidateRows(table, predicates, classification) {
  if (["partition", "partition-range", "partition-filtering"].includes(classification.mode)) {
    const byColumn = groupPredicates(predicates);
    const expected = table.primaryKey.partitionColumns.map((name) => byColumn.get(name)[0].value);
    return [...table.rows.values()].filter((row) =>
      table.primaryKey.partitionColumns.every((name, index) => sameValue(row[name], expected[index])),
    );
  }
  if (classification.mode === "index") return rowsByIndexedPredicates(table, predicates, classification);
  return [...table.rows.values()];
}

function contactedNodes(table, predicates, classification) {
  if (["partition", "partition-range", "partition-filtering"].includes(classification.mode)) {
    const byColumn = groupPredicates(predicates);
    const values = {};
    for (const name of table.primaryKey.partitionColumns) values[name] = byColumn.get(name)[0].value;
    return [placement(table, values).node];
  }
  return Array.from({ length: NODE_COUNT }, (_, index) => index);
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
    partitionKey: table.primaryKey.partitionColumns.map((name) => displayValue(result.row[name])),
    partition: partitionKeyString(table, result.row),
    node: placement(table, result.row).node,
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
    throw new CqlExecutionError(`${classification.reason} Cassandra rechaza la consulta; añade ALLOW FILTERING sólo si aceptas ese recorrido.`);
  }
  const candidates = candidateRows(table, predicates, classification);
  const matching = sortedRows(table, candidates).filter((row) =>
    predicates.every((predicate) => predicateMatches(row, predicate)),
  );
  const limit = statement.limit === null ? null : parseInteger(statement.limit, "int");
  if (limit !== null && limit <= 0) throw new CqlExecutionError("LIMIT debe ser un entero positivo");
  const kept = limit === null ? matching : matching.slice(0, limit);
  const rows = kept.map((row) => displayRow(row, selectedColumns));
  // Las filas de un acceso por clave están contiguas y ordenadas: se leen
  // sólo las que se devuelven. En los demás casos se examina cada candidata.
  const direct = classification.mode === "partition" || classification.mode === "partition-range";
  const readPartitions = new Set((direct ? kept : candidates).map((row) => partitionKeyString(table, row)));
  return {
    kind: "select",
    table: statement.table,
    columns: selectedColumns,
    rows,
    explanation: {
      mode: classification.mode,
      label: accessLabel(classification.mode),
      requiresFiltering: classification.requiresFiltering,
      reason: classification.reason,
      nodes: contactedNodes(table, predicates, classification),
      nodeCount: NODE_COUNT,
      partitionKeys: [...readPartitions],
      partitionsRead: direct && !kept.length ? 1 : readPartitions.size,
      candidateRows: direct ? kept.length : candidates.length,
      matchingRows: matching.length,
      returnedRows: rows.length,
    },
  };
}

function findIndex(database, name) {
  for (const table of database.tables.values()) {
    if (table.indexes.has(name)) return table;
  }
  return null;
}

function executeCreateIndex(database, statement) {
  const table = tableOrError(database, statement.table);
  const column = table.columnMap.get(statement.column);
  if (!column) throw new CqlExecutionError(`CREATE INDEX usa una columna inexistente: ${statement.column}`);
  if (table.primaryKey.partitionColumns.includes(statement.column)) {
    throw new CqlExecutionError("Indexar una columna de la clave de partición no está implementado en este simulador");
  }
  const name = statement.name ?? `${table.name}_${statement.column}_idx`;
  const existing = [...table.indexes.values()].find((index) => index.column === statement.column);
  if (findIndex(database, name) || existing) {
    if (statement.ifNotExists) return { kind: "create-index", created: false, table: table.name, index: name, column: statement.column };
    throw new CqlExecutionError(existing ? `La columna ${statement.column} ya tiene el índice ${existing.name}` : `El índice «${name}» ya existe`);
  }
  table.indexes.set(name, { name, column: statement.column, using: statement.using });
  return { kind: "create-index", created: true, table: table.name, index: name, column: statement.column };
}

function executeDropIndex(database, statement) {
  const table = findIndex(database, statement.name);
  if (!table) {
    if (statement.ifExists) return { kind: "drop-index", dropped: false, index: statement.name };
    throw new CqlExecutionError(`El índice «${statement.name}» no existe`);
  }
  table.indexes.delete(statement.name);
  return { kind: "drop-index", dropped: true, index: statement.name, table: table.name };
}

export function execute(database, statement) {
  if (!statement || typeof statement.kind !== "string") throw new TypeError("Sentencia CQL inválida");
  if (statement.kind === "create-table") return executeCreate(database, statement);
  if (statement.kind === "drop-table") return executeDrop(database, statement);
  if (statement.kind === "insert") return executeInsert(database, statement);
  if (statement.kind === "select") return executeSelect(database, statement);
  if (statement.kind === "create-index") return executeCreateIndex(database, statement);
  if (statement.kind === "drop-index") return executeDropIndex(database, statement);
  throw new CqlExecutionError(`Sentencia no implementada: ${statement.kind}`);
}

/**
 * Ejecuta varias sentencias. `afterStatement(result)` se llama tras cada una;
 * el laboratorio lo usa para poblar una tabla recién creada antes de que se
 * ejecute la sentencia siguiente, como haría el cargador de un cuaderno.
 */
export function executeCql(database, source, { afterStatement = null } = {}) {
  if (source.length > 64 * 1024) throw new CqlExecutionError("La entrada supera el límite de 64 KiB");
  const statements = parseCql(source);
  if (statements.length > 100) throw new CqlExecutionError("Se permiten como máximo 100 sentencias");
  const results = [];
  for (const statement of statements) {
    try {
      const result = execute(database, statement);
      if (afterStatement) afterStatement(result);
      results.push(result);
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

/**
 * Escribe filas con valores JavaScript planos (números, cadenas ISO, null)
 * pasando por la misma validación que un INSERT.
 */
export function populateTable(database, tableName, rows) {
  const table = tableOrError(database, tableName);
  const plainLiteral = (value) => {
    if (value === null || value === undefined) return { kind: "null", value: null };
    if (typeof value === "number" || typeof value === "bigint") return { kind: "number", raw: String(value) };
    if (typeof value === "boolean") return { kind: "boolean", value };
    return { kind: "string", value: String(value) };
  };
  let created = 0;
  for (const row of rows) {
    const columns = Object.keys(row).filter((name) => table.columnMap.has(name));
    const values = columns.map((name) => plainLiteral(row[name]));
    const result = upsert(table, { columns, values });
    if (result.created) created += 1;
  }
  return { written: rows.length, created };
}

/** Particiones de una tabla con su token y su nodo, en orden de token. */
export function partitionLayout(table) {
  const partitions = new Map();
  for (const row of sortedRows(table, table.rows.values())) {
    const place = placement(table, row);
    if (!partitions.has(place.key)) {
      partitions.set(place.key, {
        key: place.key,
        token: place.token,
        node: place.node,
        values: table.primaryKey.partitionColumns.map((name) => displayValue(row[name])),
        rows: [],
      });
    }
    partitions.get(place.key).rows.push(displayRow(row, ["*"]));
  }
  return [...partitions.values()];
}

export function schemaView(table) {
  const layout = partitionLayout(table);
  const nodeRows = Array.from({ length: NODE_COUNT }, () => 0);
  for (const partition of layout) nodeRows[partition.node] += partition.rows.length;
  return {
    name: table.name,
    columns: table.columns.map((column) => ({ ...column })),
    primaryKey: {
      partitionColumns: [...table.primaryKey.partitionColumns],
      clusteringColumns: [...table.primaryKey.clusteringColumns],
    },
    clusteringOrder: table.clusteringOrder.map(({ name, direction }) => ({ name, direction })),
    indexes: [...table.indexes.values()].map((index) => ({ ...index })),
    rowCount: table.rows.size,
    partitionCount: layout.length,
    largestPartition: layout.reduce((largest, partition) => Math.max(largest, partition.rows.length), 0),
    nodeRows,
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
