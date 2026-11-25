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
      async registerBuffer(name, bytes) {
        // Transfiere los bytes al worker: `bytes` queda vacío en esta página.
        await bindings.registerFileBuffer(name, bytes);
      },
      async dropFile(name) {
        await bindings.dropFile(name);
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

async function downloadBytes(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(decodeURIComponent(url.split("/").pop()) + " respondió HTTP " + response.status + ".");
  }
  return new Uint8Array(await response.arrayBuffer());
}

// Crea en una base nueva una tabla por cada grupo `[tabla, ficheros]`, a partir de
// sus Parquet: una URL se descarga y un `File` local se lee en su sitio.
//
// Las descargas empiezan todas a la vez, antes incluso de abrir la base con
// `open()`. DuckDB-Wasm sin hilos (Pages no envía COOP/COEP) ejecuta una sentencia
// cada vez, así que las tablas se materializan de una en una y en orden, en cuanto
// han llegado sus ficheros, mientras siguen llegando los de las demás. Cada fichero
// se suelta en cuanto su tabla está creada. Si falla una descarga, se cancelan las
// demás y se cierra la base a medias.
//
// `progress({ table, index, tables, downloaded, downloads })` informa de la tabla
// que se materializa (null mientras se abre la base) y de cuántas descargas han
// terminado.
export async function createParquetTables(open, groups, { download = downloadBytes, progress = () => {} } = {}) {
  const controller = new AbortController();
  const downloads = new Map();
  let downloaded = 0;
  let failure = null;
  let current = { table: null, index: 0, tables: groups.length };
  const report = () => progress({ ...current, downloaded, downloads: downloads.size });
  for (const [, files] of groups) {
    for (const file of files) {
      if (typeof file !== "string" || downloads.has(file)) continue;
      const pending = download(file, controller.signal);
      // El primer fallo cancela el resto sin esperar a que le llegue el turno, y
      // es el que se informa, no el AbortError de las descargas canceladas.
      pending.then(
        () => { downloaded += 1; report(); },
        error => { failure ??= error; controller.abort(); }
      );
      downloads.set(file, pending);
    }
  }
  report();
  let database = null;
  try {
    database = await open();
    for (let index = 0; index < groups.length; index += 1) {
      const [table, files] = groups[index];
      current = { table, index, tables: groups.length };
      report();
      const paths = [];
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const path = table + "-" + fileIndex + ".parquet";
        if (typeof file === "string") await database.registerBuffer(path, await downloads.get(file));
        else await database.registerParquet(path, file);
        paths.push(path);
      }
      await database.connection.query("CREATE TABLE " + quoteIdentifier(table)
        + " AS SELECT * FROM read_parquet([" + paths.map(quoteString).join(", ") + "])");
      for (const path of paths) await database.dropFile(path);
    }
    return database;
  } catch (error) {
    controller.abort();
    if (database) await database.close();
    throw error?.name === "AbortError" && failure ? failure : error;
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

// Identificadores de tipo de Apache Arrow (enum Type).
const ARROW_DATE = 8;
const ARROW_TIMESTAMP = 10;

// Arrow entrega DATE y TIMESTAMP como milisegundos desde 1970; se muestran
// como lo haría DuckDB (YYYY-MM-DD y YYYY-MM-DD HH:MM:SS[.mmm]).
function dateConverter(field) {
  const typeId = field.type.typeId;
  if (typeId !== ARROW_DATE && typeId !== ARROW_TIMESTAMP) return null;
  const suffix = typeId === ARROW_TIMESTAMP && field.type.timezone ? "+00" : "";
  return value => {
    if (value === null || value === undefined) return value;
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return String(value);
    const iso = date.toISOString();
    if (typeId === ARROW_DATE) return iso.slice(0, 10);
    return iso.slice(0, 19).replace("T", " ") + (iso.slice(19, 23) === ".000" ? "" : iso.slice(19, 23)) + suffix;
  };
}

export async function openCursor(database, sql) {
  const reader = await database.connection.send(sql, true);
  await reader.open();
  const columns = reader.schema.fields.map(field => field.name);
  const converters = reader.schema.fields.map(dateConverter);
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
      const row = columns.map((_, index) => {
        const value = batch.getChildAt(index).get(rowIndex);
        return converters[index] ? converters[index](value) : value;
      });
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
