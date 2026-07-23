import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'ProteinLMBench',
  'ProtocolQA',
  'ProtocolQA_Open-Ended',
  'ProverBench',
];

const withoutUndefined = record => Object.fromEntries(
  Object.entries(record).filter(([, value]) => value !== undefined),
);

const node = (id, type, x, y, style) => withoutUndefined({
  id,
  type,
  size: 'xl',
  position: { x, y },
  style,
});

const edge = (from, to, type = 'primary', waypoints) => withoutUndefined({
  from,
  to,
  type,
  style: type === 'secondary' ? { dashed: true } : undefined,
  waypoints,
});

const expectedGraphs = new Map([
  ['ProteinLMBench', {
    nodes: [
      node('source_evidence', 'document', 40, 40),
      node('paper_scope', 'document', 280, 40),
      node('rag_generation_round', 'process', 520, 40),
      node('initial_questions', 'database', 760, 40),
      node('gpt4_validation_round', 'process', 1000, 40),
      node('consistency_filter', 'process', 1240, 40),
      node('paper_release', 'database', 1480, 40),
      node('item_contract', 'document', 1720, 40),
      node('task_scope', 'document', 1960, 40),
      node('model_inference', 'process', 1960, 320),
      node('answer_match', 'process', 1720, 320),
      node('accuracy_report', 'terminal', 1480, 320),
      node('appendix_pool_account', 'database', 280, 600),
      node('sampling_boundary', 'document', 520, 600),
      node('validation_boundary', 'document', 1000, 600),
      node('hf_snapshot', 'database', 2200, 40),
      node('option_shape_audit', 'document', 2200, 320),
      node('license_boundary', 'document', 2440, 40),
    ],
    edges: [
      edge('source_evidence', 'paper_scope', 'secondary'),
      edge('paper_scope', 'rag_generation_round'),
      edge('rag_generation_round', 'initial_questions'),
      edge('initial_questions', 'gpt4_validation_round'),
      edge('gpt4_validation_round', 'consistency_filter'),
      edge('consistency_filter', 'paper_release'),
      edge('paper_release', 'item_contract'),
      edge('item_contract', 'task_scope'),
      edge('task_scope', 'model_inference'),
      edge('model_inference', 'answer_match'),
      edge('answer_match', 'accuracy_report'),
      edge('paper_scope', 'appendix_pool_account', 'secondary'),
      edge('appendix_pool_account', 'sampling_boundary', 'secondary'),
      edge('gpt4_validation_round', 'validation_boundary', 'secondary'),
      edge('task_scope', 'hf_snapshot', 'secondary'),
      edge('hf_snapshot', 'option_shape_audit', 'secondary'),
      edge('hf_snapshot', 'license_boundary', 'secondary'),
    ],
  }],
  ['ProtocolQA', {
    nodes: [
      node('source_evidence', 'document', 40, 40),
      node('benchmark_scope', 'document', 280, 40),
      node('expert_round_one', 'user', 520, 40),
      node('protocol_sources', 'database', 760, 40),
      node('error_injection', 'process', 1000, 40),
      node('error_explanation', 'document', 1240, 40),
      node('expert_round_two', 'user', 1480, 40),
      node('alignment_check', 'process', 1720, 40),
      node('outcome_check', 'process', 1960, 40),
      node('mcq_draft', 'document', 2200, 40),
      node('author_calibration', 'process', 2440, 40),
      node('ongoing_review', 'process', 2680, 40),
      node('paper_set', 'database', 2920, 40),
      node('zero_shot_cot', 'process', 2920, 320),
      node('model_completion', 'process', 2680, 320),
      node('text_parser', 'process', 2440, 320),
      node('selective_metrics', 'process', 2200, 320),
      node('three_run_report', 'terminal', 1960, 320),
      node('open_answer_rewrite', 'process', 2680, 600),
      node('expert_grade', 'user', 2440, 600),
      node('second_review', 'process', 2200, 600),
      node('open_answer_report', 'terminal', 1960, 600),
      node('release_snapshot', 'database', 3400, 40),
      node('license_boundary', 'document', 3640, 40),
      node('openanswer_snapshot', 'document', 1720, 600),
    ],
    edges: [
      edge('source_evidence', 'benchmark_scope', 'secondary'),
      edge('benchmark_scope', 'expert_round_one'),
      edge('expert_round_one', 'protocol_sources'),
      edge('protocol_sources', 'error_injection'),
      edge('error_injection', 'error_explanation'),
      edge('error_explanation', 'expert_round_two'),
      edge('expert_round_two', 'alignment_check'),
      edge('alignment_check', 'outcome_check'),
      edge('outcome_check', 'mcq_draft'),
      edge('mcq_draft', 'author_calibration'),
      edge('author_calibration', 'ongoing_review'),
      edge('ongoing_review', 'paper_set'),
      edge('paper_set', 'zero_shot_cot'),
      edge('zero_shot_cot', 'model_completion'),
      edge('model_completion', 'text_parser'),
      edge('text_parser', 'selective_metrics'),
      edge('selective_metrics', 'three_run_report'),
      edge('paper_set', 'open_answer_rewrite', 'primary', [
        { x: 3060, y: 200 },
        { x: 3060, y: 660 },
        { x: 2820, y: 660 },
      ]),
      edge('open_answer_rewrite', 'expert_grade'),
      edge('expert_grade', 'second_review'),
      edge('second_review', 'open_answer_report'),
      edge('paper_set', 'release_snapshot', 'secondary'),
      edge('release_snapshot', 'license_boundary', 'secondary'),
      edge('open_answer_report', 'openanswer_snapshot', 'secondary'),
    ],
  }],
  ['ProtocolQA_Open-Ended', {
    nodes: [
      node('source_evidence', 'document', 40, 40),
      node('disclosure_scope', 'document', 280, 40),
      node('futurehouse_mcqs', 'database', 520, 40),
      node('open_ended_conversion', 'process', 760, 40),
      node('egregious_errors', 'process', 1000, 40),
      node('wet_lab_result', 'document', 1240, 40),
      node('repair_question', 'process', 1480, 40),
      node('evaluation_set', 'database', 1720, 40),
      node('model_attempt', 'process', 1720, 320),
      node('model_chart', 'document', 1480, 320),
      node('expert_group', 'user', 1960, 320),
      node('expert_answers', 'process', 2200, 320),
      node('expert_baselines', 'document', 2440, 320),
      node('comparison', 'terminal', 2680, 320),
      node('selection_rewrite_boundary', 'document', 520, 600),
      node('grader_boundary', 'document', 1480, 600),
      node('release_boundary', 'document', 1960, 600),
      node('labbench_audit_boundary', 'document', 280, 600),
    ],
    edges: [
      edge('source_evidence', 'disclosure_scope', 'secondary'),
      edge('disclosure_scope', 'futurehouse_mcqs'),
      edge('futurehouse_mcqs', 'open_ended_conversion'),
      edge('open_ended_conversion', 'egregious_errors'),
      edge('egregious_errors', 'wet_lab_result'),
      edge('wet_lab_result', 'repair_question'),
      edge('repair_question', 'evaluation_set'),
      edge('evaluation_set', 'model_attempt'),
      edge('model_attempt', 'model_chart'),
      edge('model_chart', 'comparison', 'primary', [
        { x: 1364, y: 432 },
        { x: 1364, y: 712 },
        { x: 2684, y: 712 },
      ]),
      edge('evaluation_set', 'expert_group'),
      edge('expert_group', 'expert_answers'),
      edge('expert_answers', 'expert_baselines'),
      edge('expert_baselines', 'comparison'),
      edge('futurehouse_mcqs', 'selection_rewrite_boundary', 'secondary'),
      edge('model_chart', 'grader_boundary', 'secondary'),
      edge('evaluation_set', 'release_boundary', 'secondary', [
        { x: 1844, y: 132 },
        { x: 1844, y: 602 },
      ]),
      edge('disclosure_scope', 'labbench_audit_boundary', 'secondary'),
    ],
  }],
  ['ProverBench', {
    nodes: [
      node('source_evidence', 'document', 40, 40),
      node('benchmark_scope', 'document', 280, 40),
      node('aime_candidates', 'database', 520, 40),
      node('exclusion_filter', 'process', 760, 40),
      node('aime_selection', 'process', 1000, 40),
      node('textbook_sources', 'database', 520, 320),
      node('textbook_formalization', 'process', 760, 320),
      node('area_distribution', 'document', 1000, 320, { fontSize: 8 }),
      node('benchmark_release', 'database', 1240, 40),
      node('hf_snapshot', 'database', 1480, 40),
      node('evaluation_modes', 'process', 1240, 320),
      node('non_cot_prompt', 'document', 1480, 320),
      node('cot_prompt', 'document', 1480, 600),
      node('sample_budgets', 'process', 1720, 320),
      node('lean_verification', 'process', 1960, 320),
      node('table7_results', 'terminal', 2200, 320, { fontSize: 8 }),
      node('training_boundary', 'document', 280, 600),
      node('harness_boundary', 'document', 1960, 600),
      node('license_boundary', 'document', 1720, 40),
    ],
    edges: [
      edge('source_evidence', 'benchmark_scope', 'secondary'),
      edge('benchmark_scope', 'aime_candidates'),
      edge('benchmark_scope', 'textbook_sources'),
      edge('aime_candidates', 'exclusion_filter'),
      edge('exclusion_filter', 'aime_selection'),
      edge('aime_selection', 'benchmark_release'),
      edge('textbook_sources', 'textbook_formalization'),
      edge('textbook_formalization', 'area_distribution'),
      edge('area_distribution', 'benchmark_release', 'primary', [
        { x: 1100, y: 200 },
        { x: 1340, y: 200 },
      ]),
      edge('benchmark_release', 'evaluation_modes'),
      edge('evaluation_modes', 'non_cot_prompt'),
      edge('evaluation_modes', 'cot_prompt', 'primary', [
        { x: 1340, y: 520 },
        { x: 1580, y: 520 },
      ]),
      edge('non_cot_prompt', 'sample_budgets'),
      edge('cot_prompt', 'sample_budgets', 'primary', [
        { x: 1820, y: 660 },
        { x: 1820, y: 520 },
      ]),
      edge('sample_budgets', 'lean_verification'),
      edge('lean_verification', 'table7_results'),
      edge('benchmark_release', 'hf_snapshot', 'secondary'),
      edge('hf_snapshot', 'license_boundary', 'secondary'),
      edge('benchmark_scope', 'training_boundary', 'secondary'),
      edge('lean_verification', 'harness_boundary', 'secondary'),
    ],
  }],
]);

