import {
  canonicalKey,
  createDatabase,
  databaseView,
  executeCql,
  populateTable,
  tableRows,
} from "./cql-engine.mjs";
import { sourceRowsForTable } from "./dataset.mjs";

/*
 * Ejercicios del laboratorio. Todos giran alrededor de la misma aplicación
 * (Stack Overflow en español) y de sus consultas. Los valores concretos
 * (autor, etiqueta, mes...) se calculan a partir de las preguntas cargadas,
 * así que el enunciado y la comprobación valen igual para la muestra mínima
 * y para la muestra de 2016.
 *
 * Las comprobaciones no reutilizan el motor para calcular lo esperado:
 * recorren directamente la lista de preguntas.
 */

export const TABLES = Object.freeze({
  porAutor: "preguntas_por_autor",
  porEtiquetaMes: "preguntas_por_etiqueta_mes",
  porEtiqueta: "preguntas_por_etiqueta",
  autorPorPregunta: "autor_por_pregunta",
});

export const SCHEMAS = Object.freeze({
  porAutor: `CREATE TABLE ${TABLES.porAutor} (
  autorid bigint,
  fecha timestamp,
  preguntaid bigint,
  autor text,
  mes text,
  titulo text,
  score int,
  PRIMARY KEY ((autorid), fecha, preguntaid)
) WITH CLUSTERING ORDER BY (fecha DESC, preguntaid ASC);`,
  porEtiquetaMes: `CREATE TABLE ${TABLES.porEtiquetaMes} (
  etiqueta text,
  mes text,
  fecha timestamp,
  preguntaid bigint,
  autor text,
  titulo text,
  score int,
  PRIMARY KEY ((etiqueta, mes), fecha, preguntaid)
) WITH CLUSTERING ORDER BY (fecha DESC, preguntaid ASC);`,
  porEtiqueta: `CREATE TABLE ${TABLES.porEtiqueta} (
  etiqueta text,
  fecha timestamp,
  preguntaid bigint,
  autor text,
  titulo text,
  score int,
  PRIMARY KEY ((etiqueta), fecha, preguntaid)
) WITH CLUSTERING ORDER BY (fecha DESC, preguntaid ASC);`,
  autorPorPregunta: `CREATE TABLE ${TABLES.autorPorPregunta} (
  preguntaid bigint,
  autorid bigint,
  fecha timestamp,
  PRIMARY KEY (preguntaid)
);`,
  indiceMes: `CREATE INDEX preguntas_por_autor_mes_idx
  ON ${TABLES.porAutor} (mes) USING 'sai';`,
});

const NEW_QUESTION_ID = 999001;

function byRecent(left, right) {
  if (left.fecha !== right.fecha) return left.fecha < right.fecha ? 1 : -1;
  return left.preguntaid - right.preguntaid;
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** El máximo de un Map de recuentos; empata por la clave menor. */
function largest(counts) {
  let best = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count || (count === best.count && String(key) < String(best.key))) best = { key, count };
  }
  return best;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("es-ES").format(value);
}

/** Parámetros de los enunciados, calculados sobre las preguntas cargadas. */
export function exerciseContext(questions) {
  const withAuthor = questions.filter((question) => question.autorid !== null);
  const topAuthor = largest(countBy(withAuthor, (question) => question.autorid));
  const authorQuestions = withAuthor.filter((question) => question.autorid === topAuthor.key).sort(byRecent);
  const tagRows = questions.flatMap((question) => question.etiquetas.map((etiqueta) => ({ ...question, etiqueta })));
  const topTagMonth = largest(countBy(tagRows, (row) => `${row.etiqueta}\u0000${row.mes}`));
  const [tagOfMonth, monthOfTag] = topTagMonth.key.split("\u0000");
  const tagCounts = countBy(tagRows, (row) => row.etiqueta);
  const topTag = largest(tagCounts);
  const monthCounts = countBy(questions, (question) => question.mes);
  const busiestMonth = largest(monthCounts);
  const months = [...monthCounts.keys()].sort();
  const lastMonth = months.at(-1);
  const link = authorQuestions[0];
  return {
    questions,
    authorCount: new Set(withAuthor.map((question) => question.autorid)).size,
    withoutAuthor: questions.length - withAuthor.length,
    tagRowCount: tagRows.length,
    tagPartitions: tagCounts.size,
    tagMonthPartitions: countBy(tagRows, (row) => `${row.etiqueta}\u0000${row.mes}`).size,
    author: { id: topAuthor.key, name: authorQuestions[0].autor, count: topAuthor.count },
    tagMonth: { etiqueta: tagOfMonth, mes: monthOfTag, count: topTagMonth.count },
    topTagCount: topTag.count,
    largestTags: [...tagCounts].filter(([, count]) => count === topTag.count).map(([tag]) => tag),
    month: { mes: busiestMonth.key, count: busiestMonth.count, withAuthor: withAuthor.filter((question) => question.mes === busiestMonth.key).length },
    link: { preguntaid: link.preguntaid, autorid: link.autorid, fecha: link.fecha, titulo: link.titulo },
    newQuestion: {
      preguntaid: NEW_QUESTION_ID,
      autorid: topAuthor.key,
      autor: authorQuestions[0].autor,
      mes: lastMonth,
      fecha: `${lastMonth}-28T12:00:00.000Z`,
      etiquetas: [tagOfMonth, "cassandra"],
      titulo: "¿Cómo elijo la clave de partición?",
    },
  };
}

