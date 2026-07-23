import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const benchmarkIds = ['FrontierCode', 'FrontierMath', 'FrontierScience', 'FullStackBench'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const svgNormalizer = join(root, 'scripts/benchmark_build_process/normalize_drawio_svg.mjs');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';
const imageCompare = [
  process.env.IMAGEMAGICK_COMPARE,
  '/opt/homebrew/bin/compare',
  '/usr/local/bin/compare',
].find(path => path && existsSync(path));
const imageMagick = [
  process.env.IMAGEMAGICK_MAGICK,
  '/opt/homebrew/bin/magick',
  '/usr/local/bin/magick',
].find(path => path && existsSync(path));
const nativeTextWidthLimit = 196;

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

function svgVisibleText(svg) {
  return svg
    .replace(/<[^>]*>/gu, '\n')
    .replace(/&#x([0-9a-f]+);/giu, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/gu, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10r packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 32]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
          if (language === 'en' && imageMagick) {
            const renderedWidth = Number(execFileSync(imageMagick, [
              '-font', 'Arial',
              '-pointsize', '11',
              `label:${line}`,
              '-format', '%w',
              'info:',
            ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
            assert.ok(
              renderedWidth <= nativeTextWidthLimit,
              `${id}.${language}.${node.id}: ${renderedWidth}px > ${nativeTextWidthLimit}px: ${line}`,
            );
          }
        }
      }
    }
  }
});

test('pins FrontierCode construction, 1.1 changes, aggregation, and private-source boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('FrontierCode', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2026-06-08.*2026-07-07|2026-06-08.*07-07/isu);
    assert.match(nodes.get('evidence')?.label ?? '', /no paper.*repo.*task.*grader|无论文.*公开仓库.*题目.*评分器/isu);
    assert.match(nodes.get('maintainers')?.label ?? '', /20\+.*36.*40|20\+.*36.*40/isu);
    assert.match(nodes.get('task_selection')?.label ?? '', /multi-PR.*free-form|多 PR.*自由需求/isu);
    assert.match(nodes.get('rubric_design')?.label ?? '', /behavior.*regression.*build.*style.*tests.*scope.*quality|行为.*回归.*构建.*风格.*测试.*范围.*质量/isu);
    assert.match(nodes.get('verifier_ensemble')?.label ?? '', /classical.*command.*reverse-classical.*scope.*mutagent.*LLM|经典.*命令.*反向经典.*范围.*mutagent.*LLM/isu);
    assert.match(nodes.get('quality_control')?.label ?? '', /wrong.*alternate.*Devin.*four.*0.*100|错误.*替代.*Devin.*4.*0.*100/isu);
    assert.match(nodes.get('private_release')?.label ?? '', /Extended.*150.*Main.*100.*Diamond.*deprecated|Extended.*150.*Main.*100.*Diamond.*弃用/isu);
    assert.match(nodes.get('private_release')?.label ?? '', /base commits.*grader code.*withheld|基准提交.*评分器代码.*未公开/isu);
    assert.match(nodes.get('version_11')?.label ?? '', /1,?000\+.*75.*fair.*internet.*verifier|1,?000\+.*75.*公平联网.*验证器/isu);
    assert.match(nodes.get('agent_runs')?.label ?? '', /5.*effort.*average.*best|强度.*5.*平均.*最佳/isu);
    assert.match(nodes.get('score')?.label ?? '', /pass rate.*weighted.*blocker.*0.*internet.*0|通过率.*加权.*blocker.*0.*联网.*0/isu);
  }
});

test('separates FrontierMath paper construction from the current v2 tool protocol', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('FrontierMath', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2411\.04872v7.*39d23771/isu);
    assert.match(nodes.get('evidence')?.label ?? '', /private.*no public dataset|私有.*无公开.*数据集/isu);
    assert.match(nodes.get('experts')?.label ?? '', /60\+.*(?:dozen|12\+)|60\+.*十多/isu);
    assert.match(nodes.get('requirements')?.label ?? '', /original.*automat.*guess.*tractab|原创.*自动.*猜.*计算/isu);
    assert.match(nodes.get('problem_package')?.label ?? '', /statement.*solution.*verifier.*subject.*technique|题面.*解答.*验证器.*学科.*技巧/isu);
    assert.match(nodes.get('problem_package')?.label ?? '', /background.*creativity.*execution|背景.*创造.*执行/isu);
    assert.match(nodes.get('blind_review')?.label ?? '', /at least one.*blind.*revise|至少.*盲审.*修订/isu);
    assert.match(nodes.get('contamination')?.label ?? '', /Quetext.*Copyscape.*statement|Quetext.*Copyscape.*题面/isu);
    assert.match(nodes.get('current_release')?.label ?? '', /2026-06-12.*338 total.*295.*43.*12 public.*10 base.*2 Tier 4.*included|2026-06-12.*共 338.*295.*43.*公开 12.*前三级 10.*第四级 2.*包含/isu);
    assert.doesNotMatch(nodes.get('current_release')?.label ?? '', /338 private|私有 338|338\s*\+\s*12|338.*外加.*12/isu);
    assert.match(nodes.get('current_release')?.label ?? '', /123.*12.*5.*7/isu);
    assert.match(nodes.get('version_boundary')?.label ?? '', /10,?000.*pickle.*not current|10,?000.*pickle.*非当前/isu);
    assert.match(nodes.get('current_prompt')?.label ?? '', /python.*submit_answer.*1,?000,?000.*660,?000.*30/isu);
    assert.match(nodes.get('submission')?.label ?? '', /answer\(\).*no args.*typed.*no output.*no comments.*30|answer\(\).*无参数.*类型.*不输出.*无注释.*30/isu);
    assert.match(nodes.get('verification')?.label ?? '', /verify.*True.*1.*False.*error.*0.*accuracy|verify.*True.*1.*False.*错误.*0.*准确率/isu);
  }
});

