import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['OpenMathReasoning', 'OpenRCA'];
const expectedCounts = new Map([
  ['OpenMathReasoning', { nodes: 24, edges: 23 }],
  ['OpenRCA', { nodes: 26, edges: 27 }],
]);
const expectedGroups = new Map([
  ['OpenMathReasoning', {
    construction: [
      'evidence', 'source', 'extract', 'classify', 'filter', 'transform', 'decontam', 'paper_scope',
      'release_scope', 'cot_generate', 'cot_filter', 'cot_release', 'tir_seed', 'tir_iterate', 'genselect',
      'release',
    ],
    evaluation: ['train_models', 'eval_suite', 'sample64', 'aggregate', 'report'],
    boundary: ['count_boundary', 'license_boundary', 'role_boundary'],
  }],
  ['OpenRCA', {
    construction: [
      'evidence', 'raw', 'select', 'records', 'balance', 'standardize', 'calibrate', 'filter', 'dataset',
      'goals', 'spec', 'synthesize', 'verify',
    ],
    evaluation: ['query', 'run_gate', 'balanced', 'oracle', 'agent', 'parse', 'element_score', 'strict', 'report'],
    boundary: ['version_boundary', 'access_boundary', 'license_boundary', 'implementation_boundary'],
  }],
]);

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

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
    const label = mermaidLabel(edge.label ?? '').replace(/\|/gu, '&#124;').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${label}|` : '-->')
      : (label ? `-. ${label} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

