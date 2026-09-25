import { PRACTICE_PAGES } from "./pages/index.js";
"use strict";
const DATA_URLS = [
  "https://raw.githubusercontent.com/dsevilla/bd2-data/main/es.stackoverflow/es.stackoverflow.db.xz.00",
  "https://raw.githubusercontent.com/dsevilla/bd2-data/main/es.stackoverflow/es.stackoverflow.db.xz.01"
];
const RELEASE_DB_URL = "https://github.com/dsevilla/bd2-data/releases/download/sqlite-backup-25-26/es.stackoverflow.db.gz";
const RESULT_PAGE_SIZE = 100;
// Tope de filas que se leen de cada lado al comprobar. La base completa puede
// devolver millones de filas y la comprobación no debe materializarlas.
const CHECK_ROW_LIMIT = 1000;
const STATE_CHANGE_NOTE = "No se puede comprobar: la consulta cambia el estado de la base.";
const WASM_BASE = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.2/";
const statusEl = document.getElementById("db-status");
const messageEl = document.getElementById("connection-result");
const pageNavigationEl = document.getElementById("page-navigation");
const pageTitleEl = document.getElementById("practice-page-title");
const pageDescriptionEl = document.getElementById("practice-page-description");
const editorModeNoteEl = document.getElementById("editor-mode-note");
const exerciseListEl = document.getElementById("exercise-list");
const loadRealButton = document.getElementById("load-real");
const loadReleaseButton = document.getElementById("load-release");
const loadDemoButton = document.getElementById("load-demo");
const localFileInput = document.getElementById("local-file");
const checkLinkButton = document.getElementById("check-link");
let SQLModule = null;
let database = null;
let loading = false;
let cachedCompressedParts = null;
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

function renderPracticePage(pageId) {
  const page = PRACTICE_PAGES.find(function (candidate) { return candidate.id === pageId; });
  if (!page || page.id === currentPageId) return;
  Array.from(activeResultStatements.keys()).forEach(clearResultStatement);
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
        mode: "text/x-mysql",
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

function createDemoDatabase() {
  const demo = new SQLModule.Database();
  demo.run("CREATE TABLE Posts (Id INTEGER PRIMARY KEY, PostTypeId INTEGER NOT NULL, CreationDate TEXT, Score INTEGER, OwnerUserId INTEGER, Title TEXT)");
  demo.run("CREATE TABLE Users (Id INTEGER PRIMARY KEY, DisplayName TEXT, Reputation INTEGER)");
  demo.run("INSERT INTO Posts VALUES (101, 1, '2025-01-04 10:00:00', 18, 1, '¿Cómo funciona un índice B-tree?'), (102, 1, '2025-02-12 12:30:00', 32, 2, '¿Cuándo conviene usar una clave compuesta?'), (103, 2, '2025-02-13 09:15:00', 12, 3, NULL), (104, 1, '2025-03-01 08:00:00', 32, 1, '¿Qué diferencia hay entre JOIN y subconsulta?'), (105, 2, '2025-03-02 14:20:00', 4, 2, NULL), (106, 1, '2025-03-11 16:45:00', 7, 3, '¿Cómo se interpreta EXPLAIN?')");
  demo.run("INSERT INTO Users VALUES (1, 'Lucía', 1250), (2, 'Mateo', 840), (3, 'Inés', 420)");
  return demo;
}

function replaceDatabase(nextDatabase, label) {
  Array.from(activeResultStatements.keys()).forEach(clearResultStatement);
  if (database) database.close();
  database = nextDatabase;
  setStatus(label, "ready");
  messageEl.textContent = "";
  document.querySelectorAll(".result").forEach(function (result) {
    result.innerHTML = '<p class="empty">Base cargada. Ejecuta la consulta para ver el resultado.</p>';
  });
}

function clearResultStatement(resultId) {
  const state = activeResultStatements.get(resultId);
  if (!state) return;
  if (state.statement) state.statement.free();
  activeResultStatements.delete(resultId);
}

function clearOtherResultStatements(keepResultId) {
  Array.from(activeResultStatements.entries()).forEach(function (entry) {
    const resultId = entry[0];
    const state = entry[1];
    if (resultId === keepResultId) return;
    clearResultStatement(resultId);
    state.container.innerHTML = '<p class="empty">Resultado liberado al ejecutar otra consulta.</p>';
  });
}

async function streamToBytes(stream, label) {
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
    return new Uint8Array(await new Response(countedStream).arrayBuffer());
  } catch (error) {
    throw new Error(label + " falló tras producir " + formatBytes(total) + " descomprimidos ("
      + error.name + ": " + error.message + ").");
  }
}

