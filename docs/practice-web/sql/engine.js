// Motor único de los ejercicios. El CDN y los binarios usan la misma versión.
const DUCKDB_URL = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev57.0/+esm";
let modulePromise;

export function quoteIdentifier(value) {
  return '"' + value.replaceAll('"', '""') + '"';
}

export function quoteString(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

export async function createDatabase() {
  const duckdb = await (modulePromise ||= import(DUCKDB_URL));
  // EH/MVP funcionan en Pages sin cabeceras COOP/COEP ni SharedArrayBuffer.
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(new Blob([
    "importScripts(" + JSON.stringify(bundle.mainWorker) + ");"
  ], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const bindings = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await bindings.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await bindings.open({ query: { castBigIntToDouble: false } });
    const connection = await bindings.connect();
    return {
      bindings,
      connection,
      async registerParquet(name, file) {
        // FileReader en el worker permite leer rangos sin copiar todo el fichero.
        await bindings.registerFileHandle(name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
      },
      async close() {
        try { await connection.close(); }
        finally { await bindings.terminate(); }
      }
    };
  } catch (error) {
    await bindings.terminate();
    throw error;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}

// El tokenizador de DuckDB conoce comillas, comentarios y cadenas $...$.
export async function validateStatement(database, sql, readOnly = false) {
  const tokens = await database.bindings.tokenize(sql);
  let ended = false;
  let hasStatement = false;
  for (let index = 0; index < tokens.offsets.length; index += 1) {
    if (tokens.types[index] === 5) continue; // comentario
    const start = tokens.offsets[index];
    const text = sql.slice(start, tokens.offsets[index + 1] ?? sql.length).trim();
    if (text.startsWith(";") && tokens.types[index] === 3) {
      ended = true;
    } else {
      if (ended) throw new Error("Ejecuta una sola sentencia cada vez.");
      hasStatement = true;
    }
    if (readOnly && tokens.types[index] === 4
        && /^(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|COPY|CALL|ATTACH|DETACH)\b/i.test(text)) {
      throw new Error("Solo se comprueban consultas de lectura.");
    }
  }
  if (!hasStatement) throw new Error("Escribe una consulta; el editor solo contiene comentarios o separadores.");
}

export async function openCursor(database, sql) {
  const reader = await database.connection.send(sql, true);
  await reader.open();
  const columns = reader.schema.fields.map(field => field.name);
  const iterator = reader[Symbol.asyncIterator]();
  let batch = null;
  let rowIndex = 0;
  let closed = false;
  return {
    columns,
    async next() {
      if (closed) return null;
      while (!batch || rowIndex === batch.numRows) {
        const result = await iterator.next();
        if (result.done) {
          batch = null;
          closed = true;
          return null;
        }
        batch = result.value;
        rowIndex = 0;
      }
      const row = columns.map((_, index) => batch.getChildAt(index).get(rowIndex));
      rowIndex += 1;
      return row;
    },
    async close() {
      if (closed) return;
      closed = true;
      batch = null;
      try { await reader.cancel(); }
      finally { await database.connection.cancelSent(); }
    }
  };
}
