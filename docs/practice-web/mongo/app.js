import { PRACTICE_PAGES } from "./pages/index.js";
"use strict";
/*
 * Motor común de la práctica MongoDB. Descarga el JSONL completo, lo carga en
 * mingo y ejecuta el código de cada ejercicio. Las páginas de pages/ sólo
 * declaran contenido; este fichero no debe copiarse para añadir ejercicios.
 */
const MINGO_URL = "https://cdn.jsdelivr.net/npm/mingo@7.2.4/+esm";
const COLLECTION_NAMES = ["Posts", "Users", "Comments", "Votes", "Tags"];
// Los assets de una release de GitHub no envían cabeceras CORS, así que la
// página lee la copia versionada en el repositorio, que sí las envía.
const DATA_SOURCES = [
  {
    label: "jsDelivr",
    base: "https://cdn.jsdelivr.net/gh/dsevilla/bd2-data@main/es.stackoverflow/jsonl"
  },
  {
    label: "raw.githubusercontent.com",
    base: "https://raw.githubusercontent.com/dsevilla/bd2-data/main/es.stackoverflow/jsonl"
  }
];
const DATA_VARIANTS = {
  full: { name: "el conjunto completo", readyLabel: "Datos completos cargados" },
  sample: { name: "la muestra reducida", readyLabel: "Muestra reducida cargada" }
};
const RESULT_PAGE_SIZE = 25;
const MAX_TEXT_LENGTH = 1000;
const DATE_SENTINEL = "\u0000ISODate\u0000";

const statusEl = document.getElementById("db-status");
const messageEl = document.getElementById("connection-result");
const collectionListEl = document.getElementById("collection-list");
const pageNavigationEl = document.getElementById("page-navigation");
const pageTitleEl = document.getElementById("practice-page-title");
const pageDescriptionEl = document.getElementById("practice-page-description");
const editorModeNoteEl = document.getElementById("editor-mode-note");
const exerciseListEl = document.getElementById("exercise-list");
const loadRemoteButton = document.getElementById("load-remote");
const toggleDatasetButton = document.getElementById("toggle-dataset");
const loadDemoButton = document.getElementById("load-demo");
const localFilesInput = document.getElementById("local-files");

let mingo = null;
let db = null;
let collections = null;
let loading = false;
let activeDataVariant = null;
let requestedDataVariant = "full";
let activeDataLabel = "Muestra mínima activa";
let currentPageId = null;
const resultStates = new Map();
const editorDrafts = new Map();
const exercisesByEditor = new Map();
const editorInstances = new Map();

