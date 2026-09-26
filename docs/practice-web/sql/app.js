import { PRACTICE_PAGES } from "./pages/index.js";
import { createDatabase, openCursor, validateStatement, quoteIdentifier, quoteString } from "./engine.js";
"use strict";
const DATA_TABLES = ["Posts", "Users", "Tags", "Comments", "Votes"];
const DATA_BASE = "https://raw.githubusercontent.com/dsevilla/bd2-data/main/es.stackoverflow/parquet/";
const DATA_FILES = {
  Posts: ["Posts1.parquet", "Posts2.parquet", "Posts3.parquet"],
  Users: ["Users.parquet"],
  Tags: ["Tags.parquet"],
  Comments: ["Comments.parquet"],
  Votes: ["Votes.parquet"]
};
const RESULT_PAGE_SIZE = 100;
// Tope de filas que se leen de cada lado al comprobar. La base completa puede
// devolver millones de filas y la comprobación no debe materializarlas.
const CHECK_ROW_LIMIT = 1000;
const STATE_CHANGE_NOTE = "No se puede comprobar: la consulta cambia el estado de la base.";
const statusEl = document.getElementById("db-status");
const messageEl = document.getElementById("connection-result");
const pageNavigationEl = document.getElementById("page-navigation");
const pageTitleEl = document.getElementById("practice-page-title");
const pageDescriptionEl = document.getElementById("practice-page-description");
const editorModeNoteEl = document.getElementById("editor-mode-note");
const exerciseListEl = document.getElementById("exercise-list");
const loadRealButton = document.getElementById("load-real");
const loadDemoButton = document.getElementById("load-demo");
const localFileInput = document.getElementById("local-file");
let engineReady = false;
let queryRunning = false;
let database = null;
let loading = false;
let currentPageId = null;
const activeResultStatements = new Map();
const editorDrafts = new Map();
const exercisesByEditor = new Map();
const editorInstances = new Map();

function hasSqlCodeMirror() {
  return typeof window.CodeMirror === "function"
    && window.CodeMirror.modes
    && typeof window.CodeMirror.modes.sql === "function";
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status " + kind;
}

