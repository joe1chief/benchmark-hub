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
const benchmarkIds = ['Gaia2', 'GaokaoBench', 'GenAI-Bench', 'GenEval'];
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

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function fallbackFromArch(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) {
    const label = String(node.label)
      .replaceAll('"', '&quot;')
      .replaceAll('\n', '<br/>');
    lines.push(`    ${node.id}["${label}"]`);
  }
  for (const edge of arch.edges) {
    lines.push(`    ${edge.from} ${edge.type === 'data' ? '-.->' : '-->'} ${edge.to}`);
  }
  return lines.join('\n');
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

test('keeps all four A10u packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 44], ['zh', 28]]) {
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

test('pins Gaia2 construction, public-release boundary, scaffold, verifier, and Pass@1', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('Gaia2', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2602\.11964v1.*79463674.*78ea3bdb/isu);
    assert.match(nodes.get('are_mobile')?.label ?? '', /12.*101.*10.*400K.*800K|12.*101.*10.*40万.*80万/isu);
    assert.match(nodes.get('annotation')?.label ?? '', /initial state.*oracle write.*events.*one.*capability|初始状态.*预言写操作.*事件.*单一.*能力/isu);
    assert.match(nodes.get('validation')?.label ?? '', /independent.*consistency.*graph guardrails.*baseline|独立.*一致性.*图.*护栏.*基线/isu);
    assert.match(nodes.get('core_release')?.label ?? '', /800.*five.*160|800.*五.*160/isu);
    assert.match(nodes.get('augmentations')?.label ?? '', /Noise 160.*Agent2Agent 160.*reuse|Noise 160.*Agent2Agent 160.*复用/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /five.*configs.*160.*800.*mini 160.*demo 3.*private test.*validation|五.*配置.*160.*800.*mini 160.*demo 3.*私有测试.*验证集/isu);
    assert.match(nodes.get('scaffold')?.label ?? '', /one JSON.*0\.5.*16K.*3.*200|单次 JSON.*0\.5.*16K.*3.*200/isu);
    assert.match(nodes.get('verifier')?.label ?? '', /minimal oracle.*exact.*flexible.*causality.*timing.*completeness|最小预言.*精确.*灵活.*因果.*时序.*完整/isu);
    assert.match(nodes.get('metric')?.label ?? '', /Pass@1.*450.*0\.98.*0\.99.*0\.95/isu);
  }
});

test('pins GaokaoBench counts, type-specific parsers, grading paths, and score formula', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GaokaoBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2305\.12474v3.*6dbb24f8/isu);
    assert.match(nodes.get('source_pdfs')?.label ?? '', /2010.*2022.*9/isu);
    assert.match(nodes.get('source_pdfs')?.label ?? '', /national|全国/isu);
    assert.match(nodes.get('digitize')?.label ?? '', /scripts.*manual.*PDF.*JSON.*LaTeX|脚本.*人工.*PDF.*JSON.*LaTeX/isu);
    assert.match(nodes.get('release')?.label ?? '', /2,?811.*1,?781.*1,?030/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,?418.*273.*64.*26.*786.*218.*26/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /type.*subject.*zero-shot.*many.*reasoning.*eoe.*some answer-only.*five-of-seven.*correction.*Chinese readings.*all.*answer.*eoa|题型.*学科.*零样本.*多数.*【解析】.*eoe.*部分仅答案.*七选五.*改错.*语文阅读.*全部.*【答案】.*eoa/isu);
    assert.match(nodes.get('objective_parser')?.label ?? '', /last A.D.*marker.*first letters.*index >0.*last 10.*first 5 A.G|末个 A.D.*标记.*前序字母.*位置 >0.*末 10.*前 5 个 A.G/isu);
    assert.match(nodes.get('objective_score')?.label ?? '', /weighted exact.*Physics.*6.*3.*extraneous.*0|加权精确.*物理.*6.*3.*多选.*0/isu);
    assert.match(nodes.get('human_grade')?.label ?? '', /two teachers.*average|两位教师.*平均/isu);
    assert.match(nodes.get('repo_judge')?.label ?? '', /GPT-4-1106-preview.*0.*max_tokens=4,?096.*request omits.*no marking criteria|GPT-4-1106-preview.*0.*max_tokens=4,?096.*未传.*不含评分点/isu);
    assert.match(nodes.get('repo_judge')?.label ?? '', /total-score.*mean non-null|【总分】.*非空.*均值/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /correct.*total.*objective.*subjective.*750|得分.*满分.*客观.*主观.*750/isu);
    assert.match(nodes.get('agreement')?.label ?? '', /Spearman.*Kendall.*criteria|Spearman.*Kendall.*评分点/isu);
  }
});

