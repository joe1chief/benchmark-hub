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
const benchmarkIds = ['ALERT', 'AMEGA-LLM', 'AMO-Bench', 'ARC-AGI'];
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

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A8e packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('uses one ALERT evaluator variant across all four disclosed criteria', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ALERT', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('criteria')?.label ?? '', /Reasoning.*Clear.*Concise.*Engaging.*Narrative.*Neutral.*Tone|推理一致性.*清晰简洁.*叙事吸引力.*中性语气/isu);
    assert.match(nodes.get('route')?.label ?? '', /one variant.*all 4|同一评估器.*4/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /sensitive demographics|敏感人口统计/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /user IDs.*not released|不发布.*用户 ID/iu);
    assert.ok(edges.has('pair->divide:primary'));
    assert.ok(edges.has('divide->route:primary'));
  }
});

test('defines AMEGA split retry as malformed Boolean-vector recovery', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AMEGA-LLM', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('prompt')?.label ?? '', /temperature 0|温度 0/iu);
    assert.match(nodes.get('evaluator')?.label ?? '', /11.*attempt|11.*尝试/isu);
    assert.match(nodes.get('failure_gate')?.label ?? '', /malformed|格式失败/iu);
    assert.match(nodes.get('failure_gate')?.label ?? '', /Boolean.*criterion|Boolean.*准则/isu);
    assert.match(nodes.get('split_criteria')?.label ?? '', /11.*attempt|11.*次/isu);
    assert.match(edges.get('reask->candidate:optional')?.label ?? '', /re-evaluate|重新评估/iu);
  }
});

test('keeps AMO-Bench grader validation outside the main score path and exposes AMO-Bench-P separately', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AMO-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('difficulty')?.label ?? '', /2.*3\/3|两.*3\/3/isu);
    assert.match(nodes.get('report')?.label ?? '', /Pass@k/iu);
    assert.doesNotMatch(nodes.get('report')?.label ?? '', /AMO-Bench-P/iu);
    assert.match(nodes.get('amo_p')?.label ?? '', /39/iu);
    assert.ok(edges.has('correctness->validate:secondary'));
    assert.equal(edges.has('correctness->validate:primary'), false);
    assert.ok(edges.has('report->amo_p:optional'));
  }
});

test('separates ARC-AGI task validation, source-specific dataset views, and exact task success', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ARC-AGI', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('format')?.label ?? '', /one or more test inputs|至少 1 个测试输入/iu);
    assert.match(nodes.get('human_validation')?.label ?? '', /2.*independent.*non-expert|2.*独立非专家/isu);
    assert.match(nodes.get('competition')?.label ?? '', /technical report|技术报告/iu);
    assert.match(nodes.get('official_composition')?.label ?? '', /1,?000.*120.*120.*120/isu);
    assert.match(nodes.get('task_success')?.label ?? '', /two candidate|两个候选/iu);
    assert.match(nodes.get('task_success')?.label ?? '', /all test.*exact|全部测试.*精确/isu);
    assert.ok(edges.has('version->human_validation:primary'));
    assert.ok(edges.has('human_validation->competition:primary'));
    assert.ok(edges.has('human_validation->official_composition:data'));
    assert.ok(edges.has('competition->task_success:primary'));
    assert.ok(edges.has('official_composition->task_success:data'));
    assert.ok(edges.has('results->method_gate:secondary'));
  }
});

test('pins the A8e paper and official-source boundaries in detail records', () => {
  const expected = {
    ALERT: [/2025\.naacl-long\.137/u, /one.*variant|同一.*评估器|four criteria/iu],
    'AMEGA-LLM': [/s41746-024-01356-6/u, /Boolean.*criterion|Boolean.*准则|malformed/iu],
    'AMO-Bench': [/2510\.26768/u, /§2\.1.*§2\.3|Sections? 2\.1.*2\.3/isu],
    'ARC-AGI': [/2601\.10904/u, /human.*validation|人工.*验证|1,?000/iu],
  };
  for (const [id, [paper, note]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    assert.match(detail.drawio_review_note, note, `${id} locator`);
  }
});

test('keeps every A8e fallback synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const fallback = detail[`flowchart_${language}`];
      for (const node of readArch(id, language).nodes) {
        assert.match(fallback, new RegExp(`^    ${escapeRegex(node.id)}\\[`, 'mu'));
      }
      for (const edge of readArch(id, language).edges) {
        assert.match(
          fallback,
          new RegExp(`^    ${escapeRegex(edge.from)} ${escapeRegex(mermaidArrow(edge))} ${escapeRegex(edge.to)}$`, 'mu'),
          `${id}.${language}.${edge.from}->${edge.to}`,
        );
      }
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A8e', () => {
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

test('strictly rebuilds and normalizes all eight A8e specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8e-'));
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
          '--write-sidecars',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
          `${id}.${language}.arch`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
