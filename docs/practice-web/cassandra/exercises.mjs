import {
  createDatabase,
  databaseView,
  executeCql,
  loadRowsAsCql,
  tableRows,
} from "./cql-engine.mjs";
import { fixtureTableNameFor, initialFixtureTableNameFor, loadReferenceData, TABLE_SCHEMAS } from "./fixtures.mjs";

const AUTHOR = "lab_preguntas_por_autor";
const AUTHOR_MONTH = "lab_preguntas_por_autor_mes";
const MONTH = "lab_preguntas_por_mes";

function schemaFor(tableName, key) {
  return {
    tableName,
    partitionColumns: key.partitionColumns,
    clusteringColumns: key.clusteringColumns,
    clusteringOrder: key.clusteringOrder,
  };
}

const EXPECTED = {
  author: schemaFor(AUTHOR, {
    partitionColumns: ["autorid"],
    clusteringColumns: ["fecha", "preguntaid"],
    clusteringOrder: [
      { name: "fecha", direction: "DESC" },
      { name: "preguntaid", direction: "ASC" },
    ],
  }),
  authorMonth: schemaFor(AUTHOR_MONTH, {
    partitionColumns: ["autorid", "mes"],
    clusteringColumns: ["fecha", "preguntaid"],
    clusteringOrder: [
      { name: "fecha", direction: "DESC" },
      { name: "preguntaid", direction: "ASC" },
    ],
  }),
  month: schemaFor(MONTH, {
    partitionColumns: ["mes"],
    clusteringColumns: ["autorid", "fecha", "preguntaid"],
    clusteringOrder: [
      { name: "autorid", direction: "ASC" },
      { name: "fecha", direction: "DESC" },
      { name: "preguntaid", direction: "ASC" },
    ],
  }),
};

