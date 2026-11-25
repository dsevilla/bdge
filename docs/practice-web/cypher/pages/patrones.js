/*
 * Patrones básicos de Cypher, al hilo de la sesión 7. Añade nuevos objetos a
 * `exercises`; el editor se crea vacío.
 */
export const page = {
  id: "patrones",
  title: "1 · Patrones",
  description: "MATCH, filtros, proyección, orden, OPTIONAL MATCH, NOT EXISTS, expresiones regulares, DISTINCT y agregación sobre el grafo.",
  exercises: [
    {
      id: "contar-usuarios",
      title: "Cuenta los nodos de un tipo",
      prompt: "Cuenta cuántos nodos :User hay en el grafo.",
      solution: `MATCH (u:User)
RETURN count(*) AS usuarios`
    },
    {
      id: "nodos-por-etiqueta",
      title: "Cuántos nodos hay de cada tipo",
      prompt: "Antes de preguntar nada conviene saber qué hay en el grafo. Devuelve, para cada combinación de etiquetas, cuántos nodos tiene, ordenado por número de nodos descendente. Usa labels(n).",
      solution: `MATCH (n)
RETURN labels(n) AS etiquetas, count(*) AS nodos
ORDER BY nodos DESC, etiquetas`
    },
    {
      id: "preguntas-mas-vistas",
      title: "Filtra, proyecta y ordena",
      prompt: "Las preguntas llevan, además de :Post, la etiqueta :Question, que la carga añade a los posts con PostTypeId = 1 (como en el boletín). Devuelve las diez más vistas con su Id, su título y ViewCount, ordenadas por vistas descendente y desempatando por Id.",
      solution: `MATCH (p:Question)
RETURN p.Id AS id, p.Title AS titulo, p.ViewCount AS vistas
ORDER BY vistas DESC, id
LIMIT 10`
    },
    {
      id: "respuestas-mejor-valoradas",
      title: "Las respuestas mejor valoradas",
      prompt: "Las respuestas llevan la etiqueta :Answer y apuntan a su pregunta con [:ANSWERS]. Devuelve las ocho respuestas con más puntuación, con su Id, su puntuación y el título de la pregunta a la que responden, desempatando por Id.",
      solution: `MATCH (a:Answer)-[:ANSWERS]->(q:Question)
RETURN a.Id AS id, a.Score AS puntuacion, q.Title AS pregunta
ORDER BY puntuacion DESC, id
LIMIT 8`
    },
    {
      id: "autor-de-la-pregunta",
      title: "Recorre una relación",
      prompt: "Un usuario escribe preguntas y respuestas: (:User)-[:WROTE]->(:Question) o (:Answer). Devuelve las diez preguntas con más puntuación junto al nombre de quien las escribió, ordenadas por puntuación descendente e Id ascendente.",
      solution: `MATCH (u:User)-[:WROTE]->(p:Question)
RETURN p.Id AS id, p.Title AS pregunta, p.Score AS puntuacion, u.DisplayName AS autor
ORDER BY puntuacion DESC, id
LIMIT 10`
    },
    {
      id: "dibuja-un-trozo",
      title: "Devuelve nodos y relaciones, no columnas",
      prompt: "Si en vez de propiedades devuelves los propios nodos y relaciones, la página los dibuja. Devuelve las diez preguntas de mayor puntuación junto a su autor y la relación que los une, usando variables para los tres.",
      solution: `MATCH (u:User)-[w:WROTE]->(p:Question)
WITH u, w, p
ORDER BY p.Score DESC, p.Id
LIMIT 10
RETURN u, w, p`
    },
    {
      id: "etiquetas-de-una-pregunta",
      title: "Encadena dos patrones con WITH",
      prompt: "Toma la pregunta con más puntuación (desempata por Id) y devuelve sus etiquetas, una por fila, en orden alfabético. Necesitas un WITH entre los dos MATCH para arrastrar la pregunta elegida.",
      solution: `MATCH (p:Question)
WITH p
ORDER BY p.Score DESC, p.Id
LIMIT 1
MATCH (p)-[:TAGGED_WITH]->(t:Tag)
RETURN p.Title AS pregunta, t.TagName AS etiqueta
ORDER BY etiqueta`
    },
    {
      id: "preguntas-sin-respuesta",
      title: "Lo que no está: OPTIONAL MATCH",
      prompt: "Una respuesta apunta a su pregunta con (:Answer)-[:ANSWERS]->(:Question). Cuenta cuántas preguntas no tienen ninguna respuesta, usando OPTIONAL MATCH y contando las coincidencias.",
      solution: `MATCH (p:Question)
OPTIONAL MATCH (a:Answer)-[:ANSWERS]->(p)
WITH p, count(a) AS respuestas
WHERE respuestas = 0
RETURN count(*) AS sin_respuesta`
    },
    {
      id: "preguntas-sin-respuesta-not-exists",
      title: "Lo que no está, sin OPTIONAL MATCH: NOT EXISTS",
      prompt: "La misma idea que en el ejercicio anterior, pero devolviendo las preguntas en vez de contarlas y sin OPTIONAL MATCH: filtra con NOT EXISTS { MATCH ... }. Devuelve las cinco preguntas sin respuesta con más vistas, con su Id, su título y ViewCount, desempatando por Id.",
      solution: `MATCH (p:Question)
WHERE NOT EXISTS { MATCH (:Answer)-[:ANSWERS]->(p) }
RETURN p.Id AS id, p.Title AS titulo, p.ViewCount AS vistas
ORDER BY vistas DESC, id
LIMIT 5`
    },
    {
      id: "autor-y-numero-de-respuestas",
      title: "Autor y número de respuestas en una sola consulta",
      prompt: "Para las cinco preguntas más vistas que tengan autor en el grafo (desempata por Id), devuelve en una sola consulta su Id, el nombre de quien la escribió y cuántas respuestas tiene. Las respuestas se cuentan con OPTIONAL MATCH después de quedarte con las cinco preguntas, para que una pregunta sin respuestas aparezca con 0. Ordena por Id de pregunta.",
      solution: `MATCH (u:User)-[:WROTE]->(p:Question)
WITH u, p
ORDER BY p.ViewCount DESC, p.Id
LIMIT 5
OPTIONAL MATCH (a:Answer)-[:ANSWERS]->(p)
RETURN p.Id AS pregunta, u.DisplayName AS autor, count(a) AS respuestas
ORDER BY pregunta`
    },
    {
      id: "etiquetas-mas-usadas",
      title: "Agrupa contando relaciones",
      prompt: "Devuelve las diez etiquetas con más preguntas asociadas, con su nombre y el número de preguntas, desempatando por nombre.",
      solution: `MATCH (:Question)-[:TAGGED_WITH]->(t:Tag)
RETURN t.TagName AS etiqueta, count(*) AS preguntas
ORDER BY preguntas DESC, etiqueta
LIMIT 10`
    },
    {
      id: "etiquetas-por-expresion-regular",
      title: "Filtra con una expresión regular",
      prompt: "Un predicado puede usar una expresión regular con =~, que debe coincidir con el valor entero. Devuelve las etiquetas cuyo nombre empieza por «python» (la propia «python», «python-3.x»...) con su número de usos, Count, ordenadas por usos descendente y por nombre.",
      solution: `MATCH (t:Tag)
WHERE t.TagName =~ 'python.*'
RETURN t.TagName AS etiqueta, t.Count AS usos
ORDER BY usos DESC, etiqueta`
    },
    {
      id: "usuarios-de-una-etiqueta",
      title: "Cuenta sin repetir",
      prompt: "¿Cuántos usuarios distintos han escrito alguna pregunta etiquetada con «python»? Recorre el patrón de tres nodos y cuenta usuarios distintos, no preguntas.",
      solution: `MATCH (u:User)-[:WROTE]->(:Question)-[:TAGGED_WITH]->(t:Tag)
WHERE t.TagName = 'python'
RETURN count(DISTINCT u) AS usuarios`
    }
  ]
};
