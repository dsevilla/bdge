export function isNode(value) {
  return Boolean(value) && typeof value === "object" && value._id && value._label && !value._src;
}

export function isRelationship(value) {
  return Boolean(value) && typeof value === "object" && value._src && value._dst;
}

export function isPath(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value._nodes) && Array.isArray(value._rels);
}

export function internalId(reference) {
  return reference.table + ":" + reference.offset;
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
      value._nodes.forEach(visit);
      value._rels.forEach(visit);
      return;
    }
    if (isNode(value)) {
      const id = internalId(value._id);
      if (!nodes.has(id)) nodes.set(id, value);
      return;
    }
    if (isRelationship(value)) {
      const id = internalId(value._id);
      if (!edges.has(id)) edges.set(id, value);
      return;
    }
    if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  rows.forEach(function (row) { Object.keys(row).forEach(function (key) { visit(row[key]); }); });
  return { nodes: nodes, edges: edges };
}

// Tanto la práctica como el grafo del curso dibujan los valores que devuelve Ladybug.
export function drawResultGraph(Network, container, elements, { caption, colors, limit, onNodeClick, palette = {} }) {
  const labels = new Set();
  const nodes = [];
  Array.from(elements.nodes.entries()).slice(0, limit).forEach(function (entry) {
    const node = entry[1];
    labels.add(node._label);
    const title = document.createElement("span");
    title.textContent = node._label;
    nodes.push({
      id: entry[0],
      label: caption(node),
      title: title,
      color: { background: colors[node._label] || "#666", border: palette.border || "#2b2620" },
      font: { color: palette.text || "#fffdf8", size: 14 }
    });
  });
  const known = new Set(nodes.map(function (node) { return node.id; }));
  const edges = [];
  elements.edges.forEach(function (edge) {
    const from = internalId(edge._src);
    const to = internalId(edge._dst);
    if (!known.has(from) || !known.has(to)) return;
    edges.push({ from: from, to: to, label: edge._label, arrows: "to",
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