async function renderPracticePage(pageId) {
  if (loading || queryRunning) return;
  const page = PRACTICE_PAGES.find(function (candidate) { return candidate.id === pageId; });
  if (!page || page.id === currentPageId) return;
  for (const resultId of activeResultStatements.keys()) await clearResultStatement(resultId);
  currentPageId = page.id;
  pageTitleEl.textContent = page.title;
  pageDescriptionEl.textContent = page.description || "";
  pageNavigationEl.replaceChildren();
  PRACTICE_PAGES.forEach(function (candidate) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "button page-tab";
    tab.dataset.pageId = candidate.id;
    tab.textContent = candidate.title;
    tab.setAttribute("aria-current", candidate.id === page.id ? "page" : "false");
    pageNavigationEl.append(tab);
  });

  editorInstances.forEach(function (editor) { editor.toTextArea(); });
  editorInstances.clear();
  exercisesByEditor.clear();
  exerciseListEl.replaceChildren();
  page.exercises.forEach(function (exercise, index) {
    const editorId = "sql-" + page.id + "-" + exercise.id;
    const resultId = "result-" + page.id + "-" + exercise.id;
    exercisesByEditor.set(editorId, exercise);

    const section = document.createElement("section");
    section.className = "exercise";
    section.setAttribute("aria-labelledby", editorId + "-title");

    const heading = document.createElement("div");
    heading.className = "exercise-heading";
    const number = document.createElement("span");
    number.className = "number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(index + 1);
    const headingText = document.createElement("div");
    const title = document.createElement("h2");
    title.id = editorId + "-title";
    title.textContent = exercise.title;
    const prompt = document.createElement("p");
    prompt.textContent = exercise.prompt || "";
    headingText.append(title, prompt);
    heading.append(number, headingText);

    const editorArea = document.createElement("div");
    editorArea.className = "editor-area";
    const label = document.createElement("label");
    label.className = "editor-label";
    label.htmlFor = editorId;
    const labelText = document.createElement("span");
    labelText.textContent = "Consulta SQL";
    const shortcut = document.createElement("span");
    shortcut.textContent = "Atajo: ";
    const controlKey = document.createElement("kbd");
    controlKey.textContent = "Ctrl/Cmd";
    const plus = document.createTextNode(" + ");
    const enterKey = document.createElement("kbd");
    enterKey.textContent = "Intro";
    shortcut.append(controlKey, plus, enterKey);
    label.append(labelText, shortcut);

    const editor = document.createElement("textarea");
    editor.id = editorId;
    editor.spellcheck = false;
    editor.setAttribute("aria-label", "Consulta SQL · " + exercise.title);
    editor.value = editorDrafts.get(editorId) || "";

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "button small run-query";
    runButton.dataset.editor = editorId;
    runButton.dataset.result = resultId;
    runButton.textContent = "Ejecutar consulta";
    actions.append(runButton);
    if (exercise.solution) {
      const checkButton = document.createElement("button");
      checkButton.type = "button";
      checkButton.className = "button small check-query";
      checkButton.dataset.editor = editorId;
      checkButton.dataset.result = resultId;
      checkButton.textContent = "Comprobar";
      actions.append(checkButton);
      if (!canCheckExercise(exercise)) {
        // Ejecutar la solución de referencia crearía la tabla por segunda vez
        // o repetiría la inserción: el botón queda visible pero inactivo.
        checkButton.disabled = true;
        checkButton.dataset.locked = "true";
        checkButton.title = STATE_CHANGE_NOTE;
        const note = document.createElement("span");
        note.className = "check-note";
        note.textContent = STATE_CHANGE_NOTE;
        actions.append(note);
      }
      const solutionButton = document.createElement("button");
      solutionButton.type = "button";
      solutionButton.className = "button small show-solution";
      solutionButton.dataset.editor = editorId;
      solutionButton.textContent = "Mostrar solución";
      actions.append(solutionButton);
    }

    const result = document.createElement("div");
    result.id = resultId;
    result.className = "result";
    result.setAttribute("aria-live", "polite");
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ejecuta la consulta para ver el resultado.";
    result.append(empty);

    editorArea.append(label, editor, actions);
    section.append(heading, editorArea, result);
    exerciseListEl.append(section);
    if (hasSqlCodeMirror()) {
      const codeEditor = window.CodeMirror.fromTextArea(editor, {
        mode: "text/x-sql",
        theme: "material-darker",
        lineNumbers: true,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        extraKeys: {
          "Ctrl-Enter": function () { section.querySelector(".run-query").click(); },
          "Cmd-Enter": function () { section.querySelector(".run-query").click(); }
        }
      });
      codeEditor.getInputField().setAttribute("aria-label", editor.getAttribute("aria-label"));
      label.addEventListener("click", function (event) {
        event.preventDefault();
        codeEditor.focus();
      });
      codeEditor.on("change", function (instance) {
        editorDrafts.set(editorId, instance.getValue());
      });
      editorInstances.set(editorId, codeEditor);
      codeEditor.refresh();
    } else {
      editor.addEventListener("input", function () { editorDrafts.set(editorId, editor.value); });
      editor.addEventListener("keydown", function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          section.querySelector(".run-query").click();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
          editorDrafts.set(editorId, editor.value);
        }
      });
    }
  });
}

function pageIdFromLocation() {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch (error) {
    return "";
  }
}

async function showPageFromLocation() {
  const pageId = pageIdFromLocation();
  const requestedPage = PRACTICE_PAGES.find(function (page) { return page.id === pageId; });
  const page = requestedPage || PRACTICE_PAGES[0];
  if (!page) return;
  if (!requestedPage) history.replaceState(null, "", "#" + encodeURIComponent(page.id));
  await renderPracticePage(page.id);
}

async function navigateToPage(pageId) {
  const page = PRACTICE_PAGES.find(function (candidate) { return candidate.id === pageId; });
  if (!page) return;
  const hash = "#" + encodeURIComponent(page.id);
  if (window.location.hash !== hash) history.pushState(null, "", hash);
  await renderPracticePage(page.id);
}

