import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['OfficeQA', 'OfficeQA_Pro'];
const expectedCounts = new Map([
  ['OfficeQA', { nodes: 24, edges: 26 }],
  ['OfficeQA_Pro', { nodes: 24, edges: 26 }],
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

test('keeps the OfficeQA pair bilingual, synchronized, and style-safe at source stage', () => {
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
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 3_000, `${id} review evidence`);
  }
});

test('locks OfficeQA Full construction, split rule, evaluation contract, and source drift', () => {
  const detail = readDetail('OfficeQA');
  const en = readSpec('OfficeQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2603.08655v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2603.08655v1');
  assert.equal(detail.homepage, 'https://github.com/databricks/officeqa');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'scope'), /2603\.08655v1.*Section 2.*Appendices B and E.*Pro.*133.*Full.*246.*2026-07-18/isu);
  assert.match(nodeLabel(en, 'corpus'), /Monthly.*1939–1982.*Quarterly.*1939–2025.*89,000.*26M.*100–200/isu);
  assert.match(nodeLabel(en, 'prepare'), /Prose.*Tables.*Figures.*Charts.*Nested.*Units.*Footnotes.*Revisions.*1996.*Embedded Text Layers/isu);
  assert.match(nodeLabel(en, 'criteria'), /Enterprise Document Complexity.*Retrieval.*Multi-step Reasoning.*Single.*Verifiable/isu);
  assert.match(nodeLabel(en, 'scale'), /SuperAnnotate.*Turing.*Sample Questions.*Corpus.*Ungrounded Trivia.*Unambiguous/isu);
  assert.match(nodeLabel(en, 'topical'), /USAFacts.*Analyst.*Government-data/isu);
  assert.match(nodeLabel(en, 'reproduce'), /New Annotator.*Creator PDF Pages/isu);
  assert.match(nodeLabel(en, 'adjudicate'), /Third[- ]annotator.*Mismatch/isu);
  assert.match(nodeLabel(en, 'qa_rounds'), /Two End-to-end QA Passes.*Alternative Answers.*Humans.*Agent Failure.*Both Valid.*Gold Wrong.*Revise.*Correct Gold/isu);
  assert.match(nodeLabel(en, 'parametric_filter'), /Parametric-only.*Claude Opus 4\.5.*GPT-5\.1.*Retrieval-dependent/isu);
  assert.match(nodeLabel(en, 'retained'), /246 Questions/isu);
  assert.match(nodeLabel(en, 'difficulty_gate'), /Both Construction-time Agents Correct.*Databricks Parsed/isu);
  assert.match(nodeLabel(en, 'easy'), /113.*Full Companion/isu);
  assert.match(nodeLabel(en, 'pro'), /At Least One Agent Incorrect.*133.*Core/isu);
  assert.match(nodeLabel(en, 'release'), /officeqa_full\.csv.*246.*113 Easy.*133 Pro.*officeqa_pro\.csv.*133.*uid.*source_docs.*source_files.*difficulty/isu);
  assert.match(nodeLabel(en, 'eval_input'), /Hugging Face Approval.*Original PDFs.*4 GB.*Parsed JSON.*730 MB.*TXT.*460 MB/isu);
  assert.match(nodeLabel(en, 'eval_setting'), /Prompt Only.*Web Search.*Oracle PDF Pages.*Oracle Parsed Pages.*Full-corpus Agent/isu);
  assert.match(nodeLabel(en, 'answer_contract'), /Maximum Precision.*FINAL_ANSWER.*Latest Revision.*Exact\s+Date or Document/isu);
  assert.match(nodeLabel(en, 'paper_score'), /Paper v1.*99%.*Exact.*Absolute Relative Error.*0\.0%.*0\.1%.*1\.0%.*5\.0%.*Fuzzy/isu);
  assert.match(nodeLabel(en, 'fixed_reward'), /Fixed reward\.py.*Last FINAL_ANSWER.*One Direct Line.*250.*Numeric Arity.*Unit.*Numeric-list.*Context-year.*Post-paper/isu);
  assert.match(nodeLabel(en, 'report'), /Binary Correctness.*OfficeQA Pro.*Default.*0\.0%.*No Official Leaderboard/isu);
  const sourceBoundary = nodeLabel(en, 'source_boundary');
  assert.match(sourceBoundary, /0cf442.*f69b63.*8675310.*0d9169.*763a836.*cc59c6.*8dc109/isu);
  assert.match(sourceBoundary, /July 14.*Gated HF/isu);
  assert.match(sourceBoundary, /Data CC BY-SA 4\.0.*Code Apache 2\.0/isu);
  assertEdgeTriples(en, [
    ['reproduce_gate', 'qa_rounds', 'primary', 'Matches'],
    ['reproduce_gate', 'adjudicate', 'primary', 'Mismatch'],
    ['difficulty_gate', 'easy', 'primary', 'Both correct'],
    ['difficulty_gate', 'pro', 'primary', 'Not both correct'],
    ['answer_contract', 'fixed_reward', 'secondary', 'Fixed code snapshot'],
    ['fixed_reward', 'report', 'secondary', 'Implementation result'],
    ['report', 'source_boundary', 'secondary', 'Source and access boundary'],
  ], 'OfficeQA');
  assert.match(detail.intro_en, /both.*correct.*Easy.*otherwise.*Pro/isu);
  assert.match(detail.drawio_review_note, /0cf442159f94e109edeaa99d0b01f0ecc80839e853c82fcf204960ebcdf2aca2/u);
  assert.match(detail.drawio_review_note, /f69b639296fbd58a99b0dcdd64ca85ae3d1623924a7f0cd60021110527f6023e/u);
  assert.match(detail.drawio_review_note, /86753108d69e149cc28abd346bb8c3ca1cbfc7cf/u);
  assert.match(detail.drawio_review_note, /0d91698c87df6d889339aac36f63ae0966607f169890b0bf8b472b26bfe8138f/u);
  assert.match(detail.drawio_review_note, /763a8366abf2a3605c381d53586d844dc60fa756/u);
  assert.match(detail.drawio_review_note, /cc59c600c6bbdf04e5bcf31f43dd58f0c7b3978c.*155,772/isu);
  assert.match(detail.drawio_review_note, /8dc109a1611b29f79685b51e98f7de9cec463466.*87,909/isu);
  assert.match(detail.drawio_review_note, /paper.*publicly available.*GitHub.*May 2026.*moved.*gated Hugging Face/isu);
  assert.match(detail.drawio_review_note, /could not independently recount.*gated payload/isu);
  assert.match(detail.drawio_review_note, /CC BY-SA 4\.0.*Apache 2\.0/isu);
  assert.match(detail.drawio_review_note, /Sections 2\.1–2\.4.*Appendix B.*Appendix E/isu);
  assert.doesNotMatch(detail.drawio_review_note, /Appendix A/iu);
});

