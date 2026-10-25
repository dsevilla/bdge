# Comparación local de MySQL y MongoDB

`benchmark.py` mide seis operaciones completas con un único cliente Python:
insertar, crear el índice, actualizar, borrar, contar exactamente y recibir
cinco registros ordenados tras saltar veinte. Usa MySQL 8 y MongoDB 8.3.

Desde este directorio:

```bash
BENCHMARK_UID="$(id -u)" BENCHMARK_GID="$(id -g)" \
  docker compose -p bdge-nosql-benchmark up --abort-on-container-exit --exit-code-from benchmark
```

La primera vuelta calienta ambos servidores. Después se realizan tres vueltas
con un millón de registros, alternando el orden de los productos. Cada vuelta
recrea exclusivamente la tabla/colección `benchmark.sensor_log`. El proyecto
no publica puertos ni utiliza los servidores de las prácticas. El Compose
requiere acceso a Internet para instalar las versiones fijadas de los clientes.
No construye imágenes locales.

Para una comprobación reducida se pueden añadir `BENCHMARK_ROWS=130000` y
`BENCHMARK_REPEATS=1` al comando anterior. Esto reemplaza los resultados: antes
de usar el gráfico docente, repetir la configuración de un millón y tres vueltas.

La salida es `results.json` (muestras, versiones y comprobaciones), `mysql.csv`
y `mongo.csv` (mediana, mínimo y máximo en **segundos**) y `benchmark.png`.
`perf_plot.ipynb` permite explorar la misma medición, sin repetir la carga.
Para regenerar la figura de teoría desde el resultado guardado, desde la raíz
privada, copiar `results.json` a `teoria/figures/benchmark-results.json` y
ejecutar `python teoria/figures/benchmark.py`. Los resultados guardados
son la medición solicitada para el material docente, no datos universales de rendimiento.

Los servidores tienen el mismo límite de 2 CPU y 2 GiB. Se generan las mismas
fechas y valores antes de cronometrar; las cargas usan lotes de 5.000 registros.
MySQL confirma por lote (`innodb_flush_log_at_trx_commit=1`, `sync_binlog=1`);
MongoDB confirma el diario (`w=1`, `j=true`), con atomicidad por documento.
Estas opciones **no igualan la atomicidad**: se comparan las operaciones habituales
de cada modelo, no transacciones equivalentes ante fallos. El tamaño de caché
es propio de cada motor; no se fuerza a igualar sus algoritmos internos.

Tras cada vuelta se comprueban recuentos, actualizaciones, borrados, suma de las
lecturas y los cinco registros completos frente al otro motor y a los datos de
entrada. La carga incluye serialización, envío, ejecución y confirmación, pero
no generación. No se compara generación SQL en servidor con generación Python.
La prueba es secuencial, sobre un nodo, y no mide escalabilidad ni latencias bajo carga.

`perf_test.sql` es el DDL que ejecuta el cliente común. `mongo_perf_test.js` es
una referencia equivalente ejecutable con `mongosh`; utiliza exclusivamente
`benchmark_reference.sensor_log`. Las mediciones comparables se hacen con
`benchmark.py`, no con tiempos de distintos shells.

Los seis ficheros `output.mysql*` y `output.mongo*` se conservan como registros
históricos de 2016. No se usan para generar los gráficos actuales.

Al terminar, retirar sólo los recursos de este proyecto:

```bash
docker compose -p bdge-nosql-benchmark down --volumes
```
