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
const benchmarkIds = ['DynaMath', 'EMMA', 'ERQA', 'EVMbench'];
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
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

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

test('keeps all four A10l packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('locks DynaMath source accounting, educational levels, independent RC track, and robustness formulas', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('DynaMath', language));
    const edges = edgeSet(readArch('DynaMath', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2411\.00836v2.*598c3c3/isu);
    assert.match(nodes.get('sources')?.label ?? '', /MathVista.*107.*MATH-V.*27.*45.*48.*236.*38/isu);
    assert.match(nodes.get('seeds')?.label ?? '', /501.*227.*274.*63.*277.*161.*296.*174.*31/isu);
    assert.match(nodes.get('program')?.label ?? '', /college.*STEM|大学.*STEM/isu);
    assert.match(nodes.get('variations')?.label ?? '', /numerical.*geometric.*function.*color.*symbolic.*graph.*context|数值.*几何.*函数.*颜色.*符号.*图结构.*情境/isu);
    assert.match(nodes.get('render')?.label ?? '', /470.*Matplotlib.*Pyglet.*31|Matplotlib.*Pyglet.*470.*31/isu);
    assert.match(nodes.get('verify')?.label ?? '', /manual.*review.*specific.*checklist.*not disclosed|人工.*复核.*具体.*清单.*未披露/isu);
    assert.match(nodes.get('variants')?.label ?? '', /501.*10.*5,?010/isu);
    assert.match(nodes.get('rc_sample')?.label ?? '', /independent.*501.*5.*not.*501.*10|独立.*501.*5.*不属于.*501.*10/isu);
    assert.match(nodes.get('extract')?.label ?? '', /prompt.*template.*program.*GT|提示.*模板.*程序.*标准答案/isu);
    assert.match(nodes.get('average')?.label ?? '', /Aavg.*1\/N.*1\/M.*Ans.*GT.*N=501.*M=10/isu);
    assert.match(nodes.get('worst')?.label ?? '', /Awst.*1\/N.*min.*Ans.*GT.*all 10|Awst.*1\/N.*min.*Ans.*GT.*10.*全对/isu);
    assert.match(nodes.get('robustness')?.label ?? '', /RR.*Awst.*Aavg/isu);
    assert.match(nodes.get('consistency')?.label ?? '', /RC\(i,j\).*1\/K.*Ans.*K=5|RC\(i,j\).*1\/K.*Ans.*K=5/isu);
    assert.match(nodes.get('icl_proxy')?.label ?? '', /H\.6.*in-context learning.*proxy.*not formal decontamination|H\.6.*上下文学习.*代理.*非正式去污染/isu);
    assert.ok(edges.has('verify->rc_sample:data'));
    assert.ok(edges.has('rc_sample->metrics:primary'));
    assert.ok(edges.has('variants->icl_proxy:data'));
    assert.ok(edges.has('icl_proxy->report:data'));
    for (const metric of ['average', 'worst', 'robustness', 'consistency']) {
      assert.ok(edges.has(`metrics->${metric}:primary`));
      assert.ok(edges.has(`${metric}->report:primary`));
    }
  }
});

