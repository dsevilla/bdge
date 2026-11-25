// Cómo se construye el grafo de Stack Overflow a partir del JSONL. Lo usan la
// página (app.js), que ejecuta estas sentencias en el motor y las muestra tal
// cual en «Cómo se ha creado este grafo», y las pruebas de
// addendum/practice-web/tests/exercises/, que cargan con ellas la muestra
// reducida y ejecutan las soluciones: lo que se prueba es lo que se ejecuta.

// La carga se declara aquí y se muestra tal cual en la página: lo que el alumno
// lee es exactamente lo que se ha ejecutado, y es Cypher de Neo4j. `$filas` es
// una lista de mapas que la página construye a partir del JSONL y envía en
// lotes de LOAD_BATCH_SIZE. El orden es el de una carga masiva en Neo4j:
// primero los nodos, sin índices que mantener; después las restricciones de
// unicidad, que crean el índice por el que se busca cada extremo; y al final
// las etiquetas y relaciones derivadas (DERIVED_STATEMENTS), con las sentencias
// de neo4j/sesion7.ipynb. No hace falta declarar nada más: las etiquetas, los tipos de
// relación y las propiedades existen en cuanto se crean, como INTERESTED_IN,
// que crea con MERGE la página «Escritura y modelado».
export const LOAD_BATCH_SIZE = 10000;

// Sin los nulos del JSONL: un mapa con una clave a null no crea la propiedad.
function presentFields(document, fields) {
  const row = {};
  fields.forEach(function (field) {
    if (document[field] !== null && document[field] !== undefined) row[field] = document[field];
  });
  return row;
}

// `source` es el fichero del que salen las filas de cada carga. La página lee
// cada fichero por lotes y, para cada documento, `row()` devuelve la fila de su
// nodo: así los nodos se envían al motor mientras el fichero aún se descarga,
// sin tenerlo entero en memoria.
export const NODE_LOADS = [
  {
    label: "User",
    source: "Users",
    statement: `UNWIND $filas AS fila
CREATE (:User {Id: fila.Id, DisplayName: fila.DisplayName, Reputation: fila.Reputation,
               Location: fila.Location, CreationDate: datetime(fila.CreationDate)})`,
    row: function (user) {
      return presentFields(user, ["Id", "DisplayName", "Reputation", "Location", "CreationDate"]);
    }
  },
  // Como en neo4j/sesion7.ipynb, el post conserva las referencias del documento
  // (OwnerUserId, ParentId, AcceptedAnswerId y la cadena Tags): de ellas salen
  // las relaciones (DERIVED_STATEMENTS), y las consultas que las leen
  // (`q.AcceptedAnswerId = r.Id`) funcionan igual que en el boletín.
  {
    label: "Post",
    source: "Posts",
    statement: `UNWIND $filas AS fila
CREATE (:Post {Id: fila.Id, PostTypeId: fila.PostTypeId, Title: fila.Title, Score: fila.Score,
               ViewCount: fila.ViewCount, CreationDate: datetime(fila.CreationDate),
               OwnerUserId: fila.OwnerUserId, ParentId: fila.ParentId,
               AcceptedAnswerId: fila.AcceptedAnswerId, Tags: fila.Tags})`,
    row: function (post) {
      return presentFields(post, [
        "Id", "PostTypeId", "Title", "Score", "ViewCount", "CreationDate",
        "OwnerUserId", "ParentId", "AcceptedAnswerId", "Tags"
      ]);
    }
  },
  {
    label: "Tag",
    source: "Tags",
    statement: `UNWIND $filas AS fila
CREATE (:Tag {TagName: fila.TagName, Count: fila.Count})`,
    row: function (tag) {
      return presentFields(tag, ["TagName", "Count"]);
    }
  }
];

