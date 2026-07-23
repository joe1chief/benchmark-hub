import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PIRA-Bench', 'PMC-VQA'];
const expectedCounts = new Map([
  ['PIRA-Bench', { nodes: 21, edges: 23, secondary: 5 }],
  ['PMC-VQA', { nodes: 22, edges: 23, secondary: 5 }],
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

test('keeps the A12c PIRA and PMC source pair bilingual, fixed, and style-safe', () => {
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
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
  }
});

test('locks PIRA paper, release snapshot, parallel scenarios, judge boundary, and formulas', () => {
  const detail = readDetail('PIRA-Bench');
  const en = readSpec('PIRA-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2603.08013v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2603.08013v1');
  assert.equal(detail.homepage, 'https://www.pira-bench.top');
  assert.equal(detail.has_leaderboard, true);
  assert.equal(detail.openness, 'public');
  assert.match(nodeLabel(en, 'source_evidence'), /2603\.08013v1.*b75a527baea1.*26194bfba20d.*a1da2a91fe24/isu);
  assert.match(nodeLabel(en, 'collect'), /100 Real GUI Trajectories.*Mobile and Desktop.*Passive Observation/isu);
  assert.match(nodeLabel(en, 'preserve'), /Average 32 Frames.*Average 33/isu);
  assert.match(nodeLabel(en, 'noise'), /Application\s+Switching.*Idle Screens.*Random Browsing/isu);
  assert.match(nodeLabel(en, 'profiles'), /Three User Profiles.*Socioeconomic.*Preferences.*Characteristics/isu);
  assert.match(nodeLabel(en, 'direct'), /Direct Recommendation.*Visual Context.*Interleaved Tasks/isu);
  assert.match(nodeLabel(en, 'profile_dependent'), /Profile-dependent.*Screens Alone Are Ambiguous.*Profile Constraints/isu);
  assert.match(nodeLabel(en, 'pure_noise'), /Pure-noise.*No Actionable.*Intent Set Is Empty/isu);
  assert.match(nodeLabel(en, 'annotate'), /Three Independent.*Trajectory and User Profile/isu);
  assert.match(nodeLabel(en, 'consensus'), /At Least 2 of 3.*Empty Set/isu);
  assert.match(nodeLabel(en, 'release'), /100 Trajectories.*Three Profiles.*Trajectory to Profile\s+to Intent Arrays/isu);
  assert.match(nodeLabel(en, 'judge'), /Gemini-3-flash.*Prediction and GT.*User Profile/isu);
  assert.match(nodeLabel(en, 'positive_score'), /Macro-average.*Average Intent F1/isu);
  assert.match(nodeLabel(en, 'negative_score'), /FPS.*Hallucinated Intents.*1 \/ \[1 \+ ln\(1 \+ FPS\)\]/isu);
  assert.match(nodeLabel(en, 'final_score'), /Sfinal.*Average Intent F1.*FPSnorm/isu);
  assert.match(nodeLabel(en, 'wording_boundary'), /32 Screenshots.*33 Screenshots.*Does Not Reconcile/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /6,794,715,214.*d9677ed4aada.*profile\.json.*No Public GT/isu);
  assert.match(nodeLabel(en, 'evaluation_boundary'), /Judge Prompt.*Match Parser\s+Not Published.*\/api\/score/isu);
  assert.match(nodeLabel(en, 'openness_boundary'), /Apache-2\.0.*Submission Schema.*Ground Truth.*Evaluator Are Closed/isu);
  assertEdgeTriples(en, [
    ['source_evidence', 'collect', 'secondary', ''],
    ['scenario_scope', 'direct', 'primary', ''],
    ['scenario_scope', 'profile_dependent', 'primary', ''],
    ['scenario_scope', 'pure_noise', 'primary', ''],
    ['direct', 'annotate', 'primary', ''],
    ['profile_dependent', 'annotate', 'primary', ''],
    ['pure_noise', 'annotate', 'primary', ''],
    ['judge', 'positive_score', 'primary', ''],
    ['judge', 'negative_score', 'primary', ''],
    ['positive_score', 'final_score', 'primary', ''],
    ['negative_score', 'final_score', 'primary', ''],
    ['preserve', 'wording_boundary', 'secondary', ''],
    ['release', 'release_boundary', 'secondary', ''],
    ['judge', 'evaluation_boundary', 'secondary', ''],
  ], 'PIRA-Bench');
  const invalidSerialEdges = new Set([
    'direct|profile_dependent',
    'profile_dependent|pure_noise',
    'positive_score|negative_score',
  ]);
  assert.equal(
    en.edges.some(edge => invalidSerialEdges.has(`${edge.from}|${edge.to}`)),
    false,
    'PIRA parallel scenario and scoring branches must not collapse into a serial pipeline',
  );
  assert.match(detail.drawio_review_note, /b75a527baea198e7a9b3bbb93195fb8b4d5e29e40a98c9720b5d0862c9f58015/u);
  assert.match(detail.drawio_review_note, /26194bfba20d90304ca3c6fe728bbbc65fa927a5/u);
  assert.match(detail.drawio_review_note, /d9677ed4aada60ad2d3745ddfdd51a2378bdd28735a193820ad3d29529951392/u);
  assert.match(detail.drawio_review_note, /a1da2a91fe24132611f5953fffb14bf2644ded2b74526b5f85b80a1f178143d2/u);
  assert.match(detail.drawio_review_note, /judge prompt.*match parser.*undisclosed/isu);
});

test('locks PMC v6 construction, fixed code and data, prompt-parser drift, metrics, and licenses', () => {
  const detail = readDetail('PMC-VQA');
  const en = readSpec('PMC-VQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2305.10415v6');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2305.10415v6');
  assert.equal(
    detail.homepage,
    'https://github.com/xiaoman-zhang/PMC-VQA/tree/1678ec2c97f0b2bf84591ddccd2e84932630e450',
  );
  assert.equal(detail.has_leaderboard, false);
  assert.equal(detail.openness, 'public');
  assert.match(nodeLabel(en, 'source_evidence'), /2305\.10415v6.*7573df69e4c0.*1678ec2c97f0.*b56ae594f794/isu);
  assert.match(nodeLabel(en, 'pmc_oa'), /1\.6M.*Open Access.*2\.4M/isu);
  assert.match(nodeLabel(en, 'subset'), /381K.*First Figure-collection Stage.*Skip Automatic Subfigure/isu);
  assert.match(nodeLabel(en, 'generate'), /Five QAs.*ChatGPT.*Four Options.*Randomize/isu);
  assert.match(nodeLabel(en, 'clean'), /Repeats Refusals.*Dummy.*1,497,808/isu);
  assert.match(nodeLabel(en, 'cross_half'), /Two Cross-fit Halves.*Train on One.*Opposite Half/isu);
  assert.match(nodeLabel(en, 'text_only'), /LLaMA-7B.*Question and Four Options.*Never Supply.*Image/isu);
  assert.match(nodeLabel(en, 'language_filter'), /Shuffle Options.*Five Times.*3 of 5.*848,433/isu);
  assert.match(nodeLabel(en, 'manual_labels'), /2,192.*1,752.*440/isu);
  assert.match(nodeLabel(en, 'classifier'), /81\.77 Percent.*Caption-only/isu);
  assert.match(nodeLabel(en, 'final_dataset'), /226,946.*149,075.*80 Percent Radiology/isu);
  assert.match(nodeLabel(en, 'initial_test'), /Image-disjoint.*50,000.*No Image Overlap/isu);
  assert.match(nodeLabel(en, 'verified_test'), /Image Relevance.*Distractors.*Image Quality.*2,000-item/isu);
  assert.match(nodeLabel(en, 'choice'), /Question q.*Options a1 to a4.*answer is.*A B C or D/isu);
  assert.match(nodeLabel(en, 'blanking'), /Question question.*answer is.*Free-form/isu);
  assert.match(nodeLabel(en, 'acc_parser'), /difflib\.SequenceMatcher.*Most Similar Candidate.*Accuracy/isu);
  assert.match(nodeLabel(en, 'bleu'), /BLEU-1.*Unigram Precision.*Accuracy/isu);
  assert.match(nodeLabel(en, 'release_snapshot'), /train\.csv.*test\.csv.*test_clean\.csv.*50,000.*2,000.*852307310866/isu);
  assert.match(nodeLabel(en, 'release_drift'), /xmcmic.*RadGenome.*train2 test2 images2.*Underscores before 2/isu);
  assert.match(nodeLabel(en, 'metric_boundary'), /SequenceMatcher ACC and BLEU-1.*TE Uses The choices are.*TD Uses Choices.*No BLEU Routine/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /CC BY-SA.*CC0 or CC BY.*MIT/isu);
  assertEdgeTriples(en, [
    ['source_evidence', 'pmc_oa', 'secondary', ''],
    ['final_dataset', 'initial_test', 'primary', ''],
    ['initial_test', 'verified_test', 'primary', ''],
    ['verified_test', 'choice', 'primary', ''],
    ['verified_test', 'blanking', 'primary', ''],
    ['choice', 'acc_parser', 'primary', ''],
    ['blanking', 'acc_parser', 'primary', ''],
    ['blanking', 'bleu', 'primary', ''],
    ['acc_parser', 'report', 'primary', ''],
    ['bleu', 'report', 'primary', ''],
    ['final_dataset', 'release_snapshot', 'secondary', ''],
    ['release_snapshot', 'release_drift', 'secondary', ''],
    ['acc_parser', 'metric_boundary', 'secondary', ''],
    ['release_snapshot', 'license_boundary', 'secondary', ''],
  ], 'PMC-VQA');
  const invalidSerialEdges = new Set([
    'choice|blanking',
    'acc_parser|bleu',
  ]);
  assert.equal(
    en.edges.some(edge => invalidSerialEdges.has(`${edge.from}|${edge.to}`)),
    false,
    'PMC Choice and Blanking evaluation branches must not collapse into a serial pipeline',
  );
  assert.match(detail.drawio_review_note, /7573df69e4c0c821ae34dbe6e7d2e4931d849d8ba5d952dffdda227a03c966fd/u);
  assert.match(detail.drawio_review_note, /1678ec2c97f0b2bf84591ddccd2e84932630e450/u);
  assert.match(detail.drawio_review_note, /b56ae594f794867893143b337b4118a835794647/u);
  assert.match(detail.drawio_review_note, /3ec50be9a8f5d5bf5dfb16c920968122f4801e2b464f0343115459209386714d/u);
  assert.match(detail.drawio_review_note, /8523073108666b8f5231c3d40004a7b74a57381ea54ec9a3019edf1b33eab8f7/u);
  assert.match(detail.drawio_review_note, /no BLEU implementation/iu);
  assert.match(detail.drawio_review_note, /CC BY-SA.*CC0 or CC BY.*MIT/isu);
});