function hasJsCodeMirror() {
  return typeof window.CodeMirror === "function"
    && window.CodeMirror.modes
    && typeof window.CodeMirror.modes.javascript === "function";
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status " + kind;
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

function formatCount(value) {
  return value.toLocaleString("es-ES");
}

/* ------------------------------------------------------------------ *
 * Páginas y ejercicios
 * ------------------------------------------------------------------ */

function renderPracticePage(pageId) {
  const page = PRACTICE_PAGES.find(function (candidate) { return candidate.id === pageId; });
  if (!page || page.id === currentPageId) return;
  resultStates.clear();
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
    const editorId = "mongo-" + page.id + "-" + exercise.id;
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
    labelText.textContent = "Consulta MongoDB";
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
    editor.setAttribute("aria-label", "Consulta MongoDB · " + exercise.title);
    editor.value = editorDrafts.has(editorId)
      ? editorDrafts.get(editorId)
      : (exercise.starter || "");

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
      const solutionButton = document.createElement("button");
      solutionButton.type = "button";
      solutionButton.className = "button small show-solution";
      solutionButton.dataset.editor = editorId;
      solutionButton.textContent = "Mostrar solución";
      actions.append(checkButton, solutionButton);
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
    if (hasJsCodeMirror()) {
      const codeEditor = window.CodeMirror.fromTextArea(editor, {
        mode: "javascript",
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

function showPageFromLocation() {
  const pageId = pageIdFromLocation();
  const requestedPage = PRACTICE_PAGES.find(function (page) { return page.id === pageId; });
  const page = requestedPage || PRACTICE_PAGES[0];
  if (!page) return;
  if (!requestedPage) history.replaceState(null, "", "#" + encodeURIComponent(page.id));
  renderPracticePage(page.id);
}

function navigateToPage(pageId) {
  const page = PRACTICE_PAGES.find(function (candidate) { return candidate.id === pageId; });
  if (!page) return;
  const hash = "#" + encodeURIComponent(page.id);
  if (window.location.hash !== hash) history.pushState(null, "", hash);
  renderPracticePage(page.id);
}

function getEditorValue(editorId) {
  const codeEditor = editorInstances.get(editorId);
  const textArea = document.getElementById(editorId);
  return codeEditor ? codeEditor.getValue() : (textArea ? textArea.value : "");
}

function setEditorValue(editorId, value) {
  const codeEditor = editorInstances.get(editorId);
  const textArea = document.getElementById(editorId);
  if (codeEditor) codeEditor.setValue(value);
  else if (textArea) textArea.value = value;
  editorDrafts.set(editorId, value);
}

function showSolution(editorId) {
  const exercise = exercisesByEditor.get(editorId);
  const startMarker = "// SOLUCIÓN DE REFERENCIA (comentada; quita '// ' de cada línea para ejecutarla)";
  if (!exercise || !exercise.solution) return;
  const currentValue = getEditorValue(editorId);
  if (!currentValue.includes(startMarker)) {
    const code = exercise.solution.split("\n").map(function (line) {
      return "// " + line;
    }).join("\n");
    const block = startMarker + "\n" + code + "\n// FIN DE LA SOLUCIÓN DE REFERENCIA";
    const existingText = currentValue.replace(/\s+$/, "");
    setEditorValue(editorId, (existingText ? existingText + "\n\n" : "") + block);
  }
  const codeEditor = editorInstances.get(editorId);
  const textArea = document.getElementById(editorId);
  if (codeEditor) {
    codeEditor.focus();
    const lastLine = codeEditor.lineCount() - 1;
    const lastColumn = codeEditor.getLine(lastLine).length;
    codeEditor.setCursor(lastLine, lastColumn);
    codeEditor.scrollIntoView({ line: lastLine, ch: lastColumn }, 100);
  } else if (textArea) {
    textArea.focus();
    textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    textArea.scrollTop = textArea.scrollHeight;
  }
}

/* ------------------------------------------------------------------ *
 * Carga de datos
 * ------------------------------------------------------------------ */

function reviveExtendedJson(key, value) {
  if (value !== null && typeof value === "object" && typeof value.$date === "string") {
    return new Date(value.$date);
  }
  return value;
}

function parseJsonl(text, label) {
  const documents = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    try {
      documents.push(JSON.parse(line, reviveExtendedJson));
    } catch (error) {
      throw new Error("Línea " + (index + 1) + " de " + label + " ilegible: " + error.message);
    }
  }
  return documents;
}

async function streamToText(stream, label) {
  let total = 0;
  let lastUpdate = 0;
  const countedStream = stream.pipeThrough(new TransformStream({
    transform: function (chunk, controller) {
      total += chunk.byteLength;
      const now = performance.now();
      if (now - lastUpdate > 250) {
        setStatus(label + " · " + formatBytes(total) + " descomprimidos", "loading");
        lastUpdate = now;
      }
      controller.enqueue(chunk);
    }
  }));
  try {
    return await new Response(countedStream).text();
  } catch (error) {
    throw new Error(label + " falló tras producir " + formatBytes(total) + " descomprimidos ("
      + error.name + ": " + error.message + ").");
  }
}

async function fetchCollection(base, name, variant) {
  const filename = name + (variant === "sample" ? "-sample" : "") + ".jsonl.gz";
  const url = base + "/" + filename;
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(filename + " respondió HTTP " + response.status + ".");
  if (!response.body) throw new Error("El navegador no permitió leer " + filename + ".");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return parseJsonl(await streamToText(stream, "Descargando " + name), filename);
}

async function loadFromSource(source, variant) {
  const loaded = {};
  for (let index = 0; index < COLLECTION_NAMES.length; index += 1) {
    const name = COLLECTION_NAMES[index];
    setStatus("Descargando " + name + " (" + (index + 1) + "/" + COLLECTION_NAMES.length + ")", "loading");
    loaded[name] = await fetchCollection(source.base, name, variant);
  }
  return loaded;
}

function createDemoCollections() {
  const fecha = function (texto) { return new Date(texto); };
  return {
    Posts: [
      { Id: 101, AcceptedAnswerId: 103, AnswerCount: 2, Body: "<p>Sobre índices B-tree…</p>", CreationDate: fecha("2025-01-04T10:00:00Z"), OwnerUserId: 1, ParentId: null, PostTypeId: 1, Score: 18, Tags: "<sql><indices>", Title: "¿Cómo funciona un índice B-tree?", ViewCount: 420 },
      { Id: 102, AcceptedAnswerId: null, AnswerCount: 1, Body: "<p>Sobre claves compuestas…</p>", CreationDate: fecha("2025-02-12T12:30:00Z"), OwnerUserId: 2, ParentId: null, PostTypeId: 1, Score: 32, Tags: "<sql><modelado>", Title: "¿Cuándo conviene una clave compuesta?", ViewCount: 980 },
      { Id: 103, AcceptedAnswerId: null, AnswerCount: 0, Body: "<p>Depende del orden de los campos.</p>", CreationDate: fecha("2025-01-05T09:15:00Z"), OwnerUserId: 3, ParentId: 101, PostTypeId: 2, Score: 12, Tags: null, Title: null, ViewCount: 0 },
      { Id: 104, AcceptedAnswerId: null, AnswerCount: 0, Body: "<p>Con un índice compuesto basta.</p>", CreationDate: fecha("2025-02-13T08:00:00Z"), OwnerUserId: 1, ParentId: 102, PostTypeId: 2, Score: 4, Tags: null, Title: null, ViewCount: 0 },
      { Id: 105, AcceptedAnswerId: null, AnswerCount: 0, Body: "<p>También sirve un índice parcial.</p>", CreationDate: fecha("2025-01-06T11:20:00Z"), OwnerUserId: 2, ParentId: 101, PostTypeId: 2, Score: 7, Tags: null, Title: null, ViewCount: 0 },
      { Id: 106, AcceptedAnswerId: null, AnswerCount: 0, Body: "<p>Sobre documentos anidados…</p>", CreationDate: fecha("2025-03-11T16:45:00Z"), OwnerUserId: 3, ParentId: null, PostTypeId: 1, Score: 7, Tags: "<mongodb><modelado>", Title: "¿Cuándo embeber y cuándo referenciar?", ViewCount: 150 }
    ],
    Users: [
      { Id: 1, AboutMe: "Trabajo con bases de datos.", AccountId: 11, CreationDate: fecha("2024-09-01T08:00:00Z"), DisplayName: "Lucía", DownVotes: 0, LastAccessDate: fecha("2025-03-20T18:00:00Z"), Location: "Murcia", Reputation: 1250, UpVotes: 40, Views: 310, WebsiteUrl: null },
      { Id: 2, AboutMe: null, AccountId: 12, CreationDate: fecha("2024-10-15T09:30:00Z"), DisplayName: "Mateo", DownVotes: 1, LastAccessDate: fecha("2025-03-19T10:00:00Z"), Location: null, Reputation: 840, UpVotes: 22, Views: 120, WebsiteUrl: "https://ejemplo.invalid" },
      { Id: 3, AboutMe: "Aprendiendo MongoDB.", AccountId: 13, CreationDate: fecha("2025-01-02T12:00:00Z"), DisplayName: "Inés", DownVotes: 0, LastAccessDate: fecha("2025-03-21T20:15:00Z"), Location: "Cartagena", Reputation: 420, UpVotes: 8, Views: 45, WebsiteUrl: null }
    ],
    Comments: [
      { Id: 501, ContentLicense: "CC BY-SA 4.0", CreationDate: fecha("2025-01-04T12:00:00Z"), PostId: 101, Score: 2, Text: "Buena pregunta.", UserDisplayName: null, UserId: 2 },
      { Id: 502, ContentLicense: "CC BY-SA 4.0", CreationDate: fecha("2025-01-05T10:00:00Z"), PostId: 103, Score: 0, Text: "Gracias por la respuesta.", UserDisplayName: null, UserId: 1 },
      { Id: 503, ContentLicense: "CC BY-SA 4.0", CreationDate: fecha("2025-02-12T13:00:00Z"), PostId: 102, Score: 1, Text: "¿Y si la clave es muy ancha?", UserDisplayName: null, UserId: 3 }
    ],
    Votes: [
      { Id: 9001, BountyAmount: 0, CreationDate: fecha("2025-01-04T00:00:00Z"), PostId: 101, UserId: null, VoteTypeId: 2 },
      { Id: 9002, BountyAmount: 0, CreationDate: fecha("2025-01-05T00:00:00Z"), PostId: 103, UserId: null, VoteTypeId: 2 },
      { Id: 9003, BountyAmount: 0, CreationDate: fecha("2025-02-12T00:00:00Z"), PostId: 102, UserId: null, VoteTypeId: 2 },
      { Id: 9004, BountyAmount: 0, CreationDate: fecha("2025-02-13T00:00:00Z"), PostId: 102, UserId: null, VoteTypeId: 3 }
    ],
    Tags: [
      { Id: 1, Count: 2, ExcerptPostId: null, TagName: "sql", WikiPostId: null },
      { Id: 2, Count: 1, ExcerptPostId: null, TagName: "indices", WikiPostId: null },
      { Id: 3, Count: 2, ExcerptPostId: null, TagName: "modelado", WikiPostId: null },
      { Id: 4, Count: 1, ExcerptPostId: null, TagName: "mongodb", WikiPostId: null }
    ]
  };
}

/* ------------------------------------------------------------------ *
 * El objeto db sobre mingo
 * ------------------------------------------------------------------ */

function resolveField(document, path) {
  const parts = String(path).split(".");
  let value = document;
  for (let index = 0; index < parts.length; index += 1) {
    if (value === null || value === undefined) return undefined;
    value = value[parts[index]];
  }
  return value;
}

function queryOptions() {
  // $lookup resuelve el nombre de la colección contra los arrays cargados.
  return {
    collectionResolver: function (name) {
      return collections[String(name).toLowerCase()] || [];
    }
  };
}

function makeCollection(name, documents) {
  return {
    name: name,
    find: function (filter, projection) {
      return mingo.find(documents, filter || {}, projection, queryOptions());
    },
    findOne: function (filter, projection) {
      const rows = mingo.find(documents, filter || {}, projection, queryOptions()).limit(1).all();
      return rows.length ? rows[0] : null;
    },
    aggregate: function (pipeline) {
      return new mingo.Aggregator(pipeline || [], queryOptions()).run(documents);
    },
    countDocuments: function (filter) {
      return mingo.find(documents, filter || {}, null, queryOptions()).all().length;
    },
    distinct: function (field, filter) {
      const seen = new Map();
      mingo.find(documents, filter || {}, null, queryOptions()).all().forEach(function (document) {
        const value = resolveField(document, field);
        const values = Array.isArray(value) ? value : [value];
        values.forEach(function (item) {
          if (item === undefined) return;
          const key = canonicalValue(item);
          if (!seen.has(key)) seen.set(key, item);
        });
      });
      return Array.from(seen.keys()).sort().map(function (key) { return seen.get(key); });
    }
  };
}

function buildDatabase(loaded, label) {
  resultStates.clear();
  collections = {};
  COLLECTION_NAMES.forEach(function (name) {
    collections[name.toLowerCase()] = loaded[name] || [];
  });
  const next = {
    getCollectionNames: function () { return COLLECTION_NAMES.map(function (name) { return name.toLowerCase(); }); }
  };
  COLLECTION_NAMES.forEach(function (name) {
    const key = name.toLowerCase();
    next[key] = makeCollection(key, collections[key]);
  });
  db = next;
  renderCollectionList();
  setStatus(label, "ready");
  document.querySelectorAll(".result").forEach(function (result) {
    result.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Datos cargados. Ejecuta la consulta para ver el resultado.";
    result.append(empty);
  });
}

function renderCollectionList() {
  collectionListEl.replaceChildren();
  if (!collections) return;
  COLLECTION_NAMES.forEach(function (name) {
    const key = name.toLowerCase();
    const item = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = "db." + key;
    item.append(code, document.createTextNode(" · " + formatCount(collections[key].length) + " documentos"));
    collectionListEl.append(item);
  });
}

function setLoadingControls(isLoading) {
  loadRemoteButton.disabled = isLoading;
  toggleDatasetButton.disabled = isLoading;
  loadDemoButton.disabled = isLoading;
  localFilesInput.disabled = isLoading;
}

function updateDatasetToggleButton() {
  const displayedVariant = activeDataVariant || requestedDataVariant;
  toggleDatasetButton.textContent = displayedVariant === "sample"
    ? "Volver a datos completos (106,7 MB)"
    : "Usar muestra reducida (12,5 MB)";
}

async function loadRemoteData(variant) {
  if (loading || !mingo) return;
  const targetVariant = variant || activeDataVariant || "full";
  const target = DATA_VARIANTS[targetVariant];
  requestedDataVariant = targetVariant;
  loading = true;
  setLoadingControls(true);
  const failures = [];
  try {
    const releaseCurrentData = Boolean(
      (activeDataVariant && activeDataVariant !== targetVariant)
      || activeDataLabel.startsWith("Ficheros locales cargados")
    );
    if (releaseCurrentData) {
      db = null;
      collections = null;
      resultStates.clear();
      activeDataVariant = null;
      activeDataLabel = "Sin datos activos";
      collectionListEl.replaceChildren();
      document.querySelectorAll(".result").forEach(function (result) {
        result.replaceChildren();
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Cargando el nuevo conjunto de datos…";
        result.append(empty);
      });
      setStatus("Liberando el conjunto anterior", "loading");
      await yieldToBrowser();
    }
    messageEl.textContent = "Descargando " + target.name + " y descomprimiéndolo en el navegador.";
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador no ofrece DecompressionStream, necesario para leer los ficheros .gz.");
    }
    for (let index = 0; index < DATA_SOURCES.length; index += 1) {
      const source = DATA_SOURCES[index];
      try {
        const started = performance.now();
        const loaded = await loadFromSource(source, targetVariant);
        const total = COLLECTION_NAMES.reduce(function (sum, name) { return sum + loaded[name].length; }, 0);
        activeDataVariant = targetVariant;
        activeDataLabel = target.readyLabel + " · " + formatCount(total) + " documentos";
        buildDatabase(loaded, activeDataLabel);
        updateDatasetToggleButton();
        messageEl.textContent = "Carga correcta de " + target.name + " desde " + source.label + " en "
          + ((performance.now() - started) / 1000).toFixed(1) + " s.";
        return;
      } catch (error) {
        failures.push(source.label + ": " + error.message);
      }
    }
    throw new Error(failures.join(" | "));
  } catch (error) {
    if (db) {
      setStatus(activeDataLabel, "ready");
      messageEl.textContent = "No se pudo cargar " + target.name + ". Se mantiene "
        + activeDataLabel + ". Puedes reintentarlo, abrir ficheros locales o usar la muestra mínima. Detalle: "
        + error.message;
    } else {
      setStatus("No hay datos cargados", "error");
      messageEl.textContent = "No se pudo cargar " + target.name
        + ". El conjunto anterior se liberó para reducir el uso máximo de memoria. "
        + "Puedes reintentar la misma descarga o usar la muestra mínima. Detalle: " + error.message;
    }
  } finally {
    loading = false;
    setLoadingControls(false);
    updateDatasetToggleButton();
  }
}

async function loadLocalFiles(files) {
  if (!files || !files.length || !mingo || loading) return;
  loading = true;
  setLoadingControls(true);
  const loaded = {};
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const name = COLLECTION_NAMES.find(function (candidate) {
        return file.name.toLowerCase().startsWith(candidate.toLowerCase() + ".jsonl");
      });
      if (!name) {
        throw new Error("No reconozco el fichero " + file.name
          + "; usa los nombres publicados (Posts.jsonl.gz, Users.jsonl.gz, …).");
      }
      setStatus("Leyendo " + file.name, "loading");
      const text = file.name.toLowerCase().endsWith(".gz")
        ? await streamToText(file.stream().pipeThrough(new DecompressionStream("gzip")), "Leyendo " + file.name)
        : await file.text();
      loaded[name] = parseJsonl(text, file.name);
    }
    const missing = COLLECTION_NAMES.filter(function (name) { return !loaded[name]; });
    missing.forEach(function (name) { loaded[name] = []; });
    const total = COLLECTION_NAMES.reduce(function (sum, name) { return sum + loaded[name].length; }, 0);
    activeDataVariant = null;
    requestedDataVariant = "full";
    activeDataLabel = "Ficheros locales cargados · " + formatCount(total) + " documentos";
    buildDatabase(loaded, activeDataLabel);
    updateDatasetToggleButton();
    messageEl.textContent = missing.length
      ? "Carga correcta. Sin datos para: " + missing.join(", ") + "."
      : "Carga correcta desde los ficheros locales.";
  } catch (error) {
    setStatus("No se pudieron abrir los ficheros", "error");
    messageEl.textContent = error.message;
  } finally {
    loading = false;
    setLoadingControls(false);
    localFilesInput.value = "";
  }
}

/* ------------------------------------------------------------------ *
 * Ejecución y presentación de resultados
 * ------------------------------------------------------------------ */

function isoDate(value) {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) throw new Error("ISODate no entiende la fecha «" + value + "».");
  return moment;
}

