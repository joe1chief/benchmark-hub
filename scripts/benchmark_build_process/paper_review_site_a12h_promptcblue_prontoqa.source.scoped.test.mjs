import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { XMLValidator } from 'fast-xml-parser';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PromptCBLUE', 'ProntoQA'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');

const graphNode = (id, type, x, y, style = { fontSize: 9 }) => ({
  id,
  type,
  size: 'xl',
  position: { x, y },
  style,
});

const graphEdge = (from, to, options = {}) => {
  const type = options.type ?? 'primary';
  const edge = {
    from,
    to,
    type,
  };
  if (options.style !== undefined) edge.style = options.style;
  else if (type === 'secondary') edge.style = { dashed: true };
  if (options.labelPosition !== undefined) edge.labelPosition = options.labelPosition;
  if (options.waypoints !== undefined) edge.waypoints = options.waypoints;
  return edge;
};

const expectedLabelDigests = new Map([
  ['PromptCBLUE', {
    en: 'b6c971ca0c3cadeeabe8e15ff39c23a8933c4cd1314bd70ccb30924b304f3272',
    zh: '1e9be7547168658ddfc4e4db356fc486551da5cfd43367b50ecc7f477876623b',
  }],
  ['ProntoQA', {
    en: '426e7166a827bfc4cdb43cb667864345d7f1835b65bbe6d2f766aef47cfb0813',
    zh: '54c3cecaab2fea3f420ad31ebb3102e7930e7ea4eb7c88669f4b5d70ae948000',
  }],
]);

