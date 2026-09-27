import { CqlExecutionError, NODE_COUNT, databaseView, partitionLayout } from "./cql-engine.mjs";
import { CqlParseError } from "./cql-parser.mjs";
import { loadRemoteQuestions, SAMPLE_YEAR, SOURCE_COLUMNS } from "./dataset.mjs";
import { checkExercise, EXERCISES, exerciseContext, formatNumber, initialDatabase, runLab } from "./exercises.mjs";
import { FIXTURE_QUESTIONS } from "./sample-fixture.mjs";

const RESULT_PAGE_SIZE = 100;
// Por debajo de este número de filas cada fila se dibuja grande y con su
// título; por encima se dibujan cuadrados pequeños y el título es de la
// partición completa.
const DETAILED_ROWS = 400;
const LEGEND_SIZE = 8;

const $ = (selector) => document.querySelector(selector);
const editorElement = $("#editor");
const nav = $("#exercise-nav");
const message = $("#message");
const dataStatus = $("#data-status");
const dataMessage = $("#data-message");
const tableTabs = $("#table-tabs");
const tableSchema = $("#table-schema");
const nodesElement = $("#nodes");
const legend = $("#legend");
const clusterSummary = $("#cluster-summary");
const statementLog = $("#statement-log");
const access = $("#access");
const resultTable = $("#result-table");
const resultKind = $("#result-kind");
const pagination = $("#result-pagination");
const pageLabel = $("#page-label");

const state = {
  questions: FIXTURE_QUESTIONS,
  dataLabel: "Muestra mínima",
  ctx: exerciseContext(FIXTURE_QUESTIONS),
  exercise: EXERCISES[0],
  database: null,
  results: [],
  selectedTable: null,
  highlight: null,
  page: 0,
  drafts: new Map(),
};

const codeEditor = typeof window.CodeMirror === "function"
  ? window.CodeMirror.fromTextArea(editorElement, {
    mode: "text/x-bdge-cassandra",
    theme: "material-darker",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    extraKeys: { "Ctrl-Enter": run, "Cmd-Enter": run },
  })
  : null;

if (codeEditor) {
  codeEditor.getInputField().setAttribute("aria-label", "Sentencias CQL");
  codeEditor.getInputField().setAttribute("aria-describedby", "editor-help");
  document.querySelector('label[for="editor"]').addEventListener("click", (event) => {
    event.preventDefault();
    codeEditor.focus();
  });
  codeEditor.on("change", (instance) => state.drafts.set(state.exercise.id, instance.getValue()));
} else {
  $("#editor-help").textContent = "No se pudo cargar el editor con resaltado; puedes escribir CQL igualmente. Ctrl/Cmd + Intro ejecuta.";
  editorElement.addEventListener("input", () => state.drafts.set(state.exercise.id, editorElement.value));
  editorElement.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
}

function getSource() {
  return codeEditor ? codeEditor.getValue() : editorElement.value;
}

function setSource(value) {
  if (codeEditor) codeEditor.setValue(value);
  else editorElement.value = value;
  state.drafts.set(state.exercise.id, value);
}

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

/** Texto con `código` entre comillas invertidas, sin interpretar HTML. */
function withCode(target, text) {
  target.replaceChildren();
  text.split("`").forEach((part, index) => {
    if (!part) return;
    target.append(index % 2 ? element("code", part) : document.createTextNode(part));
  });
  return target;
}