export const EXERCISES = Object.freeze([
  {
    id: "particion-autor",
    title: "1 · Una partición por autor",
    prompt: `Crea ${AUTHOR} con autorid como clave de partición y fecha/preguntaid como clustering. Después pulsa «Cargar datos de ejemplo» y comprueba que quedan tres particiones y ocho filas. Empieza tu solución con DROP TABLE IF EXISTS ${AUTHOR}; si vas a reejecutar la creación.`,
    starter: `-- Escribe CREATE TABLE ${AUTHOR} ... aquí\n`,
    solution: `DROP TABLE IF EXISTS ${AUTHOR};\n${TABLE_SCHEMAS.byAuthor}`,
    tableName: AUTHOR,
    expected: EXPECTED.author,
    loadAfterRun: true,
  },
  {
    id: "particion-autor-mes",
    title: "2 · Acotar la partición por mes",
    prompt: `Crea ${AUTHOR_MONTH} con la clave de partición compuesta (autorid, mes), manteniendo fecha y preguntaid como clustering. Carga los datos y comprueba que hay cinco particiones.`,
    starter: `-- Diseña una clave de partición compuesta para ${AUTHOR_MONTH}\n`,
    solution: `DROP TABLE IF EXISTS ${AUTHOR_MONTH};\n${TABLE_SCHEMAS.byAuthorMonth}`,
    tableName: AUTHOR_MONTH,
    expected: EXPECTED.authorMonth,
    loadAfterRun: true,
  },
  {
    id: "orden-clustering",
    title: "3 · Orden y desempate del clustering",
    prompt: `Crea ${AUTHOR_MONTH} con fecha DESC y preguntaid ASC en CLUSTERING ORDER BY. Carga los datos y observa que las preguntas 102 y 103, con la misma fecha, quedan desempatas por preguntaid.`,
    starter: `-- Incluye WITH CLUSTERING ORDER BY (fecha DESC, preguntaid ASC)\n`,
    solution: `DROP TABLE IF EXISTS ${AUTHOR_MONTH};\n${TABLE_SCHEMAS.byAuthorMonth}`,
    tableName: AUTHOR_MONTH,
    expected: EXPECTED.authorMonth,
    loadAfterRun: true,
    checkOrder: true,
  },
  {
    id: "rango-particion",
    title: "4 · Leer un intervalo contiguo",
    prompt: `Consulta la partición de autorid = 10 y mes = '2026-01' desde fecha >= '2026-01-05T00:00:00Z'. Selecciona preguntaid y evita ALLOW FILTERING: el resultado debe ser [102, 103].`,
    starter: `SELECT preguntaid\nFROM ${AUTHOR_MONTH}\nWHERE autorid = 10 AND mes = '2026-01'\n  AND fecha >= '2026-01-05T00:00:00Z';`,
    solution: `SELECT preguntaid FROM ${AUTHOR_MONTH} WHERE autorid = 10 AND mes = '2026-01' AND fecha >= '2026-01-05T00:00:00Z';`,
    initialCql: TABLE_SCHEMAS.byAuthorMonth,
    tableName: AUTHOR_MONTH,
    loadAfterRun: true,
    expectedRows: ["102", "103"],
    expectedMode: "partition-range",
  },
  {
    id: "filtrado-global",
    title: "5 · Una consulta global y otro modelo",
    prompt: `Busca todas las preguntas del mes '2026-01'. En ${AUTHOR_MONTH} falta autorid en la clave de partición, así que escribe la consulta con ALLOW FILTERING y observa la explicación del recorrido. Después crea ${MONTH} con mes como partición y autorid, fecha, preguntaid como clustering; si la reejecutas, empieza con DROP TABLE IF EXISTS ${MONTH}. Pulsa «Cargar datos de ejemplo» sobre la tabla nueva y prueba allí la misma consulta sin ALLOW FILTERING.`,
    starter: `SELECT preguntaid\nFROM ${AUTHOR_MONTH}\nWHERE mes = '2026-01'\n  ALLOW FILTERING;\n\n-- Después crea ${MONTH} con mes como partición\n`,
    solution: `SELECT preguntaid FROM ${AUTHOR_MONTH} WHERE mes = '2026-01' ALLOW FILTERING;\nDROP TABLE IF EXISTS ${MONTH};\n${TABLE_SCHEMAS.byMonth}`,
    initialCql: TABLE_SCHEMAS.byAuthorMonth,
    initialLoadTable: AUTHOR_MONTH,
    tableName: MONTH,
    loadAfterRun: true,
    checkLoadAfterRun: true,
    expectedRows: ["101", "102", "103", "201", "202"],
    expectedMode: "filtering",
    expectedAlternate: EXPECTED.month,
  },
  {
    id: "upsert-clave",
    title: "6 · La clave identifica la fila",
    prompt: `Haz un upsert de la pregunta 102 cambiando score a 99 sin enviar titulo; debe conservar «Pregunta B». Después inserta la misma fecha y una preguntaid 999. El resultado final debe tener nueve filas.`,
    starter: `-- Dos INSERT: actualiza 102 y crea 999\n`,
    solution: `INSERT INTO ${AUTHOR_MONTH} (autorid, mes, fecha, preguntaid, score) VALUES (10, '2026-01', '2026-01-05T10:00:00Z', 102, 99);\nINSERT INTO ${AUTHOR_MONTH} (autorid, mes, fecha, preguntaid, titulo, score) VALUES (10, '2026-01', '2026-01-05T10:00:00Z', 999, 'Nueva', 1);`,
    initialCql: TABLE_SCHEMAS.byAuthorMonth,
    tableName: AUTHOR_MONTH,
    loadAfterRun: true,
    checkUpsert: true,
  },
]);

function tableSchemaMatches(database, expected) {
  const table = database.tables.get(expected.tableName);
  if (!table) return { ok: false, message: `No existe la tabla ${expected.tableName}.` };
  const [view] = databaseView(database).filter((entry) => entry.name === expected.tableName);
  if (JSON.stringify(view.primaryKey.partitionColumns) !== JSON.stringify(expected.partitionColumns)) {
    return { ok: false, message: "La clave de partición no coincide con el modelo pedido." };
  }
  if (JSON.stringify(view.primaryKey.clusteringColumns) !== JSON.stringify(expected.clusteringColumns)) {
    return { ok: false, message: "Las columnas de clustering no coinciden con el modelo pedido." };
  }
  if (JSON.stringify(view.clusteringOrder) !== JSON.stringify(expected.clusteringOrder)) {
    return { ok: false, message: "El orden de clustering no coincide con el modelo pedido." };
  }
  return { ok: true, table, view };
}