export const CONSTRAINT_STATEMENTS = [
  "CREATE CONSTRAINT user_id FOR (u:User) REQUIRE u.Id IS UNIQUE",
  "CREATE CONSTRAINT post_id FOR (p:Post) REQUIRE p.Id IS UNIQUE",
  "CREATE CONSTRAINT tag_name FOR (t:Tag) REQUIRE t.TagName IS UNIQUE"
];

// Las etiquetas :Question y :Answer y las relaciones se derivan dentro del grafo
// de las propiedades de cada post, con las mismas sentencias que
// neo4j/sesion7.ipynb, salvo dos cambios que en Neo4j no alteran el resultado y
// en Grafeo deciden si la sentencia termina antes de su límite de 30 s (medido el
// 2026-11-25 en Node con el grafo completo):
// - Las cuatro relaciones se crean con CREATE y no con MERGE, porque cada par sale
//   una sola vez: un post tiene un único OwnerUserId, una respuesta un único
//   ParentId, Tags no repite etiquetas en una misma pregunta y la carga parte del
//   grafo vacío. MERGE busca antes si la relación ya existe, y Grafeo lo hace
//   recorriendo las relaciones de un extremo, que en un usuario o una etiqueta son
//   miles: WROTE tardaba 25,5 s escrito como en el cuaderno, 7,3 s con MERGE
//   desde el post y 7,8 s con CREATE; TAGGED_WITH y TAGS, 14,9 s con MERGE desde
//   la pregunta y 8,9 s con CREATE. Repetir una de estas sentencias duplicaría
//   sus relaciones; la página y las pruebas siempre las ejecutan sobre un grafo
//   nuevo.
// - ANSWERS busca la pregunta como `(q:Post {Id: a.ParentId}) WHERE q:Question`
//   y no como `(q:Question:Post {Id: a.ParentId})`: con dos etiquetas Grafeo no
//   usa el índice de Post.Id y pasaba de los 30 s ya con la muestra.
// El MERGE que no encuentra el usuario de OwnerUserId lo crea, como en el
// cuaderno; con estos datos todos existen.
export const DERIVED_STATEMENTS = [
  {
    label: ":Question",
    statement: `MATCH (n:Post {PostTypeId: 1})
SET n:Question`
  },
  {
    label: ":Answer",
    statement: `MATCH (n:Post {PostTypeId: 2})
SET n:Answer`
  },
  {
    label: "WROTE",
    statement: `MATCH (n:Post)
WHERE n.OwnerUserId IS NOT NULL AND n.OwnerUserId > 0
MERGE (u:User {Id: n.OwnerUserId})
CREATE (u)-[r:WROTE]->(n)
SET r.CreationDate = n.CreationDate`
  },
  {
    label: "ANSWERS",
    statement: `MATCH (a:Answer)
MATCH (q:Post {Id: a.ParentId})
WHERE q:Question
CREATE (a)-[:ANSWERS]->(q)`
  },
  {
    label: "TAGGED_WITH y TAGS",
    statement: `MATCH (q:Question)
WHERE q.Tags IS NOT NULL AND size(q.Tags) > 2
UNWIND split(substring(q.Tags, 1, size(q.Tags) - 2), '><') AS tag_name
MERGE (t:Tag {TagName: tag_name})
CREATE (q)-[:TAGGED_WITH]->(t)
CREATE (t)-[:TAGS]->(q)`
  }
];

// Las filas de los nodos que salen de un lote de documentos de `source`. Lo usan
// la página y las pruebas, de modo que ambas construyen el grafo igual.
export function nodeRowsForBatch(source, documents) {
  return NODE_LOADS
    .filter(function (entry) { return entry.source === source; })
    .map(function (entry) {
      return { entry, rows: documents.map(function (document) { return entry.row(document); }) };
    });
}

// El JSONL guarda las fechas como {"$date": "2015-10-30T10:26:44.223Z"}: se quedan
// en el texto ISO, que la carga convierte con datetime() como haría Neo4j.
export function reviveExtendedJson(key, value) {
  if (value !== null && typeof value === "object" && typeof value.$date === "string") {
    return value.$date;
  }
  return value;
}