function setMessage(text = "", kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function setDataStatus(text, kind = "") {
  dataStatus.textContent = text;
  dataStatus.className = `status ${kind}`.trim();
}

/* ------------------------------------------------------------------ *
 * Enunciado
 * ------------------------------------------------------------------ */

function renderNav() {
  nav.replaceChildren();
  EXERCISES.forEach((exercise, index) => {
    const button = element("button", `${index + 1} · ${exercise.title}`, "button tab");
    button.type = "button";
    button.setAttribute("aria-current", exercise === state.exercise ? "step" : "false");
    button.addEventListener("click", () => selectExercise(exercise));
    nav.append(button);
  });
}

function renderBrief() {
  const { exercise, ctx } = state;
  $("#exercise-number").textContent = String(EXERCISES.indexOf(exercise) + 1);
  $("#exercise-title").textContent = exercise.title;
  withCode($("#exercise-need"), exercise.need(ctx));
  const steps = $("#exercise-steps");
  steps.replaceChildren(...exercise.steps(ctx).map((step) => withCode(element("li"), step)));
  const observe = $("#exercise-observe");
  observe.replaceChildren(...exercise.observe(ctx).map((item) => withCode(element("li"), item)));
  withCode($("#exercise-expected"), exercise.expected(ctx));
}

function resetExerciseState() {
  state.database = initialDatabase(state.exercise, state.questions);
  state.results = [];
  state.highlight = null;
  state.page = 0;
  state.selectedTable = state.database.tables.has(state.exercise.focusTable)
    ? state.exercise.focusTable
    : [...state.database.tables.keys()][0] ?? null;
}

function selectExercise(exercise, { keepDraft = true } = {}) {
  state.exercise = exercise;
  resetExerciseState();
  const draft = keepDraft ? state.drafts.get(exercise.id) : null;
  setSource(draft ?? exercise.starter(state.ctx));
  setMessage();
  renderNav();
  renderBrief();
  renderAll();
}

/* ------------------------------------------------------------------ *
 * Clúster
 * ------------------------------------------------------------------ */

function partitionColor(token) {
  const hue = Math.round((token / 2 ** 32) * 360 * 7) % 360;
  const lightness = [40, 50, 60][(token >>> 8) % 3];
  return `hsl(${hue} 62% ${lightness}%)`;
}

function keyLabel(values) {
  return values.length === 1 ? String(values[0]) : `(${values.join(", ")})`;
}

function rowTitle(row) {
  const parts = [];
  if (row.preguntaid !== undefined) parts.push(`pregunta ${row.preguntaid}`);
  if (row.fecha) parts.push(row.fecha.slice(0, 10));
  if (row.titulo) parts.push(row.titulo);
  return parts.join(" · ");
}

function renderTableTabs(views) {
  tableTabs.replaceChildren();
  for (const view of views) {
    const tab = element("button", view.name, "button tab small");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(view.name === state.selectedTable));
    tab.addEventListener("click", () => {
      state.selectedTable = view.name;
      renderCluster();
    });
    tableTabs.append(tab);
  }
}

function describeSchema(view) {
  const partition = `(${view.primaryKey.partitionColumns.join(", ")})`;
  const clustering = view.clusteringOrder.length
    ? view.clusteringOrder.map((entry) => `${entry.name} ${entry.direction}`).join(", ")
    : "ninguna";
  const indexes = view.indexes.length ? ` · Índices: ${view.indexes.map((index) => `${index.name} (${index.column})`).join(", ")}` : "";
  return `Partición: ${partition} · Clustering: ${clustering}${indexes}`;
}

