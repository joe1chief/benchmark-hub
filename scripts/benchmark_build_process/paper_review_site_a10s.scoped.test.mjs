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
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['FunctionQA', 'GDPVal', 'GENIUS', 'GEdit-Bench'];
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

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of arch.edges) {
    lines.push(`    ${edge.from} ${edge.type === 'primary' ? '-->' : '-.->'} ${edge.to}`);
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

test('keeps all four A10s packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 40], ['zh', 28]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('pins FunctionQA aggregate-review boundary, fixed split, extractor, normalization, and slices', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('FunctionQA', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2310\.02255v3.*53d52587.*2b6ad694/isu);
    assert.match(nodes.get('evidence')?.label ?? '', /provenance.*undisclosed|题目来源.*未披露/isu);
    assert.match(nodes.get('review')?.label ?? '', /99\.2%.*736.*6.*consensus|736.*99\.2%.*6.*共识/isu);
    assert.match(nodes.get('release')?.label ?? '', /400.*62.*338.*263.*132.*5/isu);
    assert.match(nodes.get('extraction')?.label ?? '', /choice.*int.*float.*GPT-4.*99\.5%.*200|选择.*整数.*浮点.*GPT-4.*200.*99\.5%/isu);
    assert.match(nodes.get('normalization')?.label ?? '', /nearest choice.*integer.*float.*normalized strings|最近选项.*整数.*浮点.*字符串/isu);
    assert.match(nodes.get('score')?.label ?? '', /average accuracy.*question.*answer.*language.*source.*category.*task.*context.*grade.*skills|平均准确率.*问题.*答案.*语言.*来源.*类别.*任务.*上下文.*年级.*技能/isu);
  }
});

test('pins GDPVal selection, expert QC, public/private split, comparisons, and metric definitions', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GDPVal', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2510\.04374v1.*11e7900c/isu);
    assert.match(nodes.get('evidence')?.label ?? '', /grader code.*not released|评分器代码.*未公开/isu);
    assert.match(nodes.get('sectors')?.label ?? '', /2024.*>5%.*9|2024.*>5%.*9/isu);
    assert.match(nodes.get('occupations')?.label ?? '', /GPT-4o.*O\*NET.*60%.*44/isu);
    assert.match(nodes.get('experts')?.label ?? '', /<10%.*4.*14|<10%.*4.*14/isu);
    assert.match(nodes.get('authoring')?.label ?? '', /request.*reference.*deliverable.*O\*NET.*time.*wage|请求.*参考.*交付物.*O\*NET.*工时.*时薪/isu);
    assert.match(nodes.get('qc')?.label ?? '', /advisory.*3.*5|建议.*3.*5/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,320.*30.*7.*220.*5.*rubric|1,320.*30.*7.*220.*5.*量规/isu);
    assert.match(nodes.get('human_grade')?.label ?? '', /3.*3.*9|3.*3.*9/isu);
    assert.match(nodes.get('metric')?.label ?? '', /win 1.*tie 0\.5.*loss 0.*better-or-tied.*better-only|胜 1.*平 0\.5.*负 0.*更好或持平.*仅胜出/isu);
  }

  const detail = readDetail('GDPVal');
  assert.match(detail.modality, /文本.*文件.*多模态/isu);
  assert.match(detail.modality_en, /Text.*Files.*Multimodal/isu);
  assert.equal(detail.has_leaderboard, false);
});

test('pins GENIUS branches, release contract, inference boundary, parser, and weighted score', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GENIUS', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2602\.11144v1.*115338d6.*a1c68adc/isu);
    assert.match(nodes.get('evidence')?.label ?? '', /inference.*not standardized|模型推理.*未标准化/isu);
    assert.match(nodes.get('implicit')?.label ?? '', /86/isu);
    assert.match(nodes.get('constraint')?.label ?? '', /213.*153.*60/isu);
    assert.match(nodes.get('adaptation')?.label ?? '', /211.*101.*110/isu);
    assert.match(nodes.get('curate')?.label ?? '', /every modality.*necessary.*3|每种模态.*不可缺少.*3/isu);
    assert.match(nodes.get('release')?.label ?? '', /510.*3.*5.*20.*RC.*VC.*(?:repo|仓库).*CC-BY-NC 4\.0.*HF.*MIT/isu);
    assert.match(nodes.get('outputs')?.label ?? '', /PNG.*outputs.*missing.*zero.*not released|PNG.*outputs.*缺失.*零.*未公开/isu);
    assert.match(nodes.get('judge')?.label ?? '', /Gemini-3-Pro-preview.*3 scoring rounds.*RC\/AQ.*once per round.*VC.*image-tag hint.*copy.*hint|Gemini-3-Pro-preview.*3 轮.*RC\/AQ.*各一次.*VC.*抄袭.*逐图像提示/isu);
    assert.match(nodes.get('parser')?.label ?? '', /parse failure.*zero.*3 rounds.*mean.*round.*VC.*image-tagged hints|解析失败.*零.*3 轮.*均值.*取整.*VC.*图像标签/isu);
    assert.match(nodes.get('score')?.label ?? '', /0\/1\/2.*0\/50\/100.*0\.6 RC.*0\.35 VC.*0\.05 AQ/isu);
  }

  const detail = readDetail('GENIUS');
  assert.equal(
    detail.homepage,
    'https://github.com/arctanxarc/GENIUS/tree/115338d60588594b0fe2a0bbbf8f6b9136a7d0da',
  );
  assert.equal(detail.has_leaderboard, true);
  assert.match(detail.eval_feature_en, /3 scoring rounds.*RC\/AQ.*once per round.*VC.*copy.*image-tag hint/isu);
  assert.match(detail.drawio_review_note, /repository.*CC-BY-NC 4\.0.*HF.*MIT.*conflict/isu);
  assert.match(detail.drawio_review_note, /3 scoring rounds.*RC and AQ.*once per round.*VC.*image-tag hint.*copy/isu);
  assert.match(detail.drawio_review_note, /symbolic.*015.*non-empty vc_hint.*no <image:\.\.\.>.*omit VC/isu);
});

