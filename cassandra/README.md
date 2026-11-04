# Prácticas de Cassandra: ejecución local

Este directorio contiene los cuadernos de Cassandra y dos configuraciones de
Compose: un nodo, más sencilla para empezar, o un clúster local de dos nodos.
El fichero de Compose se indica explícitamente en los comandos porque aquí no
hay un `docker-compose.yml` genérico.

## Requisitos

- **Linux:** instala Docker Engine y el complemento Docker Compose para tu
  distribución siguiendo la [guía oficial de Docker Engine](https://docs.docker.com/engine/install/)
  y la [instalación del complemento Compose](https://docs.docker.com/compose/install/linux/).
  Comprueba la instalación con `docker --version` y `docker compose version`.
- **macOS:** instala y abre [Docker Desktop para Mac](https://docs.docker.com/desktop/setup/install/mac-install/).
  Incluye Docker Compose; espera a que Docker indique que el motor está activo.
- **Windows 10 versión 2004 (compilación 19041 o posterior) o Windows 11:**
  instala WSL 2 antes de Docker Desktop. En PowerShell como administrador
  ejecuta `wsl --install` y reinicia Windows. Si WSL ya estaba instalado pero
  no tienes una distribución Linux, ejecuta `wsl --install -d Ubuntu`. Abre
  Ubuntu para crear tu usuario y contraseña; después, en PowerShell, actualiza
  WSL y comprueba la versión de Ubuntu:

  ```powershell
  wsl --update
  wsl --list --verbose
  ```

  La columna `VERSION` debe mostrar `2`; si muestra `1`, ejecuta
  `wsl --set-version Ubuntu 2`. Después instala
  [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/),
  usa el motor WSL 2 y activa la integración de Ubuntu en **Settings → Resources
  → WSL Integration**. Abre Ubuntu desde Windows Terminal y trabaja desde allí.
  Guarda el repositorio dentro del sistema de archivos Linux, por ejemplo en
  `~/bdge`, para que los montajes de carpetas funcionen con buen rendimiento.
  Microsoft documenta los pasos de [instalación de WSL](https://learn.microsoft.com/es-es/windows/wsl/install)
  y Docker los de [integración con WSL 2](https://docs.docker.com/desktop/features/wsl/).

## Elegir y arrancar la configuración

Para empezar con un nodo, desde este directorio ejecuta:

```console
docker compose -f docker-compose-cassandra.yml up -d
docker compose -f docker-compose-cassandra.yml ps
```

El cuaderno y Cassandra aparecerán cuando sus contenedores estén en marcha; la
base puede tardar un rato en superar su comprobación de salud:

```text
SERVICE     STATUS          PORTS
cassandra   Up (healthy)    0.0.0.0:9042->9042/tcp
notebook    Up              0.0.0.0:8888->8888/tcp
```

Abre <http://localhost:8888> e introduce el token `bdge` si Jupyter lo pide.
El cuaderno se conecta al contenedor de Cassandra por la red de Compose.

### Conectar desde Visual Studio Code

Instala la extensión Jupyter de VS Code y abre allí el cuaderno del repositorio.
En la esquina superior derecha, selecciona **Select Kernel** → **Select Another
Kernel...** → **Existing Jupyter Server**. La primera vez, elige **Enter the URL
of the running Jupyter server** e introduce:

```text
http://localhost:8888/?token=bdge
```

Si VS Code pide un nombre para guardar el servidor, puedes usar `BDGE local`.
Después selecciona el kernel Python que ofrece el servidor. Las celdas se
ejecutan en el contenedor y el cuaderno abierto se guarda en el repositorio.

Para probar la topología de dos nodos, usa este fichero en lugar del de un
nodo:

```console
docker compose -f docker-compose-cassandra-2.yml up -d
docker compose -f docker-compose-cassandra-2.yml ps
```

Los dos nodos pueden tardar varios minutos en arrancar. El cuaderno espera a
que ambos estén sanos antes de iniciar. Ejecuta una sola de las dos
configuraciones a la vez; el clúster de dos nodos publica también el puerto
`9043` para el segundo nodo.

Para seguir los mensajes, usa el mismo fichero con `logs -f`, por ejemplo:

```console
docker compose -f docker-compose-cassandra.yml logs -f
docker compose -f docker-compose-cassandra.yml logs -f cassandra
```

Para la topología de dos nodos, sustituye el nombre del fichero por
`docker-compose-cassandra-2.yml`. `docker compose ps` muestra los estados; los
registros de Cassandra indican cuándo termina de iniciar.
La documentación oficial de VS Code explica cómo conectarse a un [servidor
Jupyter existente](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management).

## Parar y continuar conservando los datos

Usa `stop` y `start` con la misma configuración que arrancaste. Para un nodo:

```console
docker compose -f docker-compose-cassandra.yml stop
docker compose -f docker-compose-cassandra.yml start
```

Para dos nodos:

```console
docker compose -f docker-compose-cassandra-2.yml stop
docker compose -f docker-compose-cassandra-2.yml start
```

Esto conserva los mismos contenedores y el estado de la base. Los Compose no
declaran volúmenes con nombre; `down` con el mismo fichero `-f` elimina
contenedores y puede borrar los datos almacenados dentro de ellos. `down -v`
elimina además los volúmenes asociados.
