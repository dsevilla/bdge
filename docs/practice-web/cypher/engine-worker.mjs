import { splitStatements } from "./statements.mjs";

// Motor de la práctica: Grafeo compilado a WebAssembly, en un worker propio.
// Cada carga tiene su worker y su base en memoria; al cerrar el worker se libera
// todo de una vez.
//
// El paquete npm está compilado para empaquetador (`import * as wasm from
// "./grafeo_wasm_bg.wasm"`), que el navegador no sabe importar. El .wasm sólo
// importa su propio código de enlace, así que se instancia a mano con él: es lo
// mismo que hace grafeo_wasm.js, sin necesitar un empaquetador.
const GRAFEO_URL = "https://cdn.jsdelivr.net/npm/@grafeo-db/wasm@0.6.3";

let database;

async function openDatabase() {
  const glue = await import(GRAFEO_URL + "/grafeo_wasm_bg.js");
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(GRAFEO_URL + "/grafeo_wasm_bg.wasm"),
    { "./grafeo_wasm_bg.js": glue }
  );
  glue.__wbg_set_wasm(instance.exports);
  instance.exports.__wbindgen_start();
  return new glue.Database();
}

// Ejecuta una sentencia y devuelve sus columnas, en orden aunque no haya filas,
// y sus filas como objetos indexados por columna.
function run(cypher, params) {
  const raw = params
    ? database.executeRawWithLanguageAndParams(cypher, "cypher", params)
    : database.executeRawWithLanguage(cypher, "cypher");
  const columns = raw.columns;
  const rows = raw.rows.map(function (values) {
    const row = {};
    columns.forEach(function (column, index) { row[column] = values[index]; });
    return row;
  });
  return { columns, rows };
}

// Varias sentencias seguidas devuelven el resultado de la última.
function query(text) {
  const statements = splitStatements(text);
  if (!statements.length) throw new Error("No hay ninguna sentencia que ejecutar.");
  let result;
  statements.forEach(function (statement) { result = run(statement); });
  return result;
}

self.addEventListener("message", async function ({ data }) {
  const { id, action, value } = data;
  try {
    let result;
    switch (action) {
      case "init":
        database = await openDatabase();
        value.forEach(function (statement) { run(statement); });
        result = database.info().version;
        break;
      case "load":
        run(value.statement, { filas: value.rows });
        break;
      case "query":
        result = query(value);
        break;
      case "compare":
        result = value.map(query);
        break;
      default:
        throw new Error("Operación desconocida en el motor: " + action);
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});
