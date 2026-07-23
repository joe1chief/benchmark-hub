import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MlogiQA', 'Monorepo-Bench'];
const expectedCounts = new Map([
  ['MlogiQA', { nodes: 24, edges: 24 }],
  ['Monorepo-Bench', { nodes: 17, edges: 16 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'pdf_cdn_url',
  'org',
  'build_method',
  'metric',
  'openness',
  'task_type',
  'eval_feature',
  'scale',
  'homepage',
  'intro_en',
  'build_method_en',
  'metric_en',
  'task_type_en',
  'eval_feature_en',
  'scale_en',
  'has_leaderboard',
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

function assertEdge(graph, from, to, type, label = '') {
  const edge = graph.edges.find(candidate => (
    candidate.from === from
    && candidate.to === to
    && candidate.type === type
    && String(candidate.label ?? '') === label
  ));
  assert.ok(edge, `missing edge ${from}|${to}|${type}|${label}`);
  return edge;
}

test('keeps the MlogiQA and Monorepo-Bench source diagrams bilingual and catalog-synchronized', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.find(candidate => candidate.id === id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    assert.ok(summary, `${id} catalog entry`);
    assert.deepEqual(summary, detail, `${id} full catalog sync`);
    for (const key of syncedKeys) {
      assert.deepEqual(summary[key], detail[key], `${id}.${key} catalog sync`);
    }
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
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks MlogiQA construction, parallel-key, prompt, parser, metric, and release-code boundaries', () => {
  const detail = readDetail('MlogiQA');
  const en = readSpec('MlogiQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2411.09116v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2411.09116v2');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/Qwen/P-MMEval/tree/47bb647f35fdd6f5374826b3f5d4f84eb5b5afce/mlogiqa',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'source'), /LogiQA Original Test Pairs.*651 English.*651 Chinese/isu);
  assert.match(nodeLabel(en, 'candidate_order'), /First N in Source Order.*Published IDs 0–103/isu);
  assert.match(nodeLabel(en, 'languages'), /Ten Languages.*Seven Language Families/isu);
  assert.match(nodeLabel(en, 'translate'), /Eight Missing Languages.*GPT-4o-2024-05-13/isu);
  assert.match(nodeLabel(en, 'professional_review'), /Professional Translation Team.*Exhaustive Review/isu);
  assert.match(nodeLabel(en, 'edit_rates'), /AR 22\.50.*ES 30\.00.*JA 51\.25.*KO 33\.75.*TH 46\.25.*FR 3\.75.*PT 46\.25.*VI 18\.75/isu);
  assert.match(nodeLabel(en, 'selection_boundary'), /Replacement Rule after Removals.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'align'), /Normalize ID Type.*Do Not Zip Row Order.*Same ID and Gold Set/isu);
  assert.match(nodeLabel(en, 'release'), /80 Test Items per Language.*800 Test Instances/isu);
  assert.match(nodeLabel(en, 'fewshot'), /Eight Validation Rows per Language.*Paper Does Not State k/isu);
  assert.match(nodeLabel(en, 'prompt_settings'), /EN.*Native.*EN-Few-shot/isu);
  assert.match(nodeLabel(en, 'direct'), /Direct Answer.*No CoT.*Fixed JSON/isu);
  assert.match(nodeLabel(en, 'generation_boundary'), /Decoding Parameters.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'released_code_boundary'), /options Array.*Four Numbered Option Fields.*EN Zero-shot.*ZeroRetriever/isu);
  assert.match(
    nodeLabel(en, 'parse'),
    /Last JSON or Native-phrase Match.*JSON Regex: Uppercase A–D Only.*Native Phrase May Yield a–d.*Compare Case-insensitively/isu,
  );
  assert.match(nodeLabel(en, 'parser_abort'), /passes None to Fuzzy Scan.*TypeError.*No Score/isu);
  assert.match(nodeLabel(en, 'accuracy'), /Correct Choices ÷ All 80.*Rounded to Two Decimals/isu);
  assert.match(nodeLabel(en, 'cacr'), /Both Correct among English-correct.*Aligned IDs/isu);
  assert.match(nodeLabel(en, 'cacr_boundary'), /No Released CACR Implementation/isu);
  assert.match(nodeLabel(en, 'rights_boundary'), /Apache-2\.0.*LogiQA Repo Has No LICENSE.*No Dedicated Leaderboard/isu);
  assert.match(nodeLabel(en, 'review_gate'), /Faithful.*Natural.*Translatable/isu);
  assert.match(nodeLabel(en, 'localize'), /Retained Item.*Correct and Localize/isu);
  assert.match(nodeLabel(en, 'remove'), /Rejected Item.*Remove Non-translatable/isu);
  assert.match(nodeLabel(en, 'parse_gate'), /Choice Extracted.*A.*B.*C.*D/isu);
  assert.match(nodeLabel(en, 'accuracy'), /Extracted.*Score Per-language Accuracy/isu);
  assert.match(nodeLabel(en, 'parser_abort'), /Unparseable.*Released Failure Path/isu);
  assertEdge(en, 'review_gate', 'localize', 'primary');
  assertEdge(en, 'review_gate', 'remove', 'primary');
  assertEdge(en, 'parse_gate', 'accuracy', 'primary');
  assertEdge(en, 'parse_gate', 'parser_abort', 'primary');
  assert.match(detail.drawio_review_note, /00f32884b4d5f08b5ecd601d7be71099f8b2559cc2f927c5d8b3adf0d1bf3a7d/u);
  assert.match(detail.drawio_review_note, /47bb647f35fdd6f5374826b3f5d4f84eb5b5afce/u);
  assert.match(detail.drawio_review_note, /ff6c4cbca47627b3ac2da94a29fa28204a167b41/u);
  assert.match(detail.drawio_review_note, /e2a290fd46f900cfb7a7e86f79d2c763dad17c43/u);
  assert.match(detail.drawio_review_note, /numeric IDs.*string IDs.*row order/isu);
  assert.match(detail.drawio_review_note, /options\[\].*option_1/isu);
  assert.match(detail.drawio_review_note, /JSON choice is uppercase A–D.*lowercase a–d.*lowercases both sides/isu);
  assert.match(detail.drawio_review_note, /TypeError/iu);
});

test('locks Monorepo-Bench disclosed rollout, all-tests gate, pass@1, and in-house boundary', () => {
  const detail = readDetail('Monorepo-Bench');
  const en = readSpec('Monorepo-Bench', 'en');

  assert.equal(
    detail.paper_url,
    'https://deploymentsafety.openai.com/gpt-5-3-codex/gpt-5-3-codex.pdf',
  );
  assert.equal(detail.openness, 'in-house');
  assert.equal(detail.scale_en, 'Not disclosed');
  assert.equal(detail.metric_en, 'Pass@1 (all task-specific hidden tests must pass)');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'scope'), /Real-world Software and Research Engineering.*Large Internal Repository/isu);
  assert.match(nodeLabel(en, 'curate'), /Pull-request-style Changes.*Task Count and Selection Undisclosed/isu);
  assert.match(nodeLabel(en, 'human_assets'), /Prompts.*Hints.*Unit Tests.*Human-written/isu);
  assert.match(nodeLabel(en, 'prompt'), /Prompt Describes Required Changes.*Hint Delivery Not Disclosed/isu);
  assert.match(nodeLabel(en, 'checkout'), /Pre-change Branch/isu);
  assert.match(nodeLabel(en, 'rollout'), /Agentic Rollout.*Command-line Tools.*Python/isu);
  assert.match(nodeLabel(en, 'hidden_tests'), /Hidden Unit-test Grading.*Task-specific Tests/isu);
  assert.match(nodeLabel(en, 'gate'), /All Hidden Tests Pass/isu);
  assert.match(nodeLabel(en, 'success'), /Pass.*Successful Rollout/isu);
  assert.match(nodeLabel(en, 'failure'), /Fail.*Not a Success/isu);
  assert.match(nodeLabel(en, 'failure'), /Not a Success.*Partial Credit Not Reported/isu);
  assert.match(nodeLabel(en, 'pass1'), /One Sample = One Agentic Rollout.*Figure Axis: pass@1/isu);
  assert.match(nodeLabel(en, 'figure'), /GPT-5\.1-Codex-Max 53%.*GPT-5\.2-Thinking No Browse 55%.*GPT-5\.2-Codex 55%.*GPT-5\.3-Codex 56%/isu);
  assert.match(nodeLabel(en, 'undisclosed'), /Task Weighting.*Error-bar Method.*Rollout Budget/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /No Public Repository.*Dataset.*Task Artifacts.*License.*Leaderboard/isu);
  assert.match(nodeLabel(en, 'metric_boundary'), /Task Count.*Selection Funnel.*Error Bars.*Not Disclosed/isu);
  assertEdge(en, 'gate', 'success', 'primary');
  assertEdge(en, 'gate', 'failure', 'primary');
  assertEdge(en, 'curate', 'undisclosed', 'secondary');
  assertEdge(en, 'human_assets', 'source_boundary', 'secondary');
  assert.equal(en.nodes.find(node => node.id === 'undisclosed').position.y, 256);
  assert.equal(en.nodes.find(node => node.id === 'source_boundary').position.y, 256);
  assert.match(detail.drawio_review_note, /320635949a1e8b127af026167c4e991bb73a7e1f2ab824ee07fd764a92708107/u);
  assert.match(detail.drawio_review_note, /February 5, 2026/u);
  assert.match(detail.drawio_review_note, /Figure 8.*pass@1.*53%.*55%.*55%.*56%/isu);
  assert.match(detail.intro_en, /hints are human-written.*does not disclose whether or how/isu);
  assert.match(detail.drawio_review_note, /does not say whether or how hints are supplied/isu);
  assert.match(detail.drawio_review_note, /does not disclose.*task count.*selection/isu);
  assert.match(detail.drawio_review_note, /no public repository.*dataset.*leaderboard/isu);
});
