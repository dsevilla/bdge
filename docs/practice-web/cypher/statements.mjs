// Separa las sentencias de un texto por los `;` que no están dentro de una
// cadena ni de un comentario, como hace Neo4j Browser. Grafeo ejecuta una
// sentencia por llamada; lo usan la práctica (engine-worker.mjs) y el grafo del
// curso (teoria/dot-cloud-neo4j/catalog.mjs).
export function splitStatements(text) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quote) {
      current += char;
      if (char === "\\") {
        current += next ?? "";
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
    } else if (char === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end - 1;
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 1;
    } else if (char === ";") {
      statements.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  statements.push(current);
  return statements.map(function (statement) { return statement.trim(); }).filter(Boolean);
}
