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
const benchmarkIds = ['OlmoBaseEval', 'OlympiadBench'];
const expectedCounts = new Map([
  ['OlmoBaseEval', { nodes: 17, edges: 18 }],
  ['OlympiadBench', { nodes: 21, edges: 21 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
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

function unescapeMermaidText(value) {
  return value
    .replace(/<br\/>/gu, '\n')
    .replace(/&#124;/gu, '|')
    .replace(/\\"/gu, '"')
    .replace(/\\\\/gu, '\\');
}

function fallbackSignature(flowchart) {
  const nodes = [];
  const edges = [];
  for (const line of flowchart.split('\n')) {
    let match = line.match(/^\s*([a-z][a-z0-9_]*)\["(.*)"\]$/iu);
    if (match) {
      nodes.push({ id: match[1], label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -->\|(.*)\| ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[3], type: 'primary', label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) --> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[2], type: 'primary', label: '' });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\. (.*) \.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[3], type: 'secondary', label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) edges.push({ from: match[1], to: match[2], type: 'secondary', label: '' });
  }
  return { nodes, edges };
}

function specSignature(graph) {
  return {
    nodes: graph.nodes.map(node => ({ id: node.id, label: String(node.label) })),
    edges: graph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      type: edge.type,
      label: String(edge.label ?? ''),
    })),
  };
}

test('keeps the A12a source pair bilingual, catalog-synchronized, and fallback-synchronized', () => {
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
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    for (const graph of [en, zh]) {
      for (const edge of graph.edges.filter(edge => edge.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
      }
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_en), specSignature(en), `${id} English fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_zh), specSignature(zh), `${id} Chinese fallback`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
  }
});

test('locks OlmoBaseEval paper construction, task contracts, release count, and code drift', () => {
  const detail = readDetail('OlmoBaseEval');
  const en = readSpec('OlmoBaseEval', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2512.13961v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2512.13961v2');
  assert.equal(
    detail.homepage,
    'https://github.com/allenai/olmes/tree/5a51f502d463b8cdc4a2dcad7d7096c41ff1197e',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(detail.scale_en, /Paper v2.*43 named entries.*39 Base Main.*4 held-out.*fixed OLMES snapshot.*38 Base Main.*42 with held-out/isu);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v2.*PDF SHA-256 f75208766c58.*OLMES 5a51f502d463/isu);
  assert.match(nodeLabel(en, 'objective'), /Pretraining and Midtraining Decisions.*Small Compute.*Benchmark Noise/isu);
  assert.match(nodeLabel(en, 'score_pool'), /23K Benchmark Scores.*70 External Open-weight Models/isu);
  assert.match(nodeLabel(en, 'rank_similarity'), /Rank Models Similarly.*Ward Variance Minimization/isu);
  assert.match(nodeLabel(en, 'task_clusters'), /Threshold Manually.*Move Same-format Tasks.*Six Capability Clusters/isu);
  assert.match(nodeLabel(en, 'scaling'), /10¹⁸ to 10²⁵.*25 OLMo 2 Scaling Models.*70 Open-weight Models/isu);
  assert.match(nodeLabel(en, 'base_easy'), /Gold or Human Continuations.*Negative Log-likelihood.*UTF-8 Bytes.*Below 1B/isu);
  assert.match(nodeLabel(en, 'base_main'), /MC STEM.*MC Non-STEM.*GenQA.*Math.*Code.*Code FIM.*39 Paper Rows/isu);
  assert.match(nodeLabel(en, 'snr'), /Final 50 OLMo 2 13B Checkpoints.*10 Compute-matched External Models.*4×10²³ FLOPs.*Five Preliminary Midtraining Runs/isu);
  assert.match(nodeLabel(en, 'refine'), /1K Subsets to Full Sets.*Remove BoolQ.*CruxEval.*Outside Macro-average.*Tune pass@k/isu);
  assert.match(nodeLabel(en, 'new_benchmarks'), /BasicSkills.*Six Tasks.*Gen2MC.*Five QA Tasks.*200 Validation Samples.*MT MBPP.*17 Code Languages.*UltraChat.*WildChat/isu);
  assert.match(nodeLabel(en, 'heldout'), /MMLU Pro.*DeepMind Math.*LBPP.*BigBench Hard.*Unused Before Release/isu);
  assert.match(nodeLabel(en, 'release_count'), /43 Named Entries.*39 Base Main.*4 Held-out.*Base Easy Reuses/isu);
  assert.match(nodeLabel(en, 'paper_eval'), /vLLM 0\.9\.0\.1.*vLLM 0\.11\.0.*Task-specific ICL.*Temperature and Top-p 0\.6/isu);
  assert.match(nodeLabel(en, 'repo_drift'), /OLMES 5a51f502d463.*38 Main \+ 4 Held-out.*MATH 500 Absent.*mt_mbpp_v2fix.*Apache-2\.0/isu);
  assert.match(nodeLabel(en, 'report'), /BPB.*Accuracy.*F1.*pass@k.*Six Capability Macro-averages/isu);
  assertEdgeTriples(en, [
    ['evidence', 'objective', 'secondary', 'Primary sources'],
    ['scaling', 'heldout', 'secondary', 'Reserve before release'],
    ['paper_eval', 'repo_drift', 'secondary', 'Paper-code boundary'],
  ], 'OlmoBaseEval');
  assert.match(detail.drawio_review_note, /f75208766c58a7eec434be61c93b5f7d904f2d2de31c02fca98dc9db0980fcae/u);
  assert.match(detail.drawio_review_note, /5a51f502d463b8cdc4a2dcad7d7096c41ff1197e/u);
  assert.match(detail.drawio_review_note, /b17d080412d7741dfe2be84742842265ecbe67f5f851cc3b476e25b9a676e92c/u);
  assert.match(detail.drawio_review_note, /62fb8a3a9621dc2388174caaabe9c2317b694bb9a1d46c98bcf5655b68f51be3/u);
  assert.match(detail.drawio_review_note, /paper.*39 Base Main.*four held-out.*43.*pinned repository.*38 Base Main.*42/isu);
  assert.match(detail.drawio_review_note, /MATH 500.*absent.*mt_mbpp_v2fix/isu);
});

test('locks OlympiadBench curation, pinned public snapshot, prompt, scorer, and denominator boundaries', () => {
  const detail = readDetail('OlympiadBench');
  const en = readSpec('OlympiadBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2402.14008v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2402.14008v2');
  assert.equal(
    detail.homepage,
    'https://github.com/OpenBMB/OlympiadBench/tree/ba5b26a7e2849940b598a9159c1190daa2b9175f',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(detail.scale_en, /8,476.*6,728 open-ended.*1,748 theorem-proving.*4,869 image-bearing.*18 Hugging Face configurations.*train-labelled split.*24 columns/isu);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v2.*PDF SHA-256 4360149145ef.*Repo ba5b26a7e284.*HF 91184b52131e/isu);
  assert.match(nodeLabel(en, 'scope'), /Bilingual Multimodal.*Mathematics and Physics.*Competition and CEE/isu);
  assert.match(nodeLabel(en, 'sources'), /Global Olympiads.*Chinese Regional and National.*Competitions.*Gaokao Mock Questions/isu);
  assert.match(nodeLabel(en, 'source_select'), /Difficulty.*Volume.*Public Materials.*Language.*Discipline.*Coverage Years/isu);
  assert.match(nodeLabel(en, 'ocr'), /Official PDFs.*Mathpix OCR.*Markdown.*Images/isu);
  assert.match(nodeLabel(en, 'verify'), /Manual PDF Comparison.*Clean and Revise.*Scientific Notation/isu);
  assert.match(nodeLabel(en, 'structure'), /Problem.*Solution.*Answer.*Expert Step-by-step Reasoning/isu);
  assert.match(nodeLabel(en, 'dedupe'), /Laurie\/Bloom1b7-deepspeed-.*chat-Chinese-math.*Cosine Similarity.*Threshold Not Disclosed/isu);
  assert.match(nodeLabel(en, 'annotate'), /Open-ended or Theorem Proving.*Subfield.*Subject.*Language.*Modality/isu);
  assert.match(nodeLabel(en, 'progressive'), /Shared Physics Material.*Dependent Subquestions.*context Field/isu);
  assert.match(nodeLabel(en, 'answer_types'), /Numeric.*Expression.*Equation.*Interval.*Tuple.*Multiple-answer.*Unit.*Error/isu);
  assert.match(nodeLabel(en, 'release'), /8,476.*6,142 Math.*2,334 Physics.*2,125 English.*6,351 Chinese.*4,869 Images.*6,728 Open-ended.*1,748 Theorem Proving/isu);
  assert.match(nodeLabel(en, 'prompt'), /Zero-shot Shared Template.*Subject and Answer Type.*LaTeX.*boxed.*Knowledge Labels/isu);
  assert.match(nodeLabel(en, 'eval_gate'), /Question Type/isu);
  assert.match(nodeLabel(en, 'open_eval'), /6,728 Open-ended.*Definitive-answer Types.*Automatic Branch/isu);
  assert.match(nodeLabel(en, 'proof_eval'), /1,748 Theorem-proving.*Manual Sample Assessment.*No Full Automatic Score/isu);
  assert.match(nodeLabel(en, 'extract'), /English and Chinese.*Final-answer Phrase.*boxed.*Last-line Math.*DeepSeek Markers/isu);
  assert.match(nodeLabel(en, 'score'), /Comma and Plus-minus Pairing.*Default 1e-8.*Per-item Error.*Interval.*Expression.*Equation.*SymPy/isu);
  assert.match(nodeLabel(en, 'denominator'), /Skip Theorem-proving Files.*Exclude Empty.*Unavailable.*Inappropriate.*API-error Responses.*Available-response Denominator/isu);
  assert.match(nodeLabel(en, 'report'), /Micro-average Accuracy.*Math and Physics.*Theorem Proofs Separate/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /Repo ba5b26a7e284.*No Release Tag.*HF 91184b52131e.*18 Configurations.*Train Label Is Packaging.*Apache-2\.0.*Prompt Wording Drift/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', 'Primary sources'],
    ['eval_gate', 'open_eval', 'primary', 'Open-ended'],
    ['eval_gate', 'proof_eval', 'primary', 'Theorem proving'],
    ['report', 'source_boundary', 'secondary', ''],
  ], 'OlympiadBench');
  assert.match(detail.drawio_review_note, /4360149145ef6c5d506cf6cd82d0214208b6572c654a6d932d7cfc010817e5f7/u);
  assert.match(detail.drawio_review_note, /ba5b26a7e2849940b598a9159c1190daa2b9175f/u);
  assert.match(detail.drawio_review_note, /91184b52131e7fc9455fef848035173aea8cc01a/u);
  assert.match(detail.drawio_review_note, /153c7971ac59e165002f1d68c255a303f74367c7fa69e09a78270d7df515b6e7/u);
  assert.match(detail.drawio_review_note, /ae8cc319f5937dd7915bddf537719dd456fad692c1dcdf860e020b3ae2e6258f/u);
  assert.match(detail.drawio_review_note, /e189460aa1e660d388e00cceebf1568bde2356ecc6ef555a4ef6f2475fdd6585/u);
  assert.match(detail.drawio_review_note, /d19fee0db997aeccf0768eca8de7061207ea68cd060bbc678e1ba8d8912d7888/u);
  assert.match(detail.drawio_review_note, /9d4334ca3ed68305f7d08d0fa76465c7c7725d8b8db96a98277d55aa0c4ff057/u);
  assert.match(detail.drawio_review_note, /single train-labelled split.*packaging.*not a training split/isu);
  assert.match(detail.drawio_review_note, /prompts were slightly adjusted.*dataset item names/isu);
});