function readVli(bytes, offset) {
  let value = 0n;
  let shift = 0n;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value, next: cursor };
    shift += 7n;
  }
  throw new Error("Cabecera XZ incompleta al leer un entero variable.");
}

function inspectXzHeader(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0xfd || bytes[1] !== 0x37 || bytes[2] !== 0x7a
      || bytes[3] !== 0x58 || bytes[4] !== 0x5a || bytes[5] !== 0x00) {
    throw new Error("El primer fragmento no empieza con la firma de un flujo XZ.");
  }
  const headerSize = (bytes[12] + 1) * 4;
  const flags = bytes[13];
  let cursor = 14;
  if (flags & 0x40) cursor = readVli(bytes, cursor).next;
  if (flags & 0x80) cursor = readVli(bytes, cursor).next;
  const filters = [];
  for (let index = 0; index <= (flags & 0x03); index += 1) {
    const id = readVli(bytes, cursor);
    const size = readVli(bytes, id.next);
    const properties = bytes.slice(size.next, size.next + Number(size.value));
    cursor = size.next + Number(size.value);
    let description = "filtro 0x" + id.value.toString(16);
    if (id.value === 0x21n && properties.length > 0) {
      const property = properties[0];
      const dictionary = property === 40 ? 0xffffffff : (2 + (property & 1)) * 2 ** (Math.floor(property / 2) + 11);
      description = "LZMA2, diccionario " + formatBytes(dictionary);
    }
    filters.push(description);
  }
  if (cursor > 12 + headerSize) throw new Error("La cabecera del bloque XZ es inconsistente.");
  return filters.join(", ");
}