test('pins GenAI-Bench v1 filtering, exact judge protocol, parser aliases, and version boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GenAI-Bench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2406\.04485v4.*f0b0334d.*7981a194/isu);
    assert.match(nodes.get('arena_inputs')?.label ?? '', /35.*image generation.*editing.*video.*live.*ImagenHub.*VBench|35.*图像生成.*编辑.*视频.*实时.*ImagenHub.*VBench/isu);
    assert.match(nodes.get('pair_vote')?.label ?? '', /anonymous.*same-task.*left.*right.*tie good.*both bad|匿名.*同任务.*左优.*右优.*同好.*均差/isu);
    assert.match(nodes.get('vote_qc')?.label ?? '', /350.*303.*17.*30.*231.*51.*21.*93\.07/isu);
    assert.match(nodes.get('v1_release')?.label ?? '', /test_v1.*1,?735.*919.*1,?069.*3,?723/isu);
    assert.match(nodes.get('version_boundary')?.label ?? '', /test.*3,?192.*983.*1,?911.*6,?086.*do not merge|test.*3,?192.*983.*1,?911.*6,?086.*不可合并/isu);
    assert.match(nodes.get('judge_prompt')?.label ?? '', /prompt following.*naturalness.*artifacts.*aesthetics|提示遵循.*自然度.*伪影.*美学/isu);
    assert.match(nodes.get('judge_prompt')?.label ?? '', /overediting.*temporal.*dynamic|过度编辑.*时序.*动态/isu);
    assert.match(nodes.get('judge_input')?.label ?? '', /8 frames.*video-capable.*sampled frames|8 帧.*视频原生.*采样帧/isu);
    assert.match(nodes.get('parser')?.label ?? '', /first greedy.*\[\[\.\*\]\].*A>>B.*B>>A.*A=B|首个贪婪.*\[\[\.\*\]\].*A>>B.*B>>A.*A=B/isu);
    assert.match(nodes.get('metric')?.label ?? '', /mean boolean accuracy.*three-task.*Bradley.Terry.*separate|布尔准确率均值.*三任务.*Bradley.Terry.*另行/isu);
  }
});

test('pins GenEval prompt cardinalities, evaluator thresholds, clauses, and unweighted metric', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GenEval', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2310\.11513v1.*af4902f2.*no separate.*dataset|2310\.11513v1.*af4902f2.*无独立.*数据集/isu);
    assert.match(nodes.get('templates')?.label ?? '', /80.*10 colors.*2.4.*4 positions|80.*10 色.*2.4.*4 方位/isu);
    assert.match(nodes.get('sampling')?.label ?? '', /seed 43.*all 80.*five.*100.*deduplicate|种子 43.*全部 80.*其余五类.*100.*去重/isu);
    assert.match(nodes.get('prompt_set')?.label ?? '', /553.*80.*99.*80.*94.*100.*100/isu);
    assert.match(nodes.get('generate')?.label ?? '', /4 images.*model.*default|4 张图.*模型.*默认/isu);
    assert.match(nodes.get('detect')?.label ?? '', /Mask2Former.*0\.3.*counting.*0\.9.*16|Mask2Former.*0\.3.*计数.*0\.9.*16/isu);
    assert.match(nodes.get('geometry')?.label ?? '', /include.*exclude.*center.*0\.1.*0\.5|包含.*排除.*中心.*0\.1.*0\.5/isu);
    assert.match(nodes.get('color_binding')?.label ?? '', /ViT-L\/14.*box.*mask.*#999.*10|ViT-L\/14.*框.*掩码.*#999.*10/isu);
    assert.match(nodes.get('binary')?.label ?? '', /binary.*all requested.*reason|二值.*全部要求.*原因/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /mean.*image.*six.*unweighted|图像.*均值.*六类.*等权/isu);
    assert.match(nodes.get('human_validation')?.label ?? '', /6,?000.*1,?200.*5.*83%.*88%.*860.*91%/isu);
  }
});

test('pins paper versions, official revisions, and explicit source boundaries in details', () => {
  const expected = {
    Gaia2: [
      /2602\.11964v1/u,
      /7946367413129784139e785ae4c351090002a0bb/u,
      /78ea3bdbdeec2bdcd6afa5420915d8a22f23ed99/u,
      /800.*five.*160.*Noise.*160.*Agent2Agent.*160.*test.*private.*validation/isu,
      /2509\.17158v2.*older.*not.*main|2509\.17158v2.*较早.*非.*主论文/isu,
      /mini.*200.*metadata.*paper.*160/isu,
    ],
    GaokaoBench: [
      /2305\.12474v3/u,
      /6dbb24f8d8439041e5431c4c184a582182a6ce9c/u,
      /1,?418.*273.*64.*26.*786.*218.*26/isu,
      /many templates.*reasoning.*five_out_of_seven.*correction.*Chinese reading.*do not request.*【解析】.*every fixed prompt.*【答案】.*<eoa>/isu,
      /paper.*marking criteria.*repository.*without.*criteria|论文.*评分点.*仓库.*不含.*评分点/isu,
      /max_tokens 4,?096.*omits max_tokens.*(?:not.*enforced|rather than an enforced)/isu,
    ],
    'GenAI-Bench': [
      /2406\.04485v4/u,
      /f0b0334d414074c6b1c97e2c60ad8d8a592bda9f/u,
      /7981a194091d2201447f0c0e9cc4261dd5ad5846/u,
      /test_v1.*3,?723.*test.*6,?086.*not.*merge|test_v1.*3,?723.*test.*6,?086.*不可.*合并/isu,
      /not the separate 1,?600|非另一个 1,?600/isu,
    ],
    GenEval: [
      /2310\.11513v1/u,
      /af4902f24d3ca90ebbb446dd9891a59e0f82725f/u,
      /no separate official dataset|无独立官方数据集/isu,
      /80.*99.*80.*94.*100.*100/isu,
    ],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} review boundary`);
    }
  }
});

test('keeps every A10u detail fallback exactly synchronized with reviewed architectures', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail[`flowchart_${language}`],
        fallbackFromArch(readArch(id, language)),
        `${id}.${language}`,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10u', () => {
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

test('reproduces all eight A10u fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10u-exports-'));
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

test('strictly rebuilds and normalizes all eight A10u specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10u-'));
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
