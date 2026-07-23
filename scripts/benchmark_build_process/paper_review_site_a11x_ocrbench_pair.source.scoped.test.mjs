import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['OCRBench', 'OCRBench_v2'];
const expectedCounts = new Map([
  ['OCRBench', { nodes: 20, edges: 23 }],
  ['OCRBench_v2', { nodes: 21, edges: 24 }],
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

test('keeps the OCRBench pair bilingual, synchronized, and style-safe at source stage', () => {
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
  }
});

test('locks OCRBench broad-study boundary, compact quotas, released scorer, and provenance', () => {
  const detail = readDetail('OCRBench');
  const en = readSpec('OCRBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2305.07895v7');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2305.07895v7');
  assert.equal(detail.homepage, 'https://github.com/Yuliang-Liu/MultimodalOCR');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'study_sources'), /29 OCR-related Public Datasets.*Recognition.*VQA.*KIE.*HMER/isu);
  assert.match(nodeLabel(en, 'semantic_controls'), /IIIT5K Dictionary.*ST: 3,000.*NST: Shuffle/isu);
  assert.match(nodeLabel(en, 'broad_filter'), /FullTest Study Pool.*under Four Symbols.*3,000.*Do Not Infer/isu);
  assert.match(nodeLabel(en, 'broad_study'), /29-dataset Study.*FullTest JSON.*Tables 1–2.*Distinct/isu);
  assert.match(nodeLabel(en, 'compact_contract'), /Fixed Quotas.*1,000.*Item-selection Algorithm Not Reported/isu);
  assert.match(nodeLabel(en, 'recognition'), /300.*Regular.*Irregular.*Artistic.*Handwriting.*Digit String.*NST.*Six Types × 50/isu);
  assert.match(nodeLabel(en, 'scene_vqa'), /200.*STVQA.*TextVQA.*ESTVQA English.*OCRVQA.*Four Sources × 50/isu);
  assert.match(nodeLabel(en, 'doc_vqa'), /200.*DocVQA.*ChartQA Augmented.*ChartQA Human.*InfographicVQA/isu);
  assert.match(nodeLabel(en, 'kie'), /200.*SROIE 67.*FUNSD 66.*POIE 67.*Alternative Gold/isu);
  assert.match(nodeLabel(en, 'hmer'), /100.*HME100K.*Mathematical Expressions.*LaTeX/isu);
  assert.match(nodeLabel(en, 'prompting'), /Task-specific.*English.*Chinese.*Digit.*Direct-text.*LaTeX/isu);
  assert.match(nodeLabel(en, 'verify'), /All 1,000.*Correct Inaccurate Answers.*Alternative Correct Candidates/isu);
  assert.match(nodeLabel(en, 'release'), /JSON Fields.*Public 1,000-row HF/isu);
  assert.match(nodeLabel(en, 'normalize'), /Non-HMER: Lowercase.*HMER: Remove Spaces.*Alternative Gold/isu);
  assert.match(nodeLabel(en, 'containment'), /Released Binary Row Score.*Normalized Gold.*Prediction Substring.*1.*Otherwise.*0/isu);
  assert.equal(en.nodes.find(node => node.id === 'containment')?.type, 'process');
  assert.match(nodeLabel(en, 'score'), /Recognition 300.*Scene VQA 200.*Document VQA 200.*KIE 200.*HMER 100.*0–1,000/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /4cc667.*86d091.*df7595.*92a54b.*Short Gold.*Upstream/isu);
  assertEdgeTriples(en, [
    ['artifact_gate', 'semantic_controls', 'secondary', 'Broad study'],
    ['artifact_gate', 'compact_contract', 'primary', ''],
    ['component_gate', 'recognition', 'primary', '300'],
    ['component_gate', 'scene_vqa', 'primary', '200'],
    ['component_gate', 'doc_vqa', 'primary', '200'],
    ['component_gate', 'kie', 'primary', '200'],
    ['component_gate', 'hmer', 'primary', '100'],
    ['containment', 'score', 'primary', ''],
    ['score', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'OCRBench');
  const broadStudyEdge = en.edges.find(
    edge => edge.from === 'artifact_gate' && edge.to === 'semantic_controls',
  );
  assert.deepEqual(
    {
      exitX: broadStudyEdge?.style?.exitX,
      exitY: broadStudyEdge?.style?.exitY,
      entryX: broadStudyEdge?.style?.entryX,
      entryY: broadStudyEdge?.style?.entryY,
    },
    { exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 },
    'OCRBench broad-study edge must route from the decision top to the semantic-control bottom',
  );
  assert.match(detail.drawio_review_note, /4cc667c0bb143e5c854c6d6889194999a3bb841943a888d1ff6684d980d76b42/u);
  assert.match(detail.drawio_review_note, /86d091f0e3cadd97e98f77ef9f5ecf7e392452c5/u);
  assert.match(detail.drawio_review_note, /df75957e75ea052e9f38f2c67a4f6676103998517345cf49ef7d03b62c835864/u);
  assert.match(detail.drawio_review_note, /92a54bd1384387c178d5a07140a2d85e0a3d12e1/u);
  assert.match(detail.drawio_review_note, /six rows.*two rows/isu);
  assert.match(detail.drawio_review_note, /FullTest.*does not publish.*mapping.*compact item.*does not misrepresent.*filter.*compact-release gate/isu);
  assert.match(detail.drawio_review_note, /70194609de34d25e89b9c3b397e854729027d28b8a28d25670cdcf90a6f738cf/u);
  assert.match(detail.drawio_review_note, /model-integration template rather than a paper-wide generation configuration/iu);
  assert.match(detail.drawio_review_note, /MIT.*upstream/isu);
});

test('locks OCRBench v2 collection, annotation, release split, language scorers, and conflicts', () => {
  const detail = readDetail('OCRBench_v2');
  const en = readSpec('OCRBench_v2', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2501.00321v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2501.00321v2');
  assert.equal(detail.homepage, 'https://github.com/Yuliang-Liu/MultimodalOCR');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'scope'), /Single-image.*No Multi-page.*Bilingual Coverage Varies/isu);
  assert.match(nodeLabel(en, 'collect'), /81 Datasets.*Academic.*Self-annotated.*Private.*31/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /23 Tasks.*8 Capabilities.*Recognition.*Referring.*Spotting.*Extraction.*Parsing.*Calculation.*Understanding.*Reasoning/isu);
  assert.match(nodeLabel(en, 'guidelines'), /Number and Answer Variants.*Left-to-right.*Top-to-bottom.*0–1,000/isu);
  assert.match(nodeLabel(en, 'annotate'), /15 Professional Annotators.*Instruction–Response.*Coordinates.*Markdown.*HTML.*JSON.*LaTeX/isu);
  assert.match(nodeLabel(en, 'review'), /Annotator 1.*Annotator 2.*Annotator 3.*Exclude No-consensus.*1%/isu);
  assert.match(nodeLabel(en, 'public'), /10,000.*9,500.*7,400.*2,600.*c7e7cdf/isu);
  assert.match(nodeLabel(en, 'private_collect'), /1,500.*735.*765.*Books.*E-books.*Scans.*Web.*23-task/isu);
  assert.match(nodeLabel(en, 'private_annotate'), /Final Paper Says.*Not Released/isu);
  assert.match(nodeLabel(en, 'evaluate'), /predict.*Task-specific.*eval\.py/isu);
  assert.match(nodeLabel(en, 'structured_metrics'), /TEDS.*STEDS.*F1.*Formula/isu);
  assert.match(nodeLabel(en, 'spatial_reading_metrics'), /IoU.*½ Content.*½ IoU.*ICDAR Hmean.*0\.5.*BLEU.*METEOR.*F1.*1−NED/isu);
  assert.match(nodeLabel(en, 'count_vqa_metrics'), /Character Count.*Exact.*Word Count.*Normalized L1.*Multiple Choice.*Containment.*ANLS/isu);
  assert.match(nodeLabel(en, 'task_means'), /Aggregate by Capability.*Mean Item Scores per Capability.*21 Tasks.*8 Capabilities.*9 Tasks.*5 Capabilities.*Task Means.*Diagnostics Only/isu);
  assert.match(nodeLabel(en, 'en_macro'), /8 Capability.*Recognition.*Referring.*Spotting.*Extraction.*Parsing.*Calculation.*Understanding.*Reasoning.*0–100/isu);
  assert.match(nodeLabel(en, 'cn_macro'), /5 Capability.*Recognition.*Extraction.*Parsing.*Understanding.*Reasoning.*No Chinese Mean.*Referring.*Spotting.*Calculation/isu);
  assert.match(nodeLabel(en, 'report'), /English and Chinese Separately.*No Released Single Bilingual/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /2fd3db.*8f4980.*86d091.*c7e7cdf.*10,000.*Paper Withheld.*News Released.*MIT.*Research-only/isu);
  assertEdgeTriples(en, [
    ['guidelines', 'release_gate', 'primary', ''],
    ['release_gate', 'annotate', 'primary', 'Public'],
    ['review', 'public', 'primary', ''],
    ['release_gate', 'private_collect', 'primary', 'Private'],
    ['public', 'evaluate', 'primary', 'Public rows'],
    ['private_annotate', 'evaluate', 'primary', 'Withheld rows'],
    ['metric_gate', 'structured_metrics', 'primary', 'Structure/F1'],
    ['metric_gate', 'spatial_reading_metrics', 'primary', ''],
    ['metric_gate', 'count_vqa_metrics', 'primary', 'Count/VQA'],
    ['language_gate', 'en_macro', 'primary', 'English'],
    ['language_gate', 'cn_macro', 'primary', 'Chinese'],
    ['report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'OCRBench_v2');
  assert.equal(
    en.edges.some(edge => edge.from === 'review' && edge.to === 'release_gate'),
    false,
    'OCRBench_v2 private collection must not follow public review',
  );
  assert.match(detail.intro_en, /separately collected and annotated.*1,500 private images/isu);
  assert.match(detail.drawio_review_note, /2fd3db64a11f51e1892156ccdf14a638c51cf503549be7196a8d77f400600bf2/u);
  assert.match(detail.drawio_review_note, /8f4980952029512c53578166f1cf39ad8e6d88203cc1854646ce850b79efac42/u);
  assert.match(detail.drawio_review_note, /86d091f0e3cadd97e98f77ef9f5ecf7e392452c5/u);
  assert.match(detail.drawio_review_note, /c7e7cdf23bdb6774661e9b0caf0d9935a42feb8b/u);
  assert.match(detail.drawio_review_note, /982ac76e74994e64f5c5f29b2b659ce56d9a9015/u);
  assert.match(detail.drawio_review_note, /will not be released.*repository news.*released on 2025-06-21/isu);
  assert.match(detail.drawio_review_note, /MIT.*research-only.*commercial/isu);
  assert.match(detail.drawio_review_note, /get_score\.py first averages item scores within each represented capability.*unweighted macro-average/isu);
  assert.match(detail.drawio_review_note, /English.*eight.*Chinese.*five.*not one combined/isu);
});
