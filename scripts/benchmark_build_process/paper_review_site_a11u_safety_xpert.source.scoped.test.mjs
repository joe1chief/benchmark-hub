import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MedSafetyBench', 'MedXpertQA'];
const syncedKeys = [
  'paper_url',
  'arxiv_pdf_url',
  'intro',
  'org',
  'build_method',
  'metric',
  'openness',
  'task_type',
  'eval_feature',
  'scale',
  'has_leaderboard',
  'intro_en',
  'build_method_en',
  'metric_en',
  'task_type_en',
  'eval_feature_en',
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

function specNodeLabel(spec, id) {
  const node = spec.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing spec node ${id}`);
  return String(node.label).replace(/\r?\n/gu, ' ');
}

function nodeLabel(flowchart, id) {
  const match = flowchart.match(new RegExp(`^\\s*${id}\\["([^"]+)"\\]`, 'mu'));
  assert.ok(match, `missing Mermaid node ${id}`);
  return match[1].replace(/<br\/>/gu, ' ');
}

function mermaidTopology(flowchart) {
  const nodes = [];
  const edges = [];
  for (const line of flowchart.split('\n')) {
    const node = line.match(/^\s*([a-z][a-z0-9_]*)\["/iu);
    if (node) nodes.push(node[1]);
    const edge = line.match(/^\s*([a-z][a-z0-9_]*)\s+.*(?:-->|\.->)\s+([a-z][a-z0-9_]*)\s*$/iu);
    if (edge) edges.push([edge[1], edge[2]]);
  }
  return { nodes, edges };
}

test('keeps the A11u safety/medical pair bilingual and catalog-synchronized', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.find(candidate => candidate.id === id);
    assert.ok(summary, `${id} catalog entry`);
    for (const key of syncedKeys) {
      assert.deepEqual(summary[key], detail[key], `${id}.${key} catalog sync`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.deepEqual(
      mermaidTopology(detail.flowchart_zh),
      mermaidTopology(detail.flowchart_en),
      `${id} bilingual topology`,
    );
    assert.match(detail.flowchart_en, /^flowchart LR$/mu, `${id} English direction`);
    assert.match(detail.flowchart_zh, /^flowchart LR$/mu, `${id} Chinese direction`);
    assert.doesNotMatch(detail.flowchart_en, /[\u3400-\u9fff]/u, `${id} English purity`);
    assert.match(detail.flowchart_zh, /[\u3400-\u9fff]/u, `${id} Chinese semantics`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks MedSafetyBench construction, validation, judging, and released-code boundary', () => {
  const detail = readDetail('MedSafetyBench');
  const spec = readSpec('MedSafetyBench', 'en');
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2403.03744v5');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2403.03744v5');
  assert.equal(detail.org, 'Harvard University, University of Virginia');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(detail.task_type_en, /Free-form Response Generation/u);
  assert.doesNotMatch(detail.task_type_en, /Classification/u);
  assert.match(specNodeLabel(spec, 'gpt4_filter'), /900 Requests.*100 per Principle/isu);
  assert.match(specNodeLabel(spec, 'llama_filter'), /900 Requests across Nine Principles/isu);
  assert.match(specNodeLabel(spec, 'merge'), /1,800 Unique Items.*900 GPT-4.*900 Llama-2/isu);
  assert.match(specNodeLabel(spec, 'split'), /Stratify by Nine Principles.*450 \+ 450/isu);
  assert.match(specNodeLabel(spec, 'validation'), /25 Doctors × 25 Random Requests.*567\/625/isu);
  assert.match(specNodeLabel(spec, 'eval_input'), /MedSafety-Eval 900.*GenSafety-Eval 330/isu);
  assert.match(specNodeLabel(spec, 'judge'), /gpt-3\.5-turbo-0125.*Temperature 0/isu);
  assert.match(specNodeLabel(spec, 'score'), /1 = Full Refusal.*5 = Full Compliance.*Mean \+ SEM/isu);
  assert.match(specNodeLabel(spec, 'code_gap'), /Raw #reason and #score Text.*No Score Parser or Aggregator/isu);
  assert.match(
    specNodeLabel(spec, 'capability'),
    /MedQA.*MedMCQA.*PubMedQA.*MMLU-Medical.*Three-shot.*Random Training Examples.*10 Random Seeds/isu,
  );
  assert.doesNotMatch(spec.meta.legend, /dashed.*validation/isu);
  assert.match(detail.drawio_review_note, /118\/114\/62\/112\/100\/48\/122\/128\/96/u);
  assert.match(detail.drawio_review_note, /482\/567/u);
  assert.match(
    detail.drawio_review_note,
    /dc5d88e4c0100deada5a96f065a302959e6523a7/u,
  );
  assert.match(detail.drawio_review_note, /74,374 post-paper Llama-3 requests/u);
  assert.match(
    detail.drawio_review_note,
    /Appendix C\.1.*3-shot.*randomly sampled.*10 random seeds/isu,
  );
});

test('locks MedXpertQA count pipeline, public splits, parser, denominator, and paper drift', () => {
  const detail = readDetail('MedXpertQA');
  const spec = readSpec('MedXpertQA', 'en');
  const specZh = readSpec('MedXpertQA', 'zh');
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2501.18362v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2501.18362v3');
  assert.equal(
    detail.org,
    'Tsinghua University, Shanghai Artificial Intelligence Laboratory',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.equal(detail.task_type_en, 'Multiple-choice Question Answering');
  assert.doesNotMatch(detail.task_type_en, /Open-ended|Multi-turn/iu);
  assert.match(specNodeLabel(spec, 'pool'), /37,543.*Text 26,675.*MM 10,868/isu);
  assert.match(specNodeLabel(spec, 'human_filter'), /10,146.*Brier.*16\.78%/isu);
  assert.match(specNodeLabel(spec, 'ai_filter'), /4,737.*Four Attempts.*Fourteen Votes.*Eight-model/isu);
  assert.match(specNodeLabel(spec, 'edit_filter'), /4,713/isu);
  assert.match(specNodeLabel(spec, 'semantic_filter'), /MedCPT.*IQR.*4,683/isu);
  assert.match(specNodeLabel(spec, 'rewrite'), /GPT-4o-2024-11-20.*Claude-3\.5-Sonnet/isu);
  assert.match(specNodeLabel(spec, 'option_count'), /Text = 10 Options.*MM = 5 Options/isu);
  assert.match(specNodeLabel(spec, 'physician_review'), /Licensed-physician.*Delete 223/isu);
  assert.match(specNodeLabel(spec, 'release'), /4,460.*Text 2,455.*MM 2,005/isu);
  assert.match(specNodeLabel(spec, 'public_split'), /5 Dev \+ 2,450 Test.*5 Dev \+ 2,000 Test/isu);
  assert.match(specNodeLabel(spec, 'image_drift'), /2,839.*2,005 MM.*2,852.*2,000/isu);
  assert.match(specNodeLabel(spec, 'label_review'), /10%.*490 \+ 400.*39\/890.*4\.3%/isu);
  assert.match(specNodeLabel(spec, 'special_models'), /o1\/o3-mini.*10%.*Seed 42.*QVQ.*DeepSeek/isu);
  assert.match(
    specNodeLabel(spec, 'parser'),
    /Standard-model.*Exact Answer Trigger.*answer is.*Whole Second Reply.*A–J or A–E.*First Match.*Empty = Wrong/isu,
  );
  assert.match(
    specNodeLabel(spec, 'special_parser'),
    /QVQ.*Final Answer.*First\/Last Letter.*DeepSeek.*boxed.*A–J or A–E/isu,
  );
  assert.match(
    specNodeLabel(specZh, 'pool'),
    /37,543.*文本 26,675.*多模态 10,868.*作答分布.*解释.*难度标注/isu,
  );
  assert.match(specNodeLabel(spec, 'accuracy'), /Every Source ID Has an Output.*Correct ÷ All Retained Outputs/isu);
  assert.match(specNodeLabel(spec, 'source_gap'), /Construction and Augmentation Code Is Not/isu);
  assert.match(detail.drawio_review_note, /Step 1 and Human as Step 2, contradicting/iu);
  assert.match(detail.drawio_review_note, /paper evaluates 18 models.*README says 17/isu);
  assert.match(
    detail.drawio_review_note,
    /exact split.*answer-trigger.*answer is.*whole second-turn reply.*first match.*empty extraction/isu,
  );
  assert.match(
    detail.drawio_review_note,
    /47b29e17b8d980e03b62a22927cff775016c6afd/u,
  );
  assert.match(
    detail.drawio_review_note,
    /7e7c465a68eb2b866926bfa59c8c9d17a8daba65/u,
  );
});
