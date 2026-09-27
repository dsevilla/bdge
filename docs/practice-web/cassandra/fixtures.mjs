export const REFERENCE_ROWS = Object.freeze([
  Object.freeze({ autorid: 10n, mes: "2026-01", fecha: "2026-01-03T10:00:00Z", preguntaid: 101n, titulo: "Pregunta A", score: 2 }),
  Object.freeze({ autorid: 10n, mes: "2026-01", fecha: "2026-01-05T10:00:00Z", preguntaid: 102n, titulo: "Pregunta B", score: 7 }),
  Object.freeze({ autorid: 10n, mes: "2026-01", fecha: "2026-01-05T10:00:00Z", preguntaid: 103n, titulo: "Pregunta C", score: 7 }),
  Object.freeze({ autorid: 10n, mes: "2026-02", fecha: "2026-02-01T10:00:00Z", preguntaid: 104n, titulo: "Pregunta D", score: 0 }),
  Object.freeze({ autorid: 20n, mes: "2026-01", fecha: "2026-01-02T10:00:00Z", preguntaid: 201n, titulo: "Pregunta E", score: 1 }),
  Object.freeze({ autorid: 20n, mes: "2026-01", fecha: "2026-01-07T10:00:00Z", preguntaid: 202n, titulo: "Pregunta F", score: 5 }),
  Object.freeze({ autorid: 20n, mes: "2026-02", fecha: "2026-02-02T10:00:00Z", preguntaid: 203n, titulo: "Pregunta G", score: 3 }),
  Object.freeze({ autorid: 30n, mes: "2026-02", fecha: "2026-02-03T10:00:00Z", preguntaid: 301n, titulo: "Pregunta H", score: 4 }),
]);

export const TABLE_SCHEMAS = Object.freeze({
  byAuthor: `CREATE TABLE lab_preguntas_por_autor (
    autorid bigint, mes text, fecha timestamp, preguntaid bigint,
    titulo text, score int,
    PRIMARY KEY (autorid, fecha, preguntaid)
  ) WITH CLUSTERING ORDER BY (fecha DESC, preguntaid ASC);`,
  byAuthorMonth: `CREATE TABLE lab_preguntas_por_autor_mes (
    autorid bigint, mes text, fecha timestamp, preguntaid bigint,
    titulo text, score int,
    PRIMARY KEY ((autorid, mes), fecha, preguntaid)
  ) WITH CLUSTERING ORDER BY (fecha DESC, preguntaid ASC);`,
  byMonth: `CREATE TABLE lab_preguntas_por_mes (
    autorid bigint, mes text, fecha timestamp, preguntaid bigint,
    titulo text, score int,
    PRIMARY KEY ((mes), autorid, fecha, preguntaid)
  ) WITH CLUSTERING ORDER BY (autorid ASC, fecha DESC, preguntaid ASC);`,
});

function typedRow(row) {
  const epochMs = Date.parse(row.fecha);
  return {
    ...row,
    fecha: { __timestamp: true, epochMs, iso: new Date(epochMs).toISOString() },
  };
}

export function loadReferenceData(database, tableName, loadRowsAsCql) {
  const rows = REFERENCE_ROWS.map(typedRow);
  return loadRowsAsCql(database, tableName, rows);
}

export function fixtureTableNameFor(exercise) {
  return exercise.loadTableName ?? exercise.fixtureTable ?? exercise.tableName;
}

export function initialFixtureTableNameFor(exercise) {
  return exercise.initialLoadTable ?? fixtureTableNameFor(exercise);
}
