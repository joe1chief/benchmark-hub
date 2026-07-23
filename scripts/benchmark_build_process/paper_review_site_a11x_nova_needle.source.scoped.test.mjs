import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['NOVA-63', 'NeedleBench_V2'];
const expectedCounts = new Map([
  ['NOVA-63', { nodes: 30, edges: 32 }],
  ['NeedleBench_V2', { nodes: 23, edges: 24 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'build_method',
  'metric',
  'openness',
  'intro_en',
  'build_method_en',
  'metric_en',
  'openness_en',
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

test('keeps the A11x source pair bilingual, catalog-synchronized, and style-safe', () => {
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
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks NOVA-63 paper counts, filtering decisions, supplementation, evaluation, and release drift', () => {
  const detail = readDetail('NOVA-63');
  const en = readSpec('NOVA-63', 'en');
  const zh = readSpec('NOVA-63', 'zh');

  assert.equal(detail.paper_url, 'https://aclanthology.org/2025.emnlp-main.364/');
  assert.equal(detail.arxiv_pdf_url, 'https://aclanthology.org/2025.emnlp-main.364.pdf');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.openness_en, 'Partly Public');
  assert.match(en.meta.legend, /Dashed arrows are sample audits, model-panel inputs, or publication\/release boundaries/u);
  assert.match(zh.meta.legend, /虚线表示抽样审计、模型组输入或发布边界/u);
  assert.match(nodeLabel(en, 'native_sources'), /Native Speakers.*Educational Sites.*Publications.*Exams.*Secondary School.*Postgraduate/isu);
  assert.match(nodeLabel(en, 'format'), /In-context.*Question.*Options.*Answer.*MCQ.*QA.*HTML/isu);
  assert.match(nodeLabel(en, 'extraction_review'), /Sample-based Human.*Multimedia.*Completeness.*Not a Per-item Human Gate/isu);
  assert.match(nodeLabel(en, 'quality_filter'), /Readability 1–3.*Completeness 0–1.*Clarity.*1–3.*Reasons/isu);
  assert.match(nodeLabel(en, 'quality_gate'), /Maximum.*Readability 3.*Completeness 1.*Clarity.*3/isu);
  assert.match(nodeLabel(en, 'classify'), /13 Primary.*63 Secondary.*262 Tertiary.*Recitation.*Reasoning/isu);
  assert.match(nodeLabel(en, 'model_panel'), /Small ≤14B.*Large >14B.*Zero-shot.*Seed 42.*Temperature 0/isu);
  assert.match(nodeLabel(en, 'difficulty_gate'), /Large-model Accuracy.*Below 50%/isu);
  assert.match(nodeLabel(en, 'abnormal_gate'), /Small > Large.*Concentrated Wrong Option.*Native Expert Review/isu);
  assert.match(nodeLabel(en, 'discard_abnormal'), /Appendix Threshold Rules.*Native Review Finds an Error/isu);
  assert.match(nodeLabel(en, 'qa_conversion'), /Model Answers.*Distractors.*2,425 Converted Questions/isu);
  assert.match(nodeLabel(en, 'conversion_rescreen'), /Quality and Difficulty.*Every Conversion.*Translationese/isu);
  assert.match(nodeLabel(en, 'interdisciplinary'), /Smaller Pool.*Balance Secondary Disciplines/isu);
  assert.match(nodeLabel(en, 'balance'), /At Least 50.*150.*Randomly Sample/isu);
  assert.match(nodeLabel(en, 'release'), /89,107.*14 Languages.*Eight Families.*63 Secondary/isu);
  assert.match(nodeLabel(en, 'evaluate'), /62 LLMs.*Zero-shot.*Five-shot/isu);
  assert.match(nodeLabel(en, 'score'), /Question.*Secondary.*Primary.*Primary-discipline Mean/isu);
  assert.match(nodeLabel(en, 'publication_boundary'), /89,107.*93,536.*7bfc985.*README Only.*Under Review/isu);
  assertEdgeTriples(en, [
    ['format', 'extraction_gate', 'primary', ''],
    ['format', 'extraction_review', 'secondary', 'Sample audit'],
    ['quality_gate', 'classify', 'primary', 'Full scores'],
    ['quality_gate', 'discard_quality', 'primary', 'Any deficit'],
    ['difficulty_gate', 'abnormal_gate', 'primary', 'Below 50%'],
    ['difficulty_gate', 'discard_easy', 'primary', '50% or higher'],
    ['abnormal_gate', 'manual_validation', 'primary', 'Flagged'],
    ['validation_gate', 'selected_pool', 'primary', 'No'],
    ['validation_gate', 'discard_abnormal', 'primary', 'Yes'],
    ['release', 'publication_boundary', 'secondary', 'Release evidence'],
  ], 'NOVA-63');
  assert.match(detail.drawio_review_note, /630e3ad32d57a33b3ff7483befab46a8e68564811df24adbd7716615d5a8df77/u);
  assert.match(detail.drawio_review_note, /Small-model accuracy above 1\.2 times large-model accuracy/iu);
  assert.match(detail.drawio_review_note, /total correctness below 30%.*incorrect option.*more than 50%/isu);
  assert.match(detail.drawio_review_note, /7bfc98546474aeabddee1f6fdfe1091a28bddbb0/u);
  assert.match(detail.drawio_review_note, /sample-based human audit.*not a per-item human gate/isu);
  assert.match(detail.drawio_review_note, /readability.*1–3.*completeness.*0–1.*clarity.*1–3.*3\/1\/3/isu);
  assert.match(detail.drawio_review_note, /Figure 2.*13\/73\/286.*body\/appendix.*13\/63\/262/isu);
});

test('locks NeedleBench V2 sparse and ATC construction, parsers, metrics, and source boundary', () => {
  const detail = readDetail('NeedleBench_V2');
  const en = readSpec('NeedleBench_V2', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2407.11963v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2407.11963v3');
  assert.equal(detail.openness, 'public');
  assert.equal(
    detail.metric,
    'S-RT/M-RT 采用关键词感知匹配；M-RS 论文为 boxed+关键词匹配、固定代码为 boxed 清洗+严格相等；论文定义 ATC 加权准确率与 ENL-50，固定 V2 仅逐针数精确分数',
  );
  assert.equal(
    detail.metric_en,
    'S-RT/M-RT use keyword-aware match; M-RS uses paper boxed+keyword-aware versus fixed-code boxed cleanup+exact equality; paper-defined ATC weighted accuracy and ENL-50, fixed V2 per-N exact scores only',
  );
  assert.match(nodeLabel(en, 'synthetic'), /Fictional Facts.*Kinship Relations.*Random Names.*Avoid Real-world.*Pretraining/isu);
  assert.match(nodeLabel(en, 'haystacks'), /Paul Graham Essays.*Chinese.*Domain Modeling Evaluation.*Sparse Tasks/isu);
  assert.match(nodeLabel(en, 'sparse_tasks'), /S-RT.*One Fact.*M-RT.*Multiple Facts.*M-RS.*Two to Five/isu);
  assert.match(nodeLabel(en, 'sparse_configs'), /4k.*8k.*32k.*128k.*200k.*256k.*1,000k.*GPT-4 Tokenizer.*R=10/isu);
  assert.match(nodeLabel(en, 'retrieval_score'), /S-RT and M-RT.*Keyword-aware Exact Match.*Any Core Keyword/isu);
  assert.match(nodeLabel(en, 'reasoning_score'), /M-RS.*Paper.*boxed.*Keyword-aware EM.*Fixed.*Exact Equality.*Scoring Drift/isu);
  assert.match(nodeLabel(en, 'sparse_average'), /Equal Mean.*S-RT.*M-RT.*M-RS.*Replaces Earlier Weighted/isu);
  assert.match(nodeLabel(en, 'atc_names'), /n\+1 Unique Names.*Sequential Family Chain.*Programmatic/isu);
  assert.match(nodeLabel(en, 'atc_relations'), /n Relationship Statements.*Weight 1 or 2.*Generation Distance/isu);
  assert.match(nodeLabel(en, 'atc_shuffle'), /Shuffle.*Continuous Context.*Every Sentence Is Relevant/isu);
  assert.match(nodeLabel(en, 'atc_questions'), /Eldest Ancestor.*N-th Ancestor.*N-th Descendant.*Relation Distance/isu);
  assert.match(nodeLabel(en, 'atc_scale'), /2.*4.*8.*16.*32.*64.*128.*256.*512.*R=10/isu);
  assert.match(nodeLabel(en, 'atc_parser'), /Extract boxed Answer Only.*LaTeX.*Slashes.*Quotes.*Tildes.*None/isu);
  assert.match(nodeLabel(en, 'atc_accuracy'), /Trim Prediction.*Exact String Equality.*Each Needle Count/isu);
  assert.match(nodeLabel(en, 'atc_metrics'), /Paper-defined.*Needle-weighted Accuracy.*ENL-50.*≥50%.*Fixed V2.*Per-N Exact Scores Only/isu);
  assert.match(nodeLabel(en, 'report'), /Sparse and ATC Results Separate/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /ae3779.*34da831.*Apache-2\.0.*Payload Not in Git/isu);
  assertEdgeTriples(en, [
    ['density_gate', 'sparse_tasks', 'primary', 'Information-sparse'],
    ['density_gate', 'atc_names', 'primary', 'Information-dense'],
    ['haystacks', 'sparse_insert', 'secondary', 'Filler only'],
    ['sparse_parser_gate', 'retrieval_score', 'primary', 'S-RT or M-RT'],
    ['sparse_parser_gate', 'reasoning_score', 'primary', 'M-RS'],
    ['sparse_average', 'report', 'primary', 'Sparse branch'],
    ['atc_metrics', 'report', 'primary', 'Dense branch'],
    ['report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'NeedleBench_V2');
  assert.match(detail.drawio_review_note, /ae377912652f19703f25b3bd5eaab80bb844fcfe9ce9f1b4428588e8177245d0/u);
  assert.match(detail.drawio_review_note, /34da831f41494ebc3ece902fc9200dbba696a93e/u);
  assert.match(detail.drawio_review_note, /opencompass\/needlebench data payload.*not tracked in the Git tree/isu);
  assert.match(detail.drawio_review_note, /paper.*M-RS.*keyword-aware.*fixed V2 config.*boxed cleanup.*exact string equality/isu);
  assert.match(detail.drawio_review_note, /Equation 4.*paper-defined.*fixed V2 configs.*per-needle-count exact scores.*no.*aggregator/isu);
});
