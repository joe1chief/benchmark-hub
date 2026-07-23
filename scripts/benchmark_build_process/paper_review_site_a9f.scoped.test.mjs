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
const benchmarkIds = ['NYU_CTF_Bench', 'OJBench', 'SciCode', 'TACO'];
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

test('keeps all four A9f packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 48], ['zh', 30]]) {
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

test('models NYU CTF validation and evaluation as source-faithful alternatives', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('NYU_CTF_Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('source')?.label ?? '', /568.*2011.?2023/isu);
    assert.match(nodes.get('manual_gate')?.label ?? '', /identify.*missing|识别.*缺失/isu);
    assert.doesNotMatch(nodes.get('manual_gate')?.label ?? '', /recover|restore|恢复/iu);
    assert.ok(edges.has('validation_route->server_gate:primary'));
    assert.ok(edges.has('validation_route->file_gate:primary'));
    assert.equal(edges.has('server_gate->file_gate:primary'), false);
    assert.match(nodes.get('release')?.label ?? '', /200.*2017.?2023.*6 categor|200.*2017.?2023.*6 类/isu);
    assert.ok(edges.has('load_route->server_load:primary'));
    assert.ok(edges.has('load_route->file_load:primary'));
    assert.match(nodes.get('tools')?.label ?? '', /up to 6.*category|至多 6.*类别/isu);
    assert.match(nodes.get('protocol')?.label ?? '', /5 independent.*48 h per LLM|5 次独立.*每个 LLM.*48 小时/isu);
    assert.match(nodes.get('exact_judge')?.label ?? '', /per-run.*check_flag.*equality|每次运行.*check_flag.*相等/isu);
    assert.match(nodes.get('success')?.label ?? '', /any-of-5.*≥1 run.*exact hidden flag|五次运行聚合.*至少 1 次.*精确隐藏 Flag/isu);
    assert.ok(edges.has('server_load->protocol:primary'));
    assert.ok(edges.has('file_load->protocol:primary'));
    assert.ok(edges.has('protocol->prompt:primary'));
    assert.ok(edges.has('prompt->tools:primary'));
    assert.ok(edges.has('tools->exact_judge:primary'));
    assert.ok(edges.has('exact_judge->success:primary'));
    assert.equal(edges.has('tools->protocol:primary'), false);
  }
});

test('preserves OJBench source filters, difficulty rules, parser, and full judge', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('OJBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('sources')?.label ?? '', /159.*Luogu.*73.*ICPC|159.*洛谷.*73.*ICPC/isu);
    assert.match(nodes.get('judge_gate')?.label ?? '', /remove all.*special judge|移除全部.*特殊判题/isu);
    assert.match(nodes.get('translation')?.label ?? '', /GPT-4o.*manual|GPT-4o.*人工/isu);
    assert.ok(edges.has('judge_gate->difficulty_route:primary'));
    assert.ok(edges.has('difficulty_route->translation:primary'));
    assert.ok(edges.has('translation->noi_difficulty:primary'));
    assert.ok(edges.has('difficulty_route->icpc_difficulty:primary'));
    assert.equal(edges.has('translation->difficulty_route:primary'), false);
    assert.equal(edges.has('translation->icpc_difficulty:primary'), false);
    assert.match(
      edges.get('difficulty_route->icpc_difficulty:primary')?.label ?? '',
      /bypass translation|绕过翻译/iu,
    );
    assert.match(nodes.get('noi_difficulty')?.label ?? '', /2.?3.*4.?5.*6.?7/isu);
    assert.match(
      nodes.get('icpc_difficulty')?.label ?? '',
      /passed.*submission.*attempted.*team.*0\.4.*0\.1|通过.*提交.*尝试.*队伍.*0\.4.*0\.1/isu,
    );
    assert.match(nodes.get('sample')?.label ?? '', /8 candidates.*64k|8 个候选.*64k/isu);
    assert.match(nodes.get('extract')?.label ?? '', /fenced.*target language.*main\(\)|围栏.*目标语言.*main\(\)/isu);
    assert.match(nodes.get('execute')?.label ?? '', /all organizer tests.*10 s.*1 GiB|全部主办方测试.*10 秒.*1 GiB/isu);
    assert.doesNotMatch(nodes.get('execute')?.label ?? '', /preserve competition time|保留竞赛时间/iu);
    assert.match(nodes.get('report')?.label ?? '', /Pass@1.*Pass@8.*Python.*C\+\+|Pass@1.*Pass@8.*Python.*C\+\+/isu);
    if (language === 'zh') {
      assert.equal(edges.get('difficulty_route->translation:primary')?.label, 'NOI 赛题');
    }
  }
});

test('keeps SciCode provenance, three QC rounds, and sequential standard setting exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('SciCode', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('workflows')?.label ?? '', /mainly internal.*many.*publications.*not all|主要为内部.*许多.*论文.*并非全部/isu);
    assert.match(nodes.get('coverage')?.label ?? '', /5 domains.*16 subfields|5 个领域.*16 个子领域/isu);
    assert.match(nodes.get('release')?.label ?? '', /80.*338.*15.*50.*65.*288/isu);
    assert.ok(edges.has('in_domain_qc->cross_domain_qc:primary'));
    assert.ok(edges.has('cross_domain_qc->gpt4_qc:primary'));
    assert.match(nodes.get('in_domain_qc')?.label ?? '', /at least 2|至少 2/iu);
    assert.match(nodes.get('cross_domain_qc')?.label ?? '', /one.*different domain|1 名.*跨领域/isu);
    assert.match(nodes.get('gpt4_qc')?.label ?? '', /GPT-4.*scientists.*rework|GPT-4.*科学家.*返工/isu);
    assert.match(nodes.get('standard')?.label ?? '', /no background.*generated previous|无背景.*生成的前序/isu);
    assert.match(nodes.get('generate')?.label ?? '', /sequential|顺序/iu);
    assert.match(nodes.get('correctness')?.label ?? '', /all subproblems.*integrated|全部子问题.*集成/isu);
    assert.match(nodes.get('report')?.label ?? '', /Pass@1.*main.*subproblem|Pass@1.*主问题.*子问题/isu);
  }
});

