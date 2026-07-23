import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['OSWorld-G', 'OSWorld-Verified'];
const expectedCounts = new Map([
  ['OSWorld-G', { nodes: 20, edges: 21 }],
  ['OSWorld-Verified', { nodes: 19, edges: 21 }],
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

test('keeps the OSWorld variants bilingual, synchronized, and style-safe at source stage', () => {
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
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
    assert.match(detail.drawio_review_note, /Paper\/source audit fixed on 2026-07-18/u, `${id} review date`);
  }
});

test('locks OSWorld-G failure mining, dual instruction suites, scorer, snapshot conflicts, and provenance', () => {
  const detail = readDetail('OSWorld-G');
  const en = readSpec('OSWorld-G', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2505.13227v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2505.13227v3');
  assert.equal(detail.homepage, 'https://osworld-grounding.github.io/');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v3.*PDF SHA-256 60698468c8c1/isu);
  assert.match(nodeLabel(en, 'failures'), /State-of-the-art Model Trajectories.*Categorize Primary Capability.*Five/isu);
  assert.match(nodeLabel(en, 'screenshots'), /Real Desktop Rollouts.*Paper: 720p and 1080p/isu);
  assert.match(nodeLabel(en, 'expert'), /Software-experienced Annotators.*Descriptive Low-level Action.*Unique/isu);
  assert.match(nodeLabel(en, 'boxes'), /CVAT.*Instruction–Screenshot.*Bounding Box.*Character-level/isu);
  assert.match(nodeLabel(en, 'real_test'), /Actual Software.*Edge Cases.*Feasibility/isu);
  assert.match(nodeLabel(en, 'verify'), /Multiple Verification Rounds.*Strong-model Predictions.*Inconsistent/isu);
  assert.match(nodeLabel(en, 'enrich'), /Fine-grained UI-type Tag.*Refined Instruction.*0\.5 Human-hours/isu);
  assert.match(nodeLabel(en, 'release'), /Two 564-row JSONs.*Original \+ Refined.*470 BBox.*40 Polygon.*54 Refusal/isu);
  assert.match(nodeLabel(en, 'original'), /OSWorld-G\.json.*Software Knowledge/isu);
  assert.match(nodeLabel(en, 'refined'), /OSWorld-G_refined\.json.*Minimal Software Knowledge/isu);
  assert.match(nodeLabel(en, 'normalize'), /Four Coordinates.*Rescale.*Predicted-box Center/isu);
  assert.match(nodeLabel(en, 'spatial'), /Center Inside Gold Rectangle.*Point-in-polygon/isu);
  assert.match(nodeLabel(en, 'refusal'), /Center x < 0 and y < 0.*wait/isu);
  assert.match(nodeLabel(en, 'report'), /Correct ÷ 564.*Per-capability.*May Overlap/isu);
  assert.match(nodeLabel(en, 'snapshot_boundary'), /Paper: 32 UI Types.*Snapshot: 34 Raw Strings.*1280×800.*261\/330\/253\/149\/54/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /daa6bd8e0e62.*Apache-2\.0.*Public Data and Code.*No Release Tag/isu);
  assertEdgeTriples(en, [
    ['evidence', 'failures', 'secondary', ''],
    ['release', 'variant_gate', 'primary', ''],
    ['variant_gate', 'original', 'primary', 'Original'],
    ['variant_gate', 'refined', 'primary', 'Refined'],
    ['original', 'predict', 'primary', ''],
    ['refined', 'predict', 'primary', ''],
    ['target_gate', 'spatial', 'primary', 'BBox / polygon'],
    ['target_gate', 'refusal', 'primary', 'Refusal'],
    ['release', 'snapshot_boundary', 'secondary', 'Snapshot audit'],
    ['report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'OSWorld-G');
  assert.match(detail.drawio_review_note, /60698468c8c1b38eda2ebe3a77debaea6dd4ac9f0e73f3c1457eef114ebe6e49/u);
  assert.match(detail.drawio_review_note, /daa6bd8e0e629f0917ad2984df930bf0bd967540/u);
  assert.match(detail.drawio_review_note, /c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4/u);
  assert.match(detail.drawio_review_note, /8d8f210461a16702b99410658b605708f963b70aa5fc03fca897b4bafd9e3962/u);
  assert.match(detail.drawio_review_note, /72f7877651dddd9287bbfe613bd41799629cadaa1c0c5bd0d7d4c10a6fd6d94b/u);
  assert.match(detail.drawio_review_note, /b116fe57b3c6b97d650159536cb5a0c6a888cf2b1bbab70200a4b3544b545653/u);
  assert.match(detail.drawio_review_note, /b85f5685ce6c200ea648471666177859693d7f40cf50c12d08765ae68580de4a/u);
  assert.match(detail.drawio_review_note, /paper.*268\/337\/252\/154\/54.*fixed classification.*261\/330\/253\/149\/54/isu);
  assert.match(detail.drawio_review_note, /four.*1280×800.*nominal 720p\/1080p/isu);
  assert.match(detail.drawio_review_note, /34 raw tag strings.*32 UI types/isu);
});

test('locks OSWorld-Verified in-place maintenance, evaluator-first repairs, public reruns, and version boundaries', () => {
  const detail = readDetail('OSWorld-Verified');
  const en = readSpec('OSWorld-Verified', 'en');

  assert.equal(detail.paper_url, 'https://xlang.ai/blog/osworld-verified');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2404.07972v2');
  assert.equal(detail.homepage, 'https://xlang.ai/blog/osworld-verified');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /Official XLANG Blog.*28 Jul 2025.*HTML SHA-256 4cfe6235c305.*Original Paper v2/isu);
  assert.match(nodeLabel(en, 'baseline'), /Original v0\.1\.0.*b1fc026bc46f.*369 Entries.*358 Unique IDs.*11 Duplicate Appearances.*Execution Evaluators/isu);
  assert.match(nodeLabel(en, 'feedback'), /15 Months.*Every Accessible Community Channel.*300\+.*Institutions/isu);
  assert.match(nodeLabel(en, 'validate'), /Nearly Two Months.*About Ten-person Team.*Fix Log/isu);
  assert.match(nodeLabel(en, 'policy'), /Evaluator-first.*Preserve Task and Score Continuity.*Only if Necessary/isu);
  assert.match(nodeLabel(en, 'web'), /URL and Approximate Validation.*Environment-change Flags.*Proxy.*Equivalent Sites/isu);
  assert.match(nodeLabel(en, 'instructions'), /Formats.*Paths.*Scope.*Quantities.*Valid Outcomes/isu);
  assert.match(nodeLabel(en, 'evaluators'), /Fuzzy Documents.*Perceptual Image Hash.*PDF.*Spreadsheet.*Formula/isu);
  assert.match(nodeLabel(en, 'stability'), /Synchronous Operations.*50 GB → 25 GB.*Fonts.*Google Drive → Hugging Face/isu);
  assert.match(nodeLabel(en, 'fixed_suite'), /In-place evaluation_examples Update.*Current test_all: 369 Entries.*369 Unique IDs.*Configs and Evaluators Changed/isu);
  assert.match(nodeLabel(en, 'aws'), /VMware and Docker Still Supported.*AWS Host–Client.*50 Environments.*10\+ Hours → Minutes/isu);
  assert.match(nodeLabel(en, 'platform'), /Unified Platform and Settings.*Disclose Agent Implementation.*Trusted Monitoring.*Trajectories/isu);
  assert.match(nodeLabel(en, 'calibrate'), /Preliminary Repeated Validation.*Multiple Step Budgets.*Same Current Suite/isu);
  assert.match(nodeLabel(en, 'execute'), /Restore and Set Up Environment.*Real GUI.*Task-specific Execution Evaluator/isu);
  assert.match(nodeLabel(en, 'report'), /Success Rate.*Results and Trajectories.*No Original-score Carry-over/isu);
  assert.match(nodeLabel(en, 'release'), /Verified Section Default.*Compare Latest Against Latest.*Ongoing Maintenance/isu);
  assert.match(nodeLabel(en, 'version_boundary'), /Original 2024 Baselines Not Directly Comparable.*4 Removed.*15 Added.*Original: 358 Unique.*Current: 369 Unique/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /b7db4d8c85d9.*ea38b3169ba1.*Apache-2\.0.*Code and Configs Public/isu);
  assertEdgeTriples(en, [
    ['evidence', 'baseline', 'secondary', ''],
    ['policy', 'issue_gate', 'primary', ''],
    ['issue_gate', 'web', 'primary', 'Web / access'],
    ['issue_gate', 'instructions', 'primary', 'Ambiguity'],
    ['issue_gate', 'evaluators', 'primary', 'Evaluator'],
    ['issue_gate', 'stability', 'primary', 'System'],
    ['web', 'fixed_suite', 'primary', ''],
    ['instructions', 'fixed_suite', 'primary', ''],
    ['evaluators', 'fixed_suite', 'primary', ''],
    ['stability', 'fixed_suite', 'primary', ''],
    ['release', 'version_boundary', 'secondary', 'Version boundary'],
    ['release', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'OSWorld-Verified');
  assert.match(detail.drawio_review_note, /4cfe6235c305e94289aba3ad2d935e7ba582ced4ab751f323132124c490390d0/u);
  assert.match(detail.drawio_review_note, /d4c6e20dd59467f005561b1e97199f9842fd3b0e9fdd93e66e06ba0ec09edfdb/u);
  assert.match(detail.drawio_review_note, /b1fc026bc46f5aa40c1882a7d119be2196cf5a47/u);
  assert.match(detail.drawio_review_note, /b7db4d8c85d9e95e0b1db44de5bec954cf37f0cf/u);
  assert.match(detail.drawio_review_note, /c0565aaf9cc8061fb105d79d8f17069484949aa137da88a78bb6559e9de43580/u);
  assert.match(detail.drawio_review_note, /9ebc5187cbd727ef26c24626820076b102fff812863c640a67c467fea9542ab5/u);
  assert.match(detail.drawio_review_note, /ea38b3169ba1e01eac19b85fc46a1b7ccd173fb8/u);
  assert.match(detail.drawio_review_note, /a8d1d88a0f9cce3cdbff73b03a80dc5e5d69e3ba2443946c268815a550c9e0ec/u);
  assert.match(detail.drawio_review_note, /no separate peer-reviewed OSWorld-Verified paper.*official maintenance report/isu);
  assert.match(detail.drawio_review_note, /original.*369 entries.*358 unique.*11 duplicate.*maintained.*369 entries.*369 unique.*4 original IDs removed.*15 maintained IDs added/isu);
  assert.match(detail.scale_en, /369 entries.*358 unique.*369 entries.*369 unique/isu);
  assert.doesNotMatch(
    [detail.intro, detail.intro_en, detail.scale, detail.scale_en, detail.drawio_review_note].join('\n'),
    /same 369 task IDs|same 369 IDs|相同\s*369\s*个(?:任务)?\s*ID/iu,
  );
});