export function initialDatabase(exercise) {
  const database = createDatabase();
  if (exercise.initialCql) {
    executeCql(database, exercise.initialCql);
    loadReferenceData(database, initialFixtureTableNameFor(exercise), loadRowsAsCql);
  }
  return database;
}

export function loadExerciseData(database, exercise) {
  const name = fixtureTableNameFor(exercise);
  if (!database.tables.has(name)) throw new Error(`Crea primero la tabla ${name}.`);
  return loadReferenceData(database, name, loadRowsAsCql);
}

export function checkExercise(exercise, database, results) {
  if (exercise.expected) {
    const schemaResult = tableSchemaMatches(database, exercise.expected);
    if (!schemaResult.ok) return schemaResult;
    if (schemaResult.view.rowCount !== 8) {
      return { ok: false, message: "Carga los ocho datos de ejemplo para comprobar las particiones." };
    }
    const expectedPartitions = exercise.id === "particion-autor" ? 3 : 5;
    if (schemaResult.view.partitionCount !== expectedPartitions) {
      return { ok: false, message: `Se esperaban ${expectedPartitions} particiones y se han obtenido ${schemaResult.view.partitionCount}.` };
    }
    if (exercise.checkOrder) {
      const rows = tableRows(schemaResult.table).filter((row) => row.autorid === "10" && row.mes === "2026-01");
      if (JSON.stringify(rows.map((row) => row.preguntaid)) !== JSON.stringify(["102", "103", "101"])) {
        return { ok: false, message: "Revisa DESC en fecha y ASC en preguntaid para el desempate." };
      }
    }
    return { ok: true, message: "Esquema y materialización correctos: observa ahora las particiones." };
  }

  if (exercise.expectedRows) {
    const result = [...results].reverse().find((entry) => entry.kind === "select");
    if (!result) return { ok: false, message: "Ejecuta una consulta SELECT antes de comprobar." };
    const actual = result.rows.map((row) => row.preguntaid).sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1);
    if (JSON.stringify(actual) !== JSON.stringify([...exercise.expectedRows].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1))) {
      return { ok: false, message: `El resultado esperado es [${exercise.expectedRows.join(", ")}].` };
    }
    if (result.explanation.mode !== exercise.expectedMode) {
      return { ok: false, message: `La consulta debe usar el acceso «${exercise.expectedMode}», no «${result.explanation.mode}».` };
    }
    if (exercise.expectedAlternate) {
      const alternate = tableSchemaMatches(database, exercise.expectedAlternate);
      if (!alternate.ok) return alternate;
      if (alternate.view.rowCount !== 8 || alternate.view.partitionCount !== 2) {
        return { ok: false, message: "Crea la tabla alternativa y carga sus ocho filas para comprobar sus dos particiones por mes." };
      }
    }
    return { ok: true, message: "Resultado correcto; el segundo modelo permite dirigir la consulta por mes." };
  }

  if (exercise.checkUpsert) {
    const table = database.tables.get(exercise.tableName);
    const rows = tableRows(table);
    const updated = rows.find((row) => row.preguntaid === "102");
    const inserted = rows.find((row) => row.preguntaid === "999");
    if (rows.length !== 9 || updated?.score !== 99 || updated?.titulo !== "Pregunta B" || !inserted) {
      return { ok: false, message: "Comprueba la clave completa, el upsert y la conservación de titulo." };
    }
    return { ok: true, message: "Upsert correcto: la clave completa identifica la fila y conserva columnas omitidas." };
  }
  return { ok: false, message: "Este ejercicio no tiene comprobador configurado." };
}

export function exerciseById(id) {
  return EXERCISES.find((exercise) => exercise.id === id) ?? EXERCISES[0];
}
