/*
 * Ejercicios de consulta basados en SQL/sesión 2.
 * Se usan las alternativas de SQLite disponibles en sql.js.
 */
export const page = {
  id: "sesion-2",
  title: "Sesión 2 · Consultas y estructuras avanzadas",
  description: "CTE, UNION ALL, funciones ventana, JSON y planes de consulta en SQLite.",
  exercises: [
    {
      id: "resumen-mensual",
      title: "Resume las preguntas por mes con una CTE",
      prompt: "Usa una CTE para contar preguntas por mes y calcular su puntuación media. Muestra los 24 meses más recientes.",
      solution: `WITH PreguntasPorMes AS (
  SELECT strftime('%Y-%m', CreationDate) AS Mes,
         COUNT(*) AS NumeroPreguntas,
         ROUND(AVG(Score), 2) AS PuntuacionMedia
  FROM Posts
  WHERE PostTypeId = 1
    AND CreationDate IS NOT NULL
  GROUP BY strftime('%Y-%m', CreationDate)
)
SELECT Mes, NumeroPreguntas, PuntuacionMedia
FROM PreguntasPorMes
ORDER BY Mes DESC
LIMIT 24;`
    },
    {
      id: "respuestas-y-ctes",
      title: "Compara AnswerCount con un recuento calculado",
      prompt: "Agrega las respuestas por ParentId en una CTE y compárala con AnswerCount de cada pregunta. Conserva preguntas sin respuestas y muestra las veinte con más respuestas declaradas.",
      solution: `WITH RespuestasPorPregunta AS (
  SELECT ParentId AS PreguntaId,
         COUNT(*) AS RespuestasCalculadas,
         ROUND(AVG(Score), 2) AS PuntuacionMediaRespuestas
  FROM Posts
  WHERE PostTypeId = 2
    AND ParentId IS NOT NULL
  GROUP BY ParentId
)
SELECT q.Id, q.Title, q.AnswerCount,
       COALESCE(r.RespuestasCalculadas, 0) AS RespuestasCalculadas,
       r.PuntuacionMediaRespuestas
FROM Posts AS q
LEFT JOIN RespuestasPorPregunta AS r ON r.PreguntaId = q.Id
WHERE q.PostTypeId = 1
ORDER BY q.AnswerCount DESC, q.Id ASC
LIMIT 20;`
    },
    {
      id: "eventos-union-all",
      title: "Combina usuarios y publicaciones con UNION ALL",
      prompt: "Construye una línea de tiempo de altas de usuarios, preguntas y respuestas. Devuelve tipo, Id y fecha; limita la salida a veinte eventos recientes con desempates explícitos.",
      solution: `SELECT 'usuario' AS TipoEvento, Id AS EntidadId, CreationDate
FROM Users
UNION ALL
SELECT CASE WHEN PostTypeId = 1 THEN 'pregunta' ELSE 'respuesta' END AS TipoEvento,
       Id AS EntidadId,
       CreationDate
FROM Posts
WHERE PostTypeId IN (1, 2)
ORDER BY CreationDate DESC, TipoEvento ASC, EntidadId DESC
LIMIT 20;`
    },
    {
      id: "mejores-por-anio",
      title: "Encuentra las tres preguntas mejor puntuadas de cada año",
      prompt: "Usa ROW_NUMBER() con PARTITION BY año y filtra después las tres primeras de cada año. Desempata por Id ascendente.",
      solution: `WITH PreguntasPosicionadas AS (
  SELECT Id,
         Title,
         strftime('%Y', CreationDate) AS Anio,
         Score,
         ROW_NUMBER() OVER (
           PARTITION BY strftime('%Y', CreationDate)
           ORDER BY Score DESC, Id ASC
         ) AS Posicion
  FROM Posts
  WHERE PostTypeId = 1
    AND Title IS NOT NULL
    AND CreationDate IS NOT NULL
)
SELECT Anio, Posicion, Id, Title, Score
FROM PreguntasPosicionadas
WHERE Posicion <= 3
ORDER BY Anio DESC, Posicion ASC, Id ASC;`
    },
    {
      id: "hilo-recursivo",
      title: "Recorre una pregunta y sus respuestas con WITH RECURSIVE",
      prompt: "Elige una pregunta con muchas respuestas y construye un hilo con la pregunta en profundidad 0 y sus respuestas en profundidad 1. El modelo de Posts de este dataset tiene dos niveles.",
      solution: `WITH RECURSIVE Hilo(Id, ParentId, Profundidad, Title) AS (
  SELECT Id, ParentId, 0, Title
  FROM Posts
  WHERE Id = (
    SELECT Id
    FROM Posts
    WHERE PostTypeId = 1
    ORDER BY AnswerCount DESC, Id ASC
    LIMIT 1
  )
  UNION ALL
  SELECT p.Id, p.ParentId, h.Profundidad + 1, p.Title
  FROM Posts AS p
  JOIN Hilo AS h ON p.ParentId = h.Id
  WHERE p.PostTypeId = 2
    AND h.Profundidad < 1
)
SELECT Id, ParentId, Profundidad, Title
FROM Hilo
ORDER BY Profundidad, Id;`
    },
    {
      id: "json-documento",
      title: "Construye y consulta un objeto JSON",
      prompt: "Construye un objeto JSON con id, título, puntuación y autor para cinco preguntas. Extrae la puntuación del documento con json_extract. Es una adaptación SQLite del trabajo con JSON de la sesión.",
      solution: `SELECT Id,
       json_object(
         'id', Id,
         'title', Title,
         'score', Score,
         'ownerUserId', OwnerUserId
       ) AS Documento,
       json_extract(
         json_object('score', Score),
         '$.score'
       ) AS PuntuacionExtraida
FROM Posts
WHERE PostTypeId = 1
ORDER BY Id ASC
LIMIT 5;`
    },
    {
      id: "plan-consulta",
      title: "Lee el plan de una consulta",
      prompt: "Usa EXPLAIN QUERY PLAN para consultar una fila por su clave primaria. Identifica en la columna detail si SQLite busca por el índice de la clave o recorre la tabla.",
      solution: `EXPLAIN QUERY PLAN
SELECT Id, Title
FROM Posts
WHERE Id = 42;`
    }
  ]
};
