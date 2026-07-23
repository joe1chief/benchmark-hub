import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PhyX', 'Pi-Bench'];
const expectedCounts = new Map([
  ['PhyX', { nodes: 28, edges: 29, secondary: 6 }],
  ['Pi-Bench', { nodes: 30, edges: 34, secondary: 6 }],
]);
const expectedNodeIds = new Map([
  ['PhyX', [
    'evidence', 'taxonomy', 'annotators', 'source_policy', 'question_pair', 'text_views',
    'caption', 'candidates', 'cross_check', 'duplicate_scan', 'phd_review', 'length_filter',
    'dataset', 'testmini', 'eval_query', 'cot', 'extract', 'format_gate', 'mc_match',
    'oe_judge', 'mc_fallback', 'accuracy', 'report', 'prompt_boundary', 'release_boundary',
    'code_boundary', 'license_boundary', 'scope_boundary',
  ]],
  ['Pi-Bench', [
    'evidence', 'personas', 'episodes', 'environment', 'workflow_tasks', 'dependencies',
    'starts', 'hidden_intents', 'checklists', 'graders', 'reference_review', 'release',
    'user_config', 'repeat3', 'session_start', 'agent_act', 'observe', 'status_gate',
    'completed', 'inferred', 'provided', 'terminal_gate', 'proc', 'comp', 'report',
    'prompt_boundary', 'paper_metric_boundary', 'code_metric_boundary', 'release_boundary',
    'license_boundary',
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

test('keeps PhyX and Pi-Bench bilingual, geometry-locked, and source-stage safe', () => {
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
        `${id} secondary count`,
      );
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
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese node semantics`);
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 38, `${id}.${node.id} Chinese line width: ${line}`);
      }
    }
    for (const edge of zh.edges.filter(edge => edge.label)) {
      assert.match(String(edge.label), /[\u3400-\u9fff]/u, `${id} ${edge.from}->${edge.to} Chinese edge semantics`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'primary')) {
      assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} remains primary`);
    }
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 4_000, `${id} review evidence`);
  }
});