function tableCreationReminder(names) {
  const list = names.map((name) => `\`${name}\``).join(" y ");
  return `Este ejercicio crea ${list}: empieza con \`DROP TABLE IF EXISTS\` de cada tabla que crees para poder ejecutarlo varias veces`;
}

export const EXERCISES = Object.freeze([
  {
    id: "particion-autor",
    title: "Las preguntas de un usuario",
    need: (ctx) => `La página de perfil de un usuario lista sus preguntas, de la más reciente a la más antigua. Es la consulta más frecuente de la aplicación y tiene que leer un solo nodo, sea cual sea el tamaño del clúster. ${ctx.author.name} tiene ${ctx.author.count} preguntas en la muestra.`,
    steps: () => [
      tableCreationReminder([TABLES.porAutor]),
      `Crea \`${TABLES.porAutor}\` con las columnas \`autorid\` (bigint), \`fecha\` (timestamp), \`preguntaid\` (bigint), \`autor\` (text), \`mes\` (text), \`titulo\` (text) y \`score\` (int)`,
      "Elige la clave de partición para que todas las preguntas de un autor vivan juntas, y el clustering para que salgan de la más reciente a la más antigua; `preguntaid` desempata dos preguntas del mismo instante",
      "Ejecuta: el laboratorio puebla la tabla con las preguntas en cuanto la crea",
    ],
    observe: (ctx) => [
      "Cada color del dibujo es una partición, es decir, un autor: todas sus filas caen en el mismo nodo",
      "Hay muchas particiones de una sola fila y unas pocas grandes; la leyenda muestra las mayores",
      `Las ${ctx.withoutAuthor} preguntas cuyo autor borró la cuenta no se escriben: \`autorid\` es NULL y una clave primaria no admite NULL`,
    ],
    expected: (ctx) => `${formatNumber(ctx.questions.length - ctx.withoutAuthor)} filas repartidas en ${formatNumber(ctx.authorCount)} particiones.`,
    starter: () => `DROP TABLE IF EXISTS ${TABLES.porAutor};\n\nCREATE TABLE ${TABLES.porAutor} (\n  -- columnas\n  PRIMARY KEY (...)\n) WITH CLUSTERING ORDER BY (...);\n`,
    solution: () => `DROP TABLE IF EXISTS ${TABLES.porAutor};\n${SCHEMAS.porAutor}`,
    initialTables: [],
    focusTable: TABLES.porAutor,
    check: (ctx, database) => checkTable(database, ctx, {
      table: TABLES.porAutor,
      partition: ["autorid"],
      clustering: ["fecha", "preguntaid"],
      order: ["DESC", "ASC"],
      columns: { autorid: "bigint", fecha: "timestamp", preguntaid: "bigint", autor: "text", mes: "text", titulo: "text", score: "int" },
      rows: ctx.questions.length - ctx.withoutAuthor,
      partitions: ctx.authorCount,
    }),
  },
  {
    id: "consulta-particion",
    title: "Leer una partición",
    need: (ctx) => `Al abrir el perfil de ${ctx.author.name} (autorid ${ctx.author.id}) se muestran sus cinco preguntas más recientes.`,
    steps: (ctx) => [
      `Escribe un \`SELECT\` sobre \`${TABLES.porAutor}\` que devuelva \`preguntaid\`, \`fecha\` y \`titulo\` de las cinco preguntas más recientes de autorid ${ctx.author.id}`,
      "No uses ALLOW FILTERING ni ORDER BY: el orden ya lo da el clustering",
    ],
    observe: () => [
      "El dibujo ilumina un único nodo y una única partición",
      "Filas examinadas y filas devueltas coinciden: la partición ya está ordenada y la lectura se detiene al llegar al LIMIT",
    ],
    expected: (ctx) => `Cinco filas, de la más reciente a la más antigua, empezando por la pregunta ${ctx.link.preguntaid}; acceso a una partición en un solo nodo.`,
    starter: (ctx) => `SELECT ...\nFROM ${TABLES.porAutor}\nWHERE ...;\n`,
    solution: (ctx) => `SELECT preguntaid, fecha, titulo\nFROM ${TABLES.porAutor}\nWHERE autorid = ${ctx.author.id}\nLIMIT 5;`,
    initialTables: ["porAutor"],
    focusTable: TABLES.porAutor,
    check: (ctx, database, results) => {
      const expected = ctx.questions.filter((question) => question.autorid === ctx.author.id).sort(byRecent).slice(0, 5);
      return checkSelect(results, {
        table: TABLES.porAutor,
        modes: ["partition", "partition-range"],
        ids: expected.map((question) => question.preguntaid),
        ordered: true,
        columns: ["preguntaid", "fecha", "titulo"],
      });
    },
  },
  {
    id: "consulta-no-prevista",
    title: "Una consulta que la tabla no prevé",
    need: (ctx) => `Se quiere una portada con todas las preguntas de ${ctx.month.mes}. La tabla \`${TABLES.porAutor}\` guarda \`mes\`, pero no forma parte de su clave.`,
    steps: (ctx) => [
      `Escribe \`SELECT preguntaid, autor, titulo FROM ${TABLES.porAutor} WHERE mes = '${ctx.month.mes}';\` y ejecútalo: lee el error`,
      "Añade ALLOW FILTERING y vuelve a ejecutar",
      "Explica en un comentario (`-- ...`) del editor por qué Cassandra rechaza la primera versión y qué cuesta la segunda si la tabla creciera cien veces",
    ],
    observe: () => [
      "Sin la clave de partición, el coordinador no sabe a qué nodo ir: se contactan los cuatro",
      "Filas examinadas frente a filas devueltas: se lee toda la tabla para quedarse con una parte",
      "El resultado sale en orden de token, no por fecha: cada partición es independiente",
    ],
    expected: (ctx) => `${formatNumber(ctx.month.withAuthor)} filas, tras examinar las ${formatNumber(ctx.questions.length - ctx.withoutAuthor)} de la tabla en los cuatro nodos.`,
    starter: (ctx) => `SELECT preguntaid, autor, titulo\nFROM ${TABLES.porAutor}\nWHERE mes = '${ctx.month.mes}';\n`,
    solution: (ctx) => `-- Sin autorid el coordinador no sabe qué nodo tiene las filas del mes:\n-- tiene que leer todas las particiones de todos los nodos y descartar.\n-- El coste crece con la tabla, no con el resultado.\nSELECT preguntaid, autor, titulo\nFROM ${TABLES.porAutor}\nWHERE mes = '${ctx.month.mes}'\nALLOW FILTERING;`,
    initialTables: ["porAutor"],
    focusTable: TABLES.porAutor,
    check: (ctx, database, results, source) => {
      if (!/--|\/\//.test(source.replace(/'[^']*'/g, ""))) {
        return { ok: false, message: "Añade el comentario con tu explicación antes de comprobar." };
      }
      const expected = ctx.questions.filter((question) => question.mes === ctx.month.mes && question.autorid !== null);
      return checkSelect(results, {
        table: TABLES.porAutor,
        modes: ["filtering"],
        ids: expected.map((question) => question.preguntaid),
        ordered: false,
        columns: ["preguntaid", "autor", "titulo"],
      });
    },
  },
  {
    id: "tabla-por-consulta",
    title: "Una tabla para cada consulta",
    need: (ctx) => `La página de cada etiqueta muestra sus preguntas de un mes, las más recientes primero. Ninguna tabla existente tiene la etiqueta en la clave. En Cassandra no se añade un índice «por si acaso»: se crea otra tabla cuya clave es la de la consulta.`,
    steps: (ctx) => [
      tableCreationReminder([TABLES.porEtiquetaMes]),
      `Crea \`${TABLES.porEtiquetaMes}\` con \`etiqueta\` (text), \`mes\` (text), \`fecha\` (timestamp), \`preguntaid\` (bigint), \`autor\` (text), \`titulo\` (text) y \`score\` (int), con clave de partición compuesta por etiqueta y mes`,
      `En el mismo editor, consulta \`preguntaid\`, \`fecha\` y \`titulo\` de la etiqueta '${ctx.tagMonth.etiqueta}' en '${ctx.tagMonth.mes}'`,
    ],
    observe: (ctx) => [
      `Hay ${formatNumber(ctx.questions.length)} preguntas, pero la tabla recibe ${formatNumber(ctx.tagRowCount)} filas: una pregunta con tres etiquetas se escribe tres veces`,
      "Las preguntas de una misma etiqueta en meses distintos son particiones distintas y pueden vivir en nodos distintos",
      "La consulta vuelve a leer una sola partición en un solo nodo",
    ],
    expected: (ctx) => `${formatNumber(ctx.tagRowCount)} filas en ${formatNumber(ctx.tagMonthPartitions)} particiones; la consulta devuelve ${ctx.tagMonth.count} filas de una partición.`,
    starter: () => `DROP TABLE IF EXISTS ${TABLES.porEtiquetaMes};\n\nCREATE TABLE ${TABLES.porEtiquetaMes} (\n  -- columnas\n  PRIMARY KEY (...)\n) WITH CLUSTERING ORDER BY (...);\n\nSELECT ...;\n`,
    solution: (ctx) => `DROP TABLE IF EXISTS ${TABLES.porEtiquetaMes};\n${SCHEMAS.porEtiquetaMes}\n\nSELECT preguntaid, fecha, titulo\nFROM ${TABLES.porEtiquetaMes}\nWHERE etiqueta = '${ctx.tagMonth.etiqueta}' AND mes = '${ctx.tagMonth.mes}';`,
    initialTables: ["porAutor"],
    focusTable: TABLES.porEtiquetaMes,
    check: (ctx, database, results) => {
      const table = checkTable(database, ctx, {
        table: TABLES.porEtiquetaMes,
        partition: ["etiqueta", "mes"],
        clustering: ["fecha", "preguntaid"],
        order: ["DESC", "ASC"],
        columns: { etiqueta: "text", mes: "text", fecha: "timestamp", preguntaid: "bigint", autor: "text", titulo: "text", score: "int" },
        rows: ctx.tagRowCount,
        partitions: ctx.tagMonthPartitions,
      });
      if (!table.ok) return table;
      const expected = ctx.questions
        .filter((question) => question.mes === ctx.tagMonth.mes && question.etiquetas.includes(ctx.tagMonth.etiqueta))
        .sort(byRecent);
      return checkSelect(results, {
        table: TABLES.porEtiquetaMes,
        modes: ["partition", "partition-range"],
        ids: expected.map((question) => question.preguntaid),
        ordered: true,
        columns: ["preguntaid", "fecha", "titulo"],
      });
    },
  },
  {
    id: "particion-caliente",
    title: "Particiones calientes",
    need: () => `¿Por qué no particionar sólo por etiqueta? Una partición entera vive en un nodo (y en sus réplicas). Si una etiqueta concentra muchas preguntas, ese nodo carga con ellas para siempre: la partición no deja de crecer y no se puede repartir.`,
    steps: (ctx) => [
      tableCreationReminder([TABLES.porEtiqueta]),
      `Crea \`${TABLES.porEtiqueta}\` con las mismas columnas que \`${TABLES.porEtiquetaMes}\` salvo \`mes\`, particionada sólo por \`etiqueta\` y con el mismo clustering`,
      "Mira el dibujo y la leyenda: localiza la partición más grande y el nodo que la guarda",
      "En el mismo editor, consulta `preguntaid`, `fecha` y `titulo` de las tres preguntas más recientes de esa etiqueta",
    ],
    observe: (ctx) => [
      `La partición mayor tiene ${formatNumber(ctx.topTagCount)} filas; en \`${TABLES.porEtiquetaMes}\` ninguna pasa de ${formatNumber(ctx.tagMonth.count)}`,
      "Compara la barra de carga de los nodos en las dos tablas (selector de tabla sobre el dibujo)",
      "Añadir el mes a la clave es un «cubo» temporal: acota el tamaño de cada partición a costa de consultar varios meses si hacen falta",
    ],
    expected: (ctx) => `${formatNumber(ctx.tagRowCount)} filas en ${formatNumber(ctx.tagPartitions)} particiones; la consulta devuelve tres filas de la partición más grande.`,
    starter: () => `DROP TABLE IF EXISTS ${TABLES.porEtiqueta};\n\nCREATE TABLE ${TABLES.porEtiqueta} (\n  -- columnas\n  PRIMARY KEY (...)\n) WITH CLUSTERING ORDER BY (...);\n`,
    solution: (ctx) => `DROP TABLE IF EXISTS ${TABLES.porEtiqueta};\n${SCHEMAS.porEtiqueta}\n\nSELECT preguntaid, fecha, titulo\nFROM ${TABLES.porEtiqueta}\nWHERE etiqueta = '${ctx.largestTags[0]}'\nLIMIT 3;`,
    initialTables: ["porEtiquetaMes"],
    focusTable: TABLES.porEtiqueta,
    check: (ctx, database, results) => {
      const table = checkTable(database, ctx, {
        table: TABLES.porEtiqueta,
        partition: ["etiqueta"],
        clustering: ["fecha", "preguntaid"],
        order: ["DESC", "ASC"],
        columns: { etiqueta: "text", fecha: "timestamp", preguntaid: "bigint", autor: "text", titulo: "text", score: "int" },
        rows: ctx.tagRowCount,
        partitions: ctx.tagPartitions,
      });
      if (!table.ok) return table;
      const attempts = ctx.largestTags.map((tag) => {
        const expected = ctx.questions.filter((question) => question.etiquetas.includes(tag)).sort(byRecent).slice(0, 3);
        return checkSelect(results, {
          table: TABLES.porEtiqueta,
          modes: ["partition", "partition-range"],
          ids: expected.map((question) => question.preguntaid),
          ordered: true,
          columns: ["preguntaid", "fecha", "titulo"],
        });
      });
      return attempts.find((attempt) => attempt.ok)
        ?? { ok: false, message: `La consulta debe leer la partición más grande (${ctx.largestTags.join(" o ")}) y devolver sus tres preguntas más recientes.` };
    },
  },
  {
    id: "indice-secundario",
    title: "Índice secundario: local a cada nodo",
    need: (ctx) => `Otra forma de resolver la portada de ${ctx.month.mes} sin crear una tabla: un índice secundario SAI sobre \`mes\` en \`${TABLES.porAutor}\`. Cassandra lo acepta sin ALLOW FILTERING, pero ¿qué recorre?`,
    steps: (ctx) => [
      `Crea un índice sobre la columna \`mes\` de \`${TABLES.porAutor}\` con \`USING 'sai'\` (empieza con \`DROP INDEX IF EXISTS\` si le das nombre)`,
      `Repite la consulta del ejercicio 3, \`preguntaid\`, \`autor\` y \`titulo\` del mes '${ctx.month.mes}', ahora sin ALLOW FILTERING`,
      "Compara en un comentario los nodos contactados y las filas examinadas con las del ejercicio 3 y con las del ejercicio 4",
    ],
    observe: () => [
      "Cada nodo indexa sólo sus propias filas: el índice es local, así que el coordinador sigue preguntando a los cuatro nodos",
      "Pero ya no se leen todas las filas: cada nodo lee sólo las que su índice señala",
      "Una tabla por consulta lee un nodo; el índice, todos. Con cien nodos la diferencia es enorme",
    ],
    expected: (ctx) => `${formatNumber(ctx.month.withAuthor)} filas; cuatro nodos contactados y sólo ${formatNumber(ctx.month.withAuthor)} filas examinadas.`,
    starter: () => `-- CREATE INDEX ...\n\n-- SELECT ...\n`,
    solution: (ctx) => `DROP INDEX IF EXISTS preguntas_por_autor_mes_idx;\n${SCHEMAS.indiceMes}\n\n-- Contacta los 4 nodos, como ALLOW FILTERING, pero cada uno lee sólo\n-- las filas del mes. La tabla por consulta del ejercicio 4 lee un nodo.\nSELECT preguntaid, autor, titulo\nFROM ${TABLES.porAutor}\nWHERE mes = '${ctx.month.mes}';`,
    initialTables: ["porAutor"],
    focusTable: TABLES.porAutor,
    check: (ctx, database, results) => {
      const table = database.tables.get(TABLES.porAutor);
      if (!table || ![...table.indexes.values()].some((index) => index.column === "mes")) {
        return { ok: false, message: `Falta un índice sobre la columna mes de ${TABLES.porAutor}.` };
      }
      const expected = ctx.questions.filter((question) => question.mes === ctx.month.mes && question.autorid !== null);
      return checkSelect(results, {
        table: TABLES.porAutor,
        modes: ["index"],
        ids: expected.map((question) => question.preguntaid),
        ordered: false,
        columns: ["preguntaid", "autor", "titulo"],
      });
    },
  },
  {
    id: "indice-global",
    title: "Un índice global hecho a mano",
    need: (ctx) => `Un enlace como /questions/${ctx.link.preguntaid} abre una pregunta sólo con su Id. En \`${TABLES.porAutor}\` hace falta el autor para encontrarla, y un índice secundario sobre \`preguntaid\` preguntaría a todos los nodos. Un índice global es otra tabla particionada por el valor buscado que guarda la clave de la fila original.`,
    steps: (ctx) => [
      tableCreationReminder([TABLES.autorPorPregunta]),
      `Crea \`${TABLES.autorPorPregunta}\` con \`preguntaid\` (bigint), \`autorid\` (bigint) y \`fecha\` (timestamp), particionada sólo por \`preguntaid\``,
      `Consulta \`autorid\` y \`fecha\` de la pregunta ${ctx.link.preguntaid} en esa tabla`,
      `Con esos valores, lee \`titulo\` y \`score\` de la pregunta en \`${TABLES.porAutor}\` dando la clave primaria completa (la fecha se escribe como en el resultado, entre comillas)`,
    ],
    observe: () => [
      "Cada consulta toca un único nodo, aunque no tienen por qué ser el mismo: dos lecturas por clave en vez de preguntar a todo el clúster",
      "El precio está en las escrituras: cada pregunta nueva hay que escribirla también en esta tabla, y es la aplicación quien las mantiene de acuerdo",
    ],
    expected: (ctx) => `La primera consulta devuelve autorid ${ctx.link.autorid}; la segunda, una fila con el título «${ctx.link.titulo}».`,
    starter: () => `DROP TABLE IF EXISTS ${TABLES.autorPorPregunta};\n\nCREATE TABLE ${TABLES.autorPorPregunta} (\n  -- columnas\n);\n\n-- 1. SELECT ... FROM ${TABLES.autorPorPregunta} ...\n-- 2. SELECT ... FROM ${TABLES.porAutor} ...\n`,
    solution: (ctx) => `DROP TABLE IF EXISTS ${TABLES.autorPorPregunta};\n${SCHEMAS.autorPorPregunta}\n\nSELECT autorid, fecha\nFROM ${TABLES.autorPorPregunta}\nWHERE preguntaid = ${ctx.link.preguntaid};\n\nSELECT titulo, score\nFROM ${TABLES.porAutor}\nWHERE autorid = ${ctx.link.autorid}\n  AND fecha = '${ctx.link.fecha}'\n  AND preguntaid = ${ctx.link.preguntaid};`,
    initialTables: ["porAutor"],
    focusTable: TABLES.autorPorPregunta,
    check: (ctx, database, results) => {
      const table = checkTable(database, ctx, {
        table: TABLES.autorPorPregunta,
        partition: ["preguntaid"],
        clustering: [],
        order: [],
        columns: { preguntaid: "bigint", autorid: "bigint", fecha: "timestamp" },
        rows: ctx.questions.length,
        partitions: ctx.questions.length,
      });
      if (!table.ok) return table;
      const selects = results.filter((result) => result.kind === "select");
      const lookup = selects.find((result) => result.table === TABLES.autorPorPregunta);
      if (!lookup) return { ok: false, message: `Falta la consulta sobre ${TABLES.autorPorPregunta}.` };
      if (lookup.explanation.mode !== "partition" || lookup.rows.length !== 1 || lookup.rows[0].autorid !== String(ctx.link.autorid)) {
        return { ok: false, message: `La primera consulta debe leer por clave la pregunta ${ctx.link.preguntaid} y devolver su autorid.` };
      }
      const base = selects.filter((result) => result.table === TABLES.porAutor).at(-1);
      const authorKey = canonicalKey([BigInt(ctx.link.autorid)]);
      if (!base || base.explanation.mode !== "partition" || base.rows.length !== 1 || base.explanation.partitionKeys[0] !== authorKey) {
        return { ok: false, message: `La segunda consulta debe dar la clave primaria completa de la pregunta en ${TABLES.porAutor} y devolver una fila.` };
      }
      if (!("titulo" in base.rows[0]) || base.rows[0].titulo !== ctx.link.titulo) {
        return { ok: false, message: "La segunda consulta debe devolver el título de la pregunta." };
      }
      return { ok: true, message: "Correcto: dos lecturas por clave, cada una en un solo nodo." };
    },
  },
  {
    id: "escritura-desnormalizada",
    title: "Escribir en todas las tablas",
    need: (ctx) => `${ctx.newQuestion.autor} publica una pregunta nueva. Con tres tablas, la aplicación tiene que escribirla en las tres; Cassandra no lo hace por ella.`,
    steps: (ctx) => [
      `Inserta la pregunta ${ctx.newQuestion.preguntaid} en \`${TABLES.porAutor}\`: autorid ${ctx.newQuestion.autorid}, autor '${ctx.newQuestion.autor.replaceAll("'", "''")}', fecha '${ctx.newQuestion.fecha}', mes '${ctx.newQuestion.mes}', titulo '${ctx.newQuestion.titulo}' y score 0`,
      `Insértala en \`${TABLES.porEtiquetaMes}\` una vez por etiqueta: '${ctx.newQuestion.etiquetas[0]}' y '${ctx.newQuestion.etiquetas[1]}'`,
      `Insértala en \`${TABLES.autorPorPregunta}\``,
      "La pregunta recibe tres votos: repite un INSERT con la clave completa y score 3 en cada fila que tenga score. Un INSERT con una clave existente sobrescribe (upsert), no duplica",
    ],
    observe: () => [
      "El resultado de cada INSERT indica en qué nodo cae: una sola pregunta toca varias particiones y probablemente varios nodos",
      "Tras los upserts el número de filas no cambia",
      "Si olvidas una de las tablas, esa página de la aplicación no verá la pregunta: nadie lo impide",
    ],
    expected: (ctx) => `Una fila más en ${TABLES.porAutor}, dos más en ${TABLES.porEtiquetaMes} y una más en ${TABLES.autorPorPregunta}; score 3 en las tres filas que lo guardan.`,
    starter: () => `INSERT INTO ${TABLES.porAutor} (...) VALUES (...);\n`,
    solution: (ctx) => {
      const q = ctx.newQuestion;
      const autor = q.autor.replaceAll("'", "''");
      const lines = [
        `INSERT INTO ${TABLES.porAutor} (autorid, fecha, preguntaid, autor, mes, titulo, score) VALUES (${q.autorid}, '${q.fecha}', ${q.preguntaid}, '${autor}', '${q.mes}', '${q.titulo}', 0);`,
        ...q.etiquetas.map((tag) => `INSERT INTO ${TABLES.porEtiquetaMes} (etiqueta, mes, fecha, preguntaid, autor, titulo, score) VALUES ('${tag}', '${q.mes}', '${q.fecha}', ${q.preguntaid}, '${autor}', '${q.titulo}', 0);`),
        `INSERT INTO ${TABLES.autorPorPregunta} (preguntaid, autorid, fecha) VALUES (${q.preguntaid}, ${q.autorid}, '${q.fecha}');`,
        "",
        "-- Upserts: misma clave completa, sólo cambia score.",
        `INSERT INTO ${TABLES.porAutor} (autorid, fecha, preguntaid, score) VALUES (${q.autorid}, '${q.fecha}', ${q.preguntaid}, 3);`,
        ...q.etiquetas.map((tag) => `INSERT INTO ${TABLES.porEtiquetaMes} (etiqueta, mes, fecha, preguntaid, score) VALUES ('${tag}', '${q.mes}', '${q.fecha}', ${q.preguntaid}, 3);`),
      ];
      return lines.join("\n");
    },
    initialTables: ["porAutor", "porEtiquetaMes", "autorPorPregunta"],
    focusTable: TABLES.porEtiquetaMes,
    check: (ctx, database) => {
      const q = ctx.newQuestion;
      const id = String(q.preguntaid);
      const expectations = [
        [TABLES.porAutor, ctx.questions.length - ctx.withoutAuthor + 1, 1, true],
        [TABLES.porEtiquetaMes, ctx.tagRowCount + 2, 2, true],
        [TABLES.autorPorPregunta, ctx.questions.length + 1, 1, false],
      ];
      for (const [name, total, copies, scored] of expectations) {
        const table = database.tables.get(name);
        if (!table) return { ok: false, message: `Falta la tabla ${name}; reinicia el ejercicio.` };
        const rows = tableRows(table).filter((row) => row.preguntaid === id);
        if (rows.length !== copies) {
          return { ok: false, message: `${name} debe tener ${copies} fila${copies === 1 ? "" : "s"} de la pregunta ${id} y tiene ${rows.length}.` };
        }
        if (table.rows.size !== total) {
          return { ok: false, message: `${name} debería tener ${formatNumber(total)} filas y tiene ${formatNumber(table.rows.size)}: ¿se ha duplicado o perdido alguna?` };
        }
        for (const row of rows) {
          if ("autorid" in row && row.autorid !== String(q.autorid)) return { ok: false, message: `El autorid de la pregunta en ${name} no es ${q.autorid}.` };
          if (row.fecha !== q.fecha) return { ok: false, message: `La fecha de la pregunta en ${name} debe ser ${q.fecha}.` };
          if (scored && row.score !== 3) return { ok: false, message: `La fila de ${name}${row.etiqueta ? ` con etiqueta ${row.etiqueta}` : ""} debe acabar con score 3.` };
          if ("titulo" in row && row.titulo !== q.titulo) return { ok: false, message: `El título en ${name} debe ser «${q.titulo}».` };
        }
        if (name === TABLES.porEtiquetaMes) {
          const tags = rows.map((row) => row.etiqueta).sort();
          if (JSON.stringify(tags) !== JSON.stringify([...q.etiquetas].sort()) || rows.some((row) => row.mes !== q.mes)) {
            return { ok: false, message: `En ${name} hace falta una fila por etiqueta (${q.etiquetas.join(", ")}) en el mes ${q.mes}.` };
          }
        }
      }
      return { ok: true, message: "Correcto: una pregunta, cuatro filas en tres tablas, y los upserts no duplican." };
    },
  },
]);

