/*
 * Recorridos de varios saltos: lo que un grafo hace mejor que una tabla.
 * Todos los pipelines terminan con un orden determinista para que
 * «Comprobar» pueda compararlos con la solución.
 */
export const page = {
  id: "recorridos",
  title: "2 · Recorridos",
  description: "Caminos de varios saltos, coaparición de etiquetas, reciprocidad, recomendaciones explicables y caminos mínimos.",
  exercises: [
    {
      id: "quien-responde-a-quien",
      title: "Un camino de cuatro nodos",
      prompt: "Quién contesta a quién: recorre autor de la respuesta → respuesta → pregunta → autor de la pregunta, descartando a quien se responde a sí mismo. Devuelve los diez pares que más se repiten, desempatando por los dos nombres.",
      solution: `MATCH (a:User)-[:WROTE]->(:Answer)-[:ANSWERS]->(:Question)<-[:WROTE]-(b:User)
WHERE a.Id <> b.Id
RETURN a.DisplayName AS responde, b.DisplayName AS pregunta, count(*) AS veces
ORDER BY veces DESC, responde, pregunta
LIMIT 10`
    },
    {
      id: "etiquetas-que-coaparecen",
      title: "Vecinos de un nodo a dos saltos",
      prompt: "¿Con qué otras etiquetas aparece «python» en la misma pregunta? Sal de la etiqueta, vuelve por la pregunta y llega a la otra etiqueta. Devuelve las diez más frecuentes, sin contar «python», desempatando por nombre.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(p:Question)-[:TAGGED_WITH]->(otra:Tag)
WHERE t.TagName = 'python' AND otra.TagName <> 'python'
RETURN otra.TagName AS etiqueta, count(*) AS veces
ORDER BY veces DESC, etiqueta
LIMIT 10`
    },
    {
      id: "expertos-por-etiqueta",
      title: "Quién responde sobre un tema",
      prompt: "Los diez usuarios con más respuestas en preguntas etiquetadas con «javascript». Recorre desde la etiqueta hasta el autor de la respuesta y cuenta, desempatando por nombre.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(q:Question)<-[:ANSWERS]-(r:Answer)<-[:WROTE]-(u:User)
WHERE t.TagName = 'javascript'
RETURN u.DisplayName AS usuario, count(*) AS respuestas
ORDER BY respuestas DESC, usuario
LIMIT 10`
    },
    {
      id: "camino-dibujado",
      title: "Devuelve caminos completos",
      prompt: "Cypher sabe devolver un camino entero si le pones nombre al patrón. Devuelve diez caminos desde la etiqueta «docker» hasta el usuario que escribió la pregunta, ordenados por el Id de la pregunta, y míralos dibujados. El ORDER BY puede usar una variable del patrón aunque no la devuelvas.",
      solution: `MATCH ruta = (t:Tag)<-[:TAGGED_WITH]-(p:Question)<-[:WROTE]-(u:User)
WHERE t.TagName = 'docker'
RETURN ruta
ORDER BY p.Id
LIMIT 10`
    },
    {
      id: "colaboracion-reciproca",
      title: "Ida y vuelta",
      prompt: "Dos usuarios colaboran en los dos sentidos cuando cada uno ha respondido alguna pregunta del otro. Devuelve los diez pares recíprocos con más respuestas cruzadas, contando cada par una sola vez (quédate con el orden en que el Id del primero es menor) y desempatando por los dos nombres.",
      solution: `MATCH (a:User)-[:WROTE]->(:Answer)-[:ANSWERS]->(:Question)<-[:WROTE]-(b:User)
WHERE a.Id < b.Id
WITH a, b, count(*) AS ida
MATCH (b)-[:WROTE]->(:Answer)-[:ANSWERS]->(:Question)<-[:WROTE]-(a)
WITH a, b, ida, count(*) AS vuelta
RETURN a.DisplayName AS primero, b.DisplayName AS segundo, ida + vuelta AS respuestas
ORDER BY respuestas DESC, primero, segundo
LIMIT 10`
    },
    {
      id: "recomendacion-explicable",
      title: "Una recomendación que se puede explicar",
      prompt: "A quien pregunta sobre «python», ¿qué otro tema podría interesarle? Busca las etiquetas de las preguntas que han escrito los usuarios que también preguntan sobre «python», descartando «python» misma. Devuelve las diez más frecuentes con el número de usuarios distintos que las usan, desempatando por etiqueta.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(:Question)<-[:WROTE]-(u:User)
WHERE t.TagName = 'python'
WITH DISTINCT u
MATCH (u)-[:WROTE]->(:Question)-[:TAGGED_WITH]->(otra:Tag)
WHERE otra.TagName <> 'python'
RETURN otra.TagName AS etiqueta, count(DISTINCT u) AS usuarios
ORDER BY usuarios DESC, etiqueta
LIMIT 10`
    },
    {
      id: "longitud-variable",
      title: "Saltos de longitud variable",
      prompt: "Cypher permite repetir un tipo de relación un número variable de veces. Partiendo de la etiqueta «sql», recorre dos saltos de TAGGED_WITH sin fijar la dirección —de la etiqueta a la pregunta y de ahí a otra etiqueta— y devuelve las diez etiquetas alcanzadas más veces, sin contar «sql».",
      solution: `MATCH (t:Tag)-[:TAGGED_WITH*2..2]-(otra:Tag)
WHERE t.TagName = 'sql' AND otra.TagName <> 'sql'
RETURN otra.TagName AS etiqueta, count(*) AS caminos
ORDER BY caminos DESC, etiqueta
LIMIT 10`
    },
    {
      id: "camino-minimo",
      title: "El camino más corto entre dos usuarios",
      prompt: "¿Cuántos saltos separan a los usuarios con Id 20 y 22? Usa shortestPath sobre cualquier tipo de relación y en cualquier dirección ([*]), y devuelve la longitud del camino con length(). Un salto es una relación, no un nodo. Cuando lo tengas, devuelve el propio camino en vez de su longitud para verlo dibujado.",
      solution: `MATCH ruta = shortestPath((a:User {Id: 20})-[*]-(b:User {Id: 22}))
RETURN length(ruta) AS saltos`
    },
    {
      id: "todos-los-caminos-minimos",
      title: "Todos los caminos mínimos",
      prompt: "shortestPath devuelve un camino de los más cortos; allShortestPaths los devuelve todos. Cuenta cuántos caminos mínimos hay entre los usuarios 20 y 22 y devuelve ese número junto con su longitud.",
      solution: `MATCH ruta = allShortestPaths((a:User {Id: 20})-[*]-(b:User {Id: 22}))
RETURN count(ruta) AS caminos, length(ruta) AS saltos`
    },
    {
      id: "camino-por-tipos",
      title: "Limita los tipos de relación del recorrido",
      prompt: "El camino anterior puede pasar por etiquetas (:Tag). Repite la búsqueda entre los usuarios 20 y 22 pero recorriendo sólo [:WROTE|ANSWERS], es decir, a través de preguntas y respuestas, y devuelve la longitud. Restringir el recorrido nunca puede acortar el camino: compáralo con el del ejercicio anterior.",
      solution: `MATCH ruta = shortestPath((a:User {Id: 20})-[:WROTE|ANSWERS*]-(b:User {Id: 22}))
RETURN length(ruta) AS saltos`
    }
  ]
};
