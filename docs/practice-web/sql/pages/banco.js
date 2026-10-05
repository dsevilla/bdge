/*
 * Banco de ejercicios SQL de la práctica web.
 *
 * Reúne los ejercicios que antes estaban repartidos entre las páginas
 * «Sesión 1» y «Sesión 2», que ya no siguen el orden de las prácticas, y los
 * amplía con ejercicios nuevos de dificultad creciente. Dialecto DuckDB, sobre
 * las tablas que carga la página: Posts, Users, Tags, Comments y Votes.
 *
 * Cada ejercicio lleva `temas`, `dificultad` y, en las secuencias, `requiere`
 * (los pasos previos que dejan la tabla temporal que necesita). La página
 * ignora esos campos; los usa el selector (`vectorial/selector/`). Toda
 * solución de lectura es determinista (ORDER BY con desempate antes de LIMIT)
 * y devuelve como mucho 1 000 filas; lo comprueba `validate-catalog.py`.
 */
export const page = {
  id: "ejercicios",
  title: "Banco de ejercicios SQL",
  description: "CTE, ventanas, JSON, DDL, DML, transacciones y planes de consulta, de menor a mayor dificultad.",
  exercises: [
    // ── Ejercicios iniciales (antes, sesiones 1 y 2) ────────────────────
    {
      id: "inventario-tablas",
      title: "Explora las tablas",
      temas: ["catalogo", "ordenacion"],
      dificultad: "facil",
      prompt: "Muestra en orden alfabético las tablas y vistas de la base. En DuckDB puedes consultar information_schema.tables; limita la salida al esquema main.",
      solution: `SELECT table_type AS Tipo, table_name AS Nombre
FROM information_schema.tables
WHERE table_schema = 'main'
ORDER BY table_type, table_name;`
    },
    {
      id: "preguntas-mas-contestadas",
      title: "Ordena preguntas por número de respuestas",
      temas: ["filtros", "ordenacion"],
      dificultad: "facil",
      prompt: "Obtén las diez preguntas con mayor AnswerCount. Muestra Id, Title y AnswerCount; desempata por Id ascendente.",
      solution: `SELECT Id, Title, AnswerCount
FROM Posts
WHERE PostTypeId = 1
ORDER BY AnswerCount DESC, Id ASC
LIMIT 10;`
    },
    {
      id: "publicaciones-por-tipo",
      title: "Resume las publicaciones por tipo",
      temas: ["agregacion", "agrupacion"],
      dificultad: "media",
      prompt: "Para cada PostTypeId calcula cuántas publicaciones hay y su puntuación media. Conserva los grupos con al menos diez filas.",
      solution: `SELECT PostTypeId,
       COUNT(*) AS NumeroPublicaciones,
       ROUND(AVG(Score), 2) AS PuntuacionMedia
FROM Posts
GROUP BY PostTypeId
HAVING COUNT(*) >= 10
ORDER BY PostTypeId;`
    },
    {
      id: "preguntas-y-autores",
      title: "Relaciona preguntas y autores",
      temas: ["join-externo", "ordenacion"],
      dificultad: "media",
      prompt: "Muestra diez preguntas con su puntuación y el DisplayName del autor. Conserva también las preguntas cuyo autor no tenga una fila referenciable en Users.",
      solution: `SELECT p.Id, p.Title, p.Score, u.DisplayName
FROM Posts AS p
LEFT JOIN Users AS u ON u.Id = p.OwnerUserId
WHERE p.PostTypeId = 1
ORDER BY p.Score DESC, p.Id ASC
LIMIT 10;`
    },
    {
      id: "comentarios-sin-usuario",
      title: "Cuenta comentarios sin usuario referenciable",
      temas: ["join-externo", "nulos", "agregacion"],
      dificultad: "media",
      prompt: "Cuenta los comentarios cuyo UserId sea NULL o no encuentre correspondencia en Users. Usa LEFT JOIN y filtra por la clave de Users.",
      solution: `SELECT COUNT(*) AS ComentariosSinUsuario
FROM Comments AS c
LEFT JOIN Users AS u ON u.Id = c.UserId
WHERE u.Id IS NULL;`
    },
    {
      id: "preguntas-sin-respuesta",
      title: "Encuentra preguntas sin respuesta",
      temas: ["subconsultas", "ordenacion"],
      dificultad: "media",
      prompt: "Devuelve diez preguntas sin ninguna respuesta. Usa NOT EXISTS y ordena por fecha más reciente e Id para que el resultado sea determinista.",
      solution: `SELECT q.Id, q.Title, q.CreationDate
FROM Posts AS q
WHERE q.PostTypeId = 1
  AND NOT EXISTS (
    SELECT 1
    FROM Posts AS a
    WHERE a.PostTypeId = 2
      AND a.ParentId = q.Id
  )
ORDER BY q.CreationDate DESC, q.Id DESC
LIMIT 10;`
    },
    {
      id: "votos-por-tipo",
      title: "Agrupa los votos por tipo",
      temas: ["agregacion", "agrupacion"],
      dificultad: "facil",
      prompt: "Cuenta las filas de Votes para cada VoteTypeId y ordena de más frecuente a menos frecuente. Los tipos 2 y 3 representan votos positivos y negativos.",
      solution: `SELECT VoteTypeId, COUNT(*) AS NumeroVotos
FROM Votes
GROUP BY VoteTypeId
ORDER BY NumeroVotos DESC, VoteTypeId ASC;`
    },
    {
      id: "usuarios-por-reputacion",
      title: "Clasifica usuarios por reputación",
      temas: ["case", "agrupacion"],
      dificultad: "media",
      prompt: "Usa CASE para agrupar usuarios como Nuevo (menos de 100), Activo (de 100 a 1000, incluidos) o Experto (más de 1000). Cuenta las filas de cada categoría.",
      solution: `SELECT CASE
         WHEN Reputation < 100 THEN 'Nuevo'
         WHEN Reputation <= 1000 THEN 'Activo'
         ELSE 'Experto'
       END AS Categoria,
       COUNT(*) AS NumeroUsuarios
FROM Users
GROUP BY Categoria
ORDER BY Categoria;`
    },
    {
      id: "etiquetas-populares",
      title: "Consulta las etiquetas más usadas",
      temas: ["ordenacion"],
      dificultad: "facil",
      prompt: "Muestra veinte filas de Tags ordenadas por Count descendente. Usa TagName como desempate.",
      solution: `SELECT TagName, Count
FROM Tags
ORDER BY Count DESC, TagName ASC
LIMIT 20;`
    },
    {
      id: "crear-tabla-temporal",
      title: "Prepara una tabla temporal para DML",
      temas: ["ddl"],
      dificultad: "facil",
      prompt: "Como paso 1 de la secuencia DML, crea EjercicioDML como tabla TEMP con Id como clave primaria, Descripcion obligatoria y Completada con valor inicial 0. Esta tabla temporal no altera el dump y desaparece al recargar la página.",
      solution: `CREATE TEMP TABLE IF NOT EXISTS EjercicioDML (
  Id INTEGER PRIMARY KEY,
  Descripcion TEXT NOT NULL,
  Completada INTEGER NOT NULL DEFAULT 0
);`
    },
    {
      id: "insertar-temporal",
      title: "Inserta filas de práctica",
      temas: ["dml"],
      dificultad: "facil",
      requiere: ["crear-tabla-temporal"],
      prompt: "Paso 2 de DML: inserta dos tareas con Id 1 y 2. Haz que puedas ejecutar la solución varias veces sin duplicar filas.",
      solution: `INSERT OR REPLACE INTO EjercicioDML (Id, Descripcion, Completada)
VALUES
  (1, 'Repasar SELECT', 0),
  (2, 'Repasar JOIN', 0);`
    },
    {
      id: "actualizar-temporal",
      title: "Actualiza una tarea",
      temas: ["dml"],
      dificultad: "facil",
      requiere: ["insertar-temporal"],
      prompt: "Paso 3 de DML: marca como completada la tarea con Id 1 y comprueba el contenido con una consulta SELECT.",
      solution: `UPDATE EjercicioDML
SET Completada = 1
WHERE Id = 1;`
    },
    {
      id: "iniciar-transaccion",
      title: "Inicia una transacción",
      temas: ["transacciones"],
      dificultad: "media",
      requiere: ["actualizar-temporal"],
      prompt: "Paso 4 de DML: inicia una transacción. Ejecuta después, en el ejercicio siguiente, una modificación de la tarea 2.",
      solution: `BEGIN;`
    },
    {
      id: "actualizar-en-transaccion",
      title: "Modifica dentro de la transacción",
      temas: ["transacciones", "dml"],
      dificultad: "media",
      requiere: ["iniciar-transaccion"],
      prompt: "Paso 5: marca la tarea 2 como completada. Después ejecuta ROLLBACK en el siguiente ejercicio.",
      solution: `UPDATE EjercicioDML
SET Completada = 1
WHERE Id = 2;`
    },
    {
      id: "deshacer-transaccion",
      title: "Deshaz los cambios de la transacción",
      temas: ["transacciones"],
      dificultad: "media",
      requiere: ["actualizar-en-transaccion"],
      prompt: "Paso 6: ejecuta ROLLBACK y, en el ejercicio siguiente, consulta la tabla para comprobar que la tarea 2 sigue pendiente.",
      solution: `ROLLBACK;`
    },
    {
      id: "consultar-temporal",
      title: "Comprueba el estado de la tabla temporal",
      temas: ["transacciones", "consulta-basica"],
      dificultad: "facil",
      requiere: ["deshacer-transaccion"],
      prompt: "Muestra las dos tareas en orden de Id. Tras el rollback, solo la tarea 1 debe aparecer completada.",
      solution: `SELECT Id, Descripcion, Completada
FROM EjercicioDML
ORDER BY Id;`
    },
    {
      id: "resumen-mensual",
      title: "Resume las preguntas por mes con una CTE",
      temas: ["cte", "fechas", "agrupacion"],
      dificultad: "media",
      prompt: "Usa una CTE para contar preguntas por mes y calcular su puntuación media. Muestra los 24 meses más recientes.",
      solution: `WITH PreguntasPorMes AS (
  SELECT strftime(CAST(CreationDate AS TIMESTAMP), '%Y-%m') AS Mes,
         COUNT(*) AS NumeroPreguntas,
         ROUND(AVG(Score), 2) AS PuntuacionMedia
  FROM Posts
  WHERE PostTypeId = 1
    AND CreationDate IS NOT NULL
  GROUP BY strftime(CAST(CreationDate AS TIMESTAMP), '%Y-%m')
)
SELECT Mes, NumeroPreguntas, PuntuacionMedia
FROM PreguntasPorMes
ORDER BY Mes DESC
LIMIT 24;`
    },
    {
      id: "respuestas-y-ctes",
      title: "Compara AnswerCount con un recuento calculado",
      temas: ["cte", "join-externo", "nulos"],
      dificultad: "dificil",
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
      temas: ["conjuntos", "case"],
      dificultad: "media",
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
      temas: ["ventanas", "cte", "fechas"],
      dificultad: "dificil",
      prompt: "Usa ROW_NUMBER() con PARTITION BY año y filtra después las tres primeras de cada año. Desempata por Id ascendente.",
      solution: `WITH PreguntasPosicionadas AS (
  SELECT Id,
         Title,
         strftime(CAST(CreationDate AS TIMESTAMP), '%Y') AS Anio,
         Score,
         ROW_NUMBER() OVER (
           PARTITION BY strftime(CAST(CreationDate AS TIMESTAMP), '%Y')
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
      temas: ["recursiva", "subconsultas"],
      dificultad: "dificil",
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
      temas: ["json"],
      dificultad: "media",
      prompt: "Construye un objeto JSON con id, título, puntuación y autor para cinco preguntas. Extrae la puntuación del documento con json_extract. Es una adaptación DuckDB del trabajo con JSON de la sesión.",
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
      temas: ["planes"],
      dificultad: "media",
      prompt: "Usa EXPLAIN para consultar una publicación por Id. Lee los operadores, las columnas proyectadas y el filtro. Con los Parquet, busca READ_PARQUET y observa si el filtro se aplica en la lectura; con la muestra verás una tabla en memoria.",
      solution: `EXPLAIN
SELECT Id, Title
FROM Posts
WHERE Id = 42;`
    },

    // ── Ampliación: fechas, tipos y nulos ───────────────────────────────
    {
      id: "preguntas-de-marzo-2021",
      title: "Filtra un mes sin aplicar funciones a la columna",
      temas: ["fechas", "filtros", "agregacion"],
      dificultad: "facil",
      prompt: "Cuenta las preguntas creadas en marzo de 2021 y calcula su puntuación media redondeada a dos decimales. Filtra con un rango semiabierto (CreationDate >= 1 de marzo y < 1 de abril) en lugar de aplicar month() o year() a la columna: así el filtro puede aprovechar un índice o las estadísticas del fichero.",
      solution: `SELECT COUNT(*) AS Preguntas,
       ROUND(AVG(Score), 2) AS PuntuacionMedia
FROM Posts
WHERE PostTypeId = 1
  AND CreationDate >= TIMESTAMP '2021-03-01'
  AND CreationDate < TIMESTAMP '2021-04-01';`
    },
    {
      id: "titulos-que-empiezan-por-digito",
      title: "Convierte tipos con CAST y TRY_CAST",
      temas: ["consulta-basica", "texto", "fechas"],
      dificultad: "facil",
      prompt: "Muestra las diez preguntas de menor Id cuyo título empiece por un dígito. Devuelve Id, Title, el primer carácter convertido a entero con TRY_CAST(left(Title, 1) AS INTEGER) y el día de creación como fecha con CAST(CreationDate AS DATE). TRY_CAST devuelve NULL cuando la conversión no es posible, en lugar de producir un error; úsalo también en el WHERE para quedarte con los títulos que empiezan por un número.",
      solution: `SELECT Id,
       Title,
       TRY_CAST(left(Title, 1) AS INTEGER) AS PrimerDigito,
       CAST(CreationDate AS DATE) AS Dia
FROM Posts
WHERE PostTypeId = 1
  AND TRY_CAST(left(Title, 1) AS INTEGER) IS NOT NULL
ORDER BY Id ASC
LIMIT 10;`
    },

    // ── Ampliación: secuencia con CREATE TABLE AS, ALTER, UPDATE y DELETE ─
    {
      id: "crea-ranking-de-usuarios",
      title: "Crea una tabla a partir de una consulta",
      temas: ["ddl", "ordenacion"],
      dificultad: "facil",
      prompt: "Paso 1 de la secuencia del ranking: crea (o reemplaza) la tabla TEMP RankingUsuarios con CREATE TABLE ... AS SELECT. Debe contener Id, DisplayName y Reputation de los cien usuarios con más reputación (desempata por Id ascendente). La tabla desaparece al recargar la página.",
      solution: `CREATE OR REPLACE TEMP TABLE RankingUsuarios AS
SELECT Id, DisplayName, Reputation
FROM Users
ORDER BY Reputation DESC, Id ASC
LIMIT 100;`
    },
    {
      id: "anade-columna-preguntas",
      title: "Añade una columna con ALTER TABLE",
      temas: ["ddl"],
      dificultad: "facil",
      requiere: ["crea-ranking-de-usuarios"],
      prompt: "Paso 2: modifica el esquema de RankingUsuarios añadiendo la columna Preguntas, de tipo entero y con valor por defecto 0. Las filas que ya existen toman ese valor.",
      solution: `ALTER TABLE RankingUsuarios
ADD COLUMN Preguntas INTEGER DEFAULT 0;`
    },
    {
      id: "rellena-preguntas-con-update-from",
      title: "Actualiza una tabla con valores de otra",
      temas: ["dml", "agrupacion"],
      dificultad: "media",
      requiere: ["anade-columna-preguntas"],
      prompt: "Paso 3: rellena Preguntas con el número de preguntas (PostTypeId = 1) que ha escrito cada usuario del ranking. Agrega Posts por OwnerUserId en una subconsulta y úsala en UPDATE ... FROM, uniendo con la clave de RankingUsuarios. Los usuarios sin ninguna pregunta se quedan con el 0 por defecto.",
      solution: `UPDATE RankingUsuarios
SET Preguntas = p.Total
FROM (
  SELECT OwnerUserId, COUNT(*) AS Total
  FROM Posts
  WHERE PostTypeId = 1
  GROUP BY OwnerUserId
) AS p
WHERE p.OwnerUserId = RankingUsuarios.Id;`
    },
    {
      id: "borra-sin-respuestas",
      title: "Borra filas con una subconsulta",
      temas: ["dml", "subconsultas", "nulos"],
      dificultad: "media",
      requiere: ["rellena-preguntas-con-update-from"],
      prompt: "Paso 4: elimina de RankingUsuarios a los usuarios que no hayan escrito ninguna respuesta (PostTypeId = 2). Usa DELETE con NOT IN y una subconsulta sobre OwnerUserId; recuerda excluir los NULL de la subconsulta, porque un solo NULL haría que NOT IN no devolviera ninguna fila.",
      solution: `DELETE FROM RankingUsuarios
WHERE Id NOT IN (
  SELECT OwnerUserId
  FROM Posts
  WHERE PostTypeId = 2
    AND OwnerUserId IS NOT NULL
);`
    },
    {
      id: "consulta-el-ranking",
      title: "Consulta la tabla modificada",
      temas: ["consulta-basica", "ordenacion"],
      dificultad: "facil",
      requiere: ["borra-sin-respuestas"],
      prompt: "Paso 5: muestra Id, DisplayName, Reputation y Preguntas de los diez primeros usuarios de RankingUsuarios por reputación descendente (desempata por Id).",
      solution: `SELECT Id, DisplayName, Reputation, Preguntas
FROM RankingUsuarios
ORDER BY Reputation DESC, Id ASC
LIMIT 10;`
    },
    {
      id: "elimina-el-ranking",
      title: "Elimina la tabla con DROP TABLE",
      temas: ["ddl"],
      dificultad: "facil",
      requiere: ["consulta-el-ranking"],
      prompt: "Paso 6: borra la tabla RankingUsuarios. Haz que la sentencia no falle si la tabla ya no existe.",
      solution: `DROP TABLE IF EXISTS RankingUsuarios;`
    },

    // ── Ampliación: uniones, listas y comparaciones con nulos ───────────
    {
      id: "comparacion-segura-con-nulos",
      title: "Compara con <> y con IS DISTINCT FROM",
      temas: ["nulos", "join", "agregacion"],
      dificultad: "media",
      prompt: "Une Comments con las preguntas que comentan (PostTypeId = 1) y devuelve una sola fila con tres recuentos: el total de comentarios, los comentarios cuyo UserId es distinto del OwnerUserId de la pregunta según el operador <>, y los que lo son según IS DISTINCT FROM. Usa COUNT(*) FILTER (WHERE ...). Con <> se pierden las filas en las que algún lado es NULL; IS DISTINCT FROM trata el NULL como un valor más.",
      solution: `SELECT COUNT(*) AS Comentarios,
       COUNT(*) FILTER (WHERE c.UserId <> p.OwnerUserId) AS ConDistinto,
       COUNT(*) FILTER (WHERE c.UserId IS DISTINCT FROM p.OwnerUserId) AS ConDistintoSeguroConNulos
FROM Comments AS c
JOIN Posts AS p ON p.Id = c.PostId
WHERE p.PostTypeId = 1;`
    },
    {
      id: "mejores-titulos-en-una-lista",
      title: "Reúne los mejores títulos de cada autor en una lista",
      temas: ["agrupacion", "cte", "texto"],
      dificultad: "media",
      prompt: "Quédate con los cinco usuarios que han escrito más preguntas (OwnerUserId no nulo; desempata por OwnerUserId ascendente) usando una CTE. Para cada uno devuelve su OwnerUserId, su número de preguntas y una lista con los tres títulos de sus preguntas con más puntuación (desempata por Id). Pista: list(Title ORDER BY ...) construye la lista y [1:3] extrae los tres primeros elementos.",
      solution: `WITH Autores AS (
  SELECT OwnerUserId, COUNT(*) AS Preguntas
  FROM Posts
  WHERE PostTypeId = 1
    AND OwnerUserId IS NOT NULL
  GROUP BY OwnerUserId
  ORDER BY Preguntas DESC, OwnerUserId ASC
  LIMIT 5
)
SELECT a.OwnerUserId,
       a.Preguntas,
       list(p.Title ORDER BY p.Score DESC, p.Id ASC)[1:3] AS MejoresTitulos
FROM Autores AS a
JOIN Posts AS p ON p.OwnerUserId = a.OwnerUserId
               AND p.PostTypeId = 1
GROUP BY a.OwnerUserId, a.Preguntas
ORDER BY a.Preguntas DESC, a.OwnerUserId ASC;`
    },
    {
      id: "pregunta-respuesta-y-sus-autores",
      title: "Une cuatro tablas: pregunta, respuesta aceptada y los dos autores",
      temas: ["join", "ordenacion"],
      dificultad: "media",
      prompt: "Para las preguntas cuya respuesta aceptada la escribió otro usuario, muestra el Id y el Title de la pregunta, el DisplayName de su autor, el Id de la respuesta aceptada, el DisplayName de quien la escribió y la puntuación de la respuesta. Necesitas Posts dos veces (pregunta y respuesta) y Users dos veces (cada autor). Muestra las diez con la respuesta de mayor puntuación; desempata por Id de pregunta ascendente.",
      solution: `SELECT q.Id AS PreguntaId,
       q.Title,
       uq.DisplayName AS AutorPregunta,
       a.Id AS RespuestaId,
       ua.DisplayName AS AutorRespuesta,
       a.Score AS PuntuacionRespuesta
FROM Posts AS q
JOIN Users AS uq ON uq.Id = q.OwnerUserId
JOIN Posts AS a ON a.Id = q.AcceptedAnswerId
JOIN Users AS ua ON ua.Id = a.OwnerUserId
WHERE q.PostTypeId = 1
  AND ua.Id <> uq.Id
ORDER BY a.Score DESC, q.Id ASC
LIMIT 10;`
    },

    // ── Ampliación: secuencia de relación n:m con una tabla puente ──────
    {
      id: "crea-tabla-puente-de-etiquetas",
      title: "Normaliza las etiquetas en una tabla puente",
      temas: ["ddl", "texto"],
      dificultad: "media",
      prompt: "Paso 1 de la secuencia n:m: la columna Tags de Posts guarda varias etiquetas en una sola cadena ('<a><b>'), lo que impide relacionarlas con Tags. Crea (o reemplaza) la tabla TEMP PreguntaEtiqueta con una fila por cada pareja (pregunta, etiqueta): PostId y TagName, solo para preguntas con Tags no nulo. Parte la cadena con string_split(trim(Tags, '<>'), '><') y expándela con unnest.",
      solution: `CREATE OR REPLACE TEMP TABLE PreguntaEtiqueta AS
SELECT Id AS PostId,
       unnest(string_split(trim(Tags, '<>'), '><')) AS TagName
FROM Posts
WHERE PostTypeId = 1
  AND Tags IS NOT NULL;`
    },
    {
      id: "uso-real-de-las-etiquetas",
      title: "Compara el uso real con el contador de Tags",
      temas: ["join-externo", "agrupacion"],
      dificultad: "media",
      requiere: ["crea-tabla-puente-de-etiquetas"],
      prompt: "Paso 2: para cada fila de Tags muestra TagName, su Count declarado y cuántas filas de PreguntaEtiqueta tiene realmente. Conserva las etiquetas que no aparezcan en ninguna pregunta (LEFT JOIN). Muestra las quince con más usos reales; desempata por TagName ascendente.",
      solution: `SELECT t.TagName,
       t.Count AS Declarado,
       COUNT(pe.PostId) AS Real
FROM Tags AS t
LEFT JOIN PreguntaEtiqueta AS pe ON pe.TagName = t.TagName
GROUP BY t.TagName, t.Count
ORDER BY Real DESC, t.TagName ASC
LIMIT 15;`
    },
    {
      id: "preguntas-con-las-dos-etiquetas",
      title: "Busca preguntas que tengan dos etiquetas a la vez",
      temas: ["agrupacion", "join"],
      dificultad: "dificil",
      requiere: ["crea-tabla-puente-de-etiquetas"],
      prompt: "Paso 3: encuentra las preguntas etiquetadas a la vez con python y pandas. Una sola fila de PreguntaEtiqueta no puede tener las dos etiquetas, así que agrupa por PostId y exige HAVING COUNT(DISTINCT TagName) = 2 tras filtrar con IN. Une el resultado con Posts y muestra Id, Title y Score de las diez con más puntuación (desempata por Id).",
      solution: `SELECT p.Id, p.Title, p.Score
FROM Posts AS p
JOIN (
  SELECT PostId
  FROM PreguntaEtiqueta
  WHERE TagName IN ('python', 'pandas')
  GROUP BY PostId
  HAVING COUNT(DISTINCT TagName) = 2
) AS ambas ON ambas.PostId = p.Id
ORDER BY p.Score DESC, p.Id ASC
LIMIT 10;`
    },
    {
      id: "pares-de-etiquetas",
      title: "Encuentra los pares de etiquetas que aparecen juntas",
      temas: ["join", "agrupacion", "ordenacion"],
      dificultad: "dificil",
      requiere: ["crea-tabla-puente-de-etiquetas"],
      prompt: "Paso 4: une PreguntaEtiqueta consigo misma por PostId para contar cuántas preguntas comparten cada par de etiquetas. Para no contar cada par dos veces ni emparejar una etiqueta consigo misma, exige a.TagName < b.TagName. Muestra los quince pares más frecuentes con las dos etiquetas y el número de preguntas; desempata por las etiquetas.",
      solution: `SELECT a.TagName AS Etiqueta1,
       b.TagName AS Etiqueta2,
       COUNT(*) AS Preguntas
FROM PreguntaEtiqueta AS a
JOIN PreguntaEtiqueta AS b
  ON b.PostId = a.PostId
 AND a.TagName < b.TagName
GROUP BY a.TagName, b.TagName
ORDER BY Preguntas DESC, Etiqueta1 ASC, Etiqueta2 ASC
LIMIT 15;`
    },

    // ── Ampliación: CTE, fechas y funciones ventana avanzadas ───────────
    {
      id: "mediana-hasta-la-primera-respuesta",
      title: "Mide cuánto tarda en llegar la primera respuesta",
      temas: ["cte", "fechas", "agregacion"],
      dificultad: "dificil",
      prompt: "En una CTE calcula la fecha de la primera respuesta (MIN(CreationDate) de las publicaciones con PostTypeId = 2) de cada pregunta por ParentId. Después, por año de la pregunta, muestra el año, cuántas preguntas tienen respuesta y la mediana de horas hasta la primera, con dos decimales. Usa date_diff('minute', ...) y median().",
      solution: `WITH PrimeraRespuesta AS (
  SELECT ParentId, MIN(CreationDate) AS Primera
  FROM Posts
  WHERE PostTypeId = 2
    AND ParentId IS NOT NULL
  GROUP BY ParentId
)
SELECT year(q.CreationDate) AS Anio,
       COUNT(*) AS Respondidas,
       ROUND(median(date_diff('minute', q.CreationDate, r.Primera)) / 60.0, 2) AS HorasMediana
FROM Posts AS q
JOIN PrimeraRespuesta AS r ON r.ParentId = q.Id
WHERE q.PostTypeId = 1
GROUP BY Anio
ORDER BY Anio;`
    },
    {
      id: "preguntas-en-siete-dias",
      title: "Calcula una ventana móvil por rango de fechas",
      temas: ["ventanas", "cte", "fechas"],
      dificultad: "dificil",
      prompt: "En una CTE cuenta las preguntas de cada día de 2024. Después añade, para cada día, el total de preguntas de ese día y los seis anteriores con SUM(...) OVER (ORDER BY Dia RANGE BETWEEN INTERVAL 6 DAYS PRECEDING AND CURRENT ROW). A diferencia de ROWS, RANGE mide la distancia en fechas, no en filas, así que los días sin preguntas no distorsionan la ventana. Ordena por día.",
      solution: `WITH PorDia AS (
  SELECT CAST(CreationDate AS DATE) AS Dia,
         COUNT(*) AS Preguntas
  FROM Posts
  WHERE PostTypeId = 1
    AND CreationDate >= TIMESTAMP '2024-01-01'
    AND CreationDate < TIMESTAMP '2025-01-01'
  GROUP BY Dia
)
SELECT Dia,
       Preguntas,
       SUM(Preguntas) OVER (
         ORDER BY Dia
         RANGE BETWEEN INTERVAL 6 DAYS PRECEDING AND CURRENT ROW
       ) AS UltimosSieteDias
FROM PorDia
ORDER BY Dia;`
    },
    {
      id: "rachas-de-dias-con-mucha-actividad",
      title: "Detecta rachas de días consecutivos",
      temas: ["ventanas", "cte", "fechas"],
      dificultad: "dificil",
      prompt: "Encuentra las rachas de días seguidos con al menos 40 preguntas. Un truco clásico: numera con ROW_NUMBER() los días que cumplen la condición y réstale ese número a la fecha; los días consecutivos dan siempre el mismo resultado y forman un grupo. Muestra las cinco rachas más largas con su primer día, su último día y su longitud (desempata por el primer día).",
      solution: `WITH DiasActivos AS (
  SELECT CAST(CreationDate AS DATE) AS Dia
  FROM Posts
  WHERE PostTypeId = 1
  GROUP BY Dia
  HAVING COUNT(*) >= 40
),
Numerados AS (
  SELECT Dia,
         Dia - CAST(ROW_NUMBER() OVER (ORDER BY Dia) AS INTEGER) AS Grupo
  FROM DiasActivos
)
SELECT MIN(Dia) AS Inicio,
       MAX(Dia) AS Fin,
       COUNT(*) AS DiasSeguidos
FROM Numerados
GROUP BY Grupo
ORDER BY DiasSeguidos DESC, Inicio ASC
LIMIT 5;`
    }
  ]
};
