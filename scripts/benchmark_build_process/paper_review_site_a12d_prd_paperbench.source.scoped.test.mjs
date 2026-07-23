import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PRDBench', 'PaperBench'];
const expectedCounts = new Map([
  ['PRDBench', { nodes: 30, edges: 34, secondary: 4 }],
  ['PaperBench', { nodes: 30, edges: 31, secondary: 5 }],
]);
const expectedNodeIds = new Map([
  ['PRDBench', [
    'source_evidence', 'seed_sources', 'eligibility', 'domain_sampling',
    'prd_initialization', 'aaa_outline', 'scaffold', 'criteria_scheme',
    'human_inspection', 'repair_loop', 'inclusion_gate', 'remove_scaffold',
    'benchmark_release', 'development_round', 'judge_inputs', 'test_type_gate',
    'unit_test', 'shell_interaction', 'file_comparison', 'metric_report',
    'debug_round', 'final_score', 'judge_candidates', 'human_labels',
    'exact_match_filter', 'tool_filter', 'finetune_prdjudge', 'count_boundary',
    'code_boundary', 'model_boundary',
  ]],
  ['PaperBench', [
    'source_evidence', 'icml_pool', 'automated_filters', 'dependency_filters',
    'author_outreach', 'engineer_draft', 'rubric_tree',
    'leaf_design', 'author_verification', 'addenda',
    'task_release', 'agent_rollout', 'submission', 'clean_reproduction',
    'executed_submission', 'requirement_gate', 'code_development', 'execution',
    'result_match', 'simplejudge', 'binary_leaf',
    'weighted_rollup', 'final_metric', 'judgeeval_examples',
    'evaluate_judges', 'judgeeval_result', 'candidate_boundary',
    'release_boundary', 'release_fix_boundary', 'code_dev_boundary',
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

function edgeKey(from, to, type = 'primary') {
  return `${from}|${to}|${type}`;
}

function assertEdges(graph, expected, context) {
  const actual = new Set(graph.edges.map(edge => edgeKey(edge.from, edge.to, edge.type)));
  for (const [from, to, type = 'primary'] of expected) {
    assert.ok(actual.has(edgeKey(from, to, type)), `${context} missing ${from}->${to} (${type})`);
  }
}

test('keeps PRDBench and PaperBench source-stage graphs bilingual and topology-locked', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    for (const graph of [en, zh]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source`);
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
      assert.ok(graph.nodes.every(node => String(node.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} duplicate edge labels`);
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
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 38, `${id}.${node.id} Chinese line width: ${line}`);
      }
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} dashed`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'primary')) {
      assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} primary`);
    }
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 5_000, `${id} review evidence length`);
  }
});