function showSolution(editorId) {
  const textArea = document.getElementById(editorId);
  const codeEditor = editorInstances.get(editorId);
  const exercise = exercisesByEditor.get(editorId);
  const startMarker = "-- SOLUCIÓN DE REFERENCIA (comentada; quita '-- ' de cada línea para ejecutarla)";
  if (!textArea || !exercise || !exercise.solution) return;
  const currentValue = codeEditor ? codeEditor.getValue() : textArea.value;
  if (!currentValue.includes(startMarker)) {
    const code = exercise.solution.split("\n").map(function (line) {
      return "-- " + line;
    }).join("\n");
    const block = startMarker + "\n" + code + "\n-- FIN DE LA SOLUCIÓN DE REFERENCIA";
    const existingText = currentValue.replace(/\s+$/, "");
    const nextValue = (existingText ? existingText + "\n\n" : "") + block;
    if (codeEditor) codeEditor.setValue(nextValue);
    else textArea.value = nextValue;
    editorDrafts.set(editorId, nextValue);
  }
  if (codeEditor) {
    codeEditor.focus();
    const lastLine = codeEditor.lineCount() - 1;
    const lastColumn = codeEditor.getLine(lastLine).length;
    codeEditor.setCursor(lastLine, lastColumn);
    codeEditor.scrollIntoView({ line: lastLine, ch: lastColumn }, 100);
  } else {
    textArea.focus();
    textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    textArea.scrollTop = textArea.scrollHeight;
  }
}

function getEditorValue(editorId) {
  const codeEditor = editorInstances.get(editorId);
  const textArea = document.getElementById(editorId);
  return codeEditor ? codeEditor.getValue() : (textArea ? textArea.value : "");
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(value < 10 ? 1 : 0) + " " + units[unit];
}

async function createDemoDatabase() {
  const demo = await createDatabase();
  try {
    await demo.connection.query(`
      CREATE TABLE Posts (Id INTEGER PRIMARY KEY, PostTypeId INTEGER NOT NULL,
        CreationDate TIMESTAMP, Score INTEGER, OwnerUserId INTEGER, Title VARCHAR,
        ParentId INTEGER, AnswerCount INTEGER);
      CREATE TABLE Users (Id INTEGER PRIMARY KEY, DisplayName VARCHAR, Reputation INTEGER,
        CreationDate TIMESTAMP);
      CREATE TABLE Tags (Id INTEGER PRIMARY KEY, TagName VARCHAR, Count INTEGER);
      CREATE TABLE Comments (Id INTEGER PRIMARY KEY, PostId INTEGER, UserId INTEGER, Text VARCHAR);
      CREATE TABLE Votes (Id INTEGER PRIMARY KEY, PostId INTEGER, VoteTypeId INTEGER);
      INSERT INTO Posts VALUES
        (101, 1, '2025-01-04 10:00:00', 18, 1, '¿Cómo funciona un índice B-tree?', NULL, 1),
        (102, 1, '2025-02-12 12:30:00', 32, 2, '¿Cuándo conviene usar una clave compuesta?', NULL, 1),
        (103, 2, '2025-02-13 09:15:00', 12, 3, NULL, 101, 0),
        (104, 1, '2025-03-01 08:00:00', 32, 1, '¿Qué diferencia hay entre JOIN y subconsulta?', NULL, 0),
        (105, 2, '2025-03-02 14:20:00', 4, 2, NULL, 102, 0),
        (106, 1, '2025-03-11 16:45:00', 7, 3, '¿Cómo se interpreta EXPLAIN?', NULL, 0);
      INSERT INTO Users VALUES
        (1, 'Lucía', 1250, '2024-01-01'), (2, 'Mateo', 840, '2024-02-01'), (3, 'Inés', 420, '2024-03-01');
      INSERT INTO Tags VALUES (1, 'sql', 4), (2, 'mysql', 2), (3, 'duckdb', 1);
      INSERT INTO Comments VALUES (1, 101, 1, 'Gracias'), (2, 102, NULL, 'Interesante'), (3, 104, 99, 'Resuelto');
      INSERT INTO Votes VALUES (1, 101, 2), (2, 102, 2), (3, 104, 3);
    `);
    return demo;
  } catch (error) {
    await demo.close();
    throw error;
  }
}