test('keeps OpenMathReasoning and OpenRCA bilingual, topology-locked, and source-stage safe', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);
    const groups = expectedGroups.get(id);

    for (const graph of [en, zh]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
    }
    assert.equal(en.nodes.length, expected.nodes, `${id} English node count`);
    assert.equal(en.edges.length, expected.edges, `${id} English edge count`);
    assert.equal(zh.nodes.length, expected.nodes, `${id} Chinese node count`);
    assert.equal(zh.edges.length, expected.edges, `${id} Chinese edge count`);
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.deepEqual(
      en.nodes.map(node => node.id),
      [...groups.construction, ...groups.evaluation, ...groups.boundary],
      `${id} semantic node groups`,
    );
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese node semantics`);
    }
    for (const edge of zh.edges.filter(edge => edge.label)) {
      assert.match(String(edge.label), /[\u3400-\u9fff]/u, `${id} ${edge.from}->${edge.to} Chinese edge semantics`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 4_000, `${id} review evidence`);
  }
});

test('locks OpenMathReasoning paper construction, corrected release, downstream evaluation, and licenses', () => {
  const detail = readDetail('OpenMathReasoning');
  const en = readSpec('OpenMathReasoning', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.16891v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.16891v1');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/nvidia/OpenMathReasoning/tree/d3d08664755704f422af97d43a7ff0ded4bd95df',
  );
  assert.equal(detail.openness, 'public; CC-BY-4.0 dataset and Apache-2.0 reproduction code');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /2504\.16891v1.*c4eeeb75e86a.*d3d086647557.*976666d0a484.*74b8649734a6/isu);
  assert.match(nodeLabel(en, 'source'), /AoPS.*Except Middle School Math.*620K/isu);
  assert.match(nodeLabel(en, 'extract'), /Qwen2\.5-32B-Instruct.*580K/isu);
  assert.match(nodeLabel(en, 'classify'), /Proof versus Non-proof.*Multiple-choice or Binary.*Valid versus Invalid/isu);
  assert.match(nodeLabel(en, 'filter'), /550K.*Open-form/isu);
  assert.match(nodeLabel(en, 'transform'), /Convert Proofs.*Extract Final Answers/isu);
  assert.match(nodeLabel(en, 'decontam'), /Popular Tasks.*540K/isu);
  assert.match(nodeLabel(en, 'paper_scope'), /540K.*3\.2M.*1\.7M.*566K/isu);
  assert.match(nodeLabel(en, 'release_scope'), /306K.*193,170.*5,678,317/isu);
  assert.match(nodeLabel(en, 'cot_generate'), /DeepSeek-R1.*QwQ-32B.*32.*0\.7.*0\.95/isu);
  assert.match(nodeLabel(en, 'cot_filter'), /Majority\s+Expected Answer.*Equivalence/isu);
  assert.match(nodeLabel(en, 'cot_release'), /3,201,061.*2\.7M.*0\.5M/isu);
  assert.match(nodeLabel(en, 'tir_seed'), /LIMO-Qwen-32B.*1\.2M.*15K/isu);
  assert.match(nodeLabel(en, 'tir_iterate'), /1,718,466/isu);
  assert.match(nodeLabel(en, 'genselect'), /QwQ-32B.*Qwen2\.5-32B.*565,620/isu);
  assert.match(nodeLabel(en, 'eval_suite'), /AIME24.*AIME25.*HMMT-24-25.*HLE-Math.*Not an Intrinsic/isu);
  assert.match(nodeLabel(en, 'sample64'), /64.*0\.6.*0\.95/isu);
  assert.match(nodeLabel(en, 'aggregate'), /pass@1.*maj@64.*Majority/isu);
  assert.match(nodeLabel(en, 'count_boundary'), /Paper 540K.*306K.*137K\s+Proof/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /CC BY 4\.0.*Apache 2\.0/isu);
  assert.match(nodeLabel(en, 'role_boundary'), /Post-training Data.*External Benchmarks.*Not.*Standalone/isu);
  assertEdgeTriples(en, [
    ['evidence', 'source', 'secondary', ''],
    ['paper_scope', 'release_scope', 'primary', ''],
    ['release', 'train_models', 'primary', ''],
    ['release_scope', 'count_boundary', 'secondary', ''],
    ['release', 'license_boundary', 'secondary', ''],
    ['report', 'role_boundary', 'secondary', ''],
  ], 'OpenMathReasoning');
  assert.match(detail.intro_en, /620K.*540K.*306K.*193,170.*5,678,317/isu);
  assert.match(detail.scale_en, /3,201,061.*1,718,466.*565,620.*193,170.*306K/isu);
  assert.match(detail.metric_en, /No intrinsic.*pass@1.*maj@64.*AIME24.*HLE-Math/isu);
  assert.match(detail.drawio_review_note, /c4eeeb75e86af3d7b6e35ad3e9ade1d339cd481da7f6121c9a600742c0c9ed4c/u);
  assert.match(detail.drawio_review_note, /d3d08664755704f422af97d43a7ff0ded4bd95df/u);
  assert.match(detail.drawio_review_note, /976666d0a4848732990c96e3b1111ec4938f215b212b3ee8231ad10052d905e6/u);
  assert.match(detail.drawio_review_note, /74b8649734a6ecc2d3beca89311e1a5e02da48fa/u);
  assert.match(detail.drawio_review_note, /c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4/u);
  assert.match(detail.drawio_review_note, /pipeline bug.*137K proof/isu);
  assert.match(detail.drawio_review_note, /49\.6 GB download was not repeated/isu);
});

test('locks OpenRCA construction, three-method evaluation, strict scoring, access, and mixed licenses', () => {
  const detail = readDetail('OpenRCA');
  const en = readSpec('OpenRCA', 'en');

  assert.equal(
    detail.paper_url,
    'https://proceedings.iclr.cc/paper_files/paper/2025/hash/d29b8d53678015079e1d245c023e49d2-Abstract-Conference.html',
  );
  assert.equal(
    detail.pdf_cdn_url,
    'https://proceedings.iclr.cc/paper_files/paper/2025/file/d29b8d53678015079e1d245c023e49d2-Paper-Conference.pdf',
  );
  assert.equal(
    detail.homepage,
    'https://github.com/microsoft/OpenRCA/tree/c1bd4af7f635171a1c31cdd567c07d698dff6abc',
  );
  assert.equal(detail.openness, 'public code and externally hosted data; MIT code, CC-BY-NC-4.0 telemetry');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /3cd926feb851.*c1bd4af7f635.*c08d18bd45b1.*9a1c23513926.*113bf4b60731/isu);
  assert.match(nodeLabel(en, 'raw'), /AIOps Challenge.*Metrics Logs.*Traces/isu);
  assert.match(nodeLabel(en, 'select'), /Telecom.*Banking.*Market/isu);
  assert.match(nodeLabel(en, 'records'), /1,753/isu);
  assert.match(nodeLabel(en, 'balance'), /Hundred-fold.*412/isu);
  assert.match(nodeLabel(en, 'calibrate'), /Three Engineers.*Time Component and Reason.*Evidence/isu);
  assert.match(nodeLabel(en, 'dataset'), /335.*68\.5 GB.*523M/isu);
  assert.match(nodeLabel(en, 'goals'), /Seven.*Time Component Reason.*Easy One.*Mid Two.*Hard Three/isu);
  assert.match(nodeLabel(en, 'spec'), /Thirty-minute.*Failure Count/isu);
  assert.match(nodeLabel(en, 'balanced'), /All Telemetry.*One-minute.*KPI Types.*Metric Files.*3 Times.*Median/isu);
  assert.match(nodeLabel(en, 'oracle'), /Golden KPIs.*Upper Bound/isu);
  assert.match(nodeLabel(en, 'agent'), /Controller.*Executor.*Python/isu);
  assert.match(nodeLabel(en, 'parse'), /JSON-like.*Extra Fields.*Permutation/isu);
  assert.match(nodeLabel(en, 'element_score'), /Exact Match.*Plus or Minus One Minute.*Partial Credit/isu);
  assert.match(nodeLabel(en, 'strict'), /Every Requested Element.*score Equal to 1\.0/isu);
  assert.match(nodeLabel(en, 'report'), /Easy Mid and Hard.*11\.34 Percent/isu);
  assert.match(nodeLabel(en, 'version_boundary'), /ICLR 2025.*c1bd4af7f635.*No Tagged Release/isu);
  assert.match(nodeLabel(en, 'access_boundary'), /dataset Directory Empty.*Google Drive.*Not Re-executed/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /MIT.*CC BY-NC 4\.0.*Derivatives.*Identical Terms/isu);
  assert.match(nodeLabel(en, 'implementation_boundary'), /Partial Fractions.*score Equal to 1\.0.*Separate/isu);
  assertEdgeTriples(en, [
    ['evidence', 'raw', 'secondary', ''],
    ['dataset', 'goals', 'primary', ''],
    ['run_gate', 'balanced', 'primary', ''],
    ['run_gate', 'oracle', 'primary', ''],
    ['run_gate', 'agent', 'primary', ''],
    ['balanced', 'parse', 'primary', ''],
    ['oracle', 'parse', 'primary', ''],
    ['agent', 'parse', 'primary', ''],
    ['report', 'version_boundary', 'secondary', ''],
    ['dataset', 'access_boundary', 'secondary', ''],
    ['access_boundary', 'license_boundary', 'secondary', ''],
    ['strict', 'implementation_boundary', 'secondary', ''],
  ], 'OpenRCA');
  assert.match(detail.intro_en, /1,753.*412.*335.*51.*136.*148.*68\.5 GB.*523M/isu);
  assert.match(detail.scale_en, /335.*Telecom 51.*Bank 136.*Market 148.*68\.5 GB.*523M.*73.*28/isu);
  assert.match(detail.metric_en, /Strict.*exact component and reason.*one minute.*all requested/isu);
  assert.match(detail.drawio_review_note, /3cd926feb85119dbb0927e856366e36b0f0794a3b16ea0950a8b4c13cd54fe2a/u);
  assert.match(detail.drawio_review_note, /c1bd4af7f635171a1c31cdd567c07d698dff6abc/u);
  assert.match(detail.drawio_review_note, /9a1c235139266c32b0e95c7e9938591b8fe014aad4cde95580f73f13a54d53f1/u);
  assert.match(detail.drawio_review_note, /113bf4b60731f967a51ece5dcc5901647014041873d1ddd7a4cc70837354dec9/u);
  assert.match(detail.drawio_review_note, /22766aad8116f3e936957980772167e427a6ad3b5a28591e93d8de4c8a3707f2/u);
  assert.match(detail.drawio_review_note, /c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383/u);
  assert.match(detail.drawio_review_note, /OpenReview.*HTTP 403.*official proceedings/isu);
  assert.match(detail.drawio_review_note, /did not download or independently recount/isu);
  assert.match(
    detail.drawio_review_note,
    /license permits non-commercial reuse.*paper separately says derivatives.*identical terms/isu,
  );
});
