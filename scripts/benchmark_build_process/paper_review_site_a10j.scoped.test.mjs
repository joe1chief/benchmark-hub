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
const benchmarkIds = ['DROP', 'DUDE', 'DeR2', 'DeepResearchBench'];
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

test('keeps all four A10j packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('separates the DROP paper construction and paper metric text from the released evaluator', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DROP', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /1903\.00161v2.*39d2278.*052353e.*(?:paper.*released|论文.*发布)/isu);
    assert.match(nodes.get('passages')?.label ?? '', /Wikipedia.*NFL.*history.*20.*7,?000|Wikipedia.*NFL.*历史.*20.*7,?000/isu);
    assert.match(nodes.get('hit')?.label ?? '', /AMT.*5.*12.*add.*subtract.*min.*max.*count.*selection.*comparison|AMT.*5.*12.*加减.*最大.*最小.*计数.*选择.*比较/isu);
    assert.match(nodes.get('adversarial')?.label ?? '', /real-time.*BiDAF.*only.*fails|实时.*BiDAF.*仅.*答错/isu);
    assert.match(nodes.get('answer_types')?.label ?? '', /passage.*question.*span.*date.*number.*explicit unit|段落.*问题.*片段.*日期.*数字.*(?:写明|明确).*单位/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /96,?567.*6,?735/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /final release|最终发布/isu);
    assert.match(nodes.get('split')?.label ?? '', /77,?409.*9,?536.*9,?622.*5,?565.*582.*588/isu);
    assert.match(nodes.get('validate')?.label ?? '', /2.*additional.*0\.7%.*0\.74.*0\.81.*0\.62.*0\.65|2.*附加.*0\.7%.*0\.74.*0\.81.*0\.62.*0\.65/isu);
    assert.match(nodes.get('paper_metric')?.label ?? '', /paper v2.*greedy.*one-to-one.*number mismatch.*0.*max.*gold|论文 v2.*贪心.*一对一.*数字不匹配.*0.*多.*答案.*最大/isu);
    assert.match(nodes.get('release_metric')?.label ?? '', /AllenNLP v0\.9\.0.*(?:optimal.*Hungarian|Hungarian.*optimal).*mean.*max.*gold|AllenNLP v0\.9\.0.*(?:匈牙利.*最优|最优.*匈牙利).*均值.*多.*答案.*最大/isu);
    assert.ok(edges.has('answer_types->split:primary'));
    assert.ok(edges.has('split->validate:primary'));
    assert.ok(edges.has('validate->dataset:primary'));
    assert.ok(edges.has('dataset->predict:primary'));
    assert.equal(edges.has('answer_types->dataset:primary'), false);
    assert.equal(edges.has('dataset->split:primary'), false);
    assert.ok(edges.has('metric_boundary->paper_metric:primary'));
    assert.ok(edges.has('metric_boundary->release_metric:primary'));
    assert.ok(edges.has('paper_metric->report:primary'));
    assert.ok(edges.has('release_metric->report:primary'));
  }
});

