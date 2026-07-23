import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'LogicGame',
  'LogicVista',
  'LongBench',
  'LongText-Bench',
  'LongVideoBench',
  'LoraxBench',
];
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
const labels = arch => arch.nodes.map(node => node.label).join('\n');

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function edgeSet(arch) {
  return new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
}

function nodeLabel(arch, id) {
  const node = arch.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return node.label;
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
    .replace(/\\\((.*?)\\\)/gu, '$1')
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

test('keeps all six A11j packages bilingual with the academic profile and reviewed evidence boundary nodes', () => {
  const requiredNodes = new Map([
    ['LogicGame', ['c1', 'p6', 'd2', 'd3', 'e8']],
    ['LogicVista', ['source_banks', 'released_schema', 'repair_retry', 'results_boundary']],
    ['LongBench', ['standard_release', 'e_release', 'metrics', 'aggregate']],
    ['LongText-Bench', ['release_snapshot', 'cleanup', 'micro_score', 'runner_gap']],
    ['LongVideoBench', ['r1', 'r2', 'r3', 'r4', 'm1']],
    ['LoraxBench', ['coverage', 'indonesian', 'release', 'answer_mode', 'eval_gap']],
  ]);
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      for (const nodeId of requiredNodes.get(id)) {
        assert.ok(spec.nodes.some(node => node.id === nodeId), `${id}.${language} ${nodeId}`);
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length > 500, `${id} review evidence`);
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 44]]) {
      for (const node of readSpec(id, language).nodes) {
        const nodeLimit = node.type === 'formula' ? 90 : maxLineLength;
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= nodeLimit, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks LogicGame bilingual construction, public-row boundary, two-stage JSON errors, and v2 submission drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LogicGame', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /304.*(?:2 Languages|2 种语言).*180.*124/isu);
    assert.match(text, /76.*45.*31/isu);
    assert.match(text, /0\s*\/\s*1\s*\/\s*2-shot/isu);
    assert.match(text, /whole.*304.*qid.*contexts.*level.*category/isu);
    assert.match(text, /dev.*10.*(?:Refs|参考).*(?:Examples|示例)/isu);
    assert.match(text, /temperature\s*=\s*0.*2,?048/isu);
    assert.match(text, /IFError.*(?:Extraction Failure|提取失败)/isu);
    assert.match(text, /JSError.*(?:Parsing Failure|解析失败)/isu);
    assert.match(text, /NIJ.*AP.*IFError.*JSError/isu);
    assert.match(text, /4140.*6934.*2025-03-31/isu);
    for (const edge of [
      'c1->c2:primary',
      'd1->c3:primary',
      'd1->c4:primary',
      'c5->p1:primary',
      'p5->p6:primary',
      'p6->e1:primary',
      'e4->d2:primary',
      'd2->e5:primary',
      'd2->x1:data',
      'e5->d3:primary',
      'd3->e6:primary',
      'd3->x2:data',
      'e6->e7:primary',
      'e7->e8:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('d2->e6:primary'), `${language} extraction must precede parsing`);
    assert.ok(!edges.has('e4->d3:primary'), `${language} parser decision must follow extraction`);
  }
});

test('locks LogicVista paper taxonomy, pinned schema defects, independent audits, and released scoring branches', () => {
  const independentAudits = [
    'taxonomy_drift',
    'content_drift',
    'rights_drift',
    'missing_construction',
    'eval_drift',
  ];
  for (const language of ['en', 'zh']) {
    const arch = readArch('LogicVista', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /(?:Five Annotators.*Three Months|5 名标注者.*3 个月)/isu);
    assert.match(text, /107.*93.*95.*79.*74.*448/isu);
    assert.match(text, /330.*234.*105.*67.*70.*45.*256.*76.*69/isu);
    assert.match(text, /dataset\.json.*448.*PNG.*0.*447/isu);
    assert.match(text, /liscenced.*(?:String|字符串).*sourceli,nk/isu);
    assert.match(text, /44.*(?:Empty Rationales|理由为空).*382.*(?:Blank Question|问题与答案为空).*(?:Three|3|三)/isu);
    assert.match(text, /gpt-4.*(?:temp|温度)?\s*=\s*0\.2/isu);
    assert.match(text, /(?:Paper|论文).*(?:Validation Feedback|验证反馈).*(?:OutputFixing|代码)/isu);
    assert.match(text, /(?:Blank Output.*Blank Gold|空输出.*空金标).*(?:Score 1|1 分)/isu);
    assert.match(text, /8.*(?:MLLM|个 MLLM).*16.*(?:Configurations|配置)/isu);
    for (const edge of [
      'source_banks->access_controls:primary',
      'quality_review->skill_axis:primary',
      'quality_review->paper_capabilities:primary',
      'paper_release->repo_snapshot:primary',
      'repo_snapshot->released_schema:primary',
      'released_schema->candidate_input:secondary',
      'raw_output->answer_extractor:primary',
      'parse_valid->repair_retry:secondary',
      'repair_retry->exact_match:secondary',
      'parse_valid->exact_match:primary',
      'exact_match->item_score:primary',
      'item_score->aggregate_accuracy:primary',
      'aggregate_accuracy->results_boundary:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    const connectedNodes = new Set(arch.edges.flatMap(edge => [edge.from, edge.to]));
    for (const id of independentAudits) {
      assert.ok(!connectedNodes.has(id), `${language} ${id} must remain an independent audit card`);
    }
  }
});

test('locks LongBench six-family construction, parallel standard and E releases, and official evaluation contract', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LongBench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /(?:21 Datasets.*4,?750.*14 English.*5 Chinese.*2 Code|21个数据集.*4,?750.*14个英文.*5个中文.*2个代码)/isu);
    assert.match(text, /(?:Single-document QA|单文档问答).*750/isu);
    assert.match(text, /(?:Multi-document QA|多文档问答).*800/isu);
    assert.match(text, /(?:Summarization|摘要).*800/isu);
    assert.match(text, /(?:Few-shot Learning|少样本学习).*800/isu);
    assert.match(text, /(?:Synthetic Tasks|合成任务).*600/isu);
    assert.match(text, /(?:Code Completion|代码补全).*1,?000/isu);
    assert.match(text, /(?:First Three Use ZeroSCROLLS|前三项使用ZeroSCROLLS)/isu);
    assert.match(text, /Hotpot.*2Wiki.*MuSiQue.*(?:Randomize Passage Order|随机排列篇章)/isu);
    assert.match(text, /DuReader.*20/isu);
    assert.match(text, /(?:3,?668.*13 Datasets|13个数据集共3,?668)/isu);
    assert.match(text, /0–4k.*4–8k.*8k\+/isu);
    assert.match(text, /(?:First M\/2.*Last M\/2|前M\/2.*后M\/2)/isu);
    assert.match(text, /(?:Greedy Decoding.*No Sampling|贪心解码.*不采样)/isu);
    assert.match(text, /1\/n/isu);
    assert.match(text, /(?:Matching Digits|匹配数字)/isu);
    assert.match(text, /(?:Overall.*Six Category Means|总分.*六类均值)/isu);
    for (const edge of [
      'source_splits->route:primary',
      'route->single_doc:primary',
      'route->multi_doc:primary',
      'route->summarization:primary',
      'route->fewshot:primary',
      'route->synthetic:primary',
      'route->code:primary',
      'schema->standard_release:primary',
      'schema->e_select:data',
      'e_select->e_bins:data',
      'e_bins->e_release:data',
      'standard_release->eval_set:primary',
      'e_release->eval_set:primary',
      'prompts->truncate:primary',
      'truncate->wrappers:primary',
      'wrappers->decode:primary',
      'decode->postprocess:primary',
      'postprocess->metrics:primary',
      'metrics->dataset_score:primary',
      'dataset_score->aggregate:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('standard_release->e_select:data'), `${language} LongBench-E is not sampled from standard rows`);
    assert.ok(!edges.has('standard_release->e_release:data'), `${language} LongBench-E is a parallel release`);
  }
});

test('locks LongText-Bench bilingual release, OCR cleanup drift, micro-average, and runner boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LongText-Bench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /8\s*×\s*20\s*=\s*160.*80.*80/isu);
    assert.match(text, /(?:EN 160.*ZH 160|英文160.*中文160)/isu);
    assert.match(text, /(?:No Train.*Dev.*Test Split|无训练.*开发.*测试划分)/isu);
    assert.match(text, /160\s*×\s*4.*640.*1,?280/isu);
    assert.match(text, /0–199.*(?:Two 20-ID Gaps|两段20-ID空缺)/isu);
    const ocr = nodeLabel(arch, 'ocr');
    const cleanup = nodeLabel(arch, 'cleanup');
    assert.match(ocr, /"No text recognized"/u);
    assert.doesNotMatch(ocr, /"No text recognized\."/u);
    assert.match(cleanup, /"No text recognized\."/u);
    assert.match(cleanup, /(?:No-period Reply Remains|无句点空结果仍保留)/isu);
    assert.match(cleanup, /(?:First Removal Is Lost|首项删除被覆盖)/isu);
    assert.match(text, /(?:Σ Image Matches.*Σ Image GT Units|Σ逐图匹配数.*Σ逐图标准单位数)/isu);
    assert.match(text, /(?:Micro-average|微平均).*(?:Not a Mean|不是.*均值)/isu);
    assert.match(text, /(?:11 Model Rows|11行模型结果)/isu);
    assert.match(text, /Transformers 4\.52\.0.*results\.jsonl.*results\.json/isu);
    for (const edge of [
      'scenarios->gpt4o:primary',
      'gpt4o->manual_qc:primary',
      'manual_qc->paper_total:primary',
      'paper_total->release_snapshot:data',
      'release_snapshot->en_file:data',
      'release_snapshot->zh_file:data',
      'en_file->candidate:data',
      'zh_file->candidate:data',
      'candidate->sample_files:primary',
      'sample_files->ingest:data',
      'ingest->ocr:data',
      'ocr->cleanup:primary',
      'cleanup->normalize_mode:primary',
      'normalize_mode->en_norm:primary',
      'normalize_mode->zh_norm:primary',
      'en_norm->match:primary',
      'zh_norm->match:primary',
      'match->image_ratio:primary',
      'image_ratio->micro_score:primary',
      'micro_score->language_report:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LongVideoBench construction, split-count drift, gated release, loader, and hidden scorer boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LongVideoBench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /\(8,15\].*\(15,60\].*\(180,600\].*\(900,3600\]/isu);
    assert.match(text, /119.*99.*20.*(?:April 2024|2024 年 4 月).*720P/isu);
    assert.match(text, /Q-Align.*>\s*0\.25/isu);
    assert.match(text, /3,?763.*(?:Videos|视频)/isu);
    assert.match(text, /20%.*(?:Problematic|有问题).*(?:Revised|修订)/isu);
    assert.match(text, /1,?337.*752.*5,?341.*3,?011/isu);
    assert.match(text, /6,?678.*1,?337.*5,?341.*753.*3,?008.*752.*3,?011/isu);
    assert.match(text, /60d1c89c.*CC BY-NC-SA 4\.0.*(?:Test Label|测试标签)\s*=\s*−1/isu);
    assert.match(text, /num_frames\s*=\s*min.*int\((?:Duration|时长)\).*1.*(?:Frame \/ Second|帧)/isu);
    assert.match(text, /(?:No Native Scorer|没有原生评分器).*(?:Test Submit by Email|测试经邮件提交).*(?:Hidden Scoring|隐藏评分)/isu);
    assert.match(text, /(?:Multiple-choice Accuracy|多项选择准确率).*(?:No Auxiliary Judge|不使用辅助裁判)/isu);
    for (const edge of [
      'b2->d1:primary',
      'd1->b3:primary',
      'd1->b4:primary',
      'b3->b5:primary',
      'b4->b5:primary',
      'a3->a4:primary',
      'a4->r1:primary',
      'r1->r2:primary',
      'r2->r3:primary',
      'r3->r4:optional',
      'r3->e1:primary',
      'e1->e2:primary',
      'e2->e3:primary',
      'e3->e4:primary',
      'e4->d2:primary',
      'd2->e5:primary',
      'd2->e6:primary',
      'e5->m1:primary',
      'e6->m1:primary',
      'm1->m2:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LoraxBench six task branches, 22 local variants, count reconciliation, and answer-mode ordering', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LoraxBench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /(?:20 Languages.*23 Subsets|20 种语言.*23 个子集)/isu);
    assert.match(text, /(?:564.*100|564 条测试.*100 条训练)/isu);
    assert.match(text, /558/isu);
    assert.match(text, /1,?446/isu);
    assert.match(text, /251.*22.*(?:Local Language.*Indonesian|本地语言.*印尼语)/isu);
    assert.match(text, /365/isu);
    assert.match(text, /61.*12.*13.*510/isu);
    assert.match(text, /(?:Five Non-translation Tasks Only|仅适用于五类非翻译任务)/isu);
    assert.match(text, /(?:Indonesian.*Local Language|印尼语.*本地语言)/isu);
    assert.match(text, /84,?711.*2,?300.*87,?011/isu);
    assert.match(text, /84,?711.*84,?895.*184/isu);
    assert.match(text, /(?:Zero-shot on All Six Tasks|六类任务均做零样本).*(?:Few-shot|少样本)/isu);
    assert.match(text, /(?:Accuracy.*Five Non-translation Tasks|五类非翻译任务.*准确率).*ChrF\+\+/isu);
    assert.match(text, /(?:No Construction or Evaluation Code|未公开构建或评测代码)/isu);
    for (const edge of [
      'coverage->route:primary',
      'route->reading:primary',
      'route->open_qa:primary',
      'route->nli:primary',
      'route->translation:primary',
      'route->causal:primary',
      'route->cultural:primary',
      'task_records->indonesian:data',
      'indonesian->release:data',
      'task_records->guidelines:primary',
      'guidelines->translate:primary',
      'translate->review:primary',
      'review->retranslate:data',
      'retranslate->release:data',
      'release->eval_scope:primary',
      'eval_scope->prompts:primary',
      'prompts->answer_mode:primary',
      'answer_mode->inference:primary',
      'inference->metrics:primary',
      'metrics->best_prompt:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('prompts->inference:primary'), `${language} answer mode must be configured before inference`);
  }
});

test('pins exact primary-source and official-artifact revisions in every A11j detail record', () => {
  const logicGame = readDetail('LogicGame');
  assert.match(logicGame.paper_url, /2408\.15778v4/u);
  assert.match(logicGame.homepage, /4884edb6de726fe35debb656215ef429cd7e2f4d/u);
  assert.equal(logicGame.openness, 'partly public');
  assert.equal(logicGame.has_leaderboard, true);

  const logicVista = readDetail('LogicVista');
  assert.match(logicVista.paper_url, /2407\.04973v1/u);
  assert.match(logicVista.homepage, /e5795f17189ce1243231250af7d8c112ae2c5a57/u);
  assert.equal(logicVista.openness, 'partly public');
  assert.equal(logicVista.has_leaderboard, false);

  const longBench = readDetail('LongBench');
  assert.match(longBench.paper_url, /2308\.14508v2/u);
  assert.match(longBench.homepage, /2e00731f8d0bff23dc4325161044d0ed8af94c1e/u);
  assert.equal(longBench.openness, 'public');
  assert.equal(longBench.has_leaderboard, true);
  assert.match(longBench.drawio_review_note, /5e628be450b7e67fb7ae6e201bd6d8f7056f7672/isu);
  assert.match(longBench.drawio_review_note, /Figure 1.*summarization.*600.*Table 1.*800/isu);

  const longText = readDetail('LongText-Bench');
  assert.match(longText.paper_url, /2507\.22058v1/u);
  assert.match(longText.homepage, /429e30e9c1e0dea535038ae4238ea6ec42823098/u);
  assert.equal(longText.openness, 'public');
  assert.equal(longText.has_leaderboard, true);
  assert.match(longText.drawio_review_note, /2b8237bb3789638c290eeda3e83ed81bd3652c3b/isu);

  const longVideo = readDetail('LongVideoBench');
  assert.match(longVideo.paper_url, /neurips\.cc.*329ad516cf7a6ac306f29882e9c77558/isu);
  assert.match(longVideo.homepage, /fc3c553250cfee6853a722f9b181f1b69f478426/u);
  assert.equal(longVideo.openness, 'partly public');
  assert.equal(longVideo.has_leaderboard, true);
  assert.match(longVideo.drawio_review_note, /60d1c89c1919a198b73be39c2babb213b29d6a5c/isu);
  assert.match(longVideo.drawio_review_note, /cdf3444602208c95f453e7683583a077ce38ddbf/isu);

  const lorax = readDetail('LoraxBench');
  assert.match(lorax.paper_url, /2508\.12459v1/u);
  assert.match(lorax.homepage, /1ebe2dac146872e4fbad982f9d0102f140b7e3ff/u);
  assert.equal(lorax.openness, 'public');
  assert.equal(lorax.has_leaderboard, false);
});

test('keeps every A11j fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11j', () => {
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
          assert.ok(visibleText.includes(line), `${id}.${language}: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces exactly twelve A11j SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11j-exports-'));
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
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all twelve A11j specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11j-'));
  let rebuildCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [drawioCli, `${base}.spec.yaml`, generated, '--validate', '--strict', '--write-sidecars'], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
        assert.equal(readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'), readFileSync(`${base}.arch.json`, 'utf8'), `${id}.${language}.arch`);
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
