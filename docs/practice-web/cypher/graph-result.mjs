/*
 * Nodos, relaciones y caminos que devuelven los dos motores Cypher del navegador:
 *
 * - Grafeo (la práctica de grafos): nodo {_id, _labels, ...propiedades},
 *   relación {_id, _source, _target, _type, ...}, camino {_type: "path", nodes, edges}.
 *   Los _id de nodos y relaciones se numeran por separado.
 * - Ladybug (el grafo del curso, teoria/dot-cloud-neo4j/): nodo {_id: {table, offset},
 *   _label, ...}, relación {_src, _dst, _label, ...}, camino {_nodes, _rels}.
 *
 * Cuando el grafo del curso pase también a Grafeo, sobra la rama de Ladybug.
 */
function isGrafeoNode(value) {
  return Array.isArray(value._labels);
}

function isGrafeoRelationship(value) {
  return "_source" in value && "_target" in value;
}

export function isNode(value) {
  if (!value || typeof value !== "object") return false;
  return isGrafeoNode(value) || Boolean(value._id && value._label && !value._src);
}

export function isRelationship(value) {
  if (!value || typeof value !== "object") return false;
  return isGrafeoRelationship(value) || Boolean(value._src && value._dst);
}

export function isPath(value) {
  if (!value || typeof value !== "object") return false;
  return (value._type === "path" && Array.isArray(value.nodes) && Array.isArray(value.edges))
    || (Array.isArray(value._nodes) && Array.isArray(value._rels));
}

export function nodeLabels(node) {
  return isGrafeoNode(node) ? node._labels : [node._label];
}

export function relationshipType(relationship) {
  return isGrafeoRelationship(relationship) ? relationship._type : relationship._label;
}

export function pathNodes(path) {
  return path.nodes || path._nodes;
}

export function pathRelationships(path) {
  return path.edges || path._rels;
}

// Identificador interno de Ladybug (tabla y desplazamiento).
export function internalId(reference) {
  return reference.table + ":" + reference.offset;
}

// Clave única de un nodo o una relación en el resultado, sea del motor que sea.
export function nodeKey(node) {
  return isGrafeoNode(node) ? "n" + node._id : internalId(node._id);
}

export function relationshipKey(relationship) {
  return isGrafeoRelationship(relationship) ? "e" + relationship._id : internalId(relationship._id);
}

export function endpointKeys(relationship) {
  return isGrafeoRelationship(relationship)
    ? ["n" + relationship._source, "n" + relationship._target]
    : [internalId(relationship._src), internalId(relationship._dst)];
}

export function collectGraphElements(rows) {
  const nodes = new Map();
  const edges = new Map();
  const visit = function (value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isPath(value)) {
      pathNodes(value).forEach(visit);
      pathRelationships(value).forEach(visit);
      return;
    }
    if (isNode(value)) {
      const id = nodeKey(value);
      if (!nodes.has(id)) nodes.set(id, value);
      return;
    }
    if (isRelationship(value)) {
      const id = relationshipKey(value);
      if (!edges.has(id)) edges.set(id, value);
      return;
    }
    if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  rows.forEach(function (row) { Object.keys(row).forEach(function (key) { visit(row[key]); }); });
  return { nodes: nodes, edges: edges };
}

// La práctica y el grafo del curso dibujan con esta función sus resultados.
// Un nodo con varias etiquetas toma el color de la primera que lo tenga.
export function drawResultGraph(Network, container, elements, { caption, colors, limit, onNodeClick, palette = {} }) {
  const labels = new Set();
  const nodes = [];
  Array.from(elements.nodes.entries()).slice(0, limit).forEach(function (entry) {
    const node = entry[1];
    const nodeLabelList = nodeLabels(node);
    const label = nodeLabelList.find(function (candidate) { return colors[candidate]; }) || nodeLabelList[0];
    labels.add(label);
    const title = document.createElement("span");
    title.textContent = nodeLabelList.join(":");
    nodes.push({
      id: entry[0],
      label: caption(node),
      title: title,
      color: { background: colors[label] || "#666", border: palette.border || "#2b2620" },
      font: { color: palette.text || "#fffdf8", size: 14 }
    });
  });
  const known = new Set(nodes.map(function (node) { return node.id; }));
  const edges = [];
  elements.edges.forEach(function (edge) {
    const [from, to] = endpointKeys(edge);
    if (!known.has(from) || !known.has(to)) return;
    edges.push({ from: from, to: to, label: relationshipType(edge), arrows: "to",
      color: { color: palette.edge || "#9a8f79" },
      font: { size: 11, color: palette.edgeText || "#6d675d",
        strokeWidth: 3, strokeColor: palette.edgeOutline || "#fffdf8" } });
  });
  const view = document.createElement("div");
  view.className = "graph-view";
  container.append(view);
  const network = new Network(view, { nodes: nodes, edges: edges }, {
    nodes: { shape: "dot", size: 14 },
    edges: { smooth: { type: "dynamic" } },
    physics: { stabilization: { iterations: 120 }, barnesHut: { springLength: 130 } },
    interaction: { hover: true, tooltipDelay: 200 }
  });
  if (onNodeClick) {
    network.on("click", function (event) {
      if (event.nodes.length === 1) onNodeClick(elements.nodes.get(event.nodes[0]));
    });
  }
  if (labels.size) {
    const legend = document.createElement("p");
    legend.className = "graph-legend";
    Array.from(labels).sort().forEach(function (label) {
      const item = document.createElement("span");
      item.style.setProperty("--swatch", colors[label] || "#666");
      item.textContent = label;
      legend.append(item);
    });
    container.append(legend);
  }
  return { network: network, nodes: nodes.length, edges: edges.length, hidden: elements.nodes.size - nodes.length };
}
