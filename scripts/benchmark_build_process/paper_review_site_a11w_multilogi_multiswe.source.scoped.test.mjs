import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['Multi-LogiEval', 'Multi-SWE-bench'];
const expectedCounts = new Map([
  ['Multi-LogiEval', { nodes: 15, edges: 15 }],
  ['Multi-SWE-bench', { nodes: 17, edges: 16 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'org',
  'build_method',
  'metric',
  'openness',
  'task_type',
  'eval_feature',
  'scale',
  'homepage',
  'intro_en',
  'build_method_en',
  'metric_en',
  'openness_en',
  'task_type_en',
  'eval_feature_en',
  'scale_en',
  'has_leaderboard',
  'drawio_review_note',
  'mermaid_flowchart',
  'flowchart_en',
  'flowchart_zh',
];

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function mermaidEdgeLabel(label) {
  return mermaidLabel(label).replace(/\|/gu, '&#124;');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
    const label = String(edge.label ?? '').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${mermaidEdgeLabel(label)}|` : '-->')
      : (label ? `-. ${mermaidEdgeLabel(label)} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function assertEdge(graph, from, to, type, label = '') {
  const edge = graph.edges.find(candidate => (
    candidate.from === from
      && candidate.to === to
      && candidate.type === type
      && String(candidate.label ?? '') === label
  ));
  assert.ok(edge, `missing edge ${from}->${to} (${type}, ${label})`);
  if (type === 'secondary') assert.equal(edge.style?.dashed, true, `${from}->${to} dashed`);
}

test('keeps the A11w pair bilingual, catalog-synchronized, and fallback-synchronized', () => {
  const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));

  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.find(candidate => candidate.id === id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    assert.ok(summary, `${id} catalog entry`);
    for (const key of syncedKeys) {
      assert.deepEqual(summary[key], detail[key], `${id}.${key} catalog sync`);
    }
    assert.equal(en.meta.profile, 'academic-paper', `${id} profile`);
    assert.equal(en.meta.source, 'generated', `${id} source enum`);
    assert.equal(en.meta.theme, 'academic-color', `${id} theme`);
    assert.equal(en.meta.layout, 'horizontal', `${id} layout`);
    assert.equal(en.meta.routing, 'orthogonal', `${id} routing`);
    assert.equal(en.nodes.length, expected.nodes, `${id} English node count`);
    assert.equal(en.edges.length, expected.edges, `${id} English edge count`);
    assert.equal(zh.nodes.length, expected.nodes, `${id} Chinese node count`);
    assert.equal(zh.edges.length, expected.edges, `${id} Chinese edge count`);
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.doesNotMatch(
      en.nodes.map(node => node.label).join('\n'),
      /[\u3400-\u9fff]/u,
      `${id} English purity`,
    );
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    for (const edge of en.edges.filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
  }
});

test('locks Multi-LogiEval paper construction, appendix scope, and published-source drift', () => {
  const detail = readDetail('Multi-LogiEval');
  const en = readSpec('Multi-LogiEval', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2406.17169v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2406.17169v3');
  assert.equal(detail.openness, 'partly public');
  assert.match(detail.openness_en, /Partly Public.*MIT.*data.*no.*generation.*evaluation code/isu);
  assert.match(nodeLabel(en, 'inventory'), /33 Zero- or One-variable.*PL.*FOL.*Eight NM/isu);
  assert.match(nodeLabel(en, 'monotonic_combos'), /71 Rule Combinations.*Depths 2 through 5/isu);
  assert.match(nodeLabel(en, 'monotonic_generation'), /Claude-2.*Five In-context Exemplars.*Not Five Outputs/isu);
  assert.match(nodeLabel(en, 'nonmonotonic_combos'), /12.*2.*2.*1.*Depths 2.*3.*4.*5/isu);
  assert.match(nodeLabel(en, 'candidates'), /Context.*Question.*Replace Symbolic Labels.*Derive.*Yes or No/isu);
  assert.match(nodeLabel(en, 'validate'), /Every Context.*Logical Relations.*Grammar.*10 per Depth-1 Rule.*15 or 20 per Combination/isu);
  assert.match(nodeLabel(en, 'release'), /1,552.*PL 525.*FOL 535.*NM 492.*1,126 Yes.*426 No/isu);
  assert.match(nodeLabel(en, 'extended_fol'), /Appendix H.*Seven N-ary FOL Rules.*70 Paper Samples.*One-step.*Three Large Models.*Outside.*1,552/isu);
  assert.match(nodeLabel(en, 'evaluate'), /Six LLMs.*Zero-shot Chain-of-Thought.*Binary Entailment/isu);
  assert.match(nodeLabel(en, 'report'), /Accuracy.*Logic Type.*Depth.*Reasoning-chain/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /6d55ade5.*MIT.*1,556 Core JSON Entries.*140 Appendix-H Entries.*No Generator or Evaluator Code/isu);
  assertEdge(en, 'inventory', 'extended_fol', 'secondary', 'Appendix H, outside core');
  assertEdge(en, 'release', 'release_boundary', 'secondary', 'Published surface');
  assert.match(detail.drawio_review_note, /8d41be5ca35b592d17cad88da974055469f712801af805b0e556ea2b78046204/u);
  assert.match(detail.drawio_review_note, /6d55ade5dfcc35e1382bf62335df3a061bc4c781/u);
  assert.match(detail.drawio_review_note, /PDF pages 4–7.*Appendices B–H.*pages 12–16/isu);
  assert.match(detail.drawio_review_note, /fixed-tree sample arrays.*1,556.*140/isu);
  assert.match(detail.drawio_review_note, /paper.*1,552.*70/isu);
  assert.match(detail.drawio_review_note, /https:\/\/github\.com\/Mihir3009\/Multi-LogiEval\/tree\/6d55ade5/isu);
});

test('locks Multi-SWE-bench five-phase construction, evaluation, scope, and licenses', () => {
  const detail = readDetail('Multi-SWE-bench');
  const en = readSpec('Multi-SWE-bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.02605v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.02605v1');
  assert.equal(detail.openness, 'public');
  assert.match(detail.openness_en, /Public.*Apache-2\.0.*CC0.*upstream/isu);
  assert.match(nodeLabel(en, 'repos'), />500 Stars.*Active.*Six Months.*CI\/CD.*Latest Commit.*Buildable.*Testable/isu);
  assert.match(nodeLabel(en, 'prs'), /Linked.*Issue.*Modified Test Files.*Merged.*Main Branch/isu);
  assert.match(nodeLabel(en, 'runs'), /Full Test Suite.*Run\.log.*Test\.log.*Fix\.log.*Base.*Test Patch.*Fix Patch/isu);
  assert.match(nodeLabel(en, 'filter'), /Discard ANY.*PASSED.*FAILED.*Require.*ANY.*FAILED.*PASSED.*PASSED.*NONE\/SKIPPED.*FAILED/isu);
  assert.match(nodeLabel(en, 'candidates'), /2,456.*39 Repositories.*Seven.*Languages/isu);
  assert.match(nodeLabel(en, 'annotator_setup'), /68 Outsourced Experts.*Two Years.*Bachelor.*One-hour Training/isu);
  assert.match(nodeLabel(en, 'annotation'), /Two Annotators.*Independently.*Cross-review.*Agreed Final Label/isu);
  assert.match(nodeLabel(en, 'quality'), /14 Engineers.*Reference Answers.*80%.*Q2\.1=0.*Q3\.1.*Q4\.1/isu);
  assert.match(nodeLabel(en, 'dataset'), /1,632.*Java.*TypeScript.*JavaScript.*Go.*Rust.*C.*C\+\+/isu);
  assert.match(nodeLabel(en, 'methods'), /MagentLess.*MSWE-agent.*MopenHands/isu);
  assert.match(nodeLabel(en, 'methods'), /Multilingual.*Nine LLMs/isu);
  assert.match(nodeLabel(en, 'harness'), /Generated Fix Patch.*Docker.*Tests.*Resolved/isu);
  assert.match(nodeLabel(en, 'metrics'), /Resolved Rate.*Success Location.*File-level.*Average Cost.*Per Issue/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /24f493f8.*Apache-2\.0.*68e134be.*Metadata.*other.*CC0.*Upstream Licenses/isu);
  assert.match(nodeLabel(en, 'scope_boundary'), /Core Benchmark.*1,632.*Excludes Python.*500-item Python Comparison.*4,723.*Skips Phase 5/isu);
  assertEdge(en, 'dataset', 'release_boundary', 'secondary', 'Release evidence');
  assertEdge(en, 'metrics', 'scope_boundary', 'secondary', 'Scope distinction');
  assert.match(detail.drawio_review_note, /4de921d8d88a016762ad1680ec8f5b24381c8c69442e96a4265a50f1bce31d92/u);
  assert.match(detail.drawio_review_note, /24f493f8a103e72312ded4f6b9c89f081d69cb09/u);
  assert.match(detail.drawio_review_note, /68e134be1721821bd4f380d0ed3c14c34fc770cb/u);
  assert.match(detail.drawio_review_note, /PDF page 5.*Figure 2.*pages 6–8.*Sections 3\.1\.1–3\.1\.5/isu);
  assert.match(detail.drawio_review_note, /PDF pages 11–13.*Sections 5\.1–5\.2/isu);
  assert.match(detail.drawio_review_note, /license metadata.*other.*prose.*CC0.*upstream/isu);
  assert.match(detail.drawio_review_note, /https:\/\/github\.com\/multi-swe-bench\/multi-swe-bench\/tree\/24f493f8/isu);
});
