/*
 * Repaso para el examen: un ejercicio por cada punto de la «Guía de estudio para
 * el examen» de `neo4j/sesion7.ipynb` que se puede practicar con este grafo. Cada
 * enunciado cita el punto que repasa. Los valores (etiquetas, umbrales, número de
 * filas) no son los de los ejercicios del boletín: aquí hay solución a la vista y
 * allí no, así que no se repite ninguno. Todas las soluciones son de sólo lectura
 * y terminan con un orden determinista, para que «Comprobar» pueda compararlas.
 */
export const page = {
  id: "repaso",
  title: "4 · Repaso",
  description: "Un ejercicio por cada punto de la guía de estudio del boletín: ranking, UNWIND, agregación, WITH, OPTIONAL MATCH y planes.",
  exercises: [
    {
      id: "numerar-un-ranking",
      title: "Numerar un ranking",
      prompt: "Guía de estudio: «Numerar un ranking con collect() y UNWIND range(...)». Cypher no numera las filas de un resultado ordenado: se ordena, se recogen las filas en una lista con collect() y se recorren sus posiciones con UNWIND range(0, size(lista) - 1). Devuelve los cinco usuarios con más respuestas escritas (PostTypeId = 2), con su puesto del 1 al 5, su nombre y su número de respuestas, desempatando por Id de usuario.",
      solution: `MATCH (u:User)-[:WROTE]->(a:Post)
WHERE a.PostTypeId = 2
WITH u, count(a) AS respuestas
ORDER BY respuestas DESC, u.Id
LIMIT 5
WITH collect({usuario: u.DisplayName, respuestas: respuestas}) AS top
UNWIND range(0, size(top) - 1) AS idx
RETURN idx + 1 AS puesto, top[idx].usuario AS usuario, top[idx].respuestas AS respuestas`
    },
    {
      id: "unwind-lista-de-mapas",
      title: "Convertir una lista de mapas en filas",
      prompt: "Guía de estudio: «Usar UNWIND para convertir una lista de mapas en filas». Dada la lista [{etiqueta: 'mysql', minimo: 1000}, {etiqueta: 'postgresql', minimo: 100}, {etiqueta: 'mongodb', minimo: 100}], devuelve para cada mapa el nombre de la etiqueta, cuántas publicaciones tiene y si llega al mínimo del mapa (un booleano). Ordena por nombre de etiqueta.",
      solution: `UNWIND [{etiqueta: 'mysql', minimo: 1000}, {etiqueta: 'postgresql', minimo: 100}, {etiqueta: 'mongodb', minimo: 100}] AS fila
MATCH (t:Tag {TagName: fila.etiqueta})<-[:TAGGED_WITH]-(p:Post)
WITH fila, count(p) AS publicaciones
RETURN fila.etiqueta AS etiqueta, publicaciones, publicaciones >= fila.minimo AS llega_al_minimo
ORDER BY etiqueta`
    },
    {
      id: "count-frente-a-count-distinct",
      title: "count(x) frente a count(DISTINCT x)",
      prompt: "Guía de estudio: «Distinguir count(x) de count(DISTINCT x) en un recorrido de varios saltos». Recorre etiqueta «mysql» → pregunta → respuesta → autor de la respuesta. Devuelve en una sola fila cuántas coincidencias tiene el patrón (count(*)), cuántas preguntas cuenta count(q), cuántas preguntas distintas hay y cuántos autores distintos de respuestas. Una pregunta con varias respuestas se repite en varias filas.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(q:Post)<-[:ANSWERS]-(a:Post)<-[:WROTE]-(u:User)
WHERE t.TagName = 'mysql'
RETURN count(*) AS filas,
       count(q) AS preguntas_con_repeticion,
       count(DISTINCT q) AS preguntas,
       count(DISTINCT u) AS autores`
    },
    {
      id: "collect-y-size",
      title: "Recoger valores en una lista",
      prompt: "Guía de estudio: «Escribir agregaciones con count(), collect() y ORDER BY/LIMIT». Devuelve las cinco primeras preguntas (por Id) que tienen cinco etiquetas, con su Id y la lista de sus etiquetas en orden alfabético. Ordena las etiquetas antes de recogerlas con collect() y filtra con size() después de agrupar, en un WITH.",
      solution: `MATCH (p:Post)-[:TAGGED_WITH]->(t:Tag)
WHERE p.PostTypeId = 1
WITH p, t
ORDER BY t.TagName
WITH p, collect(t.TagName) AS etiquetas
WHERE size(etiquetas) = 5
RETURN p.Id AS pregunta, etiquetas
ORDER BY pregunta
LIMIT 5`
    },
    {
      id: "with-agregar-y-filtrar",
      title: "WITH para agregar y filtrar el resultado",
      prompt: "Guía de estudio: «Usar WITH para encadenar etapas y agregar resultados intermedios». Un WHERE no puede filtrar por una agregación, pero sí el WHERE que sigue a un WITH. Devuelve los diez usuarios que han respondido a más de veinte preguntas distintas, con su nombre y ese número, ordenados por número descendente y desempatando por Id de usuario.",
      solution: `MATCH (u:User)-[:WROTE]->(:Post)-[:ANSWERS]->(q:Post)
WITH u, count(DISTINCT q) AS preguntas
WHERE preguntas > 20
RETURN u.DisplayName AS usuario, preguntas
ORDER BY preguntas DESC, u.Id
LIMIT 10`
    },
    {
      id: "where-en-optional-match",
      title: "Un WHERE mal colocado pierde filas",
      prompt: "Guía de estudio: «Usar OPTIONAL MATCH para conservar nodos sin una relación concreta, y explicar qué pasaría con un WHERE mal colocado». Se quiere saber, para cada una de las diez preguntas más vistas (desempata por Id), cuántas respuestas con 15 o más puntos tiene, con 0 si no tiene ninguna. La consulta del editor las pierde: el WHERE va después del WITH y descarta las filas donde a es nulo. Corrígela moviendo la condición al propio OPTIONAL MATCH, y compara cuántas preguntas devuelve cada versión.",
      starter: `MATCH (p:Post)
WHERE p.PostTypeId = 1
WITH p
ORDER BY p.ViewCount DESC, p.Id
LIMIT 10
OPTIONAL MATCH (a:Post)-[:ANSWERS]->(p)
WITH p, a
WHERE a.Score >= 15
RETURN p.Id AS pregunta, count(a) AS respuestas_destacadas
ORDER BY pregunta`,
      solution: `MATCH (p:Post)
WHERE p.PostTypeId = 1
WITH p
ORDER BY p.ViewCount DESC, p.Id
LIMIT 10
OPTIONAL MATCH (a:Post)-[:ANSWERS]->(p)
WHERE a.Score >= 15
RETURN p.Id AS pregunta, count(a) AS respuestas_destacadas
ORDER BY pregunta`
    },
    {
      id: "indice-en-el-plan",
      title: "Leer un plan: ¿se usa el índice?",
      prompt: "Guía de estudio: «Leer un EXPLAIN (plan) y un PROFILE (medida real)» y «Explicar por qué transformar una propiedad indexada (toLower(t.TagName)) le impide a Neo4j usar el índice». TagName tiene una restricción de unicidad, así que tiene índice. Ejecuta el EXPLAIN del editor y localiza la línea del filtro por TagName: lleva [index: TagName]. Cambia el filtro por WHERE toLower(t.TagName) = 'docker' y compara: el índice desaparece y el filtro se aplica a todas las etiquetas. Cambia EXPLAIN por PROFILE para ver cuántas filas, rows=, procesa cada operador. Este motor no cuenta db hits ni usa los nombres de operadores de Neo4j (NodeIndexSeek, NodeByLabelScan); lo que se compara es lo mismo, pero ese ejercicio con cifras reales se hace en el Neo4j de clase. No tiene solución que comprobar.",
      starter: `EXPLAIN
MATCH (t:Tag {TagName: 'docker'})<-[:TAGGED_WITH]-(p:Post)
RETURN count(p) AS preguntas`
    }
  ]
};
