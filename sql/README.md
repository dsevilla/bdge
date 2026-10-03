# Prácticas de SQL: ejecución local

Este directorio contiene los cuadernos SQL y `docker-compose.yml`. Compose
arranca Jupyter y MySQL 8; el cuaderno se conecta al servicio `mysql` dentro de
la red de Compose.

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

## Arrancar Jupyter y MySQL

Desde este directorio ejecuta:

```console
docker compose up -d
docker compose ps
```

El resultado será parecido a este. MySQL puede tardar un poco en pasar a
`healthy` mientras inicializa:

```text
NAME             SERVICE    STATUS          PORTS
sql-mysql-1      mysql      Up (healthy)    0.0.0.0:3306->3306/tcp
sql-notebook-1   notebook   Up              0.0.0.0:8888->8888/tcp
```

Abre <http://localhost:8888> e introduce el token `bdge` si Jupyter lo pide.
El cuaderno se conecta a MySQL mediante el nombre `mysql`; desde el anfitrión,
el puerto publicado es `3306`.

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

Para ver todos los mensajes durante el arranque, ejecuta `docker compose up`
sin `-d`. En segundo plano puedes seguirlos con:

```console
docker compose logs -f
docker compose logs -f mysql
```

MySQL informa en sus mensajes cuando está listo para aceptar conexiones.
`docker compose ps` muestra el estado de salud y los puertos publicados.
La documentación oficial de VS Code explica cómo conectarse a un [servidor
Jupyter existente](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management).

## Parar y continuar conservando la base

Para detener temporalmente el entorno y reanudarlo después con los mismos
contenedores y datos:

```console
docker compose stop
docker compose start
```

También puedes reiniciarlos con `docker compose restart`. Estos Compose no
declaran un volumen con nombre para la base: usa `stop`/`start` para conservar
el estado de esta ejecución. `docker compose down` elimina los contenedores y
`docker compose down -v` elimina además los volúmenes; no uses esos comandos si
quieres retomar los datos al siguiente inicio.

## Usar Podman

Instala [Podman](https://podman.io/docs/installation) y un proveedor de Compose,
como `podman-compose`; `podman compose` delega en ese proveedor ([documentación
de Podman Compose](https://docs.podman.io/en/latest/markdown/podman-compose.1.html)).
En Linux inicia Podman en modo rootless. En macOS y Windows, Podman necesita una
máquina Linux: tras instalarlo, inicialízala y arráncala con:

```console
podman machine init  # sólo la primera vez
podman machine start
```

En Windows, instala WSL 2 siguiendo los pasos de requisitos; Podman usa WSL 2
para su máquina Linux. Desde este directorio usa el Compose base y el ajuste
rootless para el volumen del cuaderno:

```console
podman compose -f docker-compose.yml -f docker-compose.podman.yml up -d
podman compose -f docker-compose.yml -f docker-compose.podman.yml ps
podman compose -f docker-compose.yml -f docker-compose.podman.yml logs -f
```

Para detener y continuar, repite los dos ficheros `-f` con `stop` y `start`.
El archivo `docker-compose.podman.yml` es específico de Podman.
