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
  'CL-bench',
  'CMB',
  'CMExam',
  'CMMLU',
  'CMMMU',
  'CNMO_2024',
  'CPQExam',
  'CRUXEval-I',
  'CRUXEval-O',
  'CSR-Bench',
  'CVBench',
  'CVE-Bench',
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all twelve A7 packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within the reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 38], ['zh', 20]]) {
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

test('keeps CL-bench quality control on the primary construction spine', () => {
  for (const language of ['en', 'zh']) {
    const edges = edgeMap(readArch('CL-bench', language));
    assert.ok(edges.has('qc->release:primary'));
    assert.equal(edges.has('qc->release:data'), false);
  }
});

test('keeps CMB-Exam and CMB-Clin parallel and limits explanations to development questions', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CMB', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('exam_pool')?.label ?? '', /280,?839/u);
    assert.match(nodes.get('explanations')?.label ?? '', /development.*only|仅.*开发/iu);
    assert.match(nodes.get('clin_source')?.label ?? '', /108/u);
    assert.match(nodes.get('clin_set')?.label ?? '', /74.*208/su);
    assert.ok(edges.has('taxonomy->exam_source:primary'));
    assert.ok(edges.has('taxonomy->clin_source:primary'));
    assert.equal([...arch.edges].some(edge => edge.from === 'exam_pool' && edge.to === 'clin_source'), false);
  }
});

test('limits CMExam explanations and five-facet metadata to their disclosed scopes', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('CMExam', language));
    assert.match(nodes.get('solutions')?.label ?? '', /85\.24%|85\.24\s*percent/iu);
    assert.match(nodes.get('gpt_annotation')?.label ?? '', /test.*only|仅.*测试/iu);
    assert.match(nodes.get('five_facets')?.label ?? '', /ICD-11|ICD－11/u);
  }
});

test('treats CMMLU formulas as item-local and development examples as optional few-shot data', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CMMLU', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('formula')?.label ?? '', /when present|如有|出现时/iu);
    assert.match(nodes.get('prompt')?.label ?? '', /optional.*5|可选.*5/iu);
    assert.ok(edges.has('dev->prompt:data'));
    assert.equal(edges.has('dev->prompt:primary'), false);
  }
});

test('keeps CMMMU collection and quality control sequential before the simultaneous four-model filter', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CMMMU', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    for (const edge of [
      'annotators->item_filter:primary',
      'item_filter->balance:primary',
      'balance->author_qc:primary',
      'author_qc->difficulty_filter:primary',
      'difficulty_filter->contamination:primary',
      'contamination->benchmark:primary',
    ]) assert.ok(edges.has(edge), `${language}: ${edge}`);
    assert.equal(edges.has('item_filter->author_qc:primary'), false);
    assert.match(nodes.get('contamination')?.label ?? '', /simultaneous|同时/iu);
    assert.doesNotMatch(JSON.stringify(arch), /15 role|15 个角色/iu);
  }
});

test('keeps CNMO 2024 within the disclosed evaluation boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('CNMO_2024', language));
    assert.match(nodes.get('official_set')?.label ?? '', /official|官方/iu);
    assert.match(nodes.get('correctness')?.label ?? '', /not disclosed|未披露/iu);
    assert.doesNotMatch(nodes.get('correctness')?.label ?? '', /harness|评测框架/iu);
    assert.match(nodes.get('deepseek_setting')?.label ?? '', /0\.7.*8,?192|0\.7.*8192/su);
  }
});

test('separates CPQExam private-paper status from the later 7,600-row release and QuarkMed-only augmentation note', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CPQExam', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('boundary')?.label ?? '', /private.*paper|论文.*私有/iu);
    assert.match(nodes.get('release')?.label ?? '', /later.*7,?600|后续.*7,?600/iu);
    assert.doesNotMatch(nodes.get('inference')?.label ?? '', /knowledge augmentation|知识增强/iu);
    assert.match(nodes.get('quarkmed_note')?.label ?? '', /QuarkMed.*only|仅.*QuarkMed|Table 7|表 7/iu);
    assert.ok(edges.has('quarkmed_note->score:data'));
  }
});

