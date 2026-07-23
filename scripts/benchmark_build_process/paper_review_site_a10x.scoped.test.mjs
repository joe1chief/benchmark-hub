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
const benchmarkIds = ['HMMT-25', 'HR-Bench', 'HalluEval', 'HalluQA'];
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

test('keeps all four A10x packages bilingual with identical typed topology and academic styling', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence node`);
      assert.ok(
        spec.nodes.some(node => node.id === 'artifact_boundary'),
        `${id}.${language} artifact boundary`,
      );
    }
  }
});

test('locks HMMT-25 extraction, four-run pass@1, parser audit, and revision boundary', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HMMT-25', language);
    const nodes = nodeMap(readArch('HMMT-25', language));
    const edges = edgeSet(readArch('HMMT-25', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2505\.23281v3.*462e6f4.*6fdc427/isu);
    assert.match(nodes.get('release')?.label ?? '', /HMMT.*February 2025.*tournament.*15 February 2025|HMMT.*2025 年 2 月.*(?:锦标赛|竞赛|比赛).*2025 年 2 月 15 日/isu);
    assert.match(
      nodes.get('release')?.label ?? '',
      /individual tests only.*excludes Invitational\/HMIC|仅限个人赛题.*不含邀请赛\/HMIC/isu,
      `${language} February set excludes the separate Invitational/HMIC`,
    );
    assert.match(nodes.get('extract')?.label ?? '', /3.*individual tests.*10.*Algebra.*Geometry.*Combinatorics|3.*个人赛.*10.*代数.*几何.*组合/isu);
    assert.match(nodes.get('verify')?.label ?? '', /manually.*typographical.*inconsistenc.*format|人工.*错别字.*不一致.*格式/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /30-row.*problem.*answer.*CC BY-NC-SA 4\.0|30 行.*problem.*answer.*CC BY-NC-SA 4\.0/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /reason step by step.*boxed|逐步推理.*boxed/isu);
    assert.match(nodes.get('runs')?.label ?? '', /four.*provider-recommended.*no benchmark-specific tuning|4.*提供商推荐.*不.*基准.*调参/isu);
    assert.match(nodes.get('parse')?.label ?? '', /rule-based.*LaTeX.*SymPy.*equivalence|规则.*LaTeX.*SymPy.*等价/isu);
    assert.match(nodes.get('flags')?.label ?? '', /short.*truncat.*parser error.*(?:answer.*reasoning trace|reasoning trace.*answer)|短.*截断.*解析.*错误.*(?:答案.*推理轨迹|推理轨迹.*答案)/isu);
    assert.match(nodes.get('judge')?.label ?? '', /Gemini-2\.5-Flash.*semantic equivalence|Gemini-2\.5-Flash.*语义等价/isu);
    assert.match(nodes.get('reconcile')?.label ?? '', /(?:manual.*disagree|disagree.*manual).*update.*parser|(?:人工.*分歧|分歧.*人工).*更新.*解析器/isu);
    assert.match(nodes.get('timing')?.label ?? '', /close.*competition date.*released after|临近.*比赛日期.*赛后发布/isu);
    assert.match(nodes.get('score')?.label ?? '', /pass@1.*mean.*four.*no majority.*95%.*rank|pass@1.*4.*均值.*不.*多数.*95%.*排名/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /0\.6.*16,?000.*strict_parsing.*false.*later|0\.6.*16,?000.*strict_parsing.*false.*晚于/isu);
    for (const edge of [
      'runs->parse:primary',
      'parse->flags:primary',
      'parse->judge:primary',
      'flags->reconcile:primary',
      'judge->reconcile:primary',
      'reconcile->score:primary',
      'runs->timing:secondary',
      'timing->score:secondary',
      'score->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);

    const specNodes = new Map(spec.nodes.map(node => [node.id, node]));
    const timingEdge = spec.edges.find(edge => edge.from === 'timing' && edge.to === 'score');
    const boundaryEdge = spec.edges.find(edge => edge.from === 'score' && edge.to === 'artifact_boundary');
    assert.ok(
      specNodes.get('artifact_boundary').position.x > specNodes.get('score').position.x,
      `${language} artifact boundary must sit to the right of score`,
    );
    assert.deepEqual(
      [timingEdge.style.entryX, timingEdge.style.entryY],
      [0.25, 1],
      `${language} timing bypasses artifact boundary below score`,
    );
    assert.deepEqual(
      [boundaryEdge.style.exitX, boundaryEdge.style.exitY, boundaryEdge.style.entryX],
      [1, 0.75, 0],
      `${language} score-to-artifact route is separate`,
    );
    assert.doesNotMatch(
      [spec.meta.description, ...spec.nodes.map(node => node.label)].join('\n'),
      /\bfinals\b|决赛/iu,
      `${language} HMMT February tournament is not a finals set`,
    );
  }
});

test('locks HR-Bench curation, paper protocol, pinned release drift, and repository scoring chain', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HR-Bench', language));
    const edges = edgeSet(readArch('HR-Bench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2408\.15556v1.*5ad1177.*83b9013/isu);
    assert.match(nodes.get('images')?.label ?? '', /200.*8K.*DIV8K.*Internet|200.*8K.*DIV8K.*互联网/isu);
    assert.match(nodes.get('boxes')?.label ?? '', /manual.*bounding box.*relevant object|人工.*(?:边界框.*相关目标|相关目标.*边界框)/isu);
    assert.match(nodes.get('generate')?.label ?? '', /crop.*box.*GPT-4o.*query.*answer|(?:裁剪.*边界框|边界框.*裁剪).*GPT-4o.*问答/isu);
    assert.match(nodes.get('review')?.label ?? '', /human expert.*incorrect.*ambiguous|人工专家.*错误.*歧义/isu);
    assert.match(nodes.get('fsp')?.label ?? '', /100.*attribute.*OCR.*visual prompting|100.*属性.*OCR.*视觉提示/isu);
    assert.match(nodes.get('fcp')?.label ?? '', /100.*map.*chart.*spatial|100.*地图.*图表.*空间/isu);
    assert.match(nodes.get('versions')?.label ?? '', /8K.*source.*4K.*crop.*aspect ratio|8K.*原图.*4K.*裁剪.*宽高比/isu);
    assert.match(nodes.get('options')?.label ?? '', /four.*A-D.*same gold answer|4.*A-D.*同一.*标准答案/isu);
    assert.match(nodes.get('paper_protocol')?.label ?? '', /paper protocol.*circular.*full A-D.*next position.*four.*mean ACC|论文协议.*循环.*完整 A-D.*下一位置.*4.*平均 ACC/isu);
    assert.match(nodes.get('release_rows')?.label ?? '', /pinned.*four-row.*gold.*A.*B.*C.*D.*not.*circular|固定.*四行.*标准答案.*A.*B.*C.*D.*不.*循环/isu);
    assert.match(nodes.get('eval_prompt')?.label ?? '', /Question.*Options.*select.*candidate prediction|Question.*Options.*选择.*候选回答/isu);
    assert.match(nodes.get('aux_judge')?.label ?? '', /llm_path.*not pinned.*top_p.*0\.8.*top_k.*40.*temperature.*0\.2|llm_path.*未固定.*top_p.*0\.8.*top_k.*40.*温度.*0\.2/isu);
    assert.match(nodes.get('yn_parser')?.label ?? '', /lowercase.*prefix.*yes.*1.*no.*other.*0|小写.*前缀.*yes.*1.*no.*其他.*0/isu);
    assert.match(nodes.get('repo_score')?.label ?? '', /cycle_category.*category.*all.*average.*4K.*8K|cycle_category.*类别.*all.*平均.*4K.*8K/isu);
    assert.match(nodes.get('pilot')?.label ?? '', /pilot.*resolution-dependent.*next-token uncertainty.*separate|试验.*分辨率相关.*下一 token.*不属于/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /800.*4K.*800.*8K.*200.*4.*DC².*not.*curation|4K.*800.*8K.*800.*200.*4.*DC².*不.*构建/isu);
    for (const edge of [
      'route->fsp:primary',
      'route->fcp:primary',
      'fsp->versions:primary',
      'fcp->versions:primary',
      'options->paper_protocol:primary',
      'options->release_rows:data',
      'release_rows->eval_prompt:secondary',
      'eval_prompt->aux_judge:secondary',
      'aux_judge->yn_parser:secondary',
      'yn_parser->repo_score:secondary',
      'versions->pilot:secondary',
      'paper_protocol->artifact_boundary:data',
      'repo_score->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HaluEval generation, annotation, subset-specific evaluation, and 5,000/4,507 boundary', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HalluEval', language);
    const nodes = nodeMap(readArch('HalluEval', language));
    const edges = edgeSet(readArch('HalluEval', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2305\.11747v3.*b7b66e8/isu);
    assert.match(nodes.get('task_seeds')?.label ?? '', /30,?000.*HotpotQA.*OpenDialKG.*CNN.*10,?000/isu);
    assert.match(nodes.get('sample')?.label ?? '', /one-pass.*conversational.*QA.*4.*dialogue.*3.*summarization.*3|单轮.*多轮.*问答.*4.*对话.*3.*摘要.*3/isu);
    assert.match(nodes.get('sample')?.label ?? '', /ChatGPT.*temperature 1\.0.*256.*top-p 1\.0|ChatGPT.*温度 1\.0.*256.*top-p 1\.0/isu);
    assert.match(nodes.get('filter')?.label ?? '', /ground-truth.*two.*most plausible.*difficult|真值.*两个.*最可信.*困难/isu);
    assert.match(nodes.get('auto_set')?.label ?? '', /30,?000.*right.*selected hallucinated.*pair|30,?000.*正确.*选中.*幻觉.*配对/isu);
    assert.match(nodes.get('alpaca')?.label ?? '', /Alpaca 52K.*three ChatGPT responses|Alpaca 52K.*3.*ChatGPT/isu);
    assert.match(nodes.get('divergence')?.label ?? '', /average.*BERTScore.*(?:5,?000.*lowest|lowest.*5,?000)|(?:平均.*BERTScore|BERTScore.*平均).*(?:5,?000.*最低|最低.*5,?000)/isu);
    assert.match(nodes.get('annotate')?.label ?? '', /three labelers.*(?:dimensions|aspects).*unverifiable.*non-factual.*irrelevant.*Yes\/No.*spans|3 名.*(?:维度|方面).*不可验证.*非事实.*不相关.*是\/否.*片段/isu);
    assert.match(nodes.get('human_set')?.label ?? '', /majority|max-vot|多数|最大投票/isu);
    assert.match(nodes.get('human_set')?.label ?? '', /30.*0\.811.*977/isu);
    assert.match(nodes.get('release')?.label ?? '', /35,?000.*30,?000.*5,?000.*hallucination.*Yes\/No.*hallucination_spans/isu);
    assert.match(nodes.get('task_eval')?.label ?? '', /QA.*dialogue.*summarization.*own instruction.*random.*normal.*hallucinated.*temperature 0|问答.*对话.*摘要.*独立指令.*随机.*正常.*幻觉.*温度 0/isu);
    assert.match(nodes.get('task_parser')?.label ?? '', /remove periods.*both Yes.*No.*neither.*incorrect.*one substring.*normalize|移除句点.*同时.*Yes.*No.*均无.*错误.*单一.*归一/isu);
    assert.match(nodes.get('general_eval')?.label ?? '', /annotated ChatGPT response.*General accuracy.*no general path|标注.*ChatGPT 回答.*General.*未提供.*通路/isu);
    assert.match(nodes.get('score')?.label ?? '', /recognition accuracy.*QA.*dialogue.*summarization.*general|识别准确率.*问答.*对话.*摘要.*通用/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /5,?000.*4,?507.*10,?000.*each|5,?000.*4,?507.*各.*10,?000/isu);
    for (const edge of [
      'task_seeds->sample:primary',
      'sample->filter:primary',
      'filter->auto_set:primary',
      'alpaca->divergence:secondary',
      'divergence->annotate:secondary',
      'annotate->human_set:secondary',
      'auto_set->release:primary',
      'human_set->release:secondary',
      'eval_route->task_eval:primary',
      'eval_route->general_eval:primary',
      'task_eval->task_parser:primary',
      'task_parser->score:primary',
      'general_eval->score:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);

    const specNodes = new Map(spec.nodes.map(node => [node.id, node]));
    const lowerBranch = spec.edges.find(edge => edge.from === 'eval_route' && edge.to === 'general_eval');
    assert.ok(
      specNodes.get('general_eval').position.x - specNodes.get('eval_route').position.x >= 600,
      `${language} lower branch has room to clear response text`,
    );
    assert.deepEqual(
      [lowerBranch.style.exitX, lowerBranch.style.exitY, lowerBranch.style.entryX, lowerBranch.style.entryY],
      [1, 0.75, 0, 0.5],
      `${language} lower branch ports`,
    );
  }
});

test('locks HalluQA three-stream selection, QA, GPT-4 voting, and paper/script criterion boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HalluQA', language));
    const edges = edgeSet(readArch('HalluQA', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2310\.03368v4.*c025c0d.*e2f8ac3.*450/isu);
    assert.match(nodes.get('misleading_design')?.label ?? '', /20.*TruthfulQA.*Chinese|20.*TruthfulQA.*中国/isu);
    assert.match(nodes.get('glm_probe')?.label ?? '', /GLM-130B.*five.*six.*QA.*3\/5|GLM-130B.*5.*6.*问答.*3\/5/isu);
    assert.match(nodes.get('misleading_set')?.label ?? '', /175.*22.*domain|175.*22.*领域/isu);
    assert.match(nodes.get('hard_design')?.label ?? '', /recent Chinese Internet.*ChatGPT 3\.5.*create adversarial|近期中文互联网.*ChatGPT 3\.5.*构造对抗/isu);
    assert.match(nodes.get('hard_set')?.label ?? '', /69.*15.*domain|69.*15.*领域/isu);
    assert.match(nodes.get('knowledge_design')?.label ?? '', /ten.*Chinese-native graduate|10.*中文母语.*研究生/isu);
    assert.match(nodes.get('dual_probe')?.label ?? '', /ChatGPT.*Puyu.*five.*both.*3\/5.*1,?000|ChatGPT.*Puyu.*5.*两者.*3\/5.*1,?000/isu);
    assert.match(nodes.get('knowledge_set')?.label ?? '', /NLP expert.*206.*14.*domain|NLP 专家.*206.*14.*领域/isu);
    assert.match(nodes.get('annotate')?.label ?? '', /misleading.*four correct.*four wrong.*knowledge.*at least one|误导.*4.*正确.*4.*错误.*知识.*至少 1/isu);
    assert.match(nodes.get('quality')?.label ?? '', /external.*link.*independent authors.*rewrite.*discard|外部.*链接.*未参与出题.*作者.*改写.*丢弃/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /450.*30.*175.*69.*206/isu);
    assert.match(nodes.get('inference')?.label ?? '', /one answer.*refusal.*hallucination.*unanswerable|回答每题.*拒答.*幻觉.*不可回答/isu);
    assert.match(nodes.get('judge')?.label ?? '', /GPT-4-0613.*five criteria.*five votes.*temperature 0.*top-p 0\.5|GPT-4-0613.*5 条.*5.*温度 0.*top-p 0\.5/isu);
    assert.match(nodes.get('score')?.label ?? '', /non-hallucination rate.*percentage.*clean|非幻觉率.*比例.*无幻觉/isu);
    assert.match(nodes.get('consistency')?.label ?? '', /100.*six models.*600.*93\.50%|100.*6.*600.*93\.50%/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /paper.*five criteria.*script.*six.*same judge settings|论文.*5 条.*脚本.*6 条.*同一.*评判设置/isu);
    for (const edge of [
      'route->misleading_design:primary',
      'route->hard_design:primary',
      'route->knowledge_design:secondary',
      'misleading_set->annotate:primary',
      'hard_set->annotate:primary',
      'knowledge_set->annotate:secondary',
      'judge->score:primary',
      'judge->consistency:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact paper and official artifact revisions in all A10x detail records', () => {
  const hmmt = readDetail('HMMT-25');
  assert.match(hmmt.paper_url, /2505\.23281v3/u);
  assert.match(hmmt.drawio_review_note, /462e6f4.*6fdc427.*three individual tests.*10.*0\.6.*16,?000.*strict_parsing=false/isu);
  assert.match(hmmt.intro_en, /February 2025.*individual tests.*excludes Invitational\/HMIC/isu);
  assert.match(hmmt.intro, /2025 年 2 月.*个人赛.*不含邀请赛\/HMIC/isu);
  assert.match(hmmt.drawio_review_note, /February 2025.*individual tests.*excludes.*Invitational\/HMIC/isu);
  assert.doesNotMatch([hmmt.intro, hmmt.intro_en, hmmt.scale, hmmt.scale_en, hmmt.drawio_review_note].join('\n'), /\bfinals\b|决赛/iu);

  const hr = readDetail('HR-Bench');
  assert.match(hr.paper_url, /2408\.15556v1/u);
  assert.match(hr.drawio_review_note, /5ad1177.*83b9013.*paper.*circular.*release.*gold.*A.*D.*not.*circular/isu);
  assert.match(hr.drawio_review_note, /llm_path.*not pinned.*top_p.*0\.8.*top_k.*40.*temperature.*0\.2.*prefix.*cycle_category/isu);
  assert.match(hr.drawio_review_note, /resolution-dependent.*next-token uncertainty.*pilot.*DC².*not.*curation/isu);

  const halueval = readDetail('HalluEval');
  assert.match(halueval.paper_url, /2305\.11747v3/u);
  assert.match(halueval.drawio_review_note, /b7b66e8.*5,?000.*4,?507.*10,?000.*each/isu);
  assert.match(halueval.drawio_review_note, /hallucination.*Yes\/No.*hallucination_spans.*dimensions.*not.*type fields/isu);
  assert.match(halueval.drawio_review_note, /three.*instruction files.*remove.*periods.*both.*neither.*incorrect.*substring.*normalize.*general.*evaluate\.py.*no.*path/isu);

  const halluqa = readDetail('HalluQA');
  assert.match(halluqa.paper_url, /2310\.03368v4/u);
  assert.match(halluqa.drawio_review_note, /c025c0d.*e2f8ac3.*450.*175.*69.*206/isu);
  assert.match(halluqa.drawio_review_note, /paper.*five criteria.*script.*six.*100 questions.*six models.*600.*93\.5/isu);
});

test('keeps every A10x fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10x', () => {
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

test('reproduces A10x SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10x-exports-'));
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
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10x specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10x-'));
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
