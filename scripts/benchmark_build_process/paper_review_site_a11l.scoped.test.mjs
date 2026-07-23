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
  'MIA-Bench',
  'MILU',
  'MLGym',
  'MLVU',
  'MM-BrowseComp',
  'MM-IFEval',
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
const labels = graph => graph.nodes.map(node => node.label).join('\n');

function topology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type }) => ({ id, type })),
    edges: graph.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function edgeSet(graph) {
  return new Set(graph.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
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

test('keeps all six A11l packages bilingual with reviewed academic layout and synchronized formal topology', () => {
  const expectedLayouts = new Map([
    ['MIA-Bench', 'horizontal'],
    ['MILU', 'horizontal'],
    ['MLGym', 'horizontal'],
    ['MLVU', 'vertical'],
    ['MM-BrowseComp', 'horizontal'],
    ['MM-IFEval', 'horizontal'],
  ]);
  const requiredNodes = new Map([
    ['MIA-Bench', ['evidence', 'construction_gaps', 'release_audit', 'failure_skip', 'judge_drift', 'evaluator_gaps']],
    ['MILU', ['evidence', 'validation_release', 'api_parse', 'release_boundary', 'aggregation_boundary', 'reporting_drift']],
    ['MLGym', ['b1', 'r1', 'r3', 'd1', 'e6', 's2', 's3', 's4']],
    ['MLVU', ['b1', 'r2', 'r4', 'r5', 'd1', 'e5', 's2', 's5', 's6']],
    ['MM-BrowseComp', ['b1', 'b6', 'q5', 'r1', 'r2', 'e3', 'm3', 'a1', 'a2', 'a4']],
    ['MM-IFEval', ['evidence', 'paper_release', 'released_tsv', 'eval_route', 'c_item_score', 'p_judge', 'aggregate', 'openness_boundary', 'evaluator_drift']],
  ]);

  for (const id of benchmarkIds) {
    const specs = Object.fromEntries(['en', 'zh'].map(language => [language, readSpec(id, language)]));
    assert.deepEqual(topology(specs.zh), topology(specs.en), `${id} reviewed spec topology`);
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal bilingual topology`);
    for (const language of ['en', 'zh']) {
      const spec = specs[language];
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, expectedLayouts.get(id), `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.deepEqual(topology(readArch(id, language)), topology(spec), `${id}.${language} formal topology freshness`);
      for (const node of spec.nodes.filter(candidate => candidate.type === 'decision')) {
        const targets = new Set(
          spec.edges.filter(edge => edge.from === node.id).map(edge => edge.to),
        );
        assert.ok(
          targets.size >= 2,
          `${id}.${language}.${node.id} decision has fewer than two unique targets`,
        );
      }
      for (const nodeId of requiredNodes.get(id)) {
        assert.ok(spec.nodes.some(node => node.id === nodeId), `${id}.${language} ${nodeId}`);
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length > 1_000, `${id} review evidence`);
  }
});

test('rejects ignored, empty, string, and out-of-range A11l font styles', () => {
  const violations = [];
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      for (const node of readSpec(id, language).nodes) {
        if (Object.hasOwn(node, 'fontSize')) {
          violations.push(`${id}.${language}.${node.id} ignored node-level fontSize`);
        }
        if (node.style === null) {
          violations.push(`${id}.${language}.${node.id} empty style`);
        } else if (node.style !== undefined && (typeof node.style !== 'object' || Array.isArray(node.style))) {
          violations.push(`${id}.${language}.${node.id} non-object style`);
        }

        const fontSize = node.style && typeof node.style === 'object'
          ? node.style.fontSize
          : undefined;
        if (fontSize === undefined) continue;
        if (typeof fontSize !== 'number') {
          violations.push(`${id}.${language}.${node.id} nonnumeric fontSize=${fontSize}`);
        } else if (fontSize < 8 || fontSize > 10) {
          violations.push(`${id}.${language}.${node.id} fontSize=${fontSize} outside 8-10`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('keeps reviewed bilingual A11l node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 44]]) {
      for (const node of readSpec(id, language).nodes) {
        const reviewedFieldLimit = id === 'MM-BrowseComp' && node.id === 'r1'
          ? (language === 'en' ? 56 : 48)
          : maxLineLength;
        const nodeLimit = ['decision', 'formula'].includes(node.type) ? 90 : reviewedFieldLimit;
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= nodeLimit, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks MIA-Bench construction, release defects, shrinking failure denominator, and judge-version boundary', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MIA-Bench', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.match(text, /(?:Four Image Sources|四类图像来源).*COCO.*SBU.*TextVQA.*Flickr.*400/isu);
    assert.match(text, /(?:Random|随机).*COCO.*SBU.*TextVQA.*Flickr.*(?:Selection Method Unreported|选择方法未披露)/isu);
    assert.match(text, /GPT-4V.*(?:Absent from Public JSON|公开 JSON 不含).*?(?:Prompt.*Snapshot Unreleased|提示.*快照未公开)/isu);
    assert.match(text, /(?:Correctness|正确性).*(?:No Answer Leakage|不泄露答案).*(?:Image-dependent|依赖图像).*(?:No Acceptance.*Gate|未发布接受.*门槛)/isu);
    assert.match(text, /400.*398.*(?:2\s*\/\s*3\s*\/\s*4\s*\/\s*5).*204\s*\/\s*155\s*\/\s*40\s*\/\s*1.*22/isu);
    assert.match(text, /(?:Description Violations|描述类违例).*3.*9.*31.*308.*316.*372.*261.*(?:Sum\s*=\s*8|权重和\s*=\s*8).*241.*247/isu);
    assert.match(text, /399.*193.*(?:No Scheme|缺协议).*(?:No Image Bundle|无图像包).*(?:No Per-row Source|无逐行来源)/isu);
    assert.match(text, /(?:Pair Instructions by Row Position|按行位置配对指令).*(?:Ignore Benchmark image|忽略基准 image).*(?:Candidate url|候选行 url).*(?:No URL.*Length.*Order|不校验 URL.*长度.*顺序)/isu);
    assert.match(text, /"error".*(?:Five Failures|五次失败).*(?:Malformed|格式异常).*(?:Silent|静默).*(?:Denominator Shrinks|分母缩小)/isu);
    assert.match(text, /score_dict.*(?:Repeated Types Overwrite|重复类别会覆盖).*22.*total_score/isu);
    assert.match(text, /mini-2024-07-18.*4o-2024-05-13.*4o-2024-11-20.*chatgpt-4o-latest.*0–100.*0–1.*"gpt-4o"/isu);
    for (const edge of [
      'evidence->sources:primary',
      'sources->sampling:primary',
      'author->construction_gaps:dependency',
      'weights->dataset:primary',
      'dataset->release_fields:data',
      'release_audit->weight_drift:data',
      'dataset->candidate:primary',
      'candidate->positional_join:primary',
      'positional_join->error_gate:primary',
      'judge_call->parse:primary',
      'parse->aggregate:primary',
      'error_gate->failure_skip:optional',
      'judge_call->failure_skip:optional',
      'parse->failure_skip:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MILU source filtering, gated release, dual evaluation routes, and incompatible aggregation versions', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MILU', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.match(text, /1,?500.*40.*(?:150K|15 万)/isu);
    assert.match(text, /(?:Reading Comprehension|阅读理解).*(?:Image Questions|图像题).*(?:Four Options|四个选项).*(?:Wrong-language|语言错误).*(?:Deduplicate|去重)/isu);
    assert.match(text, /45%.*IndicTrans2.*GPT-4o-mini.*(?:20K|2 万).*NV-Embed-v2.*50.*41.*(?:Eight Domains|八大领域)/isu);
    assert.match(text, /(?:At Least 100|至少 100).*(?:at 500|最多 500)/isu);
    assert.match(text, /79,?617.*19,?915.*8,?933.*(?:No Train Split|未声明训练集)/isu);
    assert.match(text, /11.*test.*validation.*CC BY 4\.0.*(?:Auto-gated|自动门控)/isu);
    assert.match(text, /7d8e6c9.*683a670.*lm_eval 0\.4\.4.*first_n/isu);
    assert.match(text, /Question: question.*Choices: A-D.*Answer:.*(?:Target-token Log Probs|目标 token 对数概率).*(?:No Generation Parser|不使用生成解析器)/isu);
    assert.match(text, /(?:Closed Models|闭源模型).*(?:Zero-shot|零样本).*(?:Structured JSON|结构化 JSON).*(?:Schema\/Parser Unpublished|schema\/解析器未发布).*(?:No API Task|无 API 任务)/isu);
    assert.match(text, /(?:Mean of 8 Domains|八领域均值).*(?:11 Languages|11 种语言).*(?:74\.74)/isu);
    assert.match(text, /weight_by_size.*75\.95.*(?:Counterfactual|反事实).*(?:Not Official|非官方).*(?:Not Reproduced|非复现)/isu);
    assert.match(text, /(?:Math Excluded|排除数学题).*79,?617.*85K.*42.*45.*42.*72%.*41.*74%/isu);
    for (const edge of [
      'evidence->exam_sources:primary',
      'exam_sources->scrape:primary',
      'format_qc->language_qc:primary',
      'topic_recovery->taxonomy:primary',
      'taxonomy->gap_fill:primary',
      'final_qc->test_release:primary',
      'final_qc->validation_release:data',
      'public_contract->harness:primary',
      'eval_route->nonapi_setup:primary',
      'eval_route->api_generate:data',
      'api_generate->api_parse:data',
      'loglikelihood->item_accuracy:primary',
      'language_score->paper_aggregate:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MLGym paper snapshot, execution loop, failure classification, and competing four-run summaries', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MLGym', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.match(text, /(?:13-task paper registry|论文注册表 13 项任务).*(?:Selection recipe absent|未报告选择方法)/isu);
    assert.match(text, /HF.*(?:Drive\/local|Drive\/本地).*(?:Hashes and global QC absent|无哈希和全局 QC)/isu);
    assert.match(text, /0756348.*18.*7.*YAML.*261/isu);
    assert.match(text, /(?:Mutable data|可变数据).*latest/isu);
    assert.match(text, /(?:Broken Launchers|启动入口失配).*Agent YAML.*(?:alias|别名).*3SAT.*--config_file/isu);
    assert.match(text, /9d40c1b.*19\s*\/\s*8.*1,?506/isu);
    assert.match(text, /(?:Non-root Docker\/Podman|非 root Docker\/Podman).*(?:Read-only data and evaluator|数据与评估器只读).*SWE-Agent ReAct.*50/isu);
    assert.match(text, /(?:Append valid metric|追加有效指标).*(?:No valid score: failed|无有效分数：失败).*(?:Prior score \+ error: incomplete|已有分数 \+ 错误：未完成)/isu);
    assert.match(text, /(?:independent seeds|独立种子).*(?:seed remains 42|种子 42)/isu);
    assert.match(text, /(?:Best attempt: any valid|最佳尝试：任一有效值).*(?:Paper final|论文最终).*agent\[-1\]/isu);
    assert.match(text, /(?:Baseline feasibility|基线可行性).*ε\s*=\s*0\.05.*(?:Step-area AUP|阶梯 AUP)/isu);
    for (const edge of [
      'b1->b2:primary',
      'b3->r1:primary',
      'r1->r2:primary',
      'r2->r3:primary',
      'r2->d1:optional',
      'r3->e1:primary',
      'e1->e2:primary',
      'e3->d2:primary',
      'd2->e4:primary',
      'd2->d3:optional',
      'd3->e3:optional',
      'd3->e5:primary',
      'e5->e6:primary',
      'e7->s1:primary',
      's2->s3:primary',
      's3->s4:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MLVU paper-v3 task census, release/access drift, model-specific sampling, and macro metrics', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MLVU', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 25, `${language} nodes`);
    assert.equal(graph.edges.length, 28, `${language} edges`);
    assert.match(text, /986.*168.*60.*65.*239.*100.*72.*92.*60.*60.*70/isu);
    assert.match(text, /TR 355.*AR 239.*VS 257.*NQA 415.*ER 405.*PQA 589.*SSC 247.*AO 329.*AC 266/isu);
    assert.match(text, /1,?730.*3,?102.*2,?593.*509.*(?:7 MCQ.*2 Generation|7 类选择题.*2 类生成题).*(?:4 Options.*6|4 选项.*6 选项)/isu);
    assert.match(text, /ee8ac098.*(?:Test Gold Hidden|测试答案隐藏).*(?:2025-03-18).*(?:Auto-gated|门控).*CC BY-NC-SA 4\.0/isu);
    assert.match(text, /4bcc3c0.*4a16523.*10b31fa.*bc1a68d.*06ddc388.*dc6616b2/isu);
    assert.match(text, /(?:Paper v3: 9 Tasks|论文 v3：9 类任务).*509.*(?:11 Tasks|11 类任务).*588.*3,?181.*(?:Outside Paper Totals|不计入论文口径)/isu);
    assert.match(text, /(?:Uniform N Frames|均匀 N 帧).*(?:Fixed N fps|固定 N fps).*VideoChat2 16.*LLaMA-VID 1 fps.*GPT-4o 0\.5 fps.*(?:No Universal Frame Budget|无统一帧数预算)/isu);
    assert.match(text, /(?:Paper: Version\/Decoding Not Stated|论文未说明版本\/解码参数).*gpt-4-turbo.*(?:Temperature|temperature) 0/isu);
    assert.match(text, /M-Avg.*(?:Mean of 7 Task Accuracies|七类任务准确率的平均值).*(?:Unweighted Macro Mean|不按题量加权的宏平均)/isu);
    assert.match(text, /SSC.*(?:Accuracy|准确性).*1–5.*(?:Relevance|相关性).*2–10/isu);
    assert.match(text, /VS.*(?:Completeness|完整性).*1–5.*(?:Reliability|可靠性).*2–10.*Correctness/isu);
    assert.match(text, /G-Avg.*SSC.*VS.*\/\s*2.*(?:Unweighted Macro Mean|不加权宏平均)/isu);
    assert.match(text, /(?:No Seed\/Decode\/Repeats\/Variance|无种子\/解码参数\/重复次数\/方差).*choice_bench\.py.*pred.*(?:No Combined G-Avg Script|无合并 G-Avg 的脚本)/isu);
    for (const edge of [
      'b1->b2:primary',
      'b2->b3:primary',
      'b3->b4:primary',
      'b3->b5:primary',
      'b3->b6:primary',
      'b4->r1:primary',
      'r1->r2:primary',
      'r2->r4:secondary',
      'r2->r5:secondary',
      'r2->d1:secondary',
      'r2->e1:primary',
      'e1->e2:primary',
      'e2->e3:primary',
      'e2->e4:primary',
      'e4->e5:primary',
      'e6->s1:primary',
      's1->s2:primary',
      's3->s5:primary',
      's4->s5:primary',
      'e6->s6:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MM-BrowseComp paper census, encrypted release, evaluator denominators, and post-paper drift', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MM-BrowseComp', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 30, `${language} nodes`);
    assert.equal(graph.edges.length, 30, `${language} edges`);
    assert.match(text, /(?:Paper v1|论文 v1).*2025-08-14.*5f5298c.*(?:6 Days|6 天).*cf82a23/isu);
    assert.match(text, /22.*(?:5 Broad Categories|5 个大类).*(?:20 Master's \/ PhD|20 名硕士或博士)/isu);
    assert.match(text, /(?:Known Verified Fact|已知可核验事实).*(?:Authoritative Sources|权威的信息来源).*(?:Concise.*Gold Answer|黄金答案简短)/isu);
    assert.match(text, /(?:Essential Evidence Is Visual|必要证据存在于视觉模态).*(?:Missing from All Text Sources|所有文本来源均不含).*(?:No Text-only Shortcut|消除纯文本捷径)/isu);
    assert.match(text, /Gemini-2\.5-Pro\s*\/\s*GPT-4o.*(?:(?:Web\s*×1.*Both Fail)|(?:联网\s*1\s*次.*均失败)).*(?:(?:Web\s*≤5\s*min.*Still Unresolved)|(?:联网\s*≤5\s*分钟.*仍未解决))/isu);
    assert.match(text, /300.*161.*53\.7%.*63.*21\.0%.*76.*25\.3%.*224/isu);
    assert.match(text, /224.*22.*5.*11.*130\/224.*58\.0%/isu);
    assert.match(text, /(?:Question \/ Answer \/ Checklist Encrypted|问题 \/ 答案 \/ 清单均加密).*(?:No Decrypted Plaintext Online|不得在网上公开解密明文).*MIT.*(?:No LICENSE|无 LICENSE)/isu);
    assert.match(text, /(?:Tool-free|无工具).*224.*(?:Official|官方).*224.*(?:Open-source|开源).*54.*(?:Subtask-uniform|按子任务均匀)/isu);
    assert.match(text, /GPT-4o-2024-11-20.*(?:No Original Images|不含原始图像).*25,?000/isu);
    assert.match(text, /CHECKLIST_SCORE.*CHECKLIST_RESULT.*OVERALL_CORRECTNESS.*(?:Only Missing OVERALL|仅缺少 OVERALL).*parser_error/isu);
    assert.match(text, /(?:Pre-judge.*skip_evaluated.*Excluded|裁判前失败.*skip_evaluated.*排除).*(?:Judge Failure Still in OA \/ SA Denom|裁判失败仍计入 OA \/ SA 分母).*(?:Numeric c\/t Only|仅含数值 c\/t)/isu);
    assert.match(text, /OA.*SA.*AVG CS.*224.*54/isu);
    assert.match(text, /29\.02%.*19\.64%.*36\.49%/isu);
    assert.match(text, /(?:Post-paper Drift.*Excluded|论文后漂移.*排除).*400.*224.*176/isu);
    assert.match(text, /(?:16-run TTS|16 次测试时扩展).*(?:Majority|多数).*(?:Best-of-N).*(?:Not Pass@1|非 Pass@1)/isu);
    assert.match(text, /(?:54-subset IDs \/ Seed Not Released|未发布 54 题子集 ID 与种子).*(?:Conclusion 244|结论 244).*224/isu);
    for (const edge of [
      'b1->b2:primary',
      'b5->b6:primary',
      'b6->b7:primary',
      'q2->q3:primary',
      'q4->q5:primary',
      'q5->r1:primary',
      'r1->r2:primary',
      'r2->e1:primary',
      'e2->e3:primary',
      'e5->e6:primary',
      'e6->e7:primary',
      'm2->m3:primary',
      'm3->m4:primary',
      'r1->a1:data',
      'r2->a2:data',
      'e4->a3:optional',
      'e6->a4:data',
      'm3->a4:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MM-IFEval construction, audited TSV, four evaluator paths, asymmetric failures, and judge drift', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MM-IFEval', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 20, `${language} nodes`);
    assert.equal(graph.edges.length, 20, `${language} edges`);
    assert.match(text, /CC3M.*ALLaVA.*RICO.*MultiUI.*ChartQA.*Geo170k/isu);
    assert.match(text, /(?:Low Resolution|低分辨率).*(?:Semantic Richness|语义丰富度).*IC9600.*RAM.*(?:Thresholds.*Unstated|阈值.*未说明)/isu);
    assert.match(text, /16.*GPT-4o.*(?:6 Categories|6 大类).*32.*(?:LLM Reselects|LLM 重选).*(?:Human Annotation|人工标注).*(?:Conflict Post-processing|冲突后处理)/isu);
    assert.match(text, /400.*300 C.*5\.1.*100 P.*13/isu);
    assert.match(text, /687.*400.*287.*1,?524.*489.*748.*287.*973bb839/isu);
    assert.match(text, /(?:C: Image|C：图像).*(?:P: Image|P：图像).*(?:Aux: Remove One Constraint|辅助：移除一项约束)/isu);
    assert.match(text, /(?:Evaluation \/ Failure Router|评测 \/ 失败路由).*(?:Rule · Direct · Cmp · P|规则 · 直接 · 对比 · P).*(?:Direct ×4 · Cmp\/P ×3|直接 ×4 · 对比\/P ×3).*(?:Unbound ans May Abort|ans 未赋值可中止).*(?:Parser Policy Differs by Route|解析策略因路径而异)/isu);
    assert.match(text, /(?:10 Algorithmic Subcategories|10 个算法子类).*(?:String Cast|字符串化).*(?:No Fallback; Exceptions Propagate|异常传播；无兜底)/isu);
    assert.match(text, /(?:Direct Judge|直接 Judge).*(?:Image|图像).*x\/y.*(?:Outer Retry ×3|外层最多 3 轮).*(?:API Exhaustion Can Abort|API 耗尽可中止)/isu);
    assert.match(text, /(?:Comparative Judge|对比 Judge).*(?:No Image|无图).*Summary.*(?:Skip; No Outer Retry|跳过且不外层重试).*(?:Shrinks Denominator|缩小分母)/isu);
    assert.match(text, /(?:Cmp Parse Error Shrinks Denom|对比解析错会缩小分母).*(?:Missing total_score → C Adds 0|缺 total_score：C 汇总加 0)/isu);
    assert.match(text, /(?:Gold Substrings|标准子串).*(?:Outer Retry ×3|外层最多 3 轮).*(?:No total_score Aborts Aggregate|缺 total_score：汇总中止)/isu);
    assert.match(text, /C\s*=.*300.*P\s*=.*100.*Overall\s*=\s*\(300C \+ 100P\)\/400.*(?:0-1|0-1).*(?:Percent|百分比)/isu);
    assert.match(text, /(?:Partly Public|部分公开).*(?:TSV License Unknown|TSV 许可未知).*(?:No Row Provenance\/Image Rights|无逐行来源\/图像权利).*MMIF-23k.*(?:16 vs 18|16 vs 附录 18)/isu);
    assert.match(text, /(?:Paper: Judge Snapshot Unpinned|论文未固定 Judge 快照).*GPT-4o-2024-11-20.*GPT-4o-mini.*(?:README 05-13|README 05-13).*(?:Mutable Alias|可变别名)/isu);
    for (const edge of [
      'evidence->sources:primary',
      'sources->image_qc:primary',
      'task_generation->taxonomy:primary',
      'integrate->human_review:primary',
      'conflict_qc->paper_release:primary',
      'paper_release->released_tsv:data',
      'released_tsv->inference:primary',
      'inference->eval_route:primary',
      'eval_route->rule_verify:data',
      'eval_route->direct_judge:data',
      'eval_route->compare_judge:data',
      'eval_route->p_judge:data',
      'rule_verify->c_item_score:primary',
      'direct_judge->c_item_score:primary',
      'compare_judge->c_item_score:primary',
      'c_item_score->aggregate:primary',
      'p_judge->aggregate:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact A11l paper, homepage, openness, leaderboard, and audited source revisions', () => {
  const expectedMetadata = new Map([
    ['MIA-Bench', {
      paper_url: 'https://arxiv.org/abs/2407.01509v5',
      homepage: 'https://github.com/apple/ml-mia-bench/tree/5422852d98cb167390da9501200360860435efb1',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MILU', {
      paper_url: 'https://arxiv.org/abs/2411.02538v3',
      homepage: 'https://github.com/AI4Bharat/MILU/tree/7d8e6c9102bf44ae9f9ee84cfabefb4cb8fa2e88',
      openness: 'partly public',
      has_leaderboard: false,
    }],
    ['MLGym', {
      paper_url: 'https://arxiv.org/abs/2502.14499v1',
      homepage: 'https://github.com/facebookresearch/MLGym/tree/075634859ec3ab16c56ca87678ec0fe564a27470',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MLVU', {
      paper_url: 'https://arxiv.org/abs/2406.04264v3',
      homepage: 'https://github.com/JUNJIE99/MLVU/tree/ee8ac0984f7cdfc53730a0aecde5c7ce457570fd',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MM-BrowseComp', {
      paper_url: 'https://arxiv.org/abs/2508.13186v1',
      homepage: 'https://github.com/MMBrowseComp/MM-BrowseComp/tree/5f5298cd0e84ac511ad1cda3840cef73773661cc',
      openness: 'partly public',
      has_leaderboard: false,
    }],
    ['MM-IFEval', {
      paper_url: 'https://arxiv.org/abs/2504.07957v2',
      homepage: 'https://syuan03.github.io/MM-IFEngine/',
      openness: 'partly public',
      has_leaderboard: false,
    }],
  ]);
  for (const [id, expected] of expectedMetadata) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, expected.paper_url, `${id} paper_url`);
    assert.equal(detail.homepage, expected.homepage, `${id} homepage`);
    assert.equal(detail.openness, expected.openness, `${id} openness`);
    assert.equal(detail.has_leaderboard, expected.has_leaderboard, `${id} leaderboard`);
  }

  assert.match(readDetail('MIA-Bench').drawio_review_note, /5422852d98cb167390da9501200360860435efb1.*f75671cde32c84ee1791eda74994f15eaf48530333a65f3b732006a1c7d055d2.*790964af82f87e88bd2b2d4d638332a9cdeabd490976aec305117eba53d08244/isu);
  assert.match(readDetail('MILU').drawio_review_note, /7d8e6c9102bf44ae9f9ee84cfabefb4cb8fa2e88.*683a6703bc2405e62bdc997fc5178e38d11ccecc.*946c423e72cd2657674a7a65d739e212e9a5f876.*be958af51e203afa6628910b07ee164695be2f5f/isu);
  assert.match(readDetail('MLGym').drawio_review_note, /c734f3727a85a8cb7c4f118eae946a253e93624f32c170b086d14caf1fe857bc.*075634859ec3ab16c56ca87678ec0fe564a27470.*9d40c1b5035202018cd7091fb4e83a9c68b377c0/isu);
  assert.match(readDetail('MLVU').drawio_review_note, /653b5ca6a2c2c1f6ab2b4ee5033d1c9194897a968c6f304ad55a6b5d6e52d06f.*4bcc3c01d56db14a26a1efd8bb5caa2c496454d6.*4a16523b21784de0f83b32796612e3a58a7de8f2.*10b31fa1a363116ed42c466f7a2fa5e3786412c9/isu);
  assert.match(readDetail('MM-BrowseComp').drawio_review_note, /5f5298cd0e84ac511ad1cda3840cef73773661cc.*cf82a2390aa7a7ed3d96f72969d22548eff3e101.*224 unique rows.*400 unique IDs/isu);
  assert.match(readDetail('MM-IFEval').drawio_review_note, /e927327ac2e67bb0e51de125dd67efc77097d01fead107296f49affcd37d1ec5.*bb844a7f145934da4ed82077735736d02bfafca4.*d4900dd5d39a162ad77477959777a9e4e9e0163d.*a039b677c682adfdd1b66170390b3e092efaece9.*7055d3010c38ccb5dcae1bc9535ca19c7fe5d79f/isu);
});

test('keeps every A11l fallback byte-synchronized with the reviewed source spec', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readSpec(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for every reviewed A11l node', () => {
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
      for (const node of readSpec(id, language).nodes) {
        for (const line of node.label.split(/\r?\n/u)) {
          assert.ok(visibleText.includes(line), `${id}.${language}: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces exactly twelve A11l SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11l-exports-'));
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

test('strictly rebuilds and normalizes all twelve A11l specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11l-'));
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