const expectedLabelDigests = new Map([
  ['ProteinLMBench', {
    en: 'ebf8ca9f2f930ab7450d22b45cd1bfcc822bfcfdf2cf776f3683d52eda25a6fa',
    zh: 'df25d69c87143ceff74cc49bc0d9d4dc7d3fd6b55f4a8018ce73ba293535670c',
  }],
  ['ProtocolQA', {
    en: 'cc863429b5d23209d60b5da629190516984b7a7aac17711fb29a06731f1ad0fe',
    zh: '47cb928941c7f6844589044c598c5f06f4483266706bb05e2402fd66d4de48b9',
  }],
  ['ProtocolQA_Open-Ended', {
    en: '3dcc7d5fef6267c673f500c70add2aaec9eda2ff7c7f94bffbc48d0a56cdbee7',
    zh: '5fb22e3d3df0cb5ebefa3fd8cd78f66900c8d4dc143d9bd00061f1420c864e85',
  }],
  ['ProverBench', {
    en: 'f472c419226c9c36c87a9a7babe258b3cab2d6a7503e3146228712daadd80d23',
    zh: '53a7245bcccb57d70f435e271ef5d2135646fec1c734fc9f160eca0de950f2cf',
  }],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));

const specPath = (id, language) => join(
  publicDir,
  'drawio',
  id,
  `${id}.${language}.spec.yaml`,
);

