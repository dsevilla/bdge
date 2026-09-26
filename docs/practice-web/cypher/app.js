import { PRACTICE_PAGES } from "./pages/index.js";
"use strict";
/*
 * Motor común de la práctica de grafos. Descarga la muestra JSONL, construye
 * el grafo en Ladybug (WebAssembly) y ejecuta el Cypher de cada ejercicio,
 * dibujando el resultado cuando contiene nodos o relaciones. Las páginas de
 * pages/ sólo declaran contenido; este fichero no debe copiarse para añadir
 * ejercicios.
 */

// Se usa el build síncrono a propósito: el asíncrono arranca un Web Worker, y
// un Worker no se puede crear desde un script de otro origen, así que no
// funciona servido desde un CDN. Las consultas tardan milisegundos, de modo
// que bloquear el hilo principal no se nota; la carga inicial sí, y por eso va
// informando de cada paso.
const LBUG_URL = "https://cdn.jsdelivr.net/npm/@ladybugdb/wasm-core@0.20.4/sync/index.js";
// Los assets de una release de GitHub no envían cabeceras CORS: la página lee
// la copia versionada en el repositorio de datos, que sí las envía.
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
const SOURCE_FILES = ["Users", "Posts", "Tags"];
const RESULT_PAGE_SIZE = 25;
const GRAPH_NODE_LIMIT = 300;
const MAX_TEXT_LENGTH = 400;
const WRITE_CLAUSES = /\b(CREATE|MERGE|SET|DELETE|DETACH|REMOVE|COPY|DROP|ALTER|INSTALL|LOAD|ATTACH|EXPORT|IMPORT)\b/i;
const STATE_CHANGE_NOTE = "No se puede comprobar: la consulta cambia el grafo.";

// El esquema y la carga se declaran aquí y se muestran tal cual en la página:
// lo que el alumno lee es exactamente lo que se ha ejecutado.
const SCHEMA_STATEMENTS = [
  `CREATE NODE TABLE User(
  Id INT64,
  DisplayName STRING,
  Reputation INT64,
  Location STRING,
  CreationDate TIMESTAMP,
  PRIMARY KEY (Id)
)`,
  `CREATE NODE TABLE Post(
  Id INT64,
  PostTypeId INT64,
  Title STRING,
  Score INT64,
  ViewCount INT64,
  CreationDate TIMESTAMP,
  PRIMARY KEY (Id)
)`,
  `CREATE NODE TABLE Tag(
  TagName STRING,
  Count INT64,
  PRIMARY KEY (TagName)
)`,
  `CREATE REL TABLE WROTE(FROM User TO Post)`,
  `CREATE REL TABLE ANSWERS(FROM Post TO Post)`,
  `CREATE REL TABLE TAGGED_WITH(FROM Post TO Tag)`
];

const COPY_STATEMENTS = [
  { table: "User", file: "user.csv" },
  { table: "Post", file: "post.csv" },
  { table: "Tag", file: "tag.csv" },
  { table: "WROTE", file: "wrote.csv" },
  { table: "ANSWERS", file: "answers.csv" },
  { table: "TAGGED_WITH", file: "tagged_with.csv" }
];

const LABEL_COLORS = {
  User: "#2f6f4f",
  Post: "#8a6a00",
  Tag: "#7b4f9d"
};

const statusEl = document.getElementById("db-status");
const messageEl = document.getElementById("connection-result");
const collectionListEl = document.getElementById("collection-list");
const schemaSourceEl = document.getElementById("schema-source");
const pageNavigationEl = document.getElementById("page-navigation");
const pageTitleEl = document.getElementById("practice-page-title");
const pageDescriptionEl = document.getElementById("practice-page-description");
const editorModeNoteEl = document.getElementById("editor-mode-note");
const exerciseListEl = document.getElementById("exercise-list");
const loadRemoteButton = document.getElementById("load-remote");

let lbug = null;
let database = null;
let connection = null;
let loading = false;
let currentPageId = null;
const resultStates = new Map();
const editorDrafts = new Map();
const exercisesByEditor = new Map();
const editorInstances = new Map();
const graphInstances = new Map();

function hasCypherCodeMirror() {
  return typeof window.CodeMirror === "function"
    && window.CodeMirror.modes
    && typeof window.CodeMirror.modes.cypher === "function";
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status " + kind;
}