const expectedGraphs = new Map([
  ['PromptCBLUE', {
    nodes: [
      graphNode('source_evidence', 'document', 20, 40),
      graphNode('cblue_scope', 'database', 260, 40),
      graphNode('task_cohorts', 'process', 500, 40),
      graphNode('manual_seeds', 'process', 740, 40),
      graphNode('expert_seed_review', 'process', 980, 40),
      graphNode('chatgpt_rephrase', 'process', 1220, 40),
      graphNode('expert_augmented_review', 'process', 1460, 40),
      graphNode('prompt_components', 'document', 1700, 40),
      graphNode('target_serialization', 'process', 1940, 40),
      graphNode('uniform_schema', 'document', 2180, 40),
      graphNode('template_fill', 'process', 2420, 40),
      graphNode('uniform_sample', 'process', 2660, 40, { fontSize: 8 }),
      graphNode('quality_checks', 'process', 2900, 40),
      graphNode('paper_release', 'database', 3140, 40, { fontSize: 8 }),
      graphNode('evaluation_settings', 'process', 3140, 460),
      graphNode('icl_setting', 'process', 2900, 280),
      graphNode('fewshot_ft', 'process', 2900, 460),
      graphNode('full_ft', 'process', 2900, 640),
      graphNode('shared_model_rule', 'process', 2660, 460),
      graphNode('test_generation', 'process', 2420, 460),
      graphNode('submission_package', 'document', 2180, 460),
      graphNode('platform_parser', 'process', 1940, 460),
      graphNode('extraction_metrics', 'process', 1700, 280),
      graphNode('classification_metrics', 'process', 1700, 460),
      graphNode('generation_metrics', 'process', 1700, 640),
      graphNode('overall_score', 'process', 1460, 460),
      graphNode('leaderboard', 'terminal', 1220, 460),
      graphNode('release_boundary', 'document', 3140, 900),
      graphNode('license_boundary', 'document', 3380, 900),
    ],
    edges: [
      graphEdge('source_evidence', 'cblue_scope'),
      graphEdge('cblue_scope', 'task_cohorts'),
      graphEdge('task_cohorts', 'manual_seeds'),
      graphEdge('manual_seeds', 'expert_seed_review'),
      graphEdge('expert_seed_review', 'chatgpt_rephrase'),
      graphEdge('chatgpt_rephrase', 'expert_augmented_review'),
      graphEdge('expert_augmented_review', 'prompt_components'),
      graphEdge('prompt_components', 'target_serialization'),
      graphEdge('target_serialization', 'uniform_schema'),
      graphEdge('uniform_schema', 'template_fill'),
      graphEdge('template_fill', 'uniform_sample'),
      graphEdge('uniform_sample', 'quality_checks'),
      graphEdge('quality_checks', 'paper_release'),
      graphEdge('paper_release', 'evaluation_settings'),
      graphEdge('evaluation_settings', 'icl_setting'),
      graphEdge('evaluation_settings', 'fewshot_ft'),
      graphEdge('evaluation_settings', 'full_ft'),
      graphEdge('icl_setting', 'shared_model_rule'),
      graphEdge('fewshot_ft', 'shared_model_rule'),
      graphEdge('full_ft', 'shared_model_rule'),
      graphEdge('shared_model_rule', 'test_generation'),
      graphEdge('test_generation', 'submission_package'),
      graphEdge('submission_package', 'platform_parser'),
      graphEdge('platform_parser', 'extraction_metrics'),
      graphEdge('platform_parser', 'classification_metrics'),
      graphEdge('platform_parser', 'generation_metrics'),
      graphEdge('extraction_metrics', 'overall_score'),
      graphEdge('classification_metrics', 'overall_score'),
      graphEdge('generation_metrics', 'overall_score'),
      graphEdge('overall_score', 'leaderboard'),
      graphEdge('paper_release', 'release_boundary', {
        type: 'secondary',
        waypoints: [
          { x: 3500, y: 90 },
          { x: 3500, y: 840 },
          { x: 3250, y: 840 },
        ],
      }),
      graphEdge('release_boundary', 'license_boundary', { type: 'secondary' }),
    ],
  }],
  ['ProntoQA', {
    nodes: [
      graphNode('source_evidence', 'document', 20, 40),
      graphNode('task_scope', 'document', 260, 40),
      graphNode('ontology_types', 'process', 500, 40),
      graphNode('linear_ontology', 'database', 740, 40),
      graphNode('controlled_grammar', 'process', 980, 40),
      graphNode('context_order', 'process', 1220, 40),
      graphNode('shortcut_audit', 'process', 1460, 200),
      graphNode('distractor', 'process', 1700, 200),
      graphNode('seed_axiom', 'process', 980, 360),
      graphNode('proof_walk', 'process', 1220, 360),
      graphNode('query_polarity', 'process', 1460, 360),
      graphNode('gold_cot', 'process', 1460, 520),
      graphNode('example_record', 'database', 1940, 360),
      graphNode('experiment_controls', 'process', 2180, 360),
      graphNode('eight_shot', 'process', 2420, 360),
      graphNode('greedy_decode', 'process', 2660, 360),
      graphNode('response_split', 'process', 2900, 360),
      graphNode('semantic_parser', 'process', 3140, 360),
      graphNode('step_validity', 'process', 3380, 180),
      graphNode('step_atomicity', 'process', 3380, 360),
      graphNode('step_utility', 'process', 3380, 540),
      graphNode('proof_path', 'process', 3620, 360),
      graphNode('strict_metric', 'process', 3860, 80),
      graphNode('skip_metric', 'process', 3860, 240),
      graphNode('broad_metric', 'process', 3860, 400),
      graphNode('valid_metric', 'process', 3860, 560),
      graphNode('label_metric', 'process', 3860, 720),
      graphNode('breakdown', 'process', 4100, 360),
      graphNode('paper_report', 'terminal', 4340, 360),
      graphNode('release_boundary', 'document', 1940, 900),
    ],
    edges: [
      graphEdge('source_evidence', 'task_scope'),
      graphEdge('task_scope', 'ontology_types'),
      graphEdge('ontology_types', 'linear_ontology'),
      graphEdge('linear_ontology', 'seed_axiom'),
      graphEdge('seed_axiom', 'proof_walk'),
      graphEdge('linear_ontology', 'controlled_grammar'),
      graphEdge('controlled_grammar', 'context_order'),
      graphEdge('controlled_grammar', 'shortcut_audit', {
        waypoints: [
          { x: 1090, y: 260 },
          { x: 1450, y: 260 },
        ],
      }),
      graphEdge('context_order', 'distractor', {
        waypoints: [
          { x: 1330, y: 180 },
          { x: 1810, y: 180 },
        ],
      }),
      graphEdge('shortcut_audit', 'distractor'),
      graphEdge('proof_walk', 'distractor', {
        waypoints: [
          { x: 1330, y: 340 },
          { x: 1810, y: 340 },
        ],
      }),
      graphEdge('proof_walk', 'query_polarity'),
      graphEdge('proof_walk', 'gold_cot'),
      graphEdge('distractor', 'example_record', {
        waypoints: [
          { x: 2050, y: 260 },
        ],
      }),
      graphEdge('query_polarity', 'example_record'),
      graphEdge('gold_cot', 'example_record'),
      graphEdge('example_record', 'experiment_controls'),
      graphEdge('experiment_controls', 'eight_shot'),
      graphEdge('eight_shot', 'greedy_decode'),
      graphEdge('greedy_decode', 'response_split'),
      graphEdge('response_split', 'semantic_parser'),
      graphEdge('semantic_parser', 'step_validity'),
      graphEdge('semantic_parser', 'step_atomicity'),
      graphEdge('semantic_parser', 'step_utility'),
      graphEdge('step_validity', 'proof_path'),
      graphEdge('step_atomicity', 'proof_path'),
      graphEdge('step_utility', 'proof_path'),
      graphEdge('proof_path', 'strict_metric', {
        style: { exitX: 1, exitY: 0.15, entryX: 0, entryY: 0.5 },
      }),
      graphEdge('proof_path', 'skip_metric', {
        style: { exitX: 1, exitY: 0.35, entryX: 0, entryY: 0.5 },
      }),
      graphEdge('proof_path', 'broad_metric', {
        style: { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 },
      }),
      graphEdge('proof_path', 'valid_metric', {
        style: { exitX: 1, exitY: 0.75, entryX: 0, entryY: 0.5 },
      }),
      graphEdge('response_split', 'label_metric', {
        waypoints: [
          { x: 3010, y: 850 },
          { x: 3970, y: 850 },
        ],
      }),
      graphEdge('strict_metric', 'breakdown', {
        style: { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.1 },
      }),
      graphEdge('skip_metric', 'breakdown', {
        style: { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.3 },
      }),
      graphEdge('broad_metric', 'breakdown', {
        style: { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 },
      }),
      graphEdge('valid_metric', 'breakdown', {
        style: { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.7 },
      }),
      graphEdge('label_metric', 'breakdown', {
        style: { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.9 },
      }),
      graphEdge('breakdown', 'paper_report'),
      graphEdge('example_record', 'release_boundary', { type: 'secondary' }),
    ],
  }],
]);