const readSpec = (id, language) => parseYaml(readFileSync(specPath(id, language), 'utf8'));

const expectedAssetPaths = id => ({
  drawio_flowchart_en: `drawio/${id}/${id}.en.svg`,
  drawio_flowchart_zh: `drawio/${id}/${id}.zh.svg`,
  drawio_source_en: `drawio/${id}/${id}.en.drawio`,
  drawio_source_zh: `drawio/${id}/${id}.zh.drawio`,
  drawio_spec_en: `drawio/${id}/${id}.en.spec.yaml`,
  drawio_spec_zh: `drawio/${id}/${id}.zh.spec.yaml`,
  drawio_arch_en: `drawio/${id}/${id}.en.arch.json`,
  drawio_arch_zh: `drawio/${id}/${id}.zh.arch.json`,
});

function nodeLabel(graph, id) {
  const candidate = graph.nodes.find(current => current.id === id);
  assert.ok(candidate, `missing node ${id}`);
  return String(candidate.label);
}

function withoutLabel(record) {
  const { label: _label, ...rendererFields } = record;
  return rendererFields;
}

function rendererTopology(graph) {
  return {
    nodes: graph.nodes.map(withoutLabel),
    edges: graph.edges.map(withoutLabel),
    modules: graph.modules ?? [],
  };
}

