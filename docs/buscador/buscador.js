// Buscador del sitio de la asignatura.
//
// La base de datos (SQLite con un índice FTS5, ~650 kB con gzip) va dentro de
// la propia página, en base64 (<script id="bd-indice">), junto con la lista de
// documentos (<script id="documentos-indice">); la escribe buscador.py en el CI.
// Aquí se descomprime, se carga en memoria con SQLite compilado a WebAssembly
// (vendor/, el paquete oficial @sqlite.org/sqlite-wasm) y cada consulta es local.
// Las miniaturas (miniaturas/*.jpg) son imágenes aparte y sólo se piden las de
// los documentos que se muestran.
//
// Sintaxis (la misma que el buscador del repositorio de la asignatura):
//   palabras sueltas       todas en el mismo documento (en cualquier diapositiva o sección)
//   "frase exacta"         las palabras seguidas
//   prefijo*               palabras que empiezan así
//   a OR b                 cualquiera de los dos grupos
//   -palabra, -"frase"     documentos que no la contienen
// Sin distinguir mayúsculas ni acentos.
import sqlite3InitModule from "./vendor/index.mjs";

{
  const TIPOS = {
    transparencias: "Transparencias",
    cuaderno: "Cuaderno",
    pagina: "Página",
  };
  const FRAGMENTOS_POR_DOCUMENTO = 3;
  // Se piden algunos más para descartar los de una misma sección partida en varios trozos.
  const CANDIDATOS_POR_DOCUMENTO = 6;

  const $ = (selector) => document.querySelector(selector);
  const formulario = $("#formulario");
  const entrada = $("#q");
  const estado = $("#estado");
  const filtros = $("#filtros");
  const resultados = $("#resultados");

  let indice = null;
  let bd = null;
  let tipoActivo = "todos";
  let ultimos = [];

  // ── datos ────────────────────────────────────────────────────────────────
  function cargarIndice() {
    if (indice === null) {
      indice = JSON.parse($("#documentos-indice").textContent);
      indice.porId = new Map(indice.documentos.map((doc) => [doc.id, doc]));
    }
    return indice;
  }

  // Base64 → gzip → bytes de la base de datos → SQLite en memoria (sólo lectura).
  async function baseDeDatos() {
    if (bd === null) {
      const base64 = $("#bd-indice").textContent.replace(/\s+/g, "");
      const comprimida = await fetch("data:application/gzip;base64," + base64);
      const descomprimida = comprimida.body.pipeThrough(new DecompressionStream("gzip"));
      const bytes = new Uint8Array(await new Response(descomprimida).arrayBuffer());
      const sqlite3 = await sqlite3InitModule();
      const db = new sqlite3.oo1.DB();
      const puntero = sqlite3.wasm.allocFromTypedArray(bytes);
      db.checkRc(
        sqlite3.capi.sqlite3_deserialize(
          db.pointer,
          "main",
          puntero,
          bytes.byteLength,
          bytes.byteLength,
          sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY,
        ),
      );
      bd = db;
    }
    return bd;
  }

  // ── consulta ─────────────────────────────────────────────────────────────
  // Devuelve {grupos, negados}: grupos unidos por OR, cada uno una lista de
  // átomos que deben estar todos (AND); cada átomo es ya una expresión FTS5
  // entre comillas, así que ningún carácter de la consulta es sintaxis de FTS5.
  function analizar(consulta) {
    const grupos = [[]];
    const negados = [];
    for (const m of consulta.matchAll(/(-?)"([^"]*)"(\*?)|(\S+)/g)) {
      let negado;
      let texto;
      let prefijo;
      if (m[2] !== undefined) {
        negado = m[1] === "-";
        texto = m[2];
        prefijo = m[3] === "*";
      } else {
        texto = m[4];
        if (texto === "OR") {
          if (grupos[grupos.length - 1].length) grupos.push([]);
          continue;
        }
        negado = texto.length > 1 && texto.startsWith("-");
        if (negado) texto = texto.slice(1);
        prefijo = texto.endsWith("*");
        texto = texto.replace(/\*+$/, "");
      }
      if (!/[\p{L}\p{N}]/u.test(texto)) continue;
      const atomo = '"' + texto.replaceAll('"', '""') + '"' + (prefijo ? "*" : "");
      (negado ? negados : grupos[grupos.length - 1]).push(atomo);
    }
    return { grupos: grupos.filter((g) => g.length), negados };
  }

  // La lógica se evalúa por documento: «cassandra quorum» encuentra unas
  // transparencias con cada palabra en una diapositiva distinta. Después se
  // ordenan por su mejor trozo (BM25, con el título del trozo pesando más).
  async function buscar(consulta) {
    const { grupos, negados } = analizar(consulta);
    if (!grupos.length) return null;
    const db = await baseDeDatos();

    // El rowid de cada trozo es documento * rowid_doc + orden: el documento sale
    // del índice FTS sin leer la tabla de trozos, que lleva todo el texto.
    const porDocumento = cargarIndice().rowid_doc;
    const docsDe = new Map();
    for (const atomo of new Set([...grupos.flat(), ...negados])) {
      const filas = db.selectObjects("SELECT DISTINCT rowid / ? AS doc FROM fts WHERE fts MATCH ?", [
        porDocumento,
        atomo,
      ]);
      docsDe.set(atomo, new Set(filas.map((f) => f.doc)));
    }
    const validos = new Set();
    for (const grupo of grupos) {
      let comunes = null;
      for (const atomo of grupo) {
        const docs = docsDe.get(atomo);
        comunes = comunes === null ? new Set(docs) : new Set([...comunes].filter((d) => docs.has(d)));
      }
      comunes.forEach((d) => validos.add(d));
    }
    negados.forEach((atomo) => docsDe.get(atomo).forEach((d) => validos.delete(d)));
    if (!validos.size) return [];

    // Primero sólo la puntuación de cada trozo (lee el índice, no el texto);
    // después el texto y el fragmento de los pocos trozos que se van a mostrar.
    const expresion = [...new Set(grupos.flat())].join(" OR ");
    const puntuados = db.selectObjects(
      "SELECT rowid AS id, bm25(fts, 4.0, 1.0) AS puntos FROM fts WHERE fts MATCH ? ORDER BY puntos",
      [expresion],
    );
    const porDoc = new Map();
    const mostrar = [];
    for (const fila of puntuados) {
      const doc = Math.floor(fila.id / porDocumento);
      if (!validos.has(doc)) continue;
      if (!porDoc.has(doc)) {
        porDoc.set(doc, { doc: indice.porId.get(doc), puntos: fila.puntos, trozos: [], total: 0 });
      }
      const r = porDoc.get(doc);
      r.total += 1;
      if (r.trozos.length < CANDIDATOS_POR_DOCUMENTO) {
        r.trozos.push(fila);
        mostrar.push(fila.id);
      }
    }
    if (mostrar.length) {
      const textos = db.selectObjects(
        `SELECT t.id AS id, t.ancla AS ancla, t.titulo AS titulo,
                snippet(fts, -1, char(1), char(2), '…', 20) AS fragmento
           FROM fts JOIN trozos t ON t.id = fts.rowid
          WHERE fts MATCH ? AND fts.rowid IN (${mostrar.map(() => "?").join(",")})`,
        [expresion, ...mostrar],
      );
      const porId = new Map(textos.map((t) => [t.id, t]));
      for (const r of porDoc.values()) {
        const vistos = new Set();
        r.trozos = r.trozos
          .map((f) => porId.get(f.id))
          .filter((t) => {
            const clave = t ? `${t.ancla}\u0000${t.titulo}` : null;
            if (clave === null || vistos.has(clave)) return false;
            vistos.add(clave);
            return true;
          })
          .slice(0, FRAGMENTOS_POR_DOCUMENTO);
      }
    }
    // Un documento que sólo cumple por un átomo de otro grupo OR sin trozo
    // propio en esta consulta (raro) sale al final, sin fragmentos.
    for (const d of validos) {
      if (!porDoc.has(d)) porDoc.set(d, { doc: indice.porId.get(d), puntos: 0, trozos: [], total: 0 });
    }
    return [...porDoc.values()].sort((a, b) => a.puntos - b.puntos);
  }

  // ── presentación ─────────────────────────────────────────────────────────
  const escapar = (texto) =>
    texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // El fragmento llega con \x01 y \x02 alrededor de cada coincidencia: se escapa
  // todo y sólo entonces se convierten en <mark>.
  const resaltar = (fragmento) =>
    escapar(fragmento).replaceAll("\u0001", "<mark>").replaceAll("\u0002", "</mark>");

  function enlaceTrozo(doc, trozo) {
    if (doc.colab) {
      const ancla = trozo.ancla.startsWith("#scrollTo=") ? trozo.ancla : "";
      return { href: doc.colab + ancla, rotulo: trozo.titulo || "Abrir en Colab", externo: true };
    }
    if (doc.tipo === "transparencias") {
      const numero = trozo.ancla.slice(1);
      const titulo = trozo.titulo ? ` · ${trozo.titulo}` : "";
      return { href: doc.url + trozo.ancla, rotulo: `Diapositiva ${numero}${titulo}`, externo: false };
    }
    return { href: doc.url + trozo.ancla, rotulo: trozo.titulo || doc.titulo, externo: false };
  }

  const atributosExterno = (externo) => (externo ? ' target="_blank" rel="noopener noreferrer"' : "");

  function miniatura(doc, href, externo) {
    if (!doc.miniatura) return `<a class="miniatura vacia" href="${escapar(href)}"${atributosExterno(externo)} aria-hidden="true" tabindex="-1"></a>`;
    return `<a class="miniatura miniatura-${doc.tipo}" href="${escapar(href)}"${atributosExterno(externo)} aria-hidden="true" tabindex="-1">
      <img src="${escapar(doc.miniatura)}" alt="" loading="lazy"></a>`;
  }

  function tarjeta(r) {
    const doc = r.doc;
    const externo = Boolean(doc.colab);
    const fragmentos = r.trozos
      .map((t) => {
        const enlace = enlaceTrozo(doc, t);
        return `<li><a href="${escapar(enlace.href)}"${atributosExterno(enlace.externo)}>${escapar(enlace.rotulo)}</a>
          <p>${resaltar(t.fragmento)}</p></li>`;
      })
      .join("");
    const mas = r.total > r.trozos.length ? ` · ${r.total} ${doc.tipo === "transparencias" ? "diapositivas" : "secciones"}` : "";
    const colab = doc.colab
      ? `<a class="boton" href="${escapar(doc.colab)}" target="_blank" rel="noopener noreferrer">Abrir en Colab</a>`
      : "";
    return `<li class="resultado">
      ${miniatura(doc, doc.url, externo)}
      <div class="detalle">
        <p class="tipo">${TIPOS[doc.tipo] || doc.tipo}${mas}</p>
        <h2><a href="${escapar(doc.url)}"${atributosExterno(externo)}>${escapar(doc.titulo)}</a></h2>
        <ul class="fragmentos">${fragmentos}</ul>
        ${colab}
      </div>
    </li>`;
  }

  function pintarFiltros(lista) {
    const cuenta = new Map();
    lista.forEach((r) => cuenta.set(r.doc.tipo, (cuenta.get(r.doc.tipo) || 0) + 1));
    if (cuenta.size < 2) {
      filtros.hidden = true;
      tipoActivo = "todos";
      return;
    }
    const opciones = [["todos", "Todo", lista.length], ...[...cuenta].map(([t, n]) => [t, TIPOS[t] || t, n])];
    if (!opciones.some(([t]) => t === tipoActivo)) tipoActivo = "todos";
    filtros.innerHTML = opciones
      .map(
        ([t, rotulo, n]) =>
          `<button type="button" data-tipo="${t}" aria-pressed="${t === tipoActivo}">${escapar(rotulo)} <span>${n}</span></button>`,
      )
      .join("");
    filtros.hidden = false;
  }

  function pintar() {
    const visibles = tipoActivo === "todos" ? ultimos : ultimos.filter((r) => r.doc.tipo === tipoActivo);
    resultados.innerHTML = visibles.map(tarjeta).join("");
  }

  function pintarCatalogo() {
    const datos = cargarIndice();
    filtros.hidden = true;
    estado.textContent = `${datos.documentos.length} documentos indexados: transparencias y cuadernos de la asignatura.`;
    resultados.innerHTML = datos.documentos
      .map((doc) => tarjeta({ doc, trozos: [], total: 0 }))
      .join("");
  }

  async function ejecutar(consulta) {
    consulta = consulta.trim();
    const url = new URL(location.href);
    if (consulta) url.searchParams.set("q", consulta);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    document.title = consulta ? `${consulta} · ${document.body.dataset.titulo}` : document.body.dataset.titulo;
    if (!consulta) {
      pintarCatalogo();
      return;
    }
    estado.textContent = "Buscando…";
    const inicio = performance.now();
    const encontrados = await buscar(consulta);
    if (encontrados === null) {
      ultimos = [];
      filtros.hidden = true;
      resultados.innerHTML = "";
      estado.textContent = "La consulta necesita al menos una palabra que buscar (no sólo exclusiones).";
      return;
    }
    ultimos = encontrados;
    const ms = Math.round(performance.now() - inicio);
    estado.textContent = encontrados.length
      ? `${encontrados.length} ${encontrados.length === 1 ? "documento" : "documentos"} · ${ms} ms`
      : `Ningún documento contiene «${consulta}».`;
    pintarFiltros(encontrados);
    pintar();
  }

  function mostrarError(error) {
    console.error(error);
    estado.textContent = `No se pudo buscar: ${error.message || error}`;
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    ejecutar(entrada.value).catch(mostrarError);
  });
  filtros.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button[data-tipo]");
    if (!boton) return;
    tipoActivo = boton.dataset.tipo;
    filtros.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === boton)));
    pintar();
  });

  const inicial = new URLSearchParams(location.search).get("q") || "";
  entrada.value = inicial;
  ejecutar(inicial).catch(mostrarError);
}