test('separates TACO collection, cleaning, test-only augmentation, and evaluator variants', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('TACO', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('sources')?.label ?? '', /CodeChef.*CodeForces.*HackerRank.*GeeksforGeeks.*APPS.*CodeContest.*Description2code/isu);
    assert.match(nodes.get('parsers')?.label ?? '', /SVG.*OCR.*manual|SVG.*OCR.*人工/isu);
    assert.match(nodes.get('solution_gate')?.label ?? '', /new crawls only|仅新爬取/iu);
    assert.match(nodes.get('py2_conversion')?.label ?? '', /Description2code only|仅 Description2code/iu);
    assert.match(nodes.get('imports')?.label ?? '', /APPS.*CodeContest.*bypass.*validation.*bypass.*2to3|APPS.*CodeContest.*绕过.*验证.*绕过.*2to3/isu);
    assert.match(nodes.get('dedupe')?.label ?? '', /2,?045,?502.*global.*0\.85.*1,?539,?152|2,?045,?502.*全局.*0\.85.*1,?539,?152/isu);
    assert.match(nodes.get('tests')?.label ?? '', /test split only.*GPT-4.*30.*at least 200|仅测试集.*GPT-4.*30.*至少 200/isu);
    assert.match(nodes.get('release')?.label ?? '', /25,?443.*1,?000.*abstract.*25,?433|25,?443.*1,?000.*摘要.*25,?433/isu);
    assert.match(nodes.get('labels')?.label ?? '', /968.*36.*8/isu);
    assert.ok(edges.has('evaluator_route->code_models:primary'));
    assert.ok(edges.has('evaluator_route->gpt4:primary'));
    assert.match(nodes.get('code_models')?.label ?? '', /200 seeds.*0\.95.*0\.2.*0\.6.*0\.8/isu);
    assert.match(nodes.get('gpt4')?.label ?? '', /one sample.*0\.7.*Python.*Pass@1|单样本.*0\.7.*Python.*Pass@1/isu);
    assert.match(nodes.get('postprocess')?.label ?? '', /EOF truncation only|仅 EOF 截断/iu);
    assert.doesNotMatch(nodes.get('postprocess')?.label ?? '', /complete program|完整程序/iu);
    assert.match(nodes.get('metric')?.label ?? '', /unbiased Pass@k|无偏 Pass@k/iu);
    assert.ok(edges.has('sources->source_route:primary'));
    assert.ok(edges.has('source_route->parsers:primary'));
    assert.ok(edges.has('parsers->solution_gate:primary'));
    assert.ok(edges.has('solution_gate->dedupe:primary'));
    assert.ok(edges.has('source_route->py2_conversion:primary'));
    assert.ok(edges.has('py2_conversion->dedupe:primary'));
    assert.ok(edges.has('source_route->imports:primary'));
    assert.ok(edges.has('imports->dedupe:primary'));
    assert.equal(edges.has('solution_gate->py2_conversion:primary'), false);
    assert.equal(edges.has('imports->parsers:primary'), false);
    assert.equal(edges.has('imports->solution_gate:primary'), false);
    assert.equal(edges.has('imports->py2_conversion:primary'), false);
    assert.ok(edges.has('dedupe->labels:primary'));
    assert.ok(edges.has('labels->split_route:primary'));
    assert.ok(edges.has('split_route->train_split:primary'));
    assert.ok(edges.has('split_route->tests:primary'));
    assert.ok(edges.has('tests->test_release:primary'));
    assert.ok(edges.has('train_split->release:primary'));
    assert.ok(edges.has('test_release->release:primary'));
    assert.ok(edges.has('release->prompt:primary'));
    assert.equal(edges.has('dedupe->tests:primary'), false);
    assert.equal(edges.has('labels->release:primary'), false);
    assert.equal(edges.has('release->split_route:primary'), false);
    assert.equal(edges.has('release->tests:primary'), false);
    assert.equal(edges.has('test_release->prompt:primary'), false);
    if (language === 'zh') {
      assert.equal(edges.get('evaluator_route->gpt4:primary')?.label, 'GPT-4 评测');
    }
  }
});

test('pins the A9f paper and official-source boundaries in detail records', () => {
  const expected = {
    NYU_CTF_Bench: [/2406\.05590v3/u, /§§2.*3.*4.*Table 2/isu, /identify.*missing.*not.*restore|识别.*缺失.*不.*恢复/isu],
    OJBench: [/2506\.16395v2/u, /§§2\.1.*2\.4.*3\.1/isu, /10 s.*1 GiB|10 秒.*1 GiB/isu],
    SciCode: [/2407\.13168v1/u, /§§2\.1.*2\.4.*3/isu, /mainly internal.*not all|主要为内部.*并非全部/isu],
    TACO: [/2312\.14852v2/u, /§§3\.1.*3\.2.*4.*5\.1/isu, /25,433.*25,443|25,443.*25,433/isu],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('keeps every A9f detail fallback synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const fallback = detail[`flowchart_${language}`];
      for (const node of arch.nodes) {
        assert.ok(fallback.includes(node.label.split('\n')[0]), `${id}.${language}.${node.id}`);
      }
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A9f', () => {
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

test('strictly rebuilds and normalizes all eight A9f specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9f-'));
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
