import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['ProcBench', 'ProgramBench'];
const expectedCounts = new Map([
  ['ProcBench', { nodes: 25, edges: 26, secondary: 4 }],
  ['ProgramBench', { nodes: 30, edges: 30, secondary: 6 }],
]);
const expectedNodeIds = new Map([
  ['ProcBench', [
    'source_evidence', 'design_goal', 'task_criteria', 'task_families',
    'fixed_templates', 'step_schedule', 'task_generator', 'length_gate',
    'ground_truth', 'benchmark_release', 'length_splits', 'model_prompt',
    'raw_response', 'extraction_schema', 'gpt4o_parser', 'parse_outcome',
    'exact_comparison', 'prefix_match_length', 'prefix_accuracy',
    'sequential_match', 'final_match', 'aggregate_report', 'release_boundary',
    'review_boundary', 'parser_boundary',
  ]],
  ['ProgramBench', [
    'source_evidence', 'candidate_repositories', 'collection_agent', 'gold_build',
    'behavior_sources', 'generate_tests', 'coverage_loop', 'assertion_linter',
    'validation_gate', 'sanitize_documentation', 'cleanroom_image',
    'paper_release', 'candidate_inputs', 'policy_prompt', 'agent_run',
    'submission', 'clean_eval_image', 'compile_submission', 'branch_selection',
    'hidden_pytest', 'junit_parser', 'ignored_test_filter', 'instance_score',
    'cheating_review', 'headline_metrics', 'release_drift_boundary',
    'license_boundary', 'construction_boundary', 'prompt_boundary',
    'cheating_boundary',
  ]],
]);
const primaryEdge = (from, to, waypoints = null) => ({
  from, to, type: 'primary', style: null, waypoints,
});
const secondaryEdge = (from, to) => ({
  from, to, type: 'secondary', style: { dashed: true }, waypoints: null,
});
const expectedEdges = new Map([
  ['ProcBench', [
    secondaryEdge('source_evidence', 'design_goal'),
    primaryEdge('design_goal', 'task_criteria'),
    primaryEdge('task_criteria', 'task_families'),
    primaryEdge('task_families', 'fixed_templates'),
    primaryEdge('fixed_templates', 'step_schedule'),
    primaryEdge('step_schedule', 'task_generator'),
    primaryEdge('task_generator', 'length_gate'),
    primaryEdge('length_gate', 'task_generator', [
      { x: 1960, y: 240 }, { x: 1700, y: 240 },
    ]),
    primaryEdge('length_gate', 'ground_truth'),
    primaryEdge('ground_truth', 'benchmark_release'),
    primaryEdge('benchmark_release', 'length_splits'),
    primaryEdge('benchmark_release', 'model_prompt'),
    primaryEdge('model_prompt', 'raw_response'),
    primaryEdge('raw_response', 'extraction_schema'),
    primaryEdge('extraction_schema', 'gpt4o_parser'),
    primaryEdge('gpt4o_parser', 'parse_outcome'),
    primaryEdge('parse_outcome', 'exact_comparison'),
    primaryEdge('exact_comparison', 'prefix_match_length'),
    primaryEdge('prefix_match_length', 'prefix_accuracy'),
    primaryEdge('prefix_accuracy', 'sequential_match'),
    primaryEdge('exact_comparison', 'final_match'),
    primaryEdge('sequential_match', 'aggregate_report'),
    primaryEdge('final_match', 'aggregate_report'),
    secondaryEdge('length_splits', 'release_boundary'),
    secondaryEdge('ground_truth', 'review_boundary'),
    secondaryEdge('gpt4o_parser', 'parser_boundary'),
  ]],
  ['ProgramBench', [
    secondaryEdge('source_evidence', 'candidate_repositories'),
    primaryEdge('candidate_repositories', 'collection_agent'),
    primaryEdge('collection_agent', 'gold_build'),
    primaryEdge('gold_build', 'behavior_sources'),
    primaryEdge('behavior_sources', 'generate_tests'),
    primaryEdge('generate_tests', 'coverage_loop'),
    primaryEdge('coverage_loop', 'assertion_linter'),
    primaryEdge('assertion_linter', 'validation_gate'),
    primaryEdge('validation_gate', 'coverage_loop', [
      { x: 2220, y: 240 }, { x: 1700, y: 240 },
    ]),
    primaryEdge('validation_gate', 'sanitize_documentation'),
    primaryEdge('sanitize_documentation', 'cleanroom_image'),
    primaryEdge('cleanroom_image', 'paper_release'),
    primaryEdge('paper_release', 'candidate_inputs', [
      { x: 3140, y: 100 }, { x: 3140, y: 500 }, { x: 2740, y: 500 },
    ]),
    primaryEdge('candidate_inputs', 'policy_prompt'),
    primaryEdge('policy_prompt', 'agent_run'),
    primaryEdge('agent_run', 'submission'),
    primaryEdge('submission', 'clean_eval_image'),
    primaryEdge('clean_eval_image', 'compile_submission'),
    primaryEdge('compile_submission', 'branch_selection'),
    primaryEdge('branch_selection', 'hidden_pytest'),
    primaryEdge('hidden_pytest', 'junit_parser'),
    primaryEdge('junit_parser', 'ignored_test_filter'),
    primaryEdge('ignored_test_filter', 'instance_score'),
    primaryEdge('instance_score', 'cheating_review'),
    primaryEdge('cheating_review', 'headline_metrics'),
    secondaryEdge('paper_release', 'release_drift_boundary'),
    secondaryEdge('release_drift_boundary', 'license_boundary'),
    secondaryEdge('collection_agent', 'construction_boundary'),
    secondaryEdge('policy_prompt', 'prompt_boundary'),
    secondaryEdge('cheating_review', 'cheating_boundary'),
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
    nodes: graph.nodes.map(
      ({ id, type, size, style, position }) => ({ id, type, size, style, position }),
    ),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function normalizedEdge({ from, to, type = 'primary', style, waypoints }) {
  return {
    from,
    to,
    type,
    style: style ?? null,
    waypoints: waypoints ?? null,
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

test('keeps ProcBench and ProgramBench source bundles bilingual, orthogonal, and style-locked', () => {
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
      assert.ok(graph.nodes.length <= 30, `${id} node ceiling`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      assert.deepEqual(
        graph.edges.map(normalizedEdge),
        expectedEdges.get(id),
        `${id} complete edge contract`,
      );
      assert.equal(
        graph.edges.filter(edge => edge.type === 'secondary').length,
        expected.secondary,
        `${id} secondary count`,
      );
      assert.ok(graph.nodes.every(node => String(node.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} edge labels prohibited`);
      for (const edge of graph.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} dashed`);
      }
      for (const edge of graph.edges.filter(candidate => candidate.type === 'primary')) {
        assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} solid`);
      }
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
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.doesNotMatch(detail.drawio_review_note, /Formal publication evidence/u, `${id} source-stage note`);
    assert.ok(detail.drawio_review_note.length > 5_000, `${id} evidence depth`);
  }
});

test('locks ProcBench v1 generation, automatic review boundary, typed parser, and four metrics', () => {
  const detail = readDetail('ProcBench');
  const en = readSpec('ProcBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2410.03117v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2410.03117v1');
  assert.equal(
    detail.repository_url,
    'https://github.com/ifujisawa/proc-bench/tree/06b98344a7302324f67449a50d98936c7a46ae49',
  );
  assert.equal(detail.homepage, detail.repository_url);
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/ifujisawa/procbench/tree/182e5139c73a6a31a2ea42e7b7d16398e3453d4a',
  );
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'source_evidence'), /2410\.03117v1.*cf5f2ecc5ba3.*06b98344a730.*182e5139c73/isu);
  assert.match(nodeLabel(en, 'design_goal'), /Fix the Path.*Minimize Implicit Knowledge.*Direct Multi-step/isu);
  assert.match(nodeLabel(en, 'task_criteria'), /Complete Procedure.*Human Step Simple.*Basic English/isu);
  assert.match(nodeLabel(en, 'task_families'), /23.*String, List and Integer.*No Specialized/isu);
  assert.match(nodeLabel(en, 'fixed_templates'), /One Fixed Template.*Full Procedure.*Every Resulting State/isu);
  assert.match(nodeLabel(en, 'step_schedule'), /2 through 25.*Ten Examples.*240/isu);
  assert.match(nodeLabel(en, 'length_gate'), /Generated State Length.*Drop.*Resample/isu);
  assert.match(nodeLabel(en, 'ground_truth'), /Initial State.*All Intermediate.*Typed Final/isu);
  assert.match(nodeLabel(en, 'benchmark_release'), /23 Families.*240.*5,520/isu);
  assert.match(nodeLabel(en, 'length_splits'), /Short.*2 to 6.*Medium.*7 to 16.*Long.*17 to 25/isu);
  assert.match(nodeLabel(en, 'model_prompt'), /Template plus Question.*Intermediate and Final.*No Task-specific/isu);
  assert.match(nodeLabel(en, 'extraction_schema'), /Ground-truth Field Types.*intermediate.*final.*Integer, String or List/isu);
  assert.match(nodeLabel(en, 'gpt4o_parser'), /gpt-4o-2024-08-06.*Pydantic.*Exclude Final/isu);
  assert.match(nodeLabel(en, 'parse_outcome'), /Task-specific Types.*Failure Insert Empty Prediction/isu);
  assert.match(nodeLabel(en, 'exact_comparison'), /Cast Integer or String.*Equal List Length and Order.*First Mismatch/isu);
  assert.match(nodeLabel(en, 'prefix_match_length'), /Consecutive Exact Matches.*First Error/isu);
  assert.match(nodeLabel(en, 'prefix_accuracy'), /Longer Sequence.*Extra.*Missing/isu);
  assert.match(nodeLabel(en, 'sequential_match'), /PA Equals One.*Full Sequence/isu);
  assert.match(nodeLabel(en, 'final_match'), /Last Target and Prediction.*Binary/isu);
  assert.match(nodeLabel(en, 'aggregate_report'), /PML.*PA.*SM.*FM.*Length Cohort/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /7aaeabca63f9.*MIT.*95499b2392f3.*CC BY 4\.0.*5,520/isu);
  assert.match(nodeLabel(en, 'review_boundary'), /Generator Produces Exact Labels.*No Human Review.*Do Not Infer/isu);
  assert.match(nodeLabel(en, 'parser_boundary'), /GPT-4o.*Pydantic.*Empty Output.*Metrics Include/isu);
  assertEdges(en, [
    ['source_evidence', 'design_goal', 'secondary'],
    ['task_generator', 'length_gate'],
    ['length_gate', 'task_generator'],
    ['length_gate', 'ground_truth'],
    ['benchmark_release', 'model_prompt'],
    ['gpt4o_parser', 'parse_outcome'],
    ['exact_comparison', 'prefix_match_length'],
    ['prefix_match_length', 'prefix_accuracy'],
    ['prefix_accuracy', 'sequential_match'],
    ['exact_comparison', 'final_match'],
    ['sequential_match', 'aggregate_report'],
    ['final_match', 'aggregate_report'],
    ['length_splits', 'release_boundary', 'secondary'],
    ['ground_truth', 'review_boundary', 'secondary'],
    ['gpt4o_parser', 'parser_boundary', 'secondary'],
  ], 'ProcBench');
  assert.match(detail.drawio_review_note, /cf5f2ecc5ba3a0d5df41aac012ef9e21207f1ffa07d185ae8dcb06786810b63c/u);
  assert.match(detail.drawio_review_note, /06b98344a7302324f67449a50d98936c7a46ae49/u);
  assert.match(detail.drawio_review_note, /7aaeabca63f9925d19a4858a158b86c36aa3a714/u);
  assert.match(detail.drawio_review_note, /2c7ae6c983e0d7fa833840d0b17645a314477c27/u);
  assert.match(detail.drawio_review_note, /182e5139c73a6a31a2ea42e7b7d16398e3453d4a/u);
  assert.match(detail.drawio_review_note, /95499b2392f35c5184101f18c349901643fee0e9/u);
  assert.match(detail.drawio_review_note, /exactly 5,520 newline-delimited records/iu);
  assert.match(detail.drawio_review_note, /Neither paper v1 nor the pinned code\/data release discloses a human annotation/iu);
  assert.match(detail.drawio_review_note, /gpt-4o-2024-08-06.*vacant prediction/isu);
  assert.match(detail.drawio_review_note, /MIT license.*CC-BY-4\.0/isu);
});

test('locks ProgramBench v1 construction, v1.2.4 drift, public parser, cheating gate, and leaderboard', () => {
  const detail = readDetail('ProgramBench');
  const en = readSpec('ProgramBench', 'en');
  const zh = readSpec('ProgramBench', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2605.03546v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2605.03546v1');
  assert.equal(detail.homepage, 'https://programbench.com');
  assert.equal(detail.has_leaderboard, true);
  assert.equal(
    detail.repository_url,
    'https://github.com/facebookresearch/ProgramBench/tree/963063c9271cc40fa179977356782ea4582e0b0c',
  );
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/programbench/ProgramBench-Tests/tree/de0ddfb637590c7ecb54fa0b5301f6dc7dfbcee5',
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2605\.03546v1.*87c67873f06f.*963063c9271c.*de0ddfb63759/isu);
  assert.match(nodeLabel(en, 'candidate_repositories'), /Standalone Program.*Compiled Languages.*Diverse/isu);
  assert.match(nodeLabel(en, 'collection_agent'), /mini-SWE-agent.*Claude Sonnet 4\.5.*Ubuntu 22\.04/isu);
  assert.match(nodeLabel(en, 'gold_build'), /Compile Original Source.*Verify.*Reproducible Build Script/isu);
  assert.match(nodeLabel(en, 'behavior_sources'), /Probe Gold.*Source, Tests and Documentation.*Harvest/isu);
  assert.match(nodeLabel(en, 'generate_tests'), /Pytest.*Output, Exit and File Effects.*Source-level/isu);
  assert.match(nodeLabel(en, 'coverage_loop'), /First-party Line Coverage.*Missing Code Paths.*Coverage Target/isu);
  assert.match(nodeLabel(en, 'assertion_linter'), /Exit-code-only.*Short Substrings.*OR Logic.*Repair/isu);
  assert.match(nodeLabel(en, 'validation_gate'), /Deterministic Gold.*Dummy Binary.*Revise or Discard/isu);
  assert.match(nodeLabel(en, 'sanitize_documentation'), /User-visible Interfaces.*Remove Source.*Implementation Details/isu);
  assert.match(nodeLabel(en, 'cleanroom_image'), /Execute-only Gold.*Independent Fresh Image.*Essential Test Assets/isu);
  assert.match(nodeLabel(en, 'paper_release'), /200.*248,853.*Median 770/isu);
  assert.match(nodeLabel(en, 'candidate_inputs'), /Execute-only.*Sanitized Docs.*Tests Hidden/isu);
  assert.match(nodeLabel(en, 'policy_prompt'), /No Source Lookup or Internet.*No Wrapping.*No Decompilation or Tracing/isu);
  assert.match(nodeLabel(en, 'agent_run'), /Any Language.*20 CPUs.*60 GB.*1,000 Steps.*6 Hours/isu);
  assert.match(nodeLabel(en, 'submission'), /Source Code.*compile\.sh.*submission\.tar\.gz/isu);
  assert.match(nodeLabel(en, 'clean_eval_image'), /Clean Workspace.*Gold-hash.*Block Internet/isu);
  assert.match(nodeLabel(en, 'compile_submission'), /chmod.*compile\.sh.*Build Failure/isu);
  assert.match(nodeLabel(en, 'branch_selection'), /tests\.json.*Non-ignored Branches.*HF/isu);
  assert.match(nodeLabel(en, 'hidden_pytest'), /Hidden Behavioral Pytest.*Observable Gold Behavior.*JUnit XML/isu);
  assert.match(nodeLabel(en, 'junit_parser'), /Passed, Failure and Error.*Missing Expected Tests Not-run.*Duplicates/isu);
  assert.match(nodeLabel(en, 'ignored_test_filter'), /Ignored Entries.*Warnings.*Non-passes/isu);
  assert.match(nodeLabel(en, 'instance_score'), /Passed \/ Active Tests.*All Tests Pass.*Partial Progress/isu);
  assert.match(nodeLabel(en, 'cheating_review'), /Trajectory and Codebase.*Source Lookup or Wrapping.*Majority/isu);
  assert.match(nodeLabel(en, 'headline_metrics'), /% Resolved.*% Tests Passed.*% Almost.*95%/isu);
  assert.match(nodeLabel(en, 'release_drift_boundary'), /201 Task Dirs.*Calculator Fixture.*313,292.*65,845.*247,447.*200 Tasks.*248,853/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Git Evaluator Code Uses MIT.*HF Test Dataset Card Uses MIT.*Upstream Licenses.*200/isu);
  assert.match(nodeLabel(en, 'construction_boundary'), /Agent, Model and Image.*Exact Pipeline Code Is Not Released.*Evaluation/isu);
  assert.match(nodeLabel(en, 'prompt_boundary'), /Appendix.*Public Evaluator Is Scaffold-agnostic.*External/isu);
  assert.match(nodeLabel(en, 'cheating_boundary'), /Nine LM Judges.*3 GPT-5\.2.*3 Sonnet 4\.5.*3 Gemini 3\.1 Pro.*Five.*Not Implemented/isu);
  assertEdges(en, [
    ['source_evidence', 'candidate_repositories', 'secondary'],
    ['behavior_sources', 'generate_tests'],
    ['validation_gate', 'coverage_loop'],
    ['validation_gate', 'sanitize_documentation'],
    ['paper_release', 'candidate_inputs'],
    ['submission', 'clean_eval_image'],
    ['compile_submission', 'branch_selection'],
    ['hidden_pytest', 'junit_parser'],
    ['junit_parser', 'ignored_test_filter'],
    ['instance_score', 'cheating_review'],
    ['cheating_review', 'headline_metrics'],
    ['paper_release', 'release_drift_boundary', 'secondary'],
    ['release_drift_boundary', 'license_boundary', 'secondary'],
    ['collection_agent', 'construction_boundary', 'secondary'],
    ['policy_prompt', 'prompt_boundary', 'secondary'],
    ['cheating_review', 'cheating_boundary', 'secondary'],
  ], 'ProgramBench');
  assert.match(detail.intro_en, /Paper v1.*200 tasks.*248,853.*v1\.2\.4.*201 task directories.*313,292.*65,845.*247,447/isu);
  assert.match(detail.scale_en, /Paper v1.*200.*248,853.*Git v1\.2\.4.*201.*313,292.*65,845.*247,447.*HF.*200/isu);
  assert.match(nodeLabel(zh, 'release_drift_boundary'), /201 个任务目录.*计算器夹具.*313,292.*65,845.*247,447.*200 任务.*248,853/isu);
  assert.match(detail.scale, /论文v1.*200.*248,853.*Git v1\.2\.4.*201.*313,292.*65,845.*247,447.*HF.*200/isu);
  assert.match(detail.drawio_review_note, /87c67873f06f48044ef3a1bcd5bed21be2c90d92090bfb3b73b6ca7b9b13781c/u);
  assert.match(detail.drawio_review_note, /963063c9271cc40fa179977356782ea4582e0b0c/u);
  assert.match(detail.drawio_review_note, /0662e455d08e8c6e8d326a615d0cd4c6e448cf72/u);
  assert.match(detail.drawio_review_note, /5359d3203ba900aa0a06d03e26674d22a832297d/u);
  assert.match(detail.drawio_review_note, /de0ddfb637590c7ecb54fa0b5301f6dc7dfbcee5/u);
  assert.match(detail.drawio_review_note, /b246f23d99b1b75ec149ccaffa1bc7c213d3d989/u);
  assert.match(detail.drawio_review_note, /201 task directories.*testorg__calculator\.abc1234.*313,292.*65,845.*247,447/isu);
  assert.match(detail.drawio_review_note, /200 task directories.*1,832 branches.*313,289.*247,444/isu);
  assert.match(detail.drawio_review_note, /Nine LM judges.*three GPT-5\.2.*three Claude Sonnet 4\.5.*three Gemini 3\.1 Pro.*at least five/isu);
  assert.match(detail.drawio_review_note, /public eval CLI.*does not implement.*judge panel/isu);
  assert.match(detail.drawio_review_note, /Website and Leaderboard.*programbench\.com/isu);
  assert.match(detail.drawio_review_note, /root MIT license.*HF dataset card declares MIT.*upstream/isu);
});
