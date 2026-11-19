const LBUG_URL = "https://cdn.jsdelivr.net/npm/@ladybugdb/wasm-core@0.22.3/sync/index.js";

// Cada carga tiene su propio worker y sistema de archivos virtual. Al cerrar el
// worker se liberan también los CSV, sin depender de unlink en WasmFS.
let lbug;
let database;
let connection;

function query(cypher, readRows = true) {
  const result = connection.query(cypher);
  try {
    const last = result.at(-1);
    if (!last.isSuccess()) throw new Error(last.getErrorMessage());
    if (readRows) return { columns: last.getColumnNames(), rows: last.getAllObjects() };
  } finally {
    result.close();
  }
}

self.addEventListener("message", async function ({ data }) {
  const { id, action, value } = data;
  try {
    let result;
    switch (action) {
      case "init":
        lbug = (await import(LBUG_URL)).default;
        await lbug.init();
        database = new lbug.Database();
        connection = new lbug.Connection(database);
        value.forEach(function (statement) { query(statement, false); });
        result = lbug.getVersion();
        break;
      case "copy":
        lbug.getFS().createDataFile("/", value.file, value.bytes, true, true);
        query(value.statement, false);
        break;
      case "query":
        result = query(value);
        break;
      case "compare":
        result = value.map(function (statement) { return query(statement); });
        break;
      default:
        throw new Error("Operación desconocida en el motor: " + action);
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});
