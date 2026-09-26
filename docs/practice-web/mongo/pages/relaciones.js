/*
 * Ejercicios de relaciones entre colecciones y de modelado, al hilo de la
 * sesión 4: referencia frente a datos embebidos, $lookup y documentos de
 * hilo. La muestra conserva hilos completos, así que estos joins cuadran.
 */
export const page = {
  id: "relaciones",
  title: "3 · Relaciones y modelado",
  description: "$lookup entre colecciones, datos embebidos frente a referencias y construcción de documentos de hilo.",
  exercises: [
    {
      id: "respuestas-por-pregunta",
      title: "Une una colección consigo misma",
      prompt: "Una respuesta apunta a su pregunta con ParentId. Devuelve las diez preguntas con más respuestas (Id, Title y el número de respuestas), desempatando por Id ascendente.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1 } },
  { $lookup: {
      from: "posts",
      localField: "Id",
      foreignField: "ParentId",
      as: "respuestas"
  } },
  { $addFields: { respuestas: { $size: "$respuestas" } } },
  { $sort: { respuestas: -1, Id: 1 } },
  { $limit: 10 },
  { $project: { _id: 0, Id: 1, Title: 1, respuestas: 1 } }
])`
    },
    {
      id: "autor-de-cada-pregunta",
      title: "Resuelve una referencia",
      prompt: "OwnerUserId es una referencia a Users.Id. Muestra las diez preguntas con mayor Score con Id, Title, Score y el DisplayName de su autor, desempatando por Id ascendente. Ordena y recorta antes de unir, para no resolver la referencia de miles de documentos que vas a descartar. $lookup devuelve un array: quédate con su primer elemento.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1 } },
  { $sort: { Score: -1, Id: 1 } },
  { $limit: 10 },
  { $lookup: {
      from: "users",
      localField: "OwnerUserId",
      foreignField: "Id",
      as: "autor"
  } },
  { $project: {
      _id: 0,
      Id: 1,
      Title: 1,
      Score: 1,
      autor: { $arrayElemAt: ["$autor.DisplayName", 0] }
  } }
])`
    },
    {
      id: "preguntas-mas-comentadas",
      title: "Cuenta desde otra colección",
      prompt: "Los comentarios apuntan al post con PostId. Devuelve las diez preguntas con más comentarios, contando sólo las que tengan al menos diez, con Id, Title y el número de comentarios.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1 } },
  { $lookup: {
      from: "comments",
      localField: "Id",
      foreignField: "PostId",
      as: "comentarios"
  } },
  { $addFields: { comentarios: { $size: "$comentarios" } } },
  { $match: { comentarios: { $gte: 10 } } },
  { $sort: { comentarios: -1, Id: 1 } },
  { $limit: 10 },
  { $project: { _id: 0, Id: 1, Title: 1, comentarios: 1 } }
])`
    },
    {
      id: "votos-de-las-destacadas",
      title: "Despliega el resultado de un $lookup",
      prompt: "Para las preguntas con Score de 20 o más, cuenta cuántos votos de cada VoteTypeId han recibido: une con votes, despliega el array con $unwind y agrupa por tipo de voto, en orden ascendente. El 2 es un voto positivo y el 3 uno negativo.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1, Score: { $gte: 20 } } },
  { $lookup: {
      from: "votes",
      localField: "Id",
      foreignField: "PostId",
      as: "votos"
  } },
  { $unwind: "$votos" },
  { $group: { _id: "$votos.VoteTypeId", votos: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])`
    },
    {
      id: "documento-de-hilo",
      title: "Embebe el hilo en un solo documento",
      prompt: "Construye el documento que tendría la pregunta con más respuestas si el hilo estuviera embebido en vez de referenciado: Id, Title y un array de respuestas con sólo Id, Score y OwnerUserId de cada una. Usa $map sobre el resultado del $lookup.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1 } },
  { $lookup: {
      from: "posts",
      localField: "Id",
      foreignField: "ParentId",
      as: "respuestas"
  } },
  { $addFields: { numRespuestas: { $size: "$respuestas" } } },
  { $sort: { numRespuestas: -1, Id: 1 } },
  { $limit: 1 },
  { $project: {
      _id: 0,
      Id: 1,
      Title: 1,
      respuestas: {
        $map: {
          input: "$respuestas",
          as: "respuesta",
          in: {
            Id: "$$respuesta.Id",
            Score: "$$respuesta.Score",
            OwnerUserId: "$$respuesta.OwnerUserId"
          }
        }
      }
  } }
])`
    },
    {
      id: "participacion-por-autor-y-etiqueta",
      title: "Agrupa por una clave compuesta",
      prompt: "¿Quién pregunta más sobre cada tema? Despliega las etiquetas de cada pregunta y agrupa por autor y etiqueta a la vez. Devuelve los diez pares con más preguntas, desempatando por autor y etiqueta ascendentes.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1, OwnerUserId: { $ne: null }, Tags: { $ne: null } } },
  { $project: {
      OwnerUserId: 1,
      etiquetas: { $split: [{ $trim: { input: "$Tags", chars: "<>" } }, "><"] }
  } },
  { $unwind: "$etiquetas" },
  { $group: {
      _id: { autor: "$OwnerUserId", etiqueta: "$etiquetas" },
      preguntas: { $sum: 1 }
  } },
  { $sort: { preguntas: -1, "_id.autor": 1, "_id.etiqueta": 1 } },
  { $limit: 10 }
])`
    },
    {
      id: "respuesta-aceptada",
      title: "Encadena dos $lookup",
      prompt: "AcceptedAnswerId apunta a la respuesta aceptada, y esa respuesta apunta a su autor. Devuelve las diez preguntas cuya respuesta aceptada tenga mayor Score, con Id y Title de la pregunta, la puntuación de la respuesta aceptada y el nombre de quien la escribió.",
      solution: `db.posts.aggregate([
  { $match: { PostTypeId: 1, AcceptedAnswerId: { $ne: null } } },
  { $lookup: {
      from: "posts",
      localField: "AcceptedAnswerId",
      foreignField: "Id",
      as: "aceptada"
  } },
  { $unwind: "$aceptada" },
  { $lookup: {
      from: "users",
      localField: "aceptada.OwnerUserId",
      foreignField: "Id",
      as: "autorAceptada"
  } },
  { $project: {
      _id: 0,
      Id: 1,
      Title: 1,
      puntuacionAceptada: "$aceptada.Score",
      autorAceptada: { $arrayElemAt: ["$autorAceptada.DisplayName", 0] }
  } },
  { $sort: { puntuacionAceptada: -1, Id: 1 } },
  { $limit: 10 }
])`
    }
  ]
};
