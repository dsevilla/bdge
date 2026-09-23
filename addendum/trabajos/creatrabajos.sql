-- -*- mode: sql; sql-product: mysql; -*-
--
-- Creación de la base de datos de asignación de trabajos.
--
-- Lo interesante de este guion no es el SQL en sí, sino tres decisiones:
--
--   1. Qué se puede garantizar de forma declarativa (con un índice) y qué hay
--      que comprobar en un disparador. Lo declarativo siempre es preferible:
--      no tiene condiciones de carrera.
--   2. Cómo se normaliza un dato de entrada antes de compararlo, para que el
--      índice único sirva de algo.
--   3. Qué datos personales hacen falta de verdad y cuáles no se guardan.

CREATE USER IF NOT EXISTS 'alumno'@'%' IDENTIFIED BY '<contraseña del curso>';

CREATE DATABASE IF NOT EXISTS trabajos
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE trabajos;

-- utf8mb4 y no utf8: en MySQL, `utf8` es un alias histórico de un juego de
-- 3 bytes por carácter que no cubre todo Unicode.
CREATE TABLE IF NOT EXISTS trabajos (
  id     VARCHAR(5) NOT NULL PRIMARY KEY,
  titulo TEXT NOT NULL,
  spec   TEXT NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Sólo se almacena el DNI.
--
-- La ordenación `utf8mb4_unicode_ci` no distingue mayúsculas de minúsculas, así
-- que '12345678z' y '12345678Z' son la MISMA clave. Con una ordenación binaria
-- serían dos filas distintas y el índice no serviría para nada.
CREATE TABLE IF NOT EXISTS asignacion_trabajos (
  dni_alumno VARCHAR(10) NOT NULL PRIMARY KEY,
  id_trabajo VARCHAR(5) NOT NULL,
  FOREIGN KEY (id_trabajo) REFERENCES trabajos(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Vista con el recuento de personas por trabajo. `LEFT OUTER JOIN` para que los
-- trabajos que no ha cogido nadie salgan con 0 y no desaparezcan.
CREATE OR REPLACE VIEW asignados AS
   SELECT id, titulo, COUNT(dni_alumno) AS nasignados
   FROM trabajos LEFT OUTER JOIN asignacion_trabajos ON id = id_trabajo
   GROUP BY id, titulo;

-- Permisos: el alumnado puede darse de alta y leer la lista de trabajos y el
-- recuento, pero NO leer `asignacion_trabajos`, así que nadie ve los DNI de los
-- demás. La vista funciona igualmente porque se ejecuta con los permisos de
-- quien la definió, no con los de quien la consulta.
GRANT INSERT ON trabajos.asignacion_trabajos TO 'alumno'@'%';
GRANT SELECT ON trabajos.trabajos            TO 'alumno'@'%';
GRANT SELECT ON trabajos.asignados           TO 'alumno'@'%';

-- El disparador cubre lo que el esquema no puede expresar: validar el DNI y
-- limitar a dos personas por trabajo.
DROP TRIGGER IF EXISTS comprueba_asignacion;

DELIMITER $$
CREATE TRIGGER comprueba_asignacion
BEFORE INSERT ON asignacion_trabajos
FOR EACH ROW
BEGIN
  DECLARE asignados_al_trabajo INT DEFAULT 0;
  DECLARE trabajo_bloqueado VARCHAR(5) DEFAULT NULL;
  DECLARE trabajo_previo VARCHAR(5) DEFAULT NULL;
  DECLARE numero_dni BIGINT DEFAULT 0;
  DECLARE mensaje TEXT;

  -- Variables locales con DECLARE, no variables de sesión (@x): las de sesión
  -- sobreviven al disparador y se pisan entre sí.

  -- Normalizar ANTES de comprobar. Un BEFORE INSERT puede modificar NEW, y sin
  -- esto '1234567-L' y '1234567L' serían dos claves distintas para el índice.
  SET NEW.dni_alumno = UPPER(REPLACE(REPLACE(TRIM(NEW.dni_alumno), '-', ''), ' ', ''));
  SET NEW.id_trabajo = UPPER(TRIM(NEW.id_trabajo));

  IF NEW.dni_alumno IS NULL OR NEW.dni_alumno NOT REGEXP '^[XYZ]?[0-9]{7,8}[A-Z]$' THEN
    SIGNAL SQLSTATE '23000'
      SET MESSAGE_TEXT = 'El DNI no es correcto. Formato 01234567L ó X1234567L.';
  END IF;

  -- Letra de control: resto entre 23 del número, indexando la cadena oficial.
  -- En el NIE la inicial se sustituye por su dígito (X=0, Y=1, Z=2).
  SET numero_dni = CAST(
    CASE LEFT(NEW.dni_alumno, 1)
      WHEN 'X' THEN CONCAT('0', SUBSTRING(NEW.dni_alumno, 2, LENGTH(NEW.dni_alumno) - 2))
      WHEN 'Y' THEN CONCAT('1', SUBSTRING(NEW.dni_alumno, 2, LENGTH(NEW.dni_alumno) - 2))
      WHEN 'Z' THEN CONCAT('2', SUBSTRING(NEW.dni_alumno, 2, LENGTH(NEW.dni_alumno) - 2))
      ELSE LEFT(NEW.dni_alumno, LENGTH(NEW.dni_alumno) - 1)
    END AS UNSIGNED);

  IF SUBSTRING('TRWAGMYFPDXBNJZSQVHLCKE', MOD(numero_dni, 23) + 1, 1)
       <> RIGHT(NEW.dni_alumno, 1) THEN
    SIGNAL SQLSTATE '23000'
      SET MESSAGE_TEXT = 'La letra no se corresponde con el número del DNI. Revísalo.';
  END IF;

  -- Cerrojo sobre la fila del trabajo. Contar y luego insertar sin bloquear es
  -- una condición de carrera de manual: dos sesiones simultáneas leen las dos
  -- el mismo recuento y las dos insertan. `FOR UPDATE` serializa las altas del
  -- mismo trabajo, y las de trabajos distintos siguen yendo en paralelo.
  SELECT id INTO trabajo_bloqueado FROM trabajos WHERE id = NEW.id_trabajo FOR UPDATE;

  IF trabajo_bloqueado IS NULL THEN
    SET mensaje = CONCAT('El trabajo ', NEW.id_trabajo, ' no existe. Consulta SELECT * FROM asignados;');
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = mensaje;
  END IF;

  -- La clave primaria ya impide dos trabajos por alumno, pero su error (1062,
  -- «Duplicate entry») no le dice nada a quien se equivoca. Esta comprobación
  -- sólo da un mensaje claro; la garantía la sigue dando el índice.
  SELECT id_trabajo INTO trabajo_previo
    FROM asignacion_trabajos WHERE dni_alumno = NEW.dni_alumno;

  IF trabajo_previo IS NOT NULL THEN
    SET mensaje = CONCAT('Ese DNI ya está asignado al trabajo ', trabajo_previo,
                         '. Habla con el profesor para cambiarlo.');
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = mensaje;
  END IF;

  SELECT COUNT(*) INTO asignados_al_trabajo
    FROM asignacion_trabajos WHERE id_trabajo = NEW.id_trabajo;

  IF asignados_al_trabajo >= 2 THEN
    SET mensaje = CONCAT('Ya hay asignadas dos personas al trabajo ', NEW.id_trabajo, '.');
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = mensaje;
  END IF;
END$$
DELIMITER ;

-- Aquí, en el guion real, va un INSERT por trabajo generado desde
-- Trabajos.ipynb, con ON DUPLICATE KEY UPDATE para poder reejecutar el guion
-- tras editar la lista sin perder las asignaciones ya hechas:
--
--   INSERT INTO trabajos (id, titulo, spec) VALUES ('T01', 'CockroachDB', '...')
--     ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), spec = VALUES(spec);
