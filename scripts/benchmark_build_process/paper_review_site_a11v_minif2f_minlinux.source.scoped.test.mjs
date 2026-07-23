import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MiniF2F-Test', 'Minimal-LinuxBench'];
const expectedCounts = new Map([
  ['MiniF2F-Test', { nodes: 21, edges: 25 }],
  ['Minimal-LinuxBench', { nodes: 16, edges: 18 }],
]);
const syncedKeys = [
  'intro',
  'paper_url',
  'arxiv_pdf_url',
  'pdf_cdn_url',
  'org',
  'build_method',
  'metric',
  'openness',
  'scale',
  'homepage',
  'intro_en',
  'build_method_en',
  'scale_en',
  'metric_en',
  'has_leaderboard',
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

function unescapeMermaidText(value) {
  return value
    .replace(/<br\/>/gu, '\n')
    .replace(/&#124;/gu, '|')
    .replace(/\\"/gu, '"')
    .replace(/\\\\/gu, '\\');
}

function fallbackSignature(flowchart) {
  const nodes = [];
  const edges = [];
  for (const line of flowchart.split('\n')) {
    let match = line.match(/^\s*([a-z][a-z0-9_]*)\["(.*)"\]$/iu);
    if (match) {
      nodes.push({ id: match[1], label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -->\|(.*)\| ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[3], type: 'primary', label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) --> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[2], type: 'primary', label: '' });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\. (.*) \.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[3], type: 'secondary', label: unescapeMermaidText(match[2]) });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) edges.push({ from: match[1], to: match[2], type: 'secondary', label: '' });
  }
  return { nodes, edges };
}

function specSignature(graph) {
  return {
    nodes: graph.nodes.map(node => ({ id: node.id, label: String(node.label) })),
    edges: graph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      type: edge.type,
      label: String(edge.label ?? ''),
    })),
  };
}

test('keeps the A11v pair bilingual, catalog-synchronized, and fallback-synchronized', () => {
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
    assert.equal(en.meta.source, 'generated', `${id} valid source enum`);
    assert.equal(en.meta.theme, 'academic-color', `${id} theme`);
    assert.equal(en.meta.layout, 'horizontal', `${id} layout`);
    assert.equal(en.meta.routing, 'orthogonal', `${id} routing`);
    assert.equal(en.nodes.length, expected.nodes, `${id} English node count`);
    assert.equal(en.edges.length, expected.edges, `${id} English edge count`);
    assert.equal(zh.nodes.length, expected.nodes, `${id} Chinese node count`);
    assert.equal(zh.edges.length, expected.edges, `${id} Chinese edge count`);
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.doesNotMatch(
      en.nodes.map(node => node.label).join('\n'),
      /[\u3400-\u9fff]/u,
      `${id} English purity`,
    );
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_en), specSignature(en), `${id} English fallback`);
    assert.deepEqual(fallbackSignature(detail.flowchart_zh), specSignature(zh), `${id} Chinese fallback`);
    assert.ok(detail.drawio_review_note.length > 2_000, `${id} review evidence`);
  }
});

