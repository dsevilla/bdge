# Laboratorio de modelado Cassandra

Esta aplicación se publica en `practice-web/cassandra/` de GitHub Pages junto a
las prácticas web de SQL, MongoDB y Cypher. Es un simulador educativo en
JavaScript puro: el alumno escribe un subconjunto pequeño de CQL, observa cómo
la clave primaria divide las filas en particiones y comprueba consultas sobre
un conjunto sintético de ocho filas.

No es una base Cassandra dentro del navegador. No hay clúster, servidor,
replicación, token ring, consistencia, latencia, SSTables, índices, TTL,
contadores, colecciones ni persistencia. Los ejercicios de los cuadernos y las
explicaciones de rendimiento siguen necesitando Cassandra real.

## Qué se practica

La página contiene seis ejercicios sobre:

- una partición por autor;
- una clave de partición compuesta por autor y mes;
- el orden y el desempate de las columnas de clustering;
- una lectura de intervalo dentro de una partición;
- una consulta global que necesita `ALLOW FILTERING` y la decisión de diseñar
  otra tabla;
- el upsert de una fila identificada por toda su clave primaria.

La carga de ejemplo repite las mismas validaciones que un `INSERT`. Las fechas
se normalizan a UTC y los `bigint` se mantienen como `BigInt`, de modo que los
identificadores grandes no pasan por un `Number` impreciso.

## Subconjunto de CQL

El parser soporta comentarios, identificadores citados, `CREATE TABLE`,
`DROP TABLE`, `INSERT`, `SELECT`, claves simples y compuestas, tipos `int`,
`bigint`, `text`, `boolean` y `timestamp`, `CLUSTERING ORDER BY`, igualdad,
intervalos, `LIMIT` y `ALLOW FILTERING`. El motor mantiene las tablas y las
filas sólo en memoria. Un `INSERT` con la misma clave completa hace upsert y
conserva las columnas no enviadas.

No se aceptan `IN`, `OR`, funciones, agregaciones, `UPDATE`, `DELETE`,
`ORDER BY` de una consulta, marcadores de parámetros, keyspaces ni opciones
adicionales de `WITH`. La sesión limita la entrada a 64 KiB, 100 sentencias y
5000 filas por tabla. Una construcción válida de Cassandra que no esté en este
subconjunto se muestra como no implementada; no se presenta como una regla
universal de Cassandra.

La explicación de una consulta distingue acceso a una partición, intervalo
contiguo, recorrido sintético global y filtrado autorizado. El contador de
filas candidatas sólo describe el trabajo del simulador y no es una medición
del motor Cassandra.

## Desarrollo y comprobaciones

Sirve el repositorio desde su raíz para que los módulos ES se carguen por HTTP:

```console
python3 -m http.server 8765 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8765/addendum/practice-web/cassandra/`. No abras el
`index.html` con `file://`. Las pruebas puras del parser, motor y ejercicios se
ejecutan sin navegador ni Docker:

```console
node --test addendum/practice-web/tests/cassandra-*.test.mjs
```

La práctica se publica automáticamente porque `publish-github-pages` copia
cada subdirectorio de `addendum/practice-web/` que tenga `practice.json` e
`index.html`. La portada ordena las tarjetas como SQL, MongoDB, Cassandra y
Cypher.

Las referencias semánticas son la [documentación de CREATE TABLE de Apache
Cassandra](https://cassandra.apache.org/doc/latest/cassandra/reference/cql-commands/create-table.html)
y la [documentación de DML y SELECT](https://cassandra.apache.org/doc/latest/cassandra/developing/cql/dml.html).