function evaluateCode(code) {
  const source = code.trim().replace(/;+\s*$/, "");
  let runner;
  try {
    runner = new Function("db", "ISODate", '"use strict"; return (\n' + source + "\n);");
  } catch (error) {
    // No era una expresión: se admite también un bloque con su propio return.
    runner = new Function("db", "ISODate", '"use strict";\n' + code);
  }
  return runner(db, isoDate);
}

function toDocuments(value) {
  if (value === undefined) {
    throw new Error("La consulta no devolvió nada. Escribe una expresión como db.posts.find({…}) "
      + "o, si usas varias sentencias, termina con return.");
  }
  if (value === null) return [null];
  if (Array.isArray(value)) return value;
  if (typeof value.all === "function") return value.all();
  return [value];
}

function truncateText(text) {
  return text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH) + "… [texto truncado; " + text.length + " caracteres]"
    : text;
}

function jsonReplacer(key, value) {
  const original = this[key];
  if (original instanceof Date) return DATE_SENTINEL + original.toISOString();
  if (typeof value === "string") return truncateText(value);
  return value;
}

function formatDocument(document) {
  const text = JSON.stringify(document, jsonReplacer, 2);
  if (text === undefined) return String(document);
  return text.replace(
    new RegExp('"' + DATE_SENTINEL + '([^"]*)"', "g"),
    'ISODate("$1")'
  );
}

