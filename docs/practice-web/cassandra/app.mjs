import {
  CqlExecutionError,
  databaseView,
  executeCql,
  tableRows,
} from "./cql-engine.mjs";
import { checkExercise, EXERCISES, initialDatabase, loadExerciseData } from "./exercises.mjs";

const exerciseSelect = document.querySelector("#exercise");
const editor = document.querySelector("#editor");
const prompt = document.querySelector("#prompt");
const status = document.querySelector("#status");
const message = document.querySelector("#message");
const schemaView = document.querySelector("#schema-view");
const partitionView = document.querySelector("#partition-view");
const stateCount = document.querySelector("#state-count");
const result = document.querySelector("#result code");
const resultKind = document.querySelector("#result-kind");
const explanation = document.querySelector("#explanation");
const pagination = document.querySelector("#result-pagination");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const RESULT_PAGE_SIZE = 100;

let resultPage = 0;
let exercise = EXERCISES[0];
let database = initialDatabase(exercise);
let lastResults = [];

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setStatus(text, kind = "") {
  status.textContent = text;
  status.className = `status ${kind}`.trim();
}

function setMessage(text = "", kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function display(value) {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

function renderState() {
  const views = databaseView(database);
  stateCount.textContent = views.length ? `${views.length} tabla${views.length === 1 ? "" : "s"}` : "";
  schemaView.replaceChildren();
  partitionView.replaceChildren();
  if (!views.length) {
    schemaView.textContent = "Todavía no hay tablas. Crea una tabla o carga el ejercicio.";
    return;
  }

  for (const view of views) {
    const card = element("article", "", "schema-card");
    card.append(element("h3", view.name));
    const fields = [
      ["Columnas", view.columns.map((column) => `${column.name}: ${column.type}`).join(", ")],
      ["Partición", `(${view.primaryKey.partitionColumns.join(", ")})`],
      ["Clustering", view.primaryKey.clusteringColumns.length ? view.primaryKey.clusteringColumns.join(", ") : "(ninguno)"],
      ["Orden", view.clusteringOrder.length ? view.clusteringOrder.map((entry) => `${entry.name} ${entry.direction}`).join(", ") : "(ascendente por defecto)"],
      ["Materialización", `${view.rowCount} filas en ${view.partitionCount} particiones`],
    ];
    const definition = element("dl", "", "schema-key");
    for (const [label, value] of fields) {
      definition.append(element("dt", label), element("dd", value));
    }
    card.append(definition);
    schemaView.append(card);

    const table = database.tables.get(view.name);
    renderPartitions(table);
  }
}

function renderPartitions(table) {
  const rows = tableRows(table);
  const names = table.primaryKey.partitionColumns;
  const groups = new Map();
  for (const row of rows) {
    const keyValues = names.map((name) => row[name]);
    const key = JSON.stringify(keyValues);
    if (!groups.has(key)) groups.set(key, { keyValues, rows: [] });
    groups.get(key).rows.push(row);
  }
  for (const { keyValues, rows: partitionRows } of groups.values()) {
    const card = element("article", "", "partition-card");
    card.append(element("h3", `Partición: (${keyValues.map(display).join(", ")})`));
    const tableElement = element("table");
    const head = element("thead");
    const headRow = element("tr");
    for (const column of table.columns) headRow.append(element("th", column.name));
    head.append(headRow);
    const body = element("tbody");
    for (const row of partitionRows) {
      const tableRow = element("tr");
      for (const column of table.columns) tableRow.append(element("td", display(row[column.name])));
      body.append(tableRow);
    }
    tableElement.append(head, body);
    card.append(tableElement);
    partitionView.append(card);
  }
}

function renderResult(results = lastResults) {
  const latest = results.at(-1);
  const pageCount = latest?.kind === "select" ? Math.max(1, Math.ceil(latest.rows.length / RESULT_PAGE_SIZE)) : 1;
  resultPage = Math.min(resultPage, pageCount - 1);
  const visibleResults = results.map((entry, index) => {
    if (index !== results.length - 1 || entry.kind !== "select" || entry.rows.length <= RESULT_PAGE_SIZE) return entry;
    const start = resultPage * RESULT_PAGE_SIZE;
    return { ...entry, rows: entry.rows.slice(start, start + RESULT_PAGE_SIZE), page: resultPage + 1, pages: pageCount };
  });
  result.textContent = visibleResults.length ? JSON.stringify(visibleResults, null, 2) : "";
  resultKind.textContent = latest ? latest.kind : "";
  pagination.hidden = !(latest?.kind === "select" && latest.rows.length > RESULT_PAGE_SIZE);
  pageLabel.textContent = pagination.hidden ? "" : `Página ${resultPage + 1} de ${pageCount}`;
  previousPage.disabled = resultPage === 0;
  nextPage.disabled = resultPage >= pageCount - 1;
  explanation.className = "explanation-box";
  explanation.textContent = "Ejecuta una sentencia para ver qué recorrido representa en este laboratorio.";
  if (!latest) return;
  if (latest.kind === "select") {
    const detail = latest.explanation;
    explanation.className = `explanation-box ${detail.mode === "filtering" ? "filtering" : "access"}`;
    explanation.textContent = `${detail.reason} Candidatas inspeccionadas por el simulador: ${detail.candidateRows}; filas coincidentes: ${detail.matchingRows}; devueltas: ${detail.returnedRows}. Este contador no mide Cassandra real.`;
  } else if (latest.kind === "create-table") {
    explanation.textContent = latest.created ? "Tabla creada. Carga los datos sintéticos para ver sus particiones." : "CREATE IF NOT EXISTS conservó la tabla y sus datos.";
  } else if (latest.kind === "insert") {
    explanation.textContent = latest.created ? "INSERT creó una fila; la clave primaria define su posición." : "INSERT hizo upsert de una fila existente y actualizó sólo las columnas enviadas.";
  } else if (latest.kind === "drop-table") {
    explanation.textContent = latest.dropped ? "Tabla eliminada." : "DROP TABLE IF EXISTS no encontró la tabla.";
  }
}

function refreshExercise() {
  exercise = EXERCISES.find((entry) => entry.id === exerciseSelect.value) ?? EXERCISES[0];
  database = initialDatabase(exercise);
  lastResults = [];
  resultPage = 0;
  editor.value = exercise.starter;
  prompt.textContent = exercise.prompt;
  setMessage();
  setStatus("Ejercicio preparado");
  renderState();
  renderResult();
}

function run() {
  try {
    lastResults = executeCql(database, editor.value);
    resultPage = 0;
    setStatus("Ejecutado", "ready");
    setMessage(`${lastResults.length} sentencia${lastResults.length === 1 ? "" : "s"} ejecutada${lastResults.length === 1 ? "" : "s"}.`, "success");
    renderState();
    renderResult();
  } catch (error) {
    setStatus("Error", "error");
    const applied = error.appliedResults?.length ? ` Se habían aplicado ${error.appliedResults.length} sentencia${error.appliedResults.length === 1 ? "" : "s"}.` : "";
    setMessage(`${error.message}${applied}`, "error");
    explanation.className = "explanation-box error";
    explanation.textContent = `${error.message}${applied}`;
  }
}

function loadData() {
  try {
    const loaded = loadExerciseData(database, exercise);
    setStatus("Datos cargados", "ready");
    setMessage(`${loaded.length} filas de referencia cargadas mediante INSERT.`, "success");
    renderState();
  } catch (error) {
    setStatus("No se pudo cargar", "error");
    setMessage(error.message, "error");
  }
}

function check() {
  try {
    const checkDatabase = initialDatabase(exercise);
    const checkResults = executeCql(checkDatabase, editor.value);
    if ((exercise.loadAfterRun && !exercise.initialCql) || exercise.checkLoadAfterRun) loadExerciseData(checkDatabase, exercise);
    const checked = checkExercise(exercise, checkDatabase, checkResults);
    setStatus(checked.ok ? "Comprobación correcta" : "Revisa la solución", checked.ok ? "success" : "error");
    setMessage(checked.message, checked.ok ? "success" : "error");
  } catch (error) {
    const messageText = error instanceof CqlExecutionError ? error.message : String(error);
    setStatus("No se puede comprobar", "error");
    setMessage(messageText, "error");
  }
}

function showSolution() {
  editor.value = exercise.solution;
  setMessage("Se ha colocado una solución pública de referencia en el editor; ejecútala para observar el resultado.");
}

for (const entry of EXERCISES) {
  exerciseSelect.append(new Option(entry.title, entry.id));
}
exerciseSelect.value = exercise.id;
exerciseSelect.addEventListener("change", refreshExercise);
document.querySelector("#run").addEventListener("click", run);
document.querySelector("#check").addEventListener("click", check);
document.querySelector("#load").addEventListener("click", loadData);
document.querySelector("#reset").addEventListener("click", refreshExercise);
document.querySelector("#solution").addEventListener("click", showSolution);
previousPage.addEventListener("click", () => { resultPage -= 1; renderResult(); });
nextPage.addEventListener("click", () => { resultPage += 1; renderResult(); });
refreshExercise();
