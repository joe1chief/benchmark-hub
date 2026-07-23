import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PersonQA', 'PopQA'];
const expectedCounts = new Map([
  ['PersonQA', { nodes: 16, edges: 16, secondary: 5 }],
  ['PopQA', { nodes: 25, edges: 25, secondary: 6 }],
]);
const expectedNodeIds = new Map([
  ['PersonQA', [
    'source_evidence', 'disclosure_scope', 'task_definition', 'category_scope',
    'internal_set', 'model_snapshot', 'model_response', 'attempted_scope',
    'accuracy', 'hallucination', 'report', 'freshness_audit', 'claim_tradeoff',
    'construction_boundary', 'evaluation_boundary', 'release_boundary',
  ]],
  ['PopQA', [
    'source_evidence', 'factual_scope', 'relations', 'weighted_sampling',
    'relation_cap', 'template_authoring', 'question_instantiation', 'answer_closure',
    'pageviews', 'fixed_release', 'prompt_config', 'memory_gate', 'vanilla',
    'retrieval', 'generate', 'code_scorer', 'report', 'adaptive_split', 'threshold',
    'adaptive_gate', 'adaptive_report', 'release_boundary', 'prompt_boundary',
    'scorer_boundary', 'adaptive_boundary',
  ]],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function edgeKey(from, to, type = 'primary') {
  return `${from}|${to}|${type}`;
}

function assertEdges(graph, expected, context) {
  const actual = new Set(graph.edges.map(edge => edgeKey(edge.from, edge.to, edge.type)));
  for (const [from, to, type = 'primary'] of expected) {
    assert.ok(actual.has(edgeKey(from, to, type)), `${context} missing ${from}->${to} (${type})`);
  }
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
    const label = mermaidLabel(edge.label ?? '').replace(/\|/gu, '&#124;').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${label}|` : '-->')
      : (label ? `-. ${label} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

test('keeps PersonQA and PopQA bilingual, topology-locked, and source-stage safe', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    for (const graph of [en, zh]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
      assert.equal(graph.nodes.length, expected.nodes, `${id} node count`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      assert.equal(
        graph.edges.filter(edge => edge.type === 'secondary').length,
        expected.secondary,
        `${id} secondary count`,
      );
      assert.ok(graph.nodes.every(node => String(node.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} edge-label clutter`);
    }

    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.deepEqual(en.nodes.map(node => node.id), expectedNodeIds.get(id), `${id} semantic node order`);
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of en.nodes) {
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 50, `${id}.${node.id} English line width: ${line}`);
      }
    }
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 38, `${id}.${node.id} Chinese line width: ${line}`);
      }
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'primary')) {
      assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} stays primary`);
    }

    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 3_000, `${id} review evidence`);
  }
});

test('locks PersonQA to disclosed system-card facts and explicit non-release boundaries', () => {
  const detail = readDetail('PersonQA');
  const en = readSpec('PersonQA', 'en');

  assert.equal(detail.paper_url, 'https://openai.com/index/openai-o1-system-card/');
  assert.equal(detail.arxiv_pdf_url, '');
  assert.equal(detail.pdf_cdn_url, 'https://cdn.openai.com/o1-system-card-20241205.pdf');
  assert.equal(detail.homepage, 'https://deploymentsafety.openai.com/o3/appendix');
  assert.equal(detail.repository_url, undefined);
  assert.equal(detail.dataset_url, undefined);
  assert.equal(detail.published, '2024-12');
  assert.match(nodeLabel(en, 'source_evidence'), /o1.*3ba7bdbe69e0.*Deep Research.*6662a84c7fdf.*o3 and o4-mini.*32d7ca19fff2/isu);
  assert.match(nodeLabel(en, 'disclosure_scope'), /No Standalone PersonQA Paper.*Official System Cards Only.*Do Not Infer/isu);
  assert.match(nodeLabel(en, 'task_definition'), /Questions About People.*Publicly Available Facts.*Attempted Answers/isu);
  assert.match(nodeLabel(en, 'category_scope'), /18 Fact Categories.*Names.*Not Disclosed.*Distribution.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'internal_set'), /Internal Evaluation Set.*Item Count.*Splits.*Not Public/isu);
  assert.match(nodeLabel(en, 'model_response'), /PersonQA Questions.*Natural-language Response/isu);
  assert.match(nodeLabel(en, 'attempted_scope'), /Attempted-answer Scope.*Refusal.*Abstention.*Not Disclosed/isu);
  assert.ok(
    nodeLabel(en, 'attempted_scope').split('\n').includes(
      'Refusal and Abstention Handling Is Not Disclosed',
    ),
    'refusal and abstention handling must carry its own non-disclosure qualifier',
  );
  assert.match(nodeLabel(en, 'accuracy'), /Did the Model Answer Correctly.*Higher Is Better.*Exact Grader.*Not Published/isu);
  assert.match(nodeLabel(en, 'hallucination'), /How Often the Model Hallucinated.*Lower Is Better.*Exact Grader.*Not Published/isu);
  assert.match(nodeLabel(en, 'freshness_audit'), /Out-of-date Test Facts.*Overstate Hallucination.*Children.*Careful Review/isu);
  assert.match(nodeLabel(en, 'claim_tradeoff'), /o3 Makes More Claims.*More Accurate.*More Hallucinated.*Cause.*Not Established/isu);
  assert.match(nodeLabel(en, 'construction_boundary'), /Source Selection.*Authoring.*Annotation.*Adjudication.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'evaluation_boundary'), /Prompt.*Parser.*Generation Settings.*Trial Count.*Not Disclosed/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /No Public Dataset.*Repository.*Public Git Commit.*Public Data Revision.*Hash.*Available/isu);
  assertEdges(en, [
    ['source_evidence', 'disclosure_scope', 'secondary'],
    ['disclosure_scope', 'task_definition'],
    ['task_definition', 'category_scope'],
    ['category_scope', 'internal_set'],
    ['internal_set', 'model_snapshot'],
    ['model_snapshot', 'model_response'],
    ['model_response', 'attempted_scope'],
    ['attempted_scope', 'accuracy'],
    ['model_response', 'hallucination'],
    ['accuracy', 'report'],
    ['hallucination', 'report'],
    ['report', 'freshness_audit'],
    ['report', 'claim_tradeoff', 'secondary'],
    ['internal_set', 'construction_boundary', 'secondary'],
    ['model_response', 'evaluation_boundary', 'secondary'],
    ['source_evidence', 'release_boundary', 'secondary'],
  ], 'PersonQA');
  assert.deepEqual(
    en.edges.find(edge => edge.from === 'report' && edge.to === 'claim_tradeoff')?.waypoints,
    [{ x: 1120, y: 640 }, { x: 730, y: 640 }],
    'interpretation boundary must drop below report before turning left',
  );
  assert.equal(
    en.edges.some(edge => edge.from === 'freshness_audit' && edge.to === 'claim_tradeoff'),
    false,
    'independent system-card observations must not be presented as a causal sequence',
  );
  assert.match(detail.intro_en, /internal.*no standalone paper.*18 categories.*publicly available facts.*attempted-answer accuracy.*hallucination rate/isu);
  assert.match(detail.scale_en, /18.*total item count.*not disclosed/isu);
  assert.match(detail.drawio_review_note, /3ba7bdbe69e022f6be0527edbfe18ac1becdea48d5be9891ab764ff336c8a033/u);
  assert.match(detail.drawio_review_note, /6662a84c7fdffc19ddecf969a7f00ba6216d7542b2dd9becd5354d6273da8f5a/u);
  assert.match(detail.drawio_review_note, /32d7ca19fff2ed0dc2d06f84e3143900bbd7898bb6f443c094477fb4ce0fc4ab/u);
  assert.match(detail.drawio_review_note, /does not have a standalone paper.*public repository.*public dataset/isu);
  assert.match(detail.drawio_review_note, /no public Git commit or public data revision.*honest absence.*not replaced by a fabricated hash.*does not claim.*internal revisions or hashes.*do not exist/isu);
  assert.match(detail.drawio_review_note, /does not disclose.*prompt.*parser.*grader.*generation.*attempt.*denominator/isu);
});