test('locks OfficeQA Pro as the not-both-correct subset rather than a both-failed subset', () => {
  const detail = readDetail('OfficeQA_Pro');
  const en = readSpec('OfficeQA_Pro', 'en');
  const zh = readSpec('OfficeQA_Pro', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2603.08655v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2603.08655v1');
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'pro'), /At Least One Agent Incorrect.*133.*Core/isu);
  assert.match(nodeLabel(zh, 'pro'), /至少一个.*未答对.*133.*核心/su);
  assert.match(nodeLabel(en, 'release'), /This Page Targets Pro/isu);
  assert.match(nodeLabel(zh, 'release'), /本页聚焦 Pro/u);
  assert.match(detail.intro_en, /not[- ]both[- ]correct.*at least one.*incorrect/isu);
  assert.match(detail.intro, /并非两个.*都答错.*至少一个.*未答对/u);
  assert.doesNotMatch(
    [detail.intro, detail.intro_en, nodeLabel(en, 'pro'), nodeLabel(zh, 'pro')].join('\n'),
    /both (?:frontier )?agents fail to answer it correctly|当两个前沿智能体都无法.*才进入/iu,
  );
  assert.match(detail.drawio_review_note, /not “both agents failed”.*at least one.*incorrect/isu);
  assert.match(detail.drawio_review_note, /Section 2\.2 reports that 11%.*three or more bulletins.*22%.*web.*3%.*visual.*62%.*beyond basic arithmetic/isu);
  assert.doesNotMatch(detail.drawio_review_note, /Appendix E reports that 11%/iu);
});
