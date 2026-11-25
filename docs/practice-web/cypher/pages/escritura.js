/*
 * Escritura y modelado: MERGE frente a CREATE y la construcción de una relación
 * derivada, con Cypher que funciona igual en Neo4j. La relación INTERESTED_IN no
 * se declara: la crea el MERGE del primer ejercicio, como en Neo4j. Los ejercicios que
 * escriben cambian el grafo y no tienen comprobación automática: el botón
 * «Reconstruir el grafo» del panel de arriba lo deja como estaba. Los ejercicios de
 * carga trabajan con etiquetas ajenas al curso (`PruebaCarga`, `RegistroUnico`) y
 * empiezan borrando lo suyo para poder repetirse.
 */
export const page = {
  id: "escritura",
  title: "3 · Escritura y modelado",
  description: "Una relación derivada, MERGE frente a CREATE, ON CREATE y ON MATCH, la carga con UNWIND, restricciones de unicidad y cómo se distinguen preguntas y respuestas.",
  exercises: [
    {
      id: "poblar-interes",
      title: "MERGE para no duplicar",
      prompt: "Vas a derivar los intereses de cada usuario a partir de las etiquetas de sus preguntas. Crea la relación INTERESTED_IN, de :User a :Tag, con una propiedad preguntas que guarde cuántas preguntas ha escrito sobre esa etiqueta. Usa MERGE, que crea la relación sólo si no existe, y SET para dejar el contador. Termina devolviendo cuántas relaciones han quedado. Tarda un poco: recorre todo el grafo.",
      solution: `MATCH (u:User)-[:WROTE]->(:Question)-[:TAGGED_WITH]->(t:Tag)
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
      id: "interes-sin-derivada",
      title: "El mismo resultado sin la relación derivada",
      prompt: "INTERESTED_IN abarata la consulta anterior, pero alguien tiene que mantenerla al día. Calcula lo mismo sin ella: recorre (:User)-[:WROTE]->(:Question)-[:TAGGED_WITH]->(:Tag), cuenta las preguntas de cada usuario sobre «python» (agrupa por usuario, no por nombre: hay nombres repetidos) y devuelve los diez primeros con su nombre y su recuento, desempatando por nombre. Debe coincidir con el ejercicio anterior: aquí no hay nada que mantener, a cambio de repetir el recorrido en cada consulta.",
      solution: `MATCH (u:User)-[:WROTE]->(:Question)-[:TAGGED_WITH]->(t:Tag)
WHERE t.TagName = 'python'
WITH u, count(*) AS preguntas
RETURN u.DisplayName AS usuario, preguntas
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
      id: "create-duplica",
      title: "CREATE repite lo que ya existe",
      prompt: "Una carga con CREATE no se puede repetir sin duplicar. Con la etiqueta :PruebaCarga, que no es del curso, crea tres veces el nodo (:PruebaCarga {Id: 7}) con UNWIND range(1, 3) y cuenta cuántos nodos con Id 7 quedan. La primera sentencia borra los nodos de prueba para que puedas repetir el ejercicio.",
      solution: `MATCH (n:PruebaCarga) DETACH DELETE n;
UNWIND range(1, 3) AS intento
CREATE (:PruebaCarga {Id: 7});
MATCH (n:PruebaCarga {Id: 7})
RETURN count(n) AS copias`
    },
    {
      id: "merge-no-duplica",
      title: "MERGE sólo crea lo que no existe",
      prompt: "Repite la carga del ejercicio anterior con MERGE en lugar de CREATE: tres cargas del mismo nodo (:PruebaCarga {Id: 7}) y el recuento de los que quedan.",
      solution: `MATCH (n:PruebaCarga) DETACH DELETE n;
UNWIND range(1, 3) AS intento
MERGE (:PruebaCarga {Id: 7});
MATCH (n:PruebaCarga {Id: 7})
RETURN count(n) AS copias`
    },
    {
      id: "merge-patron-completo",
      title: "MERGE con una propiedad que cambia vuelve a duplicar",
      prompt: "MERGE busca el patrón entero, con todas sus propiedades, y sólo lo crea si no lo encuentra. Carga tres veces el nodo con Id 7 poniendo en el patrón una propiedad visitas que cambia en cada carga (10, 11 y 12), y cuenta cuántos nodos quedan. Piensa por qué el segundo MERGE no encuentra el nodo que dejó el primero.",
      solution: `MATCH (n:PruebaCarga) DETACH DELETE n;
UNWIND [10, 11, 12] AS visitas
MERGE (:PruebaCarga {Id: 7, visitas: visitas});
MATCH (n:PruebaCarga {Id: 7})
RETURN count(n) AS copias`
    },
    {
      id: "merge-on-create-on-match",
      title: "La identidad en el patrón, el resto con SET",
      prompt: "Corrige la carga anterior: en el patrón del MERGE va sólo la identidad (Id) y lo que cambia se escribe después. Con ON CREATE SET deja cargas = 1 al crear el nodo, con ON MATCH SET suma 1 cada vez que lo encuentra y con SET guarda el último valor de visitas. Tras las tres cargas (10, 11 y 12) devuelve cuántos nodos hay y cuánto valen visitas y cargas.",
      solution: `MATCH (n:PruebaCarga) DETACH DELETE n;
UNWIND [10, 11, 12] AS visitas
MERGE (n:PruebaCarga {Id: 7})
ON CREATE SET n.cargas = 1
ON MATCH SET n.cargas = n.cargas + 1
SET n.visitas = visitas;
MATCH (n:PruebaCarga {Id: 7})
RETURN count(n) AS copias, n.visitas AS visitas, n.cargas AS cargas`
    },
    {
      id: "carga-con-unwind-y-nulos",
      title: "Carga una lista de mapas con UNWIND (y los nulos no existen)",
      prompt: "UNWIND convierte una lista de mapas en filas, y cada fila alimenta un MERGE: es la forma de la carga masiva de esta práctica. Carga tres mapas {Id, nombre} como nodos :PruebaCarga, uno de ellos con nombre: null, con MERGE sólo sobre Id y SET para el nombre. Neo4j no guarda propiedades nulas: el nodo existe pero no tiene la propiedad, y por eso la página quita los nulos del JSONL antes de cargar. Devuelve cuántos nodos hay y cuántos tienen nombre.",
      solution: `MATCH (n:PruebaCarga) DETACH DELETE n;
UNWIND [{Id: 1, nombre: 'Ana'}, {Id: 2, nombre: null}, {Id: 3, nombre: 'Luis'}] AS fila
MERGE (n:PruebaCarga {Id: fila.Id})
SET n.nombre = fila.nombre;
MATCH (n:PruebaCarga)
RETURN count(*) AS nodos, count(n.nombre) AS con_nombre`
    },
    {
      id: "restriccion-de-unicidad",
      title: "Una restricción de unicidad crea un índice",
      prompt: "Una restricción de unicidad impide los duplicados y, además, crea el índice con el que se busca el nodo. Crea una restricción sobre :RegistroUnico(Id) con IF NOT EXISTS, carga el nodo con Id 1 con MERGE y termina con un EXPLAIN de la búsqueda por Id: el plan muestra [index: Id]. Después prueba CREATE (:RegistroUnico {Id: 1}) en el cuadro de pruebas y lee el error que da el segundo nodo. Los nombres de los operadores del plan son los de Grafeo, no los de Neo4j.",
      solution: `CREATE CONSTRAINT registro_unico IF NOT EXISTS
FOR (n:RegistroUnico) REQUIRE n.Id IS UNIQUE;
MERGE (:RegistroUnico {Id: 1});
EXPLAIN
MATCH (n:RegistroUnico {Id: 1})
RETURN n`
    },
    {
      id: "modelar-pregunta-respuesta",
      title: "Preguntas y respuestas: una propiedad y dos etiquetas",
      prompt: "En el dump, preguntas y respuestas son publicaciones que se distinguen por PostTypeId (1 pregunta, 2 respuesta). En el grafo todas son :Post, y la carga ha añadido a partir de esa propiedad la etiqueta :Question o :Answer, como en el boletín, para poder escribir (:Question) en un patrón. Comprueba que concuerdan: cuenta las publicaciones por PostTypeId y por combinación de etiquetas (labels(p)), ordenando por tipo. Verás también tipos que no son ni lo uno ni lo otro y se quedan sólo con :Post.",
      solution: `MATCH (p:Post)
RETURN p.PostTypeId AS tipo, labels(p) AS etiquetas, count(*) AS publicaciones
ORDER BY tipo, etiquetas`
    }
  ]
};
