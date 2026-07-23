import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MixEval', 'MixEval-Hard'];
const expectedCounts = new Map([
  ['MixEval', { nodes: 26, edges: 27 }],
  ['MixEval-Hard', { nodes: 30, edges: 32 }],
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

function edgeBetween(graph, from, to) {
  const edge = graph.edges.find(candidate => candidate.from === from && candidate.to === to);
  assert.ok(edge, `missing edge ${from}->${to}`);
  return edge;
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

test('keeps the MixEval pair bilingual, catalog-synchronized, and fallback-synchronized', () => {
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
    for (const edge of en.edges.filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_en), specSignature(en), `${id} English fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_zh), specSignature(zh), `${id} Chinese fallback`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks MixEval detector, mixture, dynamic-version, evaluation, and release boundaries', () => {
  const detail = readDetail('MixEval');
  const en = readSpec('MixEval', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2406.06565v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2406.06565v2');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(detail.intro_en, /detect about 2 million candidate user queries.*filter\/classify them.*retain text-in\/text-out/isu);
  assert.match(detail.scale_en, /Paper\/HF target.*4,000.*Aug 2024.*3,995/isu);
  assert.match(nodeLabel(en, 'detector_benchmarks'), /Wild Positives.*Wikipedia Negatives.*Author-handpicked/isu);
  assert.match(nodeLabel(en, 'initial_detector'), /Vicuna-33B.*About 20k.*Recall >99%/isu);
  assert.match(nodeLabel(en, 'trained_detector'), /Recall >99%.*Precision >98%/isu);
  assert.match(nodeLabel(en, 'wild_queries'), /2M Detected User Queries/isu);
  assert.match(nodeLabel(en, 'gpt4_filter'), /GPT-4 Turbo.*Text-in\/Text-out/isu);
  assert.match(nodeLabel(en, 'general_pool'), /12 General.*MMLU.*CSQA.*OBQA.*BBH/isu);
  assert.match(nodeLabel(en, 'domain_pool'), /Six Domain.*GSM8K.*SIQA/isu);
  assert.match(nodeLabel(en, 'benchmark_pool'), /18 Ground-truth Benchmarks.*Development \+ Test/isu);
  assert.match(nodeLabel(en, 'match'), /all-mpnet-base-v2.*Normalized Dot Product.*Top-1.*Length/isu);
  assert.match(nodeLabel(en, 'mixeval'), /Paper Target 4,000.*95\.15% English.*Source Ground Truth/isu);
  assert.match(nodeLabel(en, 'stability'), /Five Versions.*Under One Minute.*Std\. 0\.36.*99\.71%.*85\.05%/isu);
  assert.match(nodeLabel(en, 'inference'), /Official or FastChat Templates.*Base Models · 5-shot/isu);
  assert.match(nodeLabel(en, 'freeform_parser'), /GPT-3\.5-Turbo-0125.*0\.0–1\.0.*\[\[score\]\]/isu);
  assert.match(nodeLabel(en, 'mc_parser'), /GPT-3\.5-Turbo-0125.*\[\[A\]\]/isu);
  assert.match(nodeLabel(en, 'failure_rules'), /Seed 42.*10 Outer Retries.*Random.*BadRequest.*Random/isu);
  assert.match(nodeLabel(en, 'overall'), /Sample-count Weighted.*Free-form \+ Multiple-choice/isu);
  assert.match(nodeLabel(en, 'meta_eval'), /Across-model Meta-evaluation.*Arena Elo.*Not Per-item Grading/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Evaluator \+ Dynamic Data Only.*HF .*Apache-2\.0 Card.*No Construction Code.*No Repository LICENSE/isu);
  assertEdgeTriples(en, [
    ['common_crawl', 'apply_detector', 'secondary', 'Full corpus'],
    ['general_pool', 'benchmark_pool', 'secondary', '12 general'],
    ['domain_pool', 'benchmark_pool', 'secondary', '6 domain'],
    ['mixeval', 'refresh', 'primary', ''],
    ['batch_update', 'refresh', 'secondary', 'New batch'],
    ['crawl_update', 'refresh', 'secondary', 'New crawl'],
    ['pool_update', 'refresh', 'secondary', 'New pool'],
    ['parser_gate', 'freeform_parser', 'primary', 'Free-form'],
    ['parser_gate', 'mc_parser', 'primary', 'Multiple-choice'],
    ['failure_rules', 'freeform_parser', 'secondary', 'Failure policy'],
    ['failure_rules', 'mc_parser', 'secondary', 'Failure policy'],
    ['overall', 'meta_eval', 'primary', 'Across models'],
  ], 'MixEval');
  assert.deepEqual(
    edgeBetween(en, 'common_crawl', 'apply_detector').waypoints,
    [{ x: 960, y: 322 }, { x: 960, y: 180 }, { x: 1064, y: 180 }],
    'MixEval crawl-input edge clears the filtered-query corridor',
  );
  assert.deepEqual(
    edgeBetween(en, 'gpt4_filter', 'match').waypoints,
    [
      { x: 1924, y: 220 },
      { x: 984, y: 220 },
      { x: 984, y: 300 },
    ],
    'MixEval filtered-query edge clears the output node and match-output edge',
  );
  assert.deepEqual(
    edgeBetween(en, 'general_pool', 'benchmark_pool').waypoints,
    [{ x: 260, y: 350 }, { x: 700, y: 350 }],
    'MixEval general-pool edge clears the domain-pool node',
  );
  assert.deepEqual(
    edgeBetween(en, 'mixeval', 'release_boundary').waypoints,
    [{ x: 1164, y: 520 }, { x: 884, y: 520 }],
    'MixEval release-boundary edge stays separate from the batch-refresh branch',
  );
  assert.deepEqual(
    edgeBetween(en, 'refresh', 'inference').waypoints,
    [{ x: 1580, y: 300 }, { x: 1868, y: 300 }],
    'MixEval evaluation path clears the stability-evidence node',
  );
  assert.match(detail.drawio_review_note, /26c94aa106bf898fa87ec4e6632136d81d879de78b2354f1b1e37c30dd450536/u);
  assert.match(detail.drawio_review_note, /7c52b41929d461df7733573528bdfb08774b0c53/u);
  assert.match(detail.drawio_review_note, /66a05ec3821a2b5089ed1e32a5d65ab6ecdbf906/u);
  assert.match(detail.drawio_review_note, /2024-06-01.*2,000 plus 2,000.*2024-08-11.*1,995.*3,995 total/isu);
});

test('locks MixEval-Hard difficulty sampling, update timing, scoring, and release boundaries', () => {
  const detail = readDetail('MixEval-Hard');
  const en = readSpec('MixEval-Hard', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2406.06565v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2406.06565v2');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'mixeval'), /Paper Target 4,000.*95\.15% English.*Source Ground Truth/isu);
  assert.match(nodeLabel(en, 'prediction_runs'), /Several Models.*Prediction Results/isu);
  assert.match(nodeLabel(en, 'error_matrix'), /N_models × N_MixEval.*1 = Incorrect.*Model Accuracy/isu);
  assert.match(nodeLabel(en, 'difficulty'), /ξᵢ.*xi_i.*μ.*Aᵢ/isu);
  assert.match(nodeLabel(en, 'probability'), /exp.*λξᵢ.*xi_i/isu);
  assert.match(nodeLabel(en, 'cluster_gate'), /α.*τ.*Wild-query Shape/isu);
  assert.match(nodeLabel(en, 'hard'), /1,000.*95\.22% English.*Source Ground Truth/isu);
  assert.match(nodeLabel(en, 'version_facts'), /MixEval under One Minute.*Five MixEval Versions.*Hard Depends on Prediction Runs.*GPT-4-Turbo-only.*About Two Minutes/isu);
  assert.match(nodeLabel(en, 'overall'), /Sample-count Weighted.*Free-form \+ Multiple-choice/isu);
  assert.match(nodeLabel(en, 'meta_eval'), /Across-model Meta-evaluation.*Arena Elo.*Not Per-item Grading/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Partly Public.*Evaluator \+ Dynamic Data Only.*Construction Pipeline Not Released/isu);
  assertEdgeTriples(en, [
    ['mixeval', 'prediction_runs', 'primary', ''],
    ['prediction_runs', 'error_matrix', 'primary', ''],
    ['error_matrix', 'difficulty', 'primary', ''],
    ['probability', 'cluster_gate', 'primary', ''],
    ['cluster_gate', 'hard', 'primary', 'Accept'],
    ['cluster_gate', 'probability', 'secondary', 'Reject / resample'],
    ['hard', 'hard_refresh', 'primary', ''],
    ['batch_update', 'hard_refresh', 'secondary', 'New batch'],
    ['crawl_update', 'hard_refresh', 'secondary', 'New crawl'],
    ['pool_update', 'hard_refresh', 'secondary', 'New pool'],
    ['parser_gate', 'freeform_parser', 'primary', 'Free-form'],
    ['parser_gate', 'mc_parser', 'primary', 'Multiple-choice'],
    ['overall', 'meta_eval', 'primary', 'Across models'],
  ], 'MixEval-Hard');
  assert.deepEqual(
    edgeBetween(en, 'gpt4_filter', 'match').waypoints,
    [
      { x: 1924, y: 220 },
      { x: 984, y: 220 },
      { x: 984, y: 300 },
    ],
    'MixEval-Hard filtered-query edge clears the output node and match-output edge',
  );
  assert.deepEqual(
    edgeBetween(en, 'general_pool', 'benchmark_pool').waypoints,
    [{ x: 260, y: 350 }, { x: 700, y: 350 }],
    'MixEval-Hard general-pool edge clears the domain-pool node',
  );
  assert.deepEqual(
    edgeBetween(en, 'hard_refresh', 'inference').waypoints,
    [
      { x: 3000, y: 960 },
      { x: 1800, y: 960 },
      { x: 1800, y: 800 },
      { x: 44, y: 800 },
    ],
    'MixEval-Hard released-version corridor clears update and scoring edges',
  );
  assert.match(detail.drawio_review_note, /form A, a 0-1 matrix.*1 meaning incorrect/isu);
  assert.match(detail.drawio_review_note, /construction code.*not published/isu);
  assert.match(detail.drawio_review_note, /7c52b41929d461df7733573528bdfb08774b0c53/u);
  assert.match(detail.drawio_review_note, /66a05ec3821a2b5089ed1e32a5d65ab6ecdbf906/u);
  assert.match(detail.drawio_review_note, /2024-06-01.*2,000 free-form plus 2,000.*2024-08-11.*1,995.*3,995 total/isu);
});