test('locks PhyX construction, three-step evaluation, and release drift', () => {
  const detail = readDetail('PhyX');
  const en = readSpec('PhyX', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2505.15929v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2505.15929v2');
  assert.equal(detail.homepage, 'https://phyx-bench.github.io/');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /2505\.15929v2.*fc4a3a5a69d6.*2cee68b17643.*3994c9615bcf.*5a23a2762d06.*5a72326b9392/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /Six Domains.*25 Subdomains.*Six Reasoning Types/isu);
  assert.match(nodeLabel(en, 'annotators'), /STEM Graduate.*Expert Annotators.*English.*One Realistic Image/isu);
  assert.match(nodeLabel(en, 'source_policy'), /Freely Accessible Online.*Textbooks.*Wide Range.*Avoid Immediately Available Answers/isu);
  assert.match(nodeLabel(en, 'question_pair'), /Every OE Item to MC.*Every MC Item to OE.*One Correct Option of Four/isu);
  assert.match(nodeLabel(en, 'text_views'), /Full-Text.*Text-DeRedundancy.*Text-Minimal/isu);
  assert.match(nodeLabel(en, 'caption'), /GPT-4o.*Self-contained.*Text-only/isu);
  assert.match(nodeLabel(en, 'candidates'), /3,300.*Various Sources/isu);
  assert.match(nodeLabel(en, 'cross_check'), /Cross-check.*Periodic Random Reviews.*Ambiguities.*Team/isu);
  assert.match(nodeLabel(en, 'duplicate_scan'), /Potential Duplicates.*Lexical Overlap/isu);
  assert.match(nodeLabel(en, 'phd_review'), /Physics PhD.*Scientific Accuracy.*Dataset Bias/isu);
  assert.match(nodeLabel(en, 'length_filter'), /Textual Length.*Shortest 10 Percent/isu);
  assert.match(nodeLabel(en, 'dataset'), /3,000 Unique.*6,000 Paired OE and MC.*18,000 Core/isu);
  assert.match(nodeLabel(en, 'testmini'), /Proportional Random.*Six Physics Domains.*1,000 Problems.*6,000/isu);
  assert.match(nodeLabel(en, 'cot'), /Step-by-step.*Appendix D\.1/isu);
  assert.match(nodeLabel(en, 'extract'), /Rule-based.*Boxed.*Final or Correct Answer.*A to D/isu);
  assert.match(nodeLabel(en, 'oe_judge'), /DeepSeek-V3.*Multiple Attempts.*All Attempts to Succeed/isu);
  assert.match(nodeLabel(en, 'mc_fallback'), /Letter Match Fails.*Same LLM Judge/isu);
  assert.match(nodeLabel(en, 'accuracy'), /Binary Correctness.*Accuracy/isu);
  assert.match(nodeLabel(en, 'prompt_boundary'), /Paper Discloses.*CoT.*Regex.*Judge.*Caption.*Reasoning-type/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /HF Snapshot.*5a23a2762d06.*3,000 and 1,000.*Four Default TSV.*Multilingual.*With-steps/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /2cee68b17643.*Five Retries.*0\.0 to 2\.0.*First Parseable Verdict.*All-attempt Consensus/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /MIT.*Upstream Source Terms.*Copyright.*Fair-use/isu);
  assert.match(nodeLabel(en, 'scope_boundary'), /University-level.*English.*Realistic Visual.*Not Schematic-only/isu);
  assertEdgeTriples(en, [
    ['evidence', 'taxonomy', 'secondary', ''],
    ['taxonomy', 'annotators', 'primary', ''],
    ['source_policy', 'question_pair', 'primary', ''],
    ['caption', 'candidates', 'primary', ''],
    ['cross_check', 'duplicate_scan', 'primary', ''],
    ['phd_review', 'length_filter', 'primary', ''],
    ['dataset', 'testmini', 'primary', ''],
    ['extract', 'format_gate', 'primary', ''],
    ['format_gate', 'mc_match', 'primary', ''],
    ['format_gate', 'oe_judge', 'primary', ''],
    ['mc_match', 'mc_fallback', 'primary', ''],
    ['oe_judge', 'accuracy', 'primary', ''],
    ['cot', 'prompt_boundary', 'secondary', ''],
    ['dataset', 'release_boundary', 'secondary', ''],
    ['oe_judge', 'code_boundary', 'secondary', ''],
    ['source_policy', 'license_boundary', 'secondary', ''],
    ['taxonomy', 'scope_boundary', 'secondary', ''],
  ], 'PhyX');
  assert.match(detail.intro_en, /3,000.*6 physics domains.*25 subdomains.*six reasoning types.*paired OE and MC.*Full-Text.*Text-DeRedundancy.*Text-Minimal/isu);
  assert.match(detail.scale_en, /3,300 candidates.*3,000 unique.*18,000 core.*1,000-problem testmini/isu);
  assert.match(detail.metric_en, /Accuracy.*OE.*DeepSeek-V3.*MC.*letter/isu);
  assert.match(detail.drawio_review_note, /fc4a3a5a69d6109b6dd215a7453f7a0166c286fa57f7fe167c51080bd54700e0/u);
  assert.match(detail.drawio_review_note, /https:\/\/github\.com\/NastyMarcus\/PhyX\/tree\/2cee68b17643dc66feaa10406e93d708d99243fe/u);
  assert.match(detail.drawio_review_note, /3994c9615bcf26679d0488e32a13b607b7c50ae900873d233b290f5b02f8d148/u);
  assert.match(detail.drawio_review_note, /5a23a2762d0626b5f319bd725138cc9b18b45d8f/u);
  assert.match(detail.drawio_review_note, /5a72326b93922bd85dddd1d5a314b7f0804f9519f1090ba49c97b346202f0abd/u);
  assert.match(detail.drawio_review_note, /all attempts.*current released evaluator.*first parseable/isu);
});

