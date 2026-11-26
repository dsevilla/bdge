# Práctica de Neo4j: ejecución local

Este directorio contiene el cuaderno de Neo4j y `docker-compose.yml`. Compose
arranca Neo4j y Jupyter; el cuaderno usa el servicio interno `neo4j`.

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

## Arrancar Neo4j y Jupyter

Desde este directorio ejecuta:

```console
docker compose up -d
docker compose ps
```

La tabla será parecida a esta. Neo4j puede aparecer como `health: starting`
mientras termina de iniciar; espera a que indique `healthy`:

```text
NAME              SERVICE    STATUS          PORTS
neo4j-neo4j-1     neo4j      Up (healthy)    127.0.0.1:7474->7474/tcp, 127.0.0.1:7687->7687/tcp
neo4j-notebook-1  notebook   Up              0.0.0.0:8888->8888/tcp
```

Abre <http://localhost:8888> para Jupyter (token `bdge` si se solicita) o
<http://localhost:7474> para el navegador de Neo4j. El Compose de esta práctica
desactiva la autenticación para el uso local. Los puertos `7474` (web) y `7687`
(Bolt) sólo quedan publicados en el propio equipo (`127.0.0.1`), no en la red.

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

Para ver los mensajes del arranque, ejecuta `docker compose up` sin `-d`.
También puedes seguir los registros de cada servicio:

```console
docker compose logs -f
docker compose logs -f neo4j
```

`docker compose ps` muestra el estado y los puertos. La interfaz web de Neo4j
permite comprobar el servidor; Jupyter permite ejecutar el cuaderno.
La documentación oficial de VS Code explica cómo conectarse a un [servidor
Jupyter existente](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management).

## Parar y continuar conservando el estado

Para detener temporalmente y volver a arrancar los mismos contenedores:

```console
docker compose stop
docker compose start
```

También puedes usar `docker compose restart`. Este Compose no declara volúmenes
con nombre; usa `stop`/`start` para conservar la base de esta ejecución.
`docker compose down` elimina los contenedores y puede borrar los datos que
están dentro de ellos. `docker compose down -v` elimina además los volúmenes
asociados.