test('keeps DUDE document provenance, phased annotation, split, and all three metrics exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DUDE', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2305\.08455v3.*b366217.*1\.0\.8.*8bd6de/isu);
    assert.match(nodes.get('sources')?.label ?? '', /archive\.org.*Wikimedia Commons.*DocumentCloud.*manual|archive\.org.*Wikimedia Commons.*DocumentCloud.*人工/isu);
    assert.match(nodes.get('document_gate')?.label ?? '', /public domain.*permissive.*visual.*privacy.*legal|公版.*宽松.*视觉.*隐私.*法律/isu);
    assert.match(nodes.get('documents')?.label ?? '', /Table 1.*5,?019.*1860.*2022.*5\.72|表 1.*5,?019.*1860.*2022.*5\.72/isu);
    assert.doesNotMatch(nodes.get('documents')?.label ?? '', /41,?541/u);
    assert.match(nodes.get('phase1')?.label ?? '', /up to five.*extractive.*abstractive.*list.*evidence|至多 5.*抽取.*摘要.*列表.*证据/isu);
    assert.match(nodes.get('na')?.label ?? '', /non-answerable.*predominantly.*linguists|不可回答.*主要.*语言学/isu);
    assert.match(nodes.get('filter')?.label ?? '', /exclude invalid.*length.*character.*type|剔除无效.*长度.*字符.*类型/isu);
    assert.match(nodes.get('duplicate_review')?.label ?? '', /duplicate.*near-duplicate.*manual.*Phase 3|重复.*近重复.*人工.*阶段三/isu);
    assert.match(nodes.get('agreement')?.label ?? '', /inter-answer ANLS.*> ?0\.8|答案间 ANLS.*> ?0\.8/isu);
    assert.match(nodes.get('direct')?.label ?? '', /high-agreement.*skip Phase 3 only|高一致性.*仅跳过阶段三/isu);
    assert.match(nodes.get('phase3')?.label ?? '', /Best MTurker.*overrule.*5.*PhD linguists|优质众包员.*推翻.*5.*语言学博士/isu);
    assert.match(nodes.get('release')?.label ?? '', /41,?541.*42\.39%.*38\.25%.*6\.62%.*12\.74%/isu);
    assert.match(nodes.get('split')?.label ?? '', /Table 2.*4,?974.*41,?491.*3,?010.*749.*1,?215.*23,?728.*6,?315.*11,?448|表 2.*4,?974.*41,?491.*3,?010.*749.*1,?215.*23,?728.*6,?315.*11,?448/isu);
    assert.match(nodes.get('diagnostics')?.label ?? '', /Phase 4.*review.*correct.*test.*530.*2,?462|阶段四.*复核.*修正.*测试.*530.*2,?462/isu);
    assert.match(nodes.get('artifact')?.label ?? '', /v1\.0\.8.*5,?017.*(?:unique docIds|唯一 docId).*41,?456.*(?:annotation rows|标注行).*41,?453.*(?:unique questionIds|唯一 questionId).*3.*(?:duplicates?|重复).*Zenodo.*SHA256.*[a-f0-9]{7}/isu);
    assert.match(nodes.get('anls')?.label ?? '', /paper.*(?:\u00a7|section) ?3\.5.*ECE.*(?:correct|correctness).*ANLS *> ?0\.5|论文.*(?:\u00a7|第)? ?3\.5.*ECE.*正确.*ANLS *> ?0\.5/isu);
    assert.match(nodes.get('anls')?.label ?? '', /NLS.*1.*LD.*max/isu);
    assert.match(nodes.get('anls')?.label ?? '', /Appendix.*Eq.*3.*per-answer.*NLS *≥ ?0\.5|附录.*公式 *3.*逐答案.*NLS *≥ ?0\.5/isu);
    assert.match(nodes.get('anls')?.label ?? '', /max.*gold|多.*答案.*最大/isu);
    assert.match(nodes.get('anls')?.label ?? '', /list.*Hungarian.*order-invariant|列表.*匈牙利.*顺序无关/isu);
    assert.match(nodes.get('calibration')?.label ?? '', /DUDEeval.*8bd6de.*ANLS.*≥ ?0\.5.*ECE.*100.*equal-mass.*constant.*equal-range.*AURC.*absent|DUDEeval.*8bd6de.*ANLS.*≥ ?0\.5.*ECE.*100.*等样本量.*恒定.*等区间.*AURC.*未实现/isu);
    assert.ok(edges.has('filter->phase2:primary'));
    assert.ok(edges.has('filter->duplicate_review:primary'));
    assert.ok(edges.has('duplicate_review->phase3:primary'));
    assert.ok(edges.has('phase1->na:primary'));
    assert.ok(edges.has('na->release:primary'));
    assert.ok(edges.has('agreement->direct:primary'));
    assert.ok(edges.has('direct->release:primary'));
    assert.equal(edges.has('phase1->direct:primary'), false);
    assert.ok(edges.has('split->artifact:primary'));
    assert.ok(edges.has('split->diagnostics:data'));
    assert.ok(edges.has('diagnostics->artifact:data'));
    assert.equal(edges.has('split->diagnostics:primary'), false);
    assert.equal(edges.has('diagnostics->artifact:primary'), false);
    assert.ok(edges.has('artifact->evaluation:primary'));
    assert.ok(edges.has('evaluation->anls:primary'));
    assert.ok(edges.has('evaluation->calibration:primary'));
  }
});

