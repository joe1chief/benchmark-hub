import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['AbstentionBench', 'ActivityNet-QA', 'AdvBench', 'AdvancedIF'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(root, 'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeMap = arch => new Map(arch.edges.map(edge => [
  `${edge.from}->${edge.to}:${edge.type}`,
  edge,
]));

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A8g packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('preserves the disclosed AbstentionBench search, selection, normalization, and judge audit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AbstentionBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('candidate_search')?.label ?? '', /183.*82/isu);
    assert.match(nodes.get('selection')?.label ?? '', /public|公开/iu);
    assert.match(nodes.get('selection')?.label ?? '', /licen|许可/iu);
    assert.match(nodes.get('abstain_variants')?.label ?? '', /copy|复制/iu);
    assert.match(nodes.get('abstain_variants')?.label ?? '', /answerable|可回答/iu);
    assert.match(nodes.get('normalize')?.label ?? '', /3,?500/iu);
    assert.match(nodes.get('normalize')?.label ?? '', /fixed.*uniform|固定.*均匀/isu);
    assert.match(nodes.get('scenarios')?.label ?? '', /6|六/iu);
    assert.match(nodes.get('release')?.label ?? '', /16.*3.*1.*20/isu);
    assert.match(nodes.get('release')?.label ?? '', /35,?000.*unanswerable|3\.5 万.*不可回答/isu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /300.*0\.88/isu);
    assert.ok(edges.has('candidate_search->selection:primary'));
    assert.ok(edges.has('selection->general_datasets:primary'));
    assert.ok(edges.has('normalize->scenarios:primary'));
  }
});

test('keeps ActivityNet-QA coverage, translation QA, and metric scopes distinct', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ActivityNet-QA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('types')?.label ?? '', /motion.*spatial.*temporal|动作.*空间.*时间/isu);
    assert.match(nodes.get('types')?.label ?? '', /remaining.*unrestricted|其余.*自由/isu);
    assert.doesNotMatch(nodes.get('types')?.label ?? '', /7 free|7 道/iu);
    assert.match(nodes.get('quality')?.label ?? '', /double-check|双重检查/iu);
    assert.match(nodes.get('translation_gate')?.label ?? '', /CIDEr.*threshold|CIDEr.*阈值/isu);
    assert.match(nodes.get('baidu_translation')?.label ?? '', /Baidu|百度/iu);
    assert.match(nodes.get('manual_translation')?.label ?? '', /human|人工/iu);
    assert.match(nodes.get('release')?.label ?? '', /32,?000.*18,?000.*8,?000/isu);
    assert.match(nodes.get('release')?.label ?? '', /3,?200.*1,?800.*800/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /exact|精确/iu);
    assert.match(nodes.get('wups')?.label ?? '', /overall|总体/iu);
    assert.ok(edges.has('exact->aggregate:primary'));
    assert.ok(edges.has('wups->report:primary'));
    assert.equal(edges.has('wups->aggregate:primary'), false);
  }
});

test('keeps AdvBench generation branches and GCG protocol-specific evidence separate', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AdvBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('string_prompt')?.label ?? '', /5-shot|5.*示例/iu);
    assert.match(nodes.get('behavior_prompt')?.label ?? '', /5-shot|5.*示例/iu);
    assert.ok(edges.has('seed_strings->string_prompt:primary'));
    assert.ok(edges.has('seed_behaviors->behavior_prompt:primary'));
    assert.match(nodes.get('release')?.label ?? '', /paper.*500.*500|论文.*500.*500/isu);
    assert.match(nodes.get('individual')?.label ?? '', /100.*1.*1/isu);
    assert.match(nodes.get('universal')?.label ?? '', /25.*100/isu);
    assert.match(nodes.get('transfer')?.label ?? '', /25.*388/isu);
    assert.match(nodes.get('gcg')?.label ?? '', /20.*500.*256.*512/isu);
    assert.match(nodes.get('gcg')?.label ?? '', /gradient|梯度/iu);
    assert.match(nodes.get('behavior_score')?.label ?? '', /human|人工/iu);
    assert.match(nodes.get('string_score')?.label ?? '', /cross-entropy|交叉熵/iu);
    assert.doesNotMatch(nodes.get('behavior_score')?.label ?? '', /cross-entropy|交叉熵/iu);
  }
});

test('places AdvancedIF model response before adversarial retention and limits review claims to rubrics', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AdvancedIF', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('final_response')?.label ?? '', /provided LLM|指定.*模型/iu);
    assert.ok(edges.has('complex->final_response:primary'));
    assert.ok(edges.has('carried_dialogue->final_response:primary'));
    assert.ok(edges.has('system_dialogue->final_response:primary'));
    assert.ok(edges.has('final_response->failure_gate:primary'));
    assert.match(nodes.get('rubrics')?.label ?? '', /up to 20|最多 20/iu);
    assert.match(nodes.get('rubrics')?.label ?? '', /final-turn|最终轮/iu);
    assert.match(nodes.get('human_review')?.label ?? '', /rubric|量规/iu);
    assert.doesNotMatch(nodes.get('human_review')?.label ?? '', /prompts and rubrics|提示.*量规/iu);
    assert.match(nodes.get('ordering_note')?.label ?? '', /not disclosed|未披露/iu);
    assert.match(nodes.get('verifier')?.label ?? '', /conversation.*prompt.*response.*rubric|上下文.*提示.*回答.*量规/isu);
    assert.match(nodes.get('score')?.label ?? '', /CIF.*CC.*SS.*average|CIF.*CC.*SS.*平均/isu);
  }
});

test('pins the A8g source boundaries and version conflicts in detail records', () => {
  const expected = {
    AbstentionBench: [/2506\.09038/u, /183.*82.*16.*3.*1.*20/isu],
    'ActivityNet-QA': [/1906\.02467/u, /CIDEr.*Baidu|CIDEr.*百度/isu],
    AdvBench: [/2307\.15043/u, /500.*500.*574.*520/isu],
    AdvancedIF: [/2511\.10507/u, /provided LLM|指定.*模型|ordering.*not disclosed/iu],
  };
  for (const [id, [paper, note]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    assert.match(detail.drawio_review_note, note, `${id} locator`);
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A8g', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('strictly rebuilds and normalizes all eight A8g specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8g-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli,
          `${base}.spec.yaml`,
          generated,
          '--validate',
          '--strict',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
