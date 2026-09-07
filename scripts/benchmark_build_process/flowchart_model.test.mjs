import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFlowchartModel } from './flowchart_model.mjs';

const fixture = () => ({
  meta: { title: 'Reviewed pipeline', source: 'paper §3', profile: 'academic-paper' },
  nodes: [{ id: 'gate', label: 'Valid?', type: 'decision', module: 'construction', position: { x: 1, y: 2 } }, { id: 'reject', label: 'Remove candidate', type: 'terminal' }],
  edges: [{ from: 'gate', to: 'reject', type: 'optional', label: 'No | retry', bidirectional: true }],
  modules: [{ id: 'construction', label: 'Construction', nodes: ['gate'] }],
});

test('projects source evidence, typed branches and explicit stage membership without exporter instructions', () => {
  const source = fixture();
  const before = structuredClone(source);
  const graph = buildFlowchartModel(source);
  assert.equal(graph.source, 'paper §3');
  assert.equal(graph.type, 'academic-diagram');
  assert.deepEqual(graph.counts, { nodes: 2, edges: 1, modules: 1 });
  assert.deepEqual(graph.nodes[0], { id: 'gate', label: 'Valid?', type: 'decision', module: 'construction' });
  assert.deepEqual(graph.edges[0], { id: 'edge-1', from: 'gate', to: 'reject', type: 'optional', label: 'No | retry', bidirectional: true });
  assert.deepEqual(graph.modules[0], source.modules[0]);
  assert.equal(graph.nodes[1].type, 'terminal');
  assert.deepEqual(source, before, 'generation must not edit the source');
});

test('uses compatible v1 defaults and does not infer stages from labels', () => {
  const graph = buildFlowchartModel({ nodes: [{ id: 'repair', label: 'Evaluate repair' }] }, { title: 'Example.en' });
  assert.equal(graph.title, 'Example.en');
  assert.equal(graph.version, 1);
  assert.equal(graph.source, 'generated');
  assert.equal(graph.theme, 'tech-blue');
  assert.equal(graph.layout, 'horizontal');
  assert.deepEqual(graph.modules, []);
  assert.deepEqual(graph.nodes, [{ id: 'repair', label: 'Evaluate repair', type: 'service' }]);
});

test('rejects duplicate identities and dangling edges before publishing', () => {
  for (const mutate of [
    s => s.nodes.push({ ...s.nodes[0] }),
    s => s.modules.push({ ...s.modules[0] }),
    s => s.edges.push({ ...s.edges[0], id: 'edge-1' }),
    s => s.edges[0].to = 'missing',
    s => s.modules[0].nodes = ['missing'],
  ]) {
    const source = fixture(); mutate(source);
    assert.throws(() => buildFlowchartModel(source), /Duplicate|unknown endpoint|existing nodes/);
  }
});

test('rejects malformed and empty graphs instead of producing an empty successful diagram', () => {
  for (const source of [null, [], { nodes: [] }, { nodes: {} }, { nodes: [null] }, { nodes: [{ id: 'n', label: '' }] }, { ...fixture(), edges: {} }]) {
    assert.throws(() => buildFlowchartModel(source));
  }
});

test('retains documented visual metadata without requiring a graphics application', () => {
  const source = fixture();
  source.meta.replication = { colorMode: 'light', background: '#fff', palette: [{ hex: '#000', role: 'text', unrelated: 'ignored' }, {}], confidenceNotes: ['', 'Reviewed'] };
  assert.deepEqual(buildFlowchartModel(source).replication, { colorMode: 'light', background: '#fff', palette: [{ hex: '#000', role: 'text' }], confidenceNotes: ['Reviewed'] });
});
