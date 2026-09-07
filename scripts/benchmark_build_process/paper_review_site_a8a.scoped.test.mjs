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
  'AetherCode',
  'AfriMed-QA',
  'Agent-SafetyBench',
  'AgentDAM',
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

test('keeps all four A8a packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within the reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 48], ['zh', 40]]) {
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

test('preserves AetherCode curation, test construction, and four-sample evaluation', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('AetherCode', language));
    assert.match(nodes.get('statements')?.label ?? '', /PDF.*Markdown.*LaTeX/isu);
    assert.match(nodes.get('solutions')?.label ?? '', /30,?000.*5.*20/isu);
    assert.match(nodes.get('automatic')?.label ?? '', /official|官方/iu);
    assert.match(nodes.get('experts')?.label ?? '', /67/u);
    assert.match(nodes.get('dataset')?.label ?? '', /456.*159.*145.*132.*20/isu);
    assert.match(nodes.get('evaluate')?.label ?? '', /four samples|采样四次/iu);
    const report = nodes.get('report')?.label ?? '';
    assert.match(report, /TPR.*TNR/isu);
    assert.match(report, /100%/u);
    assert.match(report, /Pass@1.*Pass@2.*Pass@4/isu);
  }
});

test('keeps AfriMed-QA authorization within the disclosed role and threshold boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('AfriMed-QA', language));
    assert.match(nodes.get('quality_gate')?.label ?? '', /80%/u);
    assert.doesNotMatch(nodes.get('not_authorized')?.label ?? '', /requalify|重新认证/iu);
    assert.match(nodes.get('authorized')?.label ?? '', /role-gated|角色分级/iu);
    assert.match(nodes.get('authorized')?.label ?? '', /300/u);
    assert.match(nodes.get('dataset')?.label ?? '', /15,?275.*4,?269.*11,?006.*5,?444/isu);
    assert.match(nodes.get('models')?.label ?? '', /30.*17.*13/isu);
    assert.match(nodes.get('random_questions')?.label ?? '', /3,?000/iu);
    assert.match(nodes.get('human')?.label ?? '', /379.*37,?435/isu);
  }
});

test('feeds Agent-SafetyBench scorer training from all 4,000 postchecked labels', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Agent-SafetyBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('interaction_qc')?.label ?? '', /4,?000/iu);
    assert.match(nodes.get('cross_validation')?.label ?? '', /200.*98%.*200.*97\.5%/isu);
    assert.match(nodes.get('scorer_train')?.label ?? '', /GPT-4o.*explanation|GPT-4o.*解释/isu);
    assert.ok(edges.has('interaction_qc->scorer_train:data'));
    assert.equal(edges.has('cross_validation->scorer_train:data'), false);
    assert.match(nodes.get('trained_scorer')?.label ?? '', /91\.5%/u);
    assert.match(nodes.get('benchmark')?.label ?? '', /349.*2,?000/isu);
    assert.match(nodes.get('agent_eval')?.label ?? '', /16/u);
  }
});

test('keeps AgentDAM data generation and judge validation on separate evidence paths', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AgentDAM', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('web_apps')?.label ?? '', /Reddit.*Shopping.*GitLab/isu);
    assert.match(nodes.get('human_seeds')?.label ?? '', /123/u);
    assert.match(nodes.get('synthesize')?.label ?? '', /Llama-3\.3-70B/u);
    assert.match(nodes.get('elbow_select')?.label ?? '', /2|二/u);
    assert.match(nodes.get('dataset')?.label ?? '', /246/u);
    assert.match(nodes.get('privacy')?.label ?? '', /GPT-4o.*(?:every action|每个操作)/isu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /four humans|四人/iu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /98%/u);
    assert.ok(edges.has('privacy->metrics:primary'));
    assert.ok(edges.has('privacy->judge_validation:data'));
    assert.equal([...arch.edges].some(edge => edge.from === 'judge_validation' && edge.to === 'metrics'), false);
  }
});

test('pins the reviewed primary-source boundary in each A8a detail record', () => {
  const expected = {
    AetherCode: {
      paper: /2508\.16402/u,
      note: [/Sections? 2\.1.*2\.4.*Section 3|§§2\.1.*2\.4.*§3/isu],
    },
    'AfriMed-QA': {
      paper: /2411\.15640/u,
      note: [/15,?275/u, /3,?000/u, /379/u, /37,?435/u],
    },
    'Agent-SafetyBench': {
      paper: /2412\.14470/u,
      note: [/4,?000/u, /200/u, /98%/u, /97\.5%/u, /91\.5%/u],
    },
    AgentDAM: {
      paper: /2503\.09780/u,
      note: [/123/u, /246/u, /Llama-3\.3-70B/u, /GPT-4o/u, /98%/u],
    },
  };
  for (const [id, { paper, note }] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const pattern of note) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('keeps every A8a fallback synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A8a', () => {
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

test('strictly rebuilds and normalizes all eight A8a specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8a-'));
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
