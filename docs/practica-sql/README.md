# Prácticas SQL en el navegador

Esta aplicación se publica como `practica-sql/` en GitHub Pages. El job
`publish-github-pages` copia este directorio a `docs/practica-sql/`; la portada
genera su enlace a partir de `practice.json`. La página separa el motor de
práctica del contenido:

- `index.html` contiene el marco y los controles comunes de la base de datos.
- `app.js` implementa la descarga, SQLite, ejecución, paginación y navegación.
- CodeMirror 5 añade resaltado SQL en modo MySQL 8; si falla su CDN, los
  cuadros de texto siguen funcionando sin resaltado. El coloreado no valida la
  consulta: la ejecución sigue siendo SQLite.
- `pages/index.js` registra las páginas disponibles.
- `pages/` contiene un módulo por página de ejercicios. Ahora se incluyen las
  sesiones 1 y 2.
- `xz-worker.js` descomprime la base XZ fuera del hilo de la interfaz.

La base se carga una sola vez. Al cambiar de página se conserva para que los
ejercicios nuevos puedan consultar las mismas tablas. No copies el cargador ni
el worker al añadir contenido.

## Añadir ejercicios a una página

Edita el módulo correspondiente, por ejemplo `pages/sesion1.js`, y añade un
objeto a `exercises`:

```js
{
  id: "nuevo-ejercicio",
  title: "Título visible",
  prompt: "Enunciado del ejercicio.",
  solution: `SELECT ...;`
}
```

El editor empieza vacío. `solution` es opcional; si se incluye, aparecen dos
botones: «Comprobar», que ejecuta la solución y la compara con el resultado del
alumno, y «Mostrar solución», que la añade al editor como comentarios. Cada
consulta se ejecuta de una en una y los resultados aparecen paginados en
bloques de 100 filas.

La comprobación lee como mucho 1.000 filas de cada lado —la base completa puede
devolver millones— y lo advierte cuando llega a ese tope. Compara los valores
celda a celda, con su tipo, pero no los nombres de las columnas: un alumno
puede usar otros alias. Distingue tres casos: coincide, «mismas filas, distinto
orden» y no coincide. Para que sirva, **la solución debe ser determinista**:
termina siempre con un `ORDER BY` que incluya una columna que desempate,
normalmente `Id`, antes del `LIMIT`.

En los ejercicios cuya solución cambia el estado de la base —`CREATE`,
`INSERT`, `UPDATE` y los de transacciones— el botón aparece en gris con el
motivo: ejecutar la referencia junto a la consulta del alumno crearía la tabla
por segunda vez o repetiría la inserción. Se detecta por la primera palabra de
la solución, y el autor puede desactivarlo también a mano con `check: false`.

## Añadir una página

1. Crea `pages/mi-tema.js` y exporta una página con `id`, `title`,
   `description` y `exercises`:

   ```js
   export const page = {
     id: "mi-tema",
     title: "Consultas sobre otro tema",
     description: "Breve descripción de esta página.",
     exercises: []
   };
   ```

2. Impórtala y añádela a `PRACTICE_PAGES` en `pages/index.js`.

Los identificadores de página deben ser únicos. Los identificadores de
ejercicio deben ser únicos dentro de su página y usar letras, números o guiones.
La navegación crea una pestaña por página y guarda los borradores mientras se
cambia entre ellas. También se puede enlazar directamente a una página con
`#mi-tema`.

Sirve el directorio por HTTP, por ejemplo desde la raíz del repositorio con
`python3 -m http.server 8765 --bind 127.0.0.1`, y abre
`/addendum/practica-web/sql/`. No abras `index.html` con `file://`,
porque los módulos ES y el worker necesitan una página servida por HTTP o HTTPS.

## Alcance SQL

La página usa SQLite compilado a WebAssembly mediante sql.js, no un servidor
MySQL 8. Los ejercicios de la sesión 2 practican CTE, funciones ventana,
`UNION ALL`, JSON y lectura del plan con `EXPLAIN QUERY PLAN`; adaptan la
sintaxis a SQLite. Los ejemplos de MySQL sobre particionado, `FULLTEXT` con
`MATCH ... AGAINST`, índices funcionales de JSON y `EXPLAIN ANALYZE` no se
pueden reproducir aquí con el mismo comportamiento.