test('locks EMMA post-filter RAVEN supplementation, independent coding construction, and paper evaluation scope', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('EMMA', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /Enhanced MultiModal.*reAsoning.*2501\.05444v1.*4725995.*6c87aec/isu);
    assert.match(nodes.get('sources')?.label ?? '', /MathVista.*Math-Vision.*OlympiadBench.*EXAMS-V.*MMMU/isu);
    assert.doesNotMatch(nodes.get('sources')?.label ?? '', /RAVEN/iu);
    assert.match(nodes.get('filter')?.label ?? '', /(?:caption.*GPT-4o|GPT-4o.*caption).*Llama-3-70B.*GPT-4o.*Qwen2-72B.*10.*(?:≥5|5.*correct)|GPT-4o.*描述.*Llama-3-70B.*GPT-4o.*Qwen2-72B.*10.*(?:≥5|5.*答对)/isu);
    assert.match(nodes.get('raven')?.label ?? '', /RAVEN.*supplement.*after.*filter.*not.*three-model|RAVEN.*筛选后.*补充.*不经过.*三模型/isu);
    assert.match(nodes.get('retained')?.label ?? '', /992.*Math 892.*Physics 80.*Chemistry 20|992.*数学 892.*物理 80.*化学 20/isu);
    assert.match(nodes.get('physics_new')?.label ?? '', /76.*Learn AP Physics.*Khan Academy|76.*Learn AP Physics.*Khan Academy/isu);
    assert.match(nodes.get('chemistry_new')?.label ?? '', /1,?156.*RDKit.*SMiCRM.*PhD|1,?156.*RDKit.*SMiCRM.*博士/isu);
    assert.match(nodes.get('coding_sources')?.label ?? '', /CharXiv.*Matplotlib.*experience|CharXiv.*Matplotlib.*经验/isu);
    assert.match(nodes.get('coding_seeds')?.label ?? '', /47.*seed|47.*种子/isu);
    assert.match(nodes.get('coding_variants')?.label ?? '', /four.*variation.*188.*47.*sets|四.*变化.*188.*47.*组/isu);
    assert.match(nodes.get('coding_questions')?.label ?? '', /564.*188.*188.*94.*94/isu);
    assert.match(nodes.get('coding_labels')?.label ?? '', /manual.*categor|人工.*分类/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /2,?788.*Math 892.*Physics 156.*Chemistry 1,?176.*Coding 564|2,?788.*数学 892.*物理 156.*化学 1,?176.*编程 564/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /2,?002.*786.*298/isu);
    assert.match(nodes.get('paper_scope')?.label ?? '', /EMMA-mini.*100.*subject.*400.*human.*o1.*mini|EMMA-mini.*每学科.*100.*400.*人工.*o1.*mini/isu);
    assert.match(nodes.get('paper_eval')?.label ?? '', /direct.*CoT.*except.*o1.*Gemini 2\.0 Flash Thinking.*accuracy.*without.*MLLM judge|直接.*CoT.*不适用.*o1.*Gemini 2\.0 Flash Thinking.*准确率.*不使用.*MLLM.*裁判/isu);
    assert.match(nodes.get('release_eval')?.label ?? '', /4725995.*default.*SymPy.*numeric.*optional.*--gpt_eval.*chatgpt-4o-latest|4725995.*默认.*SymPy.*数值.*可选.*--gpt_eval.*chatgpt-4o-latest/isu);
    assert.ok(edges.has('filter->taxonomy:primary'));
    assert.ok(edges.has('taxonomy->retained:primary'));
    assert.ok(edges.has('raven->retained:primary'));
    assert.ok(!edges.has('filter->raven:primary'));
    for (const branch of ['physics_new', 'chemistry_new']) {
      assert.ok(edges.has(`taxonomy->${branch}:primary`));
      assert.ok(edges.has(`${branch}->merge:primary`));
    }
    assert.ok(edges.has('coding_sources->coding_seeds:primary'));
    assert.ok(edges.has('coding_seeds->coding_variants:primary'));
    assert.ok(edges.has('coding_variants->coding_questions:primary'));
    assert.ok(edges.has('coding_questions->coding_labels:primary'));
    assert.ok(edges.has('coding_labels->merge:primary'));
    assert.ok(edges.has('retained->merge:primary'));
    assert.ok(edges.has('evaluation_boundary->paper_scope:primary'));
    assert.ok(edges.has('paper_scope->paper_eval:primary'));
    assert.ok(edges.has('evaluation_boundary->release_eval:primary'));
  }
});

test('locks ERQA TFRecord suffix, original-question paper prompt, API-specific limits, and full-response exact match', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ERQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2503\.20020v1.*5bba488.*1974f5e5/isu);
    assert.match(nodes.get('images')?.label ?? '', /authors.*OXE.*UMI.*MECCANO.*HoloAssist.*EGTEA Gaze\+|作者.*OXE.*UMI.*MECCANO.*HoloAssist.*EGTEA Gaze\+/isu);
    assert.match(nodes.get('images')?.label ?? '', /selection.*authoring.*not disclosed|筛选.*出题.*未披露/isu);
    assert.match(nodes.get('manual_qc')?.label ?? '', /all 400.*manually labeled.*correctness.*quality|400.*全部.*人工标注.*正确性.*质量/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /84.*72.*66.*55.*38.*37.*34.*14/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /400.*four-choice.*28%.*multi-image|400.*四选一.*28%.*多图/isu);
    assert.match(nodes.get('artifact')?.label ?? '', /TFRecord.*400.*91,?402,?921.*CC BY 4\.0/isu);
    assert.match(nodes.get('direct_suffix')?.label ?? '', /400\/400.*Please answer directly with only.*letter of the correct option.*nothing else|400\/400.*Please answer directly with only.*letter of the correct option.*nothing else/isu);
    assert.match(nodes.get('paper_direct')?.label ?? '', /without-CoT.*original TFRecord question.*no additional direct prompt|无 CoT.*原始 TFRecord 问题.*不另造直接提示/isu);
    assert.match(nodes.get('paper_cot')?.label ?? '', /Reason step by step about the answer.*show your work.*final answer|逐步推理.*展示.*过程.*最终答案/isu);
    assert.match(nodes.get('release_harness')?.label ?? '', /5bba488.*original TFRecord question.*does not.*CoT|5bba488.*原始 TFRecord 问题.*不自动.*CoT/isu);
    assert.match(nodes.get('openai_settings')?.label ?? '', /OpenAI.*temperature 0.*max_tokens=300|OpenAI.*温度 0.*max_tokens=300/isu);
    assert.match(nodes.get('gemini_settings')?.label ?? '', /Gemini.*temperature 0.*max_output_tokens=500|Gemini.*温度 0.*max_output_tokens=500/isu);
    assert.match(nodes.get('normalize')?.label ?? '', /full response.*remove periods.*trim.*lower.*exact match|完整响应.*移除句点.*去首尾空白.*小写.*精确匹配/isu);
    assert.doesNotMatch(nodes.get('normalize')?.label ?? '', /final option|最终选项/iu);
    assert.match(nodes.get('metrics')?.label ?? '', /overall.*single-image.*multi-image.*question type|总体.*单图.*多图.*问题类型/isu);
    assert.ok(edges.has('images->curate:primary'));
    assert.ok(edges.has('curate->manual_qc:primary'));
    assert.ok(edges.has('artifact->direct_suffix:primary'));
    assert.ok(edges.has('direct_suffix->protocol:primary'));
    assert.ok(edges.has('protocol->paper_direct:primary'));
    assert.ok(edges.has('protocol->paper_cot:primary'));
    assert.ok(edges.has('protocol->release_harness:primary'));
    assert.ok(edges.has('release_harness->openai_settings:primary'));
    assert.ok(edges.has('release_harness->gemini_settings:primary'));
    assert.ok(edges.has('openai_settings->normalize:primary'));
    assert.ok(edges.has('gemini_settings->normalize:primary'));
    for (const branch of ['paper_direct', 'paper_cot', 'normalize']) assert.ok(edges.has(`${branch}->metrics:primary`));
  }
});