function renderCluster() {
  const views = databaseView(state.database);
  renderTableTabs(views);
  nodesElement.replaceChildren();
  legend.replaceChildren();
  const view = views.find((entry) => entry.name === state.selectedTable);
  if (!view) {
    clusterSummary.textContent = "";
    tableSchema.textContent = "Todavía no hay tablas: crea una en el editor.";
    for (let node = 0; node < NODE_COUNT; node += 1) nodesElement.append(emptyNode(node));
    return;
  }
  tableSchema.textContent = describeSchema(view);
  clusterSummary.textContent = `${formatNumber(view.rowCount)} filas · ${formatNumber(view.partitionCount)} particiones`;
  const table = state.database.tables.get(view.name);
  const layout = partitionLayout(table);
  const detailed = view.rowCount <= DETAILED_ROWS;
  const highlight = state.highlight?.table === view.name ? state.highlight : null;
  const readKeys = new Set(highlight?.partitionKeys ?? []);
  const dimOthers = highlight && !["filtering", "table-scan"].includes(highlight.mode);
  const maxNodeRows = Math.max(1, ...view.nodeRows);

  for (let node = 0; node < NODE_COUNT; node += 1) {
    const box = element("article", "", "node");
    if (highlight?.nodes.includes(node)) box.classList.add("contacted");
    else if (highlight) box.classList.add("idle");
    const heading = element("div", "", "node-heading");
    heading.append(element("h3", `Nodo ${node + 1}`), element("span", `tokens ${Math.round((node / NODE_COUNT) * 100)}–${Math.round(((node + 1) / NODE_COUNT) * 100)} %`, "muted"));
    const partitions = layout.filter((partition) => partition.node === node);
    const load = element("div", "", "load");
    const bar = element("span", "", "load-bar");
    bar.style.width = `${(view.nodeRows[node] / maxNodeRows) * 100}%`;
    load.append(bar);
    const loadText = element("p", `${formatNumber(view.nodeRows[node])} filas · ${formatNumber(partitions.length)} particiones · ${view.rowCount ? Math.round((view.nodeRows[node] / view.rowCount) * 100) : 0} % de la tabla`, "load-text");
    const cells = element("div", "", `cells${detailed ? " detailed" : ""}`);
    for (const partition of partitions) {
      const group = element("span", "", "partition");
      group.style.setProperty("--partition-color", partitionColor(partition.token));
      if (readKeys.has(partition.key)) group.classList.add("read");
      else if (dimOthers) group.classList.add("dim");
      group.title = `Partición ${keyLabel(partition.values)} · ${formatNumber(partition.rows.length)} fila${partition.rows.length === 1 ? "" : "s"}`;
      for (const row of partition.rows) {
        const cell = element("span", "", "cell");
        if (detailed) cell.title = `${keyLabel(partition.values)} · ${rowTitle(row)}`;
        group.append(cell);
      }
      cells.append(group);
    }
    box.append(heading, load, loadText, cells);
    nodesElement.append(box);
  }

  const largest = [...layout].sort((left, right) => right.rows.length - left.rows.length || left.token - right.token).slice(0, LEGEND_SIZE);
  if (largest.length) {
    legend.append(element("h3", "Particiones más grandes"));
    const list = element("ol", "", "legend-list");
    for (const partition of largest) {
      const item = element("li");
      const swatch = element("span", "", "swatch");
      swatch.style.background = partitionColor(partition.token);
      item.append(swatch, element("code", keyLabel(partition.values)), element("span", ` · nodo ${partition.node + 1} · ${formatNumber(partition.rows.length)} filas`, "muted"));
      list.append(item);
    }
    const average = view.partitionCount ? view.rowCount / view.partitionCount : 0;
    legend.append(list, element("p", `Media: ${average.toLocaleString("es-ES", { maximumFractionDigits: 1 })} filas por partición.`, "muted"));
  }
}

function emptyNode(node) {
  const box = element("article", "", "node");
  const heading = element("div", "", "node-heading");
  heading.append(element("h3", `Nodo ${node + 1}`));
  box.append(heading, element("p", "Sin filas.", "load-text"));
  return box;
}

/* ------------------------------------------------------------------ *
 * Resultados
 * ------------------------------------------------------------------ */

function describeResult(result) {
  if (result.kind === "create-table") {
    if (!result.created) return `CREATE TABLE IF NOT EXISTS: ${result.table} ya existía y conserva sus filas.`;
    const population = result.population;
    if (!population) return `Tabla ${result.table} creada.`;
    if (population.unknownKey.length) {
      return `Tabla ${result.table} creada vacía: el laboratorio no sabe rellenar ${population.unknownKey.join(", ")}, que forma parte de la clave.`;
    }
    const pieces = [`Tabla ${result.table} creada y poblada: ${formatNumber(population.written)} filas escritas a partir de ${formatNumber(population.questions)} preguntas`];
    if (population.exploded) pieces.push("una por etiqueta");
    if (population.skipped) pieces.push(`${formatNumber(population.skipped)} omitidas por tener NULL en la clave`);
    return `${pieces.join("; ")}.`;
  }
  if (result.kind === "drop-table") return result.dropped ? `Tabla ${result.table} eliminada.` : `DROP TABLE IF EXISTS: ${result.table} no existía.`;
  if (result.kind === "create-index") return result.created ? `Índice ${result.index} creado sobre ${result.table}.${result.column}.` : `El índice ${result.index} ya existía.`;
  if (result.kind === "drop-index") return result.dropped ? `Índice ${result.index} eliminado.` : `DROP INDEX IF EXISTS: ${result.index} no existía.`;
  if (result.kind === "insert") {
    return `INSERT en ${result.table}: ${result.created ? "fila nueva" : "upsert de una fila existente"} en la partición ${keyLabel(result.partitionKey)}, nodo ${result.node + 1}.`;
  }
  if (result.kind === "select") {
    return `SELECT sobre ${result.table}: ${result.explanation.label}; ${formatNumber(result.rows.length)} fila${result.rows.length === 1 ? "" : "s"}.`;
  }
  return result.kind;
}