function canonicalValue(value) {
  if (value instanceof Date) return "Date(" + value.toISOString() + ")";
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalValue).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + canonicalValue(value[key]);
    }).join(",") + "}";
  }
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function renderResult(state) {
  const container = state.container;
  container.replaceChildren();
  if (state.check) {
    const check = document.createElement("p");
    check.className = "result-check " + state.check.kind;
    check.textContent = state.check.message;
    container.append(check);
  }
  const total = state.documents.length;
  const start = state.pageIndex * RESULT_PAGE_SIZE;
  const page = state.documents.slice(start, start + RESULT_PAGE_SIZE);
  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = total
    ? "Documentos " + formatCount(start + 1) + "–" + formatCount(start + page.length)
      + " de " + formatCount(total) + "."
    : "Consulta ejecutada. 0 documentos.";
  container.append(summary);

  if (page.length) {
    const block = document.createElement("pre");
    block.className = "documents";
    block.textContent = page.map(formatDocument).join("\n");
    container.append(block);
  }

  if (total > RESULT_PAGE_SIZE) {
    const actions = document.createElement("div");
    actions.className = "result-actions";
    if (state.pageIndex > 0) {
      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "button small";
      previous.textContent = "Bloque anterior";
      previous.addEventListener("click", function () {
        state.pageIndex -= 1;
        renderResult(state);
      });
      actions.append(previous);
    }
    if (start + page.length < total) {
      const next = document.createElement("button");
      next.type = "button";
      next.className = "button small";
      next.textContent = "Siguientes " + RESULT_PAGE_SIZE + " documentos";
      next.addEventListener("click", function () {
        state.pageIndex += 1;
        renderResult(state);
      });
      actions.append(next);
    }
    container.append(actions);
  }
}

