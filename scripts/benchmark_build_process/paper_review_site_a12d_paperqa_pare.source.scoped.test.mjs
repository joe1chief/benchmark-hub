import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PaperQA', 'Pare-Bench'];
const expectedCounts = new Map([
  ['PaperQA', { nodes: 20, edges: 20, secondary: 4 }],
  ['Pare-Bench', { nodes: 28, edges: 33, secondary: 5 }],
]);
const expectedNodeIds = new Map([
  ['PaperQA', [
    'source_evidence', 'coverage_gap', 'paper_sources', 'author_questions',
    'independent_review', 'agreement', 'consensus', 'metadata', 'paper_scope',
    'fixed_release', 'split_policy', 'response_generation', 'extraction_gate',
    'direct_extract', 'llm_extract', 'normalize', 'report', 'release_boundary',
    'license_boundary', 'extractor_boundary',
  ]],
  ['Pare-Bench', [
    'source_evidence', 'extend_are', 'app_scope', 'fsm_model', 'asymmetry',
    'scenario_schema', 'generation_agent', 'description', 'uniqueness', 'app_state',
    'event_flow', 'validation', 'oracle_run', 'human_review', 'retry_router', 'release', 'eval_config',
    'user_sim', 'observe', 'interaction_gate', 'execute', 'final_oracle', 'robustness',
    'metrics', 'generator_boundary', 'app_boundary', 'release_boundary', 'metric_boundary',
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

function graphEdge(graph, from, to) {
  const edge = graph.edges.find(candidate => candidate.from === from && candidate.to === to);
  assert.ok(edge, `missing edge ${from}->${to}`);
  return edge;
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

test('keeps PaperQA and Pare-Bench bilingual, topology-locked, and source-stage safe', () => {
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
      assert.ok(graph.nodes.every(node => String(node.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} duplicate-edge-label prevention`);
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
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'primary')) {
      assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} remains primary`);
    }

    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 5_000, `${id} review evidence`);
  }
});

test('locks PaperQA paper construction, release-count boundary, and evaluator behavior', () => {
  const detail = readDetail('PaperQA');
  const en = readSpec('PaperQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2310.02255v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2310.02255v3');
  assert.equal(
    detail.homepage,
    'https://github.com/lupantech/MathVista/tree/53d525874bdde205128e6b160b7357a88277d479',
  );
  assert.equal(detail.repository_url, detail.homepage);
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/AI4Math/MathVista/tree/2b6ad69445fbb5695c9b165475e8decdbeb97747',
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2310\.02255v3.*ee5a616e9481.*53d525874bdd.*2b6ad69445fb/isu);
  assert.match(nodeLabel(en, 'coverage_gap'), /Academic-figure scientific reasoning.*unaddressed by existing sources.*visually grounded math.*PaperQA source/isu);
  assert.match(nodeLabel(en, 'paper_sources'), /August 2023.*Hugging Face.*tables.*figures.*charts/isu);
  assert.match(nodeLabel(en, 'author_questions'), /Annotate Questions.*Graduate students in STEM.*each question.*illustration.*scientific reasoning/isu);
  assert.match(nodeLabel(en, 'independent_review'), /Three reviewers.*two-step consistency.*answer labels/isu);
  assert.match(nodeLabel(en, 'agreement'), /736.*99\.2 percent.*Six disagreements/isu);
  assert.match(nodeLabel(en, 'consensus'), /Entire review team.*ambiguous.*consensus/isu);
  assert.match(nodeLabel(en, 'metadata'), /Question and answer types.*language.*source.*category.*task.*grade.*reasoning skills/isu);
  assert.match(nodeLabel(en, 'paper_scope'), /107.*academic-illustration.*college.*Scientific and statistical/isu);
  assert.match(nodeLabel(en, 'fixed_release'), /108.*testmini 19.*test 89.*Images.*questions.*choices.*metadata/isu);
  assert.match(nodeLabel(en, 'split_policy'), /testmini.*development.*Test answers remain withheld.*Approximate the full source distribution/isu);
  assert.match(nodeLabel(en, 'response_generation'), /image separately.*Type-aware hint.*choices.*caption.*OCR/isu);
  assert.match(nodeLabel(en, 'direct_extract'), /exact choice.*integer.*floating.*quick_extract/isu);
  assert.match(nodeLabel(en, 'llm_extract'), /Five-demo.*GPT-4.*99\.5 percent.*200/isu);
  assert.match(nodeLabel(en, 'normalize'), /nearest choice by edit distance.*rounded float.*safe exact equality/isu);
  assert.match(nodeLabel(en, 'report'), /Deterministic Accuracy.*source and metadata.*MathVista subset/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Paper v3 states 107.*Fixed JSON contains 108.*19 plus 89/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /CC BY-SA 4\.0.*copyrights.*Test use allowed.*training prohibited/isu);
  assert.match(nodeLabel(en, 'extractor_boundary'), /GPT-4.*not a checkpoint.*AZURE_OPENAI_MODEL.*external/isu);
  assertEdges(en, [
    ['source_evidence', 'coverage_gap', 'secondary'],
    ['paper_sources', 'author_questions'],
    ['independent_review', 'agreement'],
    ['agreement', 'consensus'],
    ['paper_scope', 'split_policy'],
    ['split_policy', 'fixed_release'],
    ['fixed_release', 'response_generation'],
    ['extraction_gate', 'direct_extract'],
    ['extraction_gate', 'llm_extract'],
    ['direct_extract', 'normalize'],
    ['llm_extract', 'normalize'],
    ['paper_scope', 'release_boundary', 'secondary'],
    ['fixed_release', 'license_boundary', 'secondary'],
    ['llm_extract', 'extractor_boundary', 'secondary'],
  ], 'PaperQA');
  assert.ok(!en.edges.some(edge => edge.from === 'paper_scope' && edge.to === 'fixed_release'));
  assert.ok(!en.edges.some(edge => edge.from === 'split_policy' && edge.to === 'response_generation'));
  assert.ok(!en.edges.some(edge => edge.from === 'direct_extract' && edge.to === 'llm_extract'));
  assert.match(detail.intro_en, /Paper v3 reports 107.*pinned official release contains 108.*19 testmini.*89 test/isu);
  assert.match(detail.scale_en, /107.*108.*19 testmini.*89 test/isu);
  assert.match(detail.drawio_review_note, /ee5a616e9481f0f0d6b8ccc9e6d261f1c35fcb0b9c64d1c5c9d2d9462d6fc5e9/u);
  assert.match(detail.drawio_review_note, /53d525874bdde205128e6b160b7357a88277d479/u);
  assert.match(detail.drawio_review_note, /2b6ad69445fbb5695c9b165475e8decdbeb97747/u);
  assert.match(detail.drawio_review_note, /ab0148dca9d401c31cc47f29b3826eec28a76ff155a1c0878d81e8daf0413480/u);
  assert.match(detail.drawio_review_note, /4231d6c6f5e9ac2e4a96437f316e985a30fa4c8c488d8c220c1cb2032c1bcaaf/u);
  assert.match(detail.drawio_review_note, /228 plus 400 plus 107 sum to 735.*fixed official JSON instead has 108/isu);
  assert.match(detail.drawio_review_note, /specific gap.*scientific reasoning on academic figures unaddressed.*does not broaden/isu);
  assert.match(detail.drawio_review_note, /section 2\.4.*KL divergence 0\.008.*TV distance 0\.035.*scope, split policy, fixed release/isu);
  assert.match(detail.drawio_review_note, /test omits the answer field.*does not authorize reconstruction/isu);
  assert.match(detail.drawio_review_note, /does not disclose an immutable GPT-4 checkpoint.*AZURE_OPENAI_MODEL/isu);
});

test('locks Pare-Bench paper pipeline, active loop, and disclosed release drifts', () => {
  const detail = readDetail('Pare-Bench');
  const en = readSpec('Pare-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2604.00842v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2604.00842v1');
  assert.equal(
    detail.homepage,
    'https://github.com/deepakn97/pare/tree/261149914a9e9dcacb12de620575c691d50e3c2e',
  );
  assert.equal(detail.repository_url, detail.homepage);
  assert.equal(detail.dataset_url, undefined);
  assert.match(nodeLabel(en, 'source_evidence'), /2604\.00842v1.*259caaeaa7d3.*261149914a9e.*c0c5aa90099a.*50b6d79aae2f/isu);
  assert.match(nodeLabel(en, 'extend_are'), /ARE Platform.*active user simulator.*shared persistent state/isu);
  assert.match(nodeLabel(en, 'app_scope'), /9 FSM apps.*four domains.*System.*Agent UI.*FileSystem.*Table 5/isu);
  assert.match(nodeLabel(en, 'fsm_model'), /screens.*states.*Navigation.*forms.*transitions.*active.*background/isu);
  assert.match(nodeLabel(en, 'asymmetry'), /state-dependent actions.*flat app APIs.*shared environment/isu);
  assert.match(nodeLabel(en, 'scenario_schema'), /Initial app states.*Environment and oracle event flow.*validation criteria/isu);
  assert.match(nodeLabel(en, 'generation_agent'), /Claude Agent SDK.*Read-only Pare codebase.*target apps/isu);
  assert.match(nodeLabel(en, 'description'), /Stage 1.*natural-language.*latent user goal.*realistic app context/isu);
  assert.match(nodeLabel(en, 'uniqueness'), /Unique Story.*LLM description check/isu);
  assert.match(nodeLabel(en, 'app_state'), /Stage 2.*init_and_populate_apps.*contacts.*mail.*calendar/isu);
  assert.match(nodeLabel(en, 'event_flow'), /Stage 3.*build_event_flow.*environment events.*oracle user and agent/isu);
  assert.match(nodeLabel(en, 'validation'), /Stage 4.*final-state conditions.*completion actions.*success oracle/isu);
  assert.match(nodeLabel(en, 'oracle_run'), /Oracle Checks Pass/isu);
  assert.match(nodeLabel(en, 'human_review'), /Paper §5.*Authors Verify Every Candidate.*story coherence.*validation.*event content realism/isu);
  assert.match(nodeLabel(en, 'retry_router'), /Route Failed Oracle Check.*Stage 2 app state.*Stage 3 events.*Stage 4 validation.*Retry only the failed stage/isu);
  assert.match(nodeLabel(en, 'release'), /143 scenarios.*four domains.*timing.*orchestration.*failures.*noise/isu);
  assert.match(nodeLabel(en, 'eval_config'), /Four runs.*GPT-5-mini.*10 turns.*one iteration.*Observe 5.*execute 10/isu);
  assert.match(nodeLabel(en, 'user_sim'), /acts first.*current-state tools.*Accept.*reject.*gather context/isu);
  assert.match(nodeLabel(en, 'observe'), /user action and notifications.*Read-only tools.*Wait or propose/isu);
  assert.match(nodeLabel(en, 'interaction_gate'), /Proposal Outcome.*Accept.*reject.*gather.*task end.*turn limit/isu);
  assert.match(nodeLabel(en, 'execute'), /cross-app flat API.*approved task only.*next user turn/isu);
  assert.match(nodeLabel(en, 'final_oracle'), /fulfilled user goals.*proposals.*acceptances.*read actions.*turns/isu);
  assert.match(nodeLabel(en, 'robustness'), /Baseline.*no injected failure or noise.*0\.1.*0\.2.*0\.4.*Poisson noise 2.*4.*6 events\/min.*interleaves/isu);
  assert.match(nodeLabel(en, 'metrics'), /Success@4.*Success⁴.*proposal rates.*Acceptance.*read-only/isu);
  assert.match(nodeLabel(en, 'generator_boundary'), /Claude Agent SDK only.*Checkpoints are not disclosed.*build_event_flow.*build_events_flow/isu);
  assert.match(nodeLabel(en, 'app_boundary'), /9 FSM plus 3 core.*9 domain plus 2 core.*FileSystem/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /261149914a9e.*MIT.*143 scenario files.*143 full entries.*50b6d79aae2f.*No official HF/isu);
  assert.match(nodeLabel(en, 'metric_boundary'), /Metric-semantics.*Success@k.*Successᵏ.*Pass@k.*Passᵏ.*null filtering.*fewer than k valid runs.*user and assistant calls/isu);
  assertEdges(en, [
    ['source_evidence', 'extend_are', 'secondary'],
    ['generation_agent', 'description'],
    ['description', 'uniqueness'],
    ['uniqueness', 'description'],
    ['uniqueness', 'app_state'],
    ['app_state', 'event_flow'],
    ['event_flow', 'validation'],
    ['validation', 'oracle_run'],
    ['oracle_run', 'human_review'],
    ['oracle_run', 'retry_router'],
    ['retry_router', 'validation'],
    ['retry_router', 'event_flow'],
    ['retry_router', 'app_state'],
    ['release', 'eval_config'],
    ['user_sim', 'observe'],
    ['observe', 'interaction_gate'],
    ['interaction_gate', 'execute'],
    ['interaction_gate', 'final_oracle'],
    ['interaction_gate', 'user_sim'],
    ['execute', 'user_sim'],
    ['eval_config', 'robustness'],
    ['robustness', 'user_sim'],
    ['generation_agent', 'generator_boundary', 'secondary'],
    ['app_scope', 'app_boundary', 'secondary'],
    ['release', 'release_boundary', 'secondary'],
    ['metrics', 'metric_boundary', 'secondary'],
  ], 'Pare-Bench');
  assert.deepEqual(graphEdge(en, 'generation_agent', 'generator_boundary').waypoints, [
    { x: 1810, y: 160 },
    { x: 1810, y: 820 },
    { x: 1940, y: 820 },
  ]);
  assert.deepEqual(graphEdge(en, 'app_scope', 'app_boundary').waypoints, [
    { x: 740, y: 160 },
    { x: 510, y: 160 },
    { x: 510, y: 820 },
    { x: 640, y: 820 },
  ]);
  assert.deepEqual(graphEdge(en, 'release', 'release_boundary').waypoints, [
    { x: 1550, y: 410 },
    { x: 1550, y: 820 },
    { x: 1420, y: 820 },
  ]);
  assert.deepEqual(graphEdge(en, 'metrics', 'metric_boundary').waypoints, [
    { x: 8, y: 410 },
    { x: 8, y: 820 },
    { x: 120, y: 820 },
  ]);
  assert.deepEqual(graphEdge(en, 'interaction_gate', 'user_sim').waypoints, [
    { x: 480, y: 760 },
    { x: 1000, y: 760 },
  ]);
  assert.ok(!en.edges.some(edge => edge.from === 'eval_config' && edge.to === 'user_sim'));
  assert.ok(!en.edges.some(edge => edge.from === 'eval_config' && edge.to === 'observe'));
  assert.ok(!en.edges.some(edge => edge.from === 'execute' && edge.to === 'final_oracle'));
  assert.ok(!en.edges.some(edge => edge.from === 'robustness' && edge.to === 'interaction_gate'));
  assert.match(detail.scale_en, /143 scenarios.*9 FSM apps.*3 core apps/isu);
  assert.match(detail.metric_en, /Success@4.*Success\^4.*Proposal Rate.*Acceptance Rate.*Average Read Actions/isu);
  assert.match(detail.drawio_review_note, /259caaeaa7d3cc16e232851469c6a1578ca7138cc7c89ec12ec961b9baf697d4/u);
  assert.match(detail.drawio_review_note, /261149914a9e9dcacb12de620575c691d50e3c2e/u);
  assert.match(detail.drawio_review_note, /c0c5aa90099adf7e397fb9f30b57f59d045aa0e35e5724c1d21847b21755c10e/u);
  assert.match(detail.drawio_review_note, /50b6d79aae2f0ba33d945b5ec86b0e2fab632bee170aba8f175d957f0020a269/u);
  assert.match(detail.drawio_review_note, /fe0e751a1c2216d10708cc46d3e6326d3d295a73eebcdee7b4778f1dc60d87aa/u);
  assert.match(detail.drawio_review_note, /scenario_metadata\.json has only 20 entries.*not used as the benchmark-count authority/isu);
  assert.match(detail.drawio_review_note, /do not link a separate Hugging Face dataset.*not a dataset source.*no HF dataset revision/isu);
  assert.match(detail.drawio_review_note, /not treated as proof.*original candidate-generation run.*may postdate the paper/isu);
  assert.match(detail.drawio_review_note, /build_event_flow.*build_events_flow/isu);
  assert.match(detail.drawio_review_note, /section 5 explicitly states.*authors verify every candidate.*Appendix E abbreviates/isu);
  assert.match(detail.drawio_review_note, /duplicate returns to Stage 1.*failure returns execution feedback to the corresponding generating stage/isu);
  assert.match(detail.drawio_review_note, /maximum-turn truncation.*Appendix B.*accept, reject, gather context, and truncated/isu);
  assert.match(detail.drawio_review_note, /robustness variants are evaluation configurations over the complete.*neither is a proposal-decision prerequisite/isu);
  assert.match(detail.drawio_review_note, /59b6b96fee9059ca2e5684ddc0ab189a5718c5bae8edeaa15b97292197644a00/u);
  assert.match(detail.drawio_review_note, /73be3b3991422f325eb5e460b266f561fcb3dc03492e065938af18abae1cca92/u);
  assert.match(detail.drawio_review_note, /filters null success_numeric.*fewer than k valid runs.*denominator drift/isu);
  assert.match(detail.drawio_review_note, /proactive-agent plus user-agent.*paper interprets Read Actions.*assistant information gathering/isu);
});