function labelDigest(graph) {
  return createHash('sha256')
    .update(JSON.stringify(graph.nodes.map(({ id, label }) => ({ id, label }))))
    .digest('hex');
}

test('locks four bilingual source specs to exact positioned topology and source-stage boundaries', () => {
  for (const id of benchmarkIds) {
    const expected = expectedGraphs.get(id);
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');

    for (const [language, graph] of [['en', en], ['zh', zh]]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
      assert.deepEqual(rendererTopology(graph), {
        ...expected,
        modules: [],
      }, `${id}.${language} complete renderer topology except labels`);
      assert.equal(
        labelDigest(graph),
        expectedLabelDigests.get(id)[language],
        `${id}.${language} complete id-label SHA-256`,
      );
      assert.ok(graph.nodes.every(current => String(current.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(current => current.label === undefined), `${id} no edge labels`);
      for (const current of graph.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(current.style?.dashed, true, `${id} ${current.from}->${current.to} dashed`);
      }
      for (const current of graph.edges.filter(candidate => candidate.type === 'primary')) {
        assert.notEqual(current.style?.dashed, true, `${id} ${current.from}->${current.to} primary`);
      }
    }

    assert.deepEqual(rendererTopology(zh), rendererTopology(en), `${id} bilingual renderer topology`);
    assert.deepEqual(en.nodes.map(current => current.id), expected.nodes.map(current => current.id), `${id} semantic IDs`);
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const current of en.nodes) {
      for (const line of String(current.label).split('\n')) {
        assert.ok([...line].length <= 58, `${id}.${current.id} English line width: ${line}`);
      }
    }
    for (const current of zh.nodes) {
      assert.match(String(current.label), /[\u3400-\u9fff]/u, `${id}.${current.id} Chinese semantics`);
      for (const line of String(current.label).split('\n')) {
        const maxWidth = Number(current.style?.fontSize) <= 8 ? 58 : 38;
        assert.ok([...line].length <= maxWidth, `${id}.${current.id} Chinese line width: ${line}`);
      }
    }

    assert.equal(detail.mermaid_flowchart, null, `${id} canonical fallback unregistered`);
    assert.equal(detail.flowchart_en, '', `${id} English fallback empty`);
    assert.equal(detail.flowchart_zh, '', `${id} Chinese fallback empty`);
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(expectedAssetPaths(id)).map(key => [key, detail[key]]),
      ),
      expectedAssetPaths(id),
      `${id} exact eight source-stage asset paths`,
    );
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.match(detail.drawio_review_note, /source_stage=[^;]+/u, `${id} source-stage status`);
    assert.match(
      detail.drawio_review_note,
      /Formal Draw\.io.*intentionally unchanged.*source-stage handoff/isu,
      `${id} awaiting independent signoff`,
    );
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
    assert.doesNotMatch(detail.drawio_review_note, /Formal publication evidence/iu, `${id} source-only note`);
  }
});

