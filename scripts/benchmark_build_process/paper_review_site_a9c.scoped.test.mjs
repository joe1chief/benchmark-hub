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
  'Arena-Hard-Auto_v2.0',
  'Arena-Hard_v2',
  'AutoCodeBench',
  'AutoCodeBench-V2',
];
const arenaIds = benchmarkIds.slice(0, 2);
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);

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

test('keeps all four A9c packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual native-text labels within reviewed boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 46], ['zh', 28]]) {
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

test('keeps Arena v2 hard and creative judge-and-aggregate lanes separate', () => {
  for (const id of arenaIds) {
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const nodes = nodeMap(arch);
      const edges = edgeMap(arch);
      assert.match(nodes.get('evidence_boundary')?.label ?? '', /paper.*backbone.*repo.*v2|论文.*骨架.*仓库.*v2/isu);
      assert.match(nodes.get('hard_prompts')?.label ?? '', /500.*fresh.*challenging|500.*全新.*高难/isu);
      assert.match(nodes.get('creative_prompts')?.label ?? '', /250.*creative|250.*创意/isu);
      assert.match(nodes.get('hard_judge')?.label ?? '', /Gemini.?2\.5.*official.*GPT.?4\.1.*alternative.*o3-mini|Gemini.?2\.5.*官方.*GPT.?4\.1.*备选.*o3-mini/isu);
      assert.match(nodes.get('creative_judge')?.label ?? '', /GPT.?4\.1.*Gemini.?2\.5.*independent.*Gemini.?2\.0.*baseline|GPT.?4\.1.*Gemini.?2\.5.*独立.*Gemini.?2\.0.*基线/isu);
      assert.match(nodes.get('hard_aggregate')?.label ?? '', /style.*markdown.*length.*Bradley.Terry.*bootstrap|风格.*Markdown.*长度.*Bradley.Terry.*自助/isu);
      assert.match(nodes.get('creative_aggregate')?.label ?? '', /ensemble.*no style control.*bootstrap|集成.*不做风格控制.*自助/isu);
      assert.ok(edges.has('evidence_boundary->hard_prompts:primary'));
      assert.ok(edges.has('evidence_boundary->creative_prompts:primary'));
      assert.ok(edges.has('style_metadata->hard_aggregate:data'));
      assert.ok(edges.has('hard_judgments->hard_aggregate:primary'));
      assert.ok(edges.has('creative_judgments->creative_aggregate:primary'));
      assert.equal(edges.has('style_metadata->creative_aggregate:data'), false);
      assert.equal(edges.has('creative_judgments->hard_aggregate:primary'), false);
      const v2EvaluationLabels = arch.nodes
        .filter(node => node.id !== 'evidence_boundary')
        .map(node => node.label)
        .join('\n');
      assert.doesNotMatch(v2EvaluationLabels, /gpt-4-0314|gpt-4-1106-preview|5-point Likert|1000 judgments/iu);
    }
  }
});

test('keeps AutoCodeBench demo tests, hidden tests, audit, and scoring distinct', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AutoCodeBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('demo_tests')?.label ?? '', /demo.*(?:≤3|up to 3).*embedded.*example|演示.*(?:≤3|不超过 3).*嵌入.*示例/isu);
    assert.match(nodes.get('full_tests')?.label ?? '', /full hidden.*7\+.*edge.*comprehensive|完整隐藏.*7\+.*边界.*综合/isu);
    assert.equal(nodes.get('test_gate')?.type, 'process');
    assert.match(nodes.get('test_gate')?.label ?? '', /both.*public.*private|两类.*公开.*私有/isu);
    assert.ok(edges.has('test_gate->demo_tests:primary'));
    assert.ok(edges.has('test_gate->full_tests:primary'));
    assert.match(nodes.get('integrate')?.label ?? '', /demo_test_func.*full_test_func.*re.?run|demo_test_func.*full_test_func.*重跑/isu);
    assert.match(nodes.get('audit')?.label ?? '', /post-hoc.*6 professional.*6 languages.*87\.6|后验.*6 位专业.*6 种语言.*87\.6/isu);
    assert.match(nodes.get('sandbox_eval')?.label ?? '', /full_test_func.*demo_test_func.*both.*PASSED.*Pass@1|full_test_func.*demo_test_func.*两者.*PASSED.*Pass@1/isu);
    assert.equal(edges.has('demo_tests->sandbox_eval:primary'), false);
  }
});

test('makes the AutoCodeBench-V2 1000-to-998 watermark revision explicit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AutoCodeBench-V2', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('paper_original')?.label ?? '', /paper v1.*3,?920.*no V2|论文 v1.*3,?920.*不含 V2/isu);
    assert.match(nodes.get('initial_snapshot')?.label ?? '', /Dec.*4.*1,?000.*136.*218.*646.*982/isu);
    assert.match(nodes.get('fixed_snapshot')?.label ?? '', /Feb.*17.*998.*136.*217.*645.*998/isu);
    assert.ok(edges.has('initial_snapshot->fixed_snapshot:primary'));
    assert.match(nodes.get('sandbox')?.label ?? '', /sandbox:v2.*full_test_func.*32|sandbox:v2.*full_test_func.*32/isu);
    assert.match(nodes.get('watermark')?.label ?? '', /_zfa817ta56vz43s3ji9k.*stdout.*test function.*executed|_zfa817ta56vz43s3ji9k.*stdout.*测试函数.*执行/isu);
    assert.ok(edges.has('sandbox->watermark:primary'));
  }
});

test('pins paper and official-repository evidence boundaries in A9c details', () => {
  for (const id of arenaIds) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, /2406\.11939/u);
    assert.match(detail.drawio_review_note, /2406\.11939v2.*§4.*§5.*§6/isu);
    assert.match(detail.drawio_review_note, /README.*arena-hard-v2\.0\.yaml.*judge_utils\.py.*show_result\.py/isu);
    assert.match(detail.drawio_review_note, /v0\.1.*not.*v2|v0\.1.*不.*v2/isu);
  }

  const original = readDetail('AutoCodeBench');
  assert.match(original.paper_url, /2508\.09101/u);
  assert.match(original.drawio_review_note, /2508\.09101v1.*§§2\.2\.1.*2\.2\.4.*§4\.1.*Table 8/isu);
  assert.match(original.drawio_review_note, /demo_test_func.*full_test_func.*87\.6/isu);

  const v2 = readDetail('AutoCodeBench-V2');
  assert.match(v2.paper_url, /2508\.09101/u);
  assert.match(v2.drawio_review_note, /paper.*predates V2.*README.*December 4.*February 17/isu);
  assert.match(v2.drawio_review_note, /1,?000.*982.*998.*watermark/isu);
});

test('publishes native fixed-light SVG and readable PNG pairs for A9c', () => {
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

test('strictly rebuilds and normalizes all eight A9c specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9c-'));
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
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
