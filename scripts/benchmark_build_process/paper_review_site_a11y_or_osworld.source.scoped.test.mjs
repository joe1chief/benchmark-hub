import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['OR-Bench', 'OSWorld'];
const expectedCounts = new Map([
  ['OR-Bench', { nodes: 20, edges: 22 }],
  ['OSWorld', { nodes: 18, edges: 17 }],
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

function unescapeMermaidText(value) {
  return value
    .replace(/<br\/>/gu, '\n')
    .replace(/&#124;/gu, '|')
    .replace(/\\"/gu, '"')
    .replace(/\\\\/gu, '\\');
}

function fallbackSignature(flowchart) {
  const nodes = [];
  const edges = [];
  for (const line of flowchart.split('\n')) {
    let match = line.match(/^\s*([a-z][a-z0-9_]*)\["(.*)"\]$/iu);
    if (match) {
      nodes.push({ id: match[1], label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -->\|(.*)\| ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[3], type: 'primary', label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) --> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[2], type: 'primary', label: '' });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\. (.*) \.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[3], type: 'secondary', label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) edges.push({ from: match[1], to: match[2], type: 'secondary', label: '' });
  }
  return { nodes, edges };
}

function specSignature(graph) {
  return {
    nodes: graph.nodes.map(node => ({ id: node.id, label: String(node.label) })),
    edges: graph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      type: edge.type,
      label: String(edge.label ?? ''),
    })),
  };
}

