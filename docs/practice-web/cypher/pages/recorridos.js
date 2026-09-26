/*
 * Recorridos de varios saltos: lo que un grafo hace mejor que una tabla.
 * Todos los pipelines terminan con un orden determinista para que
 * «Comprobar» pueda compararlos con la solución.
 */
export const page = {
  id: "recorridos",
  title: "2 · Recorridos",
  description: "Caminos de varios saltos, coaparición de etiquetas, reciprocidad y recomendaciones explicables.",
  exercises: [
    {
      id: "quien-responde-a-quien",
      title: "Un camino de cuatro nodos",
      prompt: "Quién contesta a quién: recorre autor de la respuesta → respuesta → pregunta → autor de la pregunta, descartando a quien se responde a sí mismo. Devuelve los diez pares que más se repiten, desempatando por los dos nombres.",
      solution: `MATCH (a:User)-[:WROTE]->(:Post)-[:ANSWERS]->(:Post)<-[:WROTE]-(b:User)
WHERE a.Id <> b.Id
RETURN a.DisplayName AS responde, b.DisplayName AS pregunta, count(*) AS veces
ORDER BY veces DESC, responde, pregunta
LIMIT 10`
    },
    {
      id: "etiquetas-que-coaparecen",
      title: "Vecinos de un nodo a dos saltos",
      prompt: "¿Con qué otras etiquetas aparece «python» en la misma publicación? Sal de la etiqueta, vuelve por la publicación y llega a la otra etiqueta. Devuelve las diez más frecuentes, sin contar «python», desempatando por nombre.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(p:Post)-[:TAGGED_WITH]->(otra:Tag)
WHERE t.TagName = 'python' AND otra.TagName <> 'python'
RETURN otra.TagName AS etiqueta, count(*) AS veces
ORDER BY veces DESC, etiqueta
LIMIT 10`
    },
    {
      id: "expertos-por-etiqueta",
      title: "Quién responde sobre un tema",
      prompt: "Los diez usuarios con más respuestas en preguntas etiquetadas con «javascript». Recorre desde la etiqueta hasta el autor de la respuesta y cuenta, desempatando por nombre.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(q:Post)<-[:ANSWERS]-(r:Post)<-[:WROTE]-(u:User)
WHERE t.TagName = 'javascript'
RETURN u.DisplayName AS usuario, count(*) AS respuestas
ORDER BY respuestas DESC, usuario
LIMIT 10`
    },
    {
      id: "camino-dibujado",
      title: "Devuelve caminos completos",
      prompt: "Cypher sabe devolver un camino entero si le pones nombre al patrón. Devuelve diez caminos desde la etiqueta «docker» hasta el usuario que escribió la publicación, ordenados por el Id de la publicación, y míralos dibujados. El ORDER BY puede usar una variable del patrón aunque no la devuelvas.",
      solution: `MATCH ruta = (t:Tag)<-[:TAGGED_WITH]-(p:Post)<-[:WROTE]-(u:User)
WHERE t.TagName = 'docker'
RETURN ruta
ORDER BY p.Id
LIMIT 10`
    },
    {
      id: "colaboracion-reciproca",
      title: "Ida y vuelta",
      prompt: "Dos usuarios colaboran en los dos sentidos cuando cada uno ha respondido alguna pregunta del otro. Devuelve los diez pares recíprocos con más respuestas cruzadas, contando cada par una sola vez (quédate con el orden en que el Id del primero es menor) y desempatando por los dos nombres.",
      solution: `MATCH (a:User)-[:WROTE]->(:Post)-[:ANSWERS]->(:Post)<-[:WROTE]-(b:User)
WHERE a.Id < b.Id
WITH a, b, count(*) AS ida
MATCH (b)-[:WROTE]->(:Post)-[:ANSWERS]->(:Post)<-[:WROTE]-(a)
WITH a, b, ida, count(*) AS vuelta
RETURN a.DisplayName AS primero, b.DisplayName AS segundo, ida + vuelta AS respuestas
ORDER BY respuestas DESC, primero, segundo
LIMIT 10`
    },
    {
      id: "recomendacion-explicable",
      title: "Una recomendación que se puede explicar",
      prompt: "A quien pregunta sobre «python», ¿qué otro tema podría interesarle? Busca las etiquetas de las preguntas que han escrito los usuarios que también preguntan sobre «python», descartando «python» misma. Devuelve las diez más frecuentes con el número de usuarios distintos que las usan, desempatando por etiqueta.",
      solution: `MATCH (t:Tag)<-[:TAGGED_WITH]-(:Post)<-[:WROTE]-(u:User)
WHERE t.TagName = 'python'
WITH DISTINCT u
MATCH (u)-[:WROTE]->(:Post)-[:TAGGED_WITH]->(otra:Tag)
WHERE otra.TagName <> 'python'
RETURN otra.TagName AS etiqueta, count(DISTINCT u) AS usuarios
ORDER BY usuarios DESC, etiqueta
LIMIT 10`
    },
    {
      id: "longitud-variable",
      title: "Saltos de longitud variable",
      prompt: "Cypher permite repetir un tipo de relación un número variable de veces. Partiendo de la etiqueta «sql», recorre dos saltos de TAGGED_WITH sin fijar la dirección —de la etiqueta a la publicación y de ahí a otra etiqueta— y devuelve las diez etiquetas alcanzadas más veces, sin contar «sql».",
      solution: `MATCH (t:Tag)-[:TAGGED_WITH*2..2]-(otra:Tag)
WHERE t.TagName = 'sql' AND otra.TagName <> 'sql'
RETURN otra.TagName AS etiqueta, count(*) AS caminos
ORDER BY caminos DESC, etiqueta
LIMIT 10`
    }
  ]
};
