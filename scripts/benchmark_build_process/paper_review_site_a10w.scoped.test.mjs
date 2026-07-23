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
const benchmarkIds = ['HEAD-QA', 'HLE-Full', 'HLE-Verified', 'HLEtext'];
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
const findEdge = (graph, from, to, type) => graph.edges.find(
  edge => edge.from === from && edge.to === to && edge.type === type,
);

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
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of arch.edges) {
    const arrow = edge.type === 'primary' ? '-->' : '-.->';
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

test('keeps all four A10w packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('locks HEAD-QA source pins, chronological bilingual construction, and exact evaluator contract', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('HEAD-QA', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /1906\.04701v1.*da54ff2.*d444ead.*1\.1\.0/isu);
    assert.match(nodes.get('exams')?.label ?? '', /Spanish.*public.*health.*2013|西班牙.*公共.*医疗.*2013/isu);
    assert.match(nodes.get('domains')?.label ?? '', /medicine.*pharmacology.*psychology.*nursing.*biology.*chemistry|医学.*药学.*心理.*护理.*生物.*化学/isu);
    assert.match(nodes.get('clean')?.label ?? '', /radiophysics.*PDF.*equation.*invalidated|放射物理.*PDF.*公式.*作废/isu);
    assert.match(nodes.get('schema')?.label ?? '', /name.*year.*category.*qid.*qtext.*ra.*image.*aid.*atext/isu);
    assert.match(nodes.get('split')?.label ?? '', /2013-14.*2,657.*2015.*1,366.*2,742.*6,765/isu);
    assert.match(nodes.get('spanish')?.label ?? '', /five choices.*four choices.*14%.*image|五个选项.*四个选项.*14%.*图像/isu);
    assert.match(nodes.get('translate')?.label ?? '', /Google API.*question.*answer.*IDs.*images.*splits|Google API.*题干.*答案.*ID.*图像.*切分/isu);
    assert.match(nodes.get('audit')?.label ?? '', /60.*4\.35.*4\.71.*4 \/ 5/isu);
    const spanishRunner = nodes.get('run_es')?.label ?? '';
    assert.match(spanishRunner, /Length.*Random.*Blind.*IR.*no canonical LLM prompt|Length.*Random.*Blind.*IR.*无规范 LLM 提示/isu);
    assert.doesNotMatch(spanishRunner, /DrQA/iu);
    assert.match(nodes.get('run_en')?.label ?? '', /translated.*DrQA.*English-only.*no canonical LLM prompt|翻译.*DrQA.*仅用于英文.*无规范 LLM 提示/isu);
    assert.match(nodes.get('parser')?.label ?? '', /qid.*answer ID.*"-".*unanswered|qid.*答案 ID.*"-".*未作答/isu);
    assert.match(nodes.get('score')?.label ?? '', /accuracy.*macro P\/R\/F1.*right.*3.*wrong.*1.*unanswered.*0|准确率.*宏观 P\/R\/F1.*答对.*3.*答错.*1.*未作答.*0/isu);
    assert.ok(edges.has('evidence->exams:data'));
    assert.ok(edges.has('split->spanish:primary'));
    assert.ok(edges.has('split->translate:primary'));
    assert.ok(edges.has('run_es->parser:primary'));
    assert.ok(edges.has('run_en->parser:primary'));
    assert.ok(edges.has('parser->score:primary'));
  }
});

