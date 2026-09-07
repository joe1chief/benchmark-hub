// Project-owned, renderer-independent v1 graph projection. Layout coordinates and
// exporter style instructions stay in the source specification, outside this API.
const present = value => value !== undefined && value !== null && value !== '';
const fields = (value, names) => Object.fromEntries(names.filter(key => present(value[key])).map(key => [key, value[key]]));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireText(value, description) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${description} must be a non-empty string`);
}

function records(value, description) {
  if (!Array.isArray(value) || value.some(item => !object(item))) throw new Error(`${description} must be an array of objects`);
  return value;
}

function ids(items, description) {
  const result = new Set();
  for (const item of items) {
    requireText(item.id, `${description} id`);
    if (result.has(item.id)) throw new Error(`Duplicate ${description} id: ${item.id}`);
    result.add(item.id);
  }
  return result;
}

export function buildFlowchartModel(spec, { title = 'diagram' } = {}) {
  if (!object(spec)) throw new Error('Flowchart specification must be an object');
  const meta = spec.meta ?? {};
  if (!object(meta)) throw new Error('Flowchart meta must be an object');
  const nodes = records(spec.nodes, 'nodes');
  const edges = records(spec.edges ?? [], 'edges');
  const modules = records(spec.modules ?? [], 'modules');
  if (!nodes.length) throw new Error('Flowchart must contain nodes');
  const nodeIds = ids(nodes, 'node');
  ids(modules, 'module');
  for (const node of nodes) requireText(node.label, `Node ${node.id} label`);
  const projectedEdges = edges.map((edge, index) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`Edge ${edge.id ?? index + 1} has an unknown endpoint`);
    return fields({ ...edge, id: edge.id || `edge-${index + 1}`, type: edge.type || 'primary', bidirectional: edge.bidirectional ? true : undefined }, ['id', 'from', 'to', 'type', 'label', 'bidirectional']);
  });
  ids(projectedEdges, 'edge');
  for (const module of modules) {
    for (const key of ['nodes', 'nodeIds']) {
      if (module[key] !== undefined && (!Array.isArray(module[key]) || module[key].some(id => !nodeIds.has(id)))) {
        throw new Error(`Module ${module.id} ${key} must refer to existing nodes`);
      }
    }
  }
  const type = meta.profile === 'academic-paper' ? 'academic-diagram'
    : meta.profile === 'engineering-review' ? 'engineering-diagram'
      : modules.length ? 'module-diagram' : edges.length ? 'flow-diagram' : 'diagram';
  const model = {
    version: 1,
    title: meta.title || title,
    type,
    source: meta.source || 'generated',
    profile: meta.profile || 'default',
    theme: meta.theme || 'tech-blue',
    layout: meta.layout || 'horizontal',
    counts: { nodes: nodes.length, edges: edges.length, modules: modules.length },
    nodes: nodes.map(node => fields({ ...node, type: node.type || 'service' }, ['id', 'label', 'type', 'module', 'icon', 'size'])),
    edges: projectedEdges,
    modules: modules.map(module => fields(module, ['id', 'label', 'color', 'nodes', 'nodeIds'])),
  };
  if (object(meta.replication)) {
    const source = meta.replication;
    const palette = Array.isArray(source.palette) ? source.palette.map(entry => fields(entry ?? {}, ['hex', 'role', 'appliesTo', 'confidence', 'notes'])).filter(entry => Object.keys(entry).length) : [];
    const confidenceNotes = Array.isArray(source.confidenceNotes) ? source.confidenceNotes.filter(note => typeof note === 'string' && note.trim()) : [];
    const replication = fields({ ...source, palette: palette.length ? palette : undefined, confidenceNotes: confidenceNotes.length ? confidenceNotes : undefined }, ['colorMode', 'background', 'palette', 'confidenceNotes']);
    if (Object.keys(replication).length) model.replication = replication;
  }
  return model;
}
