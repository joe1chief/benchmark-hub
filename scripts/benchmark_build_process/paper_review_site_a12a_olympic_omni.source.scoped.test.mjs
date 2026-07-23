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
const benchmarkIds = ['OlympicArena', 'OmniBench'];
const expectedCounts = new Map([
  ['OlympicArena', { nodes: 24, edges: 29 }],
  ['OmniBench', { nodes: 25, edges: 30 }],
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

test('keeps OlympicArena and OmniBench bilingual, synchronized, and style-safe at source stage', () => {
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
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 3_500, `${id} review evidence`);
  }

  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.get(id);
    assert.ok(summary, `${id} catalog entry`);
    for (const key of syncedKeys) {
      assert.deepEqual(summary[key], detail[key], `${id}.${key} catalog sync`);
    }
  }
});

test('locks OlympicArena construction, three paper splits, evaluation branches, and public-release boundary', () => {
  const detail = readDetail('OlympicArena');
  const en = readSpec('OlympicArena', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2406.12753v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2406.12753v2');
  assert.equal(
    detail.homepage,
    'https://github.com/GAIR-NLP/OlympicArena/tree/99f6fa745ff8429f2951fd56a0d0ec580a9e00e2',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.openness_en, 'Public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v2.*bc6064edc79e.*Git 99f6fa745ff8.*HF 001189f4e78b/isu);
  assert.match(nodeLabel(en, 'scope'), /Seven Disciplines.*62 Competitions.*English and Chinese.*Text-only and Interleaved/isu);
  assert.match(nodeLabel(en, 'collect'), /Public Competition URLs.*PDF.*Available Solutions.*CS Test Cases.*Copyright/isu);
  assert.match(nodeLabel(en, 'convert'), /Mathpix.*Markdown.*Interleaved Images/isu);
  assert.match(nodeLabel(en, 'extract'), /About 30 STEM Students.*Streamlit.*Images as URLs.*JSON/isu);
  assert.match(nodeLabel(en, 'checks'), /Seven Rule Checks.*Answer Type.*Variables.*Equals Sign.*Units.*Image Link/isu);
  assert.match(nodeLabel(en, 'review'), /Predefined-rule Correction.*Different Annotator.*Cross-check/isu);
  assert.match(nodeLabel(en, 'dedupe'), /Within Each Competition.*Model Embeddings.*Same-year Repeats/isu);
  assert.match(nodeLabel(en, 'difficulty'), /Validation Set Only.*Knowledge Recall.*Concept Application.*Cognitive Reasoning.*GPT-4V.*Human/isu);
  assert.match(nodeLabel(en, 'abilities'), /Eight Logical.*Five Visual.*GPT-4V.*Human/isu);
  assert.match(nodeLabel(en, 'release'), /11,163.*7,054 English.*4,109 Chinese.*7,571 Images.*4,960 Image-bearing.*7,904 Solutions.*13 Answer Types/isu);
  assert.match(nodeLabel(en, 'ot'), /OlympicArena-ot.*548.*Model-based Evaluation/isu);
  assert.match(nodeLabel(en, 'val'), /OlympicArena-val.*638.*Step-by-step Solutions/isu);
  assert.match(nodeLabel(en, 'test'), /OlympicArena-test.*9,977.*Answers Unreleased/isu);
  assert.match(nodeLabel(en, 'paper_settings'), /Entire 11,163.*Multimodal.*Image-caption.*Text-only.*Zero-shot/isu);
  assert.match(nodeLabel(en, 'prompt'), /Answer-type-specific.*boxed.*Maximum 2,048.*Temperature 0\.0.*CS 0\.2/isu);
  assert.match(nodeLabel(en, 'rule_eval'), /Fixed-answer Types.*Paper.*boxed.*Fixed Code.*No Box.*Full Response.*Numeric.*SymPy.*Interval.*Set.*Tuple/isu);
  assert.match(nodeLabel(en, 'code_eval'), /Test Cases.*Paper.*Five Generations.*n = 5.*k = 1.*Fixed Code.*Drop Failed Extractions.*Effective n.*Extracted Snippets.*5.*Any Nonzero.*Overall/isu);
  assert.match(nodeLabel(en, 'model_eval'), /Other Answer Type.*GPT-4V.*100.*Nearly 80%.*About 5%/isu);
  assert.match(nodeLabel(en, 'process_eval'), /96 Problems.*GPT-4.*Step-by-step.*GPT-4V.*0 or 1.*Mean.*83%/isu);
  assert.match(nodeLabel(en, 'report'), /Overall Accuracy.*CS Pass@1.*Subject.*Language.*Modality.*Process Score/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /HF.*638 Val \+ 9,977 Test = 10,615.*548 OT Absent.*Paper Field Is Wrong.*2406\.16772.*Local Code Val Only.*Test Submission.*CC BY-NC-SA 4\.0/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', 'Fixed evidence'],
    ['release', 'split_gate', 'primary', ''],
    ['split_gate', 'ot', 'primary', 'Model-judged'],
    ['split_gate', 'val', 'primary', 'Validation'],
    ['split_gate', 'test', 'primary', 'Formal test'],
    ['ot', 'paper_settings', 'primary', ''],
    ['val', 'paper_settings', 'primary', ''],
    ['test', 'paper_settings', 'primary', ''],
    ['eval_gate', 'rule_eval', 'primary', 'Fixed answer'],
    ['eval_gate', 'code_eval', 'primary', 'Code'],
    ['eval_gate', 'model_eval', 'primary', 'Other'],
    ['paper_settings', 'process_eval', 'primary', '96-problem branch'],
    ['release', 'source_boundary', 'secondary', 'Published snapshot'],
    ['report', 'source_boundary', 'secondary', 'Paper-code boundary'],
  ], 'OlympicArena');
  assert.match(detail.scale_en, /paper.*11,163.*HF.*10,615.*548.*OT/isu);
  assert.match(detail.metric_en, /Paper.*Accuracy.*CS pass@1.*process.*public code/isu);
  assert.match(detail.metric_en, /unboxed.*extracted.*effective n/isu);
  assert.match(detail.drawio_review_note, /bc6064edc79eb5ff826973fc4e9740570ce6c61155b86fdaf871fe6ca44f2ff9/u);
  assert.match(detail.drawio_review_note, /99f6fa745ff8429f2951fd56a0d0ec580a9e00e2/u);
  assert.match(detail.drawio_review_note, /001189f4e78bbdbe436770a2763a4283c6224709/u);
  assert.match(detail.drawio_review_note, /3d566f0dbae408cb6a19e488e116b081644e33824c5ee289ba12f3ced3b6b96e/u);
  assert.match(detail.drawio_review_note, /7b673e1a7947ed6d5ea71d7ea252d001044b556559cce7064f1a4b1edea22874/u);
  assert.match(detail.drawio_review_note, /paper.*11,163.*HF.*10,615.*OlympicArena-ot.*not.*HF/isu);
  assert.match(detail.drawio_review_note, /paper.*entire benchmark.*public code.*validation.*test.*submission/isu);
  assert.match(detail.drawio_review_note, /HF card.*Paper.*2406\.16772.*incorrect.*2406\.12753/isu);
  assert.match(detail.drawio_review_note, /extract_boxed_answer.*full.*response.*no.*box/isu);
  assert.match(detail.drawio_review_note, /extract_code/iu);
  assert.match(detail.drawio_review_note, /drops a generation/iu);
  assert.match(detail.drawio_review_note, /effective n equals.*extracted snippet count/isu);
});

test('locks OmniBench tri-modal curation, iterative necessity gate, released scorer, and source drift', () => {
  const detail = readDetail('OmniBench');
  const en = readSpec('OmniBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2409.15272v6');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2409.15272v6');
  assert.equal(
    detail.homepage,
    'https://github.com/multimodal-art-projection/OmniBench/tree/1f14e7f49c9a06ff21804d8b5a5c87a116a94361',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.openness_en, 'Public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /arXiv v6.*e68151f006ae.*Git 1f14e7f49c9a.*HF 84dc3923e0f6/isu);
  assert.match(nodeLabel(en, 'scope'), /Image \+ Audio \+ Text.*Reconstruct.*Text Answer.*Static Image.*Not Video Input/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /Three Categories.*Eight Task Types.*Temporal-spatial Entity.*Causal Inference.*Abstract Concept/isu);
  assert.match(nodeLabel(en, 'sources'), /Online Image or Video.*AI-generated.*Self-prepared.*Online Video.*Sound Event.*Dialogue Recording/isu);
  assert.match(nodeLabel(en, 'team'), /16 Annotators.*Five Quality Inspectors.*Full-time.*Higher Education/isu);
  assert.match(nodeLabel(en, 'author'), /Four-option MCQ.*Exactly One Answer.*Confusing Distractor.*Both Image and Audio/isu);
  assert.match(nodeLabel(en, 'constraints'), /854×480.*30 Seconds.*Speaker.*Five.*Environmental Context.*Three/isu);
  assert.match(nodeLabel(en, 'rationales'), /Transcript or Music Caption.*Image-specific Rationale.*Audio-specific Rationale/isu);
  assert.match(nodeLabel(en, 'human_qc'), /Cross-inspect Every Sample.*Failure Reasons.*Targeted Revision/isu);
  assert.match(nodeLabel(en, 'model_qc'), /LLaVA-1\.6-34B.*Image \+ Text.*Transcript \+ Text.*Text Only.*Three Times/isu);
  assert.match(nodeLabel(en, 'gate'), /Rejects or Answers Wrong.*Every Limited-information Setting.*Both Modalities Necessary/isu);
  assert.match(nodeLabel(en, 'discard'), /Hard-to-recycle.*121.*9\.58% During Iterative QC/isu);
  assert.doesNotMatch(nodeLabel(en, 'discard'), /Rejected Pool/iu);
  assert.match(nodeLabel(en, 'release'), /1,142.*771 Speech.*265 Sound Event.*106 Music.*Eight Tasks.*868.*76%.*21\.1%/isu);
  assert.match(nodeLabel(en, 'publication'), /Fixed Git JSONL.*1,142 Rows.*HF Train-labelled Packaging.*1,142 Contiguous IDs.*Four Options/isu);
  assert.match(nodeLabel(en, 'full'), /Image \+ Audio \+ Text.*Four Options/isu);
  assert.match(nodeLabel(en, 'ablation'), /Remove Image.*Remove Audio.*Necessity.*Robustness/isu);
  assert.match(nodeLabel(en, 'textual'), /Image Caption \+ Audio.*Image \+ Transcript.*Caption \+ Transcript/isu);
  assert.match(nodeLabel(en, 'human'), /Human Expert Baseline.*Three Musicians.*Average Accuracy/isu);
  assert.match(nodeLabel(en, 'prompt'), /Please Answer.*Given Image and Audio.*Choose Only One.*A–D/isu);
  assert.match(nodeLabel(en, 'parser'), /Parenthesized.*Plain.*Dotted.*Option Text Only if More Than Five Tokens.*Dotted Ties Select First Candidate.*N\/A/isu);
  assert.match(nodeLabel(en, 'report'), /Intended Scorer Report.*Correct ÷ 1,142.*25%.*Invalid Empty Question.*Speech.*Sound Event.*Music/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /Demo: Absent XLSX.*option.*correct answer.*Data: JSONL.*options.*answer.*Demo JSONL.*Metric json\.load.*Gold: 711 OK.*274 N\/A.*157 Wrong.*Assert #12.*README 7 Tasks.*Paper\/Data 8/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Paper Ethics: CC-BY-NC.*Checklist: MIT.*Git and HF Card: No License Metadata/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', 'Fixed evidence'],
    ['gate', 'revise', 'primary', 'Revise'],
    ['revise', 'human_qc', 'primary', 'Recheck'],
    ['gate', 'discard', 'primary', 'Hard to recycle'],
    ['gate', 'release', 'primary', 'Accept'],
    ['release', 'publication', 'primary', ''],
    ['eval_gate', 'full', 'primary', 'Full'],
    ['eval_gate', 'ablation', 'primary', 'Ablate'],
    ['eval_gate', 'textual', 'primary', 'Approximate'],
    ['eval_gate', 'human', 'primary', 'Human'],
    ['publication', 'code_boundary', 'secondary', 'Released implementation'],
    ['report', 'code_boundary', 'secondary', 'Metric boundary'],
    ['publication', 'license_boundary', 'secondary', 'License boundary'],
  ], 'OmniBench');
  assert.match(detail.scale_en, /1,142.*771.*265.*106.*eight/isu);
  assert.match(detail.metric_en, /Intended.*accuracy.*correct.*1,142.*parser.*711.*274 N\/A.*157.*index 12/isu);
  assert.match(detail.drawio_review_note, /e68151f006ae382ab756c07f9993dbdc420a0335e9928e542d592d4c25663618/u);
  assert.match(detail.drawio_review_note, /1f14e7f49c9a06ff21804d8b5a5c87a116a94361/u);
  assert.match(detail.drawio_review_note, /84dc3923e0f64b3c5926b32d2b08066cf67b3d15/u);
  assert.match(detail.drawio_review_note, /cb4c714428d32f19cfdce68f6229aef9a5d5b3cd5d997c550d3845450098b3b4/u);
  assert.match(detail.drawio_review_note, /0085ad23821d9ae2257ca789bd782a30b953109a17e4ec768eea0585ff27e5b0/u);
  assert.match(detail.drawio_review_note, /README.*seven task types.*paper.*fixed JSONL.*eight/isu);
  assert.match(detail.drawio_review_note, /demo_api_call.*JSONL.*calculate_metrics.*json\.load.*not directly compatible/isu);
  assert.match(detail.drawio_review_note, /batch-5_1142_20240817\.xlsx.*absent.*option.*correct answer.*options.*answer.*data-to-demo/isu);
  assert.match(detail.drawio_review_note, /dotted-letter.*plain-letter lookup.*first candidate/isu);
  assert.match(detail.drawio_review_note, /1,142.*gold.*711.*274.*N\/A.*157.*index 12/isu);
  assert.match(detail.drawio_review_note, /CC-BY-NC.*MIT.*no LICENSE/isu);
  assert.doesNotMatch(detail.drawio_review_note, /9\.58% of the rejected pool/iu);
});
