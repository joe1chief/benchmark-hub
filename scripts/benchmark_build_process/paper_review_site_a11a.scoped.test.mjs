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
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['HiPhO', 'HireBench', 'HotpotQA', 'HumanEval-Mul'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(root, 'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs');
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
const readSpec = (id, language = 'en') => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

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

test('keeps all four A11a packages bilingual with identical typed topology and academic styling', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence`);
      assert.ok(
        spec.nodes.some(node => node.id === 'artifact_boundary'),
        `${id}.${language} artifact boundary`,
      );
    }
  }
});

test('locks HiPhO paper construction, scoring, and mutable-release boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HiPhO', language));
    const edges = edgeSet(readArch('HiPhO', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2509\.07894v4.*b7f4814/isu);
    assert.match(nodes.get('select')?.label ?? '', /13.*seven.*2024.*2025.*human scores|13.*(?:7.*2024.*2025|2024.*2025.*7).*人类.*成绩/isu);
    assert.match(nodes.get('ocr')?.label ?? '', /OCR.*Markdown.*LaTeX/isu);
    assert.match(nodes.get('verify')?.label ?? '', /every.*QA.*OCR.*mismatch|每个.*题解.*OCR.*错配/isu);
    assert.match(nodes.get('marking')?.label ?? '', /seven.*step.*rubric|7.*步骤.*(?:Rubric|评分)/isu);
    assert.match(nodes.get('refine')?.label ?? '', /context.*subquestion.*unit|上下文.*小题.*单位/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /360.*519.*308.*52/isu);
    assert.match(nodes.get('answer_grade')?.label ?? '', /math verifier.*Gemini-2\.5-Flash|数学验证器.*Gemini-2\.5-Flash/isu);
    assert.match(nodes.get('step_grade')?.label ?? '', /partial credit.*four.*best|部分分.*4.*最高/isu);
    assert.match(nodes.get('problem_score')?.label ?? '', /max.*answer.*step|最大.*答案.*步骤|取.*答案.*步骤.*较高/isu);
    assert.match(nodes.get('medal')?.label ?? '', /13.*Gold.*Silver.*Bronze|13.*金.*银.*铜/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /8db13ae.*8e196c0.*CPhO 2025.*(?:not released|未发布|不在.*公开)/isu);
    for (const edge of [
      'evidence->select:data',
      'verify->marking:secondary',
      'verify->refine:primary',
      'route->step_grade:primary',
      'route->answer_only:secondary',
      'medal->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HireBench as one released AWM scenario, not a standalone benchmark', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HireBench', language));
    const edges = edgeSet(readArch('HireBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2602\.10090v3.*85e322f.*e9b8de6.*gen_scenario\.jsonl.*762.*gen_tasks\.jsonl.*520/isu);
    assert.match(nodes.get('identity')?.label ?? '', /HireBench Coding Graduate Pipeline.*ats_applicant_tracking_system_\s*4.*not.*standalone|HireBench Coding Graduate Pipeline.*ats_applicant_tracking_system_\s*4.*不是.*独立/isu);
    assert.match(nodes.get('seeds')?.label ?? '', /100.*domain.*stateful.*database|100.*领域.*有状态.*数据库/isu);
    assert.match(nodes.get('filter')?.label ?? '', /CRUD.*0\.85.*categor|CRUD.*0\.85.*类别/isu);
    assert.match(nodes.get('tasks')?.label ?? '', /10.*API.*post-authentication|10.*API.*(?:登录后|认证后)/isu);
    assert.match(nodes.get('database')?.label ?? '', /SQLite.*sample.*precondition|SQLite.*样例.*前置/isu);
    assert.match(nodes.get('tools')?.label ?? '', /minimal.*typed.*MCP|最小.*类型.*MCP/isu);
    assert.match(nodes.get('verifier')?.label ?? '', /(?:before.*after|initial.*final).*database.*structured|(?:前后|初始.*最终).*数据库.*结构化/isu);
    assert.match(nodes.get('repair')?.label ?? '', /five.*10%.*0%|5.*10%.*0%/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,?000.*10,?000.*gen_\*\.jsonl|1,?000.*10,?000.*gen_\*\.jsonl/isu);
    assert.match(nodes.get('result')?.label ?? '', /Completed.*Partially Completed.*Agent Error.*Environment Error|完成.*部分完成.*Agent 错误.*环境错误/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /one scenario.*10 tasks.*no standalone.*seed.*not.*public|一个场景.*10.*不.*独立.*种子.*未.*公开/isu);
    for (const edge of [
      'evidence->identity:data',
      'identity->seeds:primary',
      'tasks->database:primary',
      'tasks->tools:secondary',
      'database->verifier:primary',
      'tools->verifier:secondary',
      'result->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HotpotQA collection, hard splits, two settings, metrics, and hidden-test boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HotpotQA', language));
    const edges = edgeSet(readArch('HotpotQA', language));
    assert.match(nodes.get('evidence')?.label ?? '', /1809\.09600v1.*3635853.*hotpot_evaluate_v1\.py/isu);
    assert.match(nodes.get('wiki')?.label ?? '', /October 1, 2017.*first paragraph.*hyperlink|2017 年 10 月 1 日.*首段.*超链接/isu);
    assert.match(nodes.get('graph')?.label ?? '', /directed.*a.*b.*591|有向.*a.*b.*591/isu);
    assert.match(nodes.get('bridge_pairs')?.label ?? '', /75%.*a.*b.*two paragraph|75%.*a.*b.*两段/isu);
    assert.match(nodes.get('comparison_pairs')?.label ?? '', /25%.*42.*50%.*Yes.*No|25%.*42.*50%.*是非/isu);
    assert.match(nodes.get('crowd')?.label ?? '', /AMT.*ParlAI.*answer.*supporting fact|AMT.*ParlAI.*答案.*支持事实/isu);
    assert.match(nodes.get('corpus')?.label ?? '', /112,?779/isu);
    assert.match(nodes.get('hardness')?.label ?? '', /18,?089.*(?:three|3)-fold.*56,?814|18,?089.*三折.*56,?814/isu);
    assert.match(nodes.get('split')?.label ?? '', /15,?661.*7,?405.*7,?405/isu);
    assert.match(nodes.get('distractor')?.label ?? '', /two gold.*eight.*TF-IDF.*shuffle|(?:2|两).*金标.*(?:8|八).*TF-IDF.*打乱/isu);
    assert.match(nodes.get('fullwiki')?.label ?? '', /all.*Wikipedia.*gold.*not specified|全部.*Wikipedia.*不指定.*金标/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /Answer EM.*Support EM.*Joint.*product|答案 EM.*支持.*EM.*联合.*乘积/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /CC BY-SA 4\.0.*test.*withheld.*Docker.*prediction|CC BY-SA 4\.0.*测试.*隐藏.*Docker.*预测/isu);
    for (const edge of [
      'evidence->wiki:data',
      'graph->bridge_pairs:primary',
      'graph->comparison_pairs:primary',
      'split->distractor:primary',
      'split->fullwiki:primary',
      'metrics->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('separates HumanEval-Mul V3 protocol, MultiPL-E translation, and pinned harness facts', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HumanEval-Mul', language));
    const edges = edgeSet(readArch('HumanEval-Mul', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2412\.19437v2.*2208\.08227v4.*2f9fd85.*3025a53/isu);
    assert.match(nodes.get('identity')?.label ?? '', /8-language.*not.*separate.*translation|八语言.*不是.*独立.*翻译/isu);
    assert.match(nodes.get('report_protocol')?.label ?? '', /original.*default prompts.*Pass@1.*8,?192|原始.*默认提示.*Pass@1.*8,?192/isu);
    assert.match(nodes.get('translation_method')?.label ?? '', /164.*exclude.*3.*signature.*unit tests.*types.*doctests.*terminology|164.*排除.*3.*签名.*单元测试.*类型.*Doctest.*术语/isu);
    assert.match(nodes.get('harness_pin')?.label ?? '', /2f9fd85.*Evaluation\/HumanEval\/data.*humaneval-\*\.jsonl/isu);
    assert.match(nodes.get('source_boundary')?.label ?? '', /3025a53.*translation method only.*2f9fd85.*files.*counts.*cleanup.*(?:not|neither.*claimed).*exact V3 runner|3025a53.*仅.*翻译方法.*2f9fd85.*文件.*题量.*清理.*不.*V3.*确切/isu);
    assert.match(nodes.get('python')?.label ?? '', /Python.*164/isu);
    assert.match(nodes.get('typed')?.label ?? '', /C\+\+ 161.*Java 158.*TypeScript 159.*C# 158/isu);
    assert.match(nodes.get('dynamic')?.label ?? '', /JavaScript 161.*PHP 161.*Bash 158/isu);
    assert.match(nodes.get('package')?.label ?? '', /1,?280.*eight|1,?280.*8/isu);
    assert.match(nodes.get('normalize')?.label ?? '', /stop.*cleanup.*2f9fd85|2f9fd85.*(?:停止.*清理|stop.*cleanup)/isu);
    assert.match(nodes.get('sandbox')?.label ?? '', /compile.*10-second.*hidden.*tests|编译.*10 秒.*隐藏.*测试/isu);
    assert.match(nodes.get('report')?.label ?? '', /per-language.*Pass@1.*aggregate.*not restated|逐语言.*Pass@1.*聚合.*未重述/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /500.*greedy.*8,?192.*not.*exact V3 runner|500.*贪心.*8,?192.*不是.*V3.*确切/isu);
    for (const edge of [
      'evidence->identity:data',
      'evidence->report_protocol:data',
      'identity->translation_method:secondary',
      'identity->harness_pin:primary',
      'translation_method->source_boundary:secondary',
      'harness_pin->source_boundary:primary',
      'source_boundary->python:secondary',
      'source_boundary->typed:primary',
      'source_boundary->dynamic:secondary',
      'package->generate:primary',
      'report_protocol->generate:data',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact paper and official artifact revisions in all A11a detail records', () => {
  const hipho = readDetail('HiPhO');
  assert.match(hipho.paper_url, /2509\.07894v4/u);
  assert.match(hipho.drawio_review_note, /b7f4814.*8db13ae.*8e196c0.*CPhO 2025.*OCR.*not.*public/isu);

  const hire = readDetail('HireBench');
  assert.match(hire.paper_url, /2602\.10090v3/u);
  assert.match(hire.drawio_review_note, /85e322f.*e9b8de6/isu);
  assert.match(hire.drawio_review_note, /gen_scenario\.jsonl.*762.*ats_applicant_tracking_system_4/isu);
  assert.match(hire.drawio_review_note, /gen_tasks\.jsonl.*520/isu);
  assert.match(hire.drawio_review_note, /not.*standalone/isu);

  const hotpot = readDetail('HotpotQA');
  assert.match(hotpot.paper_url, /1809\.09600v1/u);
  assert.match(hotpot.drawio_review_note, /3635853.*591.*112,?779.*18,?089.*56,?814.*15,?661.*7,?405.*CC BY-SA 4\.0.*withheld/isu);

  const humaneval = readDetail('HumanEval-Mul');
  assert.match(humaneval.paper_url, /2412\.19437v2/u);
  assert.match(humaneval.drawio_review_note, /2208\.08227v4.*2f9fd85.*3025a53.*164.*161.*158.*161.*159.*158.*158.*161.*1,?280/isu);
  assert.match(humaneval.drawio_review_note, /500.*greedy.*8,?192.*not.*exact.*V3/isu);
});

test('keeps every A11a fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(readArch(id, language)),
        `${id}.${language} canonical fallback`,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11a', () => {
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

test('reproduces exactly eight A11a SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11a-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(generatedSvg, `${base}.svg`, `${id}.${language}.svg`);
        execFileSync(drawioDesktop, ['-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`], { stdio: 'pipe' });
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, ['-metric', 'AE', generatedPng, `${base}.png`, 'null:'], { stdio: 'pipe' }),
            `${id}.${language}.png pixel freshness`,
          );
        } else {
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png`);
        }
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A11a specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11a-'));
  let rebuildCount = 0;
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
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
          `${id}.${language}.arch`,
        );
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
