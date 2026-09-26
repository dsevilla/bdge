/*
 * Patrones básicos de Cypher, al hilo de la sesión 7. Añade nuevos objetos a
 * `exercises`; el editor se crea vacío.
 */
export const page = {
  id: "patrones",
  title: "1 · Patrones",
  description: "MATCH, filtros, proyección, orden, OPTIONAL MATCH, DISTINCT y agregación sobre el grafo.",
  exercises: [
    {
      id: "contar-usuarios",
      title: "Cuenta los nodos de un tipo",
      prompt: "Cuenta cuántos nodos :User hay en el grafo. Fíjate en que aquí :User no es una etiqueta suelta como en Neo4j, sino una tabla declarada en el esquema.",
      solution: `MATCH (u:User)
RETURN count(*) AS usuarios`
    },
    {
      id: "preguntas-mas-vistas",
      title: "Filtra, proyecta y ordena",
      prompt: "Las preguntas son los :Post con PostTypeId = 1. Devuelve las diez más vistas con su Id, su título y ViewCount, ordenadas por vistas descendente y desempatando por Id.",
      solution: `MATCH (p:Post)
WHERE p.PostTypeId = 1
RETURN p.Id AS id, p.Title AS titulo, p.ViewCount AS vistas
ORDER BY vistas DESC, id
LIMIT 10`
    },
    {
      id: "autor-de-la-pregunta",
      title: "Recorre una relación",
      prompt: "Un usuario escribe publicaciones: (:User)-[:WROTE]->(:Post). Devuelve las diez preguntas con más puntuación junto al nombre de quien las escribió, ordenadas por puntuación descendente e Id ascendente.",
      solution: `MATCH (u:User)-[:WROTE]->(p:Post)
WHERE p.PostTypeId = 1
RETURN p.Id AS id, p.Title AS pregunta, p.Score AS puntuacion, u.DisplayName AS autor
ORDER BY puntuacion DESC, id
LIMIT 10`
    },
    {
      id: "dibuja-un-trozo",
      title: "Devuelve nodos y relaciones, no columnas",
      prompt: "Si en vez de propiedades devuelves los propios nodos y relaciones, la página los dibuja. Devuelve las diez preguntas de mayor puntuación junto a su autor y la relación que los une, usando variables para los tres.",
      solution: `MATCH (u:User)-[w:WROTE]->(p:Post)
WHERE p.PostTypeId = 1
WITH u, w, p
ORDER BY p.Score DESC, p.Id
LIMIT 10
RETURN u, w, p`
    },
    {
      id: "etiquetas-de-una-pregunta",
      title: "Encadena dos patrones con WITH",
      prompt: "Toma la pregunta con más puntuación (desempata por Id) y devuelve sus etiquetas, una por fila, en orden alfabético. Necesitas un WITH entre los dos MATCH para arrastrar la pregunta elegida.",
      solution: `MATCH (p:Post)
WHERE p.PostTypeId = 1
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
      prompt: "Una respuesta apunta a su pregunta con (:Post)-[:ANSWERS]->(:Post). Cuenta cuántas preguntas no tienen ninguna respuesta, usando OPTIONAL MATCH y contando las coincidencias.",
      solution: `MATCH (p:Post)
WHERE p.PostTypeId = 1
OPTIONAL MATCH (a:Post)-[:ANSWERS]->(p)
WITH p, count(a) AS respuestas
WHERE respuestas = 0
RETURN count(*) AS sin_respuesta`
    },
    {
      id: "etiquetas-mas-usadas",
      title: "Agrupa contando relaciones",
      prompt: "Devuelve las diez etiquetas con más publicaciones asociadas, con su nombre y el número de publicaciones, desempatando por nombre.",
      solution: `MATCH (:Post)-[:TAGGED_WITH]->(t:Tag)
RETURN t.TagName AS etiqueta, count(*) AS publicaciones
ORDER BY publicaciones DESC, etiqueta
LIMIT 10`
    },
    {
      id: "usuarios-de-una-etiqueta",
      title: "Cuenta sin repetir",
      prompt: "¿Cuántos usuarios distintos han escrito alguna publicación etiquetada con «python»? Recorre el patrón de tres nodos y cuenta usuarios distintos, no publicaciones.",
      solution: `MATCH (u:User)-[:WROTE]->(:Post)-[:TAGGED_WITH]->(t:Tag)
WHERE t.TagName = 'python'
RETURN count(DISTINCT u) AS usuarios`
    }
  ]
};