test('pins FrontierScience dual-track counts, release schema, prompts, parsers, and metrics', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('FrontierScience', language));
    const edges = edgeMap(readArch('FrontierScience', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2601\.21165v1.*25ed67db/isu);
    assert.match(nodes.get('olympiad_authors')?.label ?? '', /42.*108.*45.*37.*26/isu);
    assert.match(nodes.get('research_authors')?.label ?? '', /45.*3.*5/isu);
    assert.match(nodes.get('olympiad_tasks')?.label ?? '', /international.*numeric.*expression.*fuzzy|string|国际.*数值.*表达式.*模糊/isu);
    assert.match(nodes.get('research_tasks')?.label ?? '', /independent.*objective.*10|独立.*客观.*10/isu);
    assert.match(nodes.get('olympiad_review')?.label ?? '', /internal.*at least 1.*holistic|内部.*至少 1.*整体/isu);
    assert.match(nodes.get('research_review')?.label ?? '', /internal.*at least 2.*meta|内部.*至少 2.*元评审/isu);
    assert.match(nodes.get('gold_release')?.label ?? '', /500.*100.*200.*60/isu);
    assert.match(nodes.get('gold_release')?.label ?? '', /problem.*answer.*subject.*task_group_id/isu);
    assert.match(nodes.get('olympiad_grade')?.label ?? '', /GPT-5.*high.*VERDICT: CORRECT.*INCORRECT.*20|GPT-5.*高.*VERDICT: CORRECT.*INCORRECT.*20/isu);
    assert.match(nodes.get('research_grade')?.label ?? '', /GPT-5.*high.*VERDICT: 2\.5.*VERDICT: 8.*7.*10.*30|GPT-5.*高.*VERDICT: 2\.5.*VERDICT: 8.*7.*10.*30/isu);
    assert.match(nodes.get('report')?.label ?? '', /track.*mean accuracy.*parser.*not released|分轨.*平均准确率.*解析器.*未发布/isu);
    assert.ok(edges.has('evidence->olympiad_authors:primary'));
    assert.ok(edges.has('evidence->research_authors:primary'));
    assert.ok(edges.has('olympiad_review->gold_release:primary'));
    assert.ok(edges.has('research_review->gold_release:primary'));
  }
});

test('pins FullStackBench collection, filtering, prompt, parser fallback, execution, and Pass@1', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('FullStackBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2412\.00535v6.*a3c99a9e.*11e2e64d/isu);
    assert.match(nodes.get('sources')?.label ?? '', /GitHub.*documents.*books.*XLCoST.*expert|GitHub.*文档.*书籍.*XLCoST.*专家/isu);
    assert.match(nodes.get('annotation')?.label ?? '', /LLM.*human.*instruction.*reference.*unit tests|LLM.*人工.*指令.*参考.*单测/isu);
    assert.match(nodes.get('quality_control')?.label ?? '', /difficulty.*ambiguity.*solvability.*cross.*consensus.*senior|难度.*歧义.*可解.*交叉.*共识.*资深/isu);
    assert.match(nodes.get('difficulty_vote')?.label ?? '', /six.*discard.*all six.*1.*hard.*5.*easy.*2.*4.*medium|六.*全部答对.*删除.*1.*难.*5.*易.*2.*4.*中/isu);
    assert.match(nodes.get('domain_taxonomy')?.label ?? '', /500K|500,?000|50 万/isu);
    assert.match(nodes.get('domain_taxonomy')?.label ?? '', /11.*88\.1%.*Others|88\.1%.*11.*其他/isu);
    assert.match(nodes.get('bilingual')?.label ?? '', /1,?687.*1,?687/isu);
    assert.match(nodes.get('release')?.label ?? '', /3,?374.*15,?168.*16/isu);
    assert.match(nodes.get('prompting')?.label ?? '', /user prompt.*default system.*temperature 0.*2,?048|用户提示.*默认系统.*temperature 0.*2,?048/isu);
    assert.match(nodes.get('extraction')?.label ?? '', /Non-Java.*complete fenced.*incomplete fenced.*heuristic.*target language|非 Java.*完整围栏.*不完整围栏.*启发式.*目标语言/isu);
    assert.match(nodes.get('execution')?.label ?? '', /Java.*classes.*enums.*interfaces.*named files.*JUnit.*others.*predefined tests|Java.*类.*枚举.*接口.*同名文件.*JUnit.*其他.*预定义单测/isu);
    assert.match(nodes.get('metric')?.label ?? '', /English.*1,?687.*accepted.*Pass@1.*len\(results\).*not fixed.*3,?374|英文.*1,?687.*accepted.*Pass@1.*len\(results\).*不是.*3,?374.*固定值/isu);
    assert.doesNotMatch(nodes.get('metric')?.label ?? '', /accepted(?: count| 数)?\s*\/\s*3,?374/isu);
  }
});