test('locks ProteinLMBench paper workflow, appendix ambiguity, and pinned 944-row release', () => {
  const detail = readDetail('ProteinLMBench');
  const en = readSpec('ProteinLMBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2406.05540v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2406.05540v2');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/tsynbio/ProteinLMBench/tree/f1397963c7f727a4a2f00cdd691e6e219c36e992',
  );
  assert.equal(detail.dataset_url, detail.homepage);
  assert.match(nodeLabel(en, 'source_evidence'), /2406\.05540v2.*161a6e71e4e3.*f1397963c7f7.*f2dce5c1b54e/isu);
  assert.match(nodeLabel(en, 'rag_generation_round'), /RAG.*Questions.*Choices.*Answers/isu);
  assert.match(nodeLabel(en, 'initial_questions'), /1,000/isu);
  assert.match(nodeLabel(en, 'gpt4_validation_round'), /GPT-4.*Validate.*Answers/isu);
  assert.match(nodeLabel(en, 'consistency_filter'), /Inconsisten.*Discard/isu);
  assert.match(nodeLabel(en, 'paper_release'), /944/isu);
  assert.match(nodeLabel(en, 'item_contract'), /Six-choice.*Explanation/isu);
  assert.match(nodeLabel(en, 'task_scope'), /Property Prediction.*Descriptions.*Sequence Understanding.*No Recommended.*Split/isu);
  assert.match(nodeLabel(en, 'accuracy_report'), /Accuracy.*Correct.*944/isu);
  assert.match(nodeLabel(en, 'appendix_pool_account'), /Random.*More Than 100,000.*Question-answer Pairs/isu);
  assert.match(nodeLabel(en, 'sampling_boundary'), /Order.*Probabilit.*Not Disclosed.*Do Not Merge/isu);
  assert.match(nodeLabel(en, 'validation_boundary'), /Machines and Humans.*Does Not Identify.*Authors/isu);
  assert.match(nodeLabel(en, 'hf_snapshot'), /944 Rows.*question.*options.*answer.*explanation/isu);
  assert.match(nodeLabel(en, 'option_shape_audit'), /871.*Six Options.*73.*2.*3.*4.*5.*7.*8.*10/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Apache-2\.0/isu);
  assert.doesNotMatch(`${detail.intro}\n${detail.build_method}\n${detail.intro_en}\n${detail.build_method_en}`, /作者验证|author validation/iu);
  assert.match(detail.drawio_review_note, /161a6e71e4e3321c91bd884ab2c906704c9110dbd5d3672651689e9369ca98dd/u);
  assert.match(detail.drawio_review_note, /f1397963c7f727a4a2f00cdd691e6e219c36e992/u);
  assert.match(detail.drawio_review_note, /f2dce5c1b54e8ce73897a4af48ae8ba05507076d511b9d02d57cddf31c42ed96/u);
  assert.match(detail.drawio_review_note, /871.*six-option.*73.*non-six-option/isu);
  assert.match(detail.drawio_review_note, /does not identify the human validators as paper authors/isu);
});

