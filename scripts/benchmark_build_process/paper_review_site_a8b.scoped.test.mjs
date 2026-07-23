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
  '2WikiMultihopQA',
  'AA-LCR',
  'AA-Omniscience',
  'ACPBench_Hard',
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

test('keeps all four A8b packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within the reviewed native-text boxes', () => {
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

test('preserves 2Wiki construction caveats and the official three-task joint evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('2WikiMultihopQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('source')?.label ?? '', /2020.*2019.*5,?950,?475.*23,?763/isu);
    assert.match(nodes.get('templates')?.label ?? '', /17,?456.*spaCy.*top-50|17,?456.*spaCy.*前 50/isu);
    assert.match(nodes.get('two_hop_gate')?.label ?? '', /bridge.*answer.*omit|桥接.*答案.*不得/isu);
    assert.match(nodes.get('postprocess')?.label ?? '', /8\s*\/\s*100.*mismatch|8\s*\/\s*100.*错配/isu);
    assert.match(nodes.get('split_model')?.label ?? '', /86\.7%/u);
    assert.match(nodes.get('splits')?.label ?? '', /train-medium|训练中等/iu);
    assert.match(nodes.get('three_tasks')?.label ?? '', /answer.*supporting.*evidence|答案.*支持事实.*证据/isu);
    assert.match(nodes.get('joint_metrics')?.label ?? '', /Joint EM.*Joint F1|联合 EM.*联合 F1/isu);
    assert.ok(edges.has('splits->evaluation:primary'));
    assert.ok(edges.has('evaluation->three_tasks:primary'));
    assert.ok(edges.has('three_tasks->joint_metrics:primary'));
  }
});

test('keeps AA-LCR prompt ordering, human validation, and binary equality scoring exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('AA-LCR', language));
    assert.match(nodes.get('difficulty')?.label ?? '', /GPT-4o-mini.*Llama 3\.1 70B.*Gemini 1\.5 Flash/isu);
    assert.match(nodes.get('difficulty')?.label ?? '', /fail|答错/iu);
    assert.match(nodes.get('validate')?.label ?? '', /40[–-]60%.*agreement|40[–-]60%.*一致/isu);
    assert.match(nodes.get('validate')?.label ?? '', /(?:at least|≥)\s*1|至少 1/iu);
    assert.match(nodes.get('release')?.label ?? '', /data_source_filenames.*ZIP/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /BEGIN DOCUMENT.*BEGIN INPUT DOCUMENTS.*cl100k_base/isu);
    assert.match(nodes.get('judge')?.label ?? '', /Qwen3.*235B-A22B-2507.*consistent|Qwen3.*235B-A22B-2507.*一致/isu);
    assert.match(nodes.get('report')?.label ?? '', /CORRECT.*100|正确.*100/isu);
  }
});

test('orders AA-Omniscience topic coverage before source discovery and keeps exact reliability metrics', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AA-Omniscience', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.ok(edges.has('coverage->sources:primary'));
    assert.ok(edges.has('sources->generate:primary'));
    assert.equal(edges.has('sources->coverage:primary'), false);
    assert.match(nodes.get('manual_validation')?.label ?? '', /not disclosed|未披露/iu);
    assert.match(nodes.get('prompt')?.label ?? '', /topic.*category.*JUST|主题.*类别.*仅/isu);
    assert.match(nodes.get('grade')?.label ?? '', /09-2025.*reasoning|09-2025.*推理/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /100.*\(c.*i\).*N/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /Accuracy.*c.*N|准确率.*c.*N/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /i.*\(p.*i.*a\)/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /grader.*excluded|不含.*裁判/iu);
    assert.ok(edges.has('full_release->public_sampling:secondary'));
    assert.equal([...arch.edges].some(edge => edge.from === 'public_release' && edge.to === 'prompt'), false);
  }
});

test('models ACPBench Hard task-scoped generation and cache-first symbolic validation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ACPBench_Hard', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('pddl')?.label ?? '', /generator.*ALFWorld|生成器.*ALFWorld/isu);
    assert.match(nodes.get('planner')?.label ?? '', /top-quality.*diverse.*backup|最高质量.*多样化.*后备/isu);
    assert.doesNotMatch(nodes.get('sample')?.label ?? '', /skip uncertain|跳过.*不确定/iu);
    assert.match(nodes.get('symbolic')?.label ?? '', /App.*Prog.*Reach.*AReach.*Val.*Just.*Land.*NextA/isu);
    assert.match(nodes.get('symbolic')?.label ?? '', /skip uncertain|存疑.*跳过/iu);
    assert.match(nodes.get('parse')?.label ?? '', /lenient|宽松/iu);
    assert.match(nodes.get('parse')?.label ?? '', /discard.*token|丢弃.*token/iu);
    assert.match(nodes.get('deterministic')?.label ?? '', /App.*Prog.*Val.*Just/isu);
    assert.match(nodes.get('known_fast')?.label ?? '', /Reach.*AReach.*Land.*NextA/isu);
    assert.match(nodes.get('unresolved')?.label ?? '', /unresolved|未决/iu);
    assert.match(nodes.get('jaccard')?.label ?? '', /Applicability.*only|仅.*适用性/iu);
    assert.ok(edges.has('route->deterministic:primary'));
    assert.ok(edges.has('route->known_fast:primary'));
    assert.ok(edges.has('known_fast->unresolved:primary'));
    assert.ok(edges.has('unresolved->solve:primary'));
    assert.ok(edges.has('unresolved->report:primary'));
    assert.equal(edges.has('route->solve:primary'), false);
  }
});

test('pins the reviewed primary-source boundary in each A8b detail record', () => {
  const expected = {
    '2WikiMultihopQA': [/2011\.01060/u, /Sections? 2\.1.*3\.1.*3\.2.*5\.4|§2\.1.*§3\.1.*§3\.2.*§5\.4/isu, /8\s*\/\s*100/u],
    'AA-LCR': [/^$/u, /official.*dataset card|官方.*数据卡/iu, /bdae010/u, /cl100k_base/u],
    'AA-Omniscience': [/2511\.13029/u, /Sections? 2\.1.*2\.4|§2\.1.*§2\.4/isu, /Appendix B|附录 B/iu],
    'ACPBench_Hard': [/2503\.24378/u, /Sections? 5.*7|§5.*§7/isu, /Appendices? A\.3.*A\.8|附录 A\.3.*A\.8/isu],
  };
  for (const [id, [paper, ...notes]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const pattern of notes) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A8b', () => {
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

test('strictly rebuilds and normalizes all eight A8b specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8b-'));
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
