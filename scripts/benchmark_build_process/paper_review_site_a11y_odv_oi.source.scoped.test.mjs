import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['ODVBench', 'OIBench'];
const expectedCounts = new Map([
  ['ODVBench', { nodes: 22, edges: 22 }],
  ['OIBench', { nodes: 19, edges: 19 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'build_method',
  'metric',
  'scale',
  'openness',
  'homepage',
  'intro_en',
  'build_method_en',
  'metric_en',
  'scale_en',
  'openness_en',
  'has_leaderboard',
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

test('keeps the ODVBench and OIBench source bundle bilingual, synchronized, and style-safe', () => {
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
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    for (const graph of [en, zh]) {
      for (const node of graph.nodes) {
        assert.ok(String(node.label).split(/\r?\n/u).length <= 5, `${id}.${node.id} max five lines`);
      }
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.match(detail.drawio_review_note, /reviewed 2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
    assert.equal(detail.flowchart_en, renderFallback(en), `${id}.en canonical fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id}.zh canonical fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical mermaid fallback`);
  }
});

test('locks ODVBench construction branches, paper-release drift, causal evaluator, and access boundary', () => {
  const detail = readDetail('ODVBench');
  const en = readSpec('ODVBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2509.24871v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2509.24871v1');
  assert.equal(detail.homepage, 'https://github.com/MCG-NJU/StreamForest');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'scope'), /2509\.24871v1.*Fig\. 3.*Sec\. 4.*OnlineIT Pipeline Is Out of Scope.*No Exclusion or Dedup Claim.*OnlineIT-drive Trains FT-drive/isu);
  assert.doesNotMatch(nodeLabel(en, 'scope'), /Exclude OnlineIT Training Data/iu);
  assert.match(nodeLabel(en, 'source_sets'), /ROAD-Waymo.*MM-AU.*WayveScenes101.*BDD100K.*BiRViT-1K.*D²-City/isu);
  assert.match(nodeLabel(en, 'video_select'), /Existing Annotations.*YOLO.*Manual Inspection/isu);
  assert.match(nodeLabel(en, 'coarse_generate'), /VLLM plus YOLO.*Space.*Time.*Semantics/isu);
  assert.match(nodeLabel(en, 'human_verify'), /Structured Human Verification.*Spatiotemporal.*Task-relevant Evidence/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /Static.*247.*1,639.*Dynamic.*162.*2,973.*Event.*781.*1,710/isu);
  assert.match(nodeLabel(en, 'tasks'), /Twelve.*RTP.*PTM.*DDM.*KIE.*HD.*TCD.*AP.*LP.*DP.*RP.*RA.*ARA/isu);
  assert.match(nodeLabel(en, 'options'), /Pools plus LLM.*Plausible.*Two to Four/isu);
  assert.match(nodeLabel(en, 'option_handling'), /Similar Length.*Shuffle Choice Order/isu);
  assert.match(nodeLabel(en, 'sample'), /Video Length.*Scene Diversity.*Scenario and Task/isu);
  assert.match(nodeLabel(en, 'paper_release'), /1,190.*5–90.*6,322.*18\.9.*1,639.*2,973.*1,710/isu);
  assert.match(nodeLabel(en, 'released_data'), /5dcf37c.*ca769c2.*1,190.*6,348.*2,999.*26 More/isu);
  assert.match(nodeLabel(en, 'stream_contract'), /Query Timestamp.*No Future Content.*Benchmark-wide Contract/isu);
  assert.doesNotMatch(nodeLabel(en, 'stream_contract'), /1 FPS/iu);
  assert.match(nodeLabel(en, 'decode'), /StreamForest: 1 FPS.*Offline Baselines: Fixed Frames.*Option Letter.*16 Tokens.*Temp 0.*Top-p 1.*One Beam.*No Sampling/isu);
  assert.match(nodeLabel(en, 'code_score'), /First A–E.*Candidate Index.*Task.*Subtask Accuracy.*Omit Empty Outputs/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /4ffbc524.*f9d1467.*5dcf37c.*ca769c2.*Apache-2\.0.*MIT.*Video Rights.*Mapping External/isu);
  assertEdgeTriples(en, [
    ['annotation_gate', 'direct_convert', 'primary', 'Sufficient'],
    ['annotation_gate', 'coarse_generate', 'primary', 'Insufficient'],
    ['options', 'option_handling', 'primary', ''],
    ['option_handling', 'qa_review', 'primary', ''],
    ['paper_release', 'released_data', 'secondary', 'Pinned release'],
    ['paper_report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'ODVBench');
  assert.match(detail.drawio_review_note, /4ffbc524fed55d020d142bd7597a60b01871df54f46868630b2dd2e52aea7863/u);
  assert.match(detail.drawio_review_note, /f9d14670ff451ff5865638e17c9958e99bf2fec5/u);
  assert.match(detail.drawio_review_note, /5dcf37ccf7c24ac978db2b8aaad471c0b1b66f21/u);
  assert.match(detail.drawio_review_note, /ca769c269aee198d9ee6735d85a8c39a699e5833/u);
  assert.match(detail.drawio_review_note, /6,348 rows.*dynamic 2,999.*26 more dynamic rows/isu);
  assert.match(detail.drawio_review_note, /OnlineIT is a separate training pipeline.*neither OnlineIT exclusion.*OnlineIT-Drive.*FT-drive/isu);
  assert.match(detail.drawio_review_note, /option handling.*similar lengths.*shuffled order/isu);
  assert.match(detail.drawio_review_note, /benchmark-wide online access contract.*1 FPS constraint.*fixed StreamForest evaluation setup.*not a benchmark-wide.*fixed frame counts for offline baselines/isu);
  assert.doesNotMatch(detail.drawio_review_note, /evaluates a causal stream at 1 FPS/iu);
  assert.match(detail.drawio_review_note, /skips empty predictions.*denominator/isu);
  assert.match(detail.drawio_review_note, /video copyrights remain with creators\/platforms.*academic research/isu);
});

test('locks OIBench expert authoring, all-tests AC, per-test curves, and scorer boundary', () => {
  const detail = readDetail('OIBench');
  const en = readSpec('OIBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2506.10481v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2506.10481v1');
  assert.equal(detail.homepage, 'https://huggingface.co/datasets/AGI-Eval/OIBench');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'scope'), /2506\.10481v1.*Secs\. 3–5.*250-problem.*2026-07-18/isu);
  assert.match(nodeLabel(en, 'coaches'), /University ACM.*High-school OI.*20 Years.*Private Problems.*New Authoring/isu);
  assert.match(nodeLabel(en, 'originality'), /Unpublished Online and in Print.*Reject Number-only.*Reject Wording-only.*New Problem Logic/isu);
  assert.match(nodeLabel(en, 'difficulty'), /Codeforces-style.*Competition-level.*Frontier Reasoning/isu);
  assert.match(nodeLabel(en, 'tests'), /Large.*Resource-heavy.*Edge and Corner.*Body Cites Appendix Standards.*v1 Appendix Does Not List Them/isu);
  assert.doesNotMatch(nodeLabel(en, 'tests'), /Follow Appendix Test Standards/iu);
  assert.match(nodeLabel(en, 'canonical'), /One per Problem.*Every Official Test.*Solvability.*Test Correctness/isu);
  assert.match(nodeLabel(en, 'review'), /Six OI Contestants.*CCPC Silver.*Solvability.*Clarity.*Samples.*TeX.*Markdown/isu);
  assert.match(nodeLabel(en, 'translation'), /Three Professional Translators.*Translation Degree.*2 Years.*Glossary/isu);
  assert.match(nodeLabel(en, 'search_audit'), /Search Every Problem.*No Direct Retrieval Found.*May 2025/isu);
  assert.match(nodeLabel(en, 'paper_release'), /250.*Bilingual.*Tests.*Difficulty.*Canonical C\+\+.*37\.5M/isu);
  assert.match(nodeLabel(en, 'prompt'), /Zero-shot.*OJ I\/O.*C\+\+.*Java.*Python.*JavaScript.*32,768/isu);
  assert.match(nodeLabel(en, 'decode'), /Greedy.*Temp 0.*DeepSeek-R1.*Qwen3-32B.*0\.6/isu);
  assert.match(nodeLabel(en, 'runtime'), /CentOS 7\.6.*Kernel 5\.4.*glibc 2\.31.*C\+\+17.*g\+\+11\.3.*Java 1\.8\.0u45.*Python 3\.9.*Node 16\.18\.1/isu);
  assert.match(nodeLabel(en, 'ac_score'), /All Tests Pass.*Overall.*Four-language.*Chinese.*English/isu);
  assert.match(nodeLabel(en, 'efficiency'), /Per-test Pass Rate.*Not AC.*Canonical Resource Ratio.*Log Scale.*Solved Test-case Fraction/isu);
  assert.match(nodeLabel(en, 'separate_tracks'), /OIBench Pseudo.*Risk-Score.*BF.*CP.*TS.*IT.*44 Problems/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /42dc756.*2a84ab8.*7736d47.*250 Rows.*CC BY-ND 4\.0.*No LICENSE.*Host Scorer.*No Docker.*Curves/isu);
  assertEdgeTriples(en, [
    ['judge', 'ac_score', 'primary', 'All tests'],
    ['judge', 'efficiency', 'primary', 'Per test case'],
    ['report', 'separate_tracks', 'secondary', 'Separate analyses'],
    ['report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'OIBench');
  assert.match(detail.drawio_review_note, /42dc756e1ed2240446aca051fb8c356cbd1a6c5f592b1451af9618f7ec8a0d5a/u);
  assert.match(detail.drawio_review_note, /2a84ab8fd42b8827c8433691ebe9a7cd8ae12191/u);
  assert.match(detail.drawio_review_note, /7736d4769c84d9dcb4069c118865b5dd75bc5167/u);
  assert.match(detail.drawio_review_note, /body says those tests meet standards located in the Appendix.*Appendix A\.1–A\.10 does not enumerate.*disclosure gap.*instead of inventing criteria/isu);
  assert.match(detail.drawio_review_note, /all cases for its single candidate.*no fixed Docker configuration.*Completion Curve implementation/isu);
  assert.match(detail.drawio_review_note, /code tree also has no LICENSE file/isu);
});