test('locks ProtocolQA two-expert construction, calibrated review, evaluation, and release split', () => {
  const detail = readDetail('ProtocolQA');
  const en = readSpec('ProtocolQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2407.10362v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2407.10362v3');
  assert.equal(
    detail.homepage,
    'https://github.com/Future-House/LAB-Bench/tree/998a8e0a40cf116c80e1b0e7a805ebb5fb9fa838',
  );
  assert.equal(detail.repository_url, detail.homepage);
  assert.match(nodeLabel(en, 'source_evidence'), /2407\.10362v3.*7c781a703287.*998a8e0a40cf/isu);
  assert.match(nodeLabel(en, 'benchmark_scope'), /135.*Tool-free.*Protocol Troubleshooting/isu);
  assert.match(nodeLabel(en, 'protocol_sources'), /protocols\.io.*STAR Protocols/isu);
  assert.match(nodeLabel(en, 'error_injection'), /One or More Errors.*Unambiguous/isu);
  assert.match(nodeLabel(en, 'error_explanation'), /Explain.*Negative Effect/isu);
  assert.match(nodeLabel(en, 'expert_round_two'), /Additional Experts.*Draft/isu);
  assert.match(nodeLabel(en, 'alignment_check'), /Error.*Explanation.*Align/isu);
  assert.match(nodeLabel(en, 'outcome_check'), /Negative Outcome/isu);
  assert.match(nodeLabel(en, 'mcq_draft'), /Troubleshooting MCQ.*Hypothetical Result.*Fix/isu);
  assert.match(nodeLabel(en, 'author_calibration'), /Authors.*First 5-10.*Rework.*Accept.*Remove/isu);
  assert.match(nodeLabel(en, 'ongoing_review'), /Ongoing Author Review.*Before.*Merge/isu);
  assert.match(nodeLabel(en, 'paper_set'), /135/isu);
  assert.match(nodeLabel(en, 'zero_shot_cot'), /Zero-shot CoT.*No Tools.*Decline Option/isu);
  assert.match(nodeLabel(en, 'text_parser'), /Regex.*Answer Tags.*Claude 2.*Text Completion/isu);
  assert.match(nodeLabel(en, 'selective_metrics'), /Accuracy.*Precision.*Coverage/isu);
  assert.match(nodeLabel(en, 'three_run_report'), /Public and Private.*Three Runs/isu);
  assert.match(nodeLabel(en, 'open_answer_rewrite'), /Separate 20.*Open-answer Audit/isu);
  assert.match(nodeLabel(en, 'expert_grade'), /Expert Biologist.*Ideal.*Answer/isu);
  assert.match(nodeLabel(en, 'second_review'), /Second Reviewer/isu);
  assert.match(nodeLabel(en, 'release_snapshot'), /108 Public.*27 Private.*08e85d9c0afb.*3e6774d7c05b/isu);
  assert.match(nodeLabel(en, 'openanswer_snapshot'), /20 Rows.*4ccc200873d4/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /CC BY-SA 4\.0/isu);
  assert.match(detail.drawio_review_note, /7c781a703287616d6561e0ce50aed494946c7609a5a1b5985fb7849ce9e884dd/u);
  assert.match(detail.drawio_review_note, /998a8e0a40cf116c80e1b0e7a805ebb5fb9fa838/u);
  assert.match(detail.drawio_review_note, /08e85d9c0afb85a3919b78a44095eabdc031ad77652da2ccc59407a162bd63a4/u);
  assert.match(detail.drawio_review_note, /4ccc200873d4c73e07c6a0ce0b2d6010a36f47f3fbe5963b9738604116691793/u);
  assert.match(detail.drawio_review_note, /3e6774d7c05b83caa024f96a475815ca13199af0ef9f8781c639e6b5202c16f4/u);
  assert.match(detail.drawio_review_note, /20-item.*open-answer audit.*not.*ProtocolQA Open-Ended/isu);
});