test('pins paper versions, official revisions, and explicit unavailable-source boundaries in details', () => {
  const expected = {
    FrontierCode: [
      /cognition\.com\/blog\/frontier-code$/u,
      /2026-06-08.*2026-07-07/isu,
      /no paper.*public repository.*task.*grader|无论文.*公开仓库.*题目.*评分器/isu,
    ],
    FrontierMath: [
      /2411\.04872v7/u,
      /39d2377106624ad563892a1608a3416e8845b9e0/u,
      /2026-06-12.*338 problems total.*295.*43.*12 public samples.*10 Tiers 1.3.*2 Tier 4.*included.*rather than added/isu,
      /paper.*10,?000.*pickle.*not.*current|论文.*10,?000.*pickle.*非.*当前/isu,
    ],
    FrontierScience: [
      /2601\.21165v1/u,
      /25ed67db7da8f4591484e764008ff585544f5a30/u,
      /100.*60.*problem.*answer.*subject.*task_group_id/isu,
      /judge.*parser.*not released|裁判.*解析器.*未发布/isu,
    ],
    FullStackBench: [
      /2412\.00535v6/u,
      /a3c99a9e93b17b7f3926f0d4fcbf99c8ba42b7e4/u,
      /11e2e64dbcd66d3680e5025cb9ad8b3c2275080f/u,
      /all six.*removed.*five.*easy|六个.*全部答对.*删除.*五个.*易/isu,
      /fsb_en_20241204\.jsonl.*1,?687 English.*Chinese.*not traversed/isu,
      /complete fenced.*incomplete fenced.*heuristic.*target language.*Java.*classes.*enums.*interfaces.*JUnit/isu,
      /sum\(r\.accepted.*len\(results\).*does not divide.*3,?374/isu,
    ],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} review boundary`);
    }
  }
  const frontierMath = readDetail('FrontierMath');
  for (const field of ['intro', 'scale']) {
    assert.match(frontierMath[field], /338.*295.*43.*12.*10.*2.*(?:计入|包含)/isu, `FrontierMath ${field}`);
  }
  for (const field of ['intro_en', 'scale_en']) {
    assert.match(frontierMath[field], /338.*295.*43.*12.*10.*2.*included/isu, `FrontierMath ${field}`);
  }
  assert.doesNotMatch(
    [frontierMath.intro, frontierMath.scale, frontierMath.intro_en, frontierMath.scale_en, frontierMath.drawio_review_note].join('\n'),
    /338 private problems|私有 338 题|338\s*\+\s*12|338.*外加.*12/isu,
    'FrontierMath public/private split',
  );
});

test('keeps every A10r detail fallback synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10r', () => {
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
      const visibleText = svgVisibleText(svg);
      for (const node of readArch(id, language).nodes) {
        for (const line of node.label.split(/\r?\n/u)) {
          assert.ok(visibleText.includes(line), `${id}.${language} SVG label: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces all eight A10r fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10r-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generatedSvg, 'utf8'),
          readFileSync(`${base}.svg`, 'utf8'),
          `${id}.${language}.svg export freshness`,
        );
        execFileSync(drawioDesktop, [
          '-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`,
        ], { stdio: 'pipe' });
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, [
              '-metric', 'AE', generatedPng, `${base}.png`, 'null:',
            ], { stdio: 'pipe' }),
            `${id}.${language}.png pixel freshness`,
          );
        } else {
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png export freshness`);
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10r specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10r-'));
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
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}`,
        );
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