test('pins GEdit-Bench privacy flow, paired release, output views, VIEScore parser, and macro mean', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GEdit-Bench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2504\.17761v5.*4cca05df.*50766778/isu);
    assert.match(nodes.get('collect')?.label ?? '', />1K.*Internet.*Reddit|>1,?000.*互联网.*Reddit/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /11.*same-purpose.*606|11.*相同目的.*606/isu);
    assert.match(nodes.get('deidentify')?.label ?? '', /reverse-search.*public.*substitute.*modify.*intent|公开.*反向搜图.*替换.*改指令.*意图/isu);
    assert.match(nodes.get('release')?.label ?? '', /EN.*ZH.*1,212.*606.*Intersection_exist|英文.*中文.*606.*1,212.*Intersection_exist/isu);
    assert.match(nodes.get('generation')?.label ?? '', /missing output.*skipped|缺失输出.*跳过/isu);
    assert.match(nodes.get('views')?.label ?? '', /606.*missing.*excluded.*434.*422|606.*缺失.*不计入.*434.*422/isu);
    assert.match(nodes.get('viescore')?.label ?? '', /GPT-4\.1.*Qwen2\.5-VL-72B.*(?:SC.*PQ.*0.*10|0.*10.*SC.*PQ).*tie/isu);
    assert.match(nodes.get('parser')?.label ?? '', /retry once.*fallback.*SC=min.*PQ=min.*sqrt|重试一次.*回退.*SC=.*最小值.*PQ=.*最小值.*sqrt/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /unweighted.*11.*common|11.*非加权.*共同交集/isu);
  }

  const detail = readDetail('GEdit-Bench');
  assert.equal(detail.has_leaderboard, false);
  assert.match(
    nodeMap(readArch('GEdit-Bench', 'en')).get('evidence')?.label ?? '',
    /paper.*GPT-4o\/GPT-4\.1.*conflict.*fixed eval.*GPT-4\.1/isu,
  );
  assert.match(
    nodeMap(readArch('GEdit-Bench', 'zh')).get('evidence')?.label ?? '',
    /论文.*GPT-4o\/GPT-4\.1.*冲突.*固定评测器.*GPT-4\.1/isu,
  );
});

test('pins versioned primary sources, full revisions, and source boundaries in details', () => {
  const expected = {
    FunctionQA: [
      /2310\.02255v3/u,
      /53d525874bdde205128e6b160b7357a88277d479/u,
      /2b6ad69445fbb5695c9b165475e8decdbeb97747/u,
      /aggregate.*736.*not FunctionQA-only.*not disclosed/isu,
    ],
    GDPVal: [
      /2510\.04374v1/u,
      /11e7900cdcac61bc4daf59e65feb238acda98fbf/u,
      /no public official evaluator.*implementation was found/isu,
      /65\.7%.*70\.8%.*12.*220.*does not replace/isu,
    ],
    GENIUS: [
      /2602\.11144v1/u,
      /115338d60588594b0fe2a0bbbf8f6b9136a7d0da/u,
      /a1c68adcd67912c690efaf45fc19bdff58c3259d/u,
      /does not standardize.*inference scripts/isu,
      /repository.*CC-BY-NC 4\.0.*HF.*MIT.*conflict/isu,
      /symbolic.*015.*non-empty vc_hint.*no <image:\.\.\.>.*omit VC/isu,
    ],
    'GEdit-Bench': [
      /2504\.17761v5/u,
      /4cca05dfcd6c32dc810d0b4db84c2bf0682a5aeb/u,
      /50766778e2a737474c7e9bdf84cdce82c3ea3f4f/u,
      /paper v5.*internally inconsistent.*Figure 7.*GPT-4o.*Section 4\.2\.1.*Tables 2-3.*GPT-4\.1.*pinned evaluator.*GPT-4\.1/isu,
      /unweighted mean.*11 category means/isu,
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

test('keeps every A10s detail fallback exactly synchronized with architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(readArch(id, language)),
        `${id}.${language}`,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10s', () => {
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
      assert.ok(dimensions.width >= 700 && dimensions.height >= 300, `${id}.${language}`);
    }
  }
});

test('reproduces all eight A10s fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10s-exports-'));
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
        assertSvgFidelity(
          generatedSvg,
          `${base}.svg`,
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

test('strictly rebuilds and normalizes all eight A10s specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10s-'));
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