function showError(container, message) {
  container.replaceChildren();
  const error = document.createElement("p");
  error.className = "result-summary error";
  error.textContent = message;
  container.append(error);
}

function describeError(error) {
  if (error instanceof SyntaxError) return "Error de sintaxis: " + error.message;
  return (error && error.name ? error.name + ": " : "") + (error && error.message ? error.message : String(error));
}

function runExercise(editorId, resultId, compare) {
  const container = document.getElementById(resultId);
  if (!container) return;
  if (!db) {
    showError(container, "Los datos todavía no están cargados.");
    return;
  }
  const code = getEditorValue(editorId);
  if (!code.trim()) {
    showError(container, "Escribe una consulta antes de ejecutarla.");
    return;
  }
  if (code.split(/\r?\n/).every(function (line) { return !line.trim() || line.trim().startsWith("//"); })) {
    showError(container, "El editor sólo contiene comentarios. Quita «// » de las líneas de la solución para ejecutarla.");
    return;
  }
  const buttons = Array.from(document.querySelectorAll('[data-editor="' + editorId + '"]'));
  buttons.forEach(function (button) { button.disabled = true; });
  container.replaceChildren();
  const waiting = document.createElement("p");
  waiting.className = "result-summary";
  waiting.textContent = "Ejecutando…";
  container.append(waiting);
  window.setTimeout(function () {
    try {
      const documents = toDocuments(evaluateCode(code));
      const state = { container: container, documents: documents, pageIndex: 0, check: null };
      if (compare) state.check = checkAgainstSolution(editorId, documents);
      resultStates.set(resultId, state);
      renderResult(state);
    } catch (error) {
      showError(container, describeError(error));
    } finally {
      buttons.forEach(function (button) { button.disabled = false; });
    }
  }, 0);
}

