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



insert into trabajos values('T01','Open TSDB',
  '
  - Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, framework de procesamiento map/reduce, replicación
    multiservidor, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de series de datos, como si, por ejemplo, comentarios,
    posts, etc. se ejecutaran en un stream)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  - \url{http://opentsdb.net/}
  ');




insert into trabajos values('T02','Apache Cassandra',
  '
  - Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, framework de procesamiento map/reduce, replicación
    multiservidor, lenguaje de consultas CQL, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de agregación siguiendo el modelo de documentos)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  ');




insert into trabajos values('T03','OrientDB',
  '
  -  Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, framework de procesamiento map/reduce, replicación
    multiservidor, lenguaje de consultas, grafos vs. documentos, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de agregación y grafos)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  ');




insert into trabajos values('T04','Redis',
  '
  - Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, {\em framework} de procesamiento map/reduce, replicación
    multiservidor, lenguaje de consultas, uso de varias estructuras de
    datos (listas, mapas), etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de diferentes estructuras de datos)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  ');




insert into trabajos values('T05','Elasticsearch',
  '
  - Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, organización en etiquetas, búsquedas complejas,
    replicación multiservidor, lenguaje de consultas, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (organización de etiquetas)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  ');



insert into trabajos values('T06','CouchBase \& N1QL',
  '
  - Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, organización en etiquetas, búsquedas complejas,
    replicación multiservidor, lenguaje de consultas N1QL, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (documentos y consultas)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  ');




insert into trabajos values('T07','Riak',
  '
  - Pasos de instalación de la base de datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, framework de procesamiento map/reduce, replicación
    multiservidor, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de agregación siguiendo el modelo de documentos)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
  ');




insert into trabajos values('T08','RethinkDB',
'
- \url{https://rethinkdb.com/}. Pasos de instalación de la base de
  datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, framework de procesamiento map/reduce, replicación
    multiservidor, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de agregación donde sea posible)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
');




insert into trabajos values('T09','InfluxDB',
'
- \url{https://www.influxdata.com/time-series-platform/influxdb/}.
  Pasos de instalación de la base de datos (a ser posible en la máquina
  virtual)
- Descripción de la base de datos, modo de funcionamiento,
  posibilidades de modelado de datos y características (si permite
  transacciones, tratamiento de series temporales, uso del API HTTP,
  replicación multiservidor, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de agregación donde sea posible)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
');




insert into trabajos values('T10','Accumulo',
'
- \url{http://accumulo.apache.org/}. Pasos de instalación de la base de
  datos
- Descripción de la base de datos, modo de funcionamiento,
  posibilidades de modelado de datos y características (si permite
  transacciones, tratamiento de columnas, replicación multiservidor, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de columnas)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
');




insert into trabajos values('T11','ArangoDB',
'
- \url{https://www.arangodb.com/}. Pasos de instalación de la base de
  datos
  - Descripción de la base de datos, modo de funcionamiento,
    posibilidades de modelado de datos y características (si permite
    transacciones, framework de procesamiento map/reduce, replicación
    multiservidor, lenguaje de consultas AQL, grafos vs. documentos, etc.)
  - Mostrar cómo importar los datos de Stackoverflow
  - Mostrar cómo redistribuir los datos de Stackoverflow de forma
    óptima (uso de agregación y grafos)
  - Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión 2
  - Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
');


insert into trabajos values('T12','Tecnologías Serverless',
'
- Pasos de uso de cada plataforma. Al menos: AWS Lambda y Azure
  Functions (también se puede considerar Google UDF)
- Descripción del modo de funcionamiento,
  posibilidades de modelado de datos y características
- Mostrar cómo trabajar con los datos de Stackoverflow
- Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
    artículos vistos en la sesión2
- Realizar pruebas de eficiencia comparada con alguna de las bases de
    datos vistas en la asignatura
');


insert into trabajos values('T13','Apache Sqoop',
'
- \url{http://sqoop.apache.org/}. Pasos de instalación de la
  herramienta
- Descripción de la herramienta, posibilidades de transformación y
  carga de datos, modos de funcionamiento, posibilidades de cambio de
  formato de datos, etc.)
  - Mostrar cómo importar los datos de Stackoverflow (de CSV a MySQL,
    de CSV a HBase, viendo cómo organizar la base de datos)
- API de creación de trabajos {\em batch}
- Generar código de importación con {\tt sqoop-codegen}
');




insert into trabajos values('T14','Apache Pig',
'
- Pasos de instalación de la herramienta
- Descripción de la herramienta, posibilidades de transformación y
  carga de datos, modos de funcionamiento, posibilidades de proceso de
  datos, etc.
- Mostrar cómo trabajar con los datos CSV de Stackoverflow y mostrar
  cómo se realizarían las consultas RQ1 a RQ4 de los artículos vistos en la
  sesión 2
- Realizar pruebas de eficiencia comparada con alguna de las bases de
  datos vistas en la asignatura
');

insert into trabajos values('T15','Apache Nifi',
'
- https://nifi.apache.org/
- Pasos de instalación
- Descripción de la herramienta, modo de funcionamiento,
  posibilidades de modelado de datos y características
- Mostrar cómo importar en flujo los datos de Stackoverflow
- Mostrar cómo se realizarían las consultas RQ1 a RQ4 de los
  artículos vistos en la sesión 2.
');

insert into trabajos values('T16','Apache Atlas',
'
- https://atlas.apache.org/
- Pasos de instalación
- Descripción de la herramienta, modo de funcionamiento,
  posibilidades de modelado de datos y características
- Mostrar cómo importar los datos de Stackoverflow
- Mostrar consultas sobre la base de datos de StackOverflow y si se
  podrían realizar las consultas RQ1 a RQ4 de los artículos vistos en la
  sesión 2.
');