function renderLog() {
  statementLog.replaceChildren(...state.results.map((result) => element("li", describeResult(result))));
}

function lastSelect() {
  return state.results.filter((result) => result.kind === "select").at(-1) ?? null;
}

function renderResultTable() {
  const select = lastSelect();
  resultKind.textContent = select ? select.table : "";
  access.hidden = !select;
  pagination.hidden = true;
  if (!select) {
    resultTable.replaceChildren(element("p", "Ejecuta una consulta para ver sus filas.", "empty"));
    return;
  }
  const detail = select.explanation;
  $("#metric-nodes").textContent = `${detail.nodes.length} de ${detail.nodeCount}`;
  $("#metric-partitions").textContent = formatNumber(detail.partitionsRead);
  $("#metric-examined").textContent = formatNumber(detail.candidateRows);
  $("#metric-returned").textContent = formatNumber(detail.returnedRows);
  $("#access-reason").textContent = `${detail.label}. ${detail.reason}`;
  access.className = `access ${["filtering", "table-scan", "partition-filtering"].includes(detail.mode) ? "costly" : detail.mode === "index" ? "index" : "direct"}`;

  if (!select.rows.length) {
    resultTable.replaceChildren(element("p", "La consulta no devuelve filas.", "empty"));
    return;
  }
  const pages = Math.ceil(select.rows.length / RESULT_PAGE_SIZE);
  state.page = Math.min(state.page, pages - 1);
  const start = state.page * RESULT_PAGE_SIZE;
  const rows = select.rows.slice(start, start + RESULT_PAGE_SIZE);
  const table = element("table");
  const head = element("thead");
  const headRow = element("tr");
  for (const name of select.columns) headRow.append(element("th", name));
  head.append(headRow);
  const body = element("tbody");
  for (const row of rows) {
    const tableRow = element("tr");
    for (const name of select.columns) {
      const value = row[name];
      const cell = element("td", value === null ? "NULL" : String(value));
      if (value === null) cell.className = "null";
      tableRow.append(cell);
    }
    body.append(tableRow);
  }
  table.append(head, body);
  const wrap = element("div", "", "table-wrap");
  wrap.append(table);
  resultTable.replaceChildren(wrap);
  if (pages > 1) {
    pagination.hidden = false;
    pageLabel.textContent = `Filas ${formatNumber(start + 1)}–${formatNumber(start + rows.length)} de ${formatNumber(select.rows.length)}`;
    $("#previous-page").disabled = state.page === 0;
    $("#next-page").disabled = state.page >= pages - 1;
  }
}

function renderAll() {
  renderCluster();
  renderLog();
  renderResultTable();
}

/* ------------------------------------------------------------------ *
 * Acciones
 * ------------------------------------------------------------------ */

function focusAfterRun(results) {
  const last = results.at(-1);
  if (!last) return;
  if (last.kind === "select") {
    state.highlight = { table: last.table, mode: last.explanation.mode, nodes: last.explanation.nodes, partitionKeys: last.explanation.partitionKeys };
    state.selectedTable = last.table;
  } else {
    state.highlight = null;
    if (last.table && state.database.tables.has(last.table)) state.selectedTable = last.table;
  }
  if (!state.database.tables.has(state.selectedTable)) state.selectedTable = [...state.database.tables.keys()][0] ?? null;
}

function describeError(error) {
  if (error instanceof CqlExecutionError || error instanceof CqlParseError) return error.message;
  return `Error inesperado: ${error.message ?? error}`;
}