test('locks ProtocolQA Open-Ended to the system-card disclosure and non-release boundaries', () => {
  const detail = readDetail('ProtocolQA_Open-Ended');
  const en = readSpec('ProtocolQA_Open-Ended', 'en');

  assert.equal(detail.paper_url, 'https://openai.com/index/openai-o1-system-card/');
  assert.equal(detail.arxiv_pdf_url, '');
  assert.equal(detail.pdf_cdn_url, 'https://cdn.openai.com/o1-system-card-20241205.pdf');
  assert.equal(detail.homepage, 'https://openai.com/index/openai-o1-system-card/');
  assert.equal(detail.repository_url, undefined);
  assert.equal(detail.dataset_url, undefined);
  assert.match(nodeLabel(en, 'source_evidence'), /o1 System Card.*December 5, 2024.*3ba7bdbe69e0/isu);
  assert.match(nodeLabel(en, 'disclosure_scope'), /System-card Disclosure.*No Standalone (?:Benchmark )?Paper/isu);
  assert.match(nodeLabel(en, 'futurehouse_mcqs'), /108.*FutureHouse.*Multiple-choice/isu);
  assert.match(nodeLabel(en, 'open_ended_conversion'), /Open-ended.*Short Answer/isu);
  assert.match(nodeLabel(en, 'egregious_errors'), /Egregious Errors.*Common Published Protocols/isu);
  assert.match(nodeLabel(en, 'wet_lab_result'), /Wet-lab Result/isu);
  assert.match(nodeLabel(en, 'repair_question'), /How to Fix/isu);
  assert.match(
    nodeLabel(en, 'model_attempt'),
    /Collect Model Responses.*Report Disclosed pass@1.*Actual Sample Count.*Retry Policy.*Scoring Undisclosed/isu,
  );
  assert.doesNotMatch(nodeLabel(en, 'model_attempt'), /One Model Attempt|One-attempt Success/iu);
  assert.match(nodeLabel(en, 'model_chart'), /GPT-4o 16%.*o1-preview 24%.*o1 Pre 22%.*o1 Post 24%/isu);
  assert.match(nodeLabel(en, 'expert_group'), /19 PhD Scientists.*More Than One Year/isu);
  assert.match(nodeLabel(en, 'expert_baselines'), /Consensus 57%.*Median 42%/isu);
  assert.match(nodeLabel(en, 'selection_rewrite_boundary'), /Selection.*Rewrite.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'grader_boundary'), /Grader.*Scoring.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Dataset Release.*License.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'labbench_audit_boundary'), /Separate LAB-Bench.*20-item/isu);
  assert.match(detail.drawio_review_note, /3ba7bdbe69e022f6be0527edbfe18ac1becdea48d5be9891ab764ff336c8a033/u);
  assert.match(detail.drawio_review_note, /GPT-4o 16%.*o1-preview 24%.*o1 pre-mitigation 22%.*o1 post-mitigation 24%/isu);
  assert.match(detail.drawio_review_note, /selection rules.*rewrite procedure.*grader.*scoring implementation.*dataset release.*license.*not disclosed/isu);
  assert.match(
    detail.drawio_review_note,
    /pass@1.*not.*exactly one response.*sampled per item.*actual sampling count.*retry policy.*scoring implementation.*not disclosed/isu,
  );
  assert.match(detail.drawio_review_note, /not the LAB-Bench paper's separate 20-item open-answer audit/isu);
});

