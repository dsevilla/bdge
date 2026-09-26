/*
 * Escritura y modelado: por qué hace falta declarar el esquema, CREATE frente
 * a MERGE y la construcción de una relación derivada. Los ejercicios que
 * escriben cambian el grafo, así que no tienen comprobación automática: el
 * botón «Reconstruir el grafo» del panel de arriba lo deja como estaba.
 */
export const page = {
  id: "escritura",
  title: "3 · Escritura y modelado",
  description: "El esquema como decisión de modelado, CREATE frente a MERGE y una relación derivada.",
  exercises: [
    {
      id: "etiqueta-no-declarada",
      title: "Lee el error: no hay etiquetas libres",
      prompt: "Ejecuta esto tal cual y lee el mensaje. En Neo4j crearía un nodo con una etiqueta nueva sin más; aquí falla, porque :Experto no existe como tabla. Ése es el precio del almacenamiento tipado que hace rápidos los recorridos.",
      starter: `CREATE (e:Experto {nombre: 'alguien'})`,
      solution: `CREATE (e:Experto {nombre: 'alguien'})`
    },
    {
      id: "declarar-interes",
      title: "Declara una relación antes de usarla",
      prompt: "Vas a derivar los intereses de cada usuario a partir de las etiquetas sobre las que escribe. Antes hay que declarar la tabla de relación: crea INTERESTED_IN, que va de User a Tag y guarda un entero preguntas.",
      starter: `CREATE REL TABLE INTERESTED_IN(FROM User TO Tag, preguntas INT64)`,
      solution: `CREATE REL TABLE INTERESTED_IN(FROM User TO Tag, preguntas INT64)`
    },
    {
      id: "poblar-interes",
      title: "MERGE para no duplicar",
      prompt: "Crea la relación INTERESTED_IN entre cada usuario y las etiquetas de sus preguntas, con el número de preguntas que ha escrito sobre cada una. Usa MERGE, que crea la relación sólo si no existe, y SET para dejar el contador. Termina devolviendo cuántas relaciones han quedado, para ver el efecto. Tarda un segundo: está recorriendo todo el grafo.",
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
      prompt: "Con INTERESTED_IN ya poblada (ejercicios anteriores), devuelve los diez usuarios con más preguntas sobre «python», con su nombre y el contador, desempatando por nombre.",
      solution: `MATCH (u:User)-[i:INTERESTED_IN]->(t:Tag)
WHERE t.TagName = 'python'
RETURN u.DisplayName AS usuario, i.preguntas AS preguntas
ORDER BY preguntas DESC, usuario
LIMIT 10`
    },
    {
      id: "merge-idempotente",
      title: "Repite la carga y comprueba que no duplica",
      prompt: "Vuelve a ejecutar el MERGE del ejercicio 3 y después cuenta las relaciones INTERESTED_IN. El número no cambia: eso es la idempotencia que en el boletín se demuestra frente a CREATE, que sí las duplicaría.",
      starter: `MATCH ()-[i:INTERESTED_IN]->()
RETURN count(*) AS intereses`,
      solution: `MATCH ()-[i:INTERESTED_IN]->()
RETURN count(*) AS intereses`
    },
    {
      id: "modelar-pregunta-respuesta",
      title: "Por qué PostTypeId y no dos etiquetas",
      prompt: "En Neo4j modelarías (:Post:Question) y (:Post:Answer) con dos etiquetas por nodo. Aquí un nodo tiene una sola, así que la distinción vive en una propiedad. Comprueba el reparto: cuenta las publicaciones por PostTypeId, en orden ascendente.",
      solution: `MATCH (p:Post)
RETURN p.PostTypeId AS tipo, count(*) AS publicaciones
ORDER BY tipo`
    }
  ]
};
