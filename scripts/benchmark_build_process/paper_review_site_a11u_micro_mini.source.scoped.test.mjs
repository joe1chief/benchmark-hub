import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MicroVQA', 'MiniF2F'];
const expectedCounts = new Map([
  ['MicroVQA', { nodes: 21, edges: 24 }],
  ['MiniF2F', { nodes: 21, edges: 25 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'org',
  'metric',
  'openness',
  'scale',
  'homepage',
  'intro_en',
  'scale_en',
  'metric_en',
  'has_leaderboard',
  'drawio_review_note',
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

function assertEdgeTriples(graph, expected, context) {
  const actual = new Set(graph.edges.map(edge => [
    edge.from,
    edge.to,
    edge.type,
    String(edge.label ?? ''),
  ].join('|')));
  for (const triple of expected) {
    const key = triple.join('|');
    assert.ok(actual.has(key), `${context} missing edge ${key}`);
  }
}

test('keeps the MicroVQA and MiniF2F source diagrams bilingual and catalog-synchronized', () => {
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
    assert.equal(en.meta.source, 'generated', `${id} valid source enum`);
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
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks MicroVQA construction, retry fallback, release, and parser boundaries', () => {
  const detail = readDetail('MicroVQA');
  const en = readSpec('MicroVQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2503.13399v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2503.13399v1');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'tasks'), /Nine Microscopy PIs\s+and Postdocs/iu);
  assert.match(nodeLabel(en, 'experts'), /12 Biology Experts.*About 600 Hours/isu);
  assert.match(nodeLabel(en, 'images'), /Own Experiments.*Open Databases.*CC-BY/isu);
  assert.match(nodeLabel(en, 'raw'), /1,061 Raw.*Up to Six RGB Images or Video Frames/isu);
  assert.match(nodeLabel(en, 'quality'), /after 10 and 40.*Initial Four to Six/isu);
  assert.match(nodeLabel(en, 'gold'), /50 Gold-standard MCQs.*NBME/isu);
  assert.match(nodeLabel(en, 'dspy'), /MIPROv2.*CoT \+ RAG.*o1-mini/isu);
  assert.match(nodeLabel(en, 'refine'), /No-image Evaluator.*At Most Five Iterations/isu);
  assert.match(nodeLabel(en, 'refine_gate'), /RefineBot Attempt Succeeds.*Evaluator Wrong.*Meaning Preserved/isu);
  assert.match(nodeLabel(en, 'dual_gate'), /Final Difficulty Gate Passes.*Both Named Models Fail.*Two Seeds/isu);
  assert.match(nodeLabel(en, 'gate_models'), /GPT-4o-2024-08-06.*Claude-3\.5-Sonnet-20241022/isu);
  assert.match(
    en.meta.legend,
    /GPT-4o-2024-08-06.*Claude-3\.5-Sonnet-20241022.*both fail across two random seeds/isu,
  );
  assert.match(nodeLabel(en, 'rerun'), /Different Random Seed.*No Total Rerun Cap/isu);
  assert.match(nodeLabel(en, 'stage1_fallback'), /RefineBot Never Passes/isu);
  assert.match(nodeLabel(en, 'manual'), /Original Creator.*All 1,042 Released Questions/isu);
  assert.match(nodeLabel(en, 'attrition'), /1,061 Raw → 1,042 Final.*Not Reported/isu);
  assert.match(nodeLabel(en, 'release'), /1,042 MCQs.*423 Multi-image.*CC BY-SA 4\.0/isu);
  assert.match(
    nodeLabel(en, 'parse'),
    /First Exact Answer Match.*Case-sensitive.*One Digit.*Subtract One.*Minus One/isu,
  );
  assert.match(nodeLabel(en, 'metrics'), /Every Released Row.*Bad-format Output\s+Is Incorrect/isu);
  assert.match(nodeLabel(en, 'scaffold_gap'), /LLaVA\s+Special Prefix \+ Suffix.*Shared Prompt.*test.*train/isu);
  assertEdgeTriples(en, [
    ['stage1', 'refine', 'primary', ''],
    ['refine', 'refine_gate', 'primary', ''],
    ['refine_gate', 'dual_gate', 'primary', 'Yes'],
    ['gate_models', 'dual_gate', 'secondary', 'Required pair'],
    ['refine_gate', 'rerun', 'secondary', 'No'],
    ['dual_gate', 'manual', 'primary', 'Yes'],
    ['dual_gate', 'rerun', 'secondary', 'No'],
    ['rerun', 'refine', 'secondary', 'Retry'],
    ['rerun', 'stage1_fallback', 'secondary', 'Fallback'],
    ['stage1_fallback', 'manual', 'primary', 'Retained'],
    ['parse', 'metrics', 'primary', ''],
    ['parse', 'scaffold_gap', 'secondary', 'Code/paper drift'],
  ], 'MicroVQA');
  assert.match(detail.drawio_review_note, /3b52dc7131c3a285c33654856b349d9073e3604b/u);
  assert.match(detail.drawio_review_note, /744d656b41f2d9f9bf8f229283271bd67ee782fd/u);
  assert.match(detail.drawio_review_note, /no top-level license/iu);
});

test('locks MiniF2F form-specific adaptation, v1 split, baseline, and version boundaries', () => {
  const detail = readDetail('MiniF2F');
  const en = readSpec('MiniF2F', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2109.00110v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2109.00110v2');
  assert.equal(
    detail.homepage,
    'https://github.com/openai/miniF2F/tree/f0dcc8b59e630fba00ba9569ca6714700e0a8801',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'sources'), /IMO.*AIME.*AMC.*MATH.*Custom/isu);
  assert.match(nodeLabel(en, 'select'), /Geometry and Combinatorics\s+Are Under-covered/isu);
  assert.match(nodeLabel(en, 'mcq'), /Correct Choice Only.*All-choice Alternative.*Not the v1/isu);
  assert.match(nodeLabel(en, 'word'), /Explicitly Model.*Discard if Formalization\s+Carries Most Difficulty/isu);
  assert.match(nodeLabel(en, 'witness'), /Given Witness or Answer.*Correctness\s+and Uniqueness.*Much Easier/isu);
  assert.match(nodeLabel(en, 'formalize'), /Average about 15 Minutes/isu);
  assert.match(nodeLabel(en, 'review'), /Average about 7\.5 Minutes.*Protocol\s+Not Reported/isu);
  assert.match(nodeLabel(en, 'align'), /Lean \+ Metamath.*Isabelle Partial.*HOL Light Work in Progress/isu);
  assert.match(nodeLabel(en, 'split'), /Validation · 244.*Test · 244/isu);
  assert.match(nodeLabel(en, 'release'), /488 Formal Statements.*Validation for Development.*Test for Final/isu);
  assert.match(nodeLabel(en, 'freeze'), /Error Fixes Only.*MIT Metamath.*Apache Lean and Isabelle/isu);
  assert.match(nodeLabel(en, 'version_boundary'), /488 Lean\/Metamath\/Isabelle.*330 HOL Light.*Says 244 in Error.*Live v2 Keeps 488/isu);
  assert.match(nodeLabel(en, 'metamath'), /700M Parameters.*128 Expansions.*16 Tactics/isu);
  assert.match(nodeLabel(en, 'tidy'), /Queue 128.*Depth 8.*Seventeen Tactics.*Deterministic/isu);
  assert.match(nodeLabel(en, 'lean_gptf'), /700M Parameters.*128 Expansions.*16 Tactics/isu);
  assert.match(nodeLabel(en, 'search_check'), /Machine-check.*Any Attempt Succeeds/isu);
  assert.match(nodeLabel(en, 'metrics'), /Pass@N.*Validation and Test Separately/isu);
  assert.match(nodeLabel(en, 'report_boundary'), /No Formal Submission Process\s+or Online Leaderboard/isu);
  assertEdgeTriples(en, [
    ['form_gate', 'formalize', 'primary', 'Direct'],
    ['form_gate', 'mcq', 'secondary', 'MCQ'],
    ['form_gate', 'word', 'secondary', 'Word'],
    ['form_gate', 'witness', 'secondary', 'Witness/set'],
    ['mcq', 'formalize', 'primary', ''],
    ['word', 'formalize', 'primary', ''],
    ['witness', 'formalize', 'primary', ''],
    ['baseline_gate', 'metamath', 'primary', 'Metamath'],
    ['baseline_gate', 'tidy', 'primary', 'Lean tidy'],
    ['baseline_gate', 'lean_gptf', 'primary', 'Lean GPT-f'],
    ['metamath', 'search_check', 'primary', ''],
    ['tidy', 'search_check', 'primary', ''],
    ['lean_gptf', 'search_check', 'primary', ''],
  ], 'MiniF2F');
  const leanRoute = en.edges.find(edge => edge.from === 'baseline_gate' && edge.to === 'lean_gptf');
  assert.deepEqual(leanRoute.waypoints, [
    { x: 1160, y: 850 },
    { x: 1160, y: 1340 },
    { x: 860, y: 1340 },
  ]);
  assert.ok(
    leanRoute.waypoints.slice(0, 2).every(point => point.x < en.nodes.find(node => node.id === 'version_boundary').position.x),
    'Lean GPT-f route stays left of the repository-version boundary',
  );
  assert.match(detail.drawio_review_note, /f0dcc8b59e630fba00ba9569ca6714700e0a8801/u);
  assert.match(detail.drawio_review_note, /c50ad1d7b3a2b196b533a2f644e48bccc02e2e13/u);
  assert.match(detail.drawio_review_note, /e4f113090ad82d64f8ce064d2f55b613a9b6bded/u);
});