function checkAgainstSolution(editorId, documents) {
  const exercise = exercisesByEditor.get(editorId);
  if (!exercise || !exercise.solution) return null;
  let expected;
  try {
    expected = toDocuments(evaluateCode(exercise.solution));
  } catch (error) {
    return { kind: "warn", message: "No se pudo evaluar la solución de referencia: " + describeError(error) };
  }
  if (documents.length !== expected.length) {
    return {
      kind: "bad",
      message: "No coincide: tu consulta devuelve " + formatCount(documents.length)
        + " documentos y la solución " + formatCount(expected.length) + "."
    };
  }
  const yours = documents.map(canonicalValue);
  const theirs = expected.map(canonicalValue);
  const firstDifference = yours.findIndex(function (value, index) { return value !== theirs[index]; });
  if (firstDifference === -1) {
    return { kind: "ok", message: "Coincide con la solución de referencia." };
  }
  const sortedYours = yours.slice().sort();
  const sortedTheirs = theirs.slice().sort();
  const sameSet = sortedYours.every(function (value, index) { return value === sortedTheirs[index]; });
  if (sameSet) {
    return {
      kind: "warn",
      message: "Mismos documentos, distinto orden. Si el enunciado pide un orden concreto, añade el $sort que falta."
    };
  }
  return {
    kind: "bad",
    message: "No coincide a partir del documento " + formatCount(firstDifference + 1)
      + ". Compara tu resultado con el de la solución."
  };
}