async function replaceDatabase(nextDatabase, label) {
  for (const resultId of activeResultStatements.keys()) await clearResultStatement(resultId);
  const previous = database;
  database = nextDatabase;
  if (previous) await previous.close();
  setStatus(label, "ready");
  messageEl.textContent = "";
  document.querySelectorAll(".result").forEach(function (result) {
    result.innerHTML = '<p class="empty">Base cargada. Ejecuta la consulta para ver el resultado.</p>';
  });
}

async function clearResultStatement(resultId) {
  const state = activeResultStatements.get(resultId);
  if (!state) return;
  activeResultStatements.delete(resultId);
  if (state.statement) await state.statement.close();
}

async function clearOtherResultStatements(keepResultId) {
  for (const [resultId, state] of activeResultStatements) {
    if (resultId === keepResultId) continue;
    await clearResultStatement(resultId);
    state.container.innerHTML = '<p class="empty">Resultado liberado al ejecutar otra consulta.</p>';
  }
}

function setLoadingControls() {
  const busy = loading || queryRunning || !engineReady;
  loadRealButton.disabled = busy;
  loadDemoButton.disabled = busy;
  localFileInput.disabled = busy;
  document.querySelectorAll(".run-query, .check-query, .result-actions button, .page-tab").forEach(button => {
    button.disabled = busy || button.dataset.locked === "true";
  });
}

async function loadDataset(label, build) {
  if (loading || queryRunning || !engineReady) return;
  loading = true;
  setLoadingControls();
  setStatus(label, "loading");
  messageEl.textContent = "";
  let candidate = null;
  try {
    candidate = await build();
    await replaceDatabase(candidate, "DuckDB · " + label);
    candidate = null;
  } catch (error) {
    if (candidate) await candidate.close();
    setStatus("No se pudo cargar · base anterior conservada", "error");
    messageEl.textContent = error.message;
  } finally {
    loading = false;
    await showPageFromLocation();
    setLoadingControls();
  }
}

async function createParquetDatabase(groups) {
  const next = await createDatabase();
  try {
    for (let tableIndex = 0; tableIndex < groups.length; tableIndex += 1) {
      const [table, files] = groups[tableIndex];
      const paths = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const path = typeof file === "string" ? file : table + "-" + index + ".parquet";
        if (typeof file !== "string") await next.registerParquet(path, file);
        paths.push(quoteString(path));
      }
      setStatus("Descargando y materializando " + table + " (" + (tableIndex + 1) + "/" + groups.length + ")", "loading");
      messageEl.textContent = "DuckDB está leyendo " + paths.length + " fichero(s) Parquet de " + table
        + " y creando la tabla local. Al terminar, las consultas usarán esta tabla en memoria.";
      await next.connection.query("CREATE TABLE " + quoteIdentifier(table)
        + " AS SELECT * FROM read_parquet([" + paths.join(", ") + "])");
    }
    return next;
  } catch (error) {
    await next.close();
    throw error;
  }
}

async function loadRemoteDatabase() {
  await loadDataset("Parquet remotos · dsevilla/bd2-data", async () => {
    const groups = DATA_TABLES.map(table => {
      return [table, DATA_FILES[table].map(file => DATA_BASE + encodeURIComponent(file))];
    });
    return createParquetDatabase(groups);
  });
  if (database && statusEl.textContent.includes("Parquet remotos")) {
    messageEl.textContent = "Tablas Posts, Users, Tags, Comments y Votes materializadas en DuckDB. Las consultas de esta sesión ya no vuelven a leer los Parquet remotos.";
  }
}

async function loadLocalFiles(files) {
  if (!files.length) return;
  try {
    await loadDataset("Parquet locales", async () => {
      const groups = new Map();
      for (const file of files) {
        const match = /^(Posts|Users|Tags|Comments|Votes)(?:-\d+)?\.parquet$/i.exec(file.name);
        if (!match) throw new Error("Selecciona los Parquet de la release 26-27: Posts, Users, Tags, Comments y Votes.");
        const table = DATA_TABLES.find(name => name.toLowerCase() === match[1].toLowerCase());
        if (!groups.has(table)) groups.set(table, []);
        groups.get(table).push(file);
      }
      for (const table of DATA_TABLES) {
        if (!groups.has(table)) throw new Error("Falta " + table + ".parquet. Selecciona juntos los cinco Parquet de la release 26-27.");
      }
      return createParquetDatabase(groups);
    });
  } finally {
    localFileInput.value = "";
  }
}

