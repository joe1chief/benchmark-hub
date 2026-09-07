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
const benchmarkIds = ['HumanEvalPlus', 'IMO-AnswerBench', 'IMO-Bench', 'INCLUDE'];
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
    lines.push(`    ${edge.from} ${mermaidArrow(edge)} ${edge.to}`);
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

test('keeps all four A11b packages bilingual with identical typed topology and academic styling', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence`);
      assert.ok(spec.nodes.some(node => node.id === 'artifact_boundary'), `${id}.${language} boundary`);
    }
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 44], ['zh', 30]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks HumanEval+ as test augmentation with paper construction and current release boundaries', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HumanEvalPlus', language));
    const edges = edgeSet(readArch('HumanEvalPlus', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2305\.01210v3.*26d6d00.*v0\.1\.10.*68cd26d/isu);
    assert.match(nodes.get('identity')?.label ?? '', /test.*augmentation.*164.*not.*new task|测试.*增强.*164.*不是.*新任务/isu);
    assert.match(nodes.get('base')?.label ?? '', /signature.*docstring.*9\.6|签名.*文档字符串.*9\.6/isu);
    assert.match(nodes.get('oracle')?.label ?? '', /reimplement.*every.*(?:more than|>).*10%|重新实现.*全部.*(?:超过|>).*10%/isu);
    assert.match(nodes.get('contracts')?.label ?? '', /83.*164.*precondition.*invalid|83.*164.*前置条件.*无效/isu);
    assert.match(nodes.get('seeds')?.label ?? '', /30.*three.*gold.*base.*corner|30.*3.*金标.*基础.*边界/isu);
    assert.match(nodes.get('mutation')?.label ?? '', /type-aware.*ingredient.*1,?000.*one hour|类型感知.*素材.*1,?000.*1 小时/isu);
    assert.match(nodes.get('release')?.label ?? '', /764\.1.*80/isu);
    assert.match(nodes.get('mini')?.label ?? '', /branch.*mutant.*other.*sample.*16\.1.*47|分支.*变异体.*其他.*样本.*16\.1.*47/isu);
    assert.match(nodes.get('evaluate')?.label ?? '', /trusted.*canonical.*base.*plus|可信.*金标.*基础.*增强/isu);
    assert.match(nodes.get('gate')?.label ?? '', /untrusted.*pass.*fail.*timeout|非可信.*通过.*失败.*超时/isu);
    assert.match(nodes.get('report')?.label ?? '', /unbiased.*Pass@1.*Pass@10.*Pass@100|无偏.*Pass@1.*Pass@10.*Pass@100/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /no LLM judge.*functional execution.*v0\.1\.10|无 LLM 裁判.*功能执行.*v0\.1\.10/isu);
    for (const edge of [
      'evidence->identity:data',
      'identity->base:primary',
      'mutation->release:primary',
      'release->mini:secondary',
      'release->prompt:primary',
      'mini->evaluate:secondary',
      'gate->report:primary',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks IMO-AnswerBench selection, robustification, grader protocol, validation, and v2 correction', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('IMO-AnswerBench', language));
    const edges = edgeSet(readArch('IMO-AnswerBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2511\.01846v1.*92ae8c2.*96fa6c4.*ea72dda.*955558a/isu);
    assert.match(nodes.get('handpick')?.label ?? '', /400.*national.*regional.*international|400.*国家.*地区.*国际/isu);
    assert.match(nodes.get('balance')?.label ?? '', /100.*Algebra.*Combinatorics.*Geometry.*Number Theory|100.*代数.*组合.*几何.*数论/isu);
    assert.match(nodes.get('difficulty')?.label ?? '', /11\/46\/32\/11.*4\/19\/31\/46.*13\/44\/32\/11.*2\/20\/31\/47/isu);
    assert.match(nodes.get('robustify')?.label ?? '', /manual.*LLM.*paraphrase.*rename.*values.*distractors|人工.*LLM.*改写.*改名.*数值.*干扰/isu);
    assert.match(nodes.get('consistency')?.label ?? '', /unique.*simplif.*non-trivial.*binary|唯一.*化简.*非平凡.*二元/isu);
    assert.match(nodes.get('vet')?.label ?? '', /10.*gold.*5.*silver|10.*金.*5.*银/isu);
    assert.match(nodes.get('grader')?.label ?? '', /Gemini 2\.5 Pro.*final answer only.*boxed.*Correct.*Incorrect|Gemini 2\.5 Pro.*仅.*最终答案.*boxed.*Correct.*Incorrect/isu);
    assert.match(nodes.get('validate')?.label ?? '', /800.*274.*1.*8.*517.*791/isu);
    assert.match(nodes.get('report')?.label ?? '', /overall.*category.*accuracy.*8 runs.*single run|总体.*类别.*准确率.*8 次.*单次/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /answerbench_v2\.csv.*400.*no executable.*grader.*parser|answerbench_v2\.csv.*400.*无.*可执行.*评分器.*解析器/isu);
    for (const edge of [
      'evidence->sources:data',
      'balance->difficulty:primary',
      'dataset->v2:data',
      'v2->generate:primary',
      'grader->validate:secondary',
      'grader->decision:primary',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks IMO-Bench as three parallel paper tasks with distinct graders, parsers, and metrics', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('IMO-Bench', language));
    const edges = edgeSet(readArch('IMO-Bench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2511\.01846v1.*92ae8c2.*96fa6c4/isu);
    assert.match(nodes.get('suite')?.label ?? '', /three.*parallel.*400.*60.*1,?000|三个.*并行.*400.*60.*1,?000/isu);
    assert.match(nodes.get('proof_basic')?.label ?? '', /30.*rephrase.*pre-IMO.*IMO-Medium|30.*改写.*Pre-IMO.*IMO-Medium/isu);
    assert.match(nodes.get('proof_advanced')?.label ?? '', /30.*18.*novel.*6.*IMO 2024.*6.*USAMO 2025|30.*18.*新题.*6.*IMO 2024.*6.*USAMO 2025/isu);
    assert.match(nodes.get('proof_human')?.label ?? '', /problem.*candidate.*reference.*guideline.*integer 0.*7|题目.*候选.*参考.*细则.*整数 0.*7/isu);
    assert.match(nodes.get('proof_auto')?.label ?? '', /Gemini 2\.5 Pro.*(?:points.*out of 7|7 分.*得分).*(?:proxy|代理)/isu);
    assert.match(nodes.get('proof_metric')?.label ?? '', /percent.*maximum.*human.*primary|最高.*百分比.*人工.*主要/isu);
    assert.match(nodes.get('grading_data')?.label ?? '', /1,?000.*30.*advanced.*human.*0.*7|1,?000.*30.*高难.*人工.*0.*7/isu);
    assert.match(nodes.get('grading_context')?.label ?? '', /problem.*proposed solution only.*no reference.*guideline|仅.*题目.*候选解.*无.*参考.*细则/isu);
    assert.match(nodes.get('grading_parse')?.label ?? '', /7.*6.?4.*3.?1.*0.*last word.*LLM fallback|7.*6.?4.*3.?1.*0.*末词.*LLM.*回退/isu);
    assert.match(nodes.get('grading_metric')?.label ?? '', /four-way accuracy.*MAE.*7\/6\/1\/0|四分类准确率.*MAE.*7\/6\/1\/0/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /answerbench_v2.*proofbench_v2.*LeanProof.*excluded.*CSV-only|answerbench_v2.*proofbench_v2.*LeanProof.*不(?:在|纳入).*仅.*CSV/isu);
    for (const edge of [
      'evidence->suite:data',
      'suite->answer:primary',
      'suite->proof_basic:primary',
      'suite->proof_advanced:primary',
      'proof_human->proof_auto:secondary',
      'proof_human->grading_data:secondary',
      'grading_parse->grading_metric:primary',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks INCLUDE collection, exam-level labels, subset sampling, prompting, and held-back full set', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('INCLUDE', language));
    const edges = edgeSet(readArch('INCLUDE', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2411\.19799v1.*d2e1f60.*a027ccc/isu);
    assert.match(nodes.get('sources')?.label ?? '', /academic.*professional.*regional.*licen|学术.*职业.*地区.*执照/isu);
    assert.match(nodes.get('extract')?.label ?? '', /PDF.*JavaScript.*HTML.*question.*options.*answer|PDF.*JavaScript.*HTML.*题干.*选项.*答案/isu);
    assert.match(nodes.get('native_qc')?.label ?? '', /native.*original.*correct.*filter.*image.*table.*context|母语.*原件.*纠错.*过滤.*图像.*表格.*上下文/isu);
    assert.match(nodes.get('new_data')?.label ?? '', /118,?606.*1,?926.*60\.2%/isu);
    assert.match(nodes.get('existing')?.label ?? '', /78,?637.*Arabic.*Chinese.*Turkish.*Persian.*VNHSGE.*EXAMS|78,?637.*阿拉伯.*中文.*土耳其.*波斯.*VNHSGE.*EXAMS/isu);
    assert.match(nodes.get('complete')?.label ?? '', /197,?243.*44.*15.*52.*58/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /exam-level.*not.*sample.*two-level|考试级.*非.*样本级.*两级/isu);
    assert.match(nodes.get('regionality')?.label ?? '', /34\.4%.*18\.8%.*16\.4%.*30\.4%/isu);
    assert.match(nodes.get('four_option')?.label ?? '', /fewer.*omit.*more.*prune.*four|少于.*剔除.*多于.*裁减.*四/isu);
    assert.match(nodes.get('base')?.label ?? '', /22,?635.*550.*500.*50/isu);
    assert.match(nodes.get('lite')?.label ?? '', /10,?770.*250.*region-specific|10,?770.*250.*地区特定/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /temperature 0.*5-shot.*512.*zero-shot CoT.*1,?024.*in-language.*English.*region|温度 0.*(?:5-shot|五样本).*512.*(?:Zero-shot CoT|零样本 CoT).*1,?024.*(?:同语|原语言).*英文.*地区/isu);
    assert.match(nodes.get('parse')?.label ?? '', /format.*failure.*incorrect.*total.*answer accuracy|格式.*失败.*错误.*总体.*答案准确率/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /197,?243.*held back.*23,?741.*915.*11,?021|197,?243.*未公开.*23,?741.*915.*11,?021/isu);
    for (const edge of [
      'evidence->community:data',
      'filter->new_data:primary',
      'existing->complete:secondary',
      'taxonomy->regionality:primary',
      'regionality->four_option:primary',
      'four_option->base:primary',
      'four_option->lite:primary',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact paper and official artifact revisions in every A11b detail record', () => {
  const human = readDetail('HumanEvalPlus');
  assert.match(human.paper_url, /2305\.01210v3/u);
  assert.match(human.homepage, /26d6d00bb1fd0fa37f39c99d5290da67891d1c5e/u);
  assert.match(human.drawio_review_note, /v0\.1\.10.*68cd26d53a0dec69f85eafe1f82a2a74155a2bd6/isu);
  assert.match(human.drawio_review_note, /test augmentation.*not a new task set.*no LLM judge/isu);

  for (const id of ['IMO-AnswerBench', 'IMO-Bench']) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, /2511\.01846v1/u);
    assert.match(detail.homepage, /96fa6c4cc3a9bb7450ee7b6773b659d3a030dace/u);
    assert.match(detail.drawio_review_note, /92ae8c2e88dee12a3f793dd88a5e80ed76754c2a/isu);
    assert.match(detail.drawio_review_note, /ea72dda6e4aa615d940cf84713b142bcb0aa75b5.*955558ad67ef24dccd27545c326988bdad1b4471/isu);
  }
  assert.match(readDetail('IMO-AnswerBench').drawio_review_note, /no executable AnswerAutoGrader.*parser/isu);
  assert.match(readDetail('IMO-Bench').drawio_review_note, /7.*6-4.*3-1.*0.*last word.*LLM fallback/isu);

  const include = readDetail('INCLUDE');
  assert.match(include.paper_url, /2411\.19799v1/u);
  assert.match(include.homepage, /d2e1f6015f67a43c02a9a68db98e2298e2d6a660/u);
  assert.match(include.drawio_review_note, /a027ccc923428c0c43c295a91efcc39a1e47fa60/isu);
  assert.match(include.drawio_review_note, /complete.*197,?243.*held back.*23,?741.*915.*11,?021/isu);
});

test('keeps every A11b fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A11b', () => {
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

test('reproduces exactly eight A11b SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11b-exports-'));
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

test('strictly rebuilds and normalizes all eight A11b specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11b-'));
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
