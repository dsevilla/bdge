# bdge
Recursos para la asignatura BDGE del Máster de Big Data de la UM/USC,
curso 2026-2027.

## Cómo trabajar con los boletines

Cada boletín se puede abrir de dos formas:

- **En Google Colab**, sin instalar nada: el enlace está en la sección
  «Boletines prácticos» de la portada de las transparencias, o directamente en
  `https://colab.research.google.com/github/dsevilla/bdge/blob/26-27/<ruta>`
  (p. ej. `sql/sesion1.ipynb`).
- **En local**, con el `docker-compose.yml` del directorio del boletín, que
  arranca Jupyter y las bases de datos que necesita. Hace falta
  [Docker](https://docs.docker.com/get-docker/) o
  [Podman](https://podman.io/docs/installation) con `compose`:

  ```bash
  cd sql
  docker compose up
  ```

  Jupyter queda en <http://localhost:8888> (token `bdge`).

## Visual Studio Code

Al abrir este directorio en VS Code, el editor propone instalar las
extensiones recomendadas (Python, Jupyter y Container Tools). Si se descarta el
aviso, están en *Extensions: Show Recommended Extensions*.

VS Code no instala Docker ni Podman: hay que instalarlos aparte. Para usar los
cuadernos desde VS Code con el Jupyter del contenedor, elegir *Select Kernel* →
*Existing Jupyter Server* e indicar `http://localhost:8888/?token=bdge`.
