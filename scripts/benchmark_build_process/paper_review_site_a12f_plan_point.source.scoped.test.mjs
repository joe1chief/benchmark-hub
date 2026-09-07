import { assertPublishedContract } from './assert_published_contract.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PlanBench-XL', 'Point-Bench'];
const expectedCounts = new Map([
  ['PlanBench-XL', { nodes: 30, edges: 34, secondary: 5 }],
  ['Point-Bench', { nodes: 23, edges: 23, secondary: 5 }],
]);

const expectedLabelDigests = new Map([
  ['PlanBench-XL', {
    en: 'b9270dff99b2f4609a8fae7a44d455eb4d47b3ee557fc4e9853c4df894dc0087',
    zh: '681832d656b01c87da25c5a55403046489b5bb7ad6f60d824b35f1bd63953cd1',
  }],
  ['Point-Bench', {
    en: '90566cf5d14b7b1ffbe49f30dc723eb93a5771420abb56bf8f45544035d187bd',
    zh: 'd254feb836808e4aa42083a0e1e2dbce79ecb471ec8ec8623d741cfd1b009945',
  }],
]);

const node = (id, type, x, y, style) => ({
  id,
  type,
  size: 'xl',
  position: { x, y },
  ...(style === undefined ? {} : { style }),
});

const edge = (from, to, type = 'primary', style, waypoints) => ({
  from,
  to,
  type,
  ...(style === undefined ? {} : { style }),
  ...(waypoints === undefined ? {} : { waypoints }),
});

const secondaryEdge = (from, to) => edge(from, to, 'secondary', { dashed: true });