test('keeps DeR2 as a frozen controlled sandbox with the exact two-run protocol and loss gaps', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DeR2', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2601\.21937v2.*95a8aba.*b0a84aed.*3473fab/isu);
    assert.match(nodes.get('papers')?.label ?? '', /2023.*2025.*theory.*exclude.*applied|2023.*2025.*理论.*排除.*应用/isu);
    assert.match(nodes.get('experts')?.label ?? '', /81.*PhD.*specialt.*2,?500.*350|81.*博士.*专业.*2,?500.*350/isu);
    assert.match(nodes.get('item')?.label ?? '', /human.*instruction.*concepts.*CoT.*answer.*document set|人工.*指令.*概念.*推理链.*答案.*文档集/isu);
    assert.match(nodes.get('calibrate')?.label ?? '', /three.*instruction-only.*3\/3.*wrong.*concepts-only.*(?:one|1).*correct.*(?:one|1).*wrong|三次.*仅指令.*3\/3.*错误.*仅概念.*(?:一次|1).*正确.*(?:一次|1).*错误/isu);
    assert.match(nodes.get('calibration_gate')?.label ?? '', /all three.*correct.*doc-set retest.*discard.*(?:fails at least twice|2.*failures).*revise|三次全对.*文档集复测.*丢弃.*至少两次失败.*修改/isu);
    assert.match(nodes.get('docs')?.label ?? '', /reference.*(?:one|≥?1) related.*per concept.*noise.*no.*answer leakage|参考文献.*每个概念.*至少一篇相关.*噪声.*答案泄漏/isu);
    assert.match(nodes.get('review')?.label ?? '', /(?:at least three|≥3).*accepted.*scientific.*unique answer.*rerun.*(?:document.*audit|audit.*document)|至少(?:有)? 3 条通过.*科学.*唯一答案.*重跑.*(?:文档.*复核|复核.*文档)/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /300.*frozen|300.*冻结/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /paper.*6\.5|论文.*6\.5/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /TSV.*1,?111.*666.*1,?777/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /5\.9233.*no train.*dev.*test|5\.9233.*无训练.*开发.*测试/isu);
    assert.match(nodes.get('regimes')?.label ?? '', /three.*prompt.*procedure.*scoring.*Instruction-only.*Concepts-only.*Related-only.*Full-set|三套.*提示.*流程.*评分.*一致.*仅指令.*仅概念.*仅相关文档.*完整文档集/isu);
    assert.doesNotMatch(nodes.get('regimes')?.label ?? '', /same prompt|提示.*保持一致/iu);
    assert.match(nodes.get('truncate')?.label ?? '', /30,?000.*first half.*last half.*marker|30,?000.*前半.*后半.*标记/isu);
    assert.match(nodes.get('run')?.label ?? '', /no web.*temperature ?= ?1.*top_p ?= ?0\.7.*twice.*average|禁止联网.*温度 ?= ?1.*top_p ?= ?0\.7.*两次.*平均/isu);
    assert.match(nodes.get('judge')?.label ?? '', /doubao-seed-1-6-251015.*numeric.*symbolic.*checklist|doubao-seed-1-6-251015.*数值.*符号.*清单/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /Knowledge Loss.*Retrieval Loss.*Noise-induced Loss.*Document-to-concept Loss.*RLoss.*Concepts-only.*Full-set|知识损失.*检索损失.*噪声诱发损失.*文档到概念损失.*RLoss.*仅概念.*完整文档集/isu);
    assert.doesNotMatch(nodes.get('metrics')?.label ?? '', /KLoss|D2C|NLoss/u);
    assert.ok(edges.has('calibration_gate->item:data'));
    for (const regime of ['instruction', 'concepts', 'related', 'full']) {
      assert.ok(edges.has(`regimes->${regime}:primary`));
      assert.ok(edges.has(`${regime}->truncate:primary`));
    }
  }
});

