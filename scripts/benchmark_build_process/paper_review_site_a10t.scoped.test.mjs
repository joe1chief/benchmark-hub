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
const benchmarkIds = ['GMAI-MMBench', 'GMMLU', 'GPQA_Diamond', 'GSM8K-Platinum'];
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

test('keeps all four A10t packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 32]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('pins GMAI-MMBench construction, prompt/parser split, metrics, and runner boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GMAI-MMBench', language));
    const edges = edgeMap(readArch('GMAI-MMBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2408\.03361v7.*d8a6a326.*a8c7450a.*7055d301/isu);
    assert.match(nodes.get('collect')?.label ?? '', /268.*16.*classification.*detection.*segmentation|268.*16.*分类.*检测.*分割/isu);
    assert.match(nodes.get('standardize')?.label ?? '', /SA-Med2D-20M.*2D RGB.*MeSH|SA-Med2D-20M.*2D RGB.*MeSH/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /38.*18.*18.*4.*3.*vote|38.*18.*18.*4.*3.*投票/isu);
    assert.match(nodes.get('question_templates')?.label ?? '', /10.*10.*GPT-4o.*manual|10.*10.*GPT-4o.*人工/isu);
    assert.match(nodes.get('option_pools')?.label ?? '', /global.*source dataset.*local|全局.*同源数据集.*局部/isu);
    assert.match(nodes.get('validate')?.label ?? '', /3 cues.*image.*necessary.*wrong answer.*poor image|3 类线索.*必须看图.*错答.*图像质量差/isu);
    assert.match(nodes.get('select')?.label ?? '', /30.*appearance.*source.*age.*gender|30.*外观.*来源.*年龄.*性别/isu);
    assert.match(nodes.get('release')?.label ?? '', /25,831.*4,550.*21,281.*withheld|25,831.*4,550.*21,281.*隐藏/isu);
    assert.match(nodes.get('paper_prompt')?.label ?? '', /single.*multi.*comma.*zero-shot|单选.*多选.*逗号.*零样本/isu);
    assert.match(nodes.get('paper_parser')?.label ?? '', /option letters.*ChatGPT-3\.5-turbo-0613.*error|选项字母.*ChatGPT-3\.5-turbo-0613.*记错/isu);
    assert.match(nodes.get('paper_metric')?.label ?? '', /single ACC.*correct.*questions.*multi ACC.*predicted.*recall.*ground truth|单选 ACC.*答对数.*题数.*多选 ACC.*预测数.*召回.*标准答案数/isu);
    assert.match(nodes.get('runner_boundary')?.label ?? '', /inherits ImageMCQDataset.*Question.*Options.*Please select the correct answer.*from the options above.*exact_matching.*optional judge.*no multi-select|继承 ImageMCQDataset.*Question.*Options.*Please select the correct answer.*from the options above.*exact_matching.*可选 judge.*无多选解析器/isu);
    assert.match(nodes.get('muir_boundary')?.label ?? '', /direct-letter prompt.*MUIRDataset.*GMAIMMBenchDataset does not use|直接字母提示.*MUIRDataset.*GMAIMMBenchDataset 不使用/isu);
    assert.doesNotMatch(nodes.get('runner_boundary')?.label ?? '', /direct-letter|直接字母/iu);
    assert.ok(edges.has('release->runner_boundary:data'));
    assert.ok(edges.has('runner_boundary->muir_boundary:data'));
  }
});

