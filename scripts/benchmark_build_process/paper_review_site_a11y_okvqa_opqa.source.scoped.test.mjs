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
const benchmarkIds = ['OK-VQA', 'OPQA'];
const expectedCounts = new Map([
  ['OK-VQA', { nodes: 20, edges: 19 }],
  ['OPQA', { nodes: 11, edges: 10 }],
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

test('keeps the A11y source pair bilingual, catalog-synchronized, and style-safe', () => {
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
    assert.ok(
      zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))),
      `${id} Chinese semantics`,
    );
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks OK-VQA collection counts, filters, evaluation drift, and public-release boundary', () => {
  const detail = readDetail('OK-VQA');
  const en = readSpec('OK-VQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/1906.00067v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/1906.00067v2');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'coco'), /Random COCO Images.*Original 80k Train.*40k Validation.*Train and Test/isu);
  assert.match(nodeLabel(en, 'question_round'), /MTurk Round 1.*Fool a Smart Robot.*Image-related.*Outside Knowledge/isu);
  assert.match(nodeLabel(en, 'answer_round'), /MTurk Round 2.*Five Different Workers.*Open Answers/isu);
  assert.match(nodeLabel(en, 'candidate_pool'), /86,700/isu);
  assert.match(nodeLabel(en, 'manual_review'), /Manual Knowledge Review.*Counting.*Image-independent.*Nonsensical.*Reviewer Protocol Not Disclosed/isu);
  assert.match(nodeLabel(en, 'knowledge_gate'), /34,921/isu);
  assert.match(nodeLabel(en, 'bias_filter'), /Train and Test Separately.*Most-common Answer.*More Than Five/isu);
  assert.match(nodeLabel(en, 'agreement_gate'), /Inter-annotator Agreement/isu);
  assert.match(nodeLabel(en, 'final_split'), /9,009.*5,046.*14,055.*14,031/isu);
  assert.match(nodeLabel(en, 'category_annotation'), /Five MTurk Workers.*Ten Defined Categories.*Plurality.*Other/isu);
  assert.match(nodeLabel(en, 'release'), /v1\.1.*July 29, 2020.*Ten Answer Records.*Five Answers.*Twice/isu);
  assert.match(nodeLabel(en, 'paper_normalization'), /Paper Protocol.*Porter Stemming.*v1\.1 Gold.*Pre-stemmed.*Prediction Not Stemmed/isu);
  assert.match(nodeLabel(en, 'vqa_score'), /Leave-one-out.*min\(1, matches \/ 3\).*Ten Answer Records/isu);
  assert.match(nodeLabel(en, 'report'), /Overall VQA Score.*Knowledge Categories.*Other/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /CC BY 4\.0.*COCO.*a013f004.*Generic VQA Scorer.*Category Partitions/isu);
  assertEdgeTriples(en, [
    ['knowledge_gate', 'bias_filter', 'primary', '34,921 retained'],
    ['knowledge_gate', 'reject_quality', 'primary', 'Does not qualify'],
    ['bias_gate', 'agreement_gate', 'primary', 'At most five'],
    ['bias_gate', 'reject_bias', 'primary', 'More than five'],
    ['agreement_gate', 'final_split', 'primary', 'Some agreement'],
    ['agreement_gate', 'reject_disagreement', 'primary', 'No agreement'],
    ['report', 'source_boundary', 'secondary', 'Fixed implementation boundary'],
  ], 'OK-VQA');
  assert.match(detail.drawio_review_note, /a2dd462304288311644a7ac96516c701eef4065845e80c5bcc8d940976f6ce6b/u);
  assert.match(detail.drawio_review_note, /89efca4f1afaa7cf8b642b223cb39f5adff1e268700c148944a07efff4640ec3/u);
  assert.match(detail.drawio_review_note, /a013f0043c1e2cdc995922dfe257f7149aa9af06/u);
  assert.match(detail.drawio_review_note, /f08edfcad5be0112500993e245c706b6cb928eadebe203f89f838e5e0d04bec8/u);
  assert.match(detail.drawio_review_note, /edbb1a1a36d732fff3419ca81527d3987526a855cbf42f1c665ee28976e5a203/u);
  assert.match(detail.drawio_review_note, /45bb566bd33c738873a1a5dcabd3e0bb6657a0a9b3048786148a0151a5d29df8/u);
  assert.match(detail.drawio_review_note, /five independent answers.*ten answer objects/isu);
  assert.match(detail.drawio_review_note, /generic scorer.*does not apply Porter stemming.*prediction/isu);
  assert.equal(detail.mermaid_flowchart, detail.flowchart_en);
  assert.match(detail.flowchart_en, /Paper Protocol.*Porter Stemming/isu);
  assert.match(detail.flowchart_en, /Prediction Not Stemmed by Fixed Scorer/iu);
  assert.match(detail.flowchart_en, /Generic VQA Scorer/iu);
  assert.match(detail.flowchart_zh, /论文协议.*Porter 词干化.*固定通用评分器不词干化预测/isu);
});

