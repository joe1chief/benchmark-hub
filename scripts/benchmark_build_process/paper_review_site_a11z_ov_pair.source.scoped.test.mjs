import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = new Map(JSON.parse(
  readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'),
).map(item => [item.id, item]));
const benchmarkIds = ['OVBench', 'OVOBench'];
const expectedCounts = new Map([
  ['OVBench', { nodes: 20, edges: 22 }],
  ['OVOBench', { nodes: 24, edges: 27 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'pdf_cdn_url',
  'build_method',
  'metric',
  'openness',
  'scale',
  'has_leaderboard',
  'homepage',
  'intro_en',
  'build_method_en',
  'metric_en',
  'openness_en',
  'scale_en',
  'mermaid_flowchart',
  'flowchart_en',
  'flowchart_zh',
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

test('keeps the OV pair bilingual, synchronized, and style-safe at source stage', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.get(id);
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
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
  }
});

test('locks OVBench construction, released counts, paper protocol, and implementation drift', () => {
  const detail = readDetail('OVBench');
  const en = readSpec('OVBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2501.00584v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2501.00584v2');
  assert.equal(detail.homepage, 'https://videochat-online.github.io');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /arXiv:2501\.00584v2.*Git 012712a.*HF 4d9ddfa/isu);
  assert.match(nodeLabel(en, 'contexts'), /Past.*Current.*Future.*Question Timestamp/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /6 Task Types.*16 Subtasks.*Spatial.*Temporal.*Hallucination.*Memory.*Prediction/isu);
  assert.match(nodeLabel(en, 'source_count'), /Introduction: Seven Datasets.*Section 3\.2: Eight Datasets.*Six Domains.*Do Not Flatten/isu);
  assert.match(nodeLabel(en, 'val_test'), /Validation and Test Splits Only.*Potential Data Leakage/isu);
  assert.match(nodeLabel(en, 'existing_labels'), /Existing Spatiotemporal Labels.*Timestamps.*Bounding Boxes.*Action.*Trajectory/isu);
  assert.match(nodeLabel(en, 'qa_templates'), /Human Annotators.*Rewrite.*Task-specific Templates/isu);
  assert.match(nodeLabel(en, 'options'), /Same-video.*Shifted Timestamps.*Similar Questions or Objects.*Typical Responses/isu);
  assert.match(nodeLabel(en, 'manual_qc'), /Question Clarity.*Option Ambiguity.*Annotation Accuracy/isu);
  assert.match(nodeLabel(en, 'trim_sampling'), /Earliest Relevant Question.*Duration-proportional.*Scene Diversity.*Task Balance/isu);
  assert.match(nodeLabel(en, 'hf_release'), /1,463 Videos.*7,090 Questions.*2 Options: 1,774.*3 Options: 72.*4 Options: 5,244/isu);
  assert.match(nodeLabel(en, 'sliding'), /Prior 32 Seconds.*2 fps.*64 Frames/isu);
  assert.match(nodeLabel(en, 'streaming'), /Clip Start to Query Timestamp.*2 fps/isu);
  assert.match(nodeLabel(en, 'paper_scoring'), /16 Subtask Accuracies.*Unweighted Mean.*Table 2/isu);
  assert.match(nodeLabel(en, 'repo_embedded'), /1,441 Videos.*7,005 Rows.*Four LMMS Configs/isu);
  assert.match(nodeLabel(en, 'repo_harness'), /A–E.*Empty Predictions Excluded.*Item-level Micro Accuracy/isu);
  assert.match(nodeLabel(en, 'artifact_boundary'), /HF Card: MIT.*Git Has No LICENSE File.*Source-video Rights/isu);
  assert.match(nodeLabel(en, 'drift'), /Paper: Seven vs Eight Datasets.*HF: Ten Storage Prefixes.*Paper Streaming: 2 fps.*Repo Script: 8 fps.*Macro.*Micro/isu);
  assertEdgeTriples(en, [
    ['evidence', 'contexts', 'secondary', 'Fixed evidence'],
    ['taxonomy', 'source_count', 'primary', ''],
    ['hf_release', 'eval_gate', 'primary', ''],
    ['eval_gate', 'sliding', 'primary', 'Offline MLLMs'],
    ['eval_gate', 'streaming', 'primary', 'Online MLLMs'],
    ['sliding', 'predict', 'primary', ''],
    ['streaming', 'predict', 'primary', ''],
    ['predict', 'paper_scoring', 'primary', 'Paper reporting'],
    ['hf_release', 'repo_embedded', 'secondary', 'Pinned Git harness data'],
    ['repo_embedded', 'repo_harness', 'primary', ''],
    ['hf_release', 'artifact_boundary', 'secondary', 'Release boundary'],
    ['paper_scoring', 'drift', 'secondary', 'Protocol drift'],
    ['repo_harness', 'drift', 'secondary', 'Implementation drift'],
  ], 'OVBench');
  assert.match(detail.scale_en, /1,463 videos.*7,090 questions.*7,005/isu);
  assert.match(detail.metric_en, /paper.*16-subtask macro.*harness.*item-level micro/isu);
  assert.match(detail.drawio_review_note, /cc6c55744d257942183b6563cda6dfecf87ea77a329a934457cd7b1ef842a860/u);
  assert.match(detail.drawio_review_note, /9d90586321b6820d2747f4788b40fa17219c8a6cf42710e67c99757f324434ae/u);
  assert.match(detail.drawio_review_note, /012712affb74681b88a317656a1effcf7b095933/u);
  assert.match(detail.drawio_review_note, /4d9ddfa3ba1464997d504ecdd4a6db2af801df01/u);
  assert.match(detail.drawio_review_note, /f9771588ae29e0e31e38d4f6622136b4cf0548f6eeae2aab5580be3ebd8334ea/u);
  assert.match(detail.drawio_review_note, /3e15767cc6b68c8c751555a61753135cc1e6e6de250200bb39685a183e3a7df3/u);
  assert.match(detail.drawio_review_note, /paper introduction says seven.*Section 3\.2 says eight.*ten storage prefixes/isu);
  assert.match(detail.drawio_review_note, /paper Table 2.*unweighted mean.*16 subtask.*fixed harness.*micro.*non-empty/isu);
  assert.match(detail.drawio_review_note, /streaming shell.*8 fps.*paper.*2 fps/isu);
});

test('locks OVO-Bench paper construction, current-edition drift, scoring, and licenses', () => {
  const detail = readDetail('OVOBench');
  const en = readSpec('OVOBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2501.05510v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2501.05510v2');
  assert.equal(detail.homepage, 'https://github.com/JoeLeelyf/OVO-Bench');
  assert.equal(detail.openness, 'public, noncommercial license');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /arXiv:2501\.05510v2.*Git c34093f.*HF fec29e3/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /Backward Tracing.*Real-Time Visual Perception.*Forward Active Responding/isu);
  assert.match(nodeLabel(en, 'task_split'), /3 Backward.*6 Real-time.*3 Forward.*12 Tasks.*Figure 2 Caption Says 14/isu);
  assert.match(`${nodeLabel(en, 'sources')}\n${nodeLabel(en, 'source_map')}`, /Validation\/Test.*QA-Ego4D.*OpenEQA.*STAR.*YouCook2.*CrossTask.*HiREST.*COIN.*Perception-Test.*THUMOS.*MovieNet.*Ego4D.*YouTube/isu);
  assert.match(nodeLabel(en, 'meta_gate'), /Three Meta-annotation Paths/isu);
  assert.match(nodeLabel(en, 'existing_meta'), /Repurpose Accurate Event Timestamps/isu);
  assert.match(nodeLabel(en, 'semi_auto'), /Gemini-1\.5.*Coarse Timestamps.*Human Refinement/isu);
  assert.match(nodeLabel(en, 'human_meta'), /Volunteers.*SSR.*CRR.*Questions.*Answers.*Ground-truth Timestamps/isu);
  assert.match(nodeLabel(en, 'qa_generation'), /Random Short Clips.*GPT-4o.*Human-refined Prompts.*Human-proposed Questions/isu);
  assert.match(nodeLabel(en, 'options'), /Backward and Real-time.*2–5 Options.*Rule-based.*Visually Grounded/isu);
  assert.match(nodeLabel(en, 'manual_qc'), /Inspect Every QA.*Human Review.*Shuffle Options/isu);
  assert.match(nodeLabel(en, 'paper_release'), /644 Unique Videos.*2,814 QA Meta-annotations.*Seven Domains.*12 Tasks/isu);
  assert.match(nodeLabel(en, 'bt_rt'), /Clip Start to Query Time.*Multiple-choice/isu);
  assert.match(nodeLabel(en, 'forward_dense'), /Densely Query.*Wait or Answer.*REC.*SSR.*CRR/isu);
  assert.match(nodeLabel(en, 'paper_metric'), /REC.*p1 = 0\.2.*p2 = 0\.05.*SSR and CRR.*GPT-4o.*p = 0\.5/isu);
  assert.match(nodeLabel(en, 'current_release'), /1,640 Top-level Records.*3,035 Timestamp Tests.*README: 3,100 Queries/isu);
  assert.match(nodeLabel(en, 'current_scorer'), /No GPT-4o.*No Timing-weighted Score.*REC: Digits.*SSR\/CRR: Yes\/No/isu);
  assert.match(nodeLabel(en, 'current_report'), /Task Means.*Three Mode Means.*Overall Mean/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Annotations: CC BY-NC-SA 4\.0.*Git Code: MIT.*HF Card: CC BY-SA 4\.0.*Source-dataset Terms/isu);
  assert.match(nodeLabel(en, 'drift'), /Paper 2,814.*Current JSON 1,640 \/ 3,035.*README 3,100.*Paper Timing Metrics.*Released Accuracy-only Scorer/isu);
  assertEdgeTriples(en, [
    ['evidence', 'taxonomy', 'secondary', 'Fixed evidence'],
    ['sources', 'source_map', 'primary', ''],
    ['source_map', 'meta_gate', 'primary', ''],
    ['meta_gate', 'existing_meta', 'primary', 'Existing'],
    ['meta_gate', 'semi_auto', 'primary', 'Gemini coarse'],
    ['meta_gate', 'human_meta', 'primary', 'Human SSR/CRR'],
    ['existing_meta', 'refine', 'primary', ''],
    ['semi_auto', 'refine', 'primary', ''],
    ['human_meta', 'refine', 'primary', ''],
    ['paper_release', 'eval_gate', 'primary', ''],
    ['eval_gate', 'bt_rt', 'primary', 'Past / present'],
    ['eval_gate', 'forward_dense', 'primary', 'Future'],
    ['bt_rt', 'paper_metric', 'primary', ''],
    ['forward_dense', 'paper_metric', 'primary', ''],
    ['paper_release', 'current_release', 'secondary', 'Current edition'],
    ['current_release', 'current_scorer', 'primary', ''],
    ['paper_report', 'drift', 'secondary', 'Paper protocol'],
    ['current_report', 'drift', 'secondary', 'Released implementation'],
    ['current_release', 'license_boundary', 'secondary', 'License boundary'],
  ], 'OVOBench');
  assert.match(detail.scale_en, /paper.*2,814.*current JSON.*1,640.*3,035.*README.*3,100/isu);
  assert.match(detail.metric_en, /paper.*timing-weighted.*released scorer.*accuracy-only/isu);
  assert.match(detail.drawio_review_note, /dc5fc42ff20c077088a286b56727fb55e4760a25c6fc7f0189338fa56dafdfe8/u);
  assert.match(detail.drawio_review_note, /9367e809f192301b89e4722ce159bcabe94c477dac2563121e411c29d0987454/u);
  assert.match(detail.drawio_review_note, /c34093f9a072d93f9e1c6b923446dfba71f4528e/u);
  assert.match(detail.drawio_review_note, /dc4a90daf26764dc8ab8b228ea4af864ba2ea50c2833ead8c9af6573f78ccf97/u);
  assert.match(detail.drawio_review_note, /2a03be7992ba0871f9eb7db8cf7f326591635ffb7ed0e435e468f30dfefb18dc/u);
  assert.match(detail.drawio_review_note, /fec29e3385747b5642d995370143ba92d2819bd2/u);
  assert.match(detail.drawio_review_note, /13292e5c81efc39780f368a755d578809bcf0f6568c3d2f410e659645308304d/u);
  assert.match(detail.drawio_review_note, /paper and repository.*CC BY-NC-SA 4\.0.*HF card.*CC BY-SA 4\.0.*MIT/isu);
  assert.match(detail.drawio_review_note, /static leaderboard image.*no submission/isu);
  assert.match(detail.drawio_review_note, /1,640 top-level.*3,035.*3,100/isu);
});