test('pins Global-MMLU sampling, translation, paper-era counts, evaluation, and later drift', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GMMLU', language));
    const edges = edgeMap(readArch('GMMLU', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2412\.03304v2.*0e619dbe.*b88e8867.*36c2fd75/isu);
    assert.match(nodes.get('source')?.label ?? '', /57.*14,042.*285/isu);
    assert.match(nodes.get('cultural_sample')?.label ?? '', /50.*2,850.*200/isu);
    assert.match(nodes.get('cultural_vote')?.label ?? '', /≥3.*half-or-more|≥3.*半数/isu);
    assert.match(nodes.get('cultural_vote')?.label ?? '', /culture.*geography.*dialect.*temporal.*CS.*CA|文化.*地理.*方言.*时间.*CS.*CA/isu);
    assert.match(nodes.get('machine_translate')?.label ?? '', /41.*Google Translate/isu);
    assert.match(nodes.get('human_improve')?.label ?? '', /Gold Set.*4.*MMMLU.*10.*community.*11.*≥50|Gold Set.*4.*MMMLU.*10.*社区.*11.*50/isu);
    assert.match(nodes.get('full_release')?.label ?? '', /589,764.*33,264.*86,436.*42.*285/isu);
    assert.match(nodes.get('lite_filter')?.label ?? '', /14.*5.*5.*Business.*Medical.*General|14.*5.*5.*商业.*医学.*通识/isu);
    assert.match(nodes.get('paper_lite')?.label ?? '', /15.*200.*200.*6,000.*3,225/isu);
    assert.match(nodes.get('eval_prompt')?.label ?? '', /five-shot.*sample language.*lm-eval.*log-probabilities.*closed APIs|五样本.*语言一致.*lm-eval.*对数概率.*闭源 API/isu);
    assert.match(nodes.get('parser_boundary')?.label ?? '', /exact preamble.*extractor not published.*no canonical parser|preamble 原文.*抽取器未公开.*无规范解析器/isu);
    assert.match(nodes.get('current_lite')?.label ?? '', /23.*9,200.*4,800.*14,000.*not the paper|23.*9,200.*4,800.*14,000.*不等同论文/isu);
    assert.ok(edges.has('paper_lite->current_lite:data'));
  }
});

test('pins GPQA Diamond authoring, parallel validation, exact gate, baseline parser, and metrics', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GPQA_Diamond', language));
    const edges = edgeMap(readArch('GPQA_Diamond', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2311\.12022v1.*56686c06.*distribution paths|2311\.12022v1.*56686c06.*分发路径/isu);
    assert.match(nodes.get('experts')?.label ?? '', /61.*PhD.*biology.*physics.*chemistry|61.*博士.*生物.*物理.*化学/isu);
    assert.match(nodes.get('draft')?.label ?? '', /4 choices.*explanation.*distractors.*subdomain.*time|4 个选项.*解释.*干扰项.*子领域.*用时/isu);
    assert.match(nodes.get('expert1')?.label ?? '', /answer before key.*feedback.*revision|盲答.*反馈.*修订/isu);
    assert.match(nodes.get('expert2')?.label ?? '', /blind.*no later revision|盲答.*不再.*修订/isu);
    assert.match(nodes.get('nonexperts')?.label ?? '', /three.*web allowed.*forbidden.*15.*37.*30|3 位.*上网.*禁止.*15.*37.*30/isu);
    assert.match(nodes.get('extended')?.label ?? '', /564.*18.*546/isu);
    assert.match(nodes.get('diamond_gate')?.label ?? '', /expert 1.*correct.*expert 2.*correct.*mistake.*≤1.*3|专家 1.*正确.*专家 2.*正确.*失误.*3 位.*至多 1/isu);
    assert.match(nodes.get('main_subset')?.label ?? '', /448.*≥1\/2.*≤2\/3|448.*至少 1\/2.*至多 2\/3/isu);
    assert.match(nodes.get('diamond')?.label ?? '', /198/isu);
    assert.match(nodes.get('public_zip')?.label ?? '', /public.*dataset\.zip.*password-protected.*password.*README.*461ae732|公开.*dataset\.zip.*密码.*README.*461ae732/isu);
    assert.match(nodes.get('gated_mirror')?.label ?? '', /633f5ee8.*auto-gated.*accept terms.*contact.*do not reveal examples|633f5ee8.*自动门控.*接受条款.*联系信息.*不泄露样例/isu);
    assert.match(nodes.get('baseline_family')?.label ?? '', /zero-shot.*5-shot.*CoT.*Bing.*GPT-3\.5-0613.*GPT-4.*no single universal|零样本.*5 样本.*CoT.*Bing.*GPT-3\.5-0613.*GPT-4.*不存在唯一/isu);
    assert.match(nodes.get('baseline_prompt')?.label ?? '', /seeded RNG.*The correct answer is|固定随机种子.*The correct answer is/isu);
    assert.match(nodes.get('parser')?.label ?? '', /five regex.*A-D.*miss.*refusal.*69|5 个正则.*A-D.*未解析.*拒答.*69/isu);
    assert.match(nodes.get('metric')?.label ?? '', /accuracy.*correct.*all.*refusal fraction|准确率.*答对数.*全部.*拒答比例/isu);
    assert.ok(edges.has('revise->expert2:primary'));
    assert.ok(edges.has('revise->nonexperts:primary'));
    assert.ok(edges.has('extended->main_subset:data'));
    assert.ok(edges.has('diamond->public_zip:data'));
    assert.ok(edges.has('diamond->gated_mirror:data'));
  }
});

