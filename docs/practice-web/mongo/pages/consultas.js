/*
 * Ejercicios de consulta con find, al hilo de la sesión 4 de teoría y de la
 * primera mitad del boletín de la sesión 3. Añade nuevos objetos a
 * `exercises`; el editor se crea vacío.
 */
export const page = {
  id: "consultas",
  title: "1 · Consultas con find",
  description: "Filtros, proyección, orden, paginación, None frente a campo ausente, $in y expresiones regulares.",
  exercises: [
    {
      id: "contar-preguntas",
      title: "Cuenta las preguntas",
      prompt: "En Stack Overflow, PostTypeId 1 es una pregunta y 2 una respuesta (4 y 5 son los textos de las etiquetas). Cuenta cuántas preguntas hay en el conjunto de datos con count_documents.",
      solution: `db.posts.count_documents({ "PostTypeId": 1 })`
    },
    {
      id: "preguntas-mas-vistas",
      title: "Ordena y proyecta",
      prompt: "Devuelve las diez preguntas más vistas con sólo Id, Title y ViewCount. Ordena por ViewCount descendente y desempata por Id ascendente para que el resultado sea determinista.",
      solution: `db.posts.find(
  { "PostTypeId": 1 },
  { "Id": 1, "Title": 1, "ViewCount": 1 }
).sort([("ViewCount", -1), ("Id", 1)]).limit(10).to_list()`
    },
    {
      id: "rango-de-fechas",
      title: "Filtra por un rango de fechas",
      prompt: "Cuenta las preguntas creadas durante 2020. Usa un rango cerrado por abajo y abierto por arriba con datetime.fromisoformat, para no depender de la última fecha del año.",
      solution: `db.posts.count_documents({
  "PostTypeId": 1,
  "CreationDate": { "$gte": datetime.fromisoformat("2020-01-01"), "$lt": datetime.fromisoformat("2021-01-01") }
})`
    },
    {
      id: "votos-in",
      title: "Varios valores con $in",
      prompt: "En Votes, VoteTypeId 2 es un voto positivo y 3 uno negativo. Cuenta en una sola consulta cuántos votos hay de esos dos tipos.",
      solution: `db.votes.count_documents({ "VoteTypeId": { "$in": [2, 3] } })`
    },
    {
      id: "null-frente-a-ausente",
      title: "None no es lo mismo que un campo ausente",
      prompt: "Los Parquet de la asignatura conservan la clave de los valores nulos, que en Python se consultan con None. Compruébalo: devuelve un diccionario con el número de usuarios cuyo WebsiteUrl es None y el de aquellos en los que la clave no existe.",
      solution: `{
  "conNull": db.users.count_documents({ "WebsiteUrl": None }),
  "sinClave": db.users.count_documents({ "WebsiteUrl": { "$exists": False } })
}`
    },
    {
      id: "titulos-con-indice",
      title: "Busca texto con $regex",
      prompt: "Encuentra las preguntas cuyo título mencione «índice» sin distinguir mayúsculas. Devuelve Id y Title ordenados por Id ascendente.",
      solution: `db.posts.find(
  { "PostTypeId": 1, "Title": { "$regex": "índice", "$options": "i" } },
  { "Id": 1, "Title": 1 }
).sort([("Id", 1)]).to_list()`
    },
    {
      id: "etiqueta-python",
      title: "Consulta un campo mal modelado",
      prompt: "Tags no es un array: llega como la cadena «<una><otra>», tal como la publica el dump. Cuenta las preguntas etiquetadas con <python> buscando ese trozo de cadena. Piensa mientras lo haces por qué un array sería mejor modelo.",
      solution: `db.posts.count_documents({ "PostTypeId": 1, "Tags": { "$regex": "<python>" } })`
    },
    {
      id: "paginacion",
      title: "Pagina un resultado",
      prompt: "Muestra la segunda página de cinco respuestas (PostTypeId 2) ordenadas por Score descendente e Id ascendente. Proyecta Id, ParentId y Score.",
      solution: `db.posts.find(
  { "PostTypeId": 2 },
  { "Id": 1, "ParentId": 1, "Score": 1 }
).sort([("Score", -1), ("Id", 1)]).skip(5).limit(5).to_list()`
    },
    {
      id: "tipos-presentes",
      title: "Valores distintos de un campo",
      prompt: "Averigua con distinct qué valores de PostTypeId aparecen realmente en el conjunto de datos.",
      solution: `db.posts.distinct("PostTypeId")`
    }
  ]
};
