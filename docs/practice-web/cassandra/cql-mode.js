/* Amplía el dialecto Cassandra del modo SQL de CodeMirror 5. */
(function () {
  "use strict";

  if (typeof window.CodeMirror !== "function") return;
  var mode = window.CodeMirror.resolveMode("text/x-cassandra");
  if (!mode || !mode.keywords) return;

  // CodeMirror ya aporta el léxico Cassandra. Añadimos términos que el modo
  // integrado no incluye, pero que aparecen en otras construcciones de CQL.
  var keywords = Object.assign({}, mode.keywords);
  ["aggregate", "called", "function", "input", "json", "language", "login", "materialized", "per", "returns", "role", "roles", "view"]
    .forEach(function (word) { keywords[word] = true; });

  window.CodeMirror.defineMIME("text/x-bdge-cassandra", Object.assign({}, mode, {
    keywords: keywords
  }));
})();
