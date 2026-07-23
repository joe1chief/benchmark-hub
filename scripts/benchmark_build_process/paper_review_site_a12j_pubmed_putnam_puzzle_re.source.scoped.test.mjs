import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PubMedQA', 'PutnamBench', 'PuzzleVQA', 'RE-Bench'];

const expectedLabelDigests = new Map([
  ['PubMedQA', {
    en: '32d90c1c1b79e3af1ae8e5a0a163a0db7192170ee2253ae9513e839cbea2bed3',
    zh: 'f426c4629211579cc9e1d72e1da22b642bf8c83634ae60e757ce5bf643fadc25',
  }],
  ['PutnamBench', {
    en: 'c9e57f60717eb954654f5f8252b201f9ef5973da9347149002ac75917e5804e7',
    zh: 'c0ccf9289f2f11651c1e603f1bd39fd08bffa42f6da2ed2142882e177adaa60a',
  }],
  ['PuzzleVQA', {
    en: '93a865ec5190085153369da00729a0106e8eb82f56131dfe0db7214a6d2e1c76',
    zh: '2a9fef5f5f7857cd604f5d683b369c189319c54dd701a7e9ddb3d143b85742a9',
  }],
  ['RE-Bench', {
    en: 'b367f15be305ba7b76520ec625911693082625fd4a08d299f39ff52f120a7bb3',
    zh: '8a57d837fda01f328fdfb8c0e7947d63a7c007ef9051816406cadd56e30e2875',
  }],
]);