const semanticAnchors = new Map([
  ['PromptCBLUE', {
    en: {
      source_evidence: ['arXiv 2310.14151v1', 'Git b0753a61a7c1'],
      cblue_scope: ['16 Chinese Medical NLP Tasks', 'Authentic Chinese Medical Text'],
      task_cohorts: ['Extraction 5 · Classification 3', 'Medical Content Generation 2'],
      manual_seeds: ['Three CS Graduate Annotators', 'About Six Seeds per Task'],
      expert_seed_review: ['Two Medical Experts', 'Revise Until Accepted'],
      chatgpt_rephrase: ['Ten Rephrasings per Seed', 'Preserve All Placeholders'],
      expert_augmented_review: ['Same Expert Panel', 'Keep Only Accepted Templates'],
      prompt_components: ['Task Instruction plus Text Input', 'Demonstrations or Step-by-step Request'],
      target_serialization: ['Serialize Original Targets as Text', 'Make Every Task Generative'],
      uniform_schema: ['input · target · answer_choices', 'Auxiliary Fields Are Not Model Input'],
      template_fill: ['Large Prompt-response Pool', 'Retain Task and Sample Identity'],
      uniform_sample: [
        'Train 3,000 to 5,000 per Task',
        'CHIP-CTC 6,600 · QIC 5,500',
        'Paper Does Not Explain This Conflict',
      ],
      quality_checks: ['QQR Re-annotation', '5% or 200 per Task · 0.9% Error'],
      paper_release: [
        'Printed T/D/T: 82,600 / 7,656 / 7,656',
        'Rows T/D/T: 78,100 / 6,856 / 6,856',
        'Gap T/D/T: 4,500 / 800 / 800',
        'Paper Provides No Explanation',
      ],
      evaluation_settings: ['Few-shot In-context Learning', 'Full-data Fine-tuning or PEFT'],
      icl_setting: ['Same-task Demonstrations', 'At Least k per Label Where Feasible'],
      fewshot_ft: ['Reuse Selected Demonstrations', 'Sample-efficiency Effects'],
      full_ft: ['Large Reference Split', 'Parameter-efficient Methods'],
      shared_model_rule: ['One Shared LLM Backbone', 'Total PEFT Parameters Below 1%'],
      test_generation: ['target Is Empty', 'Preserve Order Count and sample_id'],
      submission_package: ['test_predictions.json', 'post_generate_process.py'],
      platform_parser: ['Python Standard Library Only', 'Ignore Manually Uploaded results.json'],
      extraction_metrics: ['Strict Instance Micro-F1', 'Exact All Fields within an Instance'],
      classification_metrics: ['Macro-F1 for CTC QIC and DAC', 'Micro-F1 for STS QQR IR and QTR'],
      generation_metrics: ['Character-spaced ROUGE-1 · ROUGE-2 · ROUGE-L', 'Six Report Sections for MRG'],
      overall_score: ['Mean of 16 Paper Task Scores', 'F1 or ROUGE-L per Task'],
      leaderboard: ['Tianchi Platform', 'General and Open-source Tracks'],
      release_boundary: ['v0.2 README Claims 94 Templates', '91 Manual · 352 Augmented Entries'],
      license_boundary: ['Fixed Git Tree Has No LICENSE File', 'Distributed through Tianchi'],
    },
    zh: {
      source_evidence: ['arXiv 2310.14151v1', 'Git b0753a61a7c1'],
      cblue_scope: ['16 项中文医疗 NLP 任务', '保留真实中文医疗文本'],
      task_cohorts: ['信息抽取 5 · 文本分类 3', '医疗内容生成 2'],
      manual_seeds: ['三名计算机专业研究生标注员', '每项任务约六条种子'],
      expert_seed_review: ['两名医疗专家', '修改直至专家接受'],
      chatgpt_rephrase: ['每条种子改写十次', '不改变任何占位符'],
      expert_augmented_review: ['同一专家组', '仅接纳审核通过的模板'],
      prompt_components: ['任务指令与文本输入', '示例或分步推理要求'],
      target_serialization: ['将原始目标序列化为文本', '统一改造成生成任务'],
      uniform_schema: ['input · target · answer_choices', '四个辅助字段不输入模型'],
      template_fill: ['大型提示—回答候选池', '保留任务与样本身份'],
      uniform_sample: [
        '训练 3,000 至 5,000 条',
        'CHIP-CTC 6,600 · QIC 5,500',
        '论文未解释正文与表格冲突',
      ],
      quality_checks: ['QQR 重新标注', '5% 或 200 条 · 错标率 0.9%'],
      paper_release: [
        '印刷训/开/测：82,600 / 7,656 / 7,656',
        '行和训/开/测：78,100 / 6,856 / 6,856',
        '差额训/开/测：4,500 / 800 / 800',
        '论文未作解释',
      ],
      evaluation_settings: ['少样本上下文学习', '全量微调或参数高效微调'],
      icl_setting: ['使用同任务演示', '每标签至少 k 条'],
      fewshot_ft: ['复用已选择的演示样本', '样本效率影响'],
      full_ft: ['大型参考训练集', '参数高效方法'],
      shared_model_rule: ['共用一个 LLM 主干', 'PEFT 总参数量低于主干 1%'],
      test_generation: ['target 为空', '保持顺序 数量与 sample_id'],
      submission_package: ['test_predictions.json', 'post_generate_process.py'],
      platform_parser: ['仅允许 Python 标准库', '忽略手工上传的 results.json'],
      extraction_metrics: ['严格实例级 Micro-F1', '全部字段必须精确命中'],
      classification_metrics: ['CTC QIC DAC 使用 Macro-F1', 'STS QQR IR QTR 使用 Micro-F1'],
      generation_metrics: ['ROUGE-1 · ROUGE-2 · ROUGE-L', 'MRG 六个报告章节'],
      overall_score: ['平均 16 项论文任务得分', 'F1 或 ROUGE-L'],
      leaderboard: ['天池平台', '通用赛道与开源赛道'],
      release_boundary: ['v0.2 README 声称 94 个模板', '91 条人工 · 352 条扩写记录'],
      license_boundary: ['固定 Git 树没有 LICENSE 文件', '完整数据通过天池分发'],
    },
  }],
  ['ProntoQA', {
    en: {
      source_evidence: ['arXiv 2210.01240v4', 'Paper-code v1 066f73fc70bf'],
      task_scope: ['Repeated Modus Ponens Only', 'Ax and Hop', 'Unique Gold Proof'],
      ontology_types: ['Fictional Names', 'Three Hand-coded Real Ontologies', 'False Randomizes'],
      linear_ontology: ['3 to 10 Concepts', 'Zero or One Child', 'Subtype Relations and Properties'],
      controlled_grammar: ['Translate Every Edge and Property', 'Easy Unique Inverse Parse'],
      context_order: ['Preorder for Top-down', 'Postorder for Bottom-up', 'before Any Distractor'],
      shortcut_audit: ['Labels Are Nearly Perfect', 'Queried Property Mention Reveals Polarity'],
      distractor: ['Generated Proof Conclusion Property', 'Disconnected Novel Concept', 'Random Position'],
      seed_axiom: ['Starting Node Uniformly', 'Initial Type Axiom'],
      proof_walk: ['One Deduction Rule per Hop', 'Target Proof Length · Test 1 3 5'],
      query_polarity: ['Probability 0.5', 'Negation as True or False'],
      gold_cot: ['Ordered Formal Proof', 'One Sentence per Proof Step'],
      example_record: ['Context · Query · Gold CoT · Label', 'Generate Examples on Demand'],
      experiment_controls: ['1 · 3 · 5 Hops', 'Fictional · True · False Ontology'],
      eight_shot: ['Eight Independently Generated', 'One Unlabeled Test Example'],
      greedy_decode: ['Greedy Decoding', 'text-ada-001', 'text-davinci-002'],
      response_split: ['Predicted CoT Sentences', 'True or False Label'],
      semantic_parser: ['Recursive-descent Grammar', 'Unparseable Steps Incorrect'],
      step_validity: ['Strictly-valid Uses Gold Rules', 'Broadly-valid Uses the Added Calculus'],
      step_atomicity: ['Atomic Means One Rule Application', 'Non-atomic Skips Intermediate Steps'],
      step_utility: ['Gold-proof Premises plus Off-path Conclusion', 'Misleading Step'],
      proof_path: ['Path from Premises to Conclusion', 'Extraneous Invalid Steps'],
      strict_metric: ['Strict Proof Accuracy', 'Strictly-valid Atomic'],
      skip_metric: ['Skip Proof Accuracy', 'Non-atomic Correct Steps'],
      broad_metric: ['Broad Proof Accuracy', 'Broadly-valid Steps'],
      valid_metric: ['Valid Proof Accuracy', 'Most Permissive Proof Path'],
      label_metric: ['Label Accuracy', 'Separate from Proof Accuracy'],
      breakdown: ['Hops Order and Ontology', 'Wilson 95% Confidence Intervals'],
      paper_report: ['400 Examples per Configuration', '48 Experiments in the Main Analysis'],
      release_boundary: ['v1 Branch at 066f73fc70bf', '500 Trials · Hops 1-through-5', 'Apache-2.0'],
    },
    zh: {
      source_evidence: ['arXiv 2210.01240v4', '论文代码 v1 066f73fc70bf'],
      task_scope: ['重复使用肯定前件', '公理 Ax 与跳步 Hop', '唯一标准证明'],
      ontology_types: ['虚构名称', '三个手工编写本体', '反事实本体'],
      linear_ontology: ['3 至 10 个概念', '零个或一个子节点', '子类型关系与概念属性'],
      controlled_grammar: ['翻译每条边与每个属性', '唯一的反向解析'],
      context_order: ['前序遍历生成自顶向下顺序', '后序遍历生成自底向上顺序', '排序后才插入干扰句'],
      shortcut_audit: ['标签预测接近完美', '查询属性是否出现会泄露极性'],
      distractor: ['已生成证明的结论属性', '断开的新概念', '随机插入已排序上下文'],
      seed_axiom: ['均匀选择一个起始节点', '初始类型公理'],
      proof_walk: ['每一跳应用一次演绎规则', '目标证明长度 · 测试 1 3 5 跳'],
      query_polarity: ['以 0.5 概率', '否定是否为真'],
      gold_cot: ['形式证明的有序步骤', '每个证明步骤输出一句话'],
      example_record: ['上下文 · 查询 · 标准思维链 · 标签', '按需动态生成样本'],
      experiment_controls: ['1 · 3 · 5 跳', '虚构 · 真实 · 反事实本体'],
      eight_shot: ['独立生成八条', '无答案测试样本'],
      greedy_decode: ['使用贪心解码', 'text-ada-001', 'text-davinci-002'],
      response_split: ['预测思维链句子', '最终真或假标签'],
      semantic_parser: ['递归下降语法', '无法解析的步骤标记为错误'],
      step_validity: ['严格有效仅用标准证明规则', '广义有效使用扩展演算'],
      step_atomicity: ['原子步骤只应用一次规则', '非原子步骤跳过中间结论'],
      step_utility: ['标准证明前提导向路径外结论', '误导步骤'],
      proof_path: ['从前提到结论的路径', '额外无效步骤'],
      strict_metric: ['严格证明准确率', '严格有效 原子'],
      skip_metric: ['跳步证明准确率', '非原子的正确步骤'],
      broad_metric: ['广义证明准确率', '广义有效步骤'],
      valid_metric: ['有效证明准确率', '最宽松的证明路径'],
      label_metric: ['标签准确率', '与证明准确率分开计算'],
      breakdown: ['按跳数 顺序与本体类型分解', 'Wilson 95% 置信区间'],
      paper_report: ['每个配置生成 400 条样本', '主分析共 48 组实验'],
      release_boundary: ['v1 分支 066f73fc70bf', 'CLI 默认 500 次 · 跳数遍历 1 至 5', 'Apache-2.0'],
    },
  }],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));