test('locks PRDBench v3 construction, count drift, PRDJudge training, and two-round evaluation', () => {
  const detail = readDetail('PRDBench');
  const en = readSpec('PRDBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2510.24358v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2510.24358v3');
  assert.equal(
    detail.repository_url,
    'https://github.com/AGI-Eval-Official/PRDBench/tree/050bbcbd1332d94f031d67ca4427af0e48c58c91',
  );
  assert.equal(detail.homepage, detail.repository_url);
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/AGI-Eval/PRDbench/tree/9eaa70817b224e404c21b56bc732c997cb40c3db',
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2510\.24358v3.*c9b6ac8d4e97.*050bbcbd1332.*9eaa70817b22/isu);
  assert.match(nodeLabel(en, 'seed_sources'), /AI-product Requests.*CS-course Final Projects.*CS-thesis Reproduction/isu);
  assert.match(nodeLabel(en, 'eligibility'), /Fully Implementable in Python.*Associated Data Are Public/isu);
  assert.match(nodeLabel(en, 'domain_sampling'), /GPT-4.*Rare-domain Coverage.*50 Tasks in 20 Domains/isu);
  assert.match(nodeLabel(en, 'prd_initialization'), /Claude Code.*Requirement and Function.*Data Requirements and Interfaces/isu);
  assert.match(nodeLabel(en, 'aaa_outline'), /GPT-4\.1.*AAA.*Arrange.*Act.*Assert/isu);
  assert.match(nodeLabel(en, 'scaffold'), /SOTA Code Agent.*Interfaces for Annotation.*May Remain Imperfect/isu);
  assert.match(nodeLabel(en, 'criteria_scheme'), /Scoring Point.*Test Interfaces and Artifacts.*Expected Outputs/isu);
  assert.match(nodeLabel(en, 'human_inspection'), /Run Tests on the Scaffold.*Interface Compatibility.*against the PRD/isu);
  assert.match(nodeLabel(en, 'inclusion_gate'), /At Least Five Refinement Rounds.*Issues Resolved.*Continue the Loop/isu);
  assert.match(nodeLabel(en, 'remove_scaffold'), /Retain PRD and Criteria.*Test Artifacts and Data.*Code from Scratch/isu);
  assert.match(nodeLabel(en, 'benchmark_release'), /50 Python Projects.*20 Domains.*1,258.*408 Unit.*732 Shell.*118 File/isu);
  assert.match(nodeLabel(en, 'count_boundary'), /Git\/HF Snapshot Has 1,259.*408 Unit.*732 Shell.*119 File.*1,258/isu);
  assert.match(nodeLabel(en, 'development_round'), /Round 1.*PRD\.md and Test Plan.*Implement.*src/isu);
  assert.match(nodeLabel(en, 'test_type_gate'), /Execute Command Verbatim.*Log, State, or File/isu);
  assert.match(nodeLabel(en, 'metric_report'), /Score 2 Pass.*1 Partial.*0 Fail.*round1 or round2 JSONL/isu);
  assert.match(nodeLabel(en, 'debug_round'), /Round 2.*Round-1 Deduction Report.*Same PRDJudge Flow/isu);
  assert.match(nodeLabel(en, 'final_score'), /Mean Score \/ 2.*Average across Valid Projects.*Debug Enhancement/isu);
  assert.match(nodeLabel(en, 'judge_candidates'), /Qwen3-Coder-480B-A3B.*11 Code Agents.*Eight Repositories/isu);
  assert.match(nodeLabel(en, 'human_labels'), /Two Independent Annotators.*Senior Arbiter.*0, 1, 2/isu);
  assert.match(nodeLabel(en, 'exact_match_filter'), /2,147.*1,742.*Matching Humans/isu);
  assert.match(nodeLabel(en, 'tool_filter'), /Rule-based Tool Filter.*Invalid Tool Usage.*911/isu);
  assert.match(nodeLabel(en, 'finetune_prdjudge'), /Qwen3-Coder-30B-A3B.*LoRA.*Rank 16.*One Epoch.*2e-4.*Eight H800/isu);
  assert.match(nodeLabel(en, 'model_boundary'), /Checkpoint Not Released.*Model Endpoint/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /50 PRDs.*Git 77f22c9b.*HF 4994faf2.*MIT.*No LICENSE.*No License/isu);
  assertEdges(en, [
    ['source_evidence', 'seed_sources', 'secondary'],
    ['human_inspection', 'repair_loop'],
    ['repair_loop', 'inclusion_gate'],
    ['inclusion_gate', 'repair_loop'],
    ['inclusion_gate', 'remove_scaffold'],
    ['benchmark_release', 'development_round'],
    ['test_type_gate', 'unit_test'],
    ['test_type_gate', 'shell_interaction'],
    ['test_type_gate', 'file_comparison'],
    ['metric_report', 'debug_round'],
    ['debug_round', 'judge_inputs'],
    ['benchmark_release', 'judge_candidates'],
    ['tool_filter', 'finetune_prdjudge'],
    ['finetune_prdjudge', 'judge_inputs'],
    ['development_round', 'count_boundary', 'secondary'],
    ['count_boundary', 'code_boundary', 'secondary'],
    ['finetune_prdjudge', 'model_boundary', 'secondary'],
  ], 'PRDBench');
  assert.match(detail.intro_en, /1,258.*408 unit.*732 shell.*118 file.*1,259.*additional file-comparison/isu);
  assert.match(detail.scale_en, /1,258.*1,259/isu);
  assert.match(detail.drawio_review_note, /c9b6ac8d4e97c1b821ac5dd5cbb600be59d271614094899ec330e32046b55469/u);
  assert.match(detail.drawio_review_note, /77f22c9b24ad6a1b1d46da13b180592df9c9bfc2/u);
  assert.match(detail.drawio_review_note, /4994faf27324661cc1733905c2c4e1bc34b9f7c8/u);
  assert.match(detail.drawio_review_note, /1,259 records: 408 unit_test, 732 shell_interaction, and 119 file_comparison/u);
  assert.match(detail.drawio_review_note, /neither the v3 paper nor the pinned release/u);
  assert.match(detail.drawio_review_note, /no root LICENSE file.*README states.*MIT.*no YAML license/isu);
});