test('locks OPQA disclosed facts and keeps private authoring and grading outside the graph', () => {
  const detail = readDetail('OPQA');
  const en = readSpec('OPQA', 'en');
  const zh = readSpec('OPQA', 'zh');
  const allLabels = en.nodes.map(node => String(node.label)).join('\n');

  assert.equal(detail.paper_url, 'https://deploymentsafety.openai.com/gpt-5/opqa');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2601.03267v2');
  assert.equal(detail.pdf_cdn_url, 'https://cdn.openai.com/gpt-5-system-card.pdf');
  assert.equal(detail.openness, 'in-house');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'internal_bottlenecks'), /OpenAI Research and Engineering.*Real Bottlenecks.*Some Affected Training Runs or Launches/isu);
  assert.match(nodeLabel(en, 'criterion'), /At Least One-day Delay.*Major Project.*Over a Day for a Team/isu);
  assert.equal(en.nodes.find(node => node.id === 'criterion')?.type, 'process');
  assert.deepEqual(
    en.edges.filter(edge => edge.from === 'criterion').map(edge => edge.to),
    ['tasks'],
    'OPQA consequence criteria are disclosed properties, not an invented reject branch',
  );
  assert.doesNotMatch(nodeLabel(en, 'criterion'), /Training Runs|Launches/iu);
  assert.doesNotMatch(nodeLabel(zh, 'criterion'), /训练运行|发布/u);
  assert.match(nodeLabel(en, 'tasks'), /20 Internal Tasks.*In-house/isu);
  assert.match(nodeLabel(en, 'container'), /Container.*Code Access.*Run Artifacts.*Historical Code.*Logs.*Experiment Data/isu);
  assert.match(nodeLabel(en, 'diagnose'), /Unexpected Performance Regressions.*Anomalous Training Metrics.*Subtle Implementation Bugs/isu);
  assert.match(nodeLabel(en, 'grade'), /Each Solution.*pass@1/isu);
  assert.match(nodeLabel(en, 'report'), /gpt-5-thinking.*2%/isu);
  assert.match(nodeLabel(en, 'undisclosed_construction'), /Sampling Frame.*Task Authoring.*Reference Answers.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'undisclosed_grading'), /Grader.*Rubric.*Trial Protocol.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /arXiv:2601\.03267v2.*Section 6\.1\.3\.6.*No Public Task Payload.*Repository.*Leaderboard/isu);
  assertEdgeTriples(en, [
    ['tasks', 'container', 'primary', 'Evaluate internally'],
    ['tasks', 'undisclosed_construction', 'secondary', 'Not disclosed'],
    ['grade', 'undisclosed_grading', 'secondary', 'Not disclosed'],
    ['report', 'source_boundary', 'secondary', 'Source and openness boundary'],
  ], 'OPQA');
  assert.doesNotMatch(allLabels, /human-written prompt|hidden unit test|four tries per instance/iu);
  assert.doesNotMatch(
    [
      allLabels,
      en.nodes.map(node => String(node.label)).join('\n'),
      zh.nodes.map(node => String(node.label)).join('\n'),
      detail.mermaid_flowchart,
      detail.flowchart_en,
      detail.flowchart_zh,
      detail.drawio_review_note,
    ].join('\n'),
    /one[- ](?:solution|attempt|outcome)|single[- ](?:solution|attempt|outcome)|一次解答|单次解答|一次独立尝试|每题一个结果/iu,
  );
  assert.match(detail.drawio_review_note, /d40d91ae00d744f6f4d981750c8bd14be1bb217b236afe3b464e77405204b277/u);
  assert.match(detail.drawio_review_note, /f422231814f299358c9fa813abde70a7b883e28cdb21b051130b680fdbf97bd6/u);
  assert.match(detail.drawio_review_note, /f9f9c72d08cba81dcbb189129119357c8c32eca4e0b16c813aca386aed6b0459/u);
  assert.match(detail.drawio_review_note, /section number moved from 5\.1\.3\.6 to 6\.1\.3\.6/isu);
  assert.match(detail.drawio_review_note, /does not disclose.*sampling.*authoring.*reference answers.*grader.*trial/isu);
});