test('uses restricted execution rather than claiming a sandbox for CRUXEval-I and CRUXEval-O', () => {
  for (const id of ['CRUXEval-I', 'CRUXEval-O']) {
    for (const language of ['en', 'zh']) {
      const nodes = nodeMap(readArch(id, language));
      assert.match(nodes.get('check')?.label ?? '', /restricted execution|受限执行/iu);
      assert.doesNotMatch(nodes.get('check')?.label ?? '', /sandbox|沙箱/iu);
      assert.match(nodes.get('task')?.label ?? '', id === 'CRUXEval-I' ? /input|输入/iu : /output|输出/iu);
    }
  }
});

test('labels CSR-Bench success and failure exits explicitly', () => {
  for (const language of ['en', 'zh']) {
    const edges = edgeMap(readArch('CSR-Bench', language));
    assert.match(edges.get('state->result:primary')?.label ?? '', /success|成功/iu);
    assert.match(edges.get('state->analyzer:optional')?.label ?? '', /failure|失败/iu);
  }
});

test('models CVBench consensus, difficulty, hallucination checks, and corrective loops', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CVBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('model_gate')?.label ?? '', /consensus.*difficulty|一致性.*难度/iu);
    assert.match(nodes.get('human_gate')?.label ?? '', /15.*criteria|15.*标准/iu);
    assert.match(nodes.get('independent_audit')?.label ?? '', /5.*200.*hallucination|5.*200.*幻觉/isu);
    assert.ok(edges.has('human_gate->repair:optional'));
    assert.ok(edges.has('repair->human_gate:optional'));
    assert.ok(edges.has('independent_audit->repair:optional'));
    assert.ok(edges.has('independent_audit->benchmark:primary'));
  }
});

test('preserves the CVE-Bench 60-candidate to 40-reproduced construction funnel', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CVE-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('screened')?.label ?? '', /60/u);
    assert.match(nodes.get('reproduced')?.label ?? '', /40/u);
    for (const edge of [
      'nvd->screened:primary',
      'screened->reproduced:primary',
      'reproduced->containers:primary',
      'containers->grader:primary',
      'grader->benchmark:primary',
      'benchmark->spec:primary',
    ]) assert.ok(edges.has(edge), `${language}: ${edge}`);
  }
});

test('pins the reviewed source boundary in each A7 detail record', () => {
  const expected = {
    'CL-bench': [/2602\.03587/u, /three-stage|three stage/iu],
    CMB: [/2308\.08833/u, /280,?839.*108.*74.*208/isu],
    CMExam: [/2306\.03030/u, /85\.24%.*test/isu],
    CMMLU: [/2306\.09212/u, /Sections 3.*4/isu],
    CMMMU: [/2401\.11944/u, /three-stage|three stage/iu],
    CNMO_2024: [/2412\.19437/u, /Section 5\.3\.1.*Table 6/isu],
    CPQExam: [/2508\.11894/u, /7,?600.*private/isu],
    'CRUXEval-I': [/2401\.03065/u, /69.*102,?000.*489,?306.*800/isu],
    'CRUXEval-O': [/2401\.03065/u, /69.*102,?000.*489,?306.*800/isu],
    'CSR-Bench': [/2502\.06111/u, /1,?500.*100/isu],
    CVBench: [/2508\.19542/u, /1,?500.*1,?315.*1,?000/isu],
    'CVE-Bench': [/2503\.17332/u, /60.*40/isu],
  };
  for (const [id, [paper, note]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    assert.match(detail.drawio_review_note, note, `${id} locator`);
  }
});

test('keeps every A7 fallback synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A7', () => {
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

test('strictly rebuilds and normalizes all 24 A7 specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a7-'));
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