function run() {
  try {
    state.results = runLab(state.database, getSource(), state.questions);
    state.page = 0;
    focusAfterRun(state.results);
    setMessage(`${state.results.length} sentencia${state.results.length === 1 ? "" : "s"} ejecutada${state.results.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    const applied = error.appliedResults ?? [];
    state.results = applied;
    focusAfterRun(applied);
    const note = applied.length ? ` Antes del error se aplicaron ${applied.length} sentencia${applied.length === 1 ? "" : "s"}.` : "";
    setMessage(`${describeError(error)}${note}`, "error");
  }
  renderAll();
}

function check() {
  try {
    const checked = checkExercise(state.exercise, state.ctx, getSource());
    setMessage(checked.message, checked.ok ? "success" : "error");
  } catch (error) {
    setMessage(`No se puede comprobar: ${describeError(error)}`, "error");
  }
}

function useQuestions(questions, label) {
  const previousCtx = state.ctx;
  state.questions = questions;
  state.dataLabel = label;
  state.ctx = exerciseContext(questions);
  // Los enunciados cambian con los datos. Un editor que el alumno no había
  // tocado recibe el esqueleto nuevo; uno modificado se conserva.
  for (const exercise of EXERCISES) {
    if (state.drafts.get(exercise.id) === exercise.starter(previousCtx)) state.drafts.delete(exercise.id);
  }
  selectExercise(state.exercise);
}

async function loadRemote() {
  const button = $("#load-remote");
  button.disabled = true;
  setDataStatus("Descargando…", "loading");
  try {
    const { questions, source } = await loadRemoteQuestions((text) => { dataMessage.textContent = text; });
    useQuestions(questions, `Preguntas de ${SAMPLE_YEAR}`);
    setDataStatus(`${formatNumber(questions.length)} preguntas de ${SAMPLE_YEAR}`, "ready");
    dataMessage.textContent = `Descargadas desde ${source}. El estado del ejercicio se ha reiniciado con estos datos; vuelve a ejecutar tu código.`;
  } catch (error) {
    setDataStatus("Muestra mínima", "error");
    dataMessage.textContent = `No se pudo descargar la muestra (${error.message}). Sigues con la muestra mínima; puedes reintentarlo.`;
  } finally {
    button.disabled = false;
  }
}

function useMini() {
  useQuestions(FIXTURE_QUESTIONS, "Muestra mínima");
  setDataStatus(`Muestra mínima: ${formatNumber(FIXTURE_QUESTIONS.length)} preguntas`, "");
  dataMessage.textContent = "Muestra mínima incrustada: preguntas del primer trimestre de 2016. El estado del ejercicio se ha reiniciado.";
}

function renderSourceColumns() {
  const list = $("#source-columns");
  list.replaceChildren();
  for (const column of SOURCE_COLUMNS) {
    const term = element("dt");
    term.append(element("code", column.name), document.createTextNode(` ${column.type}`));
    list.append(term, element("dd", column.description));
  }
}

$("#run").addEventListener("click", run);
$("#check").addEventListener("click", check);
$("#reset").addEventListener("click", () => {
  state.drafts.delete(state.exercise.id);
  selectExercise(state.exercise, { keepDraft: false });
  setMessage("Ejercicio reiniciado: estado inicial y editor de partida.");
});
$("#solution").addEventListener("click", () => {
  setSource(state.exercise.solution(state.ctx));
  setMessage("Solución de referencia en el editor. Ejecútala y compara el dibujo y las cifras con los de tu versión.");
});
$("#previous-page").addEventListener("click", () => { state.page -= 1; renderResultTable(); });
$("#next-page").addEventListener("click", () => { state.page += 1; renderResultTable(); });
$("#load-remote").addEventListener("click", loadRemote);
$("#load-mini").addEventListener("click", useMini);

renderSourceColumns();
setDataStatus(`Muestra mínima: ${formatNumber(FIXTURE_QUESTIONS.length)} preguntas`);
selectExercise(EXERCISES[0]);
codeEditor?.refresh();
loadRemote();