test('locks PaperBench v3 selection, rubric, reproduction, grading, and JudgeEval branches', () => {
  const detail = readDetail('PaperBench');
  const en = readSpec('PaperBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.01848v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.01848v3');
  assert.equal(
    detail.repository_url,
    'https://github.com/openai/frontier-evals/tree/df37a1752ad6b091e223e75606c51aacab4215a5/project/paperbench',
  );
  assert.equal(detail.homepage, detail.repository_url);
  assert.equal(detail.dataset_url, undefined);
  assert.match(nodeLabel(en, 'source_evidence'), /2504\.01848v3.*2f58f1a6581a.*df37a1752ad6.*caec0bdac8e6/isu);
  assert.match(nodeLabel(en, 'icml_pool'), /ICML 2024.*Spotlight and Oral/isu);
  assert.match(nodeLabel(en, 'automated_filters'), /GPT-4o.*Commercial and Geographic.*Empirical.*Single-machine/isu);
  assert.match(nodeLabel(en, 'dependency_filters'), /No Closed-model.*No New Human Data.*Reproducible.*Accessible/isu);
  assert.match(nodeLabel(en, 'author_outreach'), /Manually Screen.*Suitability.*42.*20 Collaborations.*12 ICML Topics/isu);
  assert.match(nodeLabel(en, 'engineer_draft'), /Two Engineers.*Decompose Empirical Contributions.*Complete-replication/isu);
  assert.match(nodeLabel(en, 'rubric_tree'), /Hierarchical Rubric.*Tree.*Children Refine Parent.*Weight Importance/isu);
  assert.match(nodeLabel(en, 'leaf_design'), /15 Minutes.*Code Dev.*Execution.*Result Match.*8,316.*20 Papers/isu);
  assert.match(nodeLabel(en, 'author_verification'), /Internal and Author Review.*Refine Structure.*Formal Original-author.*Multiple Feedback.*Final Sign-off/isu);
  assert.match(nodeLabel(en, 'addenda'), /Candidate-facing Addendum.*Judge-only Addendum.*Scope/isu);
  assert.match(nodeLabel(en, 'agent_rollout'), /Paper.*Addendum.*Instructions.*Ubuntu 24\.04.*A10.*12 Hours/isu);
  assert.match(nodeLabel(en, 'submission'), /from Scratch.*reproduce\.sh/isu);
  assert.match(nodeLabel(en, 'clean_reproduction'), /Fresh VM.*Ubuntu 24\.04.*A10.*reproduce\.sh.*12 Hours/isu);
  assert.match(nodeLabel(en, 'executed_submission'), /reproduce\.log.*Generated Results and Plots/isu);
  assert.match(nodeLabel(en, 'requirement_gate'), /Leaf Requirement Type.*Full Rubric.*Prior Siblings\/Ancestors.*Independently/isu);
  assert.match(nodeLabel(en, 'code_development'), /Docs and Source Code.*reproduce\.sh.*Correct Code/isu);
  assert.match(nodeLabel(en, 'execution'), /Docs, Code and Script.*reproduce\.log.*Execution Occur/isu);
  assert.match(nodeLabel(en, 'result_match'), /Script and Log.*Modified Outputs.*Evidence Match/isu);
  assert.match(nodeLabel(en, 'simplejudge'), /o3-mini-2025-01-31.*High.*Whitelist.*Top Ten.*Paper.*Addenda.*Evidence/isu);
  assert.match(nodeLabel(en, 'binary_leaf'), /One if.*Zero Otherwise.*Missing Script Zeros/isu);
  assert.match(nodeLabel(en, 'weighted_rollup'), /Parent = Weighted Child Mean.*Root = Replication Score/isu);
  assert.match(nodeLabel(en, 'final_metric'), /Average Replication Score.*20 Papers.*Three Runs/isu);
  assert.match(nodeLabel(en, 'judgeeval_examples'), /Four PaperBench.*One Development-paper.*Expert Binary Gold.*No Reproduction/isu);
  assert.match(nodeLabel(en, 'evaluate_judges'), /GPT-4o-mini.*GPT-4o.*o1-mini.*o1.*o3-mini.*Macro-average/isu);
  assert.match(nodeLabel(en, 'judgeeval_result'), /Accuracy.*Precision.*Recall.*F1.*0\.83.*66 USD/isu);
  assert.match(nodeLabel(en, 'candidate_boundary'), /Rubric Hidden.*Original-author Code Forbidden.*Blacklist/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /df37a1752ad6.*MIT.*20 All.*3 Dev.*Five JudgeEval/isu);
  assert.match(nodeLabel(en, 'release_fix_boundary'), /Initial 352ed048 Missed Data.*Stochastic Interpolants.*Third Dev/isu);
  assert.match(nodeLabel(en, 'code_dev_boundary'), /Skip Clean Reproduction.*Code Development Leaves Only.*Less Rigorous/isu);
  assertEdges(en, [
    ['source_evidence', 'icml_pool', 'secondary'],
    ['author_outreach', 'engineer_draft'],
    ['leaf_design', 'author_verification'],
    ['addenda', 'task_release'],
    ['task_release', 'agent_rollout'],
    ['submission', 'clean_reproduction'],
    ['executed_submission', 'requirement_gate'],
    ['requirement_gate', 'code_development'],
    ['requirement_gate', 'execution'],
    ['requirement_gate', 'result_match'],
    ['code_development', 'simplejudge'],
    ['execution', 'simplejudge'],
    ['result_match', 'simplejudge'],
    ['binary_leaf', 'weighted_rollup'],
    ['simplejudge', 'judgeeval_examples'],
    ['judgeeval_examples', 'evaluate_judges'],
    ['evaluate_judges', 'judgeeval_result'],
    ['agent_rollout', 'candidate_boundary', 'secondary'],
    ['submission', 'release_boundary', 'secondary'],
    ['clean_reproduction', 'release_fix_boundary', 'secondary'],
    ['code_development', 'code_dev_boundary', 'secondary'],
  ], 'PaperBench');
  assert.ok(!en.edges.some(edge => edge.from === 'agent_rollout' && edge.to === 'requirement_gate'));
  assert.ok(!en.edges.some(edge => edge.from === 'submission' && edge.to === 'simplejudge'));
  assert.match(detail.intro_en, /20 ICML 2024.*8,316.*reproduce\.sh.*fresh environment.*SimpleJudge/isu);
  assert.match(detail.drawio_review_note, /2f58f1a6581af9d99432422dccf3cf61f5c263377c1e4550e7333c4a22d7184d/u);
  assert.match(detail.drawio_review_note, /df37a1752ad6b091e223e75606c51aacab4215a5/u);
  assert.match(detail.drawio_review_note, /caec0bdac8e6c8a29a0df88d4ff9d9fc5a7ccf83/u);
  assert.match(detail.drawio_review_note, /initial official release commit 352ed048.*all\.txt referenced stochastic-interpolants without its data/isu);
  assert.match(detail.drawio_review_note, /20 IDs.*three development IDs.*five JudgeEval/isu);
  assert.match(detail.drawio_review_note, /candidate receives the paper.*addendum.*does not see the rubric.*cannot use the original authors' codebases/isu);
  assert.match(detail.drawio_review_note, /missing reproduce\.sh forces Execution and Result Match leaves to zero/isu);
  assert.match(detail.drawio_review_note, /Code-Dev skips reproduction.*Code Development leaves.*less rigorous/isu);
});
