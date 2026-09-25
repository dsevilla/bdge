/*
 * Ejercicios de consulta basados en SQL/sesión 1.
 * Añade nuevos objetos a `exercises`; el editor se crea vacío.
 */
export const page = {
  id: "sesion-1",
  title: "Sesión 1 · Consultas SQL básicas",
  description: "SELECT, filtros, agregación, JOIN, nulos, subconsultas y CASE.",
  exercises: [
    {
      id: "inventario-tablas",
      title: "Explora las tablas",
      prompt: "Muestra en orden alfabético las tablas y vistas de la base. En SQLite puedes consultar sqlite_master; excluye los objetos internos cuyo nombre empieza por sqlite_.",
      solution: `SELECT type AS Tipo, name AS Nombre
FROM sqlite_master
WHERE type IN ('table', 'view')
  AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;`
    },
    {
      id: "preguntas-mas-contestadas",
      title: "Ordena preguntas por número de respuestas",
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
      prompt: "Cuenta los comentarios cuyo UserId sea NULL o no encuentre correspondencia en Users. Usa LEFT JOIN y filtra por la clave de Users.",
      solution: `SELECT COUNT(*) AS ComentariosSinUsuario
FROM Comments AS c
LEFT JOIN Users AS u ON u.Id = c.UserId
WHERE u.Id IS NULL;`
    },
    {
      id: "preguntas-sin-respuesta",
      title: "Encuentra preguntas sin respuesta",
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
      prompt: "Cuenta las filas de Votes para cada VoteTypeId y ordena de más frecuente a menos frecuente. Los tipos 2 y 3 representan votos positivos y negativos.",
      solution: `SELECT VoteTypeId, COUNT(*) AS NumeroVotos
FROM Votes
GROUP BY VoteTypeId
ORDER BY NumeroVotos DESC, VoteTypeId ASC;`
    },
    {
      id: "usuarios-por-reputacion",
      title: "Clasifica usuarios por reputación",
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
      prompt: "Muestra veinte filas de Tags ordenadas por Count descendente. Usa TagName como desempate.",
      solution: `SELECT TagName, Count
FROM Tags
ORDER BY Count DESC, TagName ASC
LIMIT 20;`
    },
    {
      id: "crear-tabla-temporal",
      title: "Prepara una tabla temporal para DML",
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
      prompt: "Paso 2 de DML: inserta dos tareas con Id 1 y 2. Haz que puedas ejecutar la solución varias veces sin duplicar filas.",
      solution: `INSERT OR REPLACE INTO EjercicioDML (Id, Descripcion, Completada)
VALUES
  (1, 'Repasar SELECT', 0),
  (2, 'Repasar JOIN', 0);`
    },
    {
      id: "actualizar-temporal",
      title: "Actualiza una tarea",
      prompt: "Paso 3 de DML: marca como completada la tarea con Id 1 y comprueba el contenido con una consulta SELECT.",
      solution: `UPDATE EjercicioDML
SET Completada = 1
WHERE Id = 1;`
    },
    {
      id: "iniciar-transaccion",
      title: "Inicia una transacción",
      prompt: "Paso 4 de DML: inicia una transacción. Ejecuta después, en el ejercicio siguiente, una modificación de la tarea 2.",
      solution: `BEGIN;`
    },
    {
      id: "actualizar-en-transaccion",
      title: "Modifica dentro de la transacción",
      prompt: "Paso 5: marca la tarea 2 como completada. Después ejecuta ROLLBACK en el siguiente ejercicio.",
      solution: `UPDATE EjercicioDML
SET Completada = 1
WHERE Id = 2;`
    },
    {
      id: "deshacer-transaccion",
      title: "Deshaz los cambios de la transacción",
      prompt: "Paso 6: ejecuta ROLLBACK y, en el ejercicio siguiente, consulta la tabla para comprobar que la tarea 2 sigue pendiente.",
      solution: `ROLLBACK;`
    },
    {
      id: "consultar-temporal",
      title: "Comprueba el estado de la tabla temporal",
      prompt: "Muestra las dos tareas en orden de Id. Tras el rollback, solo la tarea 1 debe aparecer completada.",
      solution: `SELECT Id, Descripcion, Completada
FROM EjercicioDML
ORDER BY Id;`
    }
  ]
};