test('locks Pi-Bench construction, terminal intent loop, paper metrics, and released-code boundary', () => {
  const detail = readDetail('Pi-Bench');
  const en = readSpec('Pi-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2605.14678v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2605.14678v3');
  assert.equal(detail.homepage, 'https://simplified-reasoning.github.io/Pi-Bench/');
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /2605\.14678v3.*f435e09ef007.*383910b16987.*aeb39fc6eb78.*116ae739261d.*95807131f24d/isu);
  assert.match(nodeLabel(en, 'personas'), /Researcher.*Marketer.*Pharmacist.*Law Trainee.*Financier/isu);
  assert.match(nodeLabel(en, 'episodes'), /One Episode per Persona.*20 Sessions.*One Multi-turn Task per Session/isu);
  assert.match(nodeLabel(en, 'environment'), /Shared Workspace.*187 Unique Tools.*21 Reusable Skills/isu);
  assert.match(nodeLabel(en, 'workflow_tasks'), /Authentic Work Routines.*Concrete Deliverables.*Human-reviewed.*Realism.*Feasibility/isu);
  assert.match(nodeLabel(en, 'dependencies'), /Six Strong Groups.*Two to Three Tasks.*Five Largely Independent/isu);
  assert.match(nodeLabel(en, 'starts'), /Natural Underspecified.*User-issued.*Environment-triggered/isu);
  assert.match(nodeLabel(en, 'hidden_intents'), /524 Recoverable.*Session-local.*Persistent/isu);
  assert.match(nodeLabel(en, 'checklists'), /510 Rubric.*168 Rule.*Necessary and Sufficient/isu);
  assert.match(nodeLabel(en, 'graders'), /Rubric Model.*Deterministic.*File.*String.*Tool.*Schema/isu);
  assert.match(nodeLabel(en, 'reference_review'), /Execute and Review Every Task.*Reference Solutions.*Files Tools Skills and Graders/isu);
  assert.match(nodeLabel(en, 'release'), /100 Tasks.*Five Personas.*100 Multi-turn Sessions/isu);
  assert.match(nodeLabel(en, 'user_config'), /GPT-5\.4.*User Agent.*Rubric Grader.*Temperature Zero.*Default Decode.*Thinking/isu);
  assert.match(nodeLabel(en, 'repeat3'), /Three Independent Trajectories.*Means.*Standard Deviations/isu);
  assert.match(nodeLabel(en, 'observe'), /Response.*Tool Calls.*Workspace Updates.*Artifacts/isu);
  assert.match(nodeLabel(en, 'status_gate'), /Exactly One Terminal Status/isu);
  assert.match(nodeLabel(en, 'completed'), /Action or Artifact.*No Explicit User Disclosure/isu);
  assert.match(nodeLabel(en, 'inferred'), /Focused Question.*User Reveals.*Next Turn/isu);
  assert.match(nodeLabel(en, 'provided'), /No Resolution or Targeted Question.*User Supplies/isu);
  assert.match(nodeLabel(en, 'terminal_gate'), /All Intents Terminal.*Final Response/isu);
  assert.match(nodeLabel(en, 'proc'), /Completed plus Inferred.*All Hidden Intents.*Equal Credit/isu);
  assert.match(nodeLabel(en, 'comp'), /Binary 0 or 1.*Rubric Model or Deterministic Program.*Mean over the Session Checklist/isu);
  assert.match(nodeLabel(en, 'prompt_boundary'), /Public Prompt.*Repo Includes User-agent Prompts.*Intent Judges.*Checklist Judge.*XML Parsers/isu);
  assert.match(nodeLabel(en, 'paper_metric_boundary'), /Paper-v3.*Unweighted Per-session PROC.*Unweighted Per-session COMP/isu);
  assert.match(nodeLabel(en, 'code_metric_boundary'), /383910b16987.*Dependency-expanded.*Criterion Weights.*Group-size-weighted Overall/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /HF Snapshot.*116ae739261d.*100-row tasks\.jsonl.*Task YAML Only.*Full Benchmark Lives in GitHub/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Apache-2\.0.*Credentials.*Environment Variables.*No Secrets/isu);
  assertEdgeTriples(en, [
    ['evidence', 'personas', 'secondary', ''],
    ['personas', 'episodes', 'primary', ''],
    ['environment', 'workflow_tasks', 'primary', ''],
    ['workflow_tasks', 'dependencies', 'primary', ''],
    ['starts', 'hidden_intents', 'primary', ''],
    ['starts', 'checklists', 'primary', ''],
    ['checklists', 'graders', 'primary', ''],
    ['reference_review', 'release', 'primary', ''],
    ['release', 'user_config', 'primary', ''],
    ['repeat3', 'session_start', 'primary', ''],
    ['observe', 'status_gate', 'primary', ''],
    ['status_gate', 'completed', 'primary', ''],
    ['status_gate', 'inferred', 'primary', ''],
    ['status_gate', 'provided', 'primary', ''],
    ['terminal_gate', 'agent_act', 'primary', ''],
    ['terminal_gate', 'proc', 'primary', ''],
    ['terminal_gate', 'comp', 'primary', ''],
    ['proc', 'report', 'primary', ''],
    ['comp', 'report', 'primary', ''],
    ['user_config', 'prompt_boundary', 'secondary', ''],
    ['report', 'paper_metric_boundary', 'secondary', ''],
    ['report', 'code_metric_boundary', 'secondary', ''],
    ['release', 'release_boundary', 'secondary', ''],
    ['release', 'license_boundary', 'secondary', ''],
  ], 'Pi-Bench');
  assert.match(detail.intro_en, /100 multi-turn tasks.*five personas.*persistent workspaces.*hidden intents.*cross-session/isu);
  assert.match(detail.scale_en, /100 tasks.*524 hidden intents.*510 rubric.*168 rule.*187 tools.*21 skills/isu);
  assert.match(detail.metric_en, /PROC.*completed.*inferred.*COMP.*binary checklist/isu);
  assert.match(detail.drawio_review_note, /f435e09ef0077d097238fab69828ccacce45214e3aa34b931b3aca05ee351183/u);
  assert.match(detail.drawio_review_note, /https:\/\/github\.com\/Simplified-Reasoning\/Pi-Bench\/tree\/383910b1698758a198b86037c63a111c8edc32ad/u);
  assert.match(detail.drawio_review_note, /aeb39fc6eb7878288f7c968aa823cd1b5b2184973f18fc8763483f5e43843abe/u);
  assert.match(detail.drawio_review_note, /116ae739261d7e1ca048eb83bab4cf48db90f992/u);
  assert.match(detail.drawio_review_note, /95807131f24d3aab380d2ebe606ba178f85eab66397fdd3e14de40c30ed4da49/u);
  assert.match(detail.drawio_review_note, /paper formula.*current released code.*dependency-expanded.*group-size-weighted/isu);
});
