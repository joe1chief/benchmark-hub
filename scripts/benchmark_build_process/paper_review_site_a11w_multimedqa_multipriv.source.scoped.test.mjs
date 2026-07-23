import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MultiMedQA', 'MultiPriv'];
const expectedCounts = new Map([
  ['MultiMedQA', { nodes: 18, edges: 20 }],
  ['MultiPriv', { nodes: 20, edges: 23 }],
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

function assertEdge(graph, from, to, type) {
  const edge = graph.edges.find(candidate => (
    candidate.from === from
    && candidate.to === to
    && candidate.type === type
  ));
  assert.ok(edge, `missing edge ${from}|${to}|${type}`);
  return edge;
}

test('keeps MultiMedQA and MultiPriv source diagrams bilingual, dashed at evidence boundaries, and catalog-synchronized', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.find(candidate => candidate.id === id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    assert.ok(summary, `${id} catalog entry`);
    assert.deepEqual(summary, detail, `${id} full catalog sync`);
    for (const graph of [en, zh]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
      assert.equal(graph.nodes.length, expected.nodes, `${id} node count`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      for (const edge of graph.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} dashed`);
      }
    }
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.doesNotMatch(
      en.nodes.map(node => node.label).join('\n'),
      /[\u3400-\u9fff]/u,
      `${id} English purity`,
    );
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
  }
});

test('locks MultiMedQA Nature-version construction, evaluation branches, release artifact, and arXiv-v1 divergence', () => {
  const detail = readDetail('MultiMedQA');
  const en = readSpec('MultiMedQA', 'en');

  assert.equal(detail.paper_url, 'https://www.nature.com/articles/s41586-023-06291-2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2212.13138v1');
  assert.equal(detail.pdf_cdn_url, 'https://www.nature.com/articles/s41586-023-06291-2.pdf');
  assert.equal(
    detail.homepage,
    'https://research.google/pubs/large-language-models-encode-clinical-knowledge/',
  );
  assert.equal(detail.openness, 'partly public');
  assert.match(detail.scale_en, /3,173 HealthSearchQA.*140-question/isu);
  assert.match(nodeLabel(en, 'existing_inventory'), /MedQA.*MedMCQA.*PubMedQA.*Six MMLU Clinical Topics.*LiveQA.*MedicationQA/isu);
  assert.match(nodeLabel(en, 'search_suggestions'), /Public Search Suggestions.*Seed Medical Conditions and Symptoms/isu);
  assert.match(nodeLabel(en, 'health_release'), /3,173 Question Rows.*3,156 Unique Strings.*17 Duplicate Rows/isu);
  assert.match(nodeLabel(en, 'suite'), /Seven English Datasets.*Multiple-choice.*Long-form.*Open and Closed Domain/isu);
  assert.match(nodeLabel(en, 'legacy_reference_boundary'), /Legacy Explanations.*Not Used as Ground Truth.*Inconsistent Sources/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /Nature Supplement.*CC BY 4\.0.*Source-dataset Terms Vary.*Med-PaLM Code and Weights Withheld/isu);
  assert.match(nodeLabel(en, 'mcq_tasks'), /MedQA.*MedMCQA.*PubMedQA.*MMLU Clinical Topics/isu);
  assert.match(nodeLabel(en, 'prompting'), /Few-shot.*Chain-of-thought.*11 Decodes.*Three Datasets/isu);
  assert.match(nodeLabel(en, 'long_sample'), /100 HealthSearchQA.*20 LiveQA.*20 MedicationQA.*Disjoint from Tuning Exemplars/isu);
  assert.match(nodeLabel(en, 'response_sets'), /Clinician Reference Answers.*Flan-PaLM 540B.*Med-PaLM 540B/isu);
  assert.match(nodeLabel(en, 'clinician_eval'), /Different Clinician Panel.*Source Blinded.*One Clinician per Answer.*Nine Clinicians/isu);
  assert.match(nodeLabel(en, 'lay_eval'), /Five Non-expert Raters.*India.*Intent.*Helpfulness/isu);
  assert.match(nodeLabel(en, 'report'), /1,000 Bootstrap Replicas.*95% Percentile Intervals/isu);
  assertEdge(en, 'suite', 'legacy_reference_boundary', 'secondary');
  assertEdge(en, 'suite', 'source_boundary', 'secondary');
  assert.match(detail.drawio_review_note, /969d7f5ae18a244a4fc156914e6200c4962fac11132ac6a9a2518ae58e4741d4/u);
  assert.match(detail.drawio_review_note, /feaffa009f732a9baa297950f4babd7d8955c411405714fd66d539f8997db0ba/u);
  assert.match(detail.drawio_review_note, /a89f6639ee76717e2a1ea25bbe25c8c69cf396681be76fd8145da7e9c8917e1e/u);
  assert.match(detail.drawio_review_note, /arXiv v1.*3,375.*100 bootstrap.*Nature.*3,173.*1,000 bootstrap/isu);
  assert.match(detail.drawio_review_note, /3,173 non-empty.*3,156 unique.*17 duplicated/isu);
});

test('locks MultiPriv v3 taxonomy, two construction branches, nine tasks, output verification, metrics, and partial-release boundary', () => {
  const detail = readDetail('MultiPriv');
  const en = readSpec('MultiPriv', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2511.16940v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2511.16940v3');
  assert.equal(detail.pdf_cdn_url, 'https://arxiv.org/pdf/2511.16940v3');
  assert.equal(
    detail.homepage,
    'https://github.com/CyberChangAn/MultiPriv-PII/tree/3fc53f39cc96c78de05e847dedcf453174994170',
  );
  assert.equal(detail.openness, 'partly public');
  assert.match(detail.scale_en, /Paper: 1,119 images.*7,414.*40.*snapshot: 663 images.*30 profiles/isu);
  assert.match(nodeLabel(en, 'goal'), /Visual and Cross-modal Privacy.*Identity Linkage.*Text-only Leakage Is Out of Scope/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /GDPR and CCPA.*Seven Categories.*36 Attributes.*Exclude Ambiguous/isu);
  assert.match(nodeLabel(en, 'attribute_sources'), /Filter Public Sources.*Augment with Synthesized Instances.*1,119 Images/isu);
  assert.match(nodeLabel(en, 'source_rights'), /Mixed Upstream Rights.*No License.*All Rights Reserved.*Custom Non-commercial.*Some Attribute Images Are Link-only/isu);
  assert.match(nodeLabel(en, 'attribute_synthesis'), /About 18%.*Doubao.*2% Fingerprints.*11% Identity Cards.*5% Medical.*2% Shopping/isu);
  assert.match(nodeLabel(en, 'profile_seed'), /40 Fully Synthetic Individuals.*Textual Profile.*JSON/isu);
  assert.match(nodeLabel(en, 'profile_media'), /Ten Images per Individual.*Doubao.*Photoshop/isu);
  assert.match(nodeLabel(en, 'perception_tasks'), /Direct Identifier.*Indirect Identifier.*Information Extraction.*Region Localization/isu);
  assert.match(nodeLabel(en, 'reasoning_tasks'), /Cross-validation.*Single-step Reasoning.*Chained Reasoning.*Re-identification.*Cross-modal Association/isu);
  assert.match(nodeLabel(en, 'benchmark'), /1,119 Images.*7,414 Manually Designed VQA Pairs.*Nine Tasks.*Chinese and English/isu);
  assert.match(nodeLabel(en, 'release_gap'), /GitHub 3fc53f39.*HF a364b842.*CC BY-NC-SA 4\.0.*30 Profiles.*663 Images.*VQA and Evaluator Absent/isu);
  assert.match(nodeLabel(en, 'deterministic'), /93%.*Deterministic Rule Matching/isu);
  assert.match(nodeLabel(en, 'hybrid'), /7%.*Qwen2\.5-72B-Instruct.*Human Review.*0\.96.*0\.92.*0\.84/isu);
  assert.match(nodeLabel(en, 'evaluate'), /More than 50 VLMs.*Original Prompts.*No Explicit CoT.*Temperature 0/isu);
  assert.match(nodeLabel(en, 'metrics'), /F1.*IEA Exact Match.*mIoU.*Accuracy.*Completion Percentage/isu);
  assert.match(nodeLabel(en, 'refusal'), /Incorrect and Refusal.*Task Failures.*Not Successful Privacy Extraction.*Report Refusal Rates Separately/isu);
  assertEdge(en, 'attribute_sources', 'source_rights', 'secondary');
  assertEdge(en, 'benchmark', 'release_gap', 'secondary');
  assertEdge(en, 'reasoning_tasks', 'benchmark', 'primary');
  assertEdge(en, 'reasoning_tasks', 'chained_guideline', 'primary');
  assertEdge(en, 'chained_guideline', 'benchmark', 'primary');
  assertEdge(en, 'benchmark', 'evaluate', 'primary');
  assertEdge(en, 'evaluate', 'verification_gate', 'primary');
  assertEdge(en, 'verification_gate', 'deterministic', 'primary');
  assertEdge(en, 'verification_gate', 'hybrid', 'primary');
  assertEdge(en, 'deterministic', 'metrics', 'primary');
  assertEdge(en, 'hybrid', 'metrics', 'primary');
  assertEdge(en, 'evaluate', 'refusal', 'primary');
  assert.match(detail.drawio_review_note, /509ee52ad68517eb1e639d881e08659cf285f74c8bf163f025c532bccab1c6f8/u);
  assert.match(detail.drawio_review_note, /3fc53f39cc96c78de05e847dedcf453174994170/u);
  assert.match(detail.drawio_review_note, /a364b8428c2d3de797be557e5a8a694e0c1f934b/u);
  assert.match(detail.drawio_review_note, /353 public attribute-level images.*300 individual-level images.*10 mobile-agent images.*663 images/isu);
  assert.match(detail.drawio_review_note, /approximately 18%.*2%.*11%.*5%.*2%.*paper does not reconcile/isu);
});