test('locks EVMbench version boundary, source gating, Detect awards, unpinned judge, and bootstrap formulas', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('EVMbench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /CDN.*2026-02-19.*120.*45.*24.*arXiv.*2026-03-05.*117.*44.*23/isu);
    assert.match(nodes.get('code4rena')?.label ?? '', /Code4rena/iu);
    assert.match(nodes.get('tempo')?.label ?? '', /Tempo/iu);
    assert.match(nodes.get('screen')?.label ?? '', /o3.*loss-of-funds.*Solidity.*July 2023.*license|o3.*资金损失.*Solidity.*2023.*7 月.*许可/isu);
    assert.match(nodes.get('quality')?.label ?? '', /Code4rena.*OtterSec.*reproducible.*tests.*exploit.*manual rollout|Code4rena.*OtterSec.*可复现.*测试.*利用.*人工试跑/isu);
    assert.match(nodes.get('tempo_qc')?.label ?? '', /Tempo.*separate.*implement|Tempo.*独立.*实现/isu);
    assert.match(nodes.get('release')?.label ?? '', /2d5c7ab.*8ea5c65.*runnable.*117.*44.*23.*task_info\.csv.*120.*stale|2d5c7ab.*8ea5c65.*可运行.*117.*44.*23.*task_info\.csv.*120.*陈旧/isu);
    assert.match(nodes.get('oracles')?.label ?? '', /oracle patch.*hidden exploit.*deploy script.*oracle transaction|标准补丁.*隐藏利用.*部署脚本.*标准交易/isu);
    assert.match(nodes.get('environment')?.label ?? '', /Ubuntu 24\.04.*Docker.*no web.*separate.*grader|Ubuntu 24\.04.*Docker.*禁网.*评分.*独立/isu);
    assert.match(nodes.get('detect_grade')?.label ?? '', /gpt-5 alias.*reasoning.*high.*snapshot.*not pinned.*ground[- ]truth.*recall.*false positives.*not penalized|gpt-5.*别名.*推理.*high.*快照.*未固定.*标准漏洞.*召回.*误报.*不惩罚/isu);
    assert.match(nodes.get('detect_reward')?.label ?? '', /financial reward.*matched vuln.*historical.*payout median.*missing.*invitational.*Tempo.*\$0.*detect_award.*detect_max_award.*award_rate_metric.*Σ award.*Σ max award|金融奖励.*命中漏洞.*历史.*奖励中位数.*缺失.*邀请赛.*Tempo.*\$0.*detect_award.*detect_max_award.*award_rate_metric.*Σ 奖励.*Σ 最大奖励/isu);
    assert.doesNotMatch(arch.nodes.map(node => node.label).join('\n'), /2025-08-07/u);
    assert.match(nodes.get('patch_grade')?.label ?? '', /protected tests.*existing tests.*pass.*hidden exploit.*fail|受保护测试.*原有测试.*通过.*隐藏利用.*失败/isu);
    assert.match(nodes.get('exploit_grade')?.label ?? '', /redeploy.*replay.*Rust.*state.*balance.*event.*Veto RPC|重新部署.*重放.*Rust.*状态.*余额.*事件.*Veto RPC/isu);
    assert.match(nodes.get('attempt_mean')?.label ?? '', /per-vulnerability.*mean_v.*1\/3.*three.*attempt|每个漏洞.*mean_v.*1\/3.*3 次.*尝试/isu);
    assert.match(nodes.get('headline')?.label ?? '', /sum.*mean_v.*sum.*max_v|Σ.*mean_v.*Σ.*max_v/isu);
    assert.match(nodes.get('bootstrap')?.label ?? '', /flat.*vulnerabilit.*replacement.*10,?000.*2\.5.*97\.5|扁平.*漏洞.*有放回.*10,?000.*2\.5.*97\.5/isu);
    assert.match(nodes.get('report')?.label ?? '', /mode.*score.*cost.*tokens|模式.*得分.*成本.*token/isu);
    assert.ok(edges.has('code4rena->screen:primary'));
    assert.ok(edges.has('screen->quality:primary'));
    assert.ok(edges.has('quality->merge:primary'));
    assert.ok(edges.has('tempo->tempo_qc:primary'));
    assert.ok(edges.has('tempo_qc->merge:primary'));
    assert.ok(!edges.has('tempo->screen:primary'));
    for (const mode of ['detect', 'patch', 'exploit']) {
      assert.ok(edges.has(`modes->${mode}_agent:primary`));
      assert.ok(edges.has(`${mode}_agent->${mode}_grade:primary`));
      assert.ok(edges.has(`${mode}_grade->attempt_mean:primary`));
    }
    assert.ok(edges.has('detect_grade->detect_reward:primary'));
    assert.ok(edges.has('detect_reward->bootstrap:data'));
    assert.ok(edges.has('attempt_mean->headline:primary'));
    assert.ok(edges.has('headline->bootstrap:primary'));
    assert.ok(edges.has('bootstrap->report:primary'));
  }
});