const expectedGraphs = new Map([
  ['PlanBench-XL', {
    nodes: [
      node('source_evidence', 'document', 20, 300, { fontSize: 10 }),
      node('datatype_proposal', 'process', 260, 300),
      node('datatype_filter', 'process', 500, 300, { fontSize: 9 }),
      node('tool_candidates', 'process', 740, 300),
      node('tool_filter', 'process', 980, 300, { fontSize: 9 }),
      node('tool_schema', 'process', 1220, 300, { fontSize: 9 }),
      node('noisy_tools', 'process', 1460, 300, { fontSize: 9 }),
      node('backend', 'database', 1700, 300, { fontSize: 9 }),
      node('task_spec', 'process', 1940, 300, { fontSize: 9 }),
      node('state_graph', 'process', 2180, 300, { fontSize: 9 }),
      node('task_filter', 'process', 2420, 300),
      node('instantiate_query', 'process', 2660, 300, { fontSize: 9 }),
      node('gold_answer', 'document', 2900, 300, { fontSize: 9 }),
      node('paper_dataset', 'database', 3140, 300, { fontSize: 9 }),
      node('runtime_state', 'process', 3380, 300, { fontSize: 9 }),
      node('action_gate', 'process', 3620, 300),
      node('retriever', 'process', 3860, 60, { fontSize: 9 }),
      node('default_candidates', 'process', 4100, 20, { fontSize: 9 }),
      node('blocker_mode', 'process', 4100, 220, { fontSize: 9 }),
      node('tool_call', 'process', 3860, 380, { fontSize: 9 }),
      node('feedback', 'process', 4340, 300),
      node('budget_gate', 'process', 4580, 520, { fontSize: 9 }),
      node('answer_check', 'process', 3860, 760),
      node('completion_metrics', 'process', 4340, 760),
      node('behavior_metrics', 'process', 4340, 1040, { fontSize: 9 }),
      node('report', 'terminal', 4580, 900, { fontSize: 9 }),
      node('human_validation', 'document', 1700, 1160, { fontSize: 9 }),
      node('release_snapshot', 'document', 3140, 1160, { fontSize: 9 }),
      node('implementation_boundary', 'document', 4580, 1280, { fontSize: 9 }),
      node('license_boundary', 'document', 3380, 1380, { fontSize: 9 }),
    ],
    edges: [
      secondaryEdge('source_evidence', 'datatype_proposal'),
      edge('datatype_proposal', 'datatype_filter'),
      edge('datatype_filter', 'tool_candidates'),
      edge('tool_candidates', 'tool_filter'),
      edge('tool_filter', 'tool_schema'),
      edge('tool_schema', 'noisy_tools'),
      edge('noisy_tools', 'backend'),
      edge('backend', 'task_spec'),
      edge('task_spec', 'state_graph'),
      edge('state_graph', 'task_filter'),
      edge('task_filter', 'instantiate_query'),
      edge('instantiate_query', 'gold_answer'),
      edge('gold_answer', 'paper_dataset'),
      edge('paper_dataset', 'runtime_state'),
      edge('runtime_state', 'action_gate'),
      edge('action_gate', 'retriever'),
      edge('retriever', 'default_candidates'),
      edge('retriever', 'blocker_mode'),
      edge('default_candidates', 'feedback'),
      edge('blocker_mode', 'feedback'),
      edge('action_gate', 'tool_call'),
      edge('tool_call', 'feedback'),
      edge('feedback', 'budget_gate'),
      edge('budget_gate', 'action_gate', 'primary', {
        exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 0,
      }),
      edge('action_gate', 'answer_check'),
      edge('budget_gate', 'answer_check', 'primary', {
        exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0,
      }),
      edge('answer_check', 'completion_metrics', 'primary', {
        exitX: 1, exitY: 0.25, entryX: 0, entryY: 0.25,
      }),
      edge('answer_check', 'behavior_metrics', 'primary', {
        exitX: 1, exitY: 0.67, entryX: 0, entryY: 0.5,
      }),
      edge('completion_metrics', 'report'),
      edge('behavior_metrics', 'report'),
      secondaryEdge('paper_dataset', 'human_validation'),
      secondaryEdge('paper_dataset', 'release_snapshot'),
      secondaryEdge('report', 'implementation_boundary'),
      secondaryEdge('release_snapshot', 'license_boundary'),
    ],
  }],
  ['Point-Bench', {
    nodes: [
      node('source_evidence', 'document', 20, 300, { fontSize: 10 }),
      node('task_formulation', 'document', 260, 300, { fontSize: 9 }),
      node('recent_images', 'database', 500, 300, { fontSize: 9 }),
      node('category_scope', 'process', 740, 300, { fontSize: 9 }),
      node('query_authoring', 'process', 980, 300, { fontSize: 9 }),
      node('model_probe', 'process', 1220, 300, { fontSize: 9 }),
      node('hardness_gate', 'process', 1460, 300),
      node('excluded_query', 'terminal', 1700, 40),
      node('target_points', 'process', 1700, 300, { fontSize: 9 }),
      node('sam_masks', 'process', 1940, 300, { fontSize: 9 }),
      node('refine_masks', 'process', 2180, 300, { fontSize: 9 }),
      node('verify_masks', 'process', 2420, 300, { fontSize: 9 }),
      node('paper_dataset', 'database', 2660, 300),
      node('zero_shot_eval', 'process', 2900, 300, { fontSize: 9 }),
      node('task_mode', 'process', 3140, 300),
      node('non_counting', 'process', 3380, 100),
      node('counting', 'process', 3380, 500),
      node('paper_success', 'process', 3620, 300, { fontSize: 9 }),
      node('report', 'terminal', 3860, 300, { fontSize: 9 }),
      node('release_snapshot', 'document', 2660, 760, { fontSize: 9 }),
      node('release_counts', 'document', 2900, 980, { fontSize: 9 }),
      node('implementation_boundary', 'document', 3620, 860, { fontSize: 9 }),
      node('license_boundary', 'document', 2660, 1200, { fontSize: 9 }),
    ],
    edges: [
      secondaryEdge('source_evidence', 'task_formulation'),
      edge('task_formulation', 'recent_images'),
      edge('recent_images', 'category_scope'),
      edge('category_scope', 'query_authoring'),
      edge('query_authoring', 'model_probe'),
      edge('model_probe', 'hardness_gate'),
      edge('hardness_gate', 'excluded_query'),
      edge('hardness_gate', 'target_points'),
      edge('target_points', 'sam_masks'),
      edge('sam_masks', 'refine_masks'),
      edge('refine_masks', 'verify_masks'),
      edge('verify_masks', 'paper_dataset'),
      edge('paper_dataset', 'zero_shot_eval'),
      edge('zero_shot_eval', 'task_mode'),
      edge('task_mode', 'non_counting'),
      edge('task_mode', 'counting'),
      edge('non_counting', 'paper_success'),
      edge('counting', 'paper_success'),
      edge('paper_success', 'report'),
      secondaryEdge('paper_dataset', 'release_snapshot'),
      secondaryEdge('release_snapshot', 'release_counts'),
      secondaryEdge('paper_success', 'implementation_boundary'),
      secondaryEdge('release_snapshot', 'license_boundary'),
    ],
  }],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const specPath = (id, language) => join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`);
const readSpec = (id, language) => parseYaml(readFileSync(specPath(id, language), 'utf8'));

const expectedSourcePaths = id => ({
  drawio_source_en: `drawio/${id}/${id}.en.drawio`,
  drawio_source_zh: `drawio/${id}/${id}.zh.drawio`,
  drawio_spec_en: `drawio/${id}/${id}.en.spec.yaml`,
  drawio_spec_zh: `drawio/${id}/${id}.zh.spec.yaml`,
  drawio_arch_en: `drawio/${id}/${id}.en.arch.json`,
  drawio_arch_zh: `drawio/${id}/${id}.zh.arch.json`,
});

const expectedFlowchartPaths = id => ({
  drawio_flowchart_en: `drawio/${id}/${id}.en.svg`,
  drawio_flowchart_zh: `drawio/${id}/${id}.zh.svg`,
});

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function graphEdge(graph, from, to) {
  const edge = graph.edges.find(candidate => candidate.from === from && candidate.to === to);
  assert.ok(edge, `missing edge ${from}->${to}`);
  return edge;
}

function withoutLabel(record) {
  const { label: _label, ...completeRendererContract } = record;
  return completeRendererContract;
}

function nodeLabelDigest(graph) {
  const canonical = JSON.stringify(graph.nodes.map(({ id, label }) => ({ id, label })));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(withoutLabel),
    edges: graph.edges.map(withoutLabel),
    modules: graph.modules ?? [],
  };
}

test('keeps PlanBench-XL and Point-Bench source-stage graphs fully locked and bilingual', () => {
  for (const id of benchmarkIds) {
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const detail = readDetail(id);
    const expected = expectedCounts.get(id);
    const expectedGraph = expectedGraphs.get(id);

    for (const [language, graph] of Object.entries({ en, zh })) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
      assert.equal(graph.nodes.length, expected.nodes, `${id} node count`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      assert.deepEqual(
        graph.nodes.map(withoutLabel),
        expectedGraph.nodes,
        `${id} complete node renderer contract except labels`,
      );
      assert.deepEqual(
        graph.edges.map(withoutLabel),
        expectedGraph.edges,
        `${id} complete edge renderer contract except labels`,
      );
      assert.equal(
        nodeLabelDigest(graph),
        expectedLabelDigests.get(id)[language],
        `${id}.${language} complete node-label contract`,
      );
      assert.deepEqual(graph.modules ?? [], [], `${id}.${language} module contract`);
      assert.equal(
        graph.edges.filter(edge => edge.type === 'secondary').length,
        expected.secondary,
        `${id} secondary edge count`,
      );
      for (const edge of graph.edges.filter(edge => edge.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
      }
      for (const edge of graph.edges.filter(edge => edge.type === 'primary')) {
        assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} stays primary`);
      }
      assert.equal(
        graph.edges.some(edge => String(edge.label ?? '').trim()),
        false,
        `${id} avoids duplicate Draw.io edge labels`,
      );
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
    for (const [field, expectedPath] of Object.entries(expectedSourcePaths(id))) {
      assert.equal(detail[field], expectedPath, `${id} ${field} source-stage path`);
    }
    for (const [field, expectedPath] of Object.entries(expectedFlowchartPaths(id))) {
      assert.equal(detail[field], expectedPath, `${id} ${field} legacy formal-asset path`);
    }
    assertPublishedContract(id, detail, { publicDir, readSpec });
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
  }
});

