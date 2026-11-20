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
// las relaciones. No hace falta declarar nada más: las etiquetas, los tipos de
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

function postTagNames(post) {
  if (!post.Tags) return [];
  return post.Tags.replace(/^</, "").replace(/>$/, "").split("><");
}

export const NODE_LOADS = [
  {
    label: "User",
    statement: `UNWIND $filas AS fila
CREATE (:User {Id: fila.Id, DisplayName: fila.DisplayName, Reputation: fila.Reputation,
               Location: fila.Location, CreationDate: datetime(fila.CreationDate)})`,
    rows: function (documents) {
      return documents.Users.map(function (user) {
        return presentFields(user, ["Id", "DisplayName", "Reputation", "Location", "CreationDate"]);
      });
    }
  },
  {
    label: "Post",
    statement: `UNWIND $filas AS fila
CREATE (:Post {Id: fila.Id, PostTypeId: fila.PostTypeId, Title: fila.Title, Score: fila.Score,
               ViewCount: fila.ViewCount, CreationDate: datetime(fila.CreationDate)})`,
    rows: function (documents) {
      return documents.Posts.map(function (post) {
        return presentFields(post, ["Id", "PostTypeId", "Title", "Score", "ViewCount", "CreationDate"]);
      });
    }
  },
  {
    label: "Tag",
    statement: `UNWIND $filas AS fila
CREATE (:Tag {TagName: fila.TagName, Count: fila.Count})`,
    rows: function (documents) {
      return documents.Tags.map(function (tag) { return presentFields(tag, ["TagName", "Count"]); });
    }
  }
];

export const CONSTRAINT_STATEMENTS = [
  "CREATE CONSTRAINT user_id FOR (u:User) REQUIRE u.Id IS UNIQUE",
  "CREATE CONSTRAINT post_id FOR (p:Post) REQUIRE p.Id IS UNIQUE",
  "CREATE CONSTRAINT tag_name FOR (t:Tag) REQUIRE t.TagName IS UNIQUE"
];

// Una relación cuyo extremo no está en los datos no se crea: el MATCH no encuentra
// el nodo y esa fila no produce nada.
export const RELATIONSHIP_LOADS = [
  {
    label: "WROTE",
    statement: `UNWIND $filas AS fila
MATCH (u:User {Id: fila.usuario})
MATCH (p:Post {Id: fila.post})
CREATE (u)-[:WROTE]->(p)`,
    rows: function (documents) {
      return documents.Posts
        .filter(function (post) { return post.OwnerUserId !== null; })
        .map(function (post) { return { usuario: post.OwnerUserId, post: post.Id }; });
    }
  },
  {
    label: "ANSWERS",
    statement: `UNWIND $filas AS fila
MATCH (respuesta:Post {Id: fila.respuesta})
MATCH (pregunta:Post {Id: fila.pregunta})
CREATE (respuesta)-[:ANSWERS]->(pregunta)`,
    rows: function (documents) {
      return documents.Posts
        .filter(function (post) { return post.ParentId !== null; })
        .map(function (post) { return { respuesta: post.Id, pregunta: post.ParentId }; });
    }
  },
  {
    label: "TAGGED_WITH",
    statement: `UNWIND $filas AS fila
MATCH (p:Post {Id: fila.post})
MATCH (t:Tag {TagName: fila.etiqueta})
CREATE (p)-[:TAGGED_WITH]->(t)`,
    rows: function (documents) {
      return documents.Posts.flatMap(function (post) {
        return postTagNames(post).map(function (name) { return { post: post.Id, etiqueta: name }; });
      });
    }
  }
];

// El JSONL guarda las fechas como {"$date": "2015-10-30T10:26:44.223Z"}: se quedan
// en el texto ISO, que la carga convierte con datetime() como haría Neo4j.
export function reviveExtendedJson(key, value) {
  if (value !== null && typeof value === "object" && typeof value.$date === "string") {
    return value.$date;
  }
  return value;
}