const specPath = (id, language) => join(
  publicDir,
  'drawio',
  id,
  `${id}.${language}.spec.yaml`,
);

const readSpec = (id, language) => parseYaml(readFileSync(specPath(id, language), 'utf8'));

function nodeLabel(graph, id) {
  const candidate = graph.nodes.find(current => current.id === id);
  assert.ok(candidate, `missing node ${id}`);
  return String(candidate.label);
}

function rendererStructure(graph) {
  return {
    nodes: graph.nodes.map(({ label, ...rendererFields }) => rendererFields),
    edges: graph.edges,
    modules: graph.modules ?? [],
  };
}

function labelDigest(graph) {
  return createHash('sha256')
    .update(JSON.stringify(graph.nodes.map(({ id, label }) => ({ id, label }))))
    .digest('hex');
}

function assertSemanticAnchors(id, language, graph) {
  const expectedNodeIds = expectedGraphs.get(id).nodes.map(current => current.id);
  const anchors = semanticAnchors.get(id)[language];
  assert.deepEqual(Object.keys(anchors), expectedNodeIds, `${id}.${language} semantic coverage`);
  for (const [nodeId, expectedPhrases] of Object.entries(anchors)) {
    const label = nodeLabel(graph, nodeId);
    for (const phrase of expectedPhrases) {
      assert.ok(label.includes(phrase), `${id}.${language}.${nodeId} missing semantic anchor: ${phrase}`);
    }
  }
}

