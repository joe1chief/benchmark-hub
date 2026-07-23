import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['NextQA', 'OCNLI'];
const expectedCounts = new Map([
  ['NextQA', { nodes: 19, edges: 19 }],
  ['OCNLI', { nodes: 23, edges: 27 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'build_method',
  'metric',
  'scale',
  'openness',
  'homepage',
  'intro_en',
  'build_method_en',
  'metric_en',
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

test('keeps the NextQA and OCNLI source bundle bilingual, synchronized, and style-safe', () => {
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
    assert.equal(en.meta.profile, 'academic-paper', `${id} profile`);
    assert.equal(en.meta.source, 'generated', `${id} source enum`);
    assert.equal(en.meta.theme, 'academic-color', `${id} theme`);
    assert.equal(en.meta.layout, 'horizontal', `${id} layout`);
    assert.equal(en.meta.routing, 'orthogonal', `${id} routing`);
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
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks NExT-QA annotation, hard-negative generation, branch-specific scorers, and release boundary', () => {
  const detail = readDetail('NextQA');
  const en = readSpec('NextQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2105.08276v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2105.08276v2');
  assert.equal(detail.homepage, 'https://github.com/doc-doc/NExT-QA');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'videos'), /6,000 VidOR.*YFCC-100M.*Longer.*Interaction-rich.*No Fixed Actor/isu);
  assert.match(nodeLabel(en, 'split'), /7:1:2.*before Question Annotation.*Avoid Cross-split/isu);
  assert.match(nodeLabel(en, 'guidance'), /100 Undergraduates.*Drop-down.*22-word.*6-word.*Unsuitable/isu);
  assert.match(nodeLabel(en, 'annotation'), /Three Stages.*One Year.*Causal.*Temporal.*Descriptive/isu);
  assert.match(nodeLabel(en, 'qa_roles'), /Separate Question and Answer.*Repair.*Visible Objective Evidence/isu);
  assert.match(nodeLabel(en, 'postprocess'), /Boring Videos.*Yes and No.*above Twenty/isu);
  assert.match(nodeLabel(en, 'release'), /5,440.*52,044.*3,870.*570.*1,000.*48%.*29%.*23%/isu);
  assert.match(nodeLabel(en, 'mc_group'), /Exclude Binary.*Question Type.*Top 50.*Sentence-BERT/isu);
  assert.match(nodeLabel(en, 'mc_filter'), /Lemma Duplicates.*Similarity >0\.9.*Similarity <0\.2/isu);
  assert.match(nodeLabel(en, 'mc_manual'), /Four Qualified Distractors.*Correct Answer Evenly.*All Tuples/isu);
  assert.match(nodeLabel(en, 'mc_eval'), /47,692.*Option-index Equality.*Causal.*Temporal.*Descriptive.*88\.38%/isu);
  assert.match(nodeLabel(en, 'oe_task'), /All 52,044.*Free-text/isu);
  assert.match(nodeLabel(en, 'oe_eval'), /NExT-OE.*Stop-word.*Lemmatization.*Exact Match.*WUPS@0.*Added Reference/isu);
  assert.match(nodeLabel(en, 'report'), /Separately.*No Combined Cross-task Score/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /c2c951.*2432e97.*a83f8f5.*MIT.*Raw Videos via Drive.*Construction Scripts Not Released/isu);
  assertEdgeTriples(en, [
    ['acceptance_gate', 'postprocess', 'primary', 'Accept'],
    ['acceptance_gate', 'reject_annotation', 'primary', 'Delete'],
    ['task_gate', 'mc_group', 'primary', 'Five-option'],
    ['task_gate', 'oe_task', 'primary', 'Open-ended'],
    ['mc_eval', 'report', 'primary', 'Accuracy'],
    ['oe_eval', 'report', 'primary', 'WUPS'],
    ['report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'NextQA');
  assert.match(detail.drawio_review_note, /c2c9514af844bbd8a44117d8ffa1e91106e4c4b6d58911766e77725186b31670/u);
  assert.match(detail.drawio_review_note, /2432e9724f88ed9f40010e2989f104570a91de4e/u);
  assert.match(detail.drawio_review_note, /a83f8f581191da07675e0fc83074e0dfcf907273/u);
  assert.match(detail.drawio_review_note, /no combined score/iu);
});

test('locks OCNLI four-condition counts, paper arithmetic conflict, exact verification, releases, and hidden-label evaluation', () => {
  const detail = readDetail('OCNLI');
  const en = readSpec('OCNLI', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2010.05444v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2010.05444v1');
  assert.equal(detail.homepage, 'https://github.com/CLUEbenchmark/OCNLI');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'source'), /Government.*News.*Literature.*TV Talk.*Telephone.*Written and Spoken/isu);
  assert.match(nodeLabel(en, 'preprocess'), /Callhome.*8–50 Characters.*Do Not Translate/isu);
  assert.match(nodeLabel(en, 'writers'), /145.*Native Chinese.*Undergraduates and Graduates.*Language Majors/isu);
  assert.match(nodeLabel(en, 'protocol'), /MNLI.*Entailment.*Neutral.*Contradiction.*70%.*Contribution/isu);
  assert.match(nodeLabel(en, 'single'), /One Hypothesis.*11,986.*No Easy\/Medium\/Hard/isu);
  assert.match(nodeLabel(en, 'multi'), /Three Hypotheses.*Easy.*Medium.*Hard.*12,328/isu);
  assert.match(nodeLabel(en, 'encourage'), /Diverse.*without Negators.*16,584/isu);
  assert.match(nodeLabel(en, 'constraint'), /At Most One of Three.*Negator.*Lower Pay.*15,627/isu);
  assert.match(nodeLabel(en, 'corpus'), /56,486.*56,525.*39-pair Paper Conflict/isu);
  assert.match(nodeLabel(en, 'verify'), /1,919.*1,994.*3,000.*3,000.*Four Independent Labels.*Five/isu);
  assert.match(nodeLabel(en, 'agreement'), /98\.3–98\.8%.*Five Labels/isu);
  assert.match(nodeLabel(en, 'gold'), /Majority Vote.*Entailment.*Neutral.*Contradiction.*No-majority.*“-”/isu);
  assert.match(nodeLabel(en, 'split'), /6,000.*ENCOURAGE\/CONSTRAINT.*3,000.*3,000.*Balance Orders/isu);
  assert.match(nodeLabel(en, 'full_release'), /b53efde.*50,486.*3,000.*3,000.*Labels Withheld.*49.*50/isu);
  assert.match(nodeLabel(en, 'small_release'), /Premise Overlap.*30,286.*10k.*3k/isu);
  assert.match(nodeLabel(en, 'model_eval'), /CBOW.*biLSTM.*ESIM.*BERT-base.*RoBERTa-large.*50k.*30k/isu);
  assert.match(nodeLabel(en, 'exclude'), /Exclude.*No-majority.*CLUE Submission/isu);
  assert.match(nodeLabel(en, 'human'), /20 Practice.*300 Random Test.*90\.3%.*89\.3%.*Undergrad Score Chosen/isu);
  assert.match(nodeLabel(en, 'source_boundary'), /fa195f.*b53efde.*CC BY-NC 2\.0.*LCMC\/ELRA.*CLUE/isu);
  assertEdgeTriples(en, [
    ['strategy_gate', 'single', 'primary', 'SINGLE'],
    ['strategy_gate', 'multi', 'primary', 'MULTI'],
    ['strategy_gate', 'encourage', 'primary', 'ENCOURAGE'],
    ['strategy_gate', 'constraint', 'primary', 'CONSTRAINT'],
    ['full_release', 'small_release', 'primary', 'Remove overlap'],
    ['full_release', 'model_eval', 'primary', '50k'],
    ['small_release', 'model_eval', 'primary', '30k'],
    ['label_gate', 'accuracy', 'primary', 'Public valid label'],
    ['label_gate', 'exclude', 'primary', '“-” or hidden'],
    ['report', 'source_boundary', 'secondary', 'Source boundary'],
  ], 'OCNLI');
  const strategyEdges = ['single', 'multi', 'encourage', 'constraint'].map(to => (
    en.edges.find(edge => edge.from === 'strategy_gate' && edge.to === to)
  ));
  assert.deepEqual(
    strategyEdges.map(edge => [edge.style?.exitX, edge.style?.exitY, edge.style?.entryX, edge.style?.entryY]),
    [
      [1, 0.1, 0, 0.5],
      [1, 0.35, 0, 0.5],
      [1, 0.65, 0, 0.5],
      [1, 0.9, 0, 0.5],
    ],
    'OCNLI strategy branches use separate source-face lanes',
  );
  const corpusEdges = ['single', 'multi', 'encourage', 'constraint'].map(from => (
    en.edges.find(edge => edge.from === from && edge.to === 'corpus')
  ));
  assert.deepEqual(
    corpusEdges.map(edge => [edge.style?.exitX, edge.style?.exitY, edge.style?.entryX, edge.style?.entryY]),
    [
      [1, 0.5, 0, 0.1],
      [1, 0.5, 0, 0.35],
      [1, 0.5, 0, 0.65],
      [1, 0.5, 0, 0.9],
    ],
    'OCNLI corpus merge uses separate target-face lanes',
  );
  assert.match(detail.drawio_review_note, /fa195fa1f0657b54441db59a074f53360066cac729a06e37db68f514b65a4b1a/u);
  assert.match(detail.drawio_review_note, /b53efdee17257a5c33993cf6fcf8ffff0497ea0e/u);
  assert.match(detail.drawio_review_note, /displayed rows sum to 56,525.*39-pair discrepancy/isu);
  assert.match(detail.drawio_review_note, /1,919.*1,994.*3,000.*3,000/isu);
  assert.match(detail.drawio_review_note, /50,486 train rows.*30,286 rows/isu);
});
