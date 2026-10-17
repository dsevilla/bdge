/*
 * Escritura y modelado: MERGE frente a CREATE y la construcción de una relación
 * derivada, con Cypher que funciona igual en Neo4j. La relación INTERESTED_IN la
 * declara la página al construir el grafo (Ladybug exige el esquema; Neo4j no),
 * así que ningún ejercicio necesita DDL propio de este motor. Los ejercicios que
 * escriben cambian el grafo y no tienen comprobación automática: el botón
 * «Reconstruir el grafo» del panel de arriba lo deja como estaba.
 */
export const page = {
  id: "escritura",
  title: "3 · Escritura y modelado",
  description: "MERGE frente a CREATE, una relación derivada y cómo se distinguen preguntas y respuestas.",
  exercises: [
    {
      id: "poblar-interes",
      title: "MERGE para no duplicar",
      prompt: "Vas a derivar los intereses de cada usuario a partir de las etiquetas de sus preguntas. Crea la relación INTERESTED_IN, de :User a :Tag, con una propiedad preguntas que guarde cuántas preguntas ha escrito sobre esa etiqueta. Usa MERGE, que crea la relación sólo si no existe, y SET para dejar el contador. Termina devolviendo cuántas relaciones han quedado. Tarda un poco: recorre todo el grafo.",
      solution: `MATCH (u:User)-[:WROTE]->(p:Post)-[:TAGGED_WITH]->(t:Tag)
WHERE p.PostTypeId = 1
WITH u, t, count(*) AS preguntas
MERGE (u)-[i:INTERESTED_IN]->(t)
SET i.preguntas = preguntas
RETURN count(*) AS relaciones`
    },
    {
      id: "consultar-interes",
      title: "Consulta la relación que acabas de crear",
      prompt: "Con INTERESTED_IN ya poblada (ejercicio anterior), devuelve los diez usuarios con más preguntas sobre «python», con su nombre y el contador, desempatando por nombre.",
      solution: `MATCH (u:User)-[i:INTERESTED_IN]->(t:Tag)
WHERE t.TagName = 'python'
RETURN u.DisplayName AS usuario, i.preguntas AS preguntas
ORDER BY preguntas DESC, usuario
LIMIT 10`
    },
    {
      id: "merge-idempotente",
      title: "Repite la carga y comprueba que no duplica",
      prompt: "Vuelve a ejecutar el MERGE del primer ejercicio y después cuenta las relaciones INTERESTED_IN. El número no cambia: eso es la idempotencia que en el boletín se demuestra frente a CREATE, que sí las duplicaría.",
      starter: `MATCH ()-[i:INTERESTED_IN]->()
RETURN count(*) AS intereses`,
      solution: `MATCH ()-[i:INTERESTED_IN]->()
RETURN count(*) AS intereses`
    },
    {
      id: "modelar-pregunta-respuesta",
      title: "Preguntas y respuestas en el mismo tipo de nodo",
      prompt: "Preguntas y respuestas son nodos :Post y se distinguen por la propiedad PostTypeId (1 pregunta, 2 respuesta), como en el dump. Comprueba el reparto: cuenta las publicaciones por PostTypeId, en orden ascendente.",
      solution: `MATCH (p:Post)
RETURN p.PostTypeId AS tipo, count(*) AS publicaciones
ORDER BY tipo`
    }
  ]
};