test('pins paper and official artifact revisions plus release boundaries in A10l details', () => {
  const dyna = readDetail('DynaMath');
  assert.match(dyna.paper_url, /2411\.00836v2/u);
  assert.match(dyna.drawio_review_note, /598c3c3.*63.*277.*161.*501.*5,?010.*independent.*501.*5.*H\.6.*proxy.*not formal decontamination/isu);
  assert.match(dyna.difficulty_en, /Elementary.*undergraduate/iu);
  assert.doesNotMatch(`${dyna.l2_en} ${dyna.difficulty_en}`, /competition|frontier/iu);
  assert.match(dyna.task_type_en, /multiple-choice.*free-form|free-form.*multiple-choice/isu);

  const emma = readDetail('EMMA');
  assert.match(emma.paper_url, /2501\.05444v1/u);
  assert.match(emma.drawio_review_note, /Enhanced MultiModal reAsoning.*4725995.*6c87aec.*RAVEN.*after.*filter.*47.*188.*564.*EMMA-mini.*400.*o1.*Gemini 2\.0 Flash Thinking/isu);

  const erqa = readDetail('ERQA');
  assert.match(erqa.paper_url, /2503\.20020v1/u);
  assert.match(erqa.drawio_review_note, /5bba488.*1974f5e5.*91,?402,?921.*400\/400.*Please answer directly with only.*original question.*max_tokens=300.*max_output_tokens=500.*full response.*exact match/isu);
  assert.doesNotMatch(erqa.drawio_review_note, /parse.*final option|extract.*final option/iu);

  const evm = readDetail('EVMbench');
  assert.match(evm.arxiv_pdf_url, /2603\.04915v1/u);
  assert.match(evm.drawio_review_note, /2026-02-19.*120.*45.*24.*2026-03-05.*117.*44.*23.*2d5c7ab.*8ea5c65.*task_info\.csv.*stale.*gpt-5.*high.*snapshot.*not pinned.*median.*payout.*missing.*invitational.*Tempo.*\$0.*detect_award.*detect_max_award.*award_rate_metric.*sum.*mean_v.*sum.*max_v/isu);
  assert.match(evm.metric_en, /Vulnerability Recall.*Detect Award Rate.*Patch Success Rate.*Exploit Success Rate/isu);
  assert.match(evm.metric, /漏洞召回率.*Detect 奖励率.*修补成功率.*利用成功率/isu);
  assert.doesNotMatch(evm.drawio_review_note, /2025-08-07/u);
});

test('keeps every A10l fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10l', () => {
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

test('reproduces A10l SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10l-exports-'));
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

test('strictly rebuilds and normalizes all eight A10l specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10l-'));
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
