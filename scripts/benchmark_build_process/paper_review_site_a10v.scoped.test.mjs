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
const benchmarkIds = ['GenExam', 'GenQA', 'Global-MMLU-Lite', 'GraphWalks'];
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
  join(publicDir, 'drawio', id, id + '.' + language + '.arch.json'),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', id + '.json'));
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

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

function fallbackFromArch(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of arch.edges) {
    const arrow = mermaidArrow(edge);
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
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

test('keeps all four A10v packages bilingual with identical typed topology', () => {
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
            id + '.' + language + '.' + node.id + ': ' + line,
          );
        }
      }
    }
  }
});

test('pins GenExam taxonomy, filtering, 250-item Mini, judge, and score formulas', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GenExam', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2509\.14232v5.*6f324dd1.*0782259d/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /ISCED-F.*10.*four levels.*10\/40\/132\/236|ISCED-F.*10.*四级.*10\/40\/132\/236/isu);
    assert.match(nodes.get('collect')?.label ?? '', /40K.*exam\/textbook.*seven|4 万.*考试\/教材.*七个/isu);
    assert.match(nodes.get('heuristic_filter')?.label ?? '', /duplicates.*low resolution.*watermarks.*non-English|去重.*低分辨率.*水印.*非英文/isu);
    assert.match(nodes.get('gpt_filter')?.label ?? '', /GPT-5.*four.*text richness.*domain.*complexity.*subject density.*6\.5K|GPT-5.*四项.*文本密度.*领域.*复杂度.*学科知识密度.*6,?500/isu);
    assert.match(nodes.get('draft')?.label ?? '', /yes\/no.*weights sum to 1|是\/否.*权重.*1/isu);
    assert.match(nodes.get('review')?.label ?? '', /Three PhD.*image.*prompt.*scoring points|三名博士.*图像.*提示.*评分点/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,?000.*10.*74\.8.*6\.9/isu);
    assert.match(nodes.get('mini')?.label ?? '', /Mini.*250.*level-3.*stratified|Mini.*250.*三级.*分层/isu);
    assert.match(nodes.get('generate')?.label ?? '', /one image.*default T2I|一张图.*默认 T2I/isu);
    assert.match(nodes.get('judge')?.label ?? '', /GPT-5-2025-08-07.*low.*generated.*reference.*0.2|GPT-5-2025-08-07.*低推理.*生成图.*参考图.*0.2/isu);
    assert.match(nodes.get('score')?.label ?? '', /Strict.*all points yes.*all 2.*semantic.*\.7.*\.1 \/ 2|严格.*评分点全对.*均为 2.*语义.*\.7.*\.1 \/ 2/isu);
  }
  assert.doesNotMatch(JSON.stringify(readArch('GenExam', 'en')), /487/u);
  assert.doesNotMatch(JSON.stringify(readArch('GenExam', 'zh')), /487/u);
});

test('pins GenQA clustering, exact nine-entry macro, protocols, and published boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GenQA', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2512\.13961v2.*5a51f502/isu);
    assert.match(nodes.get('pool')?.label ?? '', /23K.*70|2\.3 万.*70/isu);
    assert.match(nodes.get('cluster')?.label ?? '', /Ward.*rank|Ward.*排序/isu);
    assert.match(nodes.get('align')?.label ?? '', /task format.*STEM.*non-STEM|任务格式.*STEM.*非 STEM/isu);
    assert.match(nodes.get('rc_branch')?.label ?? '', /HellaSwag.*WinoGrande.*LAMBADA.*BasicSkills.*six|HellaSwag.*WinoGrande.*LAMBADA.*BasicSkills.*六/isu);
    assert.match(nodes.get('gen_branch')?.label ?? '', /DROP.*Jeopardy.*NaturalQs.*SQuAD.*CoQA/isu);
    assert.match(nodes.get('eval_rc')?.label ?? '', /5-shot.*LAMBADA 0-shot.*per-char.*raw.*per-token|5 样本.*LAMBADA.*零样本.*按字符.*原始.*按词元/isu);
    assert.match(nodes.get('eval_gen')?.label ?? '', /CoQA.*0-shot.*T 0.*top-p 1.*100\/50|CoQA.*零样本.*T 0.*top-p 1.*100\/50/isu);
    assert.match(nodes.get('task_score')?.label ?? '', /nine.*accuracy.*F1.*BasicSkills.*six|九个.*准确率.*F1.*BasicSkills.*六/isu);
    assert.match(nodes.get('macro')?.label ?? '', /Macro-average.*nine.*OlmoBaseEval GenQA|九个.*宏平均.*OlmoBaseEval GenQA/isu);
    assert.match(nodes.get('limitation')?.label ?? '', /answer banks.*miss valid.*Gen2MC.*separate.*no standalone|答案库不完整.*漏判.*Gen2MC.*独立.*没有独立/isu);
  }
});

