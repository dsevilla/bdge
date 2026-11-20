/*
 * Nodos, relaciones y caminos que devuelve Grafeo, el motor Cypher que usan en
 * el navegador la práctica de grafos y el grafo del curso
 * (teoria/dot-cloud-neo4j/):
 *
 * - nodo {_id, _labels, ...propiedades};
 * - relación {_id, _source, _target, _type, ...propiedades};
 * - camino {_type: "path", nodes, edges}.
 *
 * Los _id de nodos y relaciones se numeran por separado; por eso las claves
 * llevan delante «n» o «e».
 */
export function isNode(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value._labels);
}

export function isRelationship(value) {
  return Boolean(value) && typeof value === "object" && "_source" in value && "_target" in value;
}

export function isPath(value) {
  return Boolean(value) && typeof value === "object"
    && value._type === "path" && Array.isArray(value.nodes) && Array.isArray(value.edges);
}

export function nodeLabels(node) {
  return node._labels;
}

export function relationshipType(relationship) {
  return relationship._type;
}

export function pathNodes(path) {
  return path.nodes;
}

export function pathRelationships(path) {
  return path.edges;
}

// Clave única de un nodo o una relación en el resultado.
export function nodeKey(node) {
  return "n" + node._id;
}

export function relationshipKey(relationship) {
  return "e" + relationship._id;
}

export function endpointKeys(relationship) {
  return ["n" + relationship._source, "n" + relationship._target];
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
