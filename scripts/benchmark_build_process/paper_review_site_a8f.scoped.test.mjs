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
  'ARC-AGI-1',
  'ARC_(AI2_Reasoning_Challenge)',
  'ART',
  'ASPERA',
];
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

test('keeps all four A8f packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within the reviewed native-text boxes', () => {
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

test('separates ARC-AGI-1 paper and ARC Prize dataset and attempt protocols', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ARC-AGI-1', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('author')?.label ?? '', /majority.*not programmatically|多数.*非程序/isu);
    assert.match(nodes.get('human_validation')?.label ?? '', /1.*3.*non-communicating|3.*互不沟通.*至少 1/isu);
    assert.match(nodes.get('paper_composition')?.label ?? '', /2019.*400.*400.*200/isu);
    assert.match(nodes.get('prize_composition')?.label ?? '', /2024.*400.*400.*100.*100/isu);
    assert.ok(edges.has('version_gate->paper_composition:primary'));
    assert.ok(edges.has('version_gate->prize_composition:primary'));
    assert.equal(edges.has('paper_composition->prize_composition:primary'), false);
    assert.match(nodes.get('paper_protocol')?.label ?? '', /3 trials.*binary|3 次.*二元/isu);
    assert.match(nodes.get('prize_protocol')?.label ?? '', /2 attempts|Pass@2|2 次/iu);
    assert.match(nodes.get('exact')?.label ?? '', /all test.*exact|全部测试.*精确/isu);
  }
});

test('keeps AI2 ARC filtering, corpus QA, splits, and fractional scoring explicit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ARC_(AI2_Reasoning_Challenge)', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('question_sources')?.label ?? '', /standardized science|标准化科学/iu);
    assert.doesNotMatch(nodes.get('question_sources')?.label ?? '', /public-domain|公版/iu);
    assert.equal(nodes.has('normalize'), false);
    assert.match(nodes.get('ir')?.label ?? '', /Waterloo.*5.*10|Waterloo.*5.*10/isu);
    assert.match(nodes.get('pmi')?.label ?? '', /uni.*bi.*tri.*skip|一元.*二元.*三元.*跳元/isu);
    assert.match(nodes.get('splits')?.label ?? '', /1,?119.*299.*1,?172.*2,?251.*570.*2,?376/isu);
    assert.match(nodes.get('corpus_qc')?.label ?? '', /805.*75.*99\.8.*95/isu);
    assert.match(nodes.get('score')?.label ?? '', /1\/k|1 分.*1\/k/iu);
    assert.ok(edges.has('challenge_gate->challenge:primary'));
    assert.ok(edges.has('challenge_gate->easy:primary'));
    assert.ok(edges.has('corpus->predict:optional'));
  }
});

test('keeps ART scenario mining and exact-match limits faithful to the paper', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ART', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('ehr')?.label ?? '', /50,?000 records.*695|50,?000 条记录.*695/isu);
    assert.doesNotMatch(nodes.get('ehr')?.label ?? '', /rows|行数据/iu);
    assert.match(nodes.get('retrieval')?.label ?? '', /(?:≤3|<=3).*2 h.*23.?25 h.*11 lab|≤3.*2 小时.*23.?25 小时.*11/isu);
    assert.match(nodes.get('conditional')?.label ?? '', /HGB.*HCT.*CR.*age.*sex|HGB.*HCT.*CR.*年龄.*性别/isu);
    assert.match(nodes.get('report')?.label ?? '', /GPT-4o-mini.*Claude 3\.5.*100.*100.*28.*64.*32.*38/isu);
    assert.match(nodes.get('limitation')?.label ?? '', /exact match.*reasoning path|精确匹配.*推理路径/isu);
    assert.ok(edges.has('score->limitation:secondary'));
  }
});

test('separates ASPERA query entry, CCK, primitive selection, and single-trial evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ASPERA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('library')?.label ?? '', /paper v1|论文 v1/iu);
    assert.match(nodes.get('human_query')?.label ?? '', /human-authored|人工编写/iu);
    assert.match(nodes.get('joint_query')?.label ?? '', /joint.*query.*AEP|联合生成.*查询.*AEP/isu);
    assert.match(nodes.get('bias_controls')?.label ?? '', /history.*focus.*filter|历史.*聚焦.*过滤/isu);
    assert.match(nodes.get('confirm')?.label ?? '', /two.*similar expertise|两位.*同类专业/isu);
    assert.doesNotMatch(nodes.get('confirm')?.label ?? '', /independent|独立/iu);
    assert.match(nodes.get('models')?.label ?? '', /proprietary.*open|闭源.*开源/isu);
    assert.doesNotMatch(nodes.get('models')?.label ?? '', /two agents|两个 Agent/iu);
    assert.match(nodes.get('cck')?.label ?? '', /full library.*5 AEP|完整库.*5 个 AEP/isu);
    assert.match(nodes.get('ps')?.label ?? '', /module.*import.*1 ICE|模块.*导入.*1 个 ICE/isu);
    assert.match(nodes.get('single_trial')?.label ?? '', /single trial|单次尝试/iu);
    assert.match(nodes.get('reference_runs')?.label ?? '', /conditional.*multiple SIP.*EP|条件查询.*多个 SIP.*EP/isu);
    assert.match(nodes.get('metric')?.label ?? '', /no execution error.*all.*assertions|无执行异常.*全部.*断言/isu);
    assert.ok(edges.has('query_mode->human_query:primary'));
    assert.ok(edges.has('query_mode->joint_query:primary'));
    assert.ok(edges.has('setting->cck:primary'));
    assert.ok(edges.has('setting->ps:primary'));
  }
});

test('pins the reviewed primary-source boundary in each A8f detail record', () => {
  const expected = {
    'ARC-AGI-1': [/1911\.01547v2/u, /§III\.1\.1.*§III\.1\.4.*Technical Report §1.*§1\.1/isu, /not.*mechanical split|非.*机械拆分/isu],
    'ARC_(AI2_Reasoning_Challenge)': [/1803\.05457v1/u, /Identifying Challenge.*ARC Corpus.*Baseline Performance.*Table 7/isu, /normalization.*not disclosed|规范化.*未披露/isu],
    ART: [/2601\.08988v1/u, /§§2.*3\.1.*3\.4.*Table 2.*§5/isu, /exact-match.*reasoning|精确匹配.*推理/isu],
    ASPERA: [/2507\.15501v1/u, /§§2\.1.*2\.4.*§§3.*5.*Tables 1.*3.*4/isu, /CCK.*primitive selection.*single trial/isu],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A8f', () => {
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

test('strictly rebuilds and normalizes all eight A8f specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8f-'));
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