test('keeps OR-Bench and OSWorld bilingual, catalog-synchronized, and fallback-synchronized', () => {
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
    for (const graph of [en, zh]) {
      for (const edge of graph.edges.filter(edge => edge.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
      }
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_en), specSignature(en), `${id} English fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_zh), specSignature(zh), `${id} Chinese fallback`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
    assert.match(detail.drawio_review_note, /Paper\/source audit fixed on 2026-07-18/u, `${id} review date`);
  }
});

test('locks OR-Bench construction, filtering, audit, evaluation, and publication boundaries', () => {
  const detail = readDetail('OR-Bench');
  const en = readSpec('OR-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2405.20947v5');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2405.20947v5');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(detail.scale_en, /Paper labels.*80K.*Hard-1K.*600.*fixed public snapshot.*80,359.*1,319.*655/isu);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v5.*PDF SHA-256 1a4c7b60301a…/isu);
  assert.match(nodeLabel(en, 'categories'), /10 Refusal Categories/isu);
  assert.match(nodeLabel(en, 'seeds'), /Mixtral 8×7B.*2,000 per Category.*20 per Batch.*Temperature 1\.0/isu);
  assert.match(nodeLabel(en, 'rewrite'), /Five Rewrites per Seed.*Five Human-picked Few-shot Examples.*Temperature 0\.7/isu);
  assert.match(nodeLabel(en, 'moderate'), /GPT-4-turbo-2024-04-09.*Llama-3-70B.*Gemini-1\.5-pro-latest/isu);
  assert.match(nodeLabel(en, 'flagged_response'), /Mistral-7B-Instruct-v0\.3/isu);
  assert.match(nodeLabel(en, 'public_snapshot'), /Paper Labels 80K.*Hard-1K.*Toxic 600.*Public Exact 80,359.*1,319.*655/isu);
  assert.match(nodeLabel(en, 'hard_select'), /Six Listed Models.*Rejected by at Least Three.*Randomly Sample 1K.*1,318 Overlap.*One Extra/isu);
  assert.match(nodeLabel(en, 'moderator_validation'), /100 Tasks.*Five-vote Ground Truth.*Ensemble 93%.*Expert 94%/isu);
  assert.match(nodeLabel(en, 'expert_audit'), /Two Independent Experts.*All 1,319.*38 Flagged.*About 9 Debatable.*Kept/isu);
  assert.match(nodeLabel(en, 'eval_models'), /32 Models.*Eight Families.*No System Prompt.*Temperature 0\.0/isu);
  assert.match(nodeLabel(en, 'judge'), /Keyword Patterns.*10,000 Random Prompts.*Full 80K.*GPT-4.*Hard and Toxic/isu);
  assert.match(nodeLabel(en, 'report'), /Benign Lower Is Better.*Toxic Higher Is Better.*No Combined Scalar/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /Git 4fad1f9e4d4b….*Apache-2\.0.*HF e36d8b80e818….*CC-BY-4\.0.*No GitHub Release Tag/isu);
  assertEdgeTriples(en, [
    ['evidence', 'categories', 'secondary', ''],
    ['vote', 'benign_pool', 'primary', 'Majority safe'],
    ['vote', 'flagged_response', 'primary', 'Flagged'],
    ['recovery_gate', 'benign_pool', 'primary', 'Safe response'],
    ['recovery_gate', 'toxic_pool', 'primary', 'Still harmful'],
    ['benign_pool', 'public_snapshot', 'primary', ''],
    ['hard_select', 'public_snapshot', 'primary', ''],
    ['toxic_pool', 'public_snapshot', 'primary', ''],
    ['moderate', 'moderator_validation', 'secondary', ''],
    ['hard_select', 'expert_audit', 'secondary', ''],
    ['report', 'source_boundary', 'secondary', ''],
  ], 'OR-Bench');
  assert.match(detail.drawio_review_note, /1a4c7b60301abcad795fc63ac88bc04534f46cfd707f8ad2824993a87d402792/u);
  assert.match(detail.drawio_review_note, /4fad1f9e4d4ba368777585fa1f5b869b6d4442fa/u);
  assert.match(detail.drawio_review_note, /e36d8b80e81837c8a8f264bbb2a49f1b32c7e272/u);
  assert.match(detail.drawio_review_note, /22e956020cdfdd43c328f02441f003c933ee4e7083d02d9d24e414e4b42ae2e6/u);
  assert.match(detail.drawio_review_note, /a6e2f1166416efe5901f3bb05c47dc92ab3aca3acfe143693d38b8057d841e6d/u);
  assert.match(detail.drawio_review_note, /3be45901faae3b4b2b51bf7f8a2784c1650a1cc8c631dbc8b171d5312d4e0057/u);
  assert.match(detail.drawio_review_note, /paper says random sample 1K.*public file has 1,319/isu);
});

test('locks original OSWorld construction and separates it from OSWorld-Verified maintenance', () => {
  const detail = readDetail('OSWorld');
  const en = readSpec('OSWorld', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2404.07972v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2404.07972v2');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(detail.scale_en, /369 Ubuntu tasks.*268 single-app.*101 multi-app.*43 Windows.*activation/isu);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v2.*PDF SHA-256 d4c6e20dd594…/isu);
  assert.match(nodeLabel(en, 'sources'), /Official Guides.*Videos.*How-to and Q&A.*Courses and Blogs/isu);
  assert.match(nodeLabel(en, 'select'), /Popularity.*Helpfulness.*Diversity.*Author Brainstorming/isu);
  assert.match(nodeLabel(en, 'cross_check'), /Two Other Authors.*Feasibility.*Ambiguity.*Source Alignment/isu);
  assert.match(nodeLabel(en, 'annotation'), /Natural-language Instruction.*30 Infeasible.*84 Prior-benchmark Tasks/isu);
  assert.match(nodeLabel(en, 'setup'), /Restore Snapshot.*Host-to-VM Files.*Open Files.*Preprocessing Actions/isu);
  assert.match(nodeLabel(en, 'evaluator'), /Getter.*Evaluator.*Parameters.*134 Functions/isu);
  assert.match(nodeLabel(en, 'quality_control'), /Two Non-annotator Authors.*Positive and Negative Cases.*Four Rounds/isu);
  assert.match(nodeLabel(en, 'effort'), /Nine Student Authors.*More Than Three Months.*About 1,800 Person-hours.*400\+.*Four Checks/isu);
  assert.match(nodeLabel(en, 'release'), /Original v0\.1\.0.*369 Ubuntu.*268 Single-app.*101 Multi-app.*43 Windows/isu);
  assert.match(nodeLabel(en, 'observe'), /Screenshot.*A11y Tree.*Screenshot \+ A11y.*Set-of-Mark/isu);
  assert.match(nodeLabel(en, 'interact'), /PyAutoGUI.*Recent Three Observations and Actions.*Max 15 Steps.*Temperature 1\.0.*Top-p 0\.9/isu);
  assert.match(nodeLabel(en, 'report'), /Human 72\.36%.*GPT-4 \+ A11y 12\.24%/isu);
  assert.match(nodeLabel(en, 'maintenance_boundary'), /OSWorld-Verified.*In-place Upgrade.*b7db4d8c85d9….*300\+ Feedback Items.*Evaluator-first.*AWS.*50 Environments/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /Original b1fc026bc46f….*Current b7db4d8c85d9….*Apache-2\.0.*VM.*Cache.*Windows Activation/isu);
  assertEdgeTriples(en, [
    ['evidence', 'sources', 'secondary', ''],
    ['quality_control', 'effort', 'secondary', ''],
    ['report', 'maintenance_boundary', 'secondary', ''],
    ['report', 'source_boundary', 'secondary', ''],
  ], 'OSWorld');
  assert.deepEqual(
    en.edges.find(edge => edge.from === 'quality_control' && edge.to === 'effort')?.waypoints,
    [{ x: 2144, y: -80 }, { x: 2888, y: -80 }],
    'OSWorld construction-effort evidence must route above the release cylinder',
  );
  assert.match(detail.drawio_review_note, /d4c6e20dd59467f005561b1e97199f9842fd3b0e9fdd93e66e06ba0ec09edfdb/u);
  assert.match(detail.drawio_review_note, /b1fc026bc46f5aa40c1882a7d119be2196cf5a47/u);
  assert.match(detail.drawio_review_note, /b7db4d8c85d9e95e0b1db44de5bec954cf37f0cf/u);
  assert.match(detail.drawio_review_note, /c0565aaf9cc8061fb105d79d8f17069484949aa137da88a78bb6559e9de43580/u);
  assert.match(detail.drawio_review_note, /9ebc5187cbd727ef26c24626820076b102fff812863c640a67c467fea9542ab5/u);
  assert.match(detail.drawio_review_note, /same 369-task identity.*task configs and evaluators changed/isu);
  assert.match(detail.drawio_review_note, /original paper baseline.*not directly comparable.*OSWorld-Verified/isu);
});