function displayValue(value) {
  if (value === null) return { text: "NULL", isNull: true };
  if (value instanceof Uint8Array) return { text: "[BLOB, " + formatBytes(value.byteLength) + "]", isNull: false };
  const text = String(value);
  const maxLength = 4000;
  return { text: text.length > maxLength ? text.slice(0, maxLength) + "… [texto truncado; " + text.length + " caracteres]" : text, isNull: false };
}

function firstStatementKeyword(sql) {
  const trimmed = String(sql).replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  const match = /^[A-Za-z]+/.exec(trimmed);
  return match ? match[0].toUpperCase() : "";
}

function isReadOnlyStatement(sql) {
  const keyword = firstStatementKeyword(sql);
  return keyword === "SELECT" || keyword === "WITH" || keyword === "EXPLAIN" || keyword === "VALUES";
}

// Un ejercicio se puede comprobar si su solución sólo lee. Los de CREATE,
// INSERT, UPDATE y los de transacciones cambian el estado de la base, así que
// no se puede ejecutar la referencia junto a la consulta del alumno. El autor
// puede además desactivarlo explícitamente con `check: false`.
function canCheckExercise(exercise) {
  return Boolean(exercise && exercise.solution)
    && exercise.check !== false
    && isReadOnlyStatement(exercise.solution);
}