/* ------------------------------------------------------------------ *
 * Arranque
 * ------------------------------------------------------------------ */

pageNavigationEl.addEventListener("click", function (event) {
  const tab = event.target.closest(".page-tab");
  if (tab) navigateToPage(tab.dataset.pageId);
});
exerciseListEl.addEventListener("click", function (event) {
  const runButton = event.target.closest(".run-query");
  if (runButton) {
    runExercise(runButton.dataset.editor, runButton.dataset.result, false);
    return;
  }
  const checkButton = event.target.closest(".check-query");
  if (checkButton) {
    runExercise(checkButton.dataset.editor, checkButton.dataset.result, true);
    return;
  }
  const solutionButton = event.target.closest(".show-solution");
  if (solutionButton) showSolution(solutionButton.dataset.editor);
});
window.addEventListener("popstate", showPageFromLocation);
window.addEventListener("hashchange", showPageFromLocation);
showPageFromLocation();
editorModeNoteEl.textContent = hasJsCodeMirror()
  ? "Resaltado JavaScript activo. Ctrl/Cmd + Intro ejecuta la consulta."
  : "No se pudo cargar CodeMirror; los cuadros de texto siguen disponibles sin resaltado.";
loadRemoteButton.addEventListener("click", function () {
  loadRemoteData(activeDataVariant || requestedDataVariant);
});
toggleDatasetButton.addEventListener("click", function () {
  const displayedVariant = activeDataVariant || requestedDataVariant;
  loadRemoteData(displayedVariant === "sample" ? "full" : "sample");
});
loadDemoButton.addEventListener("click", function () {
  if (!mingo || loading) return;
  const demo = createDemoCollections();
  const total = COLLECTION_NAMES.reduce(function (sum, name) { return sum + demo[name].length; }, 0);
  activeDataVariant = null;
  requestedDataVariant = "full";
  activeDataLabel = "Muestra mínima activa · " + formatCount(total) + " documentos";
  buildDatabase(demo, activeDataLabel);
  updateDatasetToggleButton();
  messageEl.textContent = "Estás usando la muestra mínima incrustada en la página, pensada sólo para probar la sintaxis.";
});
localFilesInput.addEventListener("change", function () {
  loadLocalFiles(localFilesInput.files);
});

async function initialize() {
  try {
    setStatus("Cargando mingo…", "loading");
    mingo = await import(MINGO_URL);
    activeDataVariant = null;
    requestedDataVariant = "full";
    activeDataLabel = "Muestra mínima activa";
    buildDatabase(createDemoCollections(), activeDataLabel);
    setStatus("Descargando el conjunto completo…", "loading");
    loadDemoButton.disabled = false;
    localFilesInput.disabled = false;
    loadRemoteButton.disabled = false;
    await loadRemoteData("full");
  } catch (error) {
    setStatus("No se pudo iniciar el motor de consultas", "error");
    messageEl.textContent = "No se pudo cargar mingo desde jsDelivr: " + describeError(error);
  }
}

initialize();
