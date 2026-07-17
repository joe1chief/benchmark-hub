import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'RepoQA',
  'Spider_2.0',
  'SysBench',
  'TAU-Bench',
  'Toolathlon',
  'WorldTravel',
  'BrowseComp-ZH',
  'CFBench',
  'CruxEval',
  'Inverse_IFEval',
  'LongBench_v2',
  'MathBench',
  'MedCalc-Bench',
  'MulDimIF',
  'Multi-IF',
];

function readSpec(id, language) {
  return readFileSync(
    join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
    'utf8',
  );
}

function readDetail(id) {
  return JSON.parse(readFileSync(
    join(publicDir, 'benchmarks_detail', `${id}.json`),
    'utf8',
  ));
}

function extractTopology(spec) {
  const nodeSection = spec.match(/^nodes:\n([\s\S]*?)^edges:\n/mu)?.[1] ?? '';
  const edgeSection = spec.match(/^edges:\n([\s\S]*?)^modules:/mu)?.[1] ?? '';
  const nodes = [...nodeSection.matchAll(/^  - id: ([^\n]+)$/gmu)]
    .map(match => match[1]);
  const edges = [...edgeSection.matchAll(
    /^  - from: ([^\n]+)\n    to: ([^\n]+)\n    type: ([^\n]+)/gmu,
  )].map(([, from, to, type]) => `${from}->${to}:${type}`);
  return { nodes, edges };
}

function nodeBlock(spec, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - id: ${escapedId}\\n(?:    [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

function edgeBlock(spec, from, to) {
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedTo = to.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?:    [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

test('keeps all 15 reviewed diagrams bilingual and topologically identical', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      extractTopology(readSpec(id, 'en')),
      extractTopology(readSpec(id, 'zh')),
      `${id} must keep identical EN/ZH node ids and typed edges`,
    );
  }
});

test('models RepoQA GitHub discovery as an optional input to manual selection', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('RepoQA', language);
    assert.match(
      edgeBlock(spec, 'repo_search', 'repo_gate'),
      /^    type: optional$/mu,
    );
    assert.match(
      edgeBlock(spec, 'repo_gate', 'pinned_repos'),
      /^    type: primary$/mu,
    );
  }
});

test('places the LongBench v2 70-item audit after the 503-item release', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('LongBench_v2', language);
    assert.match(edgeBlock(spec, 'human_review', 'final'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'final', 'final_verify'), /^    type: secondary$/mu);
    assert.equal(edgeBlock(spec, 'human_review', 'final_verify'), '');
    assert.equal(edgeBlock(spec, 'final_verify', 'final'), '');
  }
});

test('describes LongBench v2 as a 24-reviewer pool followed by one expert review', () => {
  assert.match(
    nodeBlock(readSpec('LongBench_v2', 'en'), 'human_review'),
    /^    label: 24-reviewer pool · expert review$/mu,
  );
  assert.match(
    nodeBlock(readSpec('LongBench_v2', 'zh'), 'human_review'),
    /^    label: 24名复核员池·专家复核$/mu,
  );
});

test('models WorldTravel review and checks as processes without invented branches', () => {
  const processNodes = [
    'three_round_review',
    'pilot_filter',
    'hard_checks',
    'soft_checks',
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('WorldTravel', language);
    for (const id of processNodes) {
      assert.match(nodeBlock(spec, id), /^    type: process$/mu, `${language} ${id}`);
    }
  }
});

test('routes only MathBench CE-0/1/2 to manual review and leaves CE-3/4 unknown', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('MathBench', language);
    assert.match(nodeBlock(spec, 'gpt4_screen'), /^    type: decision$/mu);
    assert.match(nodeBlock(spec, 'ce_unknown'), /^    type: document$/mu);
    assert.match(edgeBlock(spec, 'gpt4_screen', 'manual_review'), /CE-0\/1\/2/u);
    assert.match(edgeBlock(spec, 'gpt4_screen', 'ce_unknown'), /CE-3\/4/u);
    assert.equal(edgeBlock(spec, 'ce_unknown', 'release_t'), '');
    assert.equal(edgeBlock(spec, 'ce_unknown', 'release_a'), '');
  }
});

test('splits MedCalc-Bench coverage into the paper-backed 34/11/10 branches', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('MedCalc-Bench', language);
    assert.match(nodeBlock(spec, 'coverage_gate'), /^    type: decision$/mu);
    assert.match(edgeBlock(spec, 'medical_review', 'coverage_gate'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'coverage_gate', 'eligible_notes'), /34/u);
    assert.match(edgeBlock(spec, 'coverage_gate', 'template_notes'), /11/u);
    assert.match(edgeBlock(spec, 'coverage_gate', 'handwritten_notes'), /10/u);
    assert.match(edgeBlock(spec, 'coverage_gate', 'eval_count_conflict'), /^    type: data$/mu);
    assert.equal(edgeBlock(spec, 'medical_review', 'eligible_notes'), '');
    assert.equal(edgeBlock(spec, 'medical_review', 'template_notes'), '');
    assert.equal(edgeBlock(spec, 'medical_review', 'handwritten_notes'), '');
  }
});

test('labels every MulDimIF decision branch explicitly', () => {
  const expected = [
    ['dual_check', 'discard_candidate', /fail|失败/iu],
    ['dual_check', 'level_gate', /pass|通过/iu],
    ['level_gate', 'select_category', /< IV|未达 IV/iu],
    ['level_gate', 'select_pattern', /\bIV\b|达到 IV/iu],
    ['select_pattern', 'example_rewrite', /Example|示例/iu],
    ['select_pattern', 'listing_rewrite', /Listing|列表/iu],
    ['select_pattern', 'incorporation_rewrite', /Incorporation|融入/iu],
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('MulDimIF', language);
    for (const [from, to, label] of expected) {
      assert.match(edgeBlock(spec, from, to), label, `${language} ${from}->${to}`);
    }
  }
});

test('states that Multi-IF samples one instruction type independently per follow-up turn', () => {
  assert.match(nodeBlock(readSpec('Multi-IF', 'en'), 'sampled_types'), /independent.*turn/iu);
  assert.match(nodeBlock(readSpec('Multi-IF', 'zh'), 'sampled_types'), /各自独立|各独立/u);
});

test('pins BrowseComp-ZH paper, code, and encrypted release provenance', () => {
  const detail = readDetail('BrowseComp-ZH');
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.19314v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.19314v1');
  assert.match(detail.drawio_review_note, /86abe635e7deef89ec00c68ff1c2588f0e2f2099/u);
  assert.match(detail.drawio_review_note, /49963cdc8b4a16f4656bbac89ed5f3495f7b3bec4cf310990f567e7893c6a531/u);
  assert.match(detail.drawio_review_note, /Sections? 3\.1.?3\.2/iu);
});

test('publishes re-rendered diagrams as fixed-light SVGs without visible fallback text', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');

      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /math="0"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.doesNotMatch(
        drawio,
        /<mxCell\b[^>]*\bvalue="[^"]+"[^>]*\bedge="1"/u,
        `${id}.${language}.drawio must render each edge label only through its label cell`,
      );
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /<foreignObject\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
    }
  }
});