test('keeps DeepResearch Bench final-report evaluation separate from agent trajectories and post-paper judge drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DeepResearchBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2506\.11763v1.*214741e.*62b197a.*f7d27cd/isu);
    assert.match(nodes.get('version_drift')?.label ?? '', /post-paper.*469cce5.*2026-05-11.*GPT-5\.5.*GPT-5\.4-mini|论文后.*469cce5.*2026-05-11.*GPT-5\.5.*GPT-5\.4-mini/isu);
    assert.match(nodes.get('queries')?.label ?? '', /96,?147.*web-search-enabled.*logs|96,?147.*联网搜索.*日志/isu);
    assert.match(nodes.get('privacy')?.label ?? '', /user IDs.*IP.*session metadata|用户标识.*IP.*会话元数据/isu);
    assert.match(nodes.get('filter')?.label ?? '', /DeepSeek-V3-0324.*multi-round.*search.*report.*44,?019|DeepSeek-V3-0324.*多轮.*搜索.*报告.*44,?019/isu);
    assert.match(nodes.get('distribution')?.label ?? '', /WebOrganizer.*DeepSeek-V3-0324.*22/isu);
    assert.match(nodes.get('experts')?.label ?? '', /PhD.*senior.*5.*years|博士.*资深.*5.*年/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /100.*22.*50 Chinese.*50 English.*each task.*monolingual.*no train.*dev.*test|100.*22.*中文 50.*英文 50.*每题.*单语.*无训练.*开发.*测试/isu);
    assert.match(nodes.get('agent')?.label ?? '', /system-defined.*trajectory.*not.*labeled.*final.*cited.*report|轨迹.*系统自行决定.*不标注.*最终.*引用.*报告/isu);
    assert.match(nodes.get('race_rubric')?.label ?? '', /Gemini-2\.5-pro.*COMP.*DEPTH.*INST.*READ.*T trials.*criteria.*sum.*1|Gemini-2\.5-pro.*COMP.*DEPTH.*INST.*READ.*T 次.*标准.*和.*1/isu);
    assert.match(nodes.get('race_score')?.label ?? '', /(?:April 2025|2025 年 4 月).*S_final.*S_int\(tgt\).*S_int\(tgt\).*S_int\(ref\)/isu);
    assert.match(nodes.get('fact_extract')?.label ?? '', /Gemini-2\.5-flash.*statement[–-]URL.*same fact.*same URL.*one|Gemini-2\.5-flash.*陈述.*链接.*同一事实.*同一链接.*一条/isu);
    assert.match(nodes.get('fact_verify')?.label ?? '', /Jina Reader.*binary.*support.*not support|Jina Reader.*二元.*支持.*不支持/isu);
    assert.match(nodes.get('fact_metrics')?.label ?? '', /Acc_t ?= ?N_s,t\/N_u,t.*zero.*C\. Acc.*mean.*E\. Cit.*sum.*N_s,t.*\|T\||Acc_t ?= ?N_s,t\/N_u,t.*零.*C\. Acc.*均值.*E\. Cit.*求和.*N_s,t.*\|T\|/isu);
    assert.match(nodes.get('human')?.label ?? '', /50 Chinese.*4 agents.*3 experts.*70\+.*225.*(?:37.*ICC|ICC.*37)|50.*中文.*4.*智能体.*3.*专家.*70\+.*225.*(?:37.*ICC|ICC.*37)/isu);
    assert.ok(edges.has('evidence->version_drift:data'));
    assert.equal(edges.has('version_drift->race_rubric:primary'), false);
    assert.ok(edges.has('route->race_rubric:primary'));
    assert.ok(edges.has('route->fact_extract:primary'));
    assert.ok(edges.has('race_score->report:primary'));
    assert.ok(edges.has('fact_metrics->report:primary'));
    assert.ok(edges.has('human->report:data'));
  }
});

