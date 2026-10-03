# Práctica inicial: ejecución local

Este directorio contiene el cuaderno inicial y `docker-compose.yml`, que
arranca Jupyter con el repositorio montado dentro del contenedor.

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

## Arrancar Jupyter

Abre una terminal en este directorio y ejecuta:

```console
docker compose up -d
docker compose ps
```

La salida de `ps` será parecida a esta; el nombre y los tiempos cambian según
el equipo:

```text
NAME               SERVICE    STATUS   PORTS
intro-notebook-1   notebook   Up       0.0.0.0:8888->8888/tcp
```

Abre <http://localhost:8888> e introduce el token `bdge` si Jupyter lo pide.
El directorio del repositorio está montado en el contenedor, así que los
cuadernos que guardes quedan en tus ficheros locales.

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

Para ver el arranque en primer plano, ejecuta `docker compose up` sin `-d`;
aparecerán los mensajes de Jupyter. Pulsa `Ctrl+C` para detener esa ejecución.
Si arrancaste con `-d`, inspecciona los mensajes con:

```console
docker compose logs -f notebook
```

La documentación oficial de VS Code describe la conexión a un [servidor
Jupyter existente](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management).

En este Compose sólo hay un contenedor Jupyter, no una base de datos.

## Parar y continuar

Para detener temporalmente los contenedores y volver a arrancar los mismos:

```console
docker compose stop
docker compose start
```

`stop` conserva el contenedor y `start` lo vuelve a iniciar. Los cuadernos se
guardan en el repositorio del equipo, que está montado en el contenedor, así que
siguen ahí aunque elimines Jupyter con `docker compose down`. Ese comando elimina
el contenedor y la red; `docker compose down -v` elimina además los volúmenes
asociados.

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

En Windows, instala WSL 2 siguiendo los pasos anteriores; Podman usa WSL 2 para
su máquina Linux. Desde este directorio combina el Compose base con el ajuste
para los permisos del volumen montado:

```console
podman compose -f docker-compose.yml -f docker-compose.podman.yml up -d
podman compose -f docker-compose.yml -f docker-compose.podman.yml ps
podman compose -f docker-compose.yml -f docker-compose.podman.yml logs -f notebook
```

Para pausar y continuar con Podman, usa los mismos dos ficheros `-f` con
`stop` y después con `start`. El ajuste `docker-compose.podman.yml` sólo se usa
con Podman.
