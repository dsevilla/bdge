# Prácticas MongoDB en el navegador

Esta aplicación se publica como `practica-mongo/` en GitHub Pages. El job
`publish-github-pages` copia este directorio a `docs/practica-mongo/`; la
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

La página descarga la muestra reducida del *dump* de Stack Overflow en español
publicada en
[`dsevilla/bd2-data`](https://github.com/dsevilla/bd2-data/tree/main/es.stackoverflow/jsonl):
cinco ficheros JSON Lines comprimidos, 12,5 MB en total, con 246.898
documentos en `db.posts`, `db.users`, `db.comments`, `db.votes` y `db.tags`.

Se lee de jsDelivr, con `raw.githubusercontent.com` como alternativa. **No se
puede leer de los *assets* de una *release* de GitHub**: no envían cabeceras
CORS y el navegador rechaza la petición. Por eso la muestra está versionada en
el repositorio de datos, no sólo publicada como *release*.

La muestra conserva hilos completos —una pregunta de cada ocho con todas sus
respuestas, comentarios, votos y usuarios—, así que los `$lookup` cuadran y no
hay referencias colgando. Los campos `Body`, `Text` y `AboutMe` vienen cortados
a 100 caracteres. Las cifras no son las del *dump* completo: los resultados de
clase serán distintos, y conviene decírselo a los alumnos.

Si la descarga falla, la página se queda con una muestra mínima incrustada en
`app.js`, suficiente para probar la sintaxis, y ofrece abrir los ficheros
descargados a mano.

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
`/addendum/practica-web/mongo/`. No abras `index.html` con `file://`, porque los
módulos ES necesitan una página servida por HTTP o HTTPS.
