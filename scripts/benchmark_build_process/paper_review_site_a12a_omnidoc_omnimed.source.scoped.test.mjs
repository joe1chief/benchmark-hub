import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['OmniDocBench', 'OmniMedVQA'];
const expectedCounts = new Map([
  ['OmniDocBench', { nodes: 26, edges: 28 }],
  ['OmniMedVQA', { nodes: 22, edges: 22 }],
]);
const expectedGroups = new Map([
  ['OmniDocBench', {
    construction: [
      'evidence', 'paper_scope', 'sources', 'cluster', 'candidates', 'attributes', 'balance', 'preannotate',
      'layout', 'relations', 'content', 'human', 'qc', 'paper_release', 'published_snapshot',
    ],
    evaluation: [
      'normalize', 'extract', 'match', 'ignore', 'task_gate', 'recognition_metrics', 'formula_order_metrics',
      'detection_metrics', 'report',
    ],
    boundary: ['drift_boundary', 'license_boundary'],
  }],
  ['OmniMedVQA', {
    construction: [
      'evidence', 'scope', 'inventory', 'coverage', 'templates', 'balance', 'types', 'rewrite', 'options', 'qc',
      'paper_release', 'hf_package',
    ],
    evaluation: ['eval_scope', 'prompt', 'score_gate', 'qa_score', 'prefix_score', 'ground_truth', 'report'],
    boundary: ['access_boundary', 'snapshot_boundary', 'code_boundary'],
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

test('keeps OmniDocBench and OmniMedVQA bilingual, topology-locked, and source-stage safe', () => {
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
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
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

test('locks OmniDocBench paper construction, v1.7 release drift, evaluation, and openness', () => {
  const detail = readDetail('OmniDocBench');
  const en = readSpec('OmniDocBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2412.07626v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2412.07626v2');
  assert.equal(
    detail.homepage,
    'https://github.com/opendatalab/OmniDocBench/tree/2b161d010d2e3aff77a0edef359ea3a6411d23cd',
  );
  assert.equal(detail.openness, 'partly public, research-only dataset; Apache-2.0 code');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v2.*2160acf35586.*v1\.0.*337cc2696589.*main.*2b161d010d2e.*HF aa1ee96d106d/isu);
  assert.match(nodeLabel(en, 'paper_scope'), /981 Pages.*Nine Document Sources.*19 Layout Categories.*15 Attribute Labels.*End-to-end.*Task.*Attribute/isu);
  assert.match(nodeLabel(en, 'sources'), /200,000 PDFs.*Common Crawl.*Google.*Baidu.*Internal/isu);
  assert.match(nodeLabel(en, 'cluster'), /ResNet-50.*Faiss.*Ten Cluster Centers/isu);
  assert.match(nodeLabel(en, 'candidates'), /6,000 Candidate Pages/isu);
  assert.match(nodeLabel(en, 'preannotate'), /LayoutLMv3.*PaddleOCR.*UniMERNet.*GPT-4o/isu);
  assert.match(nodeLabel(en, 'layout'), /15 Block Categories.*Four Span Categories/isu);
  assert.match(nodeLabel(en, 'human'), /Tables Generator.*latexlive/isu);
  assert.match(nodeLabel(en, 'qc'), /CDM.*Three Researchers/isu);
  assert.match(nodeLabel(en, 'paper_release'), /981 Pages.*Nine Sources.*100,000.*19 Layout.*15 Attribute/isu);
  assert.match(nodeLabel(en, 'published_snapshot'), /v1.7.*1,651 Pages.*Ten Data Sources.*28 Block.*Four Span.*5 Page.*3 Text.*6 Table/isu);
  assert.match(nodeLabel(en, 'match'), /Paper.*Adjacency.*Fuzzy.*Current Main.*MGAM.*Prediction Granularity Only/isu);
  assert.match(nodeLabel(en, 'recognition_metrics'), /Text NED.*BLEU.*METEOR.*Table TEDS.*NED/isu);
  assert.match(nodeLabel(en, 'formula_order_metrics'), /Formula CDM.*NED.*BLEU.*Reading-order NED/isu);
  assert.match(nodeLabel(en, 'detection_metrics'), /Layout and Formula Detection.*COCODet.*mAP.*mAR/isu);
  assert.match(nodeLabel(en, 'report'), /Overall.*Text Accuracy.*Table TEDS.*Formula CDM/isu);
  assert.match(nodeLabel(en, 'drift_boundary'), /Paper v2.*981.*Current HF.*1,355 v1.5 \+ 296 Hard = 1,651.*v1.7/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Apache 2.0.*Research Only.*Not for Commercial/isu);
  assertEdgeTriples(en, [
    ['evidence', 'paper_scope', 'secondary', 'Fixed evidence'],
    ['paper_release', 'published_snapshot', 'primary', ''],
    ['task_gate', 'recognition_metrics', 'primary', 'Text and table'],
    ['task_gate', 'formula_order_metrics', 'primary', 'Formula and order'],
    ['task_gate', 'detection_metrics', 'primary', 'Detection'],
    ['published_snapshot', 'drift_boundary', 'secondary', 'Published snapshot'],
    ['report', 'drift_boundary', 'secondary', 'Evaluation drift'],
    ['drift_boundary', 'license_boundary', 'secondary', 'Use boundary'],
  ], 'OmniDocBench');
  assert.match(detail.intro_en, /Paper v2.*981-page.*current official v1.7.*1,651/isu);
  assert.match(detail.scale_en, /Paper v2.*981.*current HF v1.7.*1,651.*28 block \+ 4 span.*14/isu);
  assert.match(detail.metric_en, /Paper v2.*NED.*TEDS.*CDM.*BLEU.*current v1.7.*METEOR.*COCODet.*Overall/isu);
  assert.match(detail.drawio_review_note, /2160acf355867ecdcec5e2d0253f8dd55979b158d9b2ca07089442500e49e562/u);
  assert.match(detail.drawio_review_note, /337cc26965893db3ef53ddc119a6d6bb5bde096f/u);
  assert.match(detail.drawio_review_note, /2b161d010d2e3aff77a0edef359ea3a6411d23cd/u);
  assert.match(detail.drawio_review_note, /aa1ee96d106dbe53d0ae59474d75c6e6d9b53fec/u);
  assert.match(detail.drawio_review_note, /a45cd84b04ad8b793e775089640e6b681209abea33ead54c1828ddca35fae496/u);
  assert.match(detail.drawio_review_note, /1,355 v1.5, 100 equation_hard, 99 layout_hard, and 97 table_hard/isu);
  assert.match(detail.drawio_review_note, /Apache License 2.0.*research purposes only.*not for commercial use/isu);
});

test('locks OmniMedVQA construction, dual-score evaluation, mixed access, and released-code boundary', () => {
  const detail = readDetail('OmniMedVQA');
  const en = readSpec('OmniMedVQA', 'en');
  const zh = readSpec('OmniMedVQA', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2402.09181v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2402.09181v2');
  assert.equal(
    detail.homepage,
    'https://github.com/OpenGVLab/Multi-Modality-Arena/tree/bd2999a3be2bf4539a7e071cf2cfab5822f66417',
  );
  assert.equal(detail.openness, 'partly public, mixed access and source-specific licenses');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v2.*5704bd6b4f4d.*Git bd2999a3be2b.*HF 1ba51c28fc07/isu);
  assert.match(nodeLabel(en, 'scope'), /73 Classification Datasets.*Authentic Medical Images.*12 Modalities.*20 Anatomies/isu);
  assert.match(nodeLabel(en, 'inventory'), /42 Completely Open.*31 Restricted-access.*Source Provenance.*Terms/isu);
  assert.match(nodeLabel(en, 'templates'), /Dataset-specific QA Templates.*Original Categories.*Modality and Anatomy.*Potential Images per Template/isu);
  assert.match(nodeLabel(en, 'balance'), /Inverse-proportional.*Larger Templates.*Smaller Ratios.*Repetitive QA Bias/isu);
  assert.match(nodeLabel(en, 'types'), /Five Question Types.*Modality Recognition.*Anatomy Identification.*Disease Diagnosis.*Lesion Grading.*Other Biological/isu);
  assert.match(nodeLabel(en, 'rewrite'), /ChatGPT-3.5.*Expression.*Syntax.*Original Answer/isu);
  assert.match(nodeLabel(en, 'options'), /GPT-3.5.*Two to Four.*Multiple-choice/isu);
  assert.match(nodeLabel(en, 'paper_release'), /118,010 Images.*127,995 QA Items.*12 Modalities.*20 Anatomies.*Five/isu);
  assert.match(nodeLabel(en, 'hf_package'), /42 Open Sources.*Relative Paths.*31 Restricted Sources.*10,698,178,715 Bytes/isu);
  assert.match(nodeLabel(en, 'eval_scope'), /Zero-shot.*Eight General-domain.*Four Medical-specialized.*Both Metrics Separately/isu);
  assert.match(nodeLabel(en, 'qa_score'), /Free-form Response.*Candidate Similarity.*Most Similar Option/isu);
  assert.match(nodeLabel(en, 'prefix_score'), /Visual Features.*Text Embeddings.*Question-option Pair.*Highest Likelihood/isu);
  assert.match(nodeLabel(en, 'report'), /Five Question Types.*Overall.*Per-modality.*Full and Open-only.*Distinct/isu);
  assert.match(nodeLabel(en, 'access_boundary'), /42 Open \+ 31 Restricted.*Reobtained.*Source License/isu);
  assert.match(nodeLabel(en, 'snapshot_boundary'), /1ba51c28fc07.*Ungated.*12245e0f99af.*Not Independently Recounted/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /bd2999a3be2b.*Model-specific Scripts.*Local Data Paths and Weights.*Exceptions.*Skip/isu);
  assert.match(nodeLabel(zh, 'access_boundary'), /42 个开放 \+ 31 个受限源.*另行获取.*许可/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', 'Fixed evidence'],
    ['paper_release', 'hf_package', 'primary', ''],
    ['score_gate', 'qa_score', 'primary', 'Generated response'],
    ['score_gate', 'prefix_score', 'primary', 'Option likelihood'],
    ['qa_score', 'ground_truth', 'primary', ''],
    ['prefix_score', 'ground_truth', 'primary', ''],
    ['snapshot_boundary', 'access_boundary', 'secondary', 'Mixed access'],
    ['hf_package', 'snapshot_boundary', 'secondary', 'Published snapshot'],
    ['report', 'code_boundary', 'secondary', 'Implementation boundary'],
  ], 'OmniMedVQA');
  assert.match(detail.intro_en, /73.*118,010 distinct images.*127,995.*42 open.*31 restricted/isu);
  assert.match(detail.scale_en, /118,010 distinct images.*127,995.*73.*12.*20\+.*5 question types.*42 open.*31 restricted/isu);
  assert.match(detail.metric_en, /Question-answering accuracy.*Prefix-based accuracy.*five question types.*overall.*modality.*open-only/isu);
  assert.match(detail.drawio_review_note, /5704bd6b4f4dee51862b8fdcc0ba56ca393694ef4023b72307a6fd77008850d7/u);
  assert.match(detail.drawio_review_note, /bd2999a3be2bf4539a7e071cf2cfab5822f66417/u);
  assert.match(detail.drawio_review_note, /1ba51c28fc0773bdf7efb8396e5bcfd4227e22da/u);
  assert.match(detail.drawio_review_note, /f6ab4c363298083f34a22415ebf8cc9d9c8c8ad099a84c2abc391206d884d347/u);
  assert.match(detail.drawio_review_note, /12245e0f99afbc7d6f70e4ca3c2e5a7979a01816cd8159ae34539f4aa76adee0/u);
  assert.match(detail.drawio_review_note, /10,698,178,715 bytes.*not downloaded or independently recounted/isu);
  assert.match(detail.drawio_review_note, /42 source datasets.*completely open.*31 datasets.*restricted access/isu);
  assert.match(detail.drawio_review_note, /no global license identifier.*no root LICENSE/isu);
});
