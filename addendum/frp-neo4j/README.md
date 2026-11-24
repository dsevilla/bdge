# Túneles frp para Neo4j en Colab

En Colab, Neo4j se ejecuta dentro de la máquina virtual del cuaderno y el
cuaderno se conecta a él por Bolt en `localhost`. Para abrir además Neo4j
Browser desde el navegador del alumno, `setup-neo4j-colab.sh` abre un túnel
[frp](https://github.com/fatedier/frp) hasta `dsevilla-proxy.inf.um.es`.

## Clave del túnel

El servidor sólo acepta clientes con la clave del curso, que cambia cada año y
se da en clase. El alumnado la escribe en la variable `CLAVE_TUNEL` del
cuaderno **antes de ejecutarlo**, y el cuaderno se la pasa al script en la
variable de entorno `BDGE_CLAVE_TUNEL`. Sin clave, Neo4j se instala y funciona
igual, pero no se abre el túnel. El servidor y su configuración no están en
este repositorio.

## Qué hace el script

`setup-neo4j-colab.sh` instala Neo4j con autenticación y una contraseña
aleatoria de seis caracteres para el usuario `neo4j`, y espera a que acepte
conexiones Bolt. Con el túnel abierto, cualquiera que recorra los puertos del
servidor llegaría a la base, así que no se arranca sin contraseña. El script
imprime `NEO4J_PASSWORD=<contraseña>`; los cuadernos la guardan en la variable
de entorno `NEO4J_PASSWORD`, la usan en `basic_auth` y se la muestran al alumno,
que la necesita para entrar en Neo4j Browser.

Si hay clave, descarga `frpc` y lo arranca con dos proxies TCP (7474 y 7687)
que piden `remotePort = 0`: cada sesión recibe así puertos distintos sin que
nadie los reparta. El script lee los puertos asignados en la API local de `frpc`
(`127.0.0.1:7400/api/status`) e imprime al final la URL HTTP de Neo4j Browser
y la URL Bolt pública (`NEO4J_HTTP_URL=...` y `NEO4J_BOLT_URL=...`). Si el
túnel no se abre (sin clave, con una clave incorrecta o sin servidor), imprime
una línea `[AVISO]` y la conexión local por Bolt sigue funcionando.

Con la variable de entorno `BDGE_SIN_TUNEL` no vacía, el script no abre el
túnel aunque haya clave. La define el `colab-check` del CI: allí el túnel no
sirve para nada, y descargar el binario de frp como root hizo saltar el EDR del
runner.

## Versión de frp

`FRP_VERSION` debe coincidir con la versión del servidor. Al actualizar, se
cambia primero el servidor y después este script.
