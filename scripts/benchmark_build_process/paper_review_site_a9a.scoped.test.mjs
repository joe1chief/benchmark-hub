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
const benchmarkIds = [
  'AgentHarm',
  'Agent_Red_Teaming_Benchmark',
  'Aider_Polyglot',
  'AlignBench',
];
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

test('keeps all four A9a packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual A9a labels inside reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 54], ['zh', 32]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
        }
      }
    }
  }
});

test('separates AgentHarm harm scoring from refusal judging and states the actual public subset', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AgentHarm', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('package')?.label ?? '', /44.*264.*132/su);
    assert.match(nodes.get('release_scope')?.label ?? '', /44\s*\/\s*66.*176/isu);
    assert.match(nodes.get('release_scope')?.label ?? '', /8\s*\/\s*11.*32/isu);
    assert.match(nodes.get('release_scope')?.label ?? '', /current.*release|当前.*公开/iu);
    assert.match(nodes.get('harm_score')?.label ?? '', /partial credit|部分分/iu);
    assert.match(nodes.get('refusal')?.label ?? '', /all.*messages|所有.*消息/iu);
    assert.ok(edges.has('trajectories->harm_score:primary'));
    assert.ok(edges.has('trajectories->refusal:data'));
    assert.ok(edges.has('harm_score->score:primary'));
    assert.ok(edges.has('refusal->score:data'));
    assert.ok(edges.has('package->release_scope:data'));
    assert.equal(edges.has('harm_score->refusal:primary'), false);
    assert.equal(edges.has('harm_score->refusal:data'), false);
  }
});

test('keeps ART over-62k challenge evidence separate from its planned access model', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Agent_Red_Teaming_Benchmark', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('successful_pool')?.label ?? '', /(?:over|超过)\s*62,?000/iu);
    assert.match(nodes.get('benchmark')?.label ?? '', /4,?700.*44/isu);
    assert.match(nodes.get('release_status')?.label ?? '', /plan.*public.*test cases|计划.*公开.*测试/isu);
    assert.match(nodes.get('release_status')?.label ?? '', /private.*(?:dynamic)?.*leaderboard|私有.*动态.*排行榜/isu);
    assert.match(nodes.get('release_status')?.label ?? '', /not.*verified|尚未.*验证|未证实/iu);
    assert.ok(edges.has('report->release_status:primary'));
  }
});

test('models Aider Polyglot hidden tests and the default two-try repair protocol', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Aider_Polyglot', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.doesNotMatch(nodes.get('input')?.label ?? '', /unit tests|单元测试/iu);
    assert.match(nodes.get('hidden_tests')?.label ?? '', /withheld|hidden|不进入.*上下文|隐藏/iu);
    assert.match(nodes.get('hidden_tests')?.label ?? '', /copied.*after.*edit|编辑后.*复制/isu);
    assert.match(nodes.get('repair')?.label ?? '', /--tries\s*2|two tries|两次尝试/iu);
    assert.match(nodes.get('repair')?.label ?? '', /initial.*one repair|首次.*一次.*修复/isu);
    assert.match(nodes.get('report')?.label ?? '', /Pass@1.*Pass@2/isu);
    assert.ok(edges.has('edit->hidden_tests:primary'));
    assert.ok(edges.has('hidden_tests->retry_gate:primary'));
    assert.ok(edges.has('retry_gate->repair:data'));
    assert.ok(edges.has('repair->edit:data'));
    assert.ok(edges.has('retry_gate->report:primary'));
  }
});

test('makes the exact AlignBench judge, score parser, and overall aggregation auditable', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AlignBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('model')?.label ?? '', /target.*T\s*=\s*0\.7|目标.*T\s*=\s*0\.7/isu);
    assert.match(nodes.get('judge')?.label ?? '', /gpt-4-0613/iu);
    assert.match(nodes.get('judge')?.label ?? '', /T\s*=\s*0\.1/iu);
    assert.match(nodes.get('score_dict')?.label ?? '', /last.*dictionary|末尾.*字典/iu);
    assert.match(nodes.get('score_dict')?.label ?? '', /Overall Score|综合得分/iu);
    assert.match(nodes.get('aggregate')?.label ?? '', /Reasoning.*mean.*Math.*Logic|推理.*数学.*逻辑/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /Language.*mean.*6|语言.*6/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /Overall.*Reasoning.*Language.*2|总分.*推理.*语言.*2/isu);
    assert.ok(edges.has('judge->score_dict:primary'));
    assert.ok(edges.has('score_dict->aggregate:primary'));
    assert.ok(edges.has('aggregate->score:primary'));
  }
});

test('pins the reviewed A9a primary-source and release boundaries in detail records', () => {
  const expected = {
    AgentHarm: [
      /2410\.09024v3/u,
      /§3\.1\.3|Section 3\.1\.3/iu,
      /e23b3fe60a0da9037314b88e5ee3a0c054970dad/u,
      /44\s*(?:out of|\/)\s*66.*176/isu,
    ],
    Agent_Red_Teaming_Benchmark: [
      /2507\.20526v1/u,
      /62,?000/u,
      /public.*test cases.*private.*dynamic.*leaderboard/isu,
    ],
    Aider_Polyglot: [
      /^$/u,
      /7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f/u,
      /5dc9490bb35f9729ef2c95d00a19ccd30c26339c/u,
      /hidden|withheld|不进入.*上下文/iu,
      /--tries\s*2/u,
    ],
    AlignBench: [
      /2311\.18743v4/u,
      /gpt-4-0613/iu,
      /T\s*=\s*0\.1.*T\s*=\s*0\.7/isu,
      /score dictionary|评分字典/iu,
      /Reasoning.*Language.*2|推理.*语言.*2/isu,
    ],
  };
  for (const [id, [paper, ...notes]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const pattern of notes) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A9a', () => {
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

test('strictly rebuilds and normalizes all eight A9a specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9a-'));
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