function checkTable(database, ctx, expected) {
  const table = database.tables.get(expected.table);
  if (!table) return { ok: false, message: `No existe la tabla ${expected.table}.` };
  const [view] = databaseView(database).filter((entry) => entry.name === expected.table);
  for (const [name, type] of Object.entries(expected.columns)) {
    const column = view.columns.find((entry) => entry.name === name);
    if (!column) return { ok: false, message: `Falta la columna ${name} en ${expected.table}.` };
    if (column.type !== type) return { ok: false, message: `La columna ${name} debe ser ${type}, no ${column.type}.` };
  }
  if (JSON.stringify(view.primaryKey.partitionColumns) !== JSON.stringify(expected.partition)) {
    return { ok: false, message: `La clave de partición es (${view.primaryKey.partitionColumns.join(", ")}): piensa qué valor conoce la consulta para ir a un solo nodo.` };
  }
  if (JSON.stringify(view.primaryKey.clusteringColumns) !== JSON.stringify(expected.clustering)) {
    return { ok: false, message: `Las columnas de clustering son (${view.primaryKey.clusteringColumns.join(", ") || "ninguna"}): deben ordenar las filas de la partición como pide la consulta y distinguir cada fila.` };
  }
  if (JSON.stringify(view.clusteringOrder.map((entry) => entry.direction)) !== JSON.stringify(expected.order)) {
    return { ok: false, message: "El orden de clustering no es el pedido: la más reciente primero y, a igual fecha, preguntaid ascendente." };
  }
  if (view.rowCount !== expected.rows || view.partitionCount !== expected.partitions) {
    return { ok: false, message: `Se esperaban ${formatNumber(expected.rows)} filas en ${formatNumber(expected.partitions)} particiones y hay ${formatNumber(view.rowCount)} en ${formatNumber(view.partitionCount)}. Ejecuta de nuevo desde el DROP TABLE para que el laboratorio la pueble.` };
  }
  return { ok: true, message: "Tabla correcta.", view };
}