test('locks HLE-Full expert construction, stumping gate, public/private boundary, and official scoring', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('HLE-Full', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2501\.14249v10.*26dca2e.*5a81a4c/isu);
    assert.match(nodes.get('experts')?.label ?? '', /1,000.*500.*50.*100|1,000.*500.*50.*100/isu);
    assert.match(nodes.get('submission')?.label ?? '', /question.*exact answer.*rationale.*subject.*name.*affiliation|题目.*精确答案.*解析.*学科.*姓名.*机构/isu);
    assert.match(nodes.get('criteria')?.label ?? '', /precise.*unambiguous.*solvable.*non-searchable.*original.*verifiable.*English.*subjective|精确.*无歧义.*可解.*不可搜索.*原创.*可验证.*英语.*主观/isu);
    assert.match(nodes.get('difficulty')?.label ?? '', /exact match.*every model fails.*multiple choice.*all but one|精确匹配.*全部模型失败.*选择题.*仅允许一个模型成功/isu);
    assert.match(nodes.get('candidates')?.label ?? '', /70K.*13K.*GPT-4o.*Gemini 1\.5 Pro.*Claude 3\.5 Sonnet.*o1.*o1-mini.*o1-preview/isu);
    assert.match(nodes.get('expert_review')?.label ?? '', /1-3.*graduate.*trained expert.*organizer.*public feedback|1-3.*研究生.*受训专家.*组织者.*公开反馈/isu);
    assert.match(nodes.get('release')?.label ?? '', /2,500.*private.*not disclosed.*24%.*exact-match.*14%.*images|2,500.*私有.*未披露.*24%.*精确匹配.*14%.*图像/isu);
    assert.match(nodes.get('run')?.label ?? '', /zero-shot.*chain-of-thought.*Explanation.*Answer.*Confidence.*0%-100%.*image|零样本.*思维链.*Explanation.*Answer.*Confidence.*0%-100%.*图像/isu);
    const judge = nodes.get('judge')?.label ?? '';
    assert.match(judge, /o3-mini-2025-01-31.*(?:structured|结构化).*["“]None["”].*(?:equivalence.*numeric.*ambiguity|等价.*数值.*歧义).*100%/isu);
    assert.doesNotMatch(judge, /null/iu);
    assert.match(nodes.get('score')?.label ?? '', /Accuracy.*RMS.*confidence.*100.*p=2.*beta=100.*sort.*create.*(?:range\(len\(bins\)-1\)|range.*bins.*-1).*skip.*final|准确率.*RMS.*置信度.*100.*p=2.*beta=100.*排序.*创建.*(?:range\(len\(bins\)-1\)|range.*bins.*-1).*跳过.*最后/isu);
    assert.match(nodes.get('public_runner')?.label ?? '', /26dca2e.*temperature 0.*not forwarded.*caller.*n=2700.*stale|26dca2e.*temperature 0.*未传入.*调用方.*n=2700.*过时/isu);
    assert.ok(edges.has('evidence->experts:data'));
    assert.ok(edges.has('difficulty->candidates:primary'));
    assert.ok(edges.has('release->run:primary'));
    assert.ok(edges.has('evidence->public_runner:data'));
    assert.ok(edges.has('public_runner->run:data'));
    assert.ok(!/500 private|私有[^\n]*500/iu.test(nodes.get('release')?.label ?? ''));
  }
});