function formatCount(value) {
  return Number(value).toLocaleString("es-ES");
}

function yieldToBrowser() {
  return new Promise(function (resolve) { window.setTimeout(resolve, 0); });
}

/* ------------------------------------------------------------------ *
 * Páginas y ejercicios
 * ------------------------------------------------------------------ */

function canCheckExercise(exercise) {
  return Boolean(exercise && exercise.solution)
    && exercise.check !== false
    && isReadOnlyCypher(exercise.solution);
}

function renderPracticePage(pageId) {
  const page = PRACTICE_PAGES.find(function (candidate) { return candidate.id === pageId; });
  if (!page || page.id === currentPageId) return;
  destroyGraphs();
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
    const editorId = "cypher-" + page.id + "-" + exercise.id;
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
    labelText.textContent = "Consulta Cypher";
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
    editor.setAttribute("aria-label", "Consulta Cypher · " + exercise.title);
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
      actions.append(checkButton);
      if (!canCheckExercise(exercise)) {
        // Ejecutar la solución de referencia volvería a escribir en el grafo:
        // el botón queda visible pero inactivo, con el motivo al lado.
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
    if (hasCypherCodeMirror()) {
      const codeEditor = window.CodeMirror.fromTextArea(editor, {
        mode: "application/x-cypher-query",
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
    codeEditor.setCursor(lastLine, codeEditor.getLine(lastLine).length);
  } else if (textArea) {
    textArea.focus();
    textArea.setSelectionRange(textArea.value.length, textArea.value.length);
  }
}

/* ------------------------------------------------------------------ *
 * Construcción del grafo
 * ------------------------------------------------------------------ */

function reviveExtendedJson(key, value) {
  if (value !== null && typeof value === "object" && typeof value.$date === "string") {
    // Ladybug espera un TIMESTAMP sin zona: 2015-10-30T10:26:44.223
    return value.$date.replace("Z", "");
  }
  return value;
}

function parseJsonl(text, label) {
  const documents = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    try {
      documents.push(JSON.parse(lines[index], reviveExtendedJson));
    } catch (error) {
      throw new Error("Línea " + (index + 1) + " de " + label + " ilegible: " + error.message);
    }
  }
  return documents;
}

async function fetchCollection(base, name) {
  const response = await fetch(base + "/" + name + ".jsonl.gz", { mode: "cors" });
  if (!response.ok) throw new Error(name + ".jsonl.gz respondió HTTP " + response.status + ".");
  if (!response.body) throw new Error("El navegador no permitió leer " + name + ".jsonl.gz.");
  const text = await new Response(
    response.body.pipeThrough(new DecompressionStream("gzip"))
  ).text();
  return parseJsonl(text, name + ".jsonl.gz");
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  return '"' + String(value).replace(/"/g, '""').replace(/[\r\n]+/g, " ") + '"';
}

function buildCsvFiles(documents) {
  const users = documents.Users;
  const posts = documents.Posts;
  const tags = documents.Tags;
  const knownTags = new Set(tags.map(function (tag) { return tag.TagName; }));
  const files = {};
  files["user.csv"] = users.map(function (user) {
    return [user.Id, csvValue(user.DisplayName), user.Reputation, csvValue(user.Location),
      csvValue(user.CreationDate)].join(",");
  }).join("\n");
  files["post.csv"] = posts.map(function (post) {
    return [post.Id, post.PostTypeId, csvValue(post.Title), post.Score, post.ViewCount,
      csvValue(post.CreationDate)].join(",");
  }).join("\n");
  files["tag.csv"] = tags.map(function (tag) {
    return [csvValue(tag.TagName), tag.Count].join(",");
  }).join("\n");
  files["wrote.csv"] = posts.filter(function (post) { return post.OwnerUserId !== null; })
    .map(function (post) { return post.OwnerUserId + "," + post.Id; }).join("\n");
  files["answers.csv"] = posts.filter(function (post) { return post.ParentId !== null; })
    .map(function (post) { return post.Id + "," + post.ParentId; }).join("\n");
  const tagged = [];
  posts.forEach(function (post) {
    if (!post.Tags) return;
    post.Tags.replace(/^</, "").replace(/>$/, "").split("><").forEach(function (name) {
      if (knownTags.has(name)) tagged.push(post.Id + "," + csvValue(name));
    });
  });
  files["tagged_with.csv"] = tagged.join("\n");
  return files;
}

function copyStatement(entry) {
  return "COPY " + entry.table + " FROM '/" + entry.file + "' (header=false)";
}

function renderSchemaSource() {
  schemaSourceEl.textContent = SCHEMA_STATEMENTS.map(function (statement) {
    return statement + ";";
  }).join("\n\n") + "\n\n" + COPY_STATEMENTS.map(function (entry) {
    return copyStatement(entry) + ";";
  }).join("\n");
}

async function buildGraph(documents) {
  setStatus("Creando el esquema del grafo", "loading");
  await yieldToBrowser();
  if (connection) connection = null;
  database = new lbug.Database();
  connection = new lbug.Connection(database);
  SCHEMA_STATEMENTS.forEach(function (statement) { connection.query(statement); });

  setStatus("Preparando los datos para la carga", "loading");
  await yieldToBrowser();
  const files = buildCsvFiles(documents);
  const fs = await lbug.getFS();
  Object.keys(files).forEach(function (name) {
    fs.createDataFile("/", name, files[name], true, true);
  });

  for (let index = 0; index < COPY_STATEMENTS.length; index += 1) {
    const entry = COPY_STATEMENTS[index];
    setStatus("Cargando " + entry.table + " (" + (index + 1) + "/" + COPY_STATEMENTS.length + ")", "loading");
    await yieldToBrowser();
    connection.query(copyStatement(entry));
  }
}

function graphCounts() {
  const counts = [];
  [["User", "(:User)"], ["Post", "(:Post)"], ["Tag", "(:Tag)"]].forEach(function (entry) {
    const result = connection.query("MATCH (n:" + entry[0] + ") RETURN count(*) AS n");
    counts.push({ label: entry[1], total: Number(result.getAllObjects()[0].n) });
  });
  [["WROTE", "[:WROTE]"], ["ANSWERS", "[:ANSWERS]"], ["TAGGED_WITH", "[:TAGGED_WITH]"]].forEach(function (entry) {
    const result = connection.query("MATCH ()-[r:" + entry[0] + "]->() RETURN count(*) AS n");
    counts.push({ label: entry[1], total: Number(result.getAllObjects()[0].n) });
  });
  return counts;
}

function renderCounts(counts) {
  collectionListEl.replaceChildren();
  counts.forEach(function (entry) {
    const item = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = entry.label;
    item.append(code, document.createTextNode(" · " + formatCount(entry.total)));
    collectionListEl.append(item);
  });
}

async function loadEverything() {
  if (loading || !lbug) return;
  loading = true;
  loadRemoteButton.disabled = true;
  messageEl.textContent = "Descargando la muestra y construyendo el grafo en el navegador.";
  const failures = [];
  try {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador no ofrece DecompressionStream, necesario para leer los ficheros .gz.");
    }
    for (let index = 0; index < DATA_SOURCES.length; index += 1) {
      const source = DATA_SOURCES[index];
      try {
        const started = performance.now();
        const documents = {};
        for (let fileIndex = 0; fileIndex < SOURCE_FILES.length; fileIndex += 1) {
          const name = SOURCE_FILES[fileIndex];
          setStatus("Descargando " + name + " (" + (fileIndex + 1) + "/" + SOURCE_FILES.length + ")", "loading");
          await yieldToBrowser();
          documents[name] = await fetchCollection(source.base, name);
        }
        await buildGraph(documents);
        const counts = graphCounts();
        renderCounts(counts);
        const nodes = counts.slice(0, 3).reduce(function (sum, entry) { return sum + entry.total; }, 0);
        const edges = counts.slice(3).reduce(function (sum, entry) { return sum + entry.total; }, 0);
        setStatus("Grafo listo · " + formatCount(nodes) + " nodos y " + formatCount(edges) + " relaciones", "ready");
        messageEl.textContent = "Construido desde " + source.label + " en "
          + ((performance.now() - started) / 1000).toFixed(1) + " s.";
        document.querySelectorAll(".result").forEach(function (result) {
          result.replaceChildren();
          const empty = document.createElement("p");
          empty.className = "empty";
          empty.textContent = "Grafo cargado. Ejecuta la consulta para ver el resultado.";
          result.append(empty);
        });
        return;
      } catch (error) {
        failures.push(source.label + ": " + error.message);
      }
    }
    throw new Error(failures.join(" | "));
  } catch (error) {
    setStatus("No se pudo construir el grafo", "error");
    messageEl.textContent = "No se pudo descargar la muestra o construir el grafo. Detalle: " + error.message;
  } finally {
    loading = false;
    loadRemoteButton.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 * Ejecución y presentación de resultados
 * ------------------------------------------------------------------ */

function stripStringsAndComments(cypher) {
  return String(cypher)
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function isReadOnlyCypher(cypher) {
  return !WRITE_CLAUSES.test(stripStringsAndComments(cypher));
}

function isNode(value) {
  return Boolean(value) && typeof value === "object" && value._id && value._label && !value._src;
}

function isRelationship(value) {
  return Boolean(value) && typeof value === "object" && value._src && value._dst;
}

function isPath(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value._nodes) && Array.isArray(value._rels);
}

function internalId(reference) {
  return reference.table + ":" + reference.offset;
}

function nodeCaption(node) {
  const property = node.DisplayName || node.Title || node.TagName;
  if (property) return String(property).length > 40 ? String(property).slice(0, 40) + "…" : String(property);
  return node._label + " " + (node.Id !== undefined ? node.Id : "");
}

function collectGraphElements(rows) {
  const nodes = new Map();
  const edges = new Map();
  const visit = function (value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isPath(value)) {
      value._nodes.forEach(visit);
      value._rels.forEach(visit);
      return;
    }
    if (isNode(value)) {
      const id = internalId(value._id);
      if (!nodes.has(id)) nodes.set(id, value);
      return;
    }
    if (isRelationship(value)) {
      const id = internalId(value._id);
      if (!edges.has(id)) edges.set(id, value);
    }
  };
  rows.forEach(function (row) { Object.keys(row).forEach(function (key) { visit(row[key]); }); });
  return { nodes: nodes, edges: edges };
}

function destroyGraphs() {
  graphInstances.forEach(function (network) { network.destroy(); });
  graphInstances.clear();
}

function renderGraph(container, elements, resultId) {
  if (typeof window.vis === "undefined") return null;
  const previous = graphInstances.get(resultId);
  if (previous) {
    previous.destroy();
    graphInstances.delete(resultId);
  }
  const labels = new Set();
  const nodes = [];
  Array.from(elements.nodes.entries()).slice(0, GRAPH_NODE_LIMIT).forEach(function (entry) {
    const node = entry[1];
    labels.add(node._label);
    nodes.push({
      id: entry[0],
      label: nodeCaption(node),
      title: node._label,
      color: { background: LABEL_COLORS[node._label] || "#666", border: "#2b2620" },
      font: { color: "#fffdf8", size: 13 }
    });
  });
  const known = new Set(nodes.map(function (node) { return node.id; }));
  const edges = [];
  elements.edges.forEach(function (edge) {
    const from = internalId(edge._src);
    const to = internalId(edge._dst);
    if (!known.has(from) || !known.has(to)) return;
    edges.push({ from: from, to: to, label: edge._label, arrows: "to", color: { color: "#9a8f79" },
      font: { size: 10, color: "#6d675d", strokeWidth: 3, strokeColor: "#fffdf8" } });
  });
  const view = document.createElement("div");
  view.className = "graph-view";
  container.append(view);
  const network = new window.vis.Network(view, { nodes: nodes, edges: edges }, {
    nodes: { shape: "dot", size: 14 },
    edges: { smooth: { type: "dynamic" } },
    physics: { stabilization: { iterations: 120 }, barnesHut: { springLength: 130 } },
    interaction: { hover: true, tooltipDelay: 200 }
  });
  graphInstances.set(resultId, network);
  if (labels.size) {
    const legend = document.createElement("p");
    legend.className = "graph-legend";
    Array.from(labels).sort().forEach(function (label) {
      const item = document.createElement("span");
      item.style.setProperty("--swatch", LABEL_COLORS[label] || "#666");
      item.textContent = label;
      legend.append(item);
    });
    container.append(legend);
  }
  return { nodes: nodes.length, edges: edges.length, hidden: elements.nodes.size - nodes.length };
}

function truncateText(text) {
  return text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH) + "… [" + text.length + " caracteres]"
    : text;
}

// Los INT64 de Ladybug llegan como BigInt: hay que darles formato a mano.
function displayValue(value) {
  if (value === null || value === undefined) return { text: "null", isNull: true };
  if (typeof value === "bigint") return { text: value.toString(), isNull: false };
  if (isNode(value)) {
    const properties = Object.keys(value)
      .filter(function (key) { return key.charAt(0) !== "_"; })
      .map(function (key) { return key + ": " + displayValue(value[key]).text; })
      .join(", ");
    return { text: "(:" + value._label + " {" + truncateText(properties) + "})", isNull: false };
  }
  if (isRelationship(value)) return { text: "[:" + value._label + "]", isNull: false };
  if (isPath(value)) {
    return {
      text: value._nodes.map(function (node) { return nodeCaption(node); }).join(" → "),
      isNull: false
    };
  }
  if (Array.isArray(value)) {
    return { text: "[" + value.map(function (item) { return displayValue(item).text; }).join(", ") + "]", isNull: false };
  }
  if (value instanceof Date) return { text: value.toISOString(), isNull: false };
  if (typeof value === "object") {
    return { text: truncateText(JSON.stringify(value, function (key, item) {
      return typeof item === "bigint" ? item.toString() : item;
    })), isNull: false };
  }
  return { text: truncateText(String(value)), isNull: false };
}

function buildResultTable(columns, rows) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "results";
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
    columns.forEach(function (column) {
      const td = document.createElement("td");
      const display = displayValue(row[column]);
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

function renderResult(state) {
  const container = state.container;
  container.replaceChildren();
  if (state.check) {
    const check = document.createElement("p");
    check.className = "result-check " + state.check.kind;
    check.textContent = state.check.message;
    container.append(check);
  }
  const elements = collectGraphElements(state.rows);
  if (elements.nodes.size) {
    const drawn = renderGraph(container, elements, container.id);
    if (drawn && drawn.hidden > 0) {
      const note = document.createElement("p");
      note.className = "result-summary";
      note.textContent = "Se dibujan " + formatCount(drawn.nodes) + " nodos de "
        + formatCount(elements.nodes.size) + "; añade un LIMIT para ver menos.";
      container.append(note);
    }
  }
  const total = state.rows.length;
  const start = state.pageIndex * RESULT_PAGE_SIZE;
  const page = state.rows.slice(start, start + RESULT_PAGE_SIZE);
  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = total
    ? "Filas " + formatCount(start + 1) + "–" + formatCount(start + page.length) + " de " + formatCount(total) + "."
    : "Consulta ejecutada. 0 filas.";
  container.append(summary);
  if (page.length) container.append(buildResultTable(state.columns, page));

  if (total > RESULT_PAGE_SIZE) {
    const actions = document.createElement("div");
    actions.className = "result-actions";
    if (state.pageIndex > 0) {
      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "button small";
      previous.textContent = "Bloque anterior";
      previous.addEventListener("click", function () { state.pageIndex -= 1; renderResult(state); });
      actions.append(previous);
    }
    if (start + page.length < total) {
      const next = document.createElement("button");
      next.type = "button";
      next.className = "button small";
      next.textContent = "Siguientes " + RESULT_PAGE_SIZE + " filas";
      next.addEventListener("click", function () { state.pageIndex += 1; renderResult(state); });
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

function runCypher(cypher) {
  const result = connection.query(cypher);
  const results = Array.isArray(result) ? result : [result];
  const last = results[results.length - 1];
  return {
    columns: last.getColumnNames(),
    rows: last.getAllObjects()
  };
}

function canonicalValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return "int:" + value.toString();
  if (Array.isArray(value)) return "[" + value.map(canonicalValue).join(",") + "]";
  if (value instanceof Date) return "date:" + value.toISOString();
  if (typeof value === "object") {
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + canonicalValue(value[key]);
    }).join(",") + "}";
  }
  return typeof value + ":" + String(value);
}

function canonicalRow(row, columns) {
  return columns.map(function (column) { return canonicalValue(row[column]); }).join("\u001f");
}

function compareResults(mine, theirs) {
  if (mine.columns.length !== theirs.columns.length) {
    return {
      kind: "bad",
      message: "No coincide: tu consulta devuelve " + mine.columns.length + " columnas y la solución "
        + theirs.columns.length + ". Los nombres no importan; el número sí."
    };
  }
  if (mine.rows.length !== theirs.rows.length) {
    return {
      kind: "bad",
      message: "No coincide: tu consulta devuelve " + formatCount(mine.rows.length)
        + " filas y la solución " + formatCount(theirs.rows.length) + "."
    };
  }
  const yours = mine.rows.map(function (row) { return canonicalRow(row, mine.columns); });
  const reference = theirs.rows.map(function (row) { return canonicalRow(row, theirs.columns); });
  const firstDifference = yours.findIndex(function (row, index) { return row !== reference[index]; });
  if (firstDifference === -1) return { kind: "ok", message: "Coincide con la solución de referencia." };
  const sortedYours = yours.slice().sort();
  const sortedReference = reference.slice().sort();
  const sameRows = sortedYours.every(function (row, index) { return row === sortedReference[index]; });
  if (sameRows) {
    return {
      kind: "warn",
      message: "Mismas filas, distinto orden. Si el enunciado pide un orden concreto, añade el ORDER BY que falta."
    };
  }
  return {
    kind: "bad",
    message: "No coincide a partir de la fila " + formatCount(firstDifference + 1)
      + ". Compara tu resultado con el de la solución."
  };
}

function exerciseButtons(editorId) {
  return Array.from(document.querySelectorAll('[data-editor="' + editorId + '"]:not([data-locked])'));
}

function runExercise(editorId, resultId, compare) {
  const container = document.getElementById(resultId);
  if (!container) return;
  if (!connection) {
    showError(container, "El grafo todavía no está cargado.");
    return;
  }
  const exercise = exercisesByEditor.get(editorId);
  const cypher = getEditorValue(editorId).trim();
  if (!cypher) {
    showError(container, "Escribe una consulta antes de ejecutarla.");
    return;
  }
  if (cypher.split(/\r?\n/).every(function (line) { return !line.trim() || line.trim().startsWith("//"); })) {
    showError(container, "El editor sólo contiene comentarios. Quita «// » de las líneas de la solución para ejecutarla.");
    return;
  }
  if (compare && !canCheckExercise(exercise)) {
    showError(container, STATE_CHANGE_NOTE);
    return;
  }
  if (compare && !isReadOnlyCypher(cypher)) {
    showError(container, "Sólo se comprueban consultas de lectura: esta escribiría en el grafo.");
    return;
  }
  const buttons = exerciseButtons(editorId);
  buttons.forEach(function (button) { button.disabled = true; });
  container.replaceChildren();
  const waiting = document.createElement("p");
  waiting.className = "result-summary";
  waiting.textContent = compare ? "Comprobando…" : "Ejecutando…";
  container.append(waiting);
  window.setTimeout(function () {
    try {
      const mine = runCypher(cypher);
      const state = {
        container: container,
        columns: mine.columns,
        rows: mine.rows,
        pageIndex: 0,
        check: compare ? compareResults(mine, runCypher(exercise.solution)) : null
      };
      resultStates.set(resultId, state);
      renderResult(state);
    } catch (error) {
      showError(container, "Error de Cypher: " + (error && error.message ? error.message : String(error)));
    } finally {
      buttons.forEach(function (button) { button.disabled = false; });
    }
  }, 0);
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
renderSchemaSource();
showPageFromLocation();
editorModeNoteEl.textContent = hasCypherCodeMirror()
  ? "Resaltado Cypher activo. Ctrl/Cmd + Intro ejecuta la consulta."
  : "No se pudo cargar CodeMirror; los cuadros de texto siguen disponibles sin resaltado.";
loadRemoteButton.addEventListener("click", loadEverything);

async function initialize() {
  try {
    setStatus("Cargando el motor de grafos…", "loading");
    lbug = (await import(LBUG_URL)).default;
    await lbug.init();
    setStatus("Motor listo · Ladybug " + lbug.getVersion(), "loading");
    await loadEverything();
  } catch (error) {
    setStatus("No se pudo iniciar el motor de grafos", "error");
    messageEl.textContent = "No se pudo cargar Ladybug desde jsDelivr: "
      + (error && error.message ? error.message : String(error));
  }
}

initialize();
