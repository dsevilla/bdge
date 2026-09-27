/**
 * Conjunto de preguntas del laboratorio, tomado de la muestra JSONL de Stack
 * Overflow en español publicada en dsevilla/bd2-data (una pregunta de cada
 * ocho, con su hilo completo). El laboratorio usa sólo las preguntas de un
 * año para que todas las tablas quepan en memoria y el dibujo del clúster se
 * pueda leer.
 *
 * El mismo código transforma el JSONL en el navegador y en
 * tools/make-fixture.mjs, que genera la muestra mínima incrustada: así la
 * muestra sin red y la descargada no pueden divergir.
 */

export const DATA_SOURCES = Object.freeze([
  { label: "jsDelivr", base: "https://cdn.jsdelivr.net/gh/dsevilla/bd2-data@main/es.stackoverflow/jsonl" },
  { label: "raw.githubusercontent.com", base: "https://raw.githubusercontent.com/dsevilla/bd2-data/main/es.stackoverflow/jsonl" },
]);

export const SAMPLE_YEAR = "2016";

/**
 * Columnas que el cargador sabe rellenar. Una tabla puede usar cualquier
 * subconjunto con estos nombres y tipos; las columnas con otro nombre quedan
 * a NULL.
 */
export const SOURCE_COLUMNS = Object.freeze([
  Object.freeze({ name: "preguntaid", type: "bigint", description: "Id de la pregunta (Posts.Id)" }),
  Object.freeze({ name: "autorid", type: "bigint", description: "Posts.OwnerUserId; NULL si el autor borró su cuenta" }),
  Object.freeze({ name: "autor", type: "text", description: "Users.DisplayName del autor, o Posts.OwnerDisplayName si no existe" }),
  Object.freeze({ name: "fecha", type: "timestamp", description: "Posts.CreationDate" }),
  Object.freeze({ name: "mes", type: "text", description: "Mes de la fecha, como '2016-03'" }),
  Object.freeze({ name: "etiqueta", type: "text", description: "Una de las etiquetas de Posts.Tags: la tabla recibe una fila por etiqueta" }),
  Object.freeze({ name: "titulo", type: "text", description: "Posts.Title" }),
  Object.freeze({ name: "score", type: "int", description: "Posts.Score" }),
  Object.freeze({ name: "respuestas", type: "int", description: "Posts.AnswerCount" }),
  Object.freeze({ name: "vistas", type: "int", description: "Posts.ViewCount" }),
]);

const SOURCE_TYPES = new Map(SOURCE_COLUMNS.map((column) => [column.name, column.type]));

export function parseTags(tags) {
  if (!tags) return [];
  return [...tags.matchAll(/<([^>]+)>/g)].map((match) => match[1]);
}

function dateOf(value) {
  if (value && typeof value === "object" && typeof value.$date === "string") return value.$date;
  return typeof value === "string" ? value : null;
}

/**
 * Convierte el texto JSONL de Posts y Users en preguntas del laboratorio.
 * `months` restringe opcionalmente los meses ('2016-01', ...).
 */
export function questionsFromJsonl(postsText, usersText, { year = SAMPLE_YEAR, months = null } = {}) {
  const questions = [];
  const datePrefix = `"CreationDate":{"$date":"${year}-`;
  for (const line of postsText.split("\n")) {
    // Filtro barato antes de JSON.parse: la muestra tiene 55.884 líneas.
    if (!line.includes(datePrefix) || !line.includes('"PostTypeId":1,')) continue;
    const post = JSON.parse(line);
    if (post.PostTypeId !== 1) continue;
    const fecha = dateOf(post.CreationDate);
    if (!fecha || !fecha.startsWith(`${year}-`)) continue;
    const mes = fecha.slice(0, 7);
    if (months && !months.includes(mes)) continue;
    questions.push({
      preguntaid: post.Id,
      autorid: post.OwnerUserId ?? null,
      ownerDisplayName: post.OwnerDisplayName ?? null,
      fecha,
      mes,
      etiquetas: parseTags(post.Tags),
      titulo: post.Title ?? null,
      score: post.Score ?? 0,
      respuestas: post.AnswerCount ?? 0,
      vistas: post.ViewCount ?? 0,
    });
  }
  const wanted = new Set(questions.map((question) => question.autorid).filter((id) => id !== null));
  const names = new Map();
  for (const line of usersText.split("\n")) {
    if (!line) continue;
    const idMatch = line.match(/^\{"Id":(-?\d+),/);
    if (!idMatch || !wanted.has(Number(idMatch[1]))) continue;
    const user = JSON.parse(line);
    names.set(user.Id, user.DisplayName ?? null);
  }
  return questions
    .map(({ ownerDisplayName, ...question }) => ({
      ...question,
      autor: question.autorid === null ? ownerDisplayName : (names.get(question.autorid) ?? ownerDisplayName),
    }))
    .sort((left, right) => left.preguntaid - right.preguntaid);
}

async function fetchText(base, filename, onProgress) {
  const response = await fetch(`${base}/${filename}`, { mode: "cors" });
  if (!response.ok) throw new Error(`${filename} respondió HTTP ${response.status}.`);
  if (!response.body) throw new Error(`El navegador no permitió leer ${filename}.`);
  onProgress?.(`Descargando ${filename}…`);
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Descarga Posts y Users de la muestra reducida y devuelve las preguntas del año. */
export async function loadRemoteQuestions(onProgress) {
  const errors = [];
  for (const source of DATA_SOURCES) {
    try {
      const posts = await fetchText(source.base, "Posts-sample.jsonl.gz", onProgress);
      const users = await fetchText(source.base, "Users-sample.jsonl.gz", onProgress);
      onProgress?.("Preparando las preguntas…");
      return { questions: questionsFromJsonl(posts, users), source: source.label };
    } catch (error) {
      errors.push(`${source.label}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" · "));
}

/**
 * Filas que el cargador escribe en una tabla. Si la tabla tiene la columna
 * `etiqueta`, cada pregunta produce una fila por etiqueta, como haría un
 * cargador real al desnormalizar. Las filas con un NULL en la clave primaria
 * no se pueden escribir: se cuentan aparte para mostrarlas.
 */
export function sourceRowsForTable(table, questions) {
  const columns = table.columns.filter((column) => SOURCE_TYPES.get(column.name) === column.type);
  const keyColumns = table.primaryKey.partitionColumns.concat(table.primaryKey.clusteringColumns);
  const unknownKey = keyColumns.filter((name) => !columns.some((column) => column.name === name));
  if (unknownKey.length) {
    return { rows: [], skipped: 0, questions: 0, unknownKey, filled: columns.map((column) => column.name) };
  }
  const explode = columns.some((column) => column.name === "etiqueta");
  const rows = [];
  let skipped = 0;
  for (const question of questions) {
    const variants = explode ? question.etiquetas.map((etiqueta) => ({ ...question, etiqueta })) : [question];
    for (const variant of variants) {
      if (keyColumns.some((name) => variant[name] === null || variant[name] === undefined)) {
        skipped += 1;
        continue;
      }
      const row = {};
      for (const column of columns) row[column.name] = variant[column.name];
      rows.push(row);
    }
  }
  return { rows, skipped, questions: questions.length, unknownKey: [], filled: columns.map((column) => column.name), exploded: explode };
}