test('pins paper and artifact revisions plus version boundaries in A10j details', () => {
  const drop = readDetail('DROP');
  assert.match(drop.paper_url, /1903\.00161v2/u);
  assert.match(drop.drawio_review_note, /39d2278.*052353e.*6,?735.*greedy.*Hungarian/isu);

  const dude = readDetail('DUDE');
  assert.match(dude.paper_url, /2305\.08455v3/u);
  assert.match(dude.scale, /5,?019.*41,?541.*4,?974.*41,?491.*5,?017.*41,?456.*41,?453.*3.*重复/isu);
  assert.match(dude.scale_en, /5,?019.*41,?541.*4,?974.*41,?491.*5,?017.*41,?456.*41,?453.*3.*duplicate/isu);
  assert.match(dude.drawio_review_note, /b366217.*1\.0\.8.*4f883956.*5,?019.*source documents.*41,?541.*annotation output.*4,?974.*41,?491.*5,?017.*unique docIds.*41,?456.*annotation rows.*41,?453.*unique questionIds.*3.*duplicate/isu);
  assert.match(dude.drawio_review_note, /Phase 4.*optional.*branch|optional Phase 4.*branch/isu);
  assert.match(dude.drawio_review_note, /Section 3\.5.*ECE correctness.*ANLS *> ?0\.5.*Appendix Equation 3.*answer-pair NLS.*NLS *>= ?0\.5.*8bd6de.*ECE correctness.*ANLS *>= ?0\.5.*equal-mass.*AURC/isu);

  const der2 = readDetail('DeR2');
  assert.match(der2.paper_url, /2601\.21937v2/u);
  assert.match(der2.metric, /答案.*知识损失.*检索损失.*噪声诱发损失.*文档到概念损失.*RLoss.*仅概念.*完整文档集/isu);
  assert.match(der2.metric_en, /Answer.*Knowledge Loss.*Retrieval Loss.*Noise-induced Loss.*Document-to-concept Loss.*RLoss.*Concepts-only.*Full-set/isu);
  assert.doesNotMatch(`${der2.metric}\n${der2.metric_en}`, /KLoss|D2C|NLoss/u);
  assert.match(der2.drawio_review_note, /95a8aba.*b0a84aed.*3473fab.*6\.5.*1,?777.*5\.9233.*three distinct prompt.*temperature=1.*top_p=0\.7.*twice.*RLoss/isu);

  const deep = readDetail('DeepResearchBench');
  assert.match(deep.paper_url, /2506\.11763v1/u);
  assert.match(deep.drawio_review_note, /214741e.*62b197a.*f7d27cd/isu);
  assert.match(deep.drawio_review_note, /S_final.*N_s,t/isu);
  assert.match(deep.drawio_review_note, /469cce5.*post-paper/isu);
  assert.match(deep.language, /中文.*英文/u);
  assert.match(deep.language_en, /Chinese.*English/iu);
  assert.match(deep.intro_en, /monolingual.*50 Chinese.*50 English|50 Chinese.*50 English.*monolingual/isu);
  assert.doesNotMatch(deep.intro_en, /bilingual/iu);
});

test('keeps every A10j fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10j', () => {
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

test('reproduces A10j SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10j-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x',
          '-f', 'svg',
          '--svg-theme', 'light',
          '-o', generatedSvg,
          `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(
          generatedSvg,
          `${base}.svg`,
          `${id}.${language}.svg export freshness`,
        );

        execFileSync(drawioDesktop, [
          '-x',
          '-f', 'png',
          '-o', generatedPng,
          `${base}.drawio`,
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

test('strictly rebuilds and normalizes all eight A10j specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10j-'));
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