function getXzUncompressedSize(bytes) {
  let footerEnd = bytes.length;
  while (footerEnd > 0 && bytes[footerEnd - 1] === 0) footerEnd -= 1;
  const footerStart = footerEnd - 12;
  if (footerStart < 0 || bytes[footerStart + 10] !== 0x59 || bytes[footerStart + 11] !== 0x5a) {
    throw new Error("No se encuentra el pie del flujo XZ al final de los fragmentos unidos.");
  }
  const backwardSize = (bytes[footerStart + 4]
    | (bytes[footerStart + 5] << 8)
    | (bytes[footerStart + 6] << 16)
    | (bytes[footerStart + 7] << 24)) >>> 0;
  const indexSize = (backwardSize + 1) * 4;
  const indexStart = footerStart - indexSize;
  if (indexStart < 0 || bytes[indexStart] !== 0) throw new Error("El índice XZ final no es válido.");
  let cursor = indexStart + 1;
  const records = readVli(bytes, cursor);
  cursor = records.next;
  let totalUncompressed = 0n;
  for (let record = 0n; record < records.value; record += 1n) {
    const unpaddedSize = readVli(bytes, cursor);
    const uncompressedSize = readVli(bytes, unpaddedSize.next);
    cursor = uncompressedSize.next;
    totalUncompressed += uncompressedSize.value;
  }
  if (totalUncompressed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("El tamaño descomprimido supera el rango seguro de JavaScript.");
  return Number(totalUncompressed);
}

function decompressXzInWorker(compressedBytes, expectedSize) {
  return new Promise(function (resolve, reject) {
    const worker = new Worker(new URL("./xz-worker.js", document.baseURI), { type: "module" });
    let settled = false;
    function finish(error, buffer) {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (error) reject(error);
      else resolve(buffer);
    }
    worker.onmessage = function (event) {
      const result = event.data;
      if (!result || result.ok !== true || !(result.buffer instanceof ArrayBuffer)) {
        finish(new Error(result && result.error ? result.error : "El worker no devolvió el SQLite descomprimido."));
        return;
      }
      if (result.buffer.byteLength !== expectedSize) {
        finish(new Error("XZ devolvió " + formatBytes(result.buffer.byteLength)
          + "; se esperaban " + formatBytes(expectedSize) + "."));
        return;
      }
      finish(null, result.buffer);
    };
    worker.onerror = function (event) {
      finish(new Error("Falló el worker de XZ: " + (event.message || "error desconocido")));
    };
    try {
      worker.postMessage({ buffer: compressedBytes.buffer, expectedSize: expectedSize }, [compressedBytes.buffer]);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function readCompressedFile(file) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Este navegador no ofrece DecompressionStream. Usa la base .db ya descomprimida.");
  }
  return streamToBytes(file.stream().pipeThrough(new DecompressionStream("gzip")), "Descomprimiendo fichero");
}

async function downloadRemoteParts(urls) {
  const parts = [];
  let totalDownloaded = 0;
  const rangeSize = 8 * 1024 * 1024;
  for (let partIndex = 0; partIndex < urls.length; partIndex += 1) {
    setStatus("Conectando con GitHub · fragmento " + (partIndex + 1) + "/" + urls.length, "loading");
    const probe = await fetch(urls[partIndex], { mode: "cors" });
    if (!probe.ok) throw new Error("GitHub respondió HTTP " + probe.status + " al comprobar el fragmento " + (partIndex + 1) + ".");
    if (!probe.body) throw new Error("El navegador no permitió leer el fragmento " + (partIndex + 1) + ".");
    const declaredSize = Number(probe.headers.get("content-length")) || 0;
    const probeReader = probe.body.getReader();
    await probeReader.read();
    await probeReader.cancel();
    if (!declaredSize) throw new Error("GitHub no expuso el tamaño del fragmento " + (partIndex + 1) + ".");
    const chunks = [];
    let downloadedFromPart = 0;
    for (let start = 0; start < declaredSize; start += rangeSize) {
      const end = Math.min(start + rangeSize - 1, declaredSize - 1);
      const response = await fetch(urls[partIndex], {
        mode: "cors",
        headers: { Range: "bytes=" + start + "-" + end }
      });
      if (response.status !== 206) {
        throw new Error("GitHub no aceptó el rango " + start + "–" + end + " del fragmento " + (partIndex + 1)
          + " (HTTP " + response.status + ").");
      }
      let bytes;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        throw new Error("Descarga interrumpida en el fragmento " + (partIndex + 1) + ", bytes " + start + "–" + end
          + " (" + error.name + ": " + error.message + ").");
      }
      const expectedSize = end - start + 1;
      if (bytes.byteLength !== expectedSize) {
        throw new Error("El rango " + start + "–" + end + " del fragmento " + (partIndex + 1) + " devolvió "
          + formatBytes(bytes.byteLength) + "; se esperaban " + formatBytes(expectedSize) + ".");
      }
      chunks.push(bytes);
      totalDownloaded += bytes.byteLength;
      downloadedFromPart += bytes.byteLength;
      setStatus("Descargando fragmento " + (partIndex + 1) + "/" + urls.length + " · "
        + formatBytes(downloadedFromPart) + " de " + formatBytes(declaredSize)
        + " (" + formatBytes(totalDownloaded) + " en total)", "loading");
    }
    parts.push(new Blob(chunks, { type: "application/octet-stream" }));
  }
  return new Blob(parts, { type: "application/x-xz" });
}

function setLoadingControls(isLoading) {
  loadRealButton.disabled = isLoading;
  loadReleaseButton.disabled = isLoading;
  loadDemoButton.disabled = isLoading;
  checkLinkButton.disabled = isLoading;
  localFileInput.disabled = isLoading;
}

async function loadRemoteDatabase() {
  if (loading || !SQLModule) return;
  loading = true;
  setLoadingControls(true);
  messageEl.textContent = "Descargando los fragmentos .00 y .01 de raw.githubusercontent.com y descomprimiéndolos como un único flujo XZ.";
  setStatus("Descargando base real…", "loading");
  let phase = "descarga de fragmentos XZ";
  try {
    let compressedParts = cachedCompressedParts || await downloadRemoteParts(DATA_URLS);
    cachedCompressedParts = compressedParts;
    phase = "descompresión XZ";
    setStatus("Preparando los fragmentos para XZ · " + formatBytes(compressedParts.size), "loading");
    let compressedBytes = new Uint8Array(await compressedParts.arrayBuffer());
    const expectedSize = getXzUncompressedSize(compressedBytes);
    setStatus("Descomprimiendo " + formatBytes(expectedSize) + " en un worker", "loading");
    cachedCompressedParts = null;
    compressedParts = null;
    let decompressedBuffer = await decompressXzInWorker(compressedBytes, expectedSize);
    compressedBytes = null;
    phase = "apertura de SQLite";
    setStatus("Abriendo SQLite · " + formatBytes(decompressedBuffer.byteLength), "loading");
    let bytes = new Uint8Array(decompressedBuffer);
    const nextDatabase = new SQLModule.Database(bytes);
    const databaseSize = bytes.byteLength;
    bytes = null;
    decompressedBuffer = null;
    replaceDatabase(nextDatabase, "Stack Overflow cargado · " + formatBytes(databaseSize));
    messageEl.textContent = "Carga correcta: la base completa se descargó del repositorio y está lista para consultar.";
  } catch (error) {
    setStatus("No se pudo cargar la base real", "error");
    const errorDetails = error instanceof Error
      ? (error.name || "Error") + ": " + error.message + (error.stack ? "\n" + error.stack : "")
      : "Excepción no estándar: " + String(error);
    const details = error instanceof TypeError
      ? "El navegador no pudo leer los fragmentos remotos (posible restricción CORS o fallo de red). "
        + "Fase: " + phase + ". Detalle: " + errorDetails
      : errorDetails + "\nFase: " + phase;
    messageEl.textContent = "No se pudo cargar automáticamente la base desde los .xz. La muestra pequeña sigue disponible; puedes abrir un fichero local o probar la descarga .db.gz de la release. " + details;
  } finally {
    loading = false;
    setLoadingControls(false);
  }
}

async function loadReleaseDatabase() {
  if (loading || !SQLModule) return;
  loading = true;
  setLoadingControls(true);
  messageEl.textContent = "Descargando la copia comprimida de la release de GitHub.";
  setStatus("Descargando Stack Overflow desde la release…", "loading");
  let bytes = null;
  try {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador no ofrece DecompressionStream para abrir el fichero .gz.");
    }
    const response = await fetch(RELEASE_DB_URL, { mode: "cors" });
    if (!response.ok) throw new Error("La release respondió HTTP " + response.status + ".");
    if (!response.body) throw new Error("El navegador no permitió leer el fichero .db.gz.");
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    bytes = await streamToBytes(stream, "Descargando y descomprimiendo la release");
    setStatus("Abriendo SQLite · " + formatBytes(bytes.byteLength), "loading");
    const nextDatabase = new SQLModule.Database(bytes);
    const databaseSize = bytes.byteLength;
    bytes = null;
    replaceDatabase(nextDatabase, "Stack Overflow cargado · " + formatBytes(databaseSize));
    messageEl.textContent = "Carga correcta: la base se descargó y abrió desde la release.";
  } catch (error) {
    setStatus("No se pudo cargar la release", "error");
    messageEl.textContent = "Falló la descarga alternativa .db.gz: " + error.message
      + " La muestra pequeña sigue disponible; puedes descargar el fichero con el enlace y abrirlo localmente.";
  } finally {
    bytes = null;
    loading = false;
    setLoadingControls(false);
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

function showStatementPage(state) {
  const rows = [];
  if (state.pendingRow !== null) {
    rows.push(state.pendingRow);
    state.pendingRow = null;
    state.rowsRead += 1;
  }
  while (rows.length < RESULT_PAGE_SIZE && state.statement.step()) {
    rows.push(state.statement.get());
    state.rowsRead += 1;
  }
  if (rows.length === RESULT_PAGE_SIZE && state.statement.step()) {
    state.pendingRow = state.statement.get();
  }
  if (rows.length === 0) {
    state.statement.free();
    state.statement = null;
    activeResultStatements.delete(state.resultId);
  }
  renderResultTable(state.container, state.columns, rows);
  if (state.statement && !state.pendingRow && (state.pageIndex === 0 || !state.canRewind)) {
    state.statement.free();
    state.statement = null;
    activeResultStatements.delete(state.resultId);
  }
}

function showNextPage(state) {
  if (!state.pendingRow) return;
  try {
    state.pageIndex += 1;
    showStatementPage(state);
  } catch (error) {
    showPageError(state, error);
  }
}

function showPreviousPage(state) {
  if (!state.canRewind || state.pageIndex === 0) return;
  const targetPage = state.pageIndex - 1;
  const targetOffset = targetPage * RESULT_PAGE_SIZE;
  try {
    state.statement.reset();
    state.pendingRow = null;
    state.rowsRead = 0;
    while (state.rowsRead < targetOffset && state.statement.step()) state.rowsRead += 1;
    state.pageIndex = targetPage;
    showStatementPage(state);
  } catch (error) {
    showPageError(state, error);
  }
}

function showPageError(state, error) {
  clearResultStatement(state.resultId);
  const message = document.createElement("p");
  message.className = "result-summary error";
  message.textContent = "Error al leer más filas: " + error.message;
  state.container.replaceChildren(message);
}

function hasMultipleStatements(sql) {
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  let endedStatement = false;
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (current === quote) {
        if (next === quote && quote !== "]") index += 1;
        else quote = "";
      }
      continue;
    }
    if (current === "-" && next === "-") { lineComment = true; index += 1; continue; }
    if (current === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (current === "'" || current === '"' || current === "`") { if (endedStatement) return true; quote = current; continue; }
    if (current === "[") { if (endedStatement) return true; quote = "]"; continue; }
    if (current === ";") { endedStatement = true; continue; }
    if (!/\s/.test(current) && endedStatement) return true;
  }
  return false;
}

function runNonRowQuery(container, statement) {
  statement.step();
  statement.free();
  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = "Consulta ejecutada. Filas modificadas: " + database.getRowsModified() + ".";
  container.replaceChildren(summary);
}

function exerciseButtons(editorId) {
  return Array.from(document.querySelectorAll('[data-editor="' + editorId + '"]:not([data-locked])'));
}

function setButtonsDisabled(buttons, disabled) {
  buttons.forEach(function (button) { button.disabled = disabled; });
}

// Lee como mucho CHECK_ROW_LIMIT filas y libera la sentencia; no toca la
// paginación de la consulta que el alumno tenga abierta.
function readLimitedRows(sqlText) {
  const statement = database.prepare(sqlText);
  try {
    const columns = statement.getColumnNames();
    const rows = [];
    let truncated = false;
    while (statement.step()) {
      if (rows.length === CHECK_ROW_LIMIT) {
        truncated = true;
        break;
      }
      rows.push(statement.get());
    }
    return { columns: columns, rows: rows, truncated: truncated };
  } finally {
    statement.free();
  }
}

// El tipo forma parte del valor: el número 1 y la cadena "1" no son la misma
// respuesta aunque se impriman igual.
function canonicalCell(value) {
  if (value === null) return "NULL";
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

function checkQuery(editorId, resultId) {
  const container = document.getElementById(resultId);
  clearOtherResultStatements(resultId);
  clearResultStatement(resultId);
  const exercise = exercisesByEditor.get(editorId);
  if (!database) {
    container.innerHTML = '<p class="result-summary error">SQLite aún no está listo.</p>';
    return;
  }
  if (!canCheckExercise(exercise)) {
    container.innerHTML = '<p class="result-summary error">' + STATE_CHANGE_NOTE + '</p>';
    return;
  }
  const sqlText = getEditorValue(editorId).trim();
  if (!sqlText) {
    container.innerHTML = '<p class="result-summary error">Escribe una consulta antes de comprobarla.</p>';
    return;
  }
  if (sqlText.split(/\r?\n/).every(function (line) { return !line.trim() || line.trim().startsWith("--"); })) {
    container.innerHTML = '<p class="result-summary error">El editor solo contiene comentarios. Quita «-- » de las líneas de la solución para ejecutarla.</p>';
    return;
  }
  if (!isReadOnlyStatement(sqlText)) {
    container.innerHTML = '<p class="result-summary error">Solo se comprueban consultas de lectura: esta sentencia cambiaría el estado de la base.</p>';
    return;
  }
  const buttons = exerciseButtons(editorId);
  setButtonsDisabled(buttons, true);
  container.innerHTML = '<p class="result-summary">Comprobando…</p>';
  window.setTimeout(function () {
    try {
      if (!container.isConnected || !exerciseListEl.contains(container)) return;
      if (hasMultipleStatements(sqlText)) {
        throw new Error("Ejecuta una sola sentencia cada vez para poder compararla con la solución.");
      }
      const mine = readLimitedRows(sqlText);
      const theirs = readLimitedRows(exercise.solution);
      renderCheckResult(container, mine, compareResults(mine, theirs));
    } catch (error) {
      container.replaceChildren();
      const message = document.createElement("p");
      message.className = "result-summary error";
      message.textContent = "Error SQL: " + error.message;
      container.append(message);
    } finally {
      setButtonsDisabled(buttons, false);
    }
  }, 0);
}

function runQuery(editorId, resultId) {
  const container = document.getElementById(resultId);
  clearOtherResultStatements(resultId);
  clearResultStatement(resultId);
  if (!database) {
    container.innerHTML = '<p class="result-summary error">SQLite aún no está listo.</p>';
    return;
  }
  const sqlText = getEditorValue(editorId).trim();
  if (!sqlText) {
    container.innerHTML = '<p class="result-summary error">Escribe una consulta antes de ejecutarla.</p>';
    return;
  }
  if (sqlText.split(/\r?\n/).every(function (line) { return !line.trim() || line.trim().startsWith("--"); })) {
    container.innerHTML = '<p class="result-summary error">El editor solo contiene comentarios. Quita «-- » de las líneas de la solución para ejecutarla.</p>';
    return;
  }
  const buttons = exerciseButtons(editorId);
  setButtonsDisabled(buttons, true);
  container.innerHTML = '<p class="result-summary">Ejecutando…</p>';
  window.setTimeout(function () {
    let statement = null;
    try {
      if (!container.isConnected || !exerciseListEl.contains(container)) return;
      if (hasMultipleStatements(sqlText)) {
        throw new Error("Ejecuta una sola sentencia cada vez para poder paginar sus resultados.");
      }
      statement = database.prepare(sqlText);
      const columns = statement.getColumnNames();
      if (!columns.length) {
        runNonRowQuery(container, statement);
        statement = null;
        return;
      }
      const firstSql = sqlText.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
      const state = {
        resultId: resultId,
        container: container,
        statement: statement,
        columns: columns,
        pendingRow: null,
        pageIndex: 0,
        rowsRead: 0,
        canRewind: /^SELECT\b/i.test(firstSql)
      };
      activeResultStatements.set(resultId, state);
      statement = null;
      showStatementPage(state);
    } catch (error) {
      if (statement) statement.free();
      clearResultStatement(resultId);
      container.replaceChildren();
      const message = document.createElement("p");
      message.className = "result-summary error";
      message.textContent = "Error SQL: " + error.message;
      container.append(message);
    } finally {
      setButtonsDisabled(buttons, false);
    }
  }, 0);
}

async function checkRemoteLink() {
  if (loading) return;
  loading = true;
  setLoadingControls(true);
  messageEl.textContent = "Probando una petición GET CORS a cada URL; se cancela después del primer bloque leído.";
  try {
    const results = [];
    for (let index = 0; index < DATA_URLS.length; index += 1) {
      const response = await fetch(DATA_URLS[index], { mode: "cors" });
      if (!response.ok) throw new Error("El fragmento " + (index + 1) + " respondió HTTP " + response.status + ".");
      if (!response.body) throw new Error("No se puede leer el cuerpo del fragmento " + (index + 1) + ".");
      const reader = response.body.getReader();
      const firstChunk = await reader.read();
      await reader.cancel();
      const signature = firstChunk.value
        ? Array.from(firstChunk.value.subarray(0, 6)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join(" ")
        : "vacío";
      results.push("fragmento " + (index + 1) + ": HTTP " + response.status + ", "
        + (firstChunk.value ? formatBytes(firstChunk.value.byteLength) + " leídos, bytes " + signature : "sin contenido")
        + (response.headers.get("content-length") ? ", total " + formatBytes(Number(response.headers.get("content-length"))) : ""));
    }
    const rangeResponse = await fetch(DATA_URLS[0], {
      mode: "cors",
      headers: { Range: "bytes=0-127" }
    });
    if (!rangeResponse.ok) throw new Error("La prueba de descarga por rangos respondió HTTP " + rangeResponse.status + ".");
    const rangeReader = rangeResponse.body.getReader();
    const rangeChunk = await rangeReader.read();
    await rangeReader.cancel();
    const headerInfo = rangeChunk.value ? inspectXzHeader(rangeChunk.value) : "sin contenido";
    results.push("cabecera XZ: " + headerInfo + "; HTTP " + rangeResponse.status + ", "
      + (rangeChunk.value ? formatBytes(rangeChunk.value.byteLength) + " leídos" : "sin contenido")
      + (rangeResponse.headers.get("content-range") ? " (" + rangeResponse.headers.get("content-range") + ")" : ""));
    messageEl.textContent = "CORS funciona para los dos GET de raw.githubusercontent.com (" + results.join("; ") + ").";
  } catch (error) {
    messageEl.textContent = error instanceof TypeError
      ? "Falló la lectura CORS de un fragmento: " + error.message
      : error.message;
  } finally {
    loading = false;
    setLoadingControls(false);
  }
}

async function loadLocalFile(file) {
  if (!file || !SQLModule || loading) return;
  loading = true;
  setLoadingControls(true);
  messageEl.textContent = "Leyendo " + file.name + ".";
  let bytes = null;
  try {
    if (file.name.toLowerCase().endsWith(".gz")) {
      bytes = await readCompressedFile(file);
    } else {
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    setStatus("Abriendo SQLite · " + formatBytes(bytes.byteLength), "loading");
    const nextDatabase = new SQLModule.Database(bytes);
    const databaseSize = bytes.byteLength;
    bytes = null;
    replaceDatabase(nextDatabase, "Base local cargada · " + formatBytes(databaseSize));
    messageEl.textContent = "Carga correcta: se abrió " + file.name + ".";
  } catch (error) {
    setStatus("No se pudo abrir el fichero", "error");
    messageEl.textContent = error.message;
  } finally {
    bytes = null;
    loading = false;
    setLoadingControls(false);
    localFileInput.value = "";
  }
}

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
  ? "Resaltado SQL activo · modo MySQL 8. Ctrl/Cmd + Intro ejecuta la consulta."
  : "No se pudo cargar CodeMirror; los cuadros de texto siguen disponibles sin resaltado.";
loadRealButton.addEventListener("click", loadRemoteDatabase);
loadReleaseButton.addEventListener("click", loadReleaseDatabase);
loadDemoButton.addEventListener("click", function () {
  if (!SQLModule || loading) return;
  replaceDatabase(createDemoDatabase(), "Muestra pequeña activa");
});
checkLinkButton.addEventListener("click", checkRemoteLink);
localFileInput.addEventListener("change", function () {
  loadLocalFile(localFileInput.files && localFileInput.files[0]);
});

async function initialize() {
  try {
    if (typeof initSqlJs !== "function") throw new Error("No se pudo cargar sql.js desde cdnjs.");
    SQLModule = await initSqlJs({ locateFile: function (filename) { return WASM_BASE + filename; } });
    database = createDemoDatabase();
    setStatus("Intentando cargar la base completa…", "loading");
    loadRealButton.disabled = false;
    loadReleaseButton.disabled = false;
    loadDemoButton.disabled = false;
    checkLinkButton.disabled = false;
    loadRemoteDatabase();
  } catch (error) {
    setStatus("No se pudo iniciar SQLite", "error");
    messageEl.textContent = error.message;
  }
}

initialize();
