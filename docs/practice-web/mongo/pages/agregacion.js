/*
 * Ejercicios del framework de agregación, al hilo de la segunda mitad del
 * boletín de la sesión 3. Cada pipeline termina con un orden determinista
 * para que «Comprobar» pueda compararlo con la solución.
 */
export const page = {
  id: "agregacion",
  title: "2 · Framework de agregación",
  description: "$group, $project, $unwind, fechas, tramos con $bucket y varias cuentas a la vez con $facet.",
  exercises: [
    {
      id: "publicaciones-por-tipo",
      title: "Agrupa y cuenta",
      prompt: "Para cada PostTypeId devuelve cuántas publicaciones hay y su puntuación media. Ordena por PostTypeId ascendente.",
      solution: `db.posts.aggregate([
  { "$group": {
      "_id": "$PostTypeId",
      "publicaciones": { "$sum": 1 },
      "puntuacionMedia": { "$avg": "$Score" }
  } },
  { "$sort": { "_id": 1 } }
]).to_list()`
    },
    {
      id: "preguntas-por-anio",
      title: "Agrupa por una parte de la fecha",
      prompt: "Cuenta las preguntas de cada año con $year sobre CreationDate y ordena cronológicamente.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 1 } },
  { "$group": { "_id": { "$year": "$CreationDate" }, "preguntas": { "$sum": 1 } } },
  { "$sort": { "_id": 1 } }
]).to_list()`
    },
    {
      id: "autores-mas-activos",
      title: "Los diez autores con más preguntas",
      prompt: "Agrupa las preguntas por OwnerUserId, descartando las que no tienen autor. Ordena por número de preguntas descendente y desempata por OwnerUserId ascendente.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 1, "OwnerUserId": { "$ne": None } } },
  { "$group": { "_id": "$OwnerUserId", "preguntas": { "$sum": 1 } } },
  { "$sort": { "preguntas": -1, "_id": 1 } },
  { "$limit": 10 }
]).to_list()`
    },
    {
      id: "filtrar-grupos",
      title: "Filtra después de agrupar",
      prompt: "El equivalente del HAVING de SQL es un $match posterior al $group. Quédate con los autores que tengan al menos cincuenta respuestas publicadas, ordenados por número descendente y autor ascendente.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 2, "OwnerUserId": { "$ne": None } } },
  { "$group": { "_id": "$OwnerUserId", "respuestas": { "$sum": 1 } } },
  { "$match": { "respuestas": { "$gte": 50 } } },
  { "$sort": { "respuestas": -1, "_id": 1 } }
]).to_list()`
    },
    {
      id: "resumen-por-mes",
      title: "Da forma a la clave de agrupación",
      prompt: "Cuenta las preguntas por mes usando $dateToString con formato «%Y-%m» y devuelve los cinco meses con más preguntas. Desempata por mes ascendente.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 1 } },
  { "$group": {
      "_id": { "$dateToString": { "format": "%Y-%m", "date": "$CreationDate" } },
      "preguntas": { "$sum": 1 }
  } },
  { "$sort": { "preguntas": -1, "_id": 1 } },
  { "$limit": 5 }
]).to_list()`
    },
    {
      id: "etiquetas-mas-usadas",
      title: "Convierte una cadena en varios documentos",
      prompt: "Tags llega como «<una><otra>». Quita los símbolos de los extremos con $trim, parte la cadena por «><» con $split, despliega el array con $unwind y devuelve las diez etiquetas más usadas en preguntas.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 1, "Tags": { "$ne": None } } },
  { "$project": {
      "etiquetas": { "$split": [{ "$trim": { "input": "$Tags", "chars": "<>" } }, "><"] }
  } },
  { "$unwind": "$etiquetas" },
  { "$group": { "_id": "$etiquetas", "preguntas": { "$sum": 1 } } },
  { "$sort": { "preguntas": -1, "_id": 1 } },
  { "$limit": 10 }
]).to_list()`
    },
    {
      id: "reparto-de-puntuacion",
      title: "Reparte en tramos con $bucket",
      prompt: "Reparte las preguntas en tramos de puntuación con los límites 0, 1, 5, 20 y 1000, dejando en un grupo «negativo» las que no llegan al primer límite. Cuenta cuántas caen en cada tramo.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 1 } },
  { "$bucket": {
      "groupBy": "$Score",
      "boundaries": [0, 1, 5, 20, 1000],
      "default": "negativo",
      "output": { "preguntas": { "$sum": 1 } }
  } }
]).to_list()`
    },
    {
      id: "dos-resumenes-a-la-vez",
      title: "Dos resúmenes en una pasada",
      prompt: "$facet ejecuta varios pipelines sobre la misma entrada. Devuelve a la vez el número de publicaciones por tipo y las tres preguntas con mayor AnswerCount (Id, Title y AnswerCount).",
      solution: `db.posts.aggregate([
  { "$facet": {
      "porTipo": [
        { "$group": { "_id": "$PostTypeId", "publicaciones": { "$sum": 1 } } },
        { "$sort": { "_id": 1 } }
      ],
      "masRespondidas": [
        { "$match": { "PostTypeId": 1 } },
        { "$sort": { "AnswerCount": -1, "Id": 1 } },
        { "$limit": 3 },
        { "$project": { "_id": 0, "Id": 1, "Title": 1, "AnswerCount": 1 } }
      ]
  } }
]).to_list()`
    },
    {
      id: "dias-hasta-la-ultima-actividad",
      title: "Calcula con dos fechas",
      prompt: "¿Cuánto tarda en apagarse una pregunta? Calcula con $dateDiff los días entre CreationDate y LastActivityDate y devuelve la media por año de creación, en orden cronológico.",
      solution: `db.posts.aggregate([
  { "$match": { "PostTypeId": 1 } },
  { "$project": {
      "anio": { "$year": "$CreationDate" },
      "dias": { "$dateDiff": {
          "startDate": "$CreationDate",
          "endDate": "$LastActivityDate",
          "unit": "day"
      } }
  } },
  { "$group": { "_id": "$anio", "diasMedios": { "$avg": "$dias" } } },
  { "$sort": { "_id": 1 } }
]).to_list()`
    }
  ]
};