test('locks PopQA paper construction, pinned release, runner semantics, and adaptive protocol', () => {
  const detail = readDetail('PopQA');
  const en = readSpec('PopQA', 'en');
  const zh = readSpec('PopQA', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2212.10511v4');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2212.10511v4');
  assert.equal(
    detail.homepage,
    'https://github.com/AlexTMallen/adaptive-retrieval/tree/8172ab04794a1651488207c230286b0b3786d736',
  );
  assert.equal(detail.repository_url, detail.homepage);
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/akariasai/PopQA/tree/098765c79ea10a2cb19c828324e33281b8336ec0',
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2212\.10511v4.*6de64bcf9b19.*8172ab04794a.*098765c79ea1.*9a5227f41bff/isu);
  assert.match(nodeLabel(en, 'factual_scope'), /Open-domain Factual QA.*Subject.*Relation.*Object.*No Ground-truth Paragraph/isu);
  assert.match(nodeLabel(en, 'relations'), /16 Wikidata Relations.*occupation.*place of birth.*genre.*father.*country.*producer.*director.*capital of.*screenwriter.*composer.*color.*religion.*sport.*author.*mother/isu);
  assert.match(nodeLabel(en, 'weighted_sampling'), /Weight Sampling Toward Popularity.*f.*exp\(8R.*6\).*R.*Uniform.*800 MB.*C4.*Subject Aliases/isu);
  assert.match(nodeLabel(en, 'relation_cap'), /Stop Each Relation at 2,000.*Increase Relation-type Diversity/isu);
  assert.match(nodeLabel(en, 'template_authoring'), /Authors Manually Annotate.*One Final Natural-language Template per Relation.*Appendix Table 2.*All 16 Templates/isu);
  assert.match(nodeLabel(zh, 'template_authoring'), /作者人工标注模板.*每种关系一个最终自然语言模板.*附录表 2.*全部 16 个模板/isu);
  assert.match(nodeLabel(en, 'question_instantiation'), /Substitute Subject S.*Template for R.*Natural-language Question/isu);
  assert.match(nodeLabel(en, 'answer_closure'), /Acceptable Answer Set.*Every Entity E.*\(S, R, E\).*Wikidata.*All Such Entities as Gold Answers/isu);
  assert.match(nodeLabel(en, 'pageviews'), /Wikipedia Monthly Page Views.*Subject Popularity.*Proxy/isu);
  assert.match(nodeLabel(en, 'fixed_release'), /14,267 Rows.*17 Columns.*Git TSV Equals HF test\.tsv.*Aliases.*URIs.*Titles.*Possible Answers/isu);
  assert.match(nodeLabel(en, 'prompt_config'), /Q: &lt;question&gt; A:.*GPT-3.*Zero-shot.*GPT-Neo and OPT.*15-shot.*Other 15 Relations/isu);
  assert.match(nodeLabel(en, 'memory_gate'), /Memory Regime.*Vanilla.*BM25.*Contriever.*GenRead/isu);
  assert.match(nodeLabel(en, 'vanilla'), /Use Parametric Memory.*Configured Zero- or 15-shot Prompt.*No Retrieved or Generated Context/isu);
  assert.match(nodeLabel(zh, 'vanilla'), /使用参数记忆.*已配置的零样本或 15 样本提示.*不加入检索或生成上下文/isu);
  assert.doesNotMatch(nodeLabel(en, 'vanilla'), /Question-only Prompt/isu);
  assert.match(nodeLabel(en, 'retrieval'), /Use an Augmented Context.*BM25.*Full Top Retrieved Passage.*Contriever.*Split.*Drop Final Segment.*GenRead.*Wikipedia Background.*Max 150 Tokens.*Append the QA Prompt/isu);
  assert.match(nodeLabel(zh, 'retrieval'), /使用增强上下文.*BM25.*完整首段检索文本.*Contriever.*丢弃末段.*GenRead.*维基百科背景.*最多 150 token.*追加问答提示/isu);
  assert.doesNotMatch(nodeLabel(en, 'retrieval'), /Non-parametric Memory/isu);
  assert.doesNotMatch(nodeLabel(zh, 'retrieval'), /非参数记忆/isu);
  assert.match(nodeLabel(en, 'generate'), /15 New Tokens.*Temperature 0.*Greedy.*First Output Line/isu);
  assert.match(nodeLabel(en, 'code_scorer'), /possible_answers.*Original.*lower.*capitalize.*Prediction Substring.*No General Normalization/isu);
  assert.match(nodeLabel(en, 'report'), /Mean Accuracy.*Per Relation.*Correlat.*Log Subject Popularity/isu);
  assert.match(nodeLabel(en, 'adaptive_split'), /75 Percent.*Threshold Development.*25 Percent.*Evaluation.*100 Random Splits/isu);
  assert.match(nodeLabel(en, 'threshold'), /Per-relation Threshold.*Brute-force Popularity Thresholds.*Maximize Adaptive Accuracy/isu);
  assert.match(nodeLabel(en, 'adaptive_gate'), /Apply the Per-relation Threshold Policy.*Retrieval-augmented Prediction Below Threshold.*Parametric Prediction Otherwise/isu);
  assert.match(nodeLabel(zh, 'adaptive_gate'), /应用各关系阈值策略.*低于阈值时使用检索增强预测.*否则使用参数记忆预测/isu);
  assert.doesNotMatch(nodeLabel(en, 'adaptive_gate'), /\?|\bYes\b|\bNo\b/isu);
  assert.equal(
    en.nodes.find(node => node.id === 'adaptive_gate')?.type,
    'process',
    'adaptive selector uses a readable process card instead of a text-cramped diamond',
  );
  assert.match(nodeLabel(en, 'release_boundary'), /Figure 4.*14,267.*Appendix B.*14,282.*15-question Difference.*Unresolved.*Do Not Equate.*Fixed TSV/isu);
  assert.match(nodeLabel(en, 'prompt_boundary'), /Invocation Drift.*Paper GPT-3.*0-shot.*Runner.*15-shot.*README Omits.*n_examples 0.*Contriever README.*ret_file.*Runner.*ret_path/isu);
  assert.match(nodeLabel(zh, 'prompt_boundary'), /调用漂移.*论文 GPT-3.*零样本.*runner.*15 样本.*README 遗漏.*n_examples 0.*Contriever README.*ret_file.*runner.*ret_path/isu);
  assert.match(nodeLabel(en, 'scorer_boundary'), /Paper.*Exact Gold Substring.*Runner Tests Three Gold Casings.*Prediction Is Not Lowercased/isu);
  assert.match(nodeLabel(en, 'adaptive_boundary'), /Notebook Input Paths Are Blank.*No Pinned Result Files.*Threshold Logic.*Results.*Not Recomputed/isu);
  assertEdges(en, [
    ['source_evidence', 'factual_scope', 'secondary'],
    ['factual_scope', 'relations'],
    ['relations', 'weighted_sampling'],
    ['weighted_sampling', 'relation_cap'],
    ['relation_cap', 'template_authoring'],
    ['template_authoring', 'question_instantiation'],
    ['question_instantiation', 'answer_closure'],
    ['answer_closure', 'pageviews'],
    ['pageviews', 'prompt_config'],
    ['pageviews', 'fixed_release', 'secondary'],
    ['prompt_config', 'memory_gate'],
    ['memory_gate', 'vanilla'],
    ['memory_gate', 'retrieval'],
    ['vanilla', 'generate'],
    ['retrieval', 'generate'],
    ['generate', 'code_scorer'],
    ['code_scorer', 'report'],
    ['code_scorer', 'adaptive_split'],
    ['adaptive_split', 'threshold'],
    ['threshold', 'adaptive_gate'],
    ['adaptive_gate', 'adaptive_report'],
    ['fixed_release', 'release_boundary', 'secondary'],
    ['prompt_config', 'prompt_boundary', 'secondary'],
    ['code_scorer', 'scorer_boundary', 'secondary'],
    ['adaptive_report', 'adaptive_boundary', 'secondary'],
  ], 'PopQA');
  assert.equal(
    en.edges.some(edge => edge.from === 'fixed_release' && edge.to === 'prompt_config'),
    false,
    'fixed public TSV must not be implied to be the paper-run input snapshot',
  );
  assert.equal(
    en.edges.some(edge => edge.from === 'report' && edge.to === 'adaptive_split'),
    false,
    'adaptive notebook consumes scored predictions rather than an aggregate report',
  );
  assert.deepEqual(
    en.edges.find(edge => edge.from === 'code_scorer' && edge.to === 'adaptive_split')?.waypoints,
    [{ x: 210, y: 472 }, { x: 210, y: 620 }, { x: 84, y: 620 }],
    'scored-prediction branch must route between report and scorer-boundary nodes',
  );
  assert.deepEqual(
    en.edges.find(edge => edge.from === 'prompt_config' && edge.to === 'prompt_boundary')?.waypoints,
    [{ x: 1520, y: 700 }],
    'prompt boundary arrow must enter from the side instead of covering its title',
  );
  assert.match(detail.intro_en, /14,267.*16 Wikidata relations.*weighted.*sampling.*2,000.*monthly.*page views/isu);
  assert.match(detail.scale_en, /14,267.*16 relations.*17 fields/isu);
  assert.match(detail.metric_en, /Exact-substring Accuracy.*Per-relation Accuracy.*Correlation.*Adaptive Accuracy/isu);
  assert.match(detail.drawio_review_note, /6de64bcf9b199ae034a09f7e3c407ee6eb0af2bb866335a33445cee95ba1ac38/u);
  assert.match(detail.drawio_review_note, /8172ab04794a1651488207c230286b0b3786d736/u);
  assert.match(detail.drawio_review_note, /098765c79ea10a2cb19c828324e33281b8336ec0/u);
  assert.match(detail.drawio_review_note, /9a5227f41bff0e4c331d4a774d946b12f95307892b58f860a9606ef356e6089b/u);
  assert.match(detail.drawio_review_note, /Git data\/popQA\.tsv.*HF test\.tsv.*byte-identical.*14,267/isu);
  assert.match(detail.drawio_review_note, /Figure 4.*14,267.*Appendix B.*14,282.*15-question difference.*unresolved.*not assert.*same input snapshot/isu);
  assert.match(detail.drawio_review_note, /f > exp\(8R - 6\).*800 MB random sample of C4.*2,000/isu);
  assert.match(detail.drawio_review_note, /paper says GPT-3 uses zero-shot.*runner default is 15.*README.*does not pass.*n_examples 0/isu);
  assert.match(detail.drawio_review_note, /README.*--ret_file.*runner.*--ret_path.*argument parsing/isu);
  assert.match(detail.drawio_review_note, /clip_paragraph.*Contriever.*split.*\. .*drops the final segment/isu);
  assert.match(detail.drawio_review_note, /exact template Q: <question> A:/isu);
  assert.match(detail.drawio_review_note, /pa in pred.*pa\.lower\(\).*pa\.capitalize\(\).*does not lowercase the prediction/isu);
  assert.match(detail.drawio_review_note, /per relation.*75 percent.*25 percent.*100 random splits/isu);
  assert.doesNotMatch(nodeLabel(en, 'code_scorer'), /judge|human|LLM grader/iu);
});
