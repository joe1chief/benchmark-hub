import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PACE-Bench', 'PHYBench'];
const expectedCounts = new Map([
  ['PACE-Bench', { nodes: 25, edges: 28, secondary: 7 }],
  ['PHYBench', { nodes: 24, edges: 25, secondary: 4 }],
]);
const expectedNodeIds = new Map([
  ['PACE-Bench', [
    'evidence', 'targets', 'sources', 'matrices', 'protocol_gate', 'loocv', 'global_basis',
    'code_boundary', 'signals', 'selection_gate', 'local', 'global', 'union', 'embeddings',
    'bootstrap', 'goal_gate', 'absolute', 'pairwise', 'ensemble', 'report', 'fit_all', 'hf_release',
    'release_boundary', 'content_boundary', 'license_boundary',
  ]],
  ['PHYBench', [
    'evidence', 'scope', 'contributors', 'formulation', 'constraints', 'question_bank', 'expert_review',
    'llm_aids', 'reviewer_library', 'human_review', 'retain', 'dataset', 'prompt', 'boxed', 'normalize',
    'metric_gate', 'accuracy', 'eed_tree', 'eed_distance', 'eed_score', 'report', 'human_baseline',
    'data_boundary', 'code_boundary',
  ]],
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

test('keeps PACE-Bench and PHYBench bilingual, topology-locked, and source-stage safe', () => {
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
    }
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.deepEqual(en.nodes.map(node => node.id), expectedNodeIds.get(id), `${id} semantic node order`);
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of en.nodes) {
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 48, `${id}.${node.id} English line width: ${line}`);
      }
    }
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese node semantics`);
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 38, `${id}.${node.id} Chinese line width: ${line}`);
      }
    }
    for (const edge of zh.edges.filter(edge => edge.label)) {
      assert.match(String(edge.label), /[\u3400-\u9fff]/u, `${id} ${edge.from}->${edge.to} Chinese edge semantics`);
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

test('locks PACE paper protocol, released implementation drift, and fit-all data boundary', () => {
  const detail = readDetail('PACE-Bench');
  const en = readSpec('PACE-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2607.02032v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2607.02032v2');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/neulab/pace-bench/tree/ce177cfe25bc8c8259cadecb56d4db8d9d36ab18',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /2607\.02032v2.*0af39b8c953f.*dc2ef80e00ad.*a42cd03e0977.*ce177cfe25bc.*c7fbf603d2d6/isu);
  assert.match(nodeLabel(en, 'targets'), /GAIA 165.*Verified 500.*Multimodal 102.*SWT-Bench 430.*14 Models.*OpenHands/isu);
  assert.match(nodeLabel(en, 'sources'), /19 Non-agentic.*11 Capabilities.*lm-evaluation-harness.*Official Code/isu);
  assert.match(nodeLabel(en, 'matrices'), /X: Model by Source-instance.*P: Per-target-instance.*Near-zero-variance/isu);
  assert.match(nodeLabel(en, 'loocv'), /Hold Out One of 14.*Other 13.*14 Held-out Predictions/isu);
  assert.match(nodeLabel(en, 'global_basis'), /Calibration-only X.*Excludes Held-out/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /Vt_full.*All 14 X Rows.*Target Y.*Training Fold Only/isu);
  assert.match(nodeLabel(en, 'signals'), /Absolute Spearman.*Leverage h.*Calibration Models Only/isu);
  assert.match(nodeLabel(en, 'local'), /Absolute Spearman.*Selected X_L.*Local Basis/isu);
  assert.match(nodeLabel(en, 'global'), /h Times Absolute rho.*Global Source-pool Geometry/isu);
  assert.match(nodeLabel(en, 'union'), /C Unique Composite.*C_L:C_G.*Past Overlap.*C = 100/isu);
  assert.match(nodeLabel(en, 'embeddings'), /Local SVD Coordinates.*Global Pseudoinverse.*Separate/isu);
  assert.match(nodeLabel(en, 'bootstrap'), /after Selection.*Replacement.*B = 300.*Seed 42/isu);
  assert.match(nodeLabel(en, 'absolute'), /Released Implementation.*SVD Coordinates.*Spearman Weights.*Intercept OLS.*Raw C-vector/isu);
  assert.match(nodeLabel(en, 'pairwise'), /Ordered Model-score Differences.*Ridge Logistic.*Reuse Goal A/isu);
  assert.match(nodeLabel(en, 'report'), /MAE 3\.80.*Spearman 0\.81.*Pearson 0\.74.*84\.37.*Below 1 Percent.*Aggregated Held-out Labels/isu);
  assert.match(nodeLabel(en, 'fit_all'), /Fixed Hyperparameters.*All 14 Models.*No Held-out Prediction/isu);
  assert.match(nodeLabel(en, 'hf_release'), /GAIA 100.*SWE 100.*MM 105.*SWT 107.*12 Selected Sources.*19/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /100 Unique Composite Keys.*Five MM.*Seven SWT/isu);
  assert.match(nodeLabel(en, 'content_boundary'), /405 of 412.*Seven Rows Unresolved.*Benchmark Subdir Instance ID/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /mixed-upstream.*Upstream Terms.*No LICENSE.*Tagged Release/isu);
  assertEdgeTriples(en, [
    ['evidence', 'targets', 'secondary', ''],
    ['evidence', 'sources', 'secondary', ''],
    ['targets', 'matrices', 'primary', ''],
    ['sources', 'matrices', 'primary', ''],
    ['protocol_gate', 'loocv', 'primary', 'Validation'],
    ['protocol_gate', 'fit_all', 'primary', 'Publication'],
    ['global_basis', 'code_boundary', 'secondary', 'Paper-code drift'],
    ['selection_gate', 'local', 'primary', 'Local'],
    ['selection_gate', 'global', 'primary', 'Global'],
    ['embeddings', 'bootstrap', 'primary', ''],
    ['fit_all', 'hf_release', 'primary', ''],
    ['report', 'release_boundary', 'secondary', 'LOOCV evidence'],
    ['hf_release', 'release_boundary', 'secondary', 'Snapshot'],
    ['release_boundary', 'content_boundary', 'secondary', 'Coverage'],
    ['content_boundary', 'license_boundary', 'secondary', 'Terms'],
  ], 'PACE-Bench');
  assert.match(detail.intro_en, /14 model-held-out folds.*parallel matrices.*100 unique composite.*fit-all.*12 of the 19/isu);
  assert.match(detail.scale_en, /GAIA 100.*Verified 100.*Multimodal 105.*SWT 107.*100 unique composite.*12 selected.*19/isu);
  assert.match(detail.metric_en, /MAE.*Spearman.*Pearson.*pairwise.*cost/isu);
  assert.match(detail.drawio_review_note, /0af39b8c953f0a432735e00f1ea0cf9fa6eb631a643c421fa4d616f0d838fa7b/u);
  assert.match(detail.drawio_review_note, /https:\/\/github\.com\/neulab\/pace\/tree\/dc2ef80e00addd519e7d8479f875cc3ecb46c6cb/u);
  assert.match(detail.drawio_review_note, /dc2ef80e00addd519e7d8479f875cc3ecb46c6cb/u);
  assert.match(detail.drawio_review_note, /ce177cfe25bc8c8259cadecb56d4db8d9d36ab18/u);
  assert.match(detail.drawio_review_note, /transductive source geometry.*rather than target-label leakage/isu);
  assert.match(detail.drawio_review_note, /not nested cross-validation/isu);
  assert.match(detail.drawio_review_note, /405 of 412.*seven rows.*mixed-upstream/isu);
});

test('locks PHYBench human construction, metric branches, data packaging, and released-code boundary', () => {
  const detail = readDetail('PHYBench');
  const en = readSpec('PHYBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.16074v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.16074v2');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/Eureka-Lab/PHYBench/tree/d6d91c787b7abb865eb2490a328bf85a9f5095f0',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /2504\.16074v2.*35cbf568e673.*d9db3ec7246f.*c3c689eb53ce.*d6d91c787b7a.*912b17db6a4f/isu);
  assert.match(nodeLabel(en, 'scope'), /Single Formula.*High School.*Undergraduate.*Olympiad/isu);
  assert.match(nodeLabel(en, 'contributors'), /178 PKU Physics Students.*Human-created.*Rather Than Generated/isu);
  assert.match(nodeLabel(en, 'formulation'), /Six Physics Domains.*Original.*Substantially Adapted.*Contamination/isu);
  assert.match(nodeLabel(en, 'constraints'), /Self-contained.*Unambiguous.*Variables.*One Checkable Symbolic Answer/isu);
  assert.match(nodeLabel(en, 'question_bank'), /Question Bank.*Question Answer and Solution.*Review Rounds/isu);
  assert.match(nodeLabel(en, 'expert_review'), /Multi-round.*Physics Correctness.*Solvability.*Unique Interpretation/isu);
  assert.match(nodeLabel(en, 'llm_aids'), /o1.*DeepSeek-R1.*Side Input Only.*Never Supply Questions or Ground Truth/isu);
  assert.match(nodeLabel(en, 'reviewer_library'), /757 Questions after Expert Approval.*Answers.*Worked Solutions/isu);
  assert.match(nodeLabel(en, 'human_review'), /81 Students.*50 Chinese Physics Olympiad\s+Gold Medalists.*Eight Questions.*559 Valid/isu);
  assert.match(nodeLabel(en, 'retain'), /500 of 757.*66\.1 Percent/isu);
  assert.match(nodeLabel(en, 'dataset'), /500 Original Text-only.*Six Physics Domains/isu);
  assert.match(nodeLabel(en, 'prompt'), /Zero-shot.*Step-by-step.*Boxed LaTeX.*API Defaults.*Local Settings/isu);
  assert.match(nodeLabel(en, 'boxed'), /Final Boxed Answer.*Last Boxed Expression.*Unparseable/isu);
  assert.match(nodeLabel(en, 'normalize'), /latex2sympy2_extended.*SymPy.*Equality/isu);
  assert.match(nodeLabel(en, 'accuracy'), /Equivalent Expression Scores 100.*Invalid Scores Zero/isu);
  assert.match(nodeLabel(en, 'eed_distance'), /Extended Zhang-Shasha.*min\(x, 0\.6\(x - 5\) \+ 5\).*Marginal Cost beyond Five.*60 Percent/isu);
  assert.match(nodeLabel(en, 'eed_score'), /Ground-truth Tree Size.*100 if r = 0.*60 - 100r.*0\.6/isu);
  assert.match(nodeLabel(en, 'report'), /Accuracy and EED.*Separate.*204 Percent More\s+Sample Efficiency/isu);
  assert.match(nodeLabel(en, 'human_baseline'), /559 Valid.*61\.9.*2\.1.*70\.4.*1\.8.*10k Bootstrap/isu);
  assert.match(nodeLabel(en, 'data_boundary'), /100 Full.*400 Question-only.*1000 Viewer Rows.*500-row.*MIT/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /Implements EED Only.*No Full Inference.*Box Extraction.*Accuracy Runner.*MIT.*No Tag/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', ''],
    ['question_bank', 'expert_review', 'primary', ''],
    ['llm_aids', 'expert_review', 'secondary', 'Review aid only'],
    ['expert_review', 'reviewer_library', 'primary', ''],
    ['reviewer_library', 'human_review', 'primary', ''],
    ['human_review', 'retain', 'primary', ''],
    ['metric_gate', 'accuracy', 'primary', 'Exact'],
    ['metric_gate', 'eed_tree', 'primary', 'Graded'],
    ['human_review', 'human_baseline', 'primary', ''],
    ['dataset', 'data_boundary', 'secondary', 'Published snapshot'],
    ['eed_score', 'code_boundary', 'secondary', 'Implemented subset'],
  ], 'PHYBench');
  assert.match(detail.intro_en, /178.*Question Bank.*757-item Reviewer's Library.*81 students.*50 Chinese Physics Olympiad.*500.*66\.1.*side inputs.*never generate/isu);
  assert.match(detail.scale_en, /757-item.*500.*81.*559.*100 full.*400 question-only.*combined 500-row/isu);
  assert.match(detail.metric_en, /Symbolic-equivalence Accuracy.*Expression Edit Distance.*Human Baseline/isu);
  assert.match(detail.drawio_review_note, /35cbf568e673839cb78212bb5a09d0f47690a8576954ebe4410f2d1f934d7e5d/u);
  assert.match(detail.drawio_review_note, /https:\/\/github\.com\/phybench-official\/phybench\/tree\/d9db3ec7246f3678aaee65d44a32649ad93beea2/u);
  assert.match(detail.drawio_review_note, /d9db3ec7246f3678aaee65d44a32649ad93beea2/u);
  assert.match(detail.drawio_review_note, /d6d91c787b7abb865eb2490a328bf85a9f5095f0/u);
  assert.match(detail.drawio_review_note, /757 count belongs after.*expert-review.*not the raw number/isu);
  assert.match(detail.drawio_review_note, /temperature 0\.6.*top_p 0\.95.*32768/isu);
  assert.match(detail.drawio_review_note, /min\(x, 0\.6\*\(x-5\)\+5\).*marginal cost beyond five.*60 percent/isu);
  assert.match(detail.drawio_review_note, /100 complete.*400 question-only.*1000 rows.*duplicates/isu);
});