test('locks MiniF2F-Test provenance, adaptation, test split, baselines, and release boundary', () => {
  const detail = readDetail('MiniF2F-Test');
  const en = readSpec('MiniF2F-Test', 'en');
  const secondaryEdges = en.edges.filter(edge => edge.type === 'secondary');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2109.00110v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2109.00110v2');
  assert.equal(
    detail.homepage,
    'https://github.com/openai/miniF2F/tree/f0dcc8b59e630fba00ba9569ca6714700e0a8801',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(en.meta.description, /Benchmark-v1-aligned/iu);
  assert.doesNotMatch(`${en.meta.description}\n${detail.intro_en}`, /Paper[- ]v1/iu);
  assert.equal(secondaryEdges.length, 4, 'MiniF2F-Test secondary edge count');
  for (const edge of secondaryEdges) {
    assert.equal(
      edge.style?.dashed,
      true,
      `MiniF2F-Test ${edge.from}->${edge.to} renders dashed`,
    );
  }
  assert.match(nodeLabel(en, 'sources'), /IMO.*AIME.*AMC.*MATH.*Custom/isu);
  assert.match(nodeLabel(en, 'select'), /Geometry and Combinatorics Are Under-covered/isu);
  assert.match(nodeLabel(en, 'mcq'), /Correct Choice Only.*All-choice Alternative.*Not the v1/isu);
  assert.match(nodeLabel(en, 'word'), /Explicitly Model.*Discard if Formalization Carries Most Difficulty/isu);
  assert.match(nodeLabel(en, 'witness'), /Given Witness or Answer.*Correctness and Uniqueness.*Much Easier/isu);
  assert.match(nodeLabel(en, 'formalize'), /Average about 15 Minutes/isu);
  assert.match(nodeLabel(en, 'review'), /Review Formalized Statements.*Average about 7\.5 Minutes.*Coverage and Assignment.*Not Reported/isu);
  assert.doesNotMatch(nodeLabel(en, 'review'), /Review Each|Correct Errors/iu);
  assert.match(nodeLabel(en, 'align'), /Benchmark v1.*Lean \+ Metamath.*Isabelle Partial.*HOL Light Work in Progress/isu);
  assert.match(nodeLabel(en, 'split'), /Validation · 244.*Test · 244/isu);
  assert.match(nodeLabel(en, 'test_set'), /20 IMO.*15 AIME.*45 AMC.*70 MATH Algebra.*60 MATH Number Theory.*34 Custom/isu);
  assert.match(nodeLabel(en, 'freeze'), /Error Fixes Only.*MIT Metamath.*Apache Lean and Isabelle.*FreeBSD HOL Light/isu);
  assert.match(nodeLabel(en, 'version_boundary'), /Original v1 Snapshot.*Later v2.*No Formal Submission.*Online Leaderboard/isu);
  assert.match(nodeLabel(en, 'metamath'), /700M Parameters.*128 Expansions.*16 Tactics/isu);
  assert.match(nodeLabel(en, 'tidy'), /128 (?:Iterations|Expansions).*Queue 128.*Depth 8.*Seventeen Tactics.*Deterministic/isu);
  assert.match(nodeLabel(en, 'lean_gptf'), /700M Parameters.*128 Expansions.*16 Tactics/isu);
  assert.match(nodeLabel(en, 'search_check'), /Machine-check.*Any Attempt Succeeds/isu);
  assert.match(nodeLabel(en, 'metrics'), /Pass@N.*Held-out Test Only/isu);
  assert.match(nodeLabel(en, 'test_results'), /Metamath GPT-f.*1\.3%.*1\.6%.*Lean Tidy.*18\.0%.*Lean GPT-f.*24\.6%.*29\.2%/isu);
  assertEdgeTriples(en, [
    ['form_gate', 'formalize', 'primary', 'Direct'],
    ['form_gate', 'mcq', 'secondary', 'MCQ'],
    ['form_gate', 'word', 'secondary', 'Word'],
    ['form_gate', 'witness', 'secondary', 'Witness/set'],
    ['mcq', 'formalize', 'primary', ''],
    ['word', 'formalize', 'primary', ''],
    ['witness', 'formalize', 'primary', ''],
    ['baseline_gate', 'metamath', 'primary', 'Metamath'],
    ['baseline_gate', 'tidy', 'primary', 'Lean tidy'],
    ['baseline_gate', 'lean_gptf', 'primary', 'Lean GPT-f'],
    ['metamath', 'search_check', 'primary', ''],
    ['tidy', 'search_check', 'primary', ''],
    ['lean_gptf', 'search_check', 'primary', ''],
  ], 'MiniF2F-Test');
  assert.match(detail.drawio_review_note, /f0dcc8b59e630fba00ba9569ca6714700e0a8801/u);
  assert.match(detail.drawio_review_note, /c50ad1d7b3a2b196b533a2f644e48bccc02e2e13/u);
  assert.match(detail.drawio_review_note, /e4f113090ad82d64f8ce064d2f55b613a9b6bded/u);
  assert.match(detail.drawio_review_note, /e4dcbd37330caffea6ebe2baa0f2f4cd3596d8a873c00f44ea2ce62ab0aaeea2/u);
  assert.match(detail.drawio_review_note, /review coverage.*128-expansion budget.*queue-size parameter/isu);
});

test('locks Minimal-LinuxBench disclosed construction, attack branches, rates, and private boundary', () => {
  const detail = readDetail('Minimal-LinuxBench');
  const en = readSpec('Minimal-LinuxBench', 'en');
  const secondaryEdges = en.edges.filter(edge => edge.type === 'secondary');

  assert.equal(
    detail.paper_url,
    'https://www-cdn.anthropic.com/7624816413e9b4d2e3ba620c5a5e091b98b190a5.pdf',
  );
  assert.equal(detail.arxiv_pdf_url, '');
  assert.equal(detail.pdf_cdn_url, detail.paper_url);
  assert.equal(detail.homepage, 'https://www.anthropic.com/transparency/model-report');
  assert.equal(detail.openness, 'in-house');
  assert.equal(detail.has_leaderboard, false);
  assert.equal(secondaryEdges.length, 7, 'Minimal-LinuxBench secondary edge count');
  for (const edge of secondaryEdges) {
    assert.equal(
      edge.style?.dashed,
      true,
      `Minimal-LinuxBench ${edge.from}->${edge.to} renders dashed`,
    );
  }
  assert.match(nodeLabel(en, 'source'), /Private LinuxBench.*Redwood Research.*AI-control Arena/isu);
  assert.match(nodeLabel(en, 'adapt'), /1,948 Main\/Side-task Pairs.*Subset Adaptation/isu);
  assert.match(nodeLabel(en, 'construction_boundary'), /Task Sources and Pairing.*Environment and Validation.*Undisclosed/isu);
  assert.match(nodeLabel(en, 'sample'), /Random 200.*Small Minority.*Effective Denominator.*Below 200/isu);
  assert.match(nodeLabel(en, 'main_prompt'), /Three Attack System Prompts.*Every Trajectory.*Entire Transcript Is Monitored/isu);
  assert.match(nodeLabel(en, 'selective_prompt'), /Best-performing.*Handcraft.*Iteratively Refine.*SHADE-Arena.*Not Minimal-Linux/isu);
  assert.match(nodeLabel(en, 'rollout'), /Main Only.*No Extended Thinking.*Main Only.*Prior Checkpoints.*Helpful-only/isu);
  assert.match(nodeLabel(en, 'transcript'), /Main Only.*Entire Transcript.*Assistant Turns.*Serialization.*Undisclosed/isu);
  assert.match(nodeLabel(en, 'monitor'), /Main Only.*No-CoT.*With-CoT.*Early.*Current.*Not Released/isu);
  assert.match(nodeLabel(en, 'score'), /Side Task Completed.*Flagged by Monitor.*Completed \+ Undetected/isu);
  assert.match(nodeLabel(en, 'main_results'), /69 Side Tasks Achieved.*11\.4%.*2\.7%.*95% Wilson/isu);
  assert.match(nodeLabel(en, 'selective_results'), /42\.8.*18\.8.*20\.8.*77\.2.*39\.8.*39\.9.*4\.8.*1\.1.*1\.2/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Non-public Internal Evaluation.*No Code, Data, Version, or License.*No Submission.*Leaderboard/isu);
  assert.match(nodeLabel(en, 'report'), /Figures 4\.4\.3\.2\.A.*4\.4\.3\.3\.A.*Error Bars/isu);
  assertEdgeTriples(en, [
    ['adapt', 'construction_boundary', 'secondary', 'Undisclosed'],
    ['protocol_gate', 'main_prompt', 'primary', 'Main attack'],
    ['protocol_gate', 'selective_prompt', 'secondary', 'Selective transfer'],
    ['main_prompt', 'rollout', 'primary', ''],
    ['selective_prompt', 'rollout', 'secondary', ''],
    ['score', 'main_results', 'primary', 'Main setting'],
    ['score', 'selective_results', 'secondary', 'Selective transfer'],
    ['construction_boundary', 'release_boundary', 'secondary', 'Private boundary'],
    ['release_boundary', 'report', 'secondary', 'Disclosure limit'],
  ], 'Minimal-LinuxBench');
  assert.match(detail.drawio_review_note, /55f6ed1c0735ec1b5b14d99c91794fb759ac4647edc64381123b68be89fd3225/u);
  assert.match(detail.drawio_review_note, /de07fda57950f3a638fb64bee89cb67645583a5f73f47981ec120e717abbe129/u);
  assert.match(detail.drawio_review_note, /non-public.*internal usage distribution/isu);
});