test('pins Global-MMLU-Lite annotation, translation, balanced sampling, and versioned sizes', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('Global-MMLU-Lite', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2412\.03304v2.*0e619dbe.*b88e8867.*36c2fd75/isu);
    assert.match(nodes.get('source')?.label ?? '', /57.*14,?042.*285/isu);
    assert.match(nodes.get('cultural_sample')?.label ?? '', /50.*2,?850.*200/isu);
    assert.match(nodes.get('cultural_vote')?.label ?? '', /3.*half-or-more.*culture.*geography.*dialect.*temporal.*CS.*CA|3.*半数.*文化.*地理.*方言.*时间.*CS.*CA/isu);
    assert.match(nodes.get('machine_translate')?.label ?? '', /41.*Google Translate/isu);
    assert.match(nodes.get('human_improve')?.label ?? '', /Gold Set 4.*MMMLU 10.*community 11.*50|Gold Set 4.*MMMLU 10.*社区 11.*50/isu);
    assert.match(nodes.get('join')?.label ?? '', /CS\/CA.*human-translated.*post-edited|CS\/CA.*人工翻译.*人工后编辑/isu);
    assert.match(nodes.get('lite_filter')?.label ?? '', /exclude 14.*5 CS.*5 CA.*Business\/Medical\/General|排除 14.*5 个 CS.*5 个 CA.*商业\/医学\/通识/isu);
    assert.match(nodes.get('paper_release')?.label ?? '', /v1.*15.*200 CS.*200 CA.*6,?000.*3,?225|v1.*15.*CS 200.*CA 200.*6,?000.*3,?225/isu);
    assert.match(nodes.get('current_lite')?.label ?? '', /v3.*23.*9,?200.*4,?800.*4,?655/isu);
    assert.match(nodes.get('evaluate')?.label ?? '', /5-shot.*sample language.*lm-eval.*log-probability.*API|5 样本.*样本语言.*lm-eval.*对数概率.*API/isu);
    assert.match(nodes.get('metric')?.label ?? '', /accuracy.*language.*CS\/CA.*resource.*unpublished|准确率.*语言.*CS\/CA.*资源.*未公开/isu);
  }
});

test('pins GraphWalks released records, unavailable construction, repair, parser defect, and intended metric', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GraphWalks', language));
    assert.match(nodes.get('evidence')?.label ?? '', /no paper.*f338bb26.*Parquet|无构建论文.*f338bb26.*Parquet/isu);
    assert.match(nodes.get('graphs')?.label ?? '', /10-char.*degree.*1.*sampling.*not published|10 字符.*度数.*1.*采样算法未公开/isu);
    assert.match(nodes.get('bfs')?.label ?? '', /exactly.*target depth.*exclude.*start.*intermediate.*revisited|目标深度.*排除.*起点.*中间层.*已访问/isu);
    assert.match(nodes.get('parents')?.label ?? '', /incoming.*exclude.*target|入边.*排除.*目标/isu);
    assert.match(nodes.get('gold')?.label ?? '', /answer_nodes.*generation\/validation.*not published|answer_nodes.*生成\/验证.*未公开/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /four worked examples.*edge list.*output contract|四个固定示例.*边表.*输出契约/isu);
    assert.match(nodes.get('schema')?.label ?? '', /prompt.*answer_nodes.*prompt_chars.*problem_type.*date_added.*answer.*3-shot/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,?150.*550.*600.*750.*400/isu);
    assert.match(nodes.get('repair')?.label ?? '', /24\/400.*exact depth.*02-27-2026|24\/400.*精确深度.*02-27-2026/isu);
    assert.match(nodes.get('run')?.label ?? '', /Final Answer: \[.*\]/isu);
    assert.match(nodes.get('parser')?.label ?? '', /strip.*keeps prefix.*no corrected|strip.*前缀.*未发布官方修正版/isu);
    assert.match(nodes.get('metric')?.label ?? '', /precision.*recall.*F1.*empty\/empty.*1.*bug|精确率.*召回率.*F1.*空集\/空集.*1.*缺陷/isu);
  }
});