test('locks HLE-Verified two-stage expert ownership, disjoint subsets, repair scope, and comparison protocol', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('HLE-Verified', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2602\.13964v3.*b705e0f.*0bc8364.*2,500/isu);
    assert.match(nodes.get('components')?.label ?? '', /Q1-Q5.*S1-S10.*A1-A4.*19/isu);
    assert.match(nodes.get('experts')?.label ?? '', /independent.*binary.*problem.*answer.*rationale.*expert-owned|独立.*二元.*题目.*答案.*解析.*专家/isu);
    assert.match(nodes.get('models')?.label ?? '', /multimodal.*pass@8.*extract.*normalize.*equivalence.*diagnostic.*never ground truth|多模态.*pass@8.*提取.*归一化.*等价.*诊断.*不作为真值/isu);
    assert.match(nodes.get('stage1')?.label ?? '', /positive evidence.*problem.*answer.*no high-risk ambiguity|正向证据.*题目.*答案.*无高风险歧义/isu);
    assert.match(nodes.get('gold')?.label ?? '', /668.*unchanged|668.*不修改/isu);
    assert.match(nodes.get('repair_scope')?.label ?? '', /math.*physics.*chemistry.*biomedicine.*computer science.*uncertain|数学.*物理.*化学.*生物医学.*计算机科学.*不确定/isu);
    assert.match(nodes.get('repairs')?.label ?? '', /two independent.*Problem Fix.*Solution Fix.*Answer Fix.*objective.*minimal|两支独立.*题目修复.*解答修复.*答案修复.*目标.*最小/isu);
    assert.match(nodes.get('auxiliary')?.label ?? '', /multi-model.*auxiliary.*do not replace expert|多模型.*辅助.*不替代专家/isu);
    assert.match(nodes.get('adjudicate')?.label ?? '', /internal.*expert.*canonical.*ambiguous.*uncertain|内部.*专家.*规范.*歧义.*不确定/isu);
    assert.match(nodes.get('uncertain_gate')?.label ?? '', /Stage I.*indeterminate.*high-risk.*Stage II.*ambiguous.*unverifiable.*expertise|Stage I.*不确定.*高风险.*Stage II.*歧义.*不可验证.*专长/isu);
    assert.match(nodes.get('revision')?.label ?? '', /1,143.*revised.*re-verified|1,143.*修订.*复核/isu);
    assert.match(nodes.get('uncertain')?.label ?? '', /689.*uncertainty source.*expertise|689.*不确定性来源.*专长/isu);
    assert.match(nodes.get('release')?.label ?? '', /668.*1,143.*689.*2,500.*original|668.*1,143.*689.*2,500.*原始/isu);
    const evaluation = nodes.get('evaluate')?.label ?? '';
    assert.match(evaluation, /raw.*verified.*full.*experimental revised subset.*problem.*answer.*rationale-only.*excluded.*text-only.*five.*avg5.*p=2.*beta=100|原始.*修订.*全量.*实验修订子集.*题目.*答案.*纯解析.*不计.*纯文本.*五次.*avg5.*p=2.*beta=100/isu);
    assert.doesNotMatch(evaluation, /full set \+ revised subset|全量集 \+ 修订子集/iu);
    const artifactBoundary = nodes.get('artifact_boundary')?.label ?? '';
    assert.match(artifactBoundary, /Stage I.*II.*prompts.*published.*judge.*dataset paths.*unset.*solver.*interactive.*base URL.*public.*endpoint\/model mapping.*unavailable.*access terms.*artifacts.*unavailable|Stage I.*II.*提示.*公开.*judge.*数据路径.*未设置.*solver.*交互.*base URL.*公开.*endpoint\/model.*映射.*缺失.*访问条件.*产物.*不可复现/isu);
    assert.doesNotMatch(artifactBoundary, /repo input paths empty|endpoints absent|仓库脚本的输入路径为空|端点未公开/iu);
    assert.ok(edges.has('components->experts:primary'));
    assert.ok(edges.has('components->models:primary'));
    assert.ok(edges.has('experts->stage1:primary'));
    assert.ok(edges.has('models->stage1:primary'));
    assert.ok(edges.has('stage1->gold:primary'));
    assert.ok(edges.has('stage1->repair_scope:primary'));
    assert.ok(edges.has('stage1->uncertain_gate:primary'));
    assert.ok(edges.has('adjudicate->revision:primary'));
    assert.ok(edges.has('adjudicate->uncertain_gate:primary'));
    assert.ok(edges.has('uncertain_gate->uncertain:primary'));
    assert.ok(edges.has('gold->release:primary'));
    assert.ok(edges.has('revision->release:primary'));
    assert.ok(edges.has('uncertain->release:primary'));
    assert.ok(edges.has('evidence->artifact_boundary:data'));
  }
});

test('locks HLEtext as a Step-report text-only view with disclosed selection and runner gaps', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('HLEtext', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2501\.14249v10.*26dca2e.*5a81a4c.*2602\.10604v2.*21d85a/isu);
    assert.match(nodes.get('experts')?.label ?? '', /1,000.*500.*50.*100|1,000.*500.*50.*100/isu);
    const difficulty = nodes.get('difficulty')?.label ?? '';
    assert.match(difficulty, /exact match.*all models fail.*MC.*at most one model succeeds.*70K.*13K|精确匹配.*全部模型失败.*选择题.*最多一个模型成功.*70K.*13K/isu);
    assert.doesNotMatch(difficulty, /all but one model succeeds|选择题：仅一个模型成功/iu);
    assert.match(nodes.get('hle')?.label ?? '', /2,500.*24%.*exact-match.*14%.*images|2,500.*24%.*精确匹配.*14%.*图像/isu);
    assert.match(nodes.get('text_scope')?.label ?? '', /text-only.*HLEtext.*exact filter.*row count.*not disclosed|纯文本.*HLEtext.*精确筛选.*行数.*未披露/isu);
    assert.match(nodes.get('vanilla')?.label ?? '', /Step 3\.5 Flash.*one generation.*pass@1.*256k.*temperature=1\.0.*top-p=1\.0|Step 3\.5 Flash.*一次生成.*pass@1.*256k.*temperature=1\.0.*top-p=1\.0/isu);
    assert.match(nodes.get('pacore')?.label ?? '', /PaCoRe.*\[4, 4, 4, 4\].*parallel.*coordination.*256k|PaCoRe.*\[4, 4, 4, 4\].*并行.*协调.*256k/isu);
    assert.match(nodes.get('judge')?.label ?? '', /HLE.*gpt-oss-120b.*prompt.*parser.*undisclosed|HLE.*gpt-oss-120b.*提示.*解析器.*未披露/isu);
    assert.match(nodes.get('score')?.label ?? '', /accuracy.*23\.1.*27\.9|准确率.*23\.1.*27\.9/isu);
    assert.match(nodes.get('report_boundary')?.label ?? '', /ab446a3.*reporting label.*no separate dataset.*selector.*row count.*eval code.*run logs|ab446a3.*报告标签.*无独立数据集.*筛选器.*行数.*评测代码.*运行日志/isu);
    assert.ok(edges.has('evidence->experts:data'));
    assert.ok(edges.has('hle->text_scope:primary'));
    assert.ok(edges.has('text_scope->vanilla:primary'));
    assert.ok(edges.has('text_scope->pacore:primary'));
    assert.ok(edges.has('vanilla->judge:primary'));
    assert.ok(edges.has('pacore->judge:primary'));
    assert.ok(edges.has('evidence->report_boundary:data'));
    assert.ok(edges.has('report_boundary->text_scope:data'));
  }
});

