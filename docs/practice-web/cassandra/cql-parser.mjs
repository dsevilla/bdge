/**
 * Parser pequeño, deliberadamente acotado, para el laboratorio educativo de
 * Cassandra. No intenta ser un parser completo de CQL: todo lo que no forma
 * parte del dialecto documentado produce un error con posición.
 */

const SUPPORTED_TYPES = new Set(["int", "bigint", "text", "boolean", "timestamp"]);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class CqlParseError extends Error {
  constructor(message, position = 0, source = "") {
    const location = source ? locationAt(source, position) : null;
    super(location ? `${message} (línea ${location.line}, columna ${location.column})` : message);
    this.name = "CqlParseError";
    this.position = position;
    this.line = location?.line ?? null;
    this.column = location?.column ?? null;
  }
}

function locationAt(source, position) {
  const before = source.slice(0, position);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: position - lastNewline };
}

function error(message, token, source) {
  throw new CqlParseError(message, token?.start ?? source.length, source);
}

function isBareIdentifierStart(character) {
  return /[A-Za-z_]/.test(character);
}

function isBareIdentifierPart(character) {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

function isDigit(character) {
  return character !== undefined && character >= "0" && character <= "9";
}

/**
 * Tokeniza sin perder posiciones. Los identificadores citados y las cadenas
 * usan comillas duplicadas para escapar la comilla, como CQL/SQL.
 */
export function tokenize(source) {
  const tokens = [];
  let index = 0;

  const push = (type, value, start, end, quoted = false) => {
    tokens.push({ type, value, start, end, quoted });
  };

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (source.startsWith("--", index) || source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) {
        throw new CqlParseError("Comentario sin cerrar", index, source);
      }
      index = end + 2;
      continue;
    }

    if (character === "'") {
      const start = index;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] !== "'") {
          value += source[index];
          index += 1;
          continue;
        }
        if (source[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) {
        throw new CqlParseError("Cadena sin cerrar", start, source);
      }
      push("string", value, start, index);
      continue;
    }

    if (character === '"') {
      const start = index;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] !== '"') {
          value += source[index];
          index += 1;
          continue;
        }
        if (source[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) {
        throw new CqlParseError("Identificador citado sin cerrar", start, source);
      }
      push("identifier", value, start, index, true);
      continue;
    }

    if (isBareIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (isBareIdentifierPart(source[index])) {
        index += 1;
      }
      push("identifier", source.slice(start, index), start, index, false);
      continue;
    }

    if (character === "-" && isDigit(source[index + 1])) {
      const start = index;
      index += 1;
      while (isDigit(source[index])) index += 1;
      push("number", source.slice(start, index), start, index);
      continue;
    }
    if (isDigit(character)) {
      const start = index;
      index += 1;
      while (isDigit(source[index])) index += 1;
      push("number", source.slice(start, index), start, index);
      continue;
    }

    const twoCharacter = source.slice(index, index + 2);
    if (["<=", ">=", "!=", "=="].includes(twoCharacter)) {
      push("operator", twoCharacter, index, index + 2);
      index += 2;
      continue;
    }
    if ("(),;.*=<>".includes(character)) {
      push("punctuation", character, index, index + 1);
      index += 1;
      continue;
    }

    throw new CqlParseError(`Carácter no reconocido: ${character}`, index, source);
  }

  tokens.push({ type: "eof", value: "", start: source.length, end: source.length, quoted: false });
  return tokens;
}

function keyword(token, value) {
  return token?.type === "identifier" && !token.quoted && token.value.toUpperCase() === value;
}

function punctuation(token, value) {
  return token?.value === value;
}

function identifierValue(token, source) {
  if (token?.type !== "identifier") error("Se esperaba un identificador", token, source);
  if (!token.quoted && !IDENTIFIER_RE.test(token.value)) {
    error(`Identificador no válido: ${token.value}`, token, source);
  }
  return token.quoted ? token.value : token.value.toLowerCase();
}

