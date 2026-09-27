/**
 * Genera sample-fixture.mjs, la muestra mínima incrustada del laboratorio:
 * las preguntas del primer trimestre de 2016 de la muestra JSONL de
 * dsevilla/bd2-data. Usa la misma transformación que la página
 * (dataset.mjs), así que la muestra sin red y la descargada coinciden.
 *
 *   node addendum/practice-web/cassandra/tools/make-fixture.mjs <directorio-jsonl>
 *
 * <directorio-jsonl> contiene Posts-sample.jsonl.gz y Users-sample.jsonl.gz
 * (por ejemplo, es.stackoverflow/jsonl de un clon de bd2-data).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { questionsFromJsonl } from "../dataset.mjs";

const MONTHS = ["2016-01", "2016-02", "2016-03"];
const directory = process.argv[2];
if (!directory) {
  console.error("Uso: node make-fixture.mjs <directorio con Posts-sample.jsonl.gz y Users-sample.jsonl.gz>");
  process.exit(2);
}
const read = (name) => gunzipSync(readFileSync(join(directory, name))).toString("utf8");
const questions = questionsFromJsonl(read("Posts-sample.jsonl.gz"), read("Users-sample.jsonl.gz"), { months: MONTHS });
if (!questions.length) throw new Error("La muestra no contiene preguntas de esos meses");
const lines = questions.map((question) => `  ${JSON.stringify(question)},`);
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "sample-fixture.mjs");
writeFileSync(target, `// Generado por tools/make-fixture.mjs a partir de Posts-sample.jsonl.gz y
// Users-sample.jsonl.gz de dsevilla/bd2-data. No editar a mano.
// Contenido de Stack Overflow en español, licencia CC BY-SA.
export const FIXTURE_MONTHS = Object.freeze(${JSON.stringify(MONTHS)});

export const FIXTURE_QUESTIONS = Object.freeze([
${lines.join("\n")}
]);
`);
console.log(`${questions.length} preguntas escritas en ${target}`);
