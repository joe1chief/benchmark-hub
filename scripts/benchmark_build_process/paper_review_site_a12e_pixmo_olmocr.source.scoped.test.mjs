import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PixMo_Count', 'olmOCR-bench'];
const expectedCounts = new Map([
  ['PixMo_Count', { nodes: 26, edges: 29, secondary: 5 }],
  ['olmOCR-bench', { nodes: 30, edges: 39, secondary: 5 }],
]);
const expectedNodeIds = new Map([
  ['PixMo_Count', [
    'source_evidence', 'web_images', 'detic', 'confidence', 'dominant_class',
    'centers_qa', 'diversity_filter', 'candidate_pool', 'eval_sample',
    'human_verify', 'eval_release', 'train_release', 'fixed_release', 'eval_setup',
    'strategy_gate', 'count_only', 'point_then_count', 'count_then_point',
    'pointing_regex', 'parse_points', 'parse_count', 'accuracy', 'construction_boundary',
    'release_boundary', 'evaluator_boundary', 'license_boundary',
  ]],
  ['olmOCR-bench', [
    'source_evidence', 'benchmark_goal', 'eligibility', 'decontaminate',
    'source_gate', 'arxiv_math', 'old_scans_math', 'tables', 'old_scans',
    'headers_footers', 'multi_column', 'long_tiny_text', 'manual_review',
    'paper_scope', 'fixed_release', 'run_ocr', 'normalize', 'test_gate',
    'baseline', 'presence_absence', 'reading_order', 'table_accuracy',
    'math_formula', 'source_rates', 'macro_score', 'confidence',
    'source_boundary', 'release_boundary', 'evaluator_drift', 'license_boundary',
  ]],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const specPath = (id, language) => join(
  publicDir,
  'drawio',
  id,
  `${id}.${language}.spec.yaml`,
);
const readSpec = (id, language) => parseYaml(readFileSync(specPath(id, language), 'utf8'));

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function graphEdge(graph, from, to) {
  const edge = graph.edges.find(candidate => candidate.from === from && candidate.to === to);
  assert.ok(edge, `missing edge ${from}->${to}`);
  return edge;
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

function edgeKey(from, to, type = 'primary') {
  return `${from}|${to}|${type}`;
}

function assertEdges(graph, expected, context) {
  const actual = new Set(graph.edges.map(edge => edgeKey(edge.from, edge.to, edge.type)));
  assert.equal(actual.size, graph.edges.length, `${context} duplicate edge`);
  const expectedKeys = expected.map(([from, to, type = 'primary']) => edgeKey(from, to, type));
  assert.deepEqual([...actual].sort(), expectedKeys.sort(), `${context} exact edge set`);
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
    lines.push(`    ${edge.from} ${edge.type === 'primary' ? '-->' : '-.->'} ${edge.to}`);
  }
  return lines.join('\n');
}

test('keeps PixMo-Count and olmOCR-Bench bilingual, topology-locked, and dashed-boundary safe', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    for (const graph of [en, zh]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
      assert.equal(graph.nodes.length, expected.nodes, `${id} node count`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      assert.equal(
        graph.edges.filter(edge => edge.type === 'secondary').length,
        expected.secondary,
        `${id} secondary count`,
      );
      assert.ok(graph.nodes.every(node => String(node.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} duplicate edge-label prevention`);
    }

    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.deepEqual(en.nodes.map(node => node.id), expectedNodeIds.get(id), `${id} semantic node order`);
    assert.doesNotMatch(
      readFileSync(specPath(id, 'en'), 'utf8'),
      /[\u3400-\u9fff]/u,
      `${id} English purity`,
    );
    for (const node of en.nodes) {
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 48, `${id}.${node.id} English line width: ${line}`);
      }
    }
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 38, `${id}.${node.id} Chinese line width: ${line}`);
      }
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'primary')) {
      assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} remains primary`);
    }

    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 5_000, `${id} review evidence`);
  }
});

test('locks PixMo-Count detector construction, human filtering, release, and evaluation branches', () => {
  const detail = readDetail('PixMo_Count');
  const en = readSpec('PixMo_Count', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2409.17146v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2409.17146v2');
  assert.equal(
    detail.repository_url,
    'https://github.com/allenai/molmo/tree/793fa387edfd6fd0f5b21eb8e0a7620a1f3799e1',
  );
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/allenai/pixmo-count/tree/ebf51cf70e45d12374e64d475862e4f8d21d31d0',
  );
  assert.equal(detail.homepage, detail.dataset_url);
  assert.match(nodeLabel(en, 'source_evidence'), /2409\.17146v2.*54c5e78b4066.*793fa387edfd.*ebf51cf70e45/isu);
  assert.match(nodeLabel(en, 'web_images'), /Web Images.*Exact source corpus is not disclosed.*Do not import PixMo-Cap/isu);
  assert.match(nodeLabel(en, 'detic'), /Non-VLM Detector.*Detic.*candidate object detections/isu);
  assert.match(nodeLabel(en, 'confidence'), /Strict Confidence Thresholding.*does not publish the threshold/isu);
  assert.match(nodeLabel(en, 'dominant_class'), /class with the most boxes.*one counting target/isu);
  assert.match(nodeLabel(en, 'centers_qa'), /object centers.*image, label, count, and points/isu);
  assert.match(nodeLabel(en, 'diversity_filter'), /Accuracy and Diversity.*Official card.*Exact rules remain unpublished/isu);
  assert.match(nodeLabel(en, 'eval_sample'), /CountBenchQA.*120.*2 through 10/isu);
  assert.match(nodeLabel(en, 'human_verify'), /Manually Verify.*Nine counts.*1,080/isu);
  assert.match(nodeLabel(en, 'eval_release'), /Validation 540.*test 540.*omit points/isu);
  assert.match(nodeLabel(en, 'train_release'), /0 through 10.*about 36k.*36,916/isu);
  assert.match(nodeLabel(en, 'fixed_release'), /36,916.*540.*540.*URL.*SHA-256.*count.*label.*points.*ODC-BY-1\.0.*URLs may repeat/isu);
  assert.match(nodeLabel(en, 'eval_setup'), /Table 1.*test split.*Table 4 PCQA.*validation.*12 crops/isu);
  assert.match(nodeLabel(en, 'count_only'), /80\.2/isu);
  assert.match(nodeLabel(en, 'point_then_count'), /86\.3.*default and best/isu);
  assert.match(nodeLabel(en, 'count_then_point'), /77\.6/isu);
  assert.match(nodeLabel(en, 'pointing_regex'), /Generate Points for Regex Counting.*without a count.*Separate.*text-count parser/isu);
  assert.match(nodeLabel(en, 'parse_points'), /Count Emitted Points by Regex.*paper regex.*coordinates.*Do not invoke PointCountEval.*85\.4/isu);
  assert.match(nodeLabel(en, 'parse_count'), /Branches That Emit a Count.*final integer or word.*a total of N.*correct.*close.*valid.*per-count/isu);
  assert.match(nodeLabel(en, 'accuracy'), /Exact predicted count equals reference.*held-out test.*strategy ablations/isu);
  assert.match(nodeLabel(en, 'construction_boundary'), /checkpoint.*config.*Threshold.*diversity rules.*sampling.*split seed.*unknown/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /36k.*36,916.*points.*absent.*Detic, not Molmo/isu);
  assert.match(nodeLabel(en, 'evaluator_boundary'), /loader, templates, and parser.*does not expose data construction.*VLMEvalKit excludes/isu);
  assertEdges(en, [
    ['source_evidence', 'web_images', 'secondary'],
    ['web_images', 'detic'],
    ['detic', 'confidence'],
    ['confidence', 'dominant_class'],
    ['dominant_class', 'centers_qa'],
    ['centers_qa', 'diversity_filter'],
    ['diversity_filter', 'candidate_pool'],
    ['candidate_pool', 'eval_sample'],
    ['eval_sample', 'human_verify'],
    ['candidate_pool', 'train_release'],
    ['human_verify', 'eval_release'],
    ['eval_release', 'fixed_release'],
    ['train_release', 'fixed_release'],
    ['fixed_release', 'eval_setup'],
    ['eval_setup', 'strategy_gate'],
    ['strategy_gate', 'count_only'],
    ['strategy_gate', 'point_then_count'],
    ['strategy_gate', 'count_then_point'],
    ['strategy_gate', 'pointing_regex'],
    ['count_only', 'parse_count'],
    ['point_then_count', 'parse_count'],
    ['count_then_point', 'parse_count'],
    ['pointing_regex', 'parse_points'],
    ['parse_points', 'accuracy'],
    ['parse_count', 'accuracy'],
    ['confidence', 'construction_boundary', 'secondary'],
    ['fixed_release', 'release_boundary', 'secondary'],
    ['eval_setup', 'evaluator_boundary', 'secondary'],
    ['fixed_release', 'license_boundary', 'secondary'],
  ], 'PixMo_Count');
  assert.match(detail.intro_en, /non-VLM object detector.*strict confidence.*accuracy and diversity.*120.*540 validation.*540 test/isu);
  assert.match(detail.scale_en, /about 36k.*36,916 train.*540 validation.*540 test/isu);
  assert.match(detail.metric_en, /Exact-count Accuracy.*close.*valid.*per-count/isu);
  assert.match(detail.drawio_review_note, /54c5e78b4066eef960af1c108d758311b479879b6ba4215570e1c23f5f55510d/u);
  assert.match(detail.drawio_review_note, /793fa387edfd6fd0f5b21eb8e0a7620a1f3799e1/u);
  assert.match(detail.drawio_review_note, /ebf51cf70e45d12374e64d475862e4f8d21d31d0/u);
  assert.match(detail.drawio_review_note, /91ed6ebcbb1ad47e35efd4e110e9ee29bc68bf9eafd841445c78226c53dd3538/u);
  assert.match(detail.drawio_review_note, /836d61f292c9da863a87ae1cf80c60089a85933f59a961b9d79e3260c3d846d9/u);
  assert.match(detail.drawio_review_note, /does not identify the web-image corpus.*does not disclose the Detic checkpoint/isu);
  assert.match(detail.drawio_review_note, /pointing-plus-regex.*emitted point coordinates.*does not pass.*PointCountEval text-count parsing/isu);
  assert.match(detail.drawio_review_note, /arxiv:2201\.02605 refers to Detic, not the Molmo and PixMo paper/isu);
  assert.match(detail.drawio_review_note, /VLMEvalKit support does not include PixMo-Count/isu);
});

test('locks olmOCR-Bench seven-source construction, unit-test protocol, and later release drift', () => {
  const detail = readDetail('olmOCR-bench');
  const en = readSpec('olmOCR-bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2502.18443v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2502.18443v3');
  assert.equal(
    detail.repository_url,
    'https://github.com/allenai/olmocr/tree/f7cfe4c22098b154c76b6ec950d1c0a464eecf8d',
  );
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/allenai/olmOCR-bench/tree/54a96a6fb6a2bd3b297e59869491db4d3625b711',
  );
  assert.equal(detail.homepage, detail.dataset_url);
  assert.match(nodeLabel(en, 'source_evidence'), /2502\.18443v3.*d006f3f9100a.*f7cfe4c22098.*54a96a6fb6a2/isu);
  assert.match(nodeLabel(en, 'benchmark_goal'), /Deterministic OCR Facts.*text, structure, and order.*Avoid full-reference or LLM judging/isu);
  assert.match(nodeLabel(en, 'eligibility'), /only if both conditions.*PII.*not meant.*public dissemination.*mix PII prompt/isu);
  assert.match(nodeLabel(en, 'decontaminate'), /olmOCR-mix-0225.*PDF URL level/isu);
  assert.match(nodeLabel(en, 'arxiv_math'), /522.*2,927.*Single TeX.*DP alignment.*KaTeX.*review/isu);
  assert.match(nodeLabel(en, 'old_scans_math'), /36.*458.*Internet Archive.*manual formulas/isu);
  assert.match(nodeLabel(en, 'tables'), /188.*1,020.*internal.*Gemini Flash 2\.0.*manual review/isu);
  assert.match(nodeLabel(en, 'old_scans'), /98.*526.*LoC.*transcripts.*order scripts.*second review/isu);
  assert.match(nodeLabel(en, 'headers_footers'), /266.*753.*DocLayout-YOLO.*abandon.*Gemini Flash 2\.0.*manual bounds/isu);
  assert.match(nodeLabel(en, 'multi_column'), /231.*884.*internal.*Claude Sonnet 3\.7 HTML.*manual review/isu);
  assert.match(nodeLabel(en, 'long_tiny_text'), /62.*442.*Internet Archive.*Gemini Flash 2\.0.*manual verification/isu);
  assert.match(nodeLabel(en, 'manual_review'), /Generate and Review Source Tests.*Manual design and review.*GPT-4o prompting.*T=0\.1.*correct facts and relations.*ambiguous or invalid/isu);
  assert.match(nodeLabel(en, 'paper_scope'), /1,403 PDFs.*7,010 core.*721.*823.*1,061.*1,020.*3,385/isu);
  assert.match(nodeLabel(en, 'fixed_release'), /1,403 PDFs.*seven source JSONL.*7,010 core plus 9 explicit baselines.*54a96a6fb6a2/isu);
  assert.match(nodeLabel(en, 'normalize'), /whitespace.*emphasis.*quotes.*hyphens.*ASCII.*NFC/isu);
  assert.match(nodeLabel(en, 'baseline'), /One Baseline per PDF.*alphanumeric.*n-gram repeats over 30.*Chinese.*Japanese.*emoji.*exception/isu);
  assert.match(nodeLabel(en, 'presence_absence'), /721.*823.*Fuzzy.*first or last N.*case-sensitive/isu);
  assert.match(nodeLabel(en, 'reading_order'), /1,061.*before-and-after.*fuzzy.*before position/isu);
  assert.match(nodeLabel(en, 'table_accuracy'), /1,020.*Markdown or HTML.*spans require HTML/isu);
  assert.match(nodeLabel(en, 'math_formula'), /3,385.*KaTeX.*symbols.*relative boxes/isu);
  assert.match(nodeLabel(en, 'source_rates'), /Binary Results by Source.*passes or fails deterministically.*Seven.*Baseline.*eighth/isu);
  assert.match(nodeLabel(en, 'macro_score'), /equal weight.*mean of group rates.*Do not micro-average.*7,010/isu);
  assert.match(nodeLabel(en, 'confidence'), /95 Percent CI.*10,000 bootstraps.*does not state the resampling unit/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /Internal source corpus.*selection seeds.*immutable checkpoints/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /1,402.*1,403.*7,019.*7,010 core plus 9 baselines/isu);
  assert.match(nodeLabel(en, 'evaluator_drift'), /Nine baselines.*source groups.*format and footnote.*Majority.*1,000.*10,000/isu);
  assertEdges(en, [
    ['source_evidence', 'benchmark_goal', 'secondary'],
    ['benchmark_goal', 'eligibility'],
    ['eligibility', 'decontaminate'],
    ['decontaminate', 'source_gate'],
    ['source_gate', 'arxiv_math'],
    ['source_gate', 'old_scans_math'],
    ['source_gate', 'tables'],
    ['source_gate', 'old_scans'],
    ['source_gate', 'headers_footers'],
    ['source_gate', 'multi_column'],
    ['source_gate', 'long_tiny_text'],
    ['arxiv_math', 'manual_review'],
    ['old_scans_math', 'manual_review'],
    ['tables', 'manual_review'],
    ['old_scans', 'manual_review'],
    ['headers_footers', 'manual_review'],
    ['multi_column', 'manual_review'],
    ['long_tiny_text', 'manual_review'],
    ['manual_review', 'paper_scope'],
    ['paper_scope', 'fixed_release'],
    ['fixed_release', 'run_ocr'],
    ['run_ocr', 'normalize'],
    ['normalize', 'test_gate'],
    ['test_gate', 'baseline'],
    ['test_gate', 'presence_absence'],
    ['test_gate', 'reading_order'],
    ['test_gate', 'table_accuracy'],
    ['test_gate', 'math_formula'],
    ['baseline', 'source_rates'],
    ['presence_absence', 'source_rates'],
    ['reading_order', 'source_rates'],
    ['table_accuracy', 'source_rates'],
    ['math_formula', 'source_rates'],
    ['source_rates', 'macro_score'],
    ['macro_score', 'confidence'],
    ['source_gate', 'source_boundary', 'secondary'],
    ['paper_scope', 'release_boundary', 'secondary'],
    ['macro_score', 'evaluator_drift', 'secondary'],
    ['fixed_release', 'license_boundary', 'secondary'],
  ], 'olmOCR-bench');
  const sourceNodes = [
    'arxiv_math', 'old_scans_math', 'tables', 'old_scans',
    'headers_footers', 'multi_column', 'long_tiny_text',
  ];
  const sourceSlots = [0.47, 0.48, 0.49, 0.5, 0.51, 0.52, 0.53];
  sourceNodes.forEach((node, index) => {
    assert.deepEqual(graphEdge(en, 'source_gate', node).style, {
      exitX: 1, exitY: sourceSlots[index], entryX: 0, entryY: 0.5,
    }, `source-gate tip port ${node}`);
    assert.deepEqual(graphEdge(en, node, 'manual_review').style, {
      exitX: 1, exitY: 0.5, entryX: 0, entryY: sourceSlots[index],
    }, `manual-review merge port ${node}`);
  });
  const testNodes = ['baseline', 'presence_absence', 'reading_order', 'table_accuracy', 'math_formula'];
  const testSlots = [0.48, 0.49, 0.5, 0.51, 0.52];
  testNodes.forEach((node, index) => {
    assert.deepEqual(graphEdge(en, 'test_gate', node).style, {
      exitX: 0, exitY: testSlots[index], entryX: 1, entryY: 0.5,
    }, `test-gate tip port ${node}`);
  });
  assert.match(detail.intro_en, /machine-checkable.*1,403 PDFs.*7,010 core.*nine explicit baseline.*equally macro-averages/isu);
  assert.match(detail.scale_en, /1,403 PDFs.*7,010 core.*9 explicit baseline/isu);
  assert.match(detail.metric_en, /Binary.*equal macro-average.*seven document sources plus baseline.*95%/isu);
  assert.match(detail.drawio_review_note, /d006f3f9100afd24e728ab469edd44974c849133121b2a4e53525605b9e44bba/u);
  assert.match(detail.drawio_review_note, /f7cfe4c22098b154c76b6ec950d1c0a464eecf8d/u);
  assert.match(detail.drawio_review_note, /54a96a6fb6a2bd3b297e59869491db4d3625b711/u);
  assert.match(detail.drawio_review_note, /92ce373a5e384628dc2fa8ef30918d3450c44ca89e89dfaea55c9b80e71fbf44/u);
  assert.match(detail.drawio_review_note, /7857eeafeb4bcef911116eb84813fa0a7949d2706c6baf3ee0a9cec706337bc2/u);
  assert.match(detail.drawio_review_note, /exactly 7,019 physical records.*7,010 are the five paper core types.*nine are explicit baseline/isu);
  assert.match(detail.drawio_review_note, /one baseline per 1,403 PDFs.*rather than treating nine as the entire baseline/isu);
  assert.match(detail.drawio_review_note, /nine explicit baselines keep their source JSONL mapping.*synthesized defaults.*separate baseline group/isu);
  assert.match(detail.drawio_review_note, /Section 3\.2.*manual design and review.*GPT-4o prompting.*Appendix F\.2.*temperature 0\.1/isu);
  assert.match(detail.drawio_review_note, /format and footnote test classes.*1,000 bootstrap samples.*10,000/isu);
  assert.match(detail.drawio_review_note, /does not disclose immutable API checkpoints.*identity of the internal PDF repository/isu);
});