test('separates the GSM8K-Platinum paper subset, later full release, and pinned runner', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('GSM8K-Platinum', language));
    const edges = edgeMap(readArch('GSM8K-Platinum', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2502\.03461v1.*8fd2f82e.*e7624924.*paper subset.*later full release|2502\.03461v1.*8fd2f82e.*e7624924.*论文子集.*后续完整发布/isu);
    assert.match(nodes.get('paper_source')?.label ?? '', /random 300.*Table 2.*not.*1,319|随机.*300.*表 2.*并非.*1,319/isu);
    assert.match(nodes.get('paper_screen')?.label ?? '', /zero-shot.*0\.5.*CoT.*o1.*R1.*Gemini Thinking.*any model|零样本.*0\.5.*o1.*R1.*Gemini Thinking.*CoT.*任一模型/isu);
    assert.match(nodes.get('paper_triage')?.label ?? '', /26.*1/isu);
    assert.match(nodes.get('paper_release')?.label ?? '', /274.*error count|274.*错误数/isu);
    assert.match(nodes.get('full_source')?.label ?? '', /1,319.*exact screen prompt published.*panel not disclosed|1,319.*公开精确筛查提示.*模型面板未披露/isu);
    assert.doesNotMatch(nodes.get('full_source')?.label ?? '', /prompts? not disclosed|提示未公开/iu);
    const publishedPrompt = `${nodes.get('full_prompt')?.label ?? ''}\n${nodes.get('full_prompt_tail')?.label ?? ''}`
      .replace(/\s+/gu, ' ');
    assert.match(publishedPrompt, /Solve the following math word problem.*Think step-by-step.*provide the final answer as a single integer in the format.*Answer: XXX.*no extra formatting.*reasoning models omit Think step-by-step|Solve the following math word.*problem.*Think step-by-step.*provide the final answer as a.*single integer in the format.*Answer: XXX.*no extra.*formatting.*推理模型删除 Think step-by-step/isu);
    assert.match(nodes.get('full_screen')?.label ?? '', /219.*1,100.*not reviewed|219.*1,100.*未人工检查/isu);
    assert.match(nodes.get('full_triage')?.label ?? '', /110.*99.*10.*never rewritten|110.*99.*10.*不改写/isu);
    assert.match(nodes.get('full_release')?.label ?? '', /1,209.*1,100.*99.*10.*cleaning_status/isu);
    assert.match(nodes.get('runner_prompt')?.label ?? '', /platinum_prompt.*data-card template.*platinum_prompt_no_cot.*removes CoT.*o1.*Then, provide.*Provide|platinum_prompt.*数据卡模板.*platinum_prompt_no_cot.*删除 CoT.*o1.*Then, provide.*Provide/isu);
    assert.match(nodes.get('runner_settings')?.label ?? '', /reasoning models omit CoT.*o1.*0\.5.*o1\/o3.*1.*Claude.*none|推理模型移除 CoT.*o1.*0\.5.*o1\/o3.*1.*Claude.*none/isu);
    assert.match(nodes.get('parser')?.label ?? '', /Answer:.*boxed.*last line.*strip \*.*#.*commas.*do not strip \/.*first signed numeric substring.*float|Answer:.*boxed.*末行.*删除 \*.*#.*逗号.*不删除 \/.*首个有符号数字子串.*float/isu);
    assert.match(nodes.get('metric')?.label ?? '', /error_count.*parse\/API.*no accuracy|error_count.*解析\/API.*不输出 accuracy/isu);
    assert.ok(edges.has('full_source->full_prompt:primary'));
    assert.ok(edges.has('full_prompt->full_prompt_tail:primary'));
    assert.ok(edges.has('full_prompt_tail->full_screen:primary'));
  }
});

