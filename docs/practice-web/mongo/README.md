# Prácticas MongoDB en el navegador

Esta aplicación se publica en `practice-web/mongo/` de GitHub Pages. El job
`publish-github-pages` copia este directorio a `docs/practice-web/mongo/`; la
portada genera su enlace a partir de `practice.json`. La página separa el motor
de práctica del contenido, igual que la práctica de SQL:

- `index.html` contiene el marco y los controles comunes de los datos.
- `app.js` implementa la descarga, la carga en mingo, la evaluación del código,
  la comprobación contra la solución y la navegación.
- CodeMirror 5 añade resaltado JavaScript; si falla su CDN, los cuadros de texto
  siguen funcionando sin resaltado.
- `pages/index.js` registra las páginas disponibles.
- `pages/` contiene un módulo por página de ejercicios: `consultas.js`,
  `agregacion.js` y `relaciones.js`.

Los datos se cargan una sola vez y se comparten entre todas las páginas. No
copies el cargador al añadir contenido.

## Los datos

La página descarga todas las filas de las cinco tablas del *dump* de Stack
Overflow en español, publicadas en
[`dsevilla/bd2-data`](https://github.com/dsevilla/bd2-data/tree/main/es.stackoverflow/jsonl):
cinco ficheros JSON Lines comprimidos, 106,73 MB en total, con 2.417.431
documentos en `db.posts`, `db.users`, `db.comments`, `db.votes` y `db.tags`.
Esta es la opción predeterminada; el botón «Usar muestra reducida» carga los
ficheros `*-sample.jsonl.gz`, unos 12,5 MB y 246.898 documentos. Esa alternativa
conserva una pregunta de cada ocho con sus respuestas, comentarios y votos.
Al cambiar de opción se reemplazan las colecciones y se borran los resultados
anteriores. Para reducir el pico de memoria, la aplicación libera el conjunto
actual antes de descargar la otra variante; si esa descarga falla, se puede
reintentar desde el botón de carga.

Las descargas están separadas en dos releases: [JSONL completo de 2026-27](https://github.com/dsevilla/bd2-data/releases/tag/jsonl-full-26-27)
y [JSONL reducido de 2026-27](https://github.com/dsevilla/bd2-data/releases/tag/jsonl-sample-26-27).

Se lee de jsDelivr, con `raw.githubusercontent.com` como alternativa. **No se
puede leer de los *assets* de una *release* de GitHub**: no envían cabeceras
CORS y el navegador rechaza la petición. Por eso los ficheros están versionados
en el repositorio de datos, además de publicarse como *release* para descarga.

La opción completa no muestrea filas. En ambas variantes `Posts.Body`,
`Comments.Text` y `Users.AboutMe` se limitan a un máximo de 100 bytes UTF-8; por
tanto, las consultas que dependan del contenido de esos campos pueden diferir
del *dump* original. La carga completa puede necesitar varios GB de memoria del
navegador. Si falla una descarga sin cambiar de variante, la página conserva la
base activa y ofrece reintentar, abrir ficheros locales o usar una muestra
mínima incrustada en `app.js`, suficiente para probar la sintaxis.

## Qué se puede ejecutar

El editor admite una expresión al estilo de `mongosh` sobre el objeto `db`:

```js
db.posts.find({ PostTypeId: 1 }, { Id: 1, Title: 1 }).sort({ Score: -1 }).limit(10)
db.posts.aggregate([{ $group: { _id: "$PostTypeId", n: { $sum: 1 } } }])
db.users.countDocuments({ Reputation: { $gte: 1000 } })
db.posts.distinct("PostTypeId")
```

Cada colección ofrece `find`, `findOne`, `aggregate`, `countDocuments` y
`distinct`; `ISODate("2020-01-01")` construye fechas. El código se evalúa en el
navegador del alumno y nada se envía a ningún servidor. También se admite un
bloque con varias sentencias que termine en `return`.

El motor es [mingo](https://github.com/kofrasa/mingo), que implementa el
lenguaje de consulta de MongoDB sobre objetos en memoria. **No es un `mongod`**:
no hay índices, ni `explain()`, ni transacciones, ni búsqueda vectorial, así que
los ejercicios de índices y planes de los boletines siguen necesitando el
servidor de la sesión. Dos avisos al escribir ejercicios nuevos:

- `$lookup` con `localField`/`foreignField` construye una tabla *hash* de la
  colección unida; `$lookup` con `let` + `pipeline` ejecuta el subpipeline una
  vez por documento de entrada y bloquea la pestaña. Usa la primera forma, o
  reduce antes con `$match`, `$sort` y `$limit`.
- Conviene ordenar y recortar antes de unir, no después: además de ir más
  rápido, es el hábito correcto contra un servidor real.

## Añadir ejercicios a una página

Edita el módulo correspondiente, por ejemplo `pages/consultas.js`, y añade un
objeto a `exercises`:

```js
{
  id: "nuevo-ejercicio",
  title: "Título visible",
  prompt: "Enunciado del ejercicio.",
  solution: `db.posts.aggregate([...])`
}
```

El editor empieza vacío, salvo que el ejercicio traiga `starter`. `solution` es
opcional: si se incluye, aparecen los botones «Comprobar» —que ejecuta la
solución y la compara con el resultado del alumno— y «Mostrar solución», que la
añade comentada al editor.

La comparación distingue tres casos: coincide, «mismos documentos, distinto
orden» y no coincide. Para que sea útil, **el pipeline de la solución debe ser
determinista**: termina siempre con un `$sort` que incluya un campo que
desempate (normalmente `Id`) antes del `$limit`.

## Añadir una página

1. Crea `pages/mi-tema.js` y exporta una página con `id`, `title`,
   `description` y `exercises`:

   ```js
   export const page = {
     id: "mi-tema",
     title: "4 · Otro tema",
     description: "Breve descripción de esta página.",
     exercises: []
   };
   ```

2. Impórtala y añádela a `PRACTICE_PAGES` en `pages/index.js`.

Los identificadores de página deben ser únicos. Los de ejercicio deben ser
únicos dentro de su página y usar letras, números o guiones. La navegación crea
una pestaña por página y guarda los borradores al cambiar entre ellas. También
se puede enlazar directamente a una página con `#agregacion`.

Sirve el directorio por HTTP, por ejemplo desde la raíz del repositorio con
`python3 -m http.server 8765 --bind 127.0.0.1`, y abre
`/addendum/practice-web/mongo/`. No abras `index.html` con `file://`, porque los
módulos ES necesitan una página servida por HTTP o HTTPS.
