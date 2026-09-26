# Práctica de grafos con Cypher en el navegador

Esta aplicación se publica como `practica-cypher/` en GitHub Pages. El job
`publish-github-pages` copia este directorio a `docs/practica-cypher/`; la
portada genera su enlace a partir de `practice.json`. La estructura es la misma
que en las prácticas de SQL y MongoDB:

- `index.html` contiene el marco, el panel de datos y la sección «Cómo se ha
  creado este grafo».
- `app.js` implementa la descarga, la construcción del grafo, la ejecución de
  Cypher, la comprobación contra la solución y el dibujo del resultado.
- CodeMirror 5 añade resaltado Cypher y vis-network dibuja los grafos; si falla
  su CDN, los cuadros de texto siguen funcionando y el resultado se ve en tabla.
- `pages/index.js` registra las páginas disponibles.
- `pages/` contiene un módulo por página: `patrones.js`, `recorridos.js` y
  `escritura.js`.

## El motor no es Neo4j

Es [Ladybug](https://ladybugdb.com/) compilado a WebAssembly, continuación del
proyecto Kuzu después de que Apple comprara Kùzu Inc. y el repositorio original
se archivara en octubre de 2025. Habla Cypher y cabe en 3,5 MB comprimidos, pero
se aparta de Neo4j en cosas que el alumno nota:

- **El esquema es obligatorio.** Ladybug es una base de grafos tipada y
  columnar: cada clase de nodo y de relación es una tabla con columnas de tipo
  fijo. Hay que declararla antes de cargar nada. La página lo explica arriba del
  todo y enseña las sentencias que acaba de ejecutar, porque es una diferencia
  de modelado, no un detalle de instalación.
- **Un nodo tiene una sola etiqueta.** `(:Post:Question)` no existe; la
  distinción pregunta/respuesta va en `PostTypeId`.
- **No hay APOC ni GDS**, y `EXPLAIN` da el plan de Ladybug. Los ejercicios de
  índices y `PROFILE` del boletín siguen necesitando el Neo4j de clase.

Se usa el *build* **síncrono** a propósito. El asíncrono arranca un Web Worker,
y un Worker no se puede crear desde un script de otro origen: servido desde un
CDN, el navegador lo rechaza. Cargar el *worker* como blob tampoco arrancó en
las pruebas. El síncrono bloquea el hilo principal mientras ejecuta, pero las
consultas tardan milisegundos; lo que sí se nota es la construcción inicial, y
por eso el panel va informando de cada paso.

## Los datos y el grafo

Se descarga la muestra JSONL publicada en
[`dsevilla/bd2-data`](https://github.com/dsevilla/bd2-data/tree/main/es.stackoverflow/jsonl)
—sólo `Users`, `Posts` y `Tags`, unos 7 MB— y el grafo se construye en el
navegador: el esquema, los CSV en el sistema de ficheros virtual y un `COPY` por
tabla. Sale un grafo de unos 81.000 nodos y 145.000 relaciones, con `WROTE`,
`ANSWERS` y `TAGGED_WITH`.

Construirlo en el navegador, en vez de publicar la base ya hecha, es
deliberado: así la página puede enseñar la transformación del documento al
grafo y las sentencias reales que la producen. `SCHEMA_STATEMENTS` y
`COPY_STATEMENTS` en `app.js` son a la vez lo que se ejecuta y lo que se
muestra, de modo que no pueden divergir.

Los *assets* de una *release* de GitHub no envían cabeceras CORS: la página lee
la copia versionada del repositorio de datos, por jsDelivr y, si falla, por
`raw.githubusercontent.com`.

## Dibujo del resultado

Cuando una consulta devuelve nodos, relaciones o caminos —es decir, cuando
devuelves las variables del patrón en vez de sus propiedades— el resultado se
dibuja con vis-network, con un color por etiqueta y su leyenda, y debajo la
tabla. Se dibujan como mucho 300 nodos; si hay más, lo avisa y sugiere un
`LIMIT`. Un resultado de columnas normales se muestra sólo como tabla.

## Añadir ejercicios a una página

Edita el módulo correspondiente y añade un objeto a `exercises`:

```js
{
  id: "nuevo-ejercicio",
  title: "Título visible",
  prompt: "Enunciado del ejercicio.",
  starter: "MATCH (n) RETURN n LIMIT 1",   // opcional: texto inicial del editor
  solution: `MATCH (u:User)
RETURN count(*) AS usuarios`
}
```

`solution` es opcional; si se incluye aparecen «Comprobar» —ejecuta la solución
y la compara con el resultado del alumno— y «Mostrar solución». La comparación
distingue coincide, «mismas filas, distinto orden» y no coincide; compara los
valores, no los nombres de las columnas. Para que sirva, **la solución debe ser
determinista**: termina con un `ORDER BY` que incluya algo que desempate antes
del `LIMIT`.

En los ejercicios cuya solución escribe en el grafo —`CREATE`, `MERGE`, `SET`,
`DELETE`…— el botón aparece en gris con el motivo, porque ejecutar la
referencia volvería a escribir. Se detecta buscando esas cláusulas en la
solución, y se puede forzar con `check: false`. Esos ejercicios sí cambian el
grafo para el resto de la sesión: el botón «Reconstruir el grafo» del panel lo
deja como estaba.

## Añadir una página

1. Crea `pages/mi-tema.js` y exporta una página con `id`, `title`,
   `description` y `exercises`.
2. Impórtala y añádela a `PRACTICE_PAGES` en `pages/index.js`.

Los identificadores de página deben ser únicos, y los de ejercicio únicos
dentro de su página. La navegación crea una pestaña por página, guarda los
borradores al cambiar entre ellas y admite enlazar directamente con
`#recorridos`.

Sirve el directorio por HTTP, por ejemplo desde la raíz del repositorio con
`python3 -m http.server 8765 --bind 127.0.0.1`, y abre
`/addendum/practica-web/cypher/`. No abras `index.html` con `file://`: los
módulos ES necesitan una página servida por HTTP o HTTPS.