test('pins paper and official-source revisions plus explicit unavailable boundaries in details', () => {
  const expected = {
    'GMAI-MMBench': [
      /2408\.03361v7/u,
      /d8a6a326daf291a5e2ad702f9925cff0429002ee/u,
      /a8c7450a66400adda3f8e93d9cdc7b2fd541a295/u,
      /7055d3010c38ccb5dcae1bc9535ca19c7fe5d79f/u,
      /does not override build_prompt.*ImageMCQDataset.*Please select the correct answer from the options above/isu,
      /direct-letter suffix.*adjacent MUIRDataset.*must not be attributed/isu,
    ],
    GMMLU: [
      /2412\.03304v2/u,
      /0e619dbeb34206cd48705a1a0ea7fb21cae09993/u,
      /b88e8867e030bb38e9acedfa2c46cb9b8943dc5a/u,
      /36c2fd756f19ccf13a9a96c8e53ccecc02192b8b/u,
      /exact closed-model system preamble and extractor are not published/isu,
    ],
    GPQA_Diamond: [
      /2311\.12022v1/u,
      /56686c06f5e19865c153de0fdb11be3890014df7/u,
      /633f5ee89ab8ad4522a9f850766b73f62147ffdd/u,
      /461ae7329f15a3e35f8184d2dac24b990f34fdf12f366ca4062d8e6638cd08dc/u,
      /publicly exposes a password-protected dataset\.zip.*password in README/isu,
      /automatically gated.*accept.*must not be revealed.*contact information/isu,
      /five regex patterns.*question index 69/isu,
    ],
    'GSM8K-Platinum': [
      /2502\.03461v1/u,
      /8fd2f82e63c49ea1cca4266f4dded82b7ddbcb55/u,
      /e762492455a1cf7967de89f05b6bef72fc713b66/u,
      /publishes the exact zero-shot screening template.*Solve the following math word problem.*Think step-by-step.*Answer: XXX.*no extra formatting/isu,
      /frontier-model panel.*not disclosed.*prompt is disclosed/isu,
      /removes asterisks, hashes, and commas but does not remove slash/isu,
      /outputs error_count only and has no accuracy column/isu,
    ],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} review boundary`);
    }
  }
  assert.equal(readDetail('GSM8K-Platinum').metric_en, 'Error Count');
  assert.equal(readDetail('GSM8K-Platinum').metric, '错误数');
  assert.equal(readDetail('GPQA_Diamond').openness, '公开密码归档；当前镜像自动门控');
  assert.equal(readDetail('GPQA_Diamond').openness_en, 'Public Passworded Archive; Auto-gated Mirror');
});

test('keeps every A10t detail fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10t', () => {
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

test('reproduces all eight A10t fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10t-exports-'));
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

test('strictly rebuilds and normalizes all eight A10t specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10t-'));
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