test('pins paper and official artifact revisions plus disclosed protocol boundaries in A10w details', () => {
  const head = readDetail('HEAD-QA');
  assert.match(head.paper_url, /1906\.04701v1/u);
  assert.match(head.drawio_review_note, /da54ff230ed62664ca6eebd7ccfd2b7081f2c651.*d444ead98dd50d7949703c1662c7880a5c1ea77d.*1\.1\.0.*qid.*ra.*aid.*atext.*unanswered.*macro precision.*POINTS/isu);
  assert.match(head.drawio_review_note, /Spanish.*Length.*Random.*Blind.*IR.*DrQA.*English/isu);

  const full = readDetail('HLE-Full');
  assert.match(full.paper_url, /2501\.14249v10/u);
  assert.match(full.drawio_review_note, /26dca2e253b405105b4c3d8c2f5af06f86f90c66.*5a81a4c7271a2a2a312b9a690f0c2fde837e4c29.*reporting label.*not a separate dataset.*private.*size.*not disclosed/isu);
  assert.match(full.drawio_review_note, /["“]None["”].*sort.*confidence.*all.*bins.*range\(len\(bins\)-1\).*final.*bin.*temperature.*not forwarded.*n=2700.*stale/isu);

  const verified = readDetail('HLE-Verified');
  assert.match(verified.paper_url, /2602\.13964v3/u);
  assert.match(verified.drawio_review_note, /b705e0fb541c025a1532ce0d60d70ae2f53b00e0.*0bc83643672d4f68a5f89998617a639d85e7318b.*five.*668.*1,143.*689.*experimental Revised Subset.*problem or answer.*rationale-only.*excluded.*text-only.*avg5.*judge scripts.*dataset paths.*unset.*solver.*interactive.*provider base URL.*complete endpoint\/model mapping.*access conditions.*artifacts.*unavailable/isu);

  const text = readDetail('HLEtext');
  assert.match(text.paper_url, /2602\.10604v2/u);
  assert.match(text.drawio_review_note, /26dca2e253b405105b4c3d8c2f5af06f86f90c66.*5a81a4c7271a2a2a312b9a690f0c2fde837e4c29.*21d85a5f6c291f3f138da0bc09979af43345251a.*ab446a3de5e171ea341227e24bb1f090e1b771f7.*reporting label.*not a separate dataset.*exact selector.*at most one model.*row count.*not disclosed.*gpt-oss-120b/isu);
});

test('keeps every A10w fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light assets with bounded xl label geometry for A10w', () => {
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
      const arch = readArch(id, language);
      const fixedXlGeometries = drawio.match(/<mxGeometry[^>]*width="200" height="100"[^>]*\/>/gu) ?? [];
      assert.equal(fixedXlGeometries.length, arch.nodes.length, `${id}.${language} fixed xl geometry`);
      for (const node of arch.nodes) {
        assert.equal(node.size, 'xl', `${id}.${language}.${node.id} size`);
        const lines = node.label.split(/\r?\n/u);
        assert.ok(lines.length <= 6, `${id}.${language}.${node.id} line count`);
        if (node.type === 'database') {
          assert.ok(lines.length <= 5, `${id}.${language}.${node.id} database line count`);
        }
        for (const line of lines) {
          if (language === 'en') {
            assert.ok([...line].length <= 38, `${id}.${language}.${node.id} line length: ${line}`);
          }
          assert.ok(visibleText.includes(line), `${id}.${language} SVG label: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces A10w SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10w-exports-'));
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

        execFileSync(drawioDesktop, ['-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`], { stdio: 'pipe' });
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

test('strictly rebuilds and normalizes all eight A10w specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10w-'));
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
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