function buildResultTable(columns, rows) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach(function (column) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column;
    headerRow.append(th);
  });
  head.append(headerRow);
  table.append(head);
  const body = document.createElement("tbody");
  rows.forEach(function (row) {
    const tr = document.createElement("tr");
    row.forEach(function (value) {
      const td = document.createElement("td");
      const display = displayValue(value);
      td.textContent = display.text;
      if (display.isNull) td.className = "null";
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  wrap.append(table);
  return wrap;
}

function renderResultTable(container, columns, rows) {
  container.replaceChildren();
  const state = activeResultStatements.get(container.id);
  const firstRow = rows.length ? state.pageIndex * RESULT_PAGE_SIZE + 1 : 0;
  const lastRow = rows.length ? firstRow + rows.length - 1 : 0;
  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = rows.length
    ? "Filas " + firstRow + "–" + lastRow + (state.pendingRow ? " · hay más filas" : " · fin del resultado (" + lastRow + " filas)") + "."
    : "Consulta ejecutada. 0 filas.";
  container.append(summary);

  if (rows.length) {
    container.append(buildResultTable(columns, rows));
  }

  if (state && (state.pendingRow || (state.canRewind && state.pageIndex > 0))) {
    const actions = document.createElement("div");
    actions.className = "result-actions";
    if (state.canRewind && state.pageIndex > 0) {
      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "button small";
      previous.textContent = "Página anterior";
      previous.addEventListener("click", function () { showPreviousPage(state); });
      actions.append(previous);
    }
    if (state.pendingRow) {
      const next = document.createElement("button");
      next.type = "button";
      next.className = "button small";
      next.textContent = "Siguientes " + RESULT_PAGE_SIZE + " filas";
      next.addEventListener("click", function () { showNextPage(state); });
      actions.append(next);
    }
    container.append(actions);
  }
}

async function showStatementPage(state) {
  const rows = [];
  if (state.pendingRow !== null) {
    rows.push(state.pendingRow);
    state.pendingRow = null;
  }
  while (rows.length < RESULT_PAGE_SIZE) {
    const row = await state.statement.next();
    if (row === null) break;
    rows.push(row);
  }
  if (rows.length === RESULT_PAGE_SIZE) state.pendingRow = await state.statement.next();
  renderResultTable(state.container, state.columns, rows);
  if (state.pendingRow === null) await state.statement.close();
}

async function changeResultPage(state, previous) {
  if (queryRunning || loading || !activeResultStatements.has(state.resultId)) return;
  queryRunning = true;
  setLoadingControls();
  try {
    if (previous) {
      if (!state.canRewind || state.pageIndex === 0) return;
      await state.statement.close();
      state.statement = await openCursor(database, state.sql);
      state.pendingRow = null;
      state.pageIndex -= 1;
      for (let index = 0; index < state.pageIndex * RESULT_PAGE_SIZE; index += 1) {
        if (await state.statement.next() === null) break;
      }
    } else {
      if (state.pendingRow === null) return;
      state.pageIndex += 1;
    }
    await showStatementPage(state);
  } catch (error) {
    await clearResultStatement(state.resultId);
    showQueryError(state.container, error);
  } finally {
    queryRunning = false;
    await showPageFromLocation();
    setLoadingControls();
  }
}

function showNextPage(state) { return changeResultPage(state, false); }
function showPreviousPage(state) { return changeResultPage(state, true); }

// Sólo se conservan 1.001 filas; se cierra el flujo antes de ejecutar la referencia.
async function readLimitedRows(sqlText) {
  const cursor = await openCursor(database, sqlText);
  try {
    const rows = [];
    while (rows.length <= CHECK_ROW_LIMIT) {
      const row = await cursor.next();
      if (row === null) break;
      rows.push(row);
    }
    const truncated = rows.length > CHECK_ROW_LIMIT;
    if (truncated) rows.pop();
    return { columns: cursor.columns, rows, truncated };
  } finally {
    await cursor.close();
  }
}

// El tipo forma parte del valor: el número 1 y la cadena "1" no son la misma
// respuesta aunque se impriman igual.
function canonicalCell(value) {
  if (value === null) return "NULL";
  if (typeof value === "bigint") return "number:" + String(value);
  if (value instanceof Uint8Array) return "blob:" + Array.from(value).join(",");
  return typeof value + ":" + String(value);
}

function canonicalRow(row) {
  return row.map(canonicalCell).join("\u001f");
}

function compareResults(mine, theirs) {
  const limitNote = mine.truncated || theirs.truncated
    ? " Se han comparado las primeras " + CHECK_ROW_LIMIT.toLocaleString("es-ES") + " filas."
    : "";
  if (mine.columns.length !== theirs.columns.length) {
    return {
      kind: "bad",
      message: "No coincide: tu consulta devuelve " + mine.columns.length
        + " columnas y la solución " + theirs.columns.length
        + ". Los nombres de las columnas no importan; el número sí."
    };
  }
  if (mine.rows.length !== theirs.rows.length) {
    return {
      kind: "bad",
      message: "No coincide: tu consulta devuelve " + mine.rows.length.toLocaleString("es-ES")
        + " filas y la solución " + theirs.rows.length.toLocaleString("es-ES") + "." + limitNote
    };
  }
  const yours = mine.rows.map(canonicalRow);
  const reference = theirs.rows.map(canonicalRow);
  const firstDifference = yours.findIndex(function (row, index) { return row !== reference[index]; });
  if (firstDifference === -1) {
    return { kind: "ok", message: "Coincide con la solución de referencia." + limitNote };
  }
  const sortedYours = yours.slice().sort();
  const sortedReference = reference.slice().sort();
  const sameRows = sortedYours.every(function (row, index) { return row === sortedReference[index]; });
  if (sameRows) {
    return {
      kind: "warn",
      message: "Mismas filas, distinto orden. Si el enunciado pide un orden concreto, añade el ORDER BY que falta."
        + limitNote
    };
  }
  return {
    kind: "bad",
    message: "No coincide a partir de la fila " + (firstDifference + 1).toLocaleString("es-ES")
      + ". Compara tu resultado con el de la solución." + limitNote
  };
}

function renderCheckResult(container, mine, verdict) {
  container.replaceChildren();
  const check = document.createElement("p");
  check.className = "result-check " + verdict.kind;
  check.textContent = verdict.message;
  container.append(check);
  const shown = mine.rows.slice(0, RESULT_PAGE_SIZE);
  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = mine.rows.length
    ? "Tu resultado: " + (mine.rows.length > shown.length
        ? "primeras " + shown.length + " filas de " + mine.rows.length.toLocaleString("es-ES")
          + (mine.truncated ? " leídas" : "")
        : mine.rows.length.toLocaleString("es-ES") + " filas") + "."
    : "Tu consulta devuelve 0 filas.";
  container.append(summary);
  if (shown.length) container.append(buildResultTable(mine.columns, shown));
}

function showQueryError(container, error) {
  const message = document.createElement("p");
  message.className = "result-summary error";
  message.textContent = "Error SQL: " + error.message;
  container.replaceChildren(message);
}

async function executeEditor(editorId, resultId, check) {
  if (queryRunning || loading) return;
  const container = document.getElementById(resultId);
  const exercise = exercisesByEditor.get(editorId);
  if (!database) {
    showQueryError(container, new Error("DuckDB aún no está listo."));
    return;
  }
  queryRunning = true;
  setLoadingControls();
  container.innerHTML = '<p class="result-summary">' + (check ? "Comprobando…" : "Ejecutando…") + '</p>';
  try {
    await clearOtherResultStatements(resultId);
    await clearResultStatement(resultId);
    const sqlText = getEditorValue(editorId).trim();
    if (!sqlText) throw new Error("Escribe una consulta antes de ejecutarla.");
    await validateStatement(database, sqlText, check);
    if (check) {
      if (!canCheckExercise(exercise)) throw new Error(STATE_CHANGE_NOTE);
      if (!isReadOnlyStatement(sqlText)) throw new Error("Solo se comprueban consultas de lectura.");
      const mine = await readLimitedRows(sqlText);
      const theirs = await readLimitedRows(exercise.solution);
      renderCheckResult(container, mine, compareResults(mine, theirs));
    } else {
      const statement = await openCursor(database, sqlText);
      const state = {
        resultId, container, statement, sql: sqlText, columns: statement.columns,
        pendingRow: null, pageIndex: 0,
        canRewind: firstStatementKeyword(sqlText) === "SELECT"
      };
      activeResultStatements.set(resultId, state);
      await showStatementPage(state);
    }
  } catch (error) {
    await clearResultStatement(resultId);
    showQueryError(container, error);
  } finally {
    queryRunning = false;
    await showPageFromLocation();
    setLoadingControls();
  }
}

function checkQuery(editorId, resultId) { return executeEditor(editorId, resultId, true); }
function runQuery(editorId, resultId) { return executeEditor(editorId, resultId, false); }

pageNavigationEl.addEventListener("click", function (event) {
  const tab = event.target.closest(".page-tab");
  if (tab) navigateToPage(tab.dataset.pageId);
});
exerciseListEl.addEventListener("click", function (event) {
  const runButton = event.target.closest(".run-query");
  if (runButton) {
    runQuery(runButton.dataset.editor, runButton.dataset.result);
    return;
  }
  const checkButton = event.target.closest(".check-query");
  if (checkButton) {
    checkQuery(checkButton.dataset.editor, checkButton.dataset.result);
    return;
  }
  const solutionButton = event.target.closest(".show-solution");
  if (solutionButton) showSolution(solutionButton.dataset.editor);
});
window.addEventListener("popstate", showPageFromLocation);
window.addEventListener("hashchange", showPageFromLocation);
showPageFromLocation();
editorModeNoteEl.textContent = hasSqlCodeMirror()
  ? "Resaltado SQL activo · consultas ejecutadas con DuckDB. Ctrl/Cmd + Intro ejecuta la consulta."
  : "No se pudo cargar CodeMirror; los cuadros de texto siguen disponibles sin resaltado.";
loadRealButton.addEventListener("click", loadRemoteDatabase);
loadDemoButton.addEventListener("click", () => loadDataset("Muestra pequeña activa", createDemoDatabase));
localFileInput.addEventListener("change", () => loadLocalFiles(Array.from(localFileInput.files || [])));
async function initialize() {
  setLoadingControls();
  try {
    database = await createDemoDatabase();
    engineReady = true;
    setStatus("DuckDB · muestra pequeña activa", "ready");
    setLoadingControls();
    await loadRemoteDatabase();
  } catch (error) {
    setStatus("No se pudo iniciar DuckDB", "error");
    messageEl.textContent = error.message;
  }
}

initialize();