test('locks ProverBench construction-only curation, Lean evaluation, and release boundaries', () => {
  const detail = readDetail('ProverBench');
  const en = readSpec('ProverBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.21801v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.21801v2');
  assert.equal(
    detail.repository_url,
    'https://github.com/deepseek-ai/DeepSeek-Prover-V2/tree/e598a57ea3284997d4a2a168a069fdd5064afbc8',
  );
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/deepseek-ai/DeepSeek-ProverBench/tree/3b9f067088e5e005fab91434ddc05a903e0a6252',
  );
  assert.equal(detail.homepage, detail.dataset_url);
  assert.match(nodeLabel(en, 'source_evidence'), /2504\.21801v2.*b201eb048acc.*e598a57ea328.*3b9f067088e5/isu);
  assert.match(nodeLabel(en, 'benchmark_scope'), /325.*Formalized.*Lean 4/isu);
  assert.match(nodeLabel(en, 'aime_candidates'), /AIME 2024.*2025.*Number Theory.*Algebra/isu);
  assert.match(nodeLabel(en, 'exclusion_filter'), /Geometry.*Combinatorics.*Counting/isu);
  assert.match(nodeLabel(en, 'aime_selection'), /15/isu);
  assert.match(nodeLabel(en, 'textbook_sources'), /Textbooks.*Educational Tutorials.*Competition.*Undergraduate/isu);
  assert.match(nodeLabel(en, 'textbook_formalization'), /310/isu);
  assert.match(nodeLabel(en, 'area_distribution'), /Number Theory 40.*Elementary Algebra 30.*Linear Algebra 50.*Abstract Algebra 40.*Calculus 90.*Real Analysis 30.*Complex Analysis 10.*Functional Analysis 10.*Probability 10/isu);
  assert.match(nodeLabel(en, 'hf_snapshot'), /325 Rows.*header.*formal_statement.*name.*area/isu);
  assert.match(nodeLabel(en, 'non_cot_prompt'), /Complete.*Lean 4 Code.*Direct/isu);
  assert.match(nodeLabel(en, 'cot_prompt'), /Detailed Proof Plan.*Final Lean 4 Proof/isu);
  assert.match(nodeLabel(en, 'sample_budgets'), /32.*128.*512/isu);
  assert.match(nodeLabel(en, 'lean_verification'), /Lean 4\.9\.0-rc2.*Formally Checked/isu);
  assert.match(nodeLabel(en, 'table7_results'), /Non-CoT 7B.*47\.7.*48\.8.*49\.5.*AIME 1.*1.*1.*Non-CoT 671B.*49\.5.*51\.5.*52\.3.*AIME 1.*2.*2.*CoT 7B.*49\.0.*50\.8.*51\.7.*AIME 1.*1.*1.*CoT 671B.*52\.9.*56\.5.*59\.1.*AIME 4.*5.*6/isu);
  assert.match(nodeLabel(en, 'training_boundary'), /Cold-start.*Reinforcement Learning.*Model Training.*Not Benchmark Construction/isu);
  assert.match(nodeLabel(en, 'harness_boundary'), /Standalone Evaluation Harness.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Standalone Dataset License.*Not Disclosed.*Model License.*Not Dataset License/isu);
  assert.doesNotMatch(`${detail.intro}\n${detail.build_method}\n${detail.intro_en}\n${detail.build_method_en}`, /冷启动|强化学习|cold-start|reinforcement learning/iu);
  assert.match(detail.drawio_review_note, /b201eb048acc409a0331d6982da385f305660c7bd73cfb843414c22951355131/u);
  assert.match(detail.drawio_review_note, /e598a57ea3284997d4a2a168a069fdd5064afbc8/u);
  assert.match(detail.drawio_review_note, /3b9f067088e5e005fab91434ddc05a903e0a6252/u);
  assert.match(detail.drawio_review_note, /37974883580aa0f4ab053b3e4748170eb90c3bd439e9acdbece4fd896338e1f7/u);
  assert.match(detail.drawio_review_note, /cold-start.*reinforcement learning.*model training.*not.*benchmark construction/isu);
  assert.match(detail.drawio_review_note, /standalone dataset license.*evaluation harness.*not disclosed/isu);
});