class Parser {
  constructor(source) {
    this.source = source;
    this.tokens = tokenize(source);
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  advance() {
    const token = this.current();
    this.index += 1;
    return token;
  }

  fail(message, token = this.current()) {
    error(message, token, this.source);
  }

  takePunctuation(value) {
    if (!punctuation(this.current(), value)) return false;
    this.advance();
    return true;
  }

  expectPunctuation(value) {
    if (!this.takePunctuation(value)) this.fail(`Se esperaba «${value}»`);
  }

  takeKeyword(value) {
    if (!keyword(this.current(), value)) return false;
    this.advance();
    return true;
  }

  expectKeyword(value) {
    if (!this.takeKeyword(value)) this.fail(`Se esperaba ${value}`);
  }

  takeIdentifier() {
    if (this.current().type !== "identifier") return null;
    return identifierValue(this.advance(), this.source);
  }

  expectIdentifier() {
    const name = this.takeIdentifier();
    if (name === null) this.fail("Se esperaba un identificador");
    return name;
  }

  parse() {
    const statements = [];
    while (this.current().type !== "eof") {
      if (this.takePunctuation(";")) continue;
      statements.push(this.parseStatement());
      if (this.current().type !== "eof" && !this.punctuationAtCurrent(";")) {
        this.fail("Cláusula o tokens no implementados en este simulador; se esperaba «;» entre sentencias");
      }
    }
    if (!statements.length) this.fail("No hay ninguna sentencia");
    return statements;
  }

  punctuationAtCurrent(value) {
    return punctuation(this.current(), value);
  }

  parseStatement() {
    if (this.takeKeyword("CREATE")) return this.parseCreateTable();
    if (this.takeKeyword("DROP")) return this.parseDropTable();
    if (this.takeKeyword("INSERT")) return this.parseInsert();
    if (this.takeKeyword("SELECT")) return this.parseSelect();
    this.fail("Sentencia no implementada en este simulador; se esperaba CREATE, DROP, INSERT o SELECT");
  }

  parseTableName() {
    const name = this.expectIdentifier();
    if (this.takePunctuation(".")) {
      this.fail("Los nombres calificados por keyspace no están implementados en este simulador");
    }
    return name;
  }

  parseCreateTable() {
    this.expectKeyword("TABLE");
    const ifNotExists = this.takeKeyword("IF")
      ? (this.expectKeyword("NOT"), this.expectKeyword("EXISTS"), true)
      : false;
    const table = this.parseTableName();
    this.expectPunctuation("(");
    const columns = [];
    let primaryKey = null;
    while (!this.takePunctuation(")")) {
      if (this.takeKeyword("PRIMARY")) {
        if (primaryKey) this.fail("La tabla declara PRIMARY KEY más de una vez");
        this.expectKeyword("KEY");
        primaryKey = this.parsePrimaryKey();
      } else {
        const name = this.expectIdentifier();
        const typeToken = this.current();
        const type = this.expectIdentifier().toLowerCase();
        if (!SUPPORTED_TYPES.has(type)) {
          this.fail(`Tipo no soportado por este simulador: ${type}`, typeToken);
        }
        const inlinePrimaryKey = this.takeKeyword("PRIMARY")
          ? (this.expectKeyword("KEY"), true)
          : false;
        if (columns.some((column) => column.name === name)) {
          this.fail(`Columna repetida: ${name}`);
        }
        columns.push({ name, type });
        if (inlinePrimaryKey) {
          if (primaryKey) this.fail("La tabla declara PRIMARY KEY más de una vez");
          primaryKey = { partitionColumns: [name], clusteringColumns: [] };
        }
      }
      if (!this.takePunctuation(",") && !this.punctuationAtCurrent(")")) {
        this.fail("Se esperaba «,» o «)» en la definición de la tabla");
      }
    }
    if (!columns.length) this.fail("La tabla debe declarar al menos una columna");
    if (!primaryKey) this.fail("La tabla debe declarar una PRIMARY KEY");
    const columnNames = new Set(columns.map((column) => column.name));
    for (const key of [...primaryKey.partitionColumns, ...primaryKey.clusteringColumns]) {
      if (!columnNames.has(key)) this.fail(`La clave usa una columna inexistente: ${key}`);
    }

    const clusteringOrder = [];
    if (this.takeKeyword("WITH")) {
      this.expectKeyword("CLUSTERING");
      this.expectKeyword("ORDER");
      this.expectKeyword("BY");
      this.expectPunctuation("(");
      while (!this.takePunctuation(")")) {
        const name = this.expectIdentifier();
        const direction = this.takeKeyword("DESC") ? "DESC" : (this.expectKeyword("ASC"), "ASC");
        if (clusteringOrder.some((entry) => entry.name === name)) {
          this.fail(`Orden de clustering repetido: ${name}`);
        }
        clusteringOrder.push({ name, direction });
        if (!this.takePunctuation(",") && !this.punctuationAtCurrent(")")) {
          this.fail("Se esperaba «,» o «)» en CLUSTERING ORDER BY");
        }
      }
      if (this.takeKeyword("AND")) {
        this.fail("Las opciones adicionales de WITH no están implementadas en este simulador");
      }
    }
    const clusteringNames = new Set(primaryKey.clusteringColumns);
    for (const entry of clusteringOrder) {
      if (!clusteringNames.has(entry.name)) {
        this.fail(`CLUSTERING ORDER BY usa una columna no clustering: ${entry.name}`);
      }
    }
    if (clusteringOrder.length > primaryKey.clusteringColumns.length) {
      this.fail("Hay más órdenes de clustering que columnas de clustering");
    }
    for (let index = 0; index < clusteringOrder.length; index += 1) {
      if (clusteringOrder[index].name !== primaryKey.clusteringColumns[index]) {
        this.fail("CLUSTERING ORDER BY debe seguir el prefijo de clustering declarado");
      }
    }
    return { kind: "create-table", table, ifNotExists, columns, primaryKey, clusteringOrder };
  }

  parsePrimaryKey() {
    this.expectPunctuation("(");
    let partitionColumns;
    if (this.takePunctuation("(")) {
      partitionColumns = this.parseIdentifierList(")");
      this.expectPunctuation(")");
    } else {
      partitionColumns = [this.expectIdentifier()];
    }
    const clusteringColumns = [];
    while (this.takePunctuation(",")) clusteringColumns.push(this.expectIdentifier());
    this.expectPunctuation(")");
    if (!partitionColumns.length) this.fail("La clave de partición no puede estar vacía");
    const all = [...partitionColumns, ...clusteringColumns];
    if (new Set(all).size !== all.length) this.fail("Una columna no puede repetirse en PRIMARY KEY");
    return { partitionColumns, clusteringColumns };
  }

  parseIdentifierList(end) {
    const names = [this.expectIdentifier()];
    while (this.takePunctuation(",")) names.push(this.expectIdentifier());
    if (!this.punctuationAtCurrent(end)) this.fail(`Se esperaba «${end}»`);
    return names;
  }

  parseDropTable() {
    this.expectKeyword("TABLE");
    const ifExists = this.takeKeyword("IF")
      ? (this.expectKeyword("EXISTS"), true)
      : false;
    return { kind: "drop-table", table: this.parseTableName(), ifExists };
  }

  parseInsert() {
    this.expectKeyword("INTO");
    const table = this.parseTableName();
    this.expectPunctuation("(");
    const columns = this.parseIdentifierList(")");
    this.expectPunctuation(")");
    this.expectKeyword("VALUES");
    this.expectPunctuation("(");
    const values = [this.parseLiteral()];
    while (this.takePunctuation(",")) values.push(this.parseLiteral());
    this.expectPunctuation(")");
    if (columns.length !== values.length) this.fail("INSERT tiene distinto número de columnas y valores");
    if (new Set(columns).size !== columns.length) this.fail("INSERT repite una columna");
    return { kind: "insert", table, columns, values };
  }

  parseLiteral() {
    const token = this.current();
    if (token.type === "string") {
      this.advance();
      return { kind: "string", value: token.value };
    }
    if (token.type === "number") {
      this.advance();
      return { kind: "number", raw: token.value };
    }
    if (keyword(token, "TRUE") || keyword(token, "FALSE")) {
      this.advance();
      return { kind: "boolean", value: keyword(token, "TRUE") };
    }
    if (keyword(token, "NULL")) {
      this.advance();
      return { kind: "null", value: null };
    }
    this.fail("Se esperaba un literal (cadena, entero, booleano o NULL)");
  }

  parseSelect() {
    let columns;
    if (this.takePunctuation("*")) {
      columns = ["*"];
    } else {
      columns = [this.expectIdentifier()];
      while (this.takePunctuation(",")) columns.push(this.expectIdentifier());
    }
    this.expectKeyword("FROM");
    const table = this.parseTableName();
    const predicates = [];
    if (this.takeKeyword("WHERE")) {
      predicates.push(this.parsePredicate());
      while (this.takeKeyword("AND")) predicates.push(this.parsePredicate());
    }
    let limit = null;
    if (this.takeKeyword("LIMIT")) {
      const token = this.current();
      if (token.type !== "number") this.fail("LIMIT debe ser un entero positivo");
      this.advance();
      limit = token.value;
    }
    const allowFiltering = this.takeKeyword("ALLOW")
      ? (this.expectKeyword("FILTERING"), true)
      : false;
    return { kind: "select", table, columns, predicates, limit, allowFiltering };
  }

  parsePredicate() {
    const column = this.expectIdentifier();
    const operator = this.current().value;
    if (!(this.current().type === "operator" || ["=", "<", ">"].includes(operator))) {
      this.fail("Se esperaba un operador de comparación");
    }
    if (["!=", "=="].includes(operator)) this.fail(`Operador no implementado en este simulador: ${operator}`);
    this.advance();
    return { column, operator, value: this.parseLiteral() };
  }
}

export function parseCql(source) {
  if (typeof source !== "string") throw new TypeError("El CQL debe ser una cadena");
  return new Parser(source).parse();
}
