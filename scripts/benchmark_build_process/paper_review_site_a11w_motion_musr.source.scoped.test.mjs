import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalog = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'));
const benchmarkIds = ['MotionBench', 'MuSR'];
const expectedCounts = new Map([
  ['MotionBench', { nodes: 30, edges: 35, secondary: 9 }],
  ['MuSR', { nodes: 30, edges: 39, secondary: 7 }],
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
  'eval_feature',
  'eval_feature_en',
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
    nodes: graph.nodes.map(
      ({ id, type, size, style, position }) => ({ id, type, size, style, position }),
    ),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function assertEdge(graph, from, to, type, label = '') {
  const edge = graph.edges.find(candidate => (
    candidate.from === from
    && candidate.to === to
    && candidate.type === type
    && String(candidate.label ?? '') === label
  ));
  assert.ok(edge, `missing edge ${from}|${to}|${type}|${label}`);
  return edge;
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
      edges.push({
        from: match[1],
        to: match[3],
        type: 'primary',
        label: unescapeMermaidText(match[2]),
      });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) --> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({ from: match[1], to: match[2], type: 'primary', label: '' });
      continue;
    }
    match = line.match(/^\s*([a-z][a-z0-9_]*) -\. (.*) \.-> ([a-z][a-z0-9_]*)$/iu);
    if (match) {
      edges.push({
        from: match[1],
        to: match[3],
        type: 'secondary',
        label: unescapeMermaidText(match[2]),
      });
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

test('keeps the A11w source diagrams bilingual, dashed, catalog-synchronized, and fallback-synchronized', () => {
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
      for (const edge of graph.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} dashed`);
      }
      for (const decision of graph.nodes.filter(node => node.type === 'decision')) {
        const outgoing = graph.edges.filter(edge => edge.from === decision.id);
        assert.ok(outgoing.length >= 2, `${id}.${decision.id} has decision branches`);
        for (const edge of outgoing) {
          assert.ok(String(edge.label ?? '').trim(), `${id}.${decision.id} labels ${edge.to}`);
        }
      }
    }
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
    assert.match(detail.drawio_review_note, /\[site-a11w-source-only\]/u, `${id} source-only marker`);
  }
});

test('locks MotionBench v2 construction, fixed-data split, licenses, and scorer boundaries', () => {
  const detail = readDetail('MotionBench');
  const en = readSpec('MotionBench', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2501.02955v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2501.02955v2');
  assert.equal(detail.pdf_cdn_url, '');
  assert.equal(
    detail.homepage,
    'https://github.com/zai-org/MotionBench/tree/dcc9b0713c9b92d1c5d4ec7ee0b6dd51f86325a3',
  );
  assert.equal(detail.openness, 'partly public');
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'evidence'), /2501\.02955v2.*dcc9b071.*f099db892.*a4033176/isu);
  assert.match(nodeLabel(en, 'pexels'), /Directly Adopt.*Do Not Apply Scene Segmentation/isu);
  assert.match(nodeLabel(en, 'segment'), /Panda-70M.*Movie Clips.*PySceneDetect.*Parameters Not Disclosed/isu);
  assert.match(nodeLabel(en, 'captions'), /2,355-video.*15 Adult.*Bachelor.*20 Working Days.*Second-reviewed/isu);
  assert.match(nodeLabel(en, 'caption_release'), /5,000 Videos.*5,000 Captions.*12\.63 Words per Second/isu);
  assert.match(nodeLabel(en, 'gpt4o'), /About Six Questions per Video.*Dynamic Information/isu);
  assert.match(nodeLabel(en, 'first_frame_gate'), /GPT-4o.*Qwen2-VL.*GLM-4V-plus/isu);
  assert.match(nodeLabel(en, 'discard'), /All Three Models Were Correct.*Do Not Regenerate/isu);
  assert.match(nodeLabel(en, 'manual_review'), /10 Annotators.*5 Days.*Unique Correct Answer.*Second-reviewed.*2,355 Videos.*4,922 QAs/isu);
  assert.match(nodeLabel(en, 'field_sources'), /MedVid.*SportsSloMo.*HA-ViD.*min\(H,W\) > 448.*\[3,60\].*start\/end.*not final guarantee.*< 3 s/isu);
  assert.match(nodeLabel(en, 'field_qa'), /431 Videos \/ 449 QAs.*805 \/ 851.*1,194 \/ 1,230.*2,430 Videos \/ 2,530 QAs/isu);
  assert.match(nodeLabel(en, 'synthetic_recipe'), /20 Motions.*6 Avatars.*5 Scenes.*15-viewpoint.*Remove Occlusions.*GT.*Auto Qs.*600 Videos.*600 QAs/isu);
  assert.match(nodeLabel(en, 'merge'), /f099db892.*5,385 Distinct Videos.*8,052 Multiple-choice QA Rows.*video_uid.*answer or NA.*No Video Overlap/isu);
  assert.match(nodeLabel(en, 'data_stats'), /MR 2,944.*MO 1,415.*LM 1,143.*AO 1,001.*CM 775.*RC 774/isu);
  assert.match(nodeLabel(en, 'data_stats'), /4×7,610.*3×363.*2×75.*1×4/isu);
  assert.match(nodeLabel(en, 'split_release'), /No Explicit split Field.*Answer Present.*4,018 QAs \/ 2,706 Videos.*Answer NA.*4,034 QAs \/ 2,679 Videos.*Labels Withheld/isu);
  assert.match(nodeLabel(en, 'split_drift'), /4,020 \+ 4,034.*8,054.*4,018 \+ 4,034/isu);
  assert.match(nodeLabel(en, 'paper_protocol'), /Only reply with the best option.*First Uppercase Letter by Regex/isu);
  assert.match(nodeLabel(en, 'protocol_boundary'), /No Inference Harness.*Not Implemented.*test_acc Does Not Call answer_util/isu);
  assert.match(nodeLabel(en, 'github_scorer'), /Mixed DEV \+ TEST.*Skip NA after Counting Total.*Right \/ 8,052.*Submitted UIDs/isu);
  assert.match(nodeLabel(en, 'space_scorer'), /Private Separate DEV \/ TEST.*answered_acc.*Missing UIDs/isu);
  assert.match(nodeLabel(en, 'scorer_boundary'), /No Full-UID Gate.*Partial Submission Can Inflate.*Report Coverage/isu);
  assert.match(nodeLabel(en, 'rights_boundary'), /Apache-2\.0.*CC-BY-NC-SA-4\.0.*Raw-video Copyright Not Owned/isu);
  assert.match(nodeLabel(en, 'availability'), /a4033176.*Build Error.*Do Not Claim Submission Is Operational/isu);
  assertEdge(en, 'captions', 'caption_release', 'secondary', 'Separate asset');
  assertEdge(en, 'first_frame_gate', 'discard', 'primary', 'Yes · all correct');
  assertEdge(en, 'first_frame_gate', 'manual_review', 'primary', 'No · at least one wrong');
  assertEdge(en, 'merge', 'split_release', 'primary');
  assertEdge(en, 'split_release', 'paper_protocol', 'primary');
  assertEdge(en, 'scorer_gate', 'paper_accuracy', 'primary', 'Paper');
  assertEdge(en, 'scorer_gate', 'github_scorer', 'primary', 'GitHub');
  assertEdge(en, 'scorer_gate', 'space_scorer', 'primary', 'HF Space');
  assert.match(detail.drawio_review_note, /32b28ba042eda251b2f5c97f24a7d0c4d39fb08ddd7c48abb9792b89a01c5112/u);
  assert.match(detail.drawio_review_note, /d901475378808ce66c84e5a4772200d360f68f9e4a9a1847dec875ab4265679e/u);
  assert.match(detail.drawio_review_note, /06f00fbad40d4143020ef0f53ec18a68df990cdd20d4b367bd9bf7a336aab1ab/u);
  assert.match(detail.drawio_review_note, /0f6cc2a3a329470d9d2e945480829b23937025a4aeb0f1fb9c63a0e91bbf6d3b/u);
  assert.match(detail.drawio_review_note, /Table 3.*4,020.*8,054.*4,018/isu);
});

test('locks MuSR v2 construction, domain-specific realization, parser, and public boundary', () => {
  const detail = readDetail('MuSR');
  const en = readSpec('MuSR', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2310.16049v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2310.16049v2');
  assert.equal(
    detail.homepage,
    'https://github.com/Zayne-sprague/MuSR/tree/b1f4d4168a9cfc6760e8b74d728e4516023dfaa5',
  );
  assert.equal(detail.openness, 'public');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'evidence'), /2310\.16049v2.*Sections 3–5.*Appendix G\.1\/H\.1\/I.*b1f4d416/isu);
  assert.match(nodeLabel(en, 'evidence'), /F and T Hidden at Test/isu);
  assert.match(nodeLabel(en, 'murder_template'), /Two Suspects.*Means \+ Motive \+ Opportunity.*Maximum Tree Depth · 4/isu);
  assert.match(nodeLabel(en, 'object_template'), /Three People.*Three Moves.*Two Items.*p = 0\.33.*Depth · 3/isu);
  assert.match(nodeLabel(en, 'team_template'), /Three People.*Two Tasks.*0 \/ 1 \/ 2.*at Least 2.*Depth · 2/isu);
  assert.match(nodeLabel(en, 'seed_facts'), /F Determines Every Gold Answer.*G.*Must Appear.*Tuple \(F, G\)/isu);
  assert.match(nodeLabel(en, 'tree_expand'), /GPT-4.*Children Jointly Entail.*Target Depth/isu);
  assert.match(nodeLabel(en, 'validator_gate'), /Murder \+ Object · Yes.*Team Allocation · No/isu);
  assert.match(nodeLabel(en, 'retry'), /Validator Feedback.*Up to Three Prompt Retries/isu);
  assert.match(nodeLabel(en, 'prune'), /Current Deduction Becomes a Leaf/isu);
  assert.match(nodeLabel(en, 'leaf_split'), /S\(T\).*Enter the Story.*C\(T\).*Stay Implicit/isu);
  assert.match(nodeLabel(en, 'team_story'), /One Pass.*No Chaptering · No Tree Validators.*Do Not Reveal/isu);
  assert.match(nodeLabel(en, 'release'), /564 Narratives.*756 Questions.*64 Narratives \/ 256 Questions/isu);
  assert.match(nodeLabel(en, 'quality'), /Seven Annotators.*34 Murder.*40 Object.*34 Team.*94\.1 \/ 95\.0 \/ 100\.0/isu);
  assert.match(nodeLabel(en, 'scope_boundary'), /Answer Derivability Only.*No Formal Fluency.*Coherence.*Commonsense.*Repo MIT.*JSON Has No License Field.*No Tags.*Checksums.*Formal Leaderboard/isu);
  assert.match(nodeLabel(en, 'eval_gate'), /Regular · CoT · CoT\+.*3-example Few-shot CoT\+.*Zero-shot CoT\+/isu);
  assert.match(nodeLabel(en, 'neurosymbolic'), /Decomposed Prompting.*SymbolicTOM.*PAL/isu);
  assert.match(nodeLabel(en, 'parse'), /Last Nonempty answer: Line.*Gold Digit Anywhere Wins.*First Choice Digit/isu);
  assert.match(nodeLabel(en, 'random_fallback'), /Randomly Sample One Choice.*Seeded Globally with 0/isu);
  assert.match(nodeLabel(en, 'code_drift'), /murder_mysteries\.json.*murder_mystery\.json.*Depth 3 vs Paper 4/isu);
  assertEdge(en, 'validator_gate', 'validate', 'primary', 'Murder / Object');
  assertEdge(en, 'validator_gate', 'leaf_split', 'primary', 'Team');
  assertEdge(en, 'validity_gate', 'retry', 'secondary', 'Invalid · retry available');
  assertEdge(en, 'retry', 'validate', 'secondary', 'Resample');
  assertEdge(en, 'validity_gate', 'prune', 'secondary', 'Three failed retries');
  assertEdge(en, 'story_gate', 'team_story', 'primary', 'Team');
  assertEdge(en, 'parse_gate', 'random_fallback', 'secondary', 'No choice digit');
  assert.match(detail.drawio_review_note, /ba92c00a0179abacd65cbae2de4254c41cf3dd82d82d26ec02e4ee8be054265f/u);
  assert.match(detail.drawio_review_note, /f76a0afc756d10a45f65bdf109d817add9087f57ed861a8ab536012024677aca/u);
  assert.match(detail.drawio_review_note, /2c8e2a28ca013557c73dff03ab3055b76f226dbeb8daa20dc36caeefe76f7946/u);
  assert.match(detail.drawio_review_note, /Section 5\.1 and Tables 2–4.*Team Allocation did not require chaptering or validators/isu);
});
