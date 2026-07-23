import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'MM-MTBench',
  'MMAU',
  'MMBench',
  'MMBench-CN',
  'MMBench-EN',
  'MMBench-V1.1',
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

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function edgeSet(graph) {
  return new Set(graph.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
}

function edgeLabel(graph, from, to) {
  return graph.edges.find(edge => edge.from === from && edge.to === to)?.label;
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

test('keeps all six A11m packages bilingual with reviewed academic layout and synchronized formal topology', () => {
  const requiredNodes = new Map([
    ['MM-MTBench', ['evidence', 'paper_categories', 'hf_snapshot', 'failure_boundary', 'released_replay', 'score_parser', 'aggregation']],
    ['MMAU', ['evidence', 'source', 'filter', 'augmentation_prompt', 'finalize', 'release', 'paper_parse', 'code_failure', 'legacy_scorer']],
    ['MMBench', ['taxonomy', 'curated', 'english', 'translate', 'chinese', 'release', 'heuristic', 'circular', 'paper_lineage', 'code_audit']],
    ['MMBench-CN', ['taxonomy', 'en_release', 'translate', 'verify', 'cn_release', 'split', 'heuristic', 'circular', 'v11_audit', 'code_audit']],
    ['MMBench-EN', ['taxonomy', 'paper_pool', 'revision', 'split', 'heuristic', 'circular', 'count_audit', 'code_audit']],
    ['MMBench-V1.1', ['taxonomy', 'curated', 'split', 'heuristic', 'circular', 'version_audit', 'cn_audit', 'schema_audit', 'label_audit', 'code_audit']],
  ]);

  for (const id of benchmarkIds) {
    const specs = Object.fromEntries(['en', 'zh'].map(language => [language, readSpec(id, language)]));
    assert.deepEqual(positionedTopology(specs.zh), positionedTopology(specs.en), `${id} bilingual type and position`);
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal bilingual topology`);
    for (const language of ['en', 'zh']) {
      const spec = specs[language];
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
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

test('uses the academic default font or a valid numeric A11m override without ignored styles', () => {
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

  for (const language of ['en', 'zh']) {
    assert.ok(
      readSpec('MM-MTBench', language).nodes.every(node => node.style?.fontSize === 10),
      `MM-MTBench.${language} compact numeric override`,
    );
    assert.ok(
      readSpec('MMAU', language).nodes.every(node => node.style?.fontSize === undefined),
      `MMAU.${language} academic default font`,
    );
  }
});

test('keeps reviewed bilingual A11m node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 52]]) {
      for (const node of readSpec(id, language).nodes) {
        const nodeLimit = ['decision', 'formula'].includes(node.type) ? 90 : maxLineLength;
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= nodeLimit, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks MM-MTBench construction, pinned release drift, teacher-forced turns, and terminal failure semantics', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MM-MTBench', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 24, `${language} nodes`);
    assert.equal(graph.edges.length, 15, `${language} edges`);
    assert.match(text, /2410\.07073v2.*0d94c4ed.*caca64ff.*d61811fc.*70eecd8f/isu);
    assert.match(text, /(?:Five Image Categories|五类图像).*21.*19.*24.*20.*8.*92/isu);
    assert.match(text, /(?:Manually Curate|人工策展).*(?:Open-ended|开放式).*(?:Image Dependence|图像依赖)/isu);
    assert.match(text, /(?:Second Labeler Group|第二组标注员).*(?:Criteria Not Described|未描述复核准则).*(?:No Agreement|未报告一致性)/isu);
    assert.match(text, /69.*18.*4.*1.*92.*121/isu);
    assert.match(text, /92.*image.*conversation.*category.*(?:Top-level Nulls 0|顶层空值 0).*92.*92/isu);
    assert.match(text, /charts 21.*tables 24.*pdf_pages 19.*diagrams 20.*misc 8.*(?:swap|对调)/isu);
    assert.match(text, /(?:Gold Past Assistant|历史标准助手).*(?:Earlier Candidate Errors Cannot Propagate|前序候选错误不会传播)/isu);
    assert.match(text, /(?:Eight Parallel|8 个并行).*temperature\s*=\s*0.*4,?096.*(?:Three Attempts|三次尝试)/isu);
    assert.match(text, /(?:Whole Message Dictionaries|完整消息字典).*rolecontent.*(?:Image and Actual Question Are Omitted|图像与真实问题均被遗漏)/isu);
    assert.match(text, /gpt-4o-2024-05-13.*temperature\s*=\s*0.*2,?048.*\[\[rating\]\]/isu);
    assert.match(text, /(?:Integer or Decimal|整数或小数).*(?:No 1-to-10 Range Validation|不验证一至十分范围).*-1 sentinel/isu);
    assert.match(text, /(?:Retry Forever|无限重试).*(?:Third Judge API Exception|第三次评判 API 异常).*(?:Aborts Run|中止整跑)/isu);
    assert.match(text, /(?:Micro|Micro).*121.*(?:Five Category|五个类别).*(?:Four Turn|四个轮次).*(?:Nine Means|九个均值)/isu);
    for (const edge of [
      'evidence->use_cases:primary',
      'paper_categories->manual_curation:primary',
      'answer_verification->conversations:primary',
      'paper_output->hf_snapshot:primary',
      'hf_snapshot->expand_turns:primary',
      'expand_turns->candidate_query:primary',
      'candidate_answers->released_replay:primary',
      'released_replay->judge_api:primary',
      'judge_api->score_parser:primary',
      'score_parser->aggregation:primary',
      'aggregation->output:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MMAU seven-stage curation, 10,000-item release, five-order vote, and hosted denominator boundaries', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MMAU', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 30, `${language} nodes`);
    assert.equal(graph.edges.length, 29, `${language} edges`);
    assert.match(text, /2410\.19168v1.*bd099996.*110127f.*70339a4/isu);
    assert.match(text, /13.*12.*(?:Synthetic|合成).*10,?000/isu);
    assert.match(text, /AudioSet 2,?788.*Strong 391.*MUStARD 405.*MELD 540.*VoxCeleb-1 633.*IEMOCAP 515/isu);
    assert.match(text, /MusicBench 1,?937.*Jamendo 32.*SDD 277.*MusicCaps 514.*GuitarSet 506.*MUSDB18 68.*(?:Synthetic|合成) 1,?394/isu);
    assert.match(text, /90.*(?:Candidate Tasks|候选任务).*27.*(?:feasible|可行)/isu);
    assert.match(text, /(?:Expert Annotation|专家标注).*(?:English MCQ|英文多选).*(?:Reasoning|推理).*(?:Domain Knowledge|领域知识)/isu);
    assert.match(text, /(?:Separate Team|独立团队).*(?:Annotation \+ Filtering Pool|标注与过滤为同一组).*(?:Two Pools × 3|两组各 3 人).*(?:Checks Twice|检查两遍)/isu);
    assert.match(text, /(?:(?:800.*11,?000)|(?:11,?000.*800)).*GPT-4.*6.*(?:distractors|干扰项).*200/isu);
    assert.match(text, /(?:No Agreement|无一致性).*(?:No Dedup|无去重).*(?:6.*distractors|6 个干扰项).*(?:Approximate|近似)/isu);
    assert.match(text, /(?:Exactly 10,000|精确选择 10,000).*27.*(?:Three Domains|三个音频领域).*1,?000.*9,?000/isu);
    assert.match(text, /11.*3,?499.*16.*6,?501.*10.*10.*7.*22%.*56%.*22%/isu);
    assert.match(text, /70.*8.*Parquet.*9,?000.*1,?000.*15,?423,?652,?641/isu);
    assert.match(text, /id.*192 kHz.*question.*choices.*answer.*dataset.*task.*split.*category.*sub-category.*difficulty.*NA/isu);
    assert.match(text, /(?:Paper v1|论文 v1).*11\s*\/\s*16.*(?:Project Pages|项目页).*12\s*\/\s*15.*MMAU-v05\.15\.25.*25%.*5%/isu);
    assert.match(text, /(?:Shuffle Options Five Times|选项顺序打乱五次).*(?:Seed.*Unreported|随机种子.*未报告)/isu);
    assert.match(text, /(?:Robust Regular Expressions|稳健正则表达式).*(?:Exact Regex.*Unreleased|精确正则.*未发布)/isu);
    assert.match(text, /(?:Majority Vote over Five Orders|五种顺序多数票).*(?:Tie Handling Unreported|平票处理未报告)/isu);
    assert.match(text, /(?:Micro-averaged Accuracy|微平均准确率).*(?:Correct Questions|正确题数).*(?:Not a Macro-average|不是.*宏平均)/isu);
    assert.match(text, /70339a4.*(?:Private Ground Truth|私有标准答案).*model_prediction.*(?:No Revision Pin|未固定 revision).*(?:Does Not Run Prompts|不运行提示)/isu);
    assert.match(text, /(?:Require Every Gold Token|必须包含全部标准答案词元).*(?:Reject Tokens Unique|排斥错误选项独有词元).*(?:Allow Other Tokens|允许其他词元)/isu);
    assert.match(text, /(?:Unknown \/ Missing IDs Skipped|未知 \/ 缺失 id 被跳过).*(?:Empty \/ Missing Prediction = Wrong|空 \/ 缺预测记错).*(?:Submitted Overlap Only|仅以提交重叠项为分母).*(?:Duplicate IDs Recounted|重复 id 重复计数).*(?:Zero Overlap Errors|零重叠报错)/isu);
    assert.match(text, /7468292.*model_output.*model_prediction.*(?:Missing Key Skipped|缺键被跳过).*(?:Divides by Zero|除零).*choices.*(?:String|字符串)/isu);
    for (const edge of [
      'evidence->source:primary',
      'source->tasks:primary',
      'tasks->annotate:primary',
      'annotate->filter:primary',
      'filter->augment:primary',
      'augment->review:primary',
      'review->finalize:primary',
      'finalize->prompt_sets:primary',
      'prompt_sets->permute:primary',
      'permute->infer:primary',
      'infer->paper_parse:primary',
      'paper_parse->vote:primary',
      'vote->best_prompt:primary',
      'best_prompt->micro:primary',
      'micro->report:primary',
      'source->source_real_a:data',
      'filter->qc_disclosure:data',
      'release->version_boundary:data',
      'paper_parse->code_snapshot:data',
      'code_match->code_failure:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MMBench v1.1 construction, bilingual alignment, logical-item denominator, and family version boundaries', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MMBench', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 19, `${language} nodes`);
    assert.equal(graph.edges.length, 21, `${language} edges`);
    assert.match(text, /2.*L1.*6.*L2.*20.*L3/isu);
    assert.match(text, /10–20.*(?:per L3|每个 L3)/isu);
    assert.match(text, /(?:Student volunteers|学生志愿者).*(?:80%|80%).*(?:20%|20%).*(?:validation|验证集)/isu);
    assert.match(text, /(?:main: LLM majority|正文：LLM 多数).*(?:Appendix B: 3 of 3 \+ human|附录 B：3\/3 \+ 人工)/isu);
    assert.match(text, /(?:none of 5 VLMs correct|5 个 VLM 均未答对).*CircularEval.*(?:human|人工)/isu);
    assert.match(text, /3,?217.*(?:at least 125 per L3|每个 L3 至少 125)/isu);
    assert.match(text, /(?:English original|英文原版).*(?:option order|选项顺序).*(?:GPT-4 translation|GPT-4 翻译).*(?:human verified|人工核验)/isu);
    assert.match(text, /DEV 1,?292.*TEST 1,?925.*4:6/isu);
    assert.match(text, /(?:Zero-shot open generation|零样本开放式生成).*(?:optional hint|可选提示)/isu);
    assert.match(text, /gpt-4-0125.*(?:option or Z|选项或 Z)/isu);
    assert.match(text, /CircularEval.*(?:all passes must be correct|各轮全对才算正确)/isu);
    assert.match(text, /(?:Logical-item accuracy|逻辑题准确率).*(?:micro overall|总体微平均).*L2\/L3.*(?:one hit per base question|每道原题计一个 hit)/isu);
    assert.match(text, /v1–v3.*2,?974.*v1\.0.*2,?948/isu);
    assert.match(text, /(?:3 failed judge retries|判题重试 3 次均失败).*(?:random valid choice or Z|随机有效选项或 Z)/isu);
    if (language === 'en') {
      assert.match(graph.nodes.find(node => node.id === 'raw').label, /question \+ optional hint/u);
    }
    assert.equal(edgeLabel(graph, 'heuristic', 'circular'), language === 'en' ? 'Yes' : '是');
    assert.equal(edgeLabel(graph, 'heuristic', 'gpt'), language === 'en' ? 'No' : '否');
    for (const edge of [
      'taxonomy->seeds:primary',
      'seeds->collection:primary',
      'raw->text_qc:primary',
      'raw->wrong_qc:primary',
      'text_qc->curated:primary',
      'wrong_qc->curated:primary',
      'curated->english:primary',
      'curated->translate:primary',
      'translate->chinese:primary',
      'english->release:primary',
      'chinese->release:primary',
      'heuristic->circular:primary',
      'heuristic->gpt:primary',
      'circular->score:primary',
      'curated->paper_lineage:secondary',
      'score->code_audit:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MMBench-CN to the 2,948-item v1.0 translation and its 1,164/1,784 split', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MMBench-CN', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 19, `${language} nodes`);
    assert.equal(graph.edges.length, 20, `${language} edges`);
    assert.match(text, /2.*L1.*6.*L2.*20.*L3.*10–20/isu);
    assert.match(text, /(?:English v1\.0 source|英文 v1\.0 来源).*2,?948.*(?:October 2023|2023 年 10 月)/isu);
    assert.match(text, /GPT-4.*(?:question \+ choices|问题 \+ 选项).*(?:names.*symbols.*code|专名、符号与代码)/isu);
    assert.match(text, /(?:Human verification|人工核验).*(?:validity|有效性).*(?:correctness|正确性).*(?:alignment|对齐)/isu);
    assert.match(text, /MMBench-CN v1\.0.*(?:images|图像).*(?:base IDs|原题 ID).*(?:answers|答案)/isu);
    assert.match(text, /DEV 1,?164.*(?:labels open|金标公开).*TEST 1,?784.*(?:labels hidden|金标隐藏)/isu);
    assert.match(text, /CircularEval.*(?:all passes must be correct|各轮全对才算正确)/isu);
    assert.match(text, /(?:Logical-item accuracy|逻辑题准确率).*(?:micro overall|总体微平均).*L2\/L3.*(?:official test submission|官方提交)/isu);
    assert.match(text, /CN v1\.1\s*=\s*3,?217.*(?:separate|分开)/isu);
    assert.match(text, /v1\.0 TSV.*source\/comment.*(?:base id|原题 ID)/isu);
    assert.match(text, /(?:3 failed judge retries|判题重试 3 次均失败).*(?:random valid choice or Z|随机有效选项或 Z)/isu);
    assert.equal(edgeLabel(graph, 'heuristic', 'circular'), language === 'en' ? 'Yes' : '是');
    assert.equal(edgeLabel(graph, 'heuristic', 'gpt'), language === 'en' ? 'No' : '否');
    for (const edge of [
      'taxonomy->seeds:primary',
      'seeds->collection:primary',
      'raw->text_qc:primary',
      'raw->wrong_qc:primary',
      'text_qc->en_release:primary',
      'wrong_qc->en_release:primary',
      'en_release->translate:primary',
      'translate->verify:primary',
      'verify->cn_release:primary',
      'cn_release->split:primary',
      'heuristic->circular:primary',
      'heuristic->gpt:primary',
      'circular->score:primary',
      'cn_release->v11_audit:secondary',
      'split->schema_audit:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MMBench-EN to the October-2023 v1.0 files instead of the 2,974 prose or v1.1 counts', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MMBench-EN', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 17, `${language} nodes`);
    assert.equal(graph.edges.length, 18, `${language} edges`);
    assert.match(text, /2.*L1.*6.*L2.*20.*L3.*10–20/isu);
    assert.match(text, /(?:80%|80%).*(?:20%|20%).*(?:validation|验证集)/isu);
    assert.match(text, /(?:Paper v1–v3 pool|论文 v1–v3 题池).*2,?974.*20.*L3/isu);
    assert.match(text, /(?:October-2023 revision|2023 年 10 月修订).*(?:20\+|20 多).*2,?948/isu);
    assert.match(text, /MMBench-EN v1\.0.*DEV 1,?164.*(?:labels open|金标公开).*TEST 1,?784.*(?:labels hidden|金标隐藏)/isu);
    assert.match(text, /gpt-4-0125.*(?:option or Z|选项或 Z).*CircularEval.*(?:all passes must be correct|各轮全对才算正确)/isu);
    assert.match(text, /(?:Logical-item accuracy|逻辑题准确率).*(?:micro overall|总体微平均).*L2\/L3/isu);
    assert.match(text, /2,?974.*(?:≠|≠).*2,?948.*v1\.1.*(?:not this ID|不属于此 ID)/isu);
    assert.match(text, /v1\.0 TSV.*source\/comment.*(?:base id|原题 ID)/isu);
    assert.match(text, /(?:3 failed judge retries|判题重试 3 次均失败).*(?:random valid choice or Z|随机有效选项或 Z)/isu);
    assert.equal(edgeLabel(graph, 'heuristic', 'circular'), language === 'en' ? 'Yes' : '是');
    assert.equal(edgeLabel(graph, 'heuristic', 'gpt'), language === 'en' ? 'No' : '否');
    for (const edge of [
      'taxonomy->seeds:primary',
      'seeds->collection:primary',
      'raw->text_qc:primary',
      'raw->wrong_qc:primary',
      'text_qc->paper_pool:primary',
      'wrong_qc->paper_pool:primary',
      'paper_pool->revision:primary',
      'revision->split:primary',
      'heuristic->circular:primary',
      'heuristic->gpt:primary',
      'circular->score:primary',
      'revision->count_audit:secondary',
      'split->schema_audit:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MMBench-V1.1 to 3,217 logical items and preserves schema, label, and evaluator drift', () => {
  for (const language of ['en', 'zh']) {
    const graph = readSpec('MMBench-V1.1', language);
    const text = labels(graph);
    const edges = edgeSet(graph);
    assert.equal(graph.nodes.length, 18, `${language} nodes`);
    assert.equal(graph.edges.length, 19, `${language} edges`);
    assert.match(text, /2.*L1.*6.*L2.*20.*L3.*10–20/isu);
    assert.match(text, /(?:main: LLM majority|正文：LLM 多数).*(?:3 of 3 \+ human|3\/3 \+ 人工)/isu);
    assert.match(text, /(?:none of 5 VLMs correct|5 个 VLM 均未答对).*CircularEval.*(?:human|人工)/isu);
    assert.match(text, /MMBench v1\.1.*3,?217.*(?:at least 125 per L3|每个 L3 至少 125)/isu);
    assert.match(text, /DEV 1,?292.*TEST 1,?925.*4:6/isu);
    assert.match(text, /gpt-4-0125.*(?:option or Z|选项或 Z).*CircularEval.*(?:all passes must be correct|各轮全对才算正确)/isu);
    assert.match(text, /(?:Logical-item accuracy|逻辑题准确率).*(?:micro overall|总体微平均).*L2\/L3.*(?:one hit per base question|每道原题计一个 hit)/isu);
    assert.match(text, /v1–v3.*2,?974.*v1\.0.*2,?948/isu);
    assert.match(text, /(?:Chinese v1\.1 sibling|中文 v1\.1 对应版).*(?:base IDs|原题 ID).*(?:GPT-4 \+ human|GPT-4 \+ 人工)/isu);
    assert.match(text, /v1\.1 TSV.*(?:source\/comment omitted|不含 source\/comment).*index mod 1e6/isu);
    assert.match(text, /(?:Mutable TEST endpoint|可变 TEST 端点).*(?:labels hidden|金标隐藏).*(?:2026.*includes answer|2026.*含 answer)/isu);
    assert.match(text, /(?:3 failed judge retries|判题重试 3 次均失败).*(?:random valid choice or Z|随机有效选项或 Z)/isu);
    assert.equal(edgeLabel(graph, 'heuristic', 'circular'), language === 'en' ? 'Yes' : '是');
    assert.equal(edgeLabel(graph, 'heuristic', 'gpt'), language === 'en' ? 'No' : '否');
    for (const edge of [
      'taxonomy->seeds:primary',
      'seeds->collection:primary',
      'raw->text_qc:primary',
      'raw->wrong_qc:primary',
      'text_qc->curated:primary',
      'wrong_qc->curated:primary',
      'curated->split:primary',
      'heuristic->circular:primary',
      'heuristic->gpt:primary',
      'circular->score:primary',
      'curated->version_audit:secondary',
      'split->cn_audit:secondary',
      'prompt->schema_audit:secondary',
      'circular->label_audit:secondary',
      'score->code_audit:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact reviewed A11m metadata and audited source revisions', () => {
  const expectedMetadata = new Map([
    ['MM-MTBench', {
      paper_url: 'https://arxiv.org/abs/2410.07073v2',
      homepage: 'https://huggingface.co/datasets/mistralai/MM-MT-Bench/tree/0d94c4edef2c971a37c1407a9b99dcdf9003410b',
      openness: 'partly public',
      has_leaderboard: false,
    }],
    ['MMAU', {
      paper_url: 'https://arxiv.org/abs/2410.19168v1',
      homepage: 'https://sakshi113.github.io/mmau_homepage/',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MMBench', {
      paper_url: 'https://arxiv.org/abs/2307.06281v5',
      homepage: 'https://github.com/open-compass/MMBench/tree/8eaac9ae42e22eaf42863b218455acd51268ba1c',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MMBench-CN', {
      paper_url: 'https://arxiv.org/abs/2307.06281v5',
      homepage: 'https://github.com/open-compass/MMBench/tree/8eaac9ae42e22eaf42863b218455acd51268ba1c',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MMBench-EN', {
      paper_url: 'https://arxiv.org/abs/2307.06281v5',
      homepage: 'https://github.com/open-compass/MMBench/tree/8eaac9ae42e22eaf42863b218455acd51268ba1c',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MMBench-V1.1', {
      paper_url: 'https://arxiv.org/abs/2307.06281v5',
      homepage: 'https://github.com/open-compass/VLMEvalKit/tree/7055d3010c38ccb5dcae1bc9535ca19c7fe5d79f',
      openness: 'partly public',
      has_leaderboard: true,
    }],
  ]);
  for (const [id, expected] of expectedMetadata) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, expected.paper_url, `${id} paper_url`);
    assert.equal(detail.homepage, expected.homepage, `${id} homepage`);
    assert.equal(detail.openness, expected.openness, `${id} openness`);
    assert.equal(detail.has_leaderboard, expected.has_leaderboard, `${id} leaderboard`);
  }

  assert.match(readDetail('MM-MTBench').drawio_review_note, /c8fcdb62a737ee93274c601d30a5ad0bf10f16ff7b52bd1980beb0266e93fff8.*0d94c4edef2c971a37c1407a9b99dcdf9003410b.*caca64ff448d2f45e563795b610638f336dc1702f7880b6eb053bdffb4ef76c4.*d61811fcd34b7802109538bacc28e70d8633f261/isu);
  assert.match(readDetail('MMAU').drawio_review_note, /455dbfa3f7cb020120e3e0d0c624f707324e9596dd3b26b8c82e9b855580d41a.*bd09999670e77f5452c23a09435ee437bd0e1406.*110127f54c0dfba3faa5ec9feee4a7e4148679c5.*74682927cf7f434cc9ed585b1f8a5e6150381e91.*70339a493a44c7db3d847e07fc8fc2b1f1adb9f8/isu);
  assert.match(readDetail('MMBench').drawio_review_note, /3cd9025569600c548d29a987e1cef6bdac8dc07cdeb6bd49ef04690ae80ebd6b.*8eaac9ae42e22eaf42863b218455acd51268ba1c.*3,217.*2,974.*2,948.*gpt-4-0125.*random valid choice or Z/isu);
  assert.match(readDetail('MMBench-CN').drawio_review_note, /8eaac9ae42e22eaf42863b218455acd51268ba1c.*1,164.*1,784.*2,948.*08b8fc3324a5ed74155350f57be69fbd.*\b7e1239baf0ee4c8b513e19705a0f317e\b.*gpt-4-0125/isu);
  assert.match(readDetail('MMBench-EN').drawio_review_note, /8eaac9ae42e22eaf42863b218455acd51268ba1c.*347c4854b06a87c8ed91ad6d7f3dd2b0385579da.*9d5a0d59773e38b2fb346d8a37a6e7e19148d504.*2,974.*2,948.*b6caf1133a01c6bb705cf753bb527ed8.*6939fadb0ce626fefc0bdc9c64efc528/isu);
  assert.match(readDetail('MMBench-V1.1').drawio_review_note, /3cd9025569600c548d29a987e1cef6bdac8dc07cdeb6bd49ef04690ae80ebd6b.*7055d3010c38ccb5dcae1bc9535ca19c7fe5d79f.*30c05be8f2f347a50be25aa067248184.*8d1a704e791df6f5d9fb3ef782b65365.*0bccf4527f5eb4c2d5837a6492e379f4ca1be63f.*aab598a927c183aa6657de9097e2be09.*answer/isu);
});

test('keeps every A11m fallback byte-synchronized with the reviewed source spec', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readSpec(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for every reviewed A11m node', () => {
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

test('reproduces exactly twelve A11m SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11m-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(readFileSync(generatedSvg, 'utf8'), readFileSync(`${base}.svg`, 'utf8'), `${id}.${language}.svg`);
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

test('strictly rebuilds and normalizes all twelve A11m specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11m-'));
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
