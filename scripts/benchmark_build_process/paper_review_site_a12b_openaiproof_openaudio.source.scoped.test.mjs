import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['OpenAI-Proof_Q&A', 'OpenAudioBench'];
const expectedCounts = new Map([
  ['OpenAI-Proof_Q&A', { nodes: 13, edges: 12, secondary: 4 }],
  ['OpenAudioBench', { nodes: 18, edges: 23, secondary: 4 }],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const specPath = (id, language) => join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`);
const readSpec = (id, language) => parseYaml(readFileSync(specPath(id, language), 'utf8'));

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

test('keeps the A12b OpenAI-Proof and OpenAudio source pair bilingual and style-safe', () => {
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
        `${id} secondary edge count`,
      );
      for (const edge of graph.edges.filter(edge => edge.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
      }
    }
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.doesNotMatch(
      readFileSync(specPath(id, 'en'), 'utf8'),
      /[\u3400-\u9fff]/u,
      `${id} English spec purity`,
    );
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks OpenAI-Proof disclosed scale, evidence, pass@1 results, and closed boundaries', () => {
  const detail = readDetail('OpenAI-Proof_Q&A');
  const en = readSpec('OpenAI-Proof_Q&A', 'en');

  assert.equal(
    detail.paper_url,
    'https://cdn.openai.com/pdf/ac7c37ae-7f4c-4442-b741-2eabdeaf77e0/oai_5_2_Codex.pdf',
  );
  assert.equal(detail.openness, 'in-house');
  assert.equal(detail.openness_en, 'In-house');
  assert.equal(detail.scale, '20个内部研究与工程瓶颈');
  assert.equal(detail.metric, 'Pass@1');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'source_evidence'), /GPT-5\.2-Codex.*Table 8.*5\.1\.3\.4.*Figure 12.*5fe918b74072/isu);
  assert.match(nodeLabel(en, 'scope'), /Each Delayed a Major Project.*Some Affected Training Runs or Launches/isu);
  assert.match(nodeLabel(en, 'threshold'), /Team Needed More Than One Day.*One-day Project Delay.*Qualifying Internal Cases/isu);
  assert.match(nodeLabel(en, 'curate'), /Twenty Problems.*Encountered at OpenAI.*Research and Engineering Bottlenecks.*Closed Internal/isu);
  assert.match(nodeLabel(en, 'container'), /Container.*Historical Code Logs Experiment Data.*Code Access and Run Artifacts.*Assembly Details Not Disclosed/isu);
  assert.match(nodeLabel(en, 'diagnose'), /Performance Regressions.*Anomalous Training Metrics.*Subtle Implementation Bugs/isu);
  assert.match(nodeLabel(en, 'answer'), /Submit a Solution.*Root Cause.*Complex Issue.*Response Format Not Disclosed/isu);
  assert.match(nodeLabel(en, 'grade'), /Each Solution.*pass@1.*Rubric and Grader Not Disclosed.*Trial Protocol/isu);
  assert.match(nodeLabel(en, 'report'), /pass@1.*No-browse Thinking.*GPT-5 2%.*GPT-5\.1 0%.*GPT-5\.2 3%.*GPT-5\.1 Codex Max 8%.*GPT-5\.2-Codex 8%/isu);
  assert.match(nodeLabel(en, 'construction_boundary'), /Sampling Frame.*Task Authoring.*Reference Solutions.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'grading_boundary'), /Grader Implementation.*Acceptance Rubric.*Repetitions and Settings.*Not Public/isu);
  assert.match(nodeLabel(en, 'openness_boundary'), /No Public Task Payload.*No Official Benchmark Git or HF Repo.*No Public Leaderboard/isu);
  assert.deepEqual(
    en.nodes.filter(node => ['evidence', 'inspect', 'aggregate', 'drift_boundary'].includes(node.id)),
    [],
    'OpenAI-Proof must not promote undisclosed packaging, inspection, aggregation, or wording reconciliation to stages',
  );
  assertEdgeTriples(en, [
    ['source_evidence', 'scope', 'secondary', ''],
    ['threshold', 'curate', 'primary', ''],
    ['curate', 'container', 'primary', ''],
    ['run', 'diagnose', 'primary', ''],
    ['answer', 'grade', 'primary', ''],
    ['curate', 'construction_boundary', 'secondary', ''],
    ['grade', 'grading_boundary', 'secondary', ''],
    ['report', 'openness_boundary', 'secondary', ''],
  ], 'OpenAI-Proof_Q&A');
  assert.match(detail.drawio_review_note, /5fe918b740727770d0571684fd8c168190172649d2b2e8b7ca4cacad23b3e027/u);
  assert.match(detail.drawio_review_note, /2%.*0%.*8%.*3%.*8%/su);
  assert.match(detail.drawio_review_note, /all three Thinking variants.*no browsing/isu);
  assert.match(detail.drawio_review_note, /does not disclose.*sampling frame.*task-authoring.*reference solutions.*grader implementation.*trial/isu);
  assert.match(detail.drawio_review_note, /No public task payload.*official benchmark Git repository.*Hugging Face dataset.*public leaderboard/isu);
});

test('locks OpenAudioBench construction, fixed release, harness drift, and license boundary', () => {
  const detail = readDetail('OpenAudioBench');
  const en = readSpec('OpenAudioBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2502.17239v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2502.17239v1');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/baichuan-inc/OpenAudioBench/tree/98f8fa0d5fa7e530ec8e6f097b55f10b003d111b',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.openness_en, 'Public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'source_evidence'), /2502\.17239v1.*Section 4\.3.*Table 8.*6afe8eff5e7e.*805d456433db.*98f8fa0d5fa7/isu);
  assert.match(nodeLabel(en, 'reasoning'), /Reasoning QA.*Baichuan-authored.*202/isu);
  assert.match(nodeLabel(en, 'llama'), /Spoken Llama Questions.*300/isu);
  assert.match(nodeLabel(en, 'web'), /Randomly Select.*1,000/isu);
  assert.match(nodeLabel(en, 'trivia'), /Randomly Select.*1,000/isu);
  assert.match(nodeLabel(en, 'alpaca'), /Helpful-base.*Vicuna.*Remove Math and Code.*199/isu);
  assert.match(nodeLabel(en, 'speech'), /Authors TTS Model.*Web Trivia and Alpaca/isu);
  assert.match(nodeLabel(en, 'release'), /202 \+ 300 \+ 1,000 \+ 1,000 \+ 199.*2,701/isu);
  assert.match(nodeLabel(en, 'ss'), /Non-cascaded.*Interleaved Text and Audio.*Merge Output Text/isu);
  assert.match(nodeLabel(en, 'judge_ref'), /GPT-4o.*Reference Answers.*Reasoning Llama Web and Trivia/isu);
  assert.match(nodeLabel(en, 'judge_open'), /AlpacaEval.*GPT-4o.*Fixed Harness Uses No Reference.*Helpful Relevant Accurate Detailed/isu);
  assert.match(nodeLabel(en, 'report'), /Five Component Results.*Speech-to-Text.*Speech-to-Speech.*No Single Overall Formula/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /805d456433db.*98f8fa0d5fa7.*202 300 1000 1000 199.*2,701 Audio Files.*Seven Run Tasks/isu);
  assert.match(nodeLabel(en, 'drift_boundary'), /Reasoning.*1-to-5.*Threshold 4.*Llama Reports Percent.*Web Trivia Times 10.*Alpaca.*1-to-10.*Unequal Rounds/isu);
  assert.match(nodeLabel(en, 'openness_boundary'), /HF Public and Ungated.*No Dataset License Declared or LICENSE File.*Model-code Licenses Do Not Cover HF Data/isu);
  assertEdgeTriples(en, [
    ['source_evidence', 'goal', 'secondary', ''],
    ['goal', 'reasoning', 'primary', ''],
    ['goal', 'llama', 'primary', ''],
    ['goal', 'web', 'primary', ''],
    ['goal', 'trivia', 'primary', ''],
    ['goal', 'alpaca', 'primary', ''],
    ['reasoning', 'release', 'primary', ''],
    ['llama', 'release', 'primary', ''],
    ['web', 'speech', 'primary', ''],
    ['trivia', 'speech', 'primary', ''],
    ['alpaca', 'speech', 'primary', ''],
    ['release', 'st', 'primary', ''],
    ['release', 'ss', 'primary', ''],
    ['st', 'normalize', 'primary', ''],
    ['ss', 'normalize', 'primary', ''],
    ['normalize', 'judge_ref', 'primary', ''],
    ['normalize', 'judge_open', 'primary', ''],
    ['judge_ref', 'report', 'primary', ''],
    ['judge_open', 'report', 'primary', ''],
    ['release', 'release_boundary', 'secondary', ''],
    ['report', 'drift_boundary', 'secondary', ''],
    ['release_boundary', 'openness_boundary', 'secondary', ''],
  ], 'OpenAudioBench');
  const invalidSerialEdges = new Set([
    'reasoning|llama', 'llama|web', 'web|trivia', 'trivia|alpaca',
    'st|ss', 'judge_ref|judge_open',
  ]);
  assert.equal(
    en.edges.some(edge => invalidSerialEdges.has(`${edge.from}|${edge.to}`)),
    false,
    'OpenAudioBench parallel branches must not collapse into a serial pipeline',
  );
  assert.match(detail.drawio_review_note, /6afe8eff5e7e08603b1cd0759ff69d237568f125f7621687d88707f22353eb85/u);
  assert.match(detail.drawio_review_note, /805d456433dbf3e0edb2bdd302f733a4bd38ea84/u);
  assert.match(detail.drawio_review_note, /98f8fa0d5fa7e530ec8e6f097b55f10b003d111b/u);
  assert.match(detail.drawio_review_note, /b029466444a0c147e189c04ac06c8fe7349bd980fa97bbfcd13cec936a28e412/u);
  assert.match(detail.drawio_review_note, /844c49ac6af96421939e054d014f3204dcb0c3b8743fdac037e829b58b217abe/u);
  assert.match(detail.drawio_review_note, /202\/300\/1,000\/1,000\/199.*2,701/isu);
  assert.match(detail.drawio_review_note, /one round and multiply mean binary correctness by 10 rather than 100/isu);
  assert.match(detail.drawio_review_note, /public and ungated.*no dataset license.*no LICENSE file.*must not be generalized/isu);
});