function checkSelect(results, expected) {
  const select = results.filter((result) => result.kind === "select" && result.table === expected.table).at(-1);
  if (!select) return { ok: false, message: `Ejecuta una consulta SELECT sobre ${expected.table} antes de comprobar.` };
  const missing = expected.columns.filter((name) => !select.columns.includes(name));
  if (missing.length) return { ok: false, message: `La consulta debe devolver ${expected.columns.join(", ")}; falta ${missing.join(", ")}.` };
  const actual = select.rows.map((row) => row.preguntaid);
  const wanted = expected.ids.map(String);
  const same = expected.ordered
    ? JSON.stringify(actual) === JSON.stringify(wanted)
    : actual.length === wanted.length && JSON.stringify([...actual].sort()) === JSON.stringify([...wanted].sort());
  if (!same) {
    return { ok: false, message: `Se esperaban ${formatNumber(wanted.length)} filas${expected.ordered ? " en orden" : ""} y la consulta devuelve ${formatNumber(actual.length)}${actual.length === wanted.length ? " distintas o en otro orden" : ""}.` };
  }
  if (!expected.modes.includes(select.explanation.mode)) {
    return { ok: false, message: `El resultado es correcto, pero el acceso es «${select.explanation.label}»; el ejercicio pide otro.` };
  }
  const nodes = select.explanation.nodes.length;
  return { ok: true, message: `Correcto. Acceso: ${select.explanation.label}; ${nodes} nodo${nodes === 1 ? "" : "s"} contactado${nodes === 1 ? "" : "s"}.` };
}

/** Puebla una tabla con las preguntas y devuelve el informe de la carga. */
export function populateFromQuestions(database, tableName, questions) {
  const table = database.tables.get(tableName);
  const source = sourceRowsForTable(table, questions);
  if (source.unknownKey.length) return { ...source, written: 0 };
  const result = populateTable(database, tableName, source.rows);
  return { ...source, written: result.written };
}

/**
 * Ejecuta el código del alumno. Cada tabla recién creada se puebla con las
 * preguntas antes de la sentencia siguiente.
 */
export function runLab(database, source, questions) {
  return executeCql(database, source, {
    afterStatement(result) {
      if (result.kind === "create-table" && result.created) {
        result.population = populateFromQuestions(database, result.table, questions);
      }
    },
  });
}

export function initialDatabase(exercise, questions) {
  const database = createDatabase();
  for (const key of exercise.initialTables) runLab(database, SCHEMAS[key], questions);
  return database;
}

export function checkExercise(exercise, ctx, source) {
  const database = initialDatabase(exercise, ctx.questions);
  const results = runLab(database, source, ctx.questions);
  return exercise.check(ctx, database, results, source);
}