test('locks PlanBench-XL v1 construction, interaction loop, blocker branch, and seven metrics', () => {
  const detail = readDetail('PlanBench-XL');
  const en = readSpec('PlanBench-XL', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2606.22388v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2606.22388v1');
  assert.equal(detail.homepage, 'https://planbench-xl.github.io/');
  assert.equal(detail.has_leaderboard, true);
  assert.equal(detail.openness, 'public');
  assert.match(nodeLabel(en, 'source_evidence'), /2606\.22388v1.*593b053aacd5.*a0dacc2d227e.*8d8d3d1a6fa7/isu);
  assert.match(nodeLabel(en, 'datatype_proposal'), /GPT-5\.2.*Concrete Domain/isu);
  assert.match(nodeLabel(en, 'datatype_filter'), /Vague.*Redundant.*Unreasonable.*Unrealistic.*56/isu);
  assert.match(nodeLabel(en, 'tool_candidates'), /1 to 5 Input.*Exactly 1 Output.*GPT-5\.2/isu);
  assert.match(nodeLabel(en, 'tool_filter'), /Deterministic Dependency.*Tool-grounded.*Domain Realism.*Non-trivial/isu);
  assert.match(nodeLabel(en, 'tool_schema'), /185 Executable.*5 to 10 Aliases.*GPT-5\.2/isu);
  assert.match(nodeLabel(en, 'noisy_tools'), /925.*Five per Executable.*Deprecated.*Condition-limited.*Stale.*Unreliable.*Non-authoritative/isu);
  assert.match(nodeLabel(en, 'backend'), /Complete Retail Record.*Non-trivial Hidden.*Unique Typed.*Fixed Noisy/isu);
  assert.match(nodeLabel(en, 'task_spec'), /D0.*Y.*Every Declared Input/isu);
  assert.match(nodeLabel(en, 'state_graph'), /Inclusion-minimal.*Legal Orders.*Ground-truth Paths/isu);
  assert.match(nodeLabel(en, 'task_filter'), /Empty Path.*At Least 5.*5 to 9/isu);
  assert.match(nodeLabel(en, 'instantiate_query'), /Concrete Backend Values.*GPT-5\.2.*Hide Intermediate/isu);
  assert.match(nodeLabel(en, 'gold_answer'), /One Valid Path.*GPT-5\.2 Executes.*Target Values.*All Valid Paths/isu);
  assert.match(nodeLabel(en, 'paper_dataset'), /327.*56.*1,665.*185 Executable.*925 Noisy.*555 Blocker/isu);
  assert.match(nodeLabel(en, 'runtime_state'), /Query q.*Callable Set Ut.*Datatypes Dt.*U0 Is Empty.*100-step/isu);
  assert.match(nodeLabel(en, 'retriever'), /Input-conditioned.*Output-conditioned.*Input-output-conditioned.*14 Executable.*30 Total/isu);
  assert.match(nodeLabel(en, 'default_candidates'), /All Matched Executables.*Paired Descriptive Noise.*Callable/isu);
  assert.match(nodeLabel(en, 'blocker_mode'), /Valid Paths.*At Least One Path.*Explicit Implicit.*Semantically Misleading/isu);
  assert.match(nodeLabel(en, 'tool_call'), /Previously Retrieved|Have Been Retrieved/iu);
  assert.match(nodeLabel(en, 'budget_gate'), /Visible 100-step Budget.*Budget Remains.*Return to Action.*Budget Exhausted.*End without Another Action/isu);
  assert.match(nodeLabel(en, 'answer_check'), /Submitted Answer or Exhausted Budget.*Containment.*Target Types Y/isu);
  assert.match(
    nodeLabel(en, 'completion_metrics'),
    /Task Completion.*Accuracy.*Ground-truth.*Precision.*Average Turns/isu,
  );
  assert.match(
    nodeLabel(en, 'behavior_metrics'),
    /Exploration Behavior.*Mean Explored.*Search-to-call.*Execution Quality.*Invalid Tool-call Rate.*Untrusted Input Rejection Rate/isu,
  );
  assert.doesNotMatch(nodeLabel(en, 'behavior_metrics'), /Average Turns/iu);
  assert.match(nodeLabel(en, 'human_validation'), /Five Research Annotators.*50 Tools.*25 Datatypes.*4\.32.*4\.56.*Not a Full Filter/isu);
  assert.match(nodeLabel(en, 'release_snapshot'), /a0dacc2d227e.*8d8d3d1a6fa7.*aa708b84ae7d.*327/isu);
  assert.match(nodeLabel(en, 'implementation_boundary'), /EGT Recall.*Noisy-tool.*Combined-call.*Seven/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /No LICENSE.*HF Dataset Card Declares MIT.*Code Terms.*Undeclared/isu);
  assert.deepEqual(
    graphEdge(en, 'budget_gate', 'action_gate').style,
    { exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 0 },
    'budget-return loop uses top faces instead of the action-to-tool corridor',
  );
  assert.deepEqual(
    graphEdge(en, 'budget_gate', 'answer_check').style,
    { exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
    'budget-exhaustion route uses bottom-to-top faces instead of the metric corridor',
  );
  assert.match(detail.drawio_review_note, /593b053aacd52d4c436ca5a2a6b98d63de4760fa1c76b98f410b1371b8e6af61/u);
  assert.match(detail.drawio_review_note, /a0dacc2d227e197a61011a68d3b15c24aebbb2a1/u);
  assert.match(detail.drawio_review_note, /8d8d3d1a6fa7954a756193cf0f142c875a769b80/u);
  assert.match(detail.drawio_review_note, /185 executable baseline tools, 925 paired noisy tools, and 555 blocker alternatives/iu);
  assert.match(
    detail.drawio_review_note,
    /Task completion groups Accuracy.*Datatype Precision.*Average Turns.*exploration behavior groups Mean Explored Datatypes.*Search-to-Call Ratio.*execution quality groups Invalid Tool-Call Rate.*Untrusted Input Rejection Rate/isu,
  );
  assert.match(detail.drawio_review_note, /no LICENSE file.*HF dataset card declares MIT.*code terms remain undeclared/isu);
});

test('locks Point-Bench v2 construction, hardness gate, region scoring, and release drift', () => {
  const detail = readDetail('Point-Bench');
  const en = readSpec('Point-Bench', 'en');
  const zh = readSpec('Point-Bench', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2505.09990v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2505.09990v2');
  assert.equal(detail.homepage, 'https://pointarena.github.io/');
  assert.equal(detail.has_leaderboard, true);
  assert.equal(detail.openness, 'public');
  assert.match(nodeLabel(en, 'source_evidence'), /2505\.09990v2.*f2b79d4f8656.*16dab315e6e4.*77ec5dca697b/isu);
  assert.match(nodeLabel(en, 'task_formulation'), /RGB Image I.*Query q.*K Image-space Points.*K-star.*Binary Target Regions/isu);
  assert.equal(
    nodeLabel(en, 'recent_images'),
    [
      'Collect Recent Public Images',
      'Posted after 2025-04-20',
      'Use Category-suitable Scenes',
      'PixMo Images Carry a Reference',
      'Point for Steerable Tasks',
    ].join('\n'),
    'Point-Bench English label preserves the paper\'s post-cutoff direction',
  );
  assert.equal(
    nodeLabel(zh, 'recent_images'),
    [
      '收集近期公开图像',
      '发布于 2025-04-20 之后',
      '使用适合类别的场景',
      'PixMo图像带参考点',
      '用于可操控类任务',
    ].join('\n'),
    'Point-Bench Chinese label preserves the paper\'s post-cutoff direction',
  );
  assert.match(nodeLabel(en, 'category_scope'), /Spatial.*Affordance.*Counting.*Steerable.*Reasoning.*Even Split/isu);
  assert.match(nodeLabel(en, 'query_authoring'), /Crowdsource.*Write Freely.*Category Theme.*Avoid Object Names/isu);
  assert.match(nodeLabel(en, 'model_probe'), /Three Anonymized MLLMs.*Human Evaluators.*Correct/isu);
  assert.match(nodeLabel(en, 'hardness_gate'), /Zero or One of Three Is Correct/isu);
  assert.match(nodeLabel(en, 'excluded_query'), /More Than One Model.*Not Added/isu);
  assert.match(nodeLabel(en, 'target_points'), /Same Gradio Interface.*Place Target Points.*Multiplicity/isu);
  assert.match(nodeLabel(en, 'sam_masks'), /SAM.*Selected Target Points.*Binary Regions/isu);
  assert.match(nodeLabel(en, 'refine_masks'), /Edit or Remove Portions.*Grid-based.*Query Alignment/isu);
  assert.match(nodeLabel(en, 'verify_masks'), /Separate Annotator Group.*Accurately Reflects.*User-generated Query/isu);
  assert.match(nodeLabel(en, 'paper_dataset'), /982.*Pixel-level Target Masks.*Five/isu);
  assert.match(nodeLabel(en, 'zero_shot_eval'), /Zero-shot.*16.*Same 982.*x y.*Native Coordinate/isu);
  assert.match(nodeLabel(en, 'task_mode'), /Branch by Task Mode.*Non-counting.*Counting/isu);
  assert.match(nodeLabel(en, 'non_counting'), /Single Predicted Point.*Only the First/isu);
  assert.match(nodeLabel(en, 'counting'), /Point Set.*K Predictions.*K-star Target Regions/isu);
  assert.match(nodeLabel(en, 'paper_success'), /K Equals K-star.*Every Target Region.*At Least One Predicted Point.*Binary/isu);
  assert.match(nodeLabel(en, 'report'), /Three Independent Runs.*Mean and Standard Deviation.*Category Scores.*982/isu);
  assert.match(nodeLabel(en, 'release_snapshot'), /77ec5dca697b.*eb747f8f9c6d.*a82914086ddc.*a2c93869e659/isu);
  assert.match(nodeLabel(en, 'release_counts'), /affordable 198.*counting 196.*reasoning 193.*spatial 195.*steerable 200.*982.*Differs/isu);
  assert.match(nodeLabel(en, 'implementation_boundary'), /One Mask File per Item.*Every Point Lies.*Does Not Check Each Region Once/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /No LICENSE.*No License.*Reuse Terms/isu);
  assert.match(detail.drawio_review_note, /f2b79d4f8656d18779adb8f84ba416a21b3153133410f8172aef2d33efa2c2f7/u);
  assert.match(detail.drawio_review_note, /16dab315e6e401aab6160d3dc9bba5e9cbc636eb/u);
  assert.match(detail.drawio_review_note, /77ec5dca697b25025e655e2ec34fd2207856924c/u);
  assert.match(detail.drawio_review_note, /one mask_filename per item.*does not represent K-star masks separately/isu);
  assert.match(detail.drawio_review_note, /do not declare a dataset license.*no LICENSE file/isu);
});