test('pins paper versions, official revisions, locators, and explicit source boundaries in details', () => {
  const expected = {
    GenExam: [
      /2509\.14232v5/u,
      /6f324dd1ca23511759a409aa28783075db68bf99/u,
      /0782259dc19f6528a0b02268afccb85e0a2495ad/u,
      /Sections 3\.1-3\.2.*Appendices A-B.*Figures 8 and 10/isu,
      /mini_sample_ids.*250.*487.*report example/isu,
      /gpt-5-2025-08-07.*low reasoning.*semantic×0\.7/isu,
    ],
    GenQA: [
      /2512\.13961v2/u,
      /5a51f502d463b8cdc4a2dcad7d7096c41ff1197e/u,
      /Section 3\.3\.1.*Table 46.*Appendix A\.4\.2/isu,
      /olmo3:base:gen.*basic_skills:rc::olmes/isu,
      /nine-entry.*BasicSkills.*six-task nested macro/isu,
      /Gen2MC.*not part of GenQA/isu,
    ],
    'Global-MMLU-Lite': [
      /2412\.03304v2/u,
      /0e619dbeb34206cd48705a1a0ea7fb21cae09993/u,
      /b88e8867e030bb38e9acedfa2c46cb9b8943dc5a/u,
      /36c2fd756f19ccf13a9a96c8e53ccecc02192b8b/u,
      /Appendix C.*excludes 14.*five CS.*five CA/isu,
      /3,?225.*README prose.*4,?275.*4,?800.*README prose.*4,?655/isu,
      /closed-API answer extractor is not published/isu,
    ],
    GraphWalks: [
      /^$/u,
      /f338bb265735a56a79f4b0f5def722c9c3268ead/u,
      /No construction paper.*sampling\/gold-validation code.*unavailable/isu,
      /prompt.*answer_nodes.*prompt_chars.*problem_type.*date_added/isu,
      /four worked examples.*three-shot/isu,
      /24 of 400.*Final Answer.*strip.*prefix.*no corrected official parser/isu,
    ],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], id + ' paper');
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, id + ' review boundary');
    }
  }
  assert.equal(readDetail('GenExam').scale_en, '1,000-item full set; 250-item GenExam-Mini');
  assert.equal(
    readDetail('Global-MMLU-Lite').scale_en,
    'Paper v1: 6,000 test and 3,225 dev; current v3: 9,200 test and 4,800 dev',
  );
});

test('keeps every A10v detail fallback exactly synchronized with reviewed architectures', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, id + ' generic fallback');
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail['flowchart_' + language],
        fallbackFromArch(readArch(id, language)),
        id + '.' + language,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10v', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, id + '.' + language);
      const drawio = readFileSync(base + '.drawio', 'utf8');
      const svg = readFileSync(base + '.svg', 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const visibleText = svgVisibleText(svg);
      for (const node of readArch(id, language).nodes) {
        for (const line of node.label.split(/\r?\n/u)) {
          assert.ok(visibleText.includes(line), id + '.' + language + ' SVG label: ' + line);
        }
      }
      const dimensions = pngDimensions(base + '.png');
      assert.ok(
        dimensions.width >= 700 && dimensions.height >= 180,
        id + '.' + language,
      );
    }
  }
});

test('reproduces all eight A10v fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10v-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, id + '.' + language);
        const generatedSvg = join(tempRoot, id + '.' + language + '.svg');
        const generatedPng = join(tempRoot, id + '.' + language + '.png');
        execFileSync(drawioDesktop, [
          '-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, base + '.drawio',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(
          generatedSvg,
          base + '.svg',
          id + '.' + language + '.svg export freshness',
        );
        execFileSync(drawioDesktop, [
          '-x', '-f', 'png', '-o', generatedPng, base + '.drawio',
        ], { stdio: 'pipe' });
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, [
              '-metric', 'AE', generatedPng, base + '.png', 'null:',
            ], { stdio: 'pipe' }),
            id + '.' + language + '.png pixel freshness',
          );
        } else {
          assert.equal(
            sha256(generatedPng),
            sha256(base + '.png'),
            id + '.' + language + '.png export freshness',
          );
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10v specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10v-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, id + '.' + language);
        const generated = join(tempRoot, id + '.' + language + '.drawio');
        execFileSync(process.execPath, [
          drawioCli,
          base + '.spec.yaml',
          generated,
          '--validate',
          '--strict',
          '--write-sidecars',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(base + '.drawio', 'utf8'),
          id + '.' + language,
        );
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(base + '.arch.json', 'utf8'),
          id + '.' + language + '.arch',
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
