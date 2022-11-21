-- -*- mode: sql; sql-product: mysql; -*-

CREATE USER IF NOT EXISTS 'alumno'@'%' IDENTIFIED BY '';

CREATE DATABASE IF NOT EXISTS trabajos;
USE trabajos;

CREATE TABLE trabajos (id VARCHAR(5) PRIMARY KEY, titulo TEXT, spec TEXT)
  CHARSET 'utf8' COLLATE 'utf8_general_ci';

CREATE TABLE asignacion_trabajos (
	dni_alumno VARCHAR(10),
	nombre_alumno VARCHAR(60),
	id_trabajo VARCHAR(5),
       FOREIGN KEY (id_trabajo) REFERENCES trabajos(id),
       PRIMARY KEY (dni_alumno, id_trabajo)
       ) CHARSET 'utf8' COLLATE 'utf8_general_ci';

CREATE VIEW asignados AS
   SELECT id, titulo, COUNT(DISTINCT dni_alumno) AS nasignados
   FROM trabajos LEFT OUTER JOIN asignacion_trabajos ON id = id_trabajo
   GROUP BY id;

GRANT INSERT ON trabajos.asignacion_trabajos TO 'alumno'@'%';
GRANT SELECT ON trabajos.trabajos TO 'alumno'@'%';
GRANT SELECT ON trabajos.asignados TO 'alumno'@'%';

FLUSH PRIVILEGES;

DELIMITER $$
CREATE TRIGGER comprueba_asignacion BEFORE INSERT ON asignacion_trabajos
FOR EACH ROW
BEGIN
  SELECT NEW.dni_alumno REGEXP '^[A-Za-z]?[0-9]{7,}-?[a-zA-Z]$' INTO @cnt;
  IF @cnt <> 1 THEN
    SIGNAL SQLSTATE '23000'
      SET MESSAGE_TEXT = 'El DNI no es correcto. Formato 01234567L ó X01234567L.';
  END IF;

  SELECT count(*) INTO @cnt FROM asignacion_trabajos
     WHERE id_trabajo = NEW.id_trabajo;
  IF @cnt > 1 THEN
    set @message_text = CONCAT('Ya hay asignadas dos personas al trabajo ', NEW.id_trabajo, '.');
    SIGNAL SQLSTATE '23000'
      SET MESSAGE_TEXT = @message_text;
  END IF;

  SELECT count(*) INTO @cnt FROM asignacion_trabajos
     WHERE dni_alumno = NEW.dni_alumno;
  IF @cnt > 0 THEN
    set @message_text = CONCAT('¡Ese DNI (', NEW.dni_alumno, ') ya está asignado a un trabajo! Hable con el profesor para cambiarlo.');
    SIGNAL SQLSTATE '23000'
      SET MESSAGE_TEXT = @message_text;
  END IF;
END
$$
DELIMITER ;



insert into trabajos values(...);
