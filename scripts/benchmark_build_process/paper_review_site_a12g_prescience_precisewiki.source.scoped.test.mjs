import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PreScience', 'PreciseWikiQA'];
const expectedCounts = new Map([
  ['PreScience', { nodes: 23, edges: 25, secondary: 6 }],
  ['PreciseWikiQA', { nodes: 22, edges: 23, secondary: 7 }],
]);
const expectedNodeIds = new Map([
  ['PreScience', [
    'source_evidence', 'paper_scope', 'target_window', 'companion_graph',
    'reference_filter', 'author_resolution', 'temporal_metadata', 'topic_labeling',
    'paper_dataset', 'task_families', 'contribution_task', 'ranking_tasks',
    'citation_task', 'topic_tasks', 'task_metrics', 'corpus_rollout',
    'rollout_eval', 'findings', 'rebuild_boundary', 'release_drift',
    'code_drift', 'prompt_parser_boundary', 'license_boundary',
  ]],
  ['PreciseWikiQA', [
    'source_evidence', 'benchmark_scope', 'goodwiki_release', 'wikirank_join',
    'difficulty_bins', 'page_sampling', 'section_sampling', 'question_generation',
    'answer_generation', 'quality_gate', 'dynamic_set', 'gold_audit',
    'inference_config', 'model_response', 'abstention_judge', 'correctness_judge',
    'score_metrics', 'data_boundary', 'regeneration_drift', 'runner_boundary',
    'judge_parser_drift', 'license_boundary',
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
    nodes: graph.nodes.map(({ id, type, size, position, style }) => (
      { id, type, size, position, style }
    )),
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

function graphEdge(graph, from, to, type = 'primary') {
  const edge = graph.edges.find(candidate => (
    candidate.from === from && candidate.to === to && candidate.type === type
  ));
  assert.ok(edge, `missing edge ${from}->${to} (${type})`);
  return edge;
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

test('keeps published PreScience and PreciseWikiQA bundles bilingual, topology-locked, and source-boundary safe', () => {
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
      assert.ok(graph.nodes.length <= 30, `${id} node budget`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      assert.equal(
        graph.edges.filter(edge => edge.type === 'secondary').length,
        expected.secondary,
        `${id} secondary count`,
      );
      assert.ok(graph.nodes.every(node => String(node.label).split(/\r?\n|<br\s*\/?>/iu).length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} edge-label clutter`);
    }

    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.deepEqual(en.nodes.map(node => node.id), expectedNodeIds.get(id), `${id} semantic node order`);
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of en.nodes) {
      for (const line of String(node.label).split(/\r?\n|<br\s*\/?>/iu)) {
        assert.ok([...line].length <= 54, `${id}.${node.id} English line width: ${line}`);
      }
    }
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
      for (const line of String(node.label).split(/\r?\n|<br\s*\/?>/iu)) {
        assert.ok([...line].length <= 40, `${id}.${node.id} Chinese line width: ${line}`);
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
    assert.equal(detail.has_leaderboard, false, `${id} leaderboard flag`);
    assert.equal(detail.widely_tested, false, `${id} widely-tested flag`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 3_000, `${id} review evidence`);
    assert.match(detail.drawio_review_note, /Formal publication evidence/iu, `${id} publication evidence`);
  }
});

test('locks PreScience v2, its seven-task paper topology, and the older four-task release drift', () => {
  const detail = readDetail('PreScience');
  const en = readSpec('PreScience', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2602.20459v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2602.20459v2');
  assert.equal(
    detail.repository_url,
    'https://github.com/allenai/prescience/tree/47384ed79c48cfef610f30af12ba883f2a0093cb',
  );
  assert.equal(detail.homepage, detail.repository_url);
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/allenai/prescience/tree/a6cbe3237468567f0dca6fc2834f4684c9463858',
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2602\.20459v2.*b0d435e3f4c1.*47384ed79c48.*a6cbe3237468/isu);
  assert.match(nodeLabel(en, 'target_window'), /October 2023.*September 2025.*Six AI Categories.*44,984.*52,836.*97,820/isu);
  assert.match(nodeLabel(en, 'companion_graph'), /Influential References.*Author Publication Histories.*501,866/isu);
  assert.match(nodeLabel(en, 'reference_filter'), /1 to 10 Influential References.*Exclude Zero.*Unusually Large/isu);
  assert.match(nodeLabel(en, 'author_resolution'), /Semantic Scholar Graph.*S2AND.*Manual Examination.*S2AG/isu);
  assert.match(nodeLabel(en, 'temporal_metadata'), /Publication Counts.*Citation Counts.*h-indices.*Publication Date.*History before t_p/isu);
  assert.match(nodeLabel(en, 'topic_labeling'), /202-topic.*gpt-5\.4-2026-03-05.*Claude Opus 4\.7.*530.*0\.67/isu);
  assert.match(nodeLabel(en, 'paper_dataset'), /44,984 Train.*52,836 Test.*97,820 Targets.*501,866 Total/isu);
  assert.match(nodeLabel(en, 'contribution_task'), /Influential References.*Title and Abstract.*LACER.*ROUGE-L.*BERTScore/isu);
  assert.match(nodeLabel(en, 'ranking_tasks'), /Collaborator.*Prior Work.*Future Combination.*nDCG@1000.*R-Precision/isu);
  assert.match(nodeLabel(en, 'citation_task'), /12-month Citation Count.*MAE.*R2.*Pearson.*Spearman/isu);
  assert.match(nodeLabel(en, 'topic_tasks'), /202 Unary Topics.*4,334 Topic Pairs.*Share Change.*R2.*Pearson/isu);
  assert.match(nodeLabel(en, 'corpus_rollout'), /October 1, 2024.*Day by Day.*Fold Generated Papers Back/isu);
  assert.match(nodeLabel(en, 'rollout_eval'), /100 Papers per Month.*10 GRIT Neighbors.*Six Rollouts.*Diversity.*Novelty/isu);
  assert.match(nodeLabel(en, 'rebuild_boundary'), /Internal Semantic Scholar APIs.*Public Scripts.*Results May Vary.*No Byte-identical/isu);
  assert.match(nodeLabel(en, 'release_drift'), /Paper v2.*Six Categories.*97,820.*HF.*Seven Categories.*97,826.*No Topic Field/isu);
  assert.match(nodeLabel(en, 'code_drift'), /Paper v2 Defines Seven Tasks.*Pinned Repo Exposes Four.*No Future-combination.*Topic-trend/isu);
  assert.match(nodeLabel(en, 'prompt_parser_boundary'), /LACER.*gpt-5-2025-08-07.*Score.*API Generation Defaults.*Not Pinned/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Apache 2\.0.*ODC-BY 1\.0.*No Official Leaderboard/isu);
  assertEdges(en, [
    ['source_evidence', 'paper_scope', 'secondary'],
    ['paper_scope', 'target_window'],
    ['target_window', 'companion_graph'],
    ['companion_graph', 'reference_filter'],
    ['reference_filter', 'author_resolution'],
    ['author_resolution', 'temporal_metadata'],
    ['temporal_metadata', 'topic_labeling'],
    ['topic_labeling', 'paper_dataset'],
    ['paper_dataset', 'task_families'],
    ['task_families', 'contribution_task'],
    ['task_families', 'ranking_tasks'],
    ['task_families', 'citation_task'],
    ['task_families', 'topic_tasks'],
    ['contribution_task', 'task_metrics'],
    ['ranking_tasks', 'task_metrics'],
    ['citation_task', 'task_metrics'],
    ['topic_tasks', 'task_metrics'],
    ['task_metrics', 'corpus_rollout'],
    ['corpus_rollout', 'rollout_eval'],
    ['rollout_eval', 'findings'],
    ['companion_graph', 'rebuild_boundary', 'secondary'],
    ['paper_dataset', 'release_drift', 'secondary'],
    ['task_families', 'code_drift', 'secondary'],
    ['contribution_task', 'prompt_parser_boundary', 'secondary'],
    ['source_evidence', 'license_boundary', 'secondary'],
  ], 'PreScience');
  assert.equal(en.nodes.find(node => node.id === 'task_families')?.style?.fontSize, 10);
  assert.equal(graphEdge(en, 'paper_dataset', 'task_families').style?.entryY, 0.2);
  assert.deepEqual(
    ['contribution_task', 'ranking_tasks', 'citation_task', 'topic_tasks'].map(
      target => graphEdge(en, 'task_families', target).style?.exitY,
    ),
    [0.15, 0.35, 0.65, 0.85],
  );
  assert.match(detail.intro_en, /seven.*five paper-anchored.*two topic-trend.*97,820.*501,866/isu);
  assert.match(detail.scale_en, /44,984.*52,836.*97,820.*501,866/isu);
  assert.match(detail.metric_en, /LACER.*nDCG@1000.*R-Precision.*MAE.*R2.*Pearson.*Spearman/isu);
  assert.match(detail.drawio_review_note, /b0d435e3f4c1332acd5c0144f5a0e5a9d596b537a029e571b26341702298bcec/u);
  assert.match(detail.drawio_review_note, /47384ed79c48cfef610f30af12ba883f2a0093cb/u);
  assert.match(detail.drawio_review_note, /a6cbe3237468567f0dca6fc2834f4684c9463858/u);
  assert.match(detail.drawio_review_note, /bbd51d5048eb6683f111b2d5c28cd36d23d37470a693ab2090c1592cce96a884/u);
  assert.match(detail.drawio_review_note, /5e5e8ebf47b7a47d62faf5b747895b13e4e48a27081d55293e92d2aab8f89d14/u);
  assert.match(detail.drawio_review_note, /7c34540d169644e3457c2fd4b92c8e9ca57416e343b8e78e664b3b61533c98b6/u);
  assert.match(detail.drawio_review_note, /a309e8dea55840c83e4c29d0d6cb2b4d9d32aad7526787a03006f9c1df5af062/u);
  assert.match(detail.drawio_review_note, /dee3d717e19275ddd8725019010f17f635250145e3e279674b8d1c0b09e0e66e/u);
  assert.match(detail.drawio_review_note, /9c0c632cf49328d869b00742f251cd97a01c663d5a1aca57a32451c93272bc29/u);
  assert.match(detail.drawio_review_note, /a43bfc929f4a3be946bfb8edf2c62fcfa1c3978a93c91177c3b15aebe01f4856/u);
  assert.match(detail.drawio_review_note, /ea5e20f43c9888ba5529f83b9f6bbe1f39d0f50c646fc6d0d50d8ac2746d2e17/u);
  assert.match(detail.drawio_review_note, /9bedc92dcd151c1d9dd120847c626e7302ce3fb1d706f97ff464a675af2db4dc/u);
  assert.match(detail.drawio_review_note, /cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30/u);
  assert.match(detail.drawio_review_note, /939ffbbf74aeb998571aa72bbb9ab65e8b8a37ae78f8d0b54667272428be6ec2/u);
  assert.match(detail.drawio_review_note, /(?=.*44,984)(?=.*44,990)(?=.*97,820)(?=.*97,826)(?=.*six)(?=.*seven)/isu);
  assert.match(detail.drawio_review_note, /(?=.*gpt-5\.4-2026-03-05)(?=.*Claude Opus 4\.7)(?=.*530)(?=.*0\.67)/isu);
  assert.match(detail.drawio_review_note, /four task directories.*future-combination.*topic-trend/isu);
});

test('locks PreciseWikiQA paper construction, dynamic evaluation, and fixed runner divergences', () => {
  const detail = readDetail('PreciseWikiQA');
  const en = readSpec('PreciseWikiQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2504.17550v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2504.17550v1');
  assert.equal(
    detail.repository_url,
    'https://github.com/facebookresearch/HalluLens/tree/80307ac6bc9fd396a38b7a0de4196b931611b728',
  );
  assert.equal(detail.homepage, detail.repository_url);
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/euirim/goodwiki/tree/7491f6da6439cf25e4d783f96fd09c4256d314db',
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2504\.17550v1.*2257f8628da9.*80307ac6bc9f.*7491f6da6439/isu);
  assert.match(nodeLabel(en, 'benchmark_scope'), /Extrinsic Hallucination.*Short Fact-seeking Queries.*No Context/isu);
  assert.match(nodeLabel(en, 'goodwiki_release'), /44,754.*September 4, 2023.*2b8b3edebede/isu);
  assert.match(nodeLabel(en, 'wikirank_join'), /WikiRank 2024.*Harmonic Centrality.*f83bc6ac3f3a.*2acf403c1f0e/isu);
  assert.match(nodeLabel(en, 'difficulty_bins'), /10 Bins.*0 Hardest.*9 Easiest/isu);
  assert.match(nodeLabel(en, 'page_sampling'), /500 Pages per Bin.*5,000 Source Pages/isu);
  assert.match(nodeLabel(en, 'section_sampling'), /Chunk Each Wikipedia Page.*Randomly Select One Remaining Section/isu);
  assert.match(nodeLabel(en, 'question_generation'), /Objective.*Llama-3\.1-70B-Instruct.*Concise.*Single Answer/isu);
  assert.match(nodeLabel(en, 'answer_generation'), /(?=.*Same Reference)(?=.*Separately)(?=.*Word.*Phrase)/isu);
  assert.match(nodeLabel(en, 'quality_gate'), /Unanswerable.*Regenerate.*>10 Words.*Filter/isu);
  assert.match(nodeLabel(en, 'dynamic_set'), /(?=.*Dynamic Test Set)(?=.*5,000 Question-answer Pairs)(?=.*Three.*Trials)/isu);
  assert.match(nodeLabel(en, 'gold_audit'), /Human Annotation.*250 Generated Pairs.*97\.2 Percent/isu);
  assert.match(nodeLabel(en, 'inference_config'), /Question Only.*Temperature 0.*Top-p 1.*Default Chat Template/isu);
  assert.match(nodeLabel(en, 'abstention_judge'), /Llama-3\.1-70B-Instruct.*JSON.*Correction = Attempt/isu);
  assert.match(nodeLabel(en, 'correctness_judge'), /Correct.*Incorrect.*Unverifiable.*Last Two Classes Are Hallucinations/isu);
  assert.match(nodeLabel(en, 'score_metrics'), /False Refusal Rate.*Hallucination Rate among Attempted Answers.*Overall Correct-answer Rate/isu);
  assert.match(nodeLabel(en, 'data_boundary'), /GoodWiki Revision 7491f6da6439.*WikiRank Download URLs.*Not Versioned.*Observed Byte Hashes/isu);
  assert.match(nodeLabel(en, 'regeneration_drift'), /Paper Retries Unanswerable Questions.*Batch Code Drops Them.*100-candidate Buffer/isu);
  assert.match(nodeLabel(en, 'runner_boundary'), /Module Default N 5000.*Shell Passes N 1.*No Sampling Seed.*Defaults to 256 Tokens/isu);
  assert.match(nodeLabel(en, 'judge_parser_drift'), /Labels.*Yes or No.*correct or yes.*Everything Else Is Marked Hallucinated/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /CC BY-NC 4\.0.*GoodWiki Dataset: MIT.*WikiRank Rights.*Not Inferred/isu);
  assertEdges(en, [
    ['source_evidence', 'benchmark_scope', 'secondary'],
    ['benchmark_scope', 'goodwiki_release'],
    ['goodwiki_release', 'wikirank_join'],
    ['wikirank_join', 'difficulty_bins'],
    ['difficulty_bins', 'page_sampling'],
    ['page_sampling', 'section_sampling'],
    ['section_sampling', 'question_generation'],
    ['question_generation', 'answer_generation'],
    ['answer_generation', 'quality_gate'],
    ['quality_gate', 'question_generation'],
    ['quality_gate', 'dynamic_set'],
    ['dynamic_set', 'gold_audit', 'secondary'],
    ['dynamic_set', 'inference_config'],
    ['inference_config', 'model_response'],
    ['model_response', 'abstention_judge'],
    ['abstention_judge', 'correctness_judge'],
    ['abstention_judge', 'score_metrics'],
    ['correctness_judge', 'score_metrics'],
    ['goodwiki_release', 'data_boundary', 'secondary'],
    ['quality_gate', 'regeneration_drift', 'secondary'],
    ['inference_config', 'runner_boundary', 'secondary'],
    ['correctness_judge', 'judge_parser_drift', 'secondary'],
    ['source_evidence', 'license_boundary', 'secondary'],
  ], 'PreciseWikiQA');
  assert.equal(en.nodes.find(node => node.id === 'quality_gate')?.style?.fontSize, 10);
  assert.equal(en.nodes.find(node => node.id === 'abstention_judge')?.style?.fontSize, 10);
  assert.equal(graphEdge(en, 'answer_generation', 'quality_gate').style?.entryY, 0.2);
  assert.equal(graphEdge(en, 'quality_gate', 'dynamic_set').style?.exitY, 0.2);
  assert.equal(graphEdge(en, 'quality_gate', 'question_generation').style, undefined);
  assert.equal(graphEdge(en, 'model_response', 'abstention_judge').style?.entryY, 0.2);
  assert.equal(graphEdge(en, 'abstention_judge', 'correctness_judge').style?.exitY, 0.2);
  assert.equal(graphEdge(en, 'abstention_judge', 'score_metrics').style?.exitY, 0.8);
  assert.match(detail.intro_en, /44,754.*10.*500.*5,000.*dynamic.*extrinsic hallucination/isu);
  assert.match(detail.scale_en, /44,754.*10 bins.*500.*5,000.*three trials/isu);
  assert.match(detail.metric_en, /False Refusal Rate.*Hallucination Rate among attempted answers.*Overall Correct-answer Rate/isu);
  assert.match(detail.drawio_review_note, /2257f8628da9a46bc82524d41f697eb1afda5b748b480c881e2dbc7a0d8801a3/u);
  assert.match(detail.drawio_review_note, /80307ac6bc9fd396a38b7a0de4196b931611b728/u);
  assert.match(detail.drawio_review_note, /a2f3777bc0cf697cd30faa9401be84faf5b17b62c35ae0d2100cb3ec547c1340/u);
  assert.match(detail.drawio_review_note, /918673a4b6f2cb9c9a7e50683fba4f0c8c85c330a3e2c70e4504301208fba8fa/u);
  assert.match(detail.drawio_review_note, /7491f6da6439cf25e4d783f96fd09c4256d314db/u);
  assert.match(detail.drawio_review_note, /2b8b3edebedec44e8a49994fe1f2a72322fdb8983e0a3bfd914b5014daef57a7/u);
  assert.match(detail.drawio_review_note, /f83bc6ac3f3ab434de84cb6442ce265e817207cc47302a3fba0181b2589b17f1/u);
  assert.match(detail.drawio_review_note, /2acf403c1f0e20960e53b71b36baa2788ec1e910ffed05535b3f2c9d45ea533c/u);
  assert.match(detail.drawio_review_note, /b758ae75dc9a15473e96b966a8361c72362a454246a25d1ad92f14c52a9f3627/u);
  assert.match(detail.drawio_review_note, /25887a1f7c4f25cb554d4c7bac96eb17f669ffd4c82680917a5da219032db661/u);
  assert.match(detail.drawio_review_note, /c9677569a00ca90b852db56a65e5c0fc4237c5ea0aa37d3d0a42e03f42c0ed6d/u);
  assert.match(detail.drawio_review_note, /10f16b03615b039b5f9aecf54d6d0e9c9bf55096058ae1ebf29d6cdf4e8cd820/u);
  assert.match(detail.drawio_review_note, /bc8f60ee50544b2dd70b4bc90e22de503aa23b317d284046a479811f2e06f396/u);
  assert.match(detail.drawio_review_note, /https:\/\/wikirank-2024\.di\.unimi\.it\/enwiki-2024\.titles/u);
  assert.match(detail.drawio_review_note, /https:\/\/wikirank-2024\.di\.unimi\.it\/rank\/enwiki-2024-h\.txt/u);
  assert.match(detail.drawio_review_note, /paper.*repeated.*batch.*continue.*100.*buffer/isu);
  assert.match(detail.drawio_review_note, /CORRECT.*INCORRECT.*UNVERIFIABLE.*Yes or No.*correct.*yes.*hallucinated/isu);
  assert.match(detail.drawio_review_note, /250.*97\.2.*96\.67.*95\.56/isu);
});