const expectedGraphs = new Map([
  ['PubMedQA', {
    nodes: [
      ['source_evidence', 'document', 'xl', 20, 340, { fontSize: 9 }],
      ['pubmed_pool', 'database', 'xl', 260, 340, null],
      ['natural_gate', 'process', 'xl', 500, 80, { fontSize: 9 }],
      ['natural_instance', 'document', 'xl', 740, 80, { fontSize: 9 }],
      ['pqal_sample', 'process', 'xl', 980, -60, null],
      ['answerability_gate', 'process', 'xl', 1220, -60, null],
      ['annotator_one', 'user', 'xl', 1460, -200, { fontSize: 9 }],
      ['annotator_two', 'user', 'xl', 1460, 80, { fontSize: 9 }],
      ['agreement_gate', 'process', 'xl', 1700, -60, null],
      ['discussion', 'process', 'xl', 1940, 180, null],
      ['removed_item', 'terminal', 'xl', 2180, 380, null],
      ['pqa_l', 'database', 'xl', 2180, -60, { fontSize: 9 }],
      ['pqa_l_split', 'database', 'xl', 2420, -60, { fontSize: 9 }],
      ['eval_input', 'process', 'xl', 2660, -60, null],
      ['predict', 'process', 'xl', 2900, -60, null],
      ['metrics', 'terminal', 'xl', 3140, -60, null],
      ['pqa_u_filter', 'process', 'xl', 980, 400, { fontSize: 9 }],
      ['pqa_u', 'database', 'xl', 1220, 400, { fontSize: 9 }],
      ['statement_gate', 'process', 'xl', 500, 760, { fontSize: 9 }],
      ['artificial_convert', 'process', 'xl', 740, 760, { fontSize: 9 }],
      ['pqa_a', 'database', 'xl', 980, 760, { fontSize: 9 }],
      ['pqa_a_split', 'database', 'xl', 1220, 760, null],
      ['release_snapshot', 'document', 'xl', 2180, 720, { fontSize: 9 }],
      ['evaluator_boundary', 'document', 'xl', 3140, 480, { fontSize: 9 }],
      ['license_boundary', 'document', 'xl', 2420, 980, { fontSize: 9 }],
    ],
    edges: [
      ['source_evidence', 'pubmed_pool', 'secondary', { dashed: true }, null],
      ['pubmed_pool', 'natural_gate', 'primary', null, null],
      ['pubmed_pool', 'statement_gate', 'primary', null, null],
      ['natural_gate', 'natural_instance', 'primary', null, null],
      ['natural_instance', 'pqal_sample', 'primary', null, null],
      ['natural_instance', 'pqa_u_filter', 'primary', null, null],
      ['pqal_sample', 'answerability_gate', 'primary', null, null],
      ['answerability_gate', 'annotator_one', 'primary', null, null],
      ['answerability_gate', 'annotator_two', 'primary', null, null],
      ['answerability_gate', 'removed_item', 'primary', null, null],
      ['annotator_one', 'agreement_gate', 'primary', null, null],
      ['annotator_two', 'agreement_gate', 'primary', null, null],
      ['agreement_gate', 'pqa_l', 'primary', null, null],
      ['agreement_gate', 'discussion', 'primary', null, null],
      ['discussion', 'pqa_l', 'primary', null, null],
      ['discussion', 'removed_item', 'primary', null, null],
      ['pqa_u_filter', 'pqa_u', 'primary', null, null],
      ['statement_gate', 'artificial_convert', 'primary', null, null],
      ['artificial_convert', 'pqa_a', 'primary', null, null],
      ['pqa_a', 'pqa_a_split', 'primary', null, null],
      ['pqa_l', 'pqa_l_split', 'primary', null, null],
      ['pqa_l_split', 'eval_input', 'primary', null, null],
      ['eval_input', 'predict', 'primary', null, null],
      ['predict', 'metrics', 'primary', null, null],
      ['pqa_l', 'release_snapshot', 'secondary', { dashed: true }, [{ x: 2280, y: 120 }, { x: 2400, y: 120 }, { x: 2400, y: 770 }]],
      ['pqa_u', 'release_snapshot', 'secondary', { dashed: true }, null],
      ['pqa_a', 'release_snapshot', 'secondary', { dashed: true }, null],
      ['metrics', 'evaluator_boundary', 'secondary', { dashed: true }, null],
      ['release_snapshot', 'license_boundary', 'secondary', { dashed: true }, null],
    ],
  }],
  ['PutnamBench', {
    nodes: [
      ['source_evidence', 'document', 'xl', 20, 300, { fontSize: 9 }],
      ['putnam_sources', 'database', 'xl', 260, 300, { fontSize: 9 }],
      ['category_inventory', 'document', 'xl', 980, 780, { fontSize: 9 }],
      ['factored_solutions', 'process', 'xl', 740, 300, { fontSize: 9 }],
      ['human_team', 'user', 'xl', 980, 300, { fontSize: 9 }],
      ['lean_forms', 'process', 'xl', 1220, 80, { fontSize: 9 }],
      ['isabelle_forms', 'process', 'xl', 1460, 300, { fontSize: 9 }],
      ['coq_forms', 'process', 'xl', 1700, 520, { fontSize: 9 }],
      ['second_person_verify', 'process', 'xl', 1940, 300, { fontSize: 9 }],
      ['paper_dataset', 'database', 'xl', 2180, 300, { fontSize: 9 }],
      ['task_gate', 'process', 'xl', 2420, 300, null],
      ['task_one', 'document', 'xl', 2660, 80, { fontSize: 9 }],
      ['task_two', 'document', 'xl', 2660, 520, { fontSize: 9 }],
      ['prover_attempts', 'process', 'xl', 2900, 300, { fontSize: 9 }],
      ['proof_check', 'process', 'xl', 3140, 300, { fontSize: 9 }],
      ['pass_n', 'terminal', 'xl', 3380, 300, null],
      ['maa_boundary', 'document', 'xl', 500, 780, { fontSize: 9 }],
      ['near_paper_release', 'document', 'xl', 2180, 780, { fontSize: 9 }],
      ['current_release', 'document', 'xl', 2420, 1020, { fontSize: 9 }],
      ['license_boundary', 'document', 'xl', 2660, 1260, { fontSize: 9 }],
    ],
    edges: [
      ['source_evidence', 'putnam_sources', 'secondary', { dashed: true }, null],
      ['putnam_sources', 'factored_solutions', 'primary', null, null],
      ['putnam_sources', 'category_inventory', 'secondary', { dashed: true }, [{ x: 460, y: 620 }, { x: 1080, y: 620 }]],
      ['factored_solutions', 'human_team', 'primary', null, null],
      ['human_team', 'lean_forms', 'primary', null, null],
      ['lean_forms', 'isabelle_forms', 'primary', null, null],
      ['isabelle_forms', 'coq_forms', 'primary', null, null],
      ['coq_forms', 'second_person_verify', 'primary', null, null],
      ['second_person_verify', 'paper_dataset', 'primary', null, null],
      ['paper_dataset', 'task_gate', 'primary', null, null],
      ['task_gate', 'task_one', 'primary', null, null],
      ['task_gate', 'task_two', 'primary', null, null],
      ['task_two', 'prover_attempts', 'primary', null, null],
      ['prover_attempts', 'proof_check', 'primary', null, null],
      ['proof_check', 'pass_n', 'primary', null, null],
      ['putnam_sources', 'maa_boundary', 'secondary', { dashed: true }, [{ x: 360, y: 700 }, { x: 600, y: 700 }]],
      ['paper_dataset', 'near_paper_release', 'secondary', { dashed: true }, null],
      ['near_paper_release', 'current_release', 'secondary', { dashed: true }, null],
      ['current_release', 'license_boundary', 'secondary', { dashed: true }, null],
    ],
  }],
  ['PuzzleVQA', {
    nodes: [
      ['source_evidence', 'document', 'xl', 20, 300, { fontSize: 9 }],
      ['task_scope', 'document', 'xl', 260, 300, { fontSize: 9 }],
      ['concepts', 'database', 'xl', 500, 300, null],
      ['mode_taxonomy', 'process', 'xl', 740, 300, null],
      ['categories', 'database', 'xl', 980, 300, null],
      ['templates', 'document', 'xl', 1220, 300, { fontSize: 9 }],
      ['define_layout', 'process', 'xl', 1460, 300, { fontSize: 9 }],
      ['populate_objects', 'process', 'xl', 1700, 300, { fontSize: 9 }],
      ['construct_query', 'process', 'xl', 1940, 300, null],
      ['make_choices', 'process', 'xl', 2180, 300, { fontSize: 9 }],
      ['render_image', 'process', 'xl', 2420, 300, null],
      ['reasoning_text', 'document', 'xl', 2660, 300, { fontSize: 9 }],
      ['record_schema', 'database', 'xl', 2900, 300, null],
      ['paper_dataset', 'database', 'xl', 3140, 300, { fontSize: 9 }],
      ['eval_input', 'process', 'xl', 3380, 300, null],
      ['prompt_gate', 'process', 'xl', 3620, 300, null],
      ['zero_shot', 'process', 'xl', 4100, -100, null],
      ['guided_caption', 'process', 'xl', 3860, 180, null],
      ['guided_induction', 'process', 'xl', 3860, 420, null],
      ['guided_deduction', 'process', 'xl', 3860, 660, { fontSize: 9 }],
      ['model_output', 'process', 'xl', 4100, 300, null],
      ['direct_regex', 'process', 'xl', 4340, 300, null],
      ['extraction_prompt', 'process', 'xl', 4580, 560, null],
      ['fallback_regex', 'process', 'xl', 4820, 560, null],
      ['parsed_answer', 'process', 'xl', 4820, 180, null],
      ['accuracy', 'terminal', 'xl', 5060, 300, null],
      ['paper_release', 'document', 'xl', 3140, 900, { fontSize: 9 }],
      ['current_release', 'document', 'xl', 3380, 1140, { fontSize: 9 }],
      ['scope_boundary', 'document', 'xl', 3140, 1380, { fontSize: 9 }],
      ['license_boundary', 'document', 'xl', 3620, 1380, { fontSize: 9 }],
    ],
    edges: [
      ['source_evidence', 'task_scope', 'secondary', { dashed: true }, null],
      ['task_scope', 'concepts', 'primary', null, null],
      ['concepts', 'mode_taxonomy', 'primary', null, null],
      ['mode_taxonomy', 'categories', 'primary', null, null],
      ['categories', 'templates', 'primary', null, null],
      ['templates', 'define_layout', 'primary', null, null],
      ['define_layout', 'populate_objects', 'primary', null, null],
      ['populate_objects', 'construct_query', 'primary', null, null],
      ['construct_query', 'make_choices', 'primary', null, null],
      ['make_choices', 'render_image', 'primary', null, null],
      ['render_image', 'reasoning_text', 'primary', null, null],
      ['reasoning_text', 'record_schema', 'primary', null, null],
      ['record_schema', 'paper_dataset', 'primary', null, null],
      ['paper_dataset', 'eval_input', 'primary', null, null],
      ['eval_input', 'prompt_gate', 'primary', null, null],
      ['prompt_gate', 'zero_shot', 'primary', null, [{ x: 3740, y: -40 }, { x: 4020, y: -40 }]],
      ['prompt_gate', 'guided_caption', 'primary', null, null],
      ['prompt_gate', 'guided_induction', 'primary', null, null],
      ['prompt_gate', 'guided_deduction', 'primary', null, null],
      ['zero_shot', 'model_output', 'primary', null, null],
      ['guided_caption', 'model_output', 'primary', null, null],
      ['guided_induction', 'model_output', 'primary', null, null],
      ['guided_deduction', 'model_output', 'primary', null, null],
      ['model_output', 'direct_regex', 'primary', null, null],
      ['direct_regex', 'parsed_answer', 'primary', null, null],
      ['direct_regex', 'extraction_prompt', 'primary', null, null],
      ['extraction_prompt', 'fallback_regex', 'primary', null, null],
      ['fallback_regex', 'parsed_answer', 'primary', null, null],
      ['parsed_answer', 'accuracy', 'primary', null, null],
      ['paper_dataset', 'paper_release', 'secondary', { dashed: true }, null],
      ['paper_release', 'current_release', 'secondary', { dashed: true }, null],
      ['paper_release', 'scope_boundary', 'secondary', { dashed: true }, null],
      ['current_release', 'license_boundary', 'secondary', { dashed: true }, null],
    ],
  }],
  ['RE-Bench', {
    nodes: [
      ['source_evidence', 'document', 'xl', 20, 300, { fontSize: 9 }],
      ['design_goals', 'document', 'xl', 260, 300, { fontSize: 9 }],
      ['idea_sources', 'process', 'xl', 500, 300, { fontSize: 9 }],
      ['specification', 'document', 'xl', 740, 300, null],
      ['spec_review', 'process', 'xl', 980, 300, { fontSize: 9 }],
      ['implementation', 'process', 'xl', 1220, 300, { fontSize: 9 }],
      ['human_trials', 'user', 'xl', 1460, 300, null],
      ['baseline_review', 'process', 'xl', 1700, 300, null],
      ['revision_loop', 'process', 'xl', 1460, 760, null],
      ['discarded', 'terminal', 'xl', 1700, 980, null],
      ['paper_suite', 'database', 'xl', 1940, 300, { fontSize: 9 }],
      ['environment_contract', 'document', 'xl', 2180, 300, { fontSize: 9 }],
      ['actor_gate', 'process', 'xl', 2420, 300, null],
      ['human_runs', 'user', 'xl', 2660, 80, null],
      ['agent_runs', 'process', 'xl', 2660, 520, null],
      ['task_work', 'process', 'xl', 2900, 300, { fontSize: 9 }],
      ['score_gate', 'process', 'xl', 3140, 300, null],
      ['highest_log', 'process', 'xl', 3380, 80, null],
      ['scaling_final', 'process', 'xl', 3380, 520, null],
      ['normalize', 'process', 'xl', 3620, 300, null],
      ['floor_score', 'process', 'xl', 4100, 300, null],
      ['normalized_score', 'database', 'xl', 4340, 300, null],
      ['best_of_k', 'process', 'xl', 4580, 300, null],
      ['selection_gate', 'process', 'xl', 4820, 300, null],
      ['max_select', 'process', 'xl', 5060, 80, null],
      ['random_select', 'process', 'xl', 5060, 520, null],
      ['score_report', 'terminal', 'xl', 5300, 300, { fontSize: 9 }],
      ['release_snapshot', 'document', 'xl', 1940, 1080, { fontSize: 9 }],
      ['license_boundary', 'document', 'xl', 2180, 1320, { fontSize: 9 }],
      ['contamination_boundary', 'document', 'xl', 1940, 1560, { fontSize: 9 }],
    ],
    edges: [
      ['source_evidence', 'design_goals', 'secondary', { dashed: true }, null],
      ['design_goals', 'idea_sources', 'primary', null, null],
      ['idea_sources', 'specification', 'primary', null, null],
      ['specification', 'spec_review', 'primary', null, null],
      ['spec_review', 'implementation', 'primary', null, null],
      ['implementation', 'human_trials', 'primary', null, null],
      ['human_trials', 'baseline_review', 'primary', null, null],
      ['baseline_review', 'paper_suite', 'primary', null, null],
      ['spec_review', 'revision_loop', 'primary', null, null],
      ['baseline_review', 'revision_loop', 'primary', null, null],
      ['revision_loop', 'specification', 'primary', {
        exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1,
      }, null],
      ['spec_review', 'discarded', 'primary', null, null],
      ['baseline_review', 'discarded', 'primary', null, null],
      ['paper_suite', 'environment_contract', 'primary', null, null],
      ['environment_contract', 'actor_gate', 'primary', null, null],
      ['actor_gate', 'human_runs', 'primary', null, null],
      ['actor_gate', 'agent_runs', 'primary', null, null],
      ['human_runs', 'task_work', 'primary', null, null],
      ['agent_runs', 'task_work', 'primary', null, null],
      ['task_work', 'score_gate', 'primary', null, null],
      ['score_gate', 'highest_log', 'primary', null, null],
      ['score_gate', 'scaling_final', 'primary', null, null],
      ['highest_log', 'normalize', 'primary', null, null],
      ['scaling_final', 'normalize', 'primary', null, null],
      ['normalize', 'floor_score', 'primary', null, null],
      ['floor_score', 'normalized_score', 'primary', null, null],
      ['normalized_score', 'best_of_k', 'primary', null, null],
      ['best_of_k', 'selection_gate', 'primary', null, null],
      ['selection_gate', 'max_select', 'primary', null, null],
      ['selection_gate', 'random_select', 'primary', null, null],
      ['max_select', 'score_report', 'primary', null, null],
      ['random_select', 'score_report', 'primary', null, null],
      ['paper_suite', 'release_snapshot', 'secondary', { dashed: true }, null],
      ['release_snapshot', 'license_boundary', 'secondary', { dashed: true }, null],
      ['release_snapshot', 'contamination_boundary', 'secondary', { dashed: true }, null],
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

function nodeTuple({ id, type, size, position, style }) {
  return [id, type, size, position.x, position.y, style ?? null];
}

function edgeTuple({ from, to, type = 'primary', style, waypoints }) {
  return [from, to, type, style ?? null, waypoints ?? null];
}

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function nodeLabelDigest(graph) {
  const canonical = JSON.stringify(graph.nodes.map(({ id, label }) => ({ id, label })));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

test('fully locks all four source-stage bilingual graphs, paths, fallbacks, and signoff gate', () => {
  for (const id of benchmarkIds) {
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const detail = readDetail(id);
    const expected = expectedGraphs.get(id);

    for (const [language, graph] of Object.entries({ en, zh })) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(graph.meta.source, 'generated', `${id}.${language} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.deepEqual(graph.nodes.map(nodeTuple), expected.nodes, `${id}.${language} full node contract`);
      assert.deepEqual(graph.edges.map(edgeTuple), expected.edges, `${id}.${language} full edge contract`);
      assert.deepEqual(graph.modules ?? [], [], `${id}.${language} module contract`);
      assert.equal(
        nodeLabelDigest(graph),
        expectedLabelDigests.get(id)[language],
        `${id}.${language} complete node-label digest`,
      );
      assert.equal(
        graph.edges.some(edge => String(edge.label ?? '').trim()),
        false,
        `${id}.${language} has no edge labels`,
      );
      for (const edge of graph.edges.filter(edge => edge.type === 'secondary')) {
        assert.deepEqual(edge.style, { dashed: true }, `${id}.${language} ${edge.from}->${edge.to} dashed`);
      }
      for (const edge of graph.edges.filter(edge => edge.type === 'primary')) {
        assert.notEqual(edge.style?.dashed, true, `${id}.${language} ${edge.from}->${edge.to} primary`);
      }
    }

    assert.deepEqual(zh.nodes.map(nodeTuple), en.nodes.map(nodeTuple), `${id} bilingual node topology`);
    assert.deepEqual(zh.edges.map(edgeTuple), en.edges.map(edgeTuple), `${id} bilingual edge topology`);
    assert.doesNotMatch(
      readFileSync(specPath(id, 'en'), 'utf8'),
      /[\u3400-\u9fff]/u,
      `${id} English spec purity`,
    );
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    for (const [field, expectedPath] of Object.entries(expectedSourcePaths(id))) {
      assert.equal(detail[field], expectedPath, `${id} ${field}`);
    }
    for (const [field, expectedPath] of Object.entries(expectedFlowchartPaths(id))) {
      assert.equal(detail[field], expectedPath, `${id} ${field}`);
    }
    assert.equal(detail.mermaid_flowchart, null, `${id} Mermaid fallback`);
    assert.equal(detail.flowchart_en, '', `${id} English fallback`);
    assert.equal(detail.flowchart_zh, '', `${id} Chinese fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.match(
      detail.drawio_review_note,
      /status=source-reconstructed-awaiting-independent-signoff/u,
      `${id} source-stage status`,
    );
    assert.match(
      detail.drawio_review_note,
      /Strict Draw\.io\/XML and runtime visual review are required next.*formal assets.*remain gated.*independent reviewer approval/isu,
      `${id} publication gate`,
    );
    assert.doesNotMatch(detail.drawio_review_note, /Formal publication evidence/iu, `${id} no premature signoff`);
    assert.ok(detail.drawio_review_note.length > 3_500, `${id} detailed provenance note`);
  }
});

test('locks PubMedQA v1 subset construction, asymmetric annotation, split, and evaluator', () => {
  const en = readSpec('PubMedQA', 'en');
  const note = readDetail('PubMedQA').drawio_review_note;
  assert.match(nodeLabel(en, 'source_evidence'), /1909\.06146v1.*190af87fa13a.*1cbae8e92f72/isu);
  assert.match(nodeLabel(en, 'natural_instance'), /Question = Original Title.*without Conclusion.*Long Answer = Conclusion/isu);
  assert.match(nodeLabel(en, 'annotator_one'), /M\.D\. Candidate.*Long Answer.*Reasoning-free/isu);
  assert.match(nodeLabel(en, 'annotator_two'), /M\.D\. Candidate.*Context Only.*Long Answer Is Hidden.*Reasoning-required/isu);
  assert.match(nodeLabel(en, 'discussion'), /Labels Differ.*Discuss.*Agreed Label/isu);
  assert.match(nodeLabel(en, 'pqa_l'), /1,000.*55\.2%.*33\.8%.*11\.0%/isu);
  assert.match(nodeLabel(en, 'pqa_l_split'), /500.*10-fold Cross-validation.*500 Test/isu);
  assert.match(nodeLabel(en, 'pqa_u_filter'), /Wh-word.*Multi-entity.*Answerability.*93%.*Annotator 1/isu);
  assert.match(nodeLabel(en, 'pqa_u'), /61\.2K.*Unlabeled.*Yes.*No.*Maybe/isu);
  assert.match(nodeLabel(en, 'statement_gate'), /NP-\(VBP\/VBZ\).*Conclusive/isu);
  assert.match(nodeLabel(en, 'artificial_convert'), /Copula\/Auxiliary.*Question.*Verb Negation/isu);
  assert.match(nodeLabel(en, 'pqa_a'), /211\.3K.*92\.8%.*7\.2%.*No Maybe/isu);
  assert.match(nodeLabel(en, 'pqa_a_split'), /200K Training.*11\.3K Validation/isu);
  assert.match(nodeLabel(en, 'eval_input'), /Question \+ Context.*Conclusion Remains Hidden/isu);
  assert.match(nodeLabel(en, 'metrics'), /Accuracy.*Macro-F1.*Three Labels/isu);
  assert.match(note, /8b3276be8942ebbd77f3ddcda12c1749bf0e490045a736fd8438ee40cf37a41d/u);
  assert.match(note, /939fe566f09017d13b1ca64d2ddfee0bc2374b366048152997669cccedc44d51/u);
  assert.match(note, /2838af5bb0ac18e301a9af57323c2d89784f153ddaf4f889329bfa04842099f8/u);
  assert.match(note, /MIT.*8e75abc6136be91e5ae66dbb6dda07c8bc9dcc215ed3bc1ba3ae7fab7904777e/isu);
});

test('locks PutnamBench v2 counts, manual sequence, task settings, pass@n, and release drift', () => {
  const en = readSpec('PutnamBench', 'en');
  const note = readDetail('PutnamBench').drawio_review_note;
  assert.match(nodeLabel(en, 'source_evidence'), /2407\.11214v2.*0a990ea2dcfe.*982b29ea89d5/isu);
  assert.match(nodeLabel(en, 'putnam_sources'), /640.*English Statements.*Numerical Solutions.*Proofs Required/isu);
  assert.match(
    nodeLabel(en, 'category_inventory'),
    /Overlapping.*253.*226.*107.*68.*51.*28.*26.*9.*8/isu,
  );
  assert.match(nodeLabel(en, 'factored_solutions'), /Closed-form.*60%.*outside Theorem.*Solution-finding/isu);
  assert.match(nodeLabel(en, 'human_team'), /2 Doctoral.*5 Undergraduate.*25 min/isu);
  assert.match(nodeLabel(en, 'lean_forms'), /First.*Lean 4.*640.*Manually/isu);
  assert.match(nodeLabel(en, 'isabelle_forms'), /Then.*Isabelle.*640.*Not a Mechanical Translation/isu);
  assert.match(nodeLabel(en, 'coq_forms'), /Finally.*Coq.*412.*MathComp.*Coquelicot.*GeoCoq/isu);
  assert.match(nodeLabel(en, 'second_person_verify'), /Second Person at Least Once.*10 min/isu);
  assert.match(nodeLabel(en, 'paper_dataset'), /640 Problems.*Lean 640.*Isabelle 640.*Coq 412.*1,692/isu);
  assert.match(nodeLabel(en, 'task_one'), /Infer Closed-form Solution.*Rewrite.*Prove Correctness/isu);
  assert.match(nodeLabel(en, 'task_two'), /Given Theorem \+ Solution.*Proof.*Correctness/isu);
  assert.match(nodeLabel(en, 'prover_attempts'), /n Attempts.*GPT-4o.*pass@10.*0\.7/isu);
  assert.equal(en.edges.some(edge => edge.from === 'task_one' && edge.to === 'prover_attempts'), false);
  assert.equal(en.edges.some(edge => edge.from === 'task_two' && edge.to === 'prover_attempts'), true);
  assert.match(nodeLabel(en, 'pass_n'), /pass@n.*Certified Proof.*n Attempts/isu);
  assert.match(nodeLabel(en, 'maa_boundary'), /Permission.*MAA/isu);
  assert.match(nodeLabel(en, 'near_paper_release'), /93869067a543.*644 \+ 640 \+ 412 = 1,696.*1,692/isu);
  assert.match(nodeLabel(en, 'current_release'), /982b29ea89d5.*1962–2025.*672 \+ 640 \+ 412 = 1,724/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Lean 4 \+ Isabelle.*Apache-2\.0.*Coq.*MIT.*MAA/isu);
  assert.match(note, /93869067a54396f9edb752a57f78960cece8c24c/u);
  assert.match(note, /982b29ea89d5bca970a3c6b1ce486a15967b7cb3/u);
  assert.match(note, /descriptive evidence inventory.*Task 2 only.*GPT-4o.*not as a reported Task-1 baseline/isu);
});

test('locks PuzzleVQA v3 automatic generation, seven fields, diagnostic prompts, parser, and scope drift', () => {
  const en = readSpec('PuzzleVQA', 'en');
  const note = readDetail('PuzzleVQA').drawio_review_note;
  assert.match(nodeLabel(en, 'source_evidence'), /2403\.13315v3.*a7cc824f4ed3.*e974881fd10a/isu);
  assert.match(nodeLabel(en, 'task_scope'), /without Extensive World Knowledge/isu);
  assert.match(nodeLabel(en, 'concepts'), /Numbers.*Colors.*Sizes.*Shapes/isu);
  assert.match(nodeLabel(en, 'mode_taxonomy'), /Four Single-concept.*Six Dual-concept/isu);
  assert.match(nodeLabel(en, 'categories'), /Ten.*200.*Single and Dual/isu);
  assert.match(nodeLabel(en, 'templates'), /20.*Two Templates per Category.*Objects.*Layout.*Pattern.*Demonstrations.*Query/isu);
  assert.match(nodeLabel(en, 'populate_objects'), /Randomly.*Satisfy.*Demonstrations.*Rule/isu);
  assert.match(nodeLabel(en, 'make_choices'), /Four Choices.*Three for Size.*Heuristic/isu);
  assert.match(nodeLabel(en, 'render_image'), /Python.*Pillow/isu);
  assert.match(nodeLabel(en, 'reasoning_text'), /Caption.*Visual Perception.*Pattern Explanation.*Induction.*Deduction/isu);
  assert.match(nodeLabel(en, 'record_schema'), /image.*question.*options.*answer.*caption.*explanation.*deduction/isu);
  assert.match(nodeLabel(en, 'paper_dataset'), /20 Templates × 100.*20 JSONL.*2,000.*Test-only/isu);
  assert.match(nodeLabel(en, 'zero_shot'), /Zero-shot CoT.*Describe Image First.*Step by Step/isu);
  assert.match(nodeLabel(en, 'guided_caption'), /Ground-truth Caption/isu);
  assert.match(nodeLabel(en, 'guided_induction'), /Caption.*Pattern Explanation/isu);
  assert.match(nodeLabel(en, 'guided_deduction'), /Caption \+ Pattern \+ Deduction.*before Revealing Answer/isu);
  assert.match(nodeLabel(en, 'direct_regex'), /Raw Response.*Last Parenthesized A–D.*Last Bare A–D/isu);
  assert.match(nodeLabel(en, 'fallback_regex'), /Last Parenthesized A–D.*Last Bare A–D/isu);
  assert.match(nodeLabel(en, 'accuracy'), /Accuracy.*2,000/isu);
  assert.match(nodeLabel(en, 'paper_release'), /e974881fd10a.*4f1278484889.*e7be8ba6639b.*6e0f5d9db945/isu);
  assert.match(nodeLabel(en, 'current_release'), /9b3a074cca0c.*Must Not Rewrite Paper Contract/isu);
  assert.match(nodeLabel(en, 'scope_boundary'), /PuzzleVQA Only.*AlgoPuzzleVQA.*Separate/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Paper-matched Snapshot Has No LICENSE.*Current Snapshot Adds MIT/isu);
  assert.match(note, /4f12784848893be3cfef08462ccb118eac902b3a6ff7cb995ba6d29969b68439/u);
  assert.match(note, /e7be8ba6639b87eecd59d4c2704f25a4bacb885165f1cccc2b16f9a544fabff0/u);
  assert.match(note, /6e0f5d9db945dda55d89e167953ab8c264839fd13c74ff005f44b9e3477fb484/u);
});

test('locks RE-Bench v2 iterative build, seven environments, run selection, normalization, and score@k', () => {
  const en = readSpec('RE-Bench', 'en');
  const note = readDetail('RE-Bench').drawio_review_note;
  assert.match(nodeLabel(en, 'source_evidence'), /2411\.15114v2.*9d25c5ea6abf.*93b98062e55f/isu);
  assert.match(nodeLabel(en, 'design_goals'), /Feasibility.*Ecological Validity.*Resistance to Saturation.*Human\/Agent/isu);
  assert.match(nodeLabel(en, 'idea_sources'), /Practitioner Discussions.*Literature.*METR Work Experience/isu);
  assert.match(nodeLabel(en, 'specification'), /Description.*Scoring Function.*Starting-solution/isu);
  assert.match(nodeLabel(en, 'implementation'), /Full Evaluation Environment.*Internal High-scoring Solution/isu);
  assert.match(nodeLabel(en, 'human_trials'), /Baselining.*Human Experts.*Progress and Ceiling/isu);
  assert.match(nodeLabel(en, 'discarded'), /12 Specifications.*5 Implementations/isu);
  assert.match(
    nodeLabel(en, 'paper_suite'),
    /Seven.*LLM Foundry.*Triton Kernel.*Embedding.*Scaling Law.*Restricted MLM.*GPT-2 QA.*Rust Codecontests/isu,
  );
  assert.match(nodeLabel(en, 'environment_contract'), /Instructions.*Resources.*Scorer.*Starting Solution.*Reference Solution Is Hidden/isu);
  assert.match(nodeLabel(en, 'actor_gate'), /Wall-clock.*6 H100s/isu);
  assert.match(nodeLabel(en, 'human_runs'), /71 Eight-hour Attempts.*61 Distinct Experts.*Same Environment/isu);
  assert.match(nodeLabel(en, 'task_work'), /Edit Files.*Run Code.*Experiment.*Scorer.*Timestamp Scores/isu);
  assert.match(nodeLabel(en, 'highest_log'), /Six Standard.*Highest Score.*Score Log.*Run End/isu);
  assert.match(nodeLabel(en, 'scaling_final'), /Scaling Law.*Cannot See.*Only Final Submission Counts/isu);
  assert.match(nodeLabel(en, 'normalize'), /y.*ys.*yr.*yn = \(y - ys\) \/ \(yr - ys\).*Starting = 0.*Reference = 1/isu);
  assert.match(nodeLabel(en, 'floor_score'), /Worse than Starting Becomes 0.*Greater than 1 Are Allowed/isu);
  assert.match(nodeLabel(en, 'best_of_k'), /score@k.*k Runs with Replacement.*Each Environment/isu);
  assert.match(nodeLabel(en, 'max_select'), /Standard Environments.*Highest Score.*k Sampled/isu);
  assert.match(nodeLabel(en, 'random_select'), /Scaling Law.*Unobservable.*Randomly/isu);
  assert.match(nodeLabel(en, 'score_report'), /score@k.*Average Normalized Score.*Seven.*Humans and Agents/isu);
  assert.match(nodeLabel(en, 'release_snapshot'), /93b98062e55f.*Seven Task Families.*0f6205a46c61/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /MIT.*0651c2b4111f/isu);
  assert.match(nodeLabel(en, 'contamination_boundary'), /Non-binding.*Contamination.*Unprotected Solutions.*Separate from MIT/isu);
  assert.match(note, /0f6205a46c61a26e7476e498a4199b7d2a3ee4abf53c27dbb7f3640ddcd008ff/u);
  assert.match(note, /0651c2b4111fb02dcf9dee40b78f51a44d72f1ed53129d914a18ba6b0fe07312/u);
  assert.doesNotMatch(note, /resident-peacock|password is/iu);
});
