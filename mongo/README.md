# Prácticas de MongoDB: ejecución local

Este directorio contiene los cuadernos de MongoDB y `docker-compose.yml`.
Compose arranca Jupyter y MongoDB; ambos servicios se esperan en la misma red
de Compose.

## Recorrido de los cuadernos

Ejecuta `sesion3.ipynb` para practicar documentos, CRUD, cursores, filtros,
índices, planes con `explain()` y agregación básica. `sesion4.ipynb` continúa con arrays y
subdocumentos, modelado y planes,
y termina con los siete ejercicios evaluables y su entrega.

Cada cuaderno funciona desde un kernel nuevo: la sesión 4 no depende de haber
ejecutado la sesión 3. Ejecuta las celdas en orden. La carga reconstruye las
cinco colecciones de origen y borra sus índices anteriores; las colecciones de
demostración y de ejercicios se reinician en su propio bloque. Evita ejecutar
las dos cargas a la vez sobre el mismo servidor. Si interrumpes la carga,
espera sus tareas en «La base de datos está construida» antes de volver a
empezar. En la sesión 3 se puede trabajar con los usuarios mientras las otras
colecciones terminan; en la sesión 4 se comprueba toda la carga antes de las
consultas.

MongoDB arranca como un servidor único, sin *replica set*. Por eso las prácticas
no ejecutan transacciones multidocumento ni *change streams*, que exigen uno:
se estudian en la teoría de la sesión 4.

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

## Arrancar Jupyter y MongoDB

Desde este directorio ejecuta:

```console
docker compose up -d
docker compose ps
```

Cuando ambos servicios estén listos, `ps` mostrará algo parecido a esto:

```text
NAME              SERVICE    STATUS          PORTS
mongo-mongo-1     mongo      Up (healthy)    0.0.0.0:27017->27017/tcp
mongo-notebook-1  notebook   Up              0.0.0.0:8888->8888/tcp
```

Abre <http://localhost:8888> e introduce el token `bdge` si Jupyter lo pide.
MongoDB publica el puerto `27017` en el equipo; el cuaderno se conecta al
servicio interno llamado `mongo`.

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

Para ver los mensajes durante el arranque, ejecuta `docker compose up` sin
`-d`. En segundo plano, consulta los registros con:

```console
docker compose logs -f
docker compose logs -f mongo
```

La comprobación de salud de MongoDB puede tardar unos segundos.
`docker compose ps` muestra `Up (healthy)` cuando la base responde a su
comprobación. La documentación oficial de VS Code explica cómo conectarse a un
[servidor Jupyter existente](https://code.visualstudio.com/docs/datascience/jupyter-kernel-management).

## Parar y continuar conservando la base

Detén y vuelve a iniciar los mismos contenedores para conservar los datos de
esta ejecución:

```console
docker compose stop
docker compose start
```

También puedes usar `docker compose restart`. El Compose no declara un volumen
con nombre para MongoDB; `stop`/`start` conserva el contenedor y su estado.
`docker compose down` elimina los contenedores y `docker compose down -v`
elimina además los volúmenes; no uses esos comandos si quieres retomar los datos
al siguiente inicio.
