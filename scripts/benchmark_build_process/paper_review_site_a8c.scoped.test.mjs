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
const benchmarkIds = ['ADR-Bench', 'AGIEval', 'AIGCBench', 'AIME'];
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A8c packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within the reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 44], ['zh', 26]]) {
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

test('separates ADR-Bench pairwise WTL evidence from its undisclosed Elo computation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ADR-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('usage_study')?.label ?? '', /expert.*initial|专家.*初始/iu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /9|九/u);
    assert.match(nodes.get('general_eval')?.label ?? '', /trained.*written|培训.*书面/isu);
    assert.match(nodes.get('pairwise_wtl')?.label ?? '', /70.*(?:W.*T.*L|胜.*平.*负)/isu);
    assert.doesNotMatch(nodes.get('pairwise_wtl')?.label ?? '', /Elo/iu);
    assert.match(nodes.get('elo_view')?.label ?? '', /not disclosed|未披露/iu);
    assert.match(nodes.get('professional_eval')?.label ?? '', /judge.*formula.*not disclosed|裁判.*公式.*未披露/isu);
    assert.ok(edges.has('general_eval->pairwise_wtl:primary'));
    assert.ok(edges.has('general_eval->elo_view:data'));
  }
});

test('pins AGIEval paper-v1 and repository-v1.1 as distinct evidence snapshots', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AGIEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('direct_sources')?.label ?? '', /public online|公开网络/iu);
    assert.doesNotMatch(nodes.get('direct_sources')?.label ?? '', /officially released|官方发布/iu);
    assert.equal(nodes.has('normalize'), false);
    assert.match(nodes.get('paper_snapshot')?.label ?? '', /8,?062.*(?:paper v1|论文 v1)/isu);
    assert.match(nodes.get('repo_v11')?.label ?? '', /18.*2.*7,?066/isu);
    assert.ok(edges.has('paper_snapshot->repo_v11:data'));
    assert.match(nodes.get('cot_rationales')?.label ?? '', /AQuA.*MATH.*Gaokao.*SAT.*ChatGPT/isu);
    assert.match(nodes.get('humans')?.label ?? '', /source papers.*scaled|原论文.*缩放/isu);
    const cloze = nodes.get('cloze')?.label ?? '';
    assert.match(cloze, /EM.*F1/isu);
    assert.match(cloze, /equivalence|等价/iu);
    assert.match(cloze, /not found|未发现/iu);
  }
});

test('keeps AIGCBench metric applicability and source divergence explicit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIGCBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('text_corpus')?.label ?? '', /CivitAI/iu);
    assert.match(nodes.get('generate')?.label ?? '', /T2I-CompBench.*2,?003/isu);
    assert.doesNotMatch(JSON.stringify(arch), /preserve semantics|保留语义/iu);
    assert.match(nodes.get('i2v')?.label ?? '', /Pika.*60.*30.*30/isu);
    assert.match(nodes.get('frame_policy')?.label ?? '', /first 16.*DOVER.*all|前 16.*DOVER.*全部/isu);
    assert.match(nodes.get('video_metrics')?.label ?? '', /paper.*4.*code.*5|论文.*4.*代码.*5/isu);
    assert.match(nodes.get('automatic')?.label ?? '', /11.*Flow.*DOVER.*absent|11.*Flow.*DOVER.*缺失/isu);
    assert.ok(edges.has('metric_route->image_metrics:primary'));
    assert.ok(edges.has('metric_route->video_metrics:primary'));
    assert.doesNotMatch(nodes.get('human_vote')?.label ?? '', /independent|独立/iu);
    assert.match(nodes.get('alignment')?.label ?? '', /qualitative.*no correlation|定性.*未报告相关/isu);
  }
});

test('keeps the AIME legacy id inside the MathArena paper boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIME', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('identity')?.label ?? '', /legacy.*AIME.*MathArena.*not AIME-only|旧.*AIME.*MathArena.*非.*AIME/isu);
    assert.match(nodes.get('generation')?.label ?? '', /4 responses.*provider|4.*响应.*提供方/isu);
    assert.doesNotMatch(nodes.get('generation')?.label ?? '', /usually|通常/iu);
    assert.match(nodes.get('answer_parse')?.label ?? '', /SymPy.*Gemini-2\.5-Flash/isu);
    assert.match(nodes.get('answer_qc')?.label ?? '', /GUI.*manual|GUI.*人工/isu);
    assert.match(nodes.get('project_euler')?.label ?? '', /Python.*C\+\+.*20/isu);
    assert.ok(edges.has('project_euler->answer_parse:primary'));
    assert.equal(edges.has('project_euler->score:primary'), false);
    assert.match(nodes.get('proofs')?.label ?? '', /USAMO.*4/isu);
    assert.match(nodes.get('imo_human')?.label ?? '', /4-run.*not disclosed|4.*轮.*未披露/isu);
    assert.match(nodes.get('score')?.label ?? '', /permutation.*Bernoulli|置换.*伯努利/isu);
    assert.doesNotMatch(nodes.get('score')?.label ?? '', /answers.*tools.*proofs|答案.*工具.*证明/iu);
  }
});

test('pins the reviewed primary-source boundary in each A8c detail record', () => {
  const expected = {
    'ADR-Bench': [/2512\.20491v4/u, /Sections 6\.1-6\.4.*7\.1-7\.2/isu, /Elo.*not disclosed/isu],
    AGIEval: [/2304\.06364v2/u, /paper v1.*8,?062.*v1\.1.*7,?066/isu, /F1.*not found/isu],
    AIGCBench: [/2401\.01651v3/u, /paper.*four.*code.*five/isu, /Pika.*60/isu],
    AIME: [/2505\.23281v3/u, /legacy.*AIME.*MathArena/isu, /Project Euler.*answer.*parser/isu],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('keeps every A8c detail fallback synchronized with the reviewed architecture', () => {
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
          new RegExp(`^    ${escapeRegex(edge.from)} (?:-->|-\\.->) ${escapeRegex(edge.to)}$`, 'mu'),
          `${id}.${language}.${edge.from}->${edge.to}`,
        );
      }
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A8c', () => {
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

test('strictly rebuilds and normalizes all eight A8c specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8c-'));
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