function expectedAssetPaths(id) {
  return {
    drawio_source_en: `drawio/${id}/${id}.en.drawio`,
    drawio_source_zh: `drawio/${id}/${id}.zh.drawio`,
    drawio_spec_en: `drawio/${id}/${id}.en.spec.yaml`,
    drawio_spec_zh: `drawio/${id}/${id}.zh.spec.yaml`,
    drawio_arch_en: `drawio/${id}/${id}.en.arch.json`,
    drawio_arch_zh: `drawio/${id}/${id}.zh.arch.json`,
  };
}

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`, 'u'))?.[1] ?? '';
}

function decodeXml(value) {
  return String(value)
    .replace(/&#xa;/giu, '\n')
    .replace(/&#10;/gu, '\n')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

function normalizedLabel(value) {
  return decodeXml(value).replace(/\s+/gu, ' ').trim();
}

test('locks full bilingual labels and every node, edge, module, style, and waypoint renderer field', () => {
  for (const id of benchmarkIds) {
    const expected = expectedGraphs.get(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');

    for (const [language, graph] of [['en', en], ['zh', zh]]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(graph.meta.source, 'generated', `${id}.${language} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.deepEqual(rendererStructure(graph), {
        ...expected,
        modules: [],
      }, `${id}.${language} exact renderer structure`);
      assert.equal(
        labelDigest(graph),
        expectedLabelDigests.get(id)[language],
        `${id}.${language} complete id-label SHA-256`,
      );
      assert.ok(graph.nodes.every(current => String(current.label).split('\n').length <= 5), `${id}.${language} line count`);
      assert.ok(graph.nodes.every(current => String(current.label).split('\n').every(line => [...line].length <= 52)), `${id}.${language} line width`);
      assert.ok(graph.edges.every(current => current.label === undefined), `${id}.${language} no edge labels`);
      assertSemanticAnchors(id, language, graph);
    }

    assert.deepEqual(rendererStructure(zh), rendererStructure(en), `${id} bilingual renderer structure`);
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
  }

  const promptEn = readSpec('PromptCBLUE', 'en');
  const promptZh = readSpec('PromptCBLUE', 'zh');
  assert.match(promptEn.meta.description, /Table 8 printed-total versus 16-row-sum.*prose-versus-table/isu);
  assert.match(promptZh.meta.description, /表 8 印刷总计与 16 行实算差异.*正文与表格训练量冲突/isu);
  assert.match(promptEn.meta.legend, /do not normalize.*paper does not explain/isu);
  assert.match(promptZh.meta.legend, /不.*归一化.*未解释/isu);
});

