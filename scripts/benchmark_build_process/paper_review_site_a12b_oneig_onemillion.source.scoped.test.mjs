import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['OneIG-Bench', 'OneMillion-Bench'];
const expectedCounts = new Map(benchmarkIds.map(id => [id, { nodes: 18, edges: 17 }]));

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

test('keeps the A12b source pair bilingual, fallback-synchronized, and style-safe', () => {
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

test('locks OneIG-Bench v3 construction, fixed evaluator, release counts, and license boundary', () => {
  const detail = readDetail('OneIG-Bench');
  const en = readSpec('OneIG-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2506.07977v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2506.07977v3');
  assert.equal(
    detail.homepage,
    'https://github.com/OneIG-Bench/OneIG-Benchmark/tree/41b49831e79e6dde5323618c164da1c4cf0f699d',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /2506\.07977v3.*d23bb2e1d69d.*41b49831e79e.*f80e6317806b/isu);
  assert.match(nodeLabel(en, 'scope'), /Five Dimensions.*Alignment.*Text.*Knowledge and Reasoning.*Style.*Diversity/isu);
  assert.match(nodeLabel(en, 'sources'), /Public Internet.*User Inputs.*Established Datasets/isu);
  assert.match(nodeLabel(en, 'cluster'), /Cluster Scenes and Semantics.*Prevent Category Dominance.*Five-dimension/isu);
  assert.match(nodeLabel(en, 'dedupe'), /Cluster-center Embeddings.*Cosine Similarity/isu);
  assert.match(nodeLabel(en, 'rewrite'), /GPT-4o.*Beta\(2\.37, 2\.86\).*under 30.*30–60.*over 60.*1:2:1/isu);
  assert.match(nodeLabel(en, 'review'), /Sensitive Content.*Conflicting Semantics.*Rationality/isu);
  assert.match(nodeLabel(en, 'release'), /245 Anime.*244 Portrait.*206 Object.*200 Text.*225 Reasoning.*200 Multilingual.*1,120 English.*1,320 Chinese/isu);
  assert.match(nodeLabel(en, 'code_boundary'), /m×n.*image_grid 2.*Four Images.*Precomputed Questions and Answers/isu);
  assert.match(nodeLabel(en, 'alignment'), /Paper: GPT-4o.*Code: Load Fixed.*Qwen2\.5-VL-7B.*Parent Answers/isu);
  assert.match(nodeLabel(en, 'text'), /Edit Distance.*Completion Rate.*WAC.*Phi 100 English.*50 Chinese/isu);
  assert.match(nodeLabel(en, 'reasoning'), /Paper: GPT-4o.*Code: Load Fixed Answer JSON.*LLM2CLIP/isu);
  assert.match(nodeLabel(en, 'style'), /CSD.*OneIG Style.*Maximum Reference.*Mean/isu);
  assert.match(nodeLabel(en, 'diversity'), /One Minus DreamSim Similarity.*DreamSim Distance/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /f80e6317806b.*CC BY-NC 4\.0.*1,120.*1,320.*No LICENSE/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', ''],
    ['bilingual', 'release', 'primary', ''],
    ['release', 'generate', 'primary', ''],
    ['text', 'reasoning', 'primary', ''],
    ['release', 'code_boundary', 'secondary', ''],
    ['report', 'license_boundary', 'secondary', ''],
  ], 'OneIG-Bench');
  assert.match(detail.scale_en, /2,440.*1,120.*245 anime.*244 portrait.*206 object.*200 text.*225 reasoning.*1,320.*200 multilingual/isu);
  assert.match(detail.metric_en, /edit distance.*completion rate.*word accuracy.*dual-encoder.*DreamSim/isu);
  assert.match(detail.drawio_review_note, /d23bb2e1d69d85fa3da3b6a48bfdfc037909b1893bcc1eabdb35a67c691e8c5a/u);
  assert.match(detail.drawio_review_note, /41b49831e79e6dde5323618c164da1c4cf0f699d/u);
  assert.match(detail.drawio_review_note, /f80e6317806bf0b1d92da3113633a62451b0fd4f/u);
  assert.match(detail.drawio_review_note, /fdbb075cb06d1d475583c5db373427327b20853914361b5757cf99573b06792d/u);
  assert.match(detail.drawio_review_note, /d07b6abc252368f3f46a3985d742c92b0c1531bcac5d547fe12ae9e04b2118cc/u);
  assert.match(detail.drawio_review_note, /precomputed question\/dependency and answer JSON.*m-by-n.*DreamSim's distance/isu);
  assert.match(detail.drawio_review_note, /five core steps.*Figure 2's caption says four methodical steps.*four method groups/isu);
  assert.match(detail.drawio_review_note, /CC BY-NC 4\.0.*Git tree contains no LICENSE/isu);
});

test('locks OneMillion-Bench v1 curation, score formula, fixed data, and documented drift', () => {
  const detail = readDetail('OneMillion-Bench');
  const en = readSpec('OneMillion-Bench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2603.07980v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2603.07980v1');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/humanlaya-data-lab/OneMillion-Bench/tree/5cf9d5005e2e1f20b4481ed50846161697e82a73',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /2603\.07980v1.*97b53e25372e.*5cf9d5005e2e.*9590b6bfccff/isu);
  assert.match(nodeLabel(en, 'scope'), /Finance.*Law.*Healthcare.*Natural Science.*Industry.*2,000 Expert Hours/isu);
  assert.match(nodeLabel(en, 'task'), /Semi-open Tasks.*Reference Reasoning.*Weighted Rubrics/isu);
  assert.match(nodeLabel(en, 'adversarial'), /Several Frontier-agent Families.*Passing Threshold.*Several Agents Fail/isu);
  assert.match(nodeLabel(en, 'peer'), /Second Same-subdomain Specialist.*Clarity.*Specialization.*Rubric Fairness/isu);
  assert.match(nodeLabel(en, 'third'), /Third Expert.*Disputes.*Reliability/isu);
  assert.match(nodeLabel(en, 'difficulty'), /Universally Solved.*Universally Low Scores.*Mission-impossible/isu);
  assert.match(nodeLabel(en, 'rubrics'), /Signed Weight.*Source and Citation.*-20 to \+10/isu);
  assert.match(nodeLabel(en, 'release'), /400 Tasks.*80 per Domain.*40 per Language.*200 Global.*200 Chinese/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /5cf9d5005e2e.*Apache-2\.0.*400 Rows.*11–37.*Finance and Law.*Three Domains.*Matched Pairs/isu);
  assert.match(nodeLabel(en, 'systems'), /17 Vanilla.*Web-search Variants.*Three Deep Research/isu);
  assert.match(nodeLabel(en, 'expert_score'), /Signed Weights.*Positive-weight Maximum.*\[0, 1\]/isu);
  assert.match(nodeLabel(en, 'pass_rate'), /at Least 0\.7.*Binary Pass Indicators.*Global and Chinese/isu);
  assert.match(nodeLabel(en, 'aggregate'), /Within Each Domain.*Five Domain Scores.*Rubric Type/isu);
  assert.match(nodeLabel(en, 'economic'), /USD 1,008,370.*CNY 921,832.*Value.*Score.*Pass Rate/isu);
  assert.match(nodeLabel(en, 'drift'), /37\/86.*37\/92.*Matched case_id Pairs.*Positive Weight \+12.*README en Filter Misses global\/cn.*Partial Evaluator/isu);
  assertEdgeTriples(en, [
    ['evidence', 'scope', 'secondary', ''],
    ['adversarial', 'peer', 'primary', ''],
    ['third', 'difficulty', 'primary', ''],
    ['rubrics', 'release', 'primary', ''],
    ['expert_score', 'pass_rate', 'primary', ''],
    ['release', 'release_boundary', 'secondary', ''],
    ['economic', 'drift', 'secondary', ''],
  ], 'OneMillion-Bench');
  assert.match(detail.scale_en, /400 tasks.*80 per domain.*200 Global.*200 Chinese.*37 subdomains\/86.*92.*11–37/isu);
  assert.match(detail.metric_en, /signed satisfied weights.*positive-weight maximum.*\[0,1\].*0\.7.*domain.*economic value/isu);
  assert.match(detail.drawio_review_note, /97b53e25372ea883d5b2b94b39bea73f706caab126eddefdff8188131b1bfbee/u);
  assert.match(detail.drawio_review_note, /5cf9d5005e2e1f20b4481ed50846161697e82a73/u);
  assert.match(detail.drawio_review_note, /435a8cf220f1222bf6c52fc3dc08fe15804f8470d53e76ebe3dc93462d69598e/u);
  assert.match(detail.drawio_review_note, /46b37bd9ab68961df18fa11dada4bef132357ff0abab1ca1348ab281862758c7/u);
  assert.match(detail.drawio_review_note, /Finance and law.*80 unique case_id.*three-stage construction/isu);
  assert.match(detail.drawio_review_note, /Chinese set is not a direct translation.*matched case_id pairs.*distinct questions/isu);
  assert.match(detail.drawio_review_note, /Section 3\.2 says 37 subdomains and 86.*Figure 3 and Appendix B say 92/isu);
  assert.match(detail.drawio_review_note, /fixed data contains four \+12.*extrema are -20 and \+12/isu);
  assert.match(detail.drawio_review_note, /README.*does not apply.*\[0,1\].*does not implement Pass Rate/isu);
  assert.match(detail.drawio_review_note, /README Quick Start.*language == "en".*global.*cn.*zero.*select\(range\(1\)\)/isu);
});