test('locks source-stage fallbacks, six canonical source paths, SVG paths, and awaiting-signoff state', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, null, `${id} canonical fallback unregistered`);
    assert.equal(detail.flowchart_en, '', `${id} English fallback empty`);
    assert.equal(detail.flowchart_zh, '', `${id} Chinese fallback empty`);
    const pathKeys = Object.keys(expectedAssetPaths(id));
    assert.deepEqual(
      Object.fromEntries(pathKeys.map(key => [key, detail[key]])),
      expectedAssetPaths(id),
      `${id} six source-stage paths`,
    );
    assert.equal(detail.drawio_flowchart_en, `drawio/${id}/${id}.en.svg`, `${id} English SVG path`);
    assert.equal(detail.drawio_flowchart_zh, `drawio/${id}/${id}.zh.svg`, `${id} Chinese SVG path`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} unified review date`);
    assert.match(
      detail.drawio_review_note,
      /status=source-reconstructed-awaiting-independent-signoff/u,
      `${id} independent signoff pending`,
    );
    assert.doesNotMatch(detail.drawio_review_note, /Formal publication evidence/iu, `${id} source-only note`);
  }
});

test('locks PromptCBLUE paper construction, both paper count conflicts, competition scoring, and release drift', () => {
  const detail = readDetail('PromptCBLUE');
  const en = readSpec('PromptCBLUE', 'en');
  const zh = readSpec('PromptCBLUE', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2310.14151v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2310.14151v1');
  assert.equal(detail.homepage, 'https://github.com/michael-wzhu/PromptCBLUE');
  assert.equal(detail.has_leaderboard, true);
  assert.match(detail.scale_en, /printed total.*82,600\/7,656\/7,656.*16 rows sum.*78,100\/6,856\/6,856/isu);
  assert.match(detail.scale_en, /unexplained 4,500\/800\/800 gap/isu);
  assert.match(detail.scale_en, /3,000–5,000.*6,600 for CHIP-CTC.*5,500 for KUAKE-QIC.*without reconciliation/isu);
  assert.match(detail.scale, /印刷总计.*82,600.*7,656.*16行实算.*78,100\/6,856\/6,856.*差额4,500\/800\/800.*未解释/isu);
  assert.match(detail.scale, /3,000–5,000.*CHIP-CTC.*6,600.*KUAKE-QIC.*5,500.*未解释/isu);
  assert.match(nodeLabel(en, 'uniform_sample'), /3,000 to 5,000.*600 to 800.*CHIP-CTC 6,600.*QIC 5,500.*Does Not Explain/isu);
  assert.match(nodeLabel(zh, 'uniform_sample'), /3,000 至 5,000.*600 至 800.*CHIP-CTC 6,600.*QIC 5,500.*未解释/isu);
  assert.match(nodeLabel(en, 'paper_release'), /Printed.*82,600.*7,656.*Rows.*78,100.*6,856.*Gap.*4,500.*800.*No Explanation/isu);
  assert.match(nodeLabel(zh, 'paper_release'), /印刷.*82,600.*7,656.*行和.*78,100.*6,856.*差额.*4,500.*800.*未作解释/isu);
  assert.match(nodeLabel(en, 'shared_model_rule'), /One Shared LLM Backbone.*One Shared LM Head.*Below 1%/isu);
  assert.match(nodeLabel(en, 'submission_package'), /test_predictions\.json.*post_generate_process\.py.*ZIP Root/isu);
  assert.match(nodeLabel(en, 'platform_parser'), /Python Standard Library.*Ignore Manually Uploaded results\.json/isu);
  assert.match(nodeLabel(en, 'extraction_metrics'), /Strict Instance Micro-F1/isu);
  assert.match(nodeLabel(en, 'classification_metrics'), /Macro-F1.*Micro-F1/isu);
  assert.match(nodeLabel(en, 'generation_metrics'), /ROUGE-1.*ROUGE-2.*ROUGE-L.*Six Report Sections/isu);
  assert.match(nodeLabel(en, 'overall_score'), /Mean of 16.*F1 or ROUGE-L/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /v0\.2 README.*94.*68,900.*10,360.*10,320.*91.*352/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /No LICENSE File.*Tianchi/isu);
  assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u);
  assert.match(detail.drawio_review_note, /2a69d5133e62e50395ae07a9ea5d6a108aa970a7bfc9c6b77443d25be6c6f0a0/u);
  assert.match(detail.drawio_review_note, /b0753a61a7c1f4e1ae171109f8a59037ff0a5543/u);
  assert.match(detail.drawio_review_note, /Section 3\.2.*3,000-5,000.*6,600 training items for CHIP-CTC.*5,500 for KUAKE-QIC.*does not reconcile/isu);
  assert.match(detail.drawio_review_note, /printed total.*82,600\/7,656\/7,656.*16 task rows.*78,100\/6,856\/6,856.*gap.*4,500\/800\/800/isu);
  assert.match(detail.drawio_review_note, /v0\.2 README reports 68,900\/10,360\/10,320\/10,320/isu);
});

test('locks PrOntoQA v4 construction, symbolic proof analysis, paper experiment, and v1 code boundary', () => {
  const detail = readDetail('ProntoQA');
  const en = readSpec('ProntoQA', 'en');
  const zh = readSpec('ProntoQA', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2210.01240v4');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2210.01240v4');
  assert.equal(detail.homepage, 'https://github.com/asaparov/prontoqa');
  assert.equal(detail.has_leaderboard, false);
  assert.match(nodeLabel(en, 'task_scope'), /Repeated Modus Ponens.*Ax.*Hop.*Unique Gold Proof/isu);
  assert.match(nodeLabel(zh, 'task_scope'), /重复使用肯定前件.*Ax.*Hop.*唯一标准证明/isu);
  assert.match(nodeLabel(en, 'linear_ontology'), /3 to 10 Concepts.*Zero or One Child.*Subtype.*Properties/isu);
  assert.match(nodeLabel(zh, 'linear_ontology'), /3 至 10 个概念.*零个或一个子节点.*子类型关系.*概念属性/isu);
  assert.match(nodeLabel(en, 'context_order'), /Ontology Context First.*Preorder.*Postorder.*before Any Distractor/isu);
  assert.match(nodeLabel(zh, 'context_order'), /先确定本体上下文顺序.*前序遍历.*后序遍历.*排序后才插入干扰句/isu);
  assert.match(nodeLabel(en, 'distractor'), /Generated Proof Conclusion Property.*Disconnected Novel Concept.*Random Position/isu);
  assert.match(nodeLabel(zh, 'distractor'), /已生成证明的结论属性.*断开的新概念.*随机插入已排序上下文/isu);
  assert.match(nodeLabel(en, 'eight_shot'), /Eight Independently Generated.*One Unlabeled Test/isu);
  assert.match(nodeLabel(zh, 'eight_shot'), /独立生成八条.*无答案测试样本/isu);
  assert.match(nodeLabel(en, 'semantic_parser'), /Recursive-descent.*Logical Forms.*Unparseable.*Incorrect/isu);
  assert.match(nodeLabel(zh, 'semantic_parser'), /递归下降.*逻辑形式序列.*无法解析.*错误/isu);
  assert.match(nodeLabel(en, 'proof_path'), /Path from Premises to Conclusion.*Extraneous Invalid Steps/isu);
  assert.match(nodeLabel(zh, 'proof_path'), /从前提到结论的路径.*额外无效步骤/isu);
  assert.match(nodeLabel(en, 'breakdown'), /Hops Order and Ontology.*Wilson 95%/isu);
  assert.match(nodeLabel(zh, 'breakdown'), /跳数 顺序与本体类型.*Wilson 95%/isu);
  assert.match(nodeLabel(en, 'paper_report'), /400 Examples per Configuration.*48 Experiments/isu);
  assert.match(nodeLabel(zh, 'paper_report'), /每个配置生成 400 条样本.*48 组实验/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /v1 Branch.*066f73fc70bf.*500 Trials.*1-through-5.*62471893.*Apache-2\.0/isu);
  assert.match(nodeLabel(zh, 'release_boundary'), /v1 分支.*066f73fc70bf.*500 次.*1 至 5.*62471893.*Apache-2\.0/isu);
  assert.match(detail.drawio_review_note, /8e0502fa3b6b93c967441b99270bb4ec0bcdd37924502eaa128ad0e7a6e567d9/u);
  assert.match(detail.drawio_review_note, /066f73fc70bfaa92ed2476fd3c41b4951ad6e63a/u);
  assert.match(detail.drawio_review_note, /context is fully rendered and ordered first.*Only after that ordering is complete.*generated proof's conclusion property.*random position in the ordered context/isu);
  assert.match(detail.drawio_review_note, /paper runs 400 examples per configuration.*v1 code defaults to 500 trials/isu);
});

test('strictly renders all four source specs as valid Draw.io XML without touching formal assets', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a12h-source-xml-'));
  let renderCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const sourceSpec = specPath(id, language);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli,
          sourceSpec,
          generated,
          '--validate',
          '--strict',
          '--write-sidecars',
        ], { stdio: 'pipe' });

        assert.deepEqual(
          parseYaml(readFileSync(generated.replace(/\.drawio$/u, '.spec.yaml'), 'utf8')),
          readSpec(id, language),
          `${id}.${language} strict semantic spec replay`,
        );
        const xml = readFileSync(generated, 'utf8');
        assert.equal(XMLValidator.validate(xml), true, `${id}.${language} valid XML`);
        const graph = readSpec(id, language);
        const tags = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
        const nodes = tags.filter(tag => (
          readAttribute(tag, 'vertex') === '1'
          && !readAttribute(tag, 'style').split(';').includes('edgeLabel')
        ));
        const childEdgeLabels = tags.filter(tag => readAttribute(tag, 'style').split(';').includes('edgeLabel'));
        const edgeBlocks = [...xml.matchAll(/<mxCell\b(?=[^>]*\bedge="1")[^>]*>[\s\S]*?<\/mxCell>/gu)]
          .map(match => match[0]);
        assert.equal(nodes.length, graph.nodes.length, `${id}.${language} XML node count`);
        assert.equal(edgeBlocks.length, graph.edges.length, `${id}.${language} XML edge count`);
        assert.equal(childEdgeLabels.length, 0, `${id}.${language} no child edge labels`);
        assert.deepEqual(
          nodes.map(tag => normalizedLabel(readAttribute(tag, 'value'))),
          graph.nodes.map(current => normalizedLabel(current.label)),
          `${id}.${language} XML node order and labels`,
        );

        const cellIdToNodeId = new Map(
          nodes.map((tag, index) => [readAttribute(tag, 'id'), graph.nodes[index].id]),
        );
        const renderedEdges = new Map(edgeBlocks.map(block => {
          const tag = block.match(/^<mxCell\b[^>]*>/u)?.[0] ?? '';
          return [
            `${cellIdToNodeId.get(readAttribute(tag, 'source'))}->${cellIdToNodeId.get(readAttribute(tag, 'target'))}`,
            { block, tag },
          ];
        }));
        assert.equal(renderedEdges.size, graph.edges.length, `${id}.${language} unique XML edges`);

        for (const current of graph.edges) {
          const context = `${id}.${language} ${current.from}->${current.to}`;
          const rendered = renderedEdges.get(`${current.from}->${current.to}`);
          assert.ok(rendered, `${context} rendered edge`);
          assert.equal(readAttribute(rendered.tag, 'value'), '', `${context} parent edge label`);
          const renderedStyle = readAttribute(rendered.tag, 'style');
          if (current.type === 'secondary') {
            assert.equal(current.style?.dashed, true, `${context} source dashed`);
            assert.match(renderedStyle, /(?:^|;)dashed=1(?:;|$)/u, `${context} rendered dashed`);
          } else {
            assert.doesNotMatch(renderedStyle, /(?:^|;)dashed=1(?:;|$)/u, `${context} rendered primary`);
          }
          for (const [key, value] of Object.entries(current.style ?? {})) {
            if (key === 'dashed') continue;
            assert.match(
              renderedStyle,
              new RegExp(`(?:^|;)${key}=${value}(?:;|$)`, 'u'),
              `${context} rendered style ${key}`,
            );
          }
          if (current.waypoints) {
            assert.match(rendered.block, /<Array as="points">/u, `${context} waypoint array`);
            for (const point of current.waypoints) {
              assert.match(
                rendered.block,
                new RegExp(`<mxPoint x="${point.x}" y="${point.y}"\\s*\\/>`, 'u'),
                `${context} waypoint ${point.x},${point.y}`,
              );
            }
          }
        }
        renderCount += 1;
      }
    }
    assert.equal(renderCount, 4);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
