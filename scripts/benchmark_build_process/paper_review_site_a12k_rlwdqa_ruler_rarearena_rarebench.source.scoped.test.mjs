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
const benchmarkIds = ['RLWDQA', 'RULER', 'RareArena', 'RareBench'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');

const graphNode = (id, type, x, y, style = { fontSize: 9 }) => ({
  id,
  type,
  size: 'xl',
  position: { x, y },
  style,
});

const graphEdge = (from, to, type = 'primary', style = null, waypoints = null) => ({
  from,
  to,
  type,
  style: style ?? (type === 'secondary' ? { dashed: true } : null),
  waypoints,
});

const secondaryEdge = (from, to, waypoints = null) => (
  graphEdge(from, to, 'secondary', { dashed: true }, waypoints)
);

const expectedGraphs = new Map([
  ['RLWDQA', {
    nodes: [
      graphNode('source_evidence', 'document', 20, 300, { fontSize: 8 }),
      graphNode('occurrence_audit', 'process', 260, 300),
      graphNode('vit_context', 'process', 500, 80),
      graphNode('vit_result', 'terminal', 740, 80),
      graphNode('deepstack_context', 'process', 500, 520),
      graphNode('deepstack_result', 'terminal', 740, 520),
      graphNode('disclosure_scope', 'document', 980, 300),
      graphNode('identity_boundary', 'document', 1220, 0),
      graphNode('construction_boundary', 'document', 1220, 180),
      graphNode('release_boundary', 'document', 1220, 420),
      graphNode('evaluator_boundary', 'document', 1220, 600),
      graphNode('status_boundary', 'terminal', 1460, 300),
    ],
    edges: [
      secondaryEdge('source_evidence', 'occurrence_audit'),
      graphEdge('occurrence_audit', 'vit_context'),
      graphEdge('vit_context', 'vit_result'),
      graphEdge('occurrence_audit', 'deepstack_context'),
      graphEdge('deepstack_context', 'deepstack_result'),
      graphEdge('vit_result', 'disclosure_scope'),
      graphEdge('deepstack_result', 'disclosure_scope'),
      secondaryEdge('disclosure_scope', 'identity_boundary'),
      secondaryEdge('disclosure_scope', 'construction_boundary'),
      secondaryEdge('disclosure_scope', 'release_boundary'),
      secondaryEdge('disclosure_scope', 'evaluator_boundary'),
      secondaryEdge('disclosure_scope', 'status_boundary'),
    ],
  }],
  ['RULER', {
    nodes: [
      graphNode('source_evidence', 'document', 20, 300, { fontSize: 8 }),
      graphNode('benchmark_design', 'process', 260, 300),
      graphNode('retrieval', 'process', 500, 0),
      graphNode('multihop', 'process', 500, 180),
      graphNode('aggregation', 'process', 500, 420),
      graphNode('qa', 'process', 500, 600),
      graphNode('task_suite', 'database', 740, 300),
      graphNode('length_grid', 'document', 980, 600),
      graphNode('prompt_contract', 'document', 980, 80),
      graphNode('generate', 'process', 1460, 300),
      graphNode('direct_answer', 'process', 1220, 0),
      graphNode('vt_cwe_one_shot', 'process', 1220, 180),
      graphNode('inference', 'process', 1700, 300, { fontSize: 8 }),
      graphNode('recall_metric', 'process', 1940, 300),
      graphNode('aggregate_scores', 'process', 2180, 300),
      graphNode('effective_length', 'terminal', 2420, 300),
      graphNode('paper_snapshot', 'document', 740, 820, { fontSize: 8 }),
      graphNode('current_drift', 'document', 980, 820, { fontSize: 8 }),
      graphNode('license_boundary', 'document', 1220, 820),
      graphNode('release_boundary', 'document', 1460, 820),
    ],
    edges: [
      secondaryEdge('source_evidence', 'benchmark_design'),
      graphEdge('benchmark_design', 'retrieval', 'primary', null, [
        { x: 210, y: 80 },
        { x: 450, y: 80 },
        { x: 450, y: 72 },
      ]),
      graphEdge('benchmark_design', 'multihop'),
      graphEdge('benchmark_design', 'aggregation'),
      graphEdge('benchmark_design', 'qa', 'primary', null, [
        { x: 210, y: 500 },
        { x: 450, y: 500 },
        { x: 450, y: 532 },
      ]),
      graphEdge('retrieval', 'task_suite', 'primary', null, [
        { x: 550, y: 110 },
        { x: 790, y: 110 },
        { x: 790, y: 228 },
      ]),
      graphEdge('multihop', 'task_suite'),
      graphEdge('aggregation', 'task_suite'),
      graphEdge('qa', 'task_suite', 'primary', null, [
        { x: 550, y: 520 },
        { x: 790, y: 520 },
        { x: 790, y: 368 },
      ]),
      graphEdge('task_suite', 'generate'),
      graphEdge('length_grid', 'generate', 'primary', null, [
        { x: 1200, y: 700 },
        { x: 1440, y: 700 },
        { x: 1440, y: 372 },
      ]),
      graphEdge('prompt_contract', 'direct_answer'),
      graphEdge('prompt_contract', 'vt_cwe_one_shot'),
      graphEdge('direct_answer', 'generate', 'primary', null, [
        { x: 1560, y: 72 },
        { x: 1560, y: 280 },
      ]),
      graphEdge('vt_cwe_one_shot', 'generate'),
      graphEdge('generate', 'inference'),
      graphEdge('inference', 'recall_metric'),
      graphEdge('recall_metric', 'aggregate_scores'),
      graphEdge('aggregate_scores', 'effective_length'),
      secondaryEdge('task_suite', 'paper_snapshot'),
      secondaryEdge('paper_snapshot', 'current_drift'),
      secondaryEdge('current_drift', 'license_boundary'),
      secondaryEdge('generate', 'release_boundary'),
    ],
  }],
  ['RareArena', {
    nodes: [
      graphNode('source_evidence', 'document', 20, 300, { fontSize: 8 }),
      graphNode('pmc_release', 'database', 260, 300),
      graphNode('candidate_pool', 'database', 500, 300),
      graphNode('case_filter', 'process', 740, 300),
      graphNode('filtered_cases', 'database', 980, 300),
      graphNode('coder_retrieval', 'process', 1220, 300),
      graphNode('gpt_mapping', 'process', 1460, 300),
      graphNode('mapping_audit', 'document', 1460, 760),
      graphNode('test_extraction', 'process', 1700, 300),
      graphNode('rds_truncation', 'process', 1940, 40),
      graphNode('rdc_truncation', 'process', 1940, 520),
      graphNode('rds_rephrase', 'process', 2180, 40),
      graphNode('rdc_rephrase', 'process', 2180, 520),
      graphNode('rds_leakage', 'process', 2420, 40),
      graphNode('rdc_leakage', 'process', 2420, 520),
      graphNode('rds_release', 'database', 2660, 40),
      graphNode('rdc_release', 'database', 2660, 520),
      graphNode('human_review', 'user', 2900, 300),
      graphNode('model_prompt', 'process', 3140, 300),
      graphNode('zero_shot_primary', 'process', 3380, 80),
      graphNode('prompt_subset', 'process', 3380, 520),
      graphNode('judge', 'process', 3620, 300),
      graphNode('metrics', 'terminal', 3860, 300),
      graphNode('version_history', 'document', 2660, 900, { fontSize: 8 }),
      graphNode('current_drift', 'document', 2900, 900, { fontSize: 8 }),
      graphNode('sampled_sets', 'document', 3140, 900),
      graphNode('license_boundary', 'document', 3380, 900),
    ],
    edges: [
      secondaryEdge('source_evidence', 'pmc_release'),
      graphEdge('pmc_release', 'candidate_pool'),
      graphEdge('candidate_pool', 'case_filter'),
      graphEdge('case_filter', 'filtered_cases'),
      graphEdge('filtered_cases', 'coder_retrieval'),
      graphEdge('coder_retrieval', 'gpt_mapping'),
      secondaryEdge('gpt_mapping', 'mapping_audit'),
      graphEdge('gpt_mapping', 'test_extraction'),
      graphEdge('test_extraction', 'rds_truncation'),
      graphEdge('test_extraction', 'rdc_truncation'),
      graphEdge('rds_truncation', 'rds_rephrase'),
      graphEdge('rdc_truncation', 'rdc_rephrase'),
      graphEdge('rds_rephrase', 'rds_leakage'),
      graphEdge('rdc_rephrase', 'rdc_leakage'),
      graphEdge('rds_leakage', 'rds_release'),
      graphEdge('rdc_leakage', 'rdc_release'),
      graphEdge('rds_release', 'human_review'),
      graphEdge('rdc_release', 'human_review'),
      graphEdge('human_review', 'model_prompt'),
      graphEdge('model_prompt', 'zero_shot_primary'),
      graphEdge('model_prompt', 'prompt_subset'),
      graphEdge('zero_shot_primary', 'judge'),
      graphEdge('prompt_subset', 'judge'),
      graphEdge('judge', 'metrics'),
      secondaryEdge('rds_release', 'version_history', [
        { x: 2880, y: -80 },
        { x: 4140, y: -80 },
        { x: 4140, y: 800 },
        { x: 2660, y: 800 },
      ]),
      secondaryEdge('rdc_release', 'version_history'),
      secondaryEdge('version_history', 'current_drift'),
      secondaryEdge('current_drift', 'sampled_sets'),
      secondaryEdge('sampled_sets', 'license_boundary'),
    ],
  }],
  ['RareBench', {
    nodes: [
      graphNode('source_evidence', 'document', 20, 300, { fontSize: 8 }),
      graphNode('public_source', 'database', 260, 40, { fontSize: 8 }),
      graphNode('pumch_source', 'database', 260, 560),
      graphNode('privacy_filter', 'process', 500, 560),
      graphNode('task_allocation', 'process', 740, 300),
      graphNode('task1', 'process', 980, 0),
      graphNode('task2', 'process', 980, 200),
      graphNode('task3', 'process', 980, 400),
      graphNode('task4', 'process', 980, 600),
      graphNode('task_suite', 'database', 1220, 300),
      graphNode('knowledge_sources', 'database', 1220, 820),
      graphNode('knowledge_graph', 'process', 1460, 820),
      graphNode('ic_walk', 'process', 1700, 820),
      graphNode('dynamic_retrieval', 'process', 1940, 820),
      graphNode('prompt_regimes', 'document', 2180, 300),
      graphNode('model_run', 'process', 2420, 300),
      graphNode('metric_router', 'process', 2660, 300),
      graphNode('task1_metric', 'process', 2900, 20),
      graphNode('task2_metric', 'process', 2900, 260),
      graphNode('task34_metric', 'process', 2900, 500),
      graphNode('report', 'terminal', 3140, 300),
      graphNode('doctor_study', 'document', 3380, 20),
      graphNode('repo_snapshot', 'document', 3380, 420, { fontSize: 8 }),
      graphNode('release_boundary', 'document', 3620, 420, { fontSize: 8 }),
      graphNode('license_boundary', 'document', 3860, 420, { fontSize: 8 }),
    ],
    edges: [
      secondaryEdge('source_evidence', 'public_source'),
      secondaryEdge('source_evidence', 'pumch_source'),
      graphEdge('pumch_source', 'privacy_filter'),
      graphEdge('privacy_filter', 'task_allocation'),
      graphEdge('task_allocation', 'task1', 'primary', null, [
        { x: 690, y: 80 },
        { x: 930, y: 80 },
        { x: 930, y: 72 },
      ]),
      graphEdge('task_allocation', 'task2'),
      graphEdge('task_allocation', 'task3'),
      graphEdge('task_allocation', 'task4', 'primary', null, [
        { x: 690, y: 480 },
        { x: 930, y: 480 },
        { x: 930, y: 532 },
      ]),
      graphEdge('public_source', 'task4', 'primary', null, [
        { x: 620, y: 42 },
        { x: 620, y: 702 },
        { x: 980, y: 702 },
      ]),
      graphEdge('task1', 'task_suite', 'primary', null, [
        { x: 1030, y: 120 },
        { x: 1270, y: 120 },
        { x: 1270, y: 228 },
      ]),
      graphEdge('task2', 'task_suite'),
      graphEdge('task3', 'task_suite'),
      graphEdge('task4', 'task_suite', 'primary', null, [
        { x: 1030, y: 520 },
        { x: 1270, y: 520 },
        { x: 1270, y: 368 },
      ]),
      graphEdge('task4', 'knowledge_sources'),
      graphEdge('knowledge_sources', 'knowledge_graph'),
      graphEdge('knowledge_graph', 'ic_walk'),
      graphEdge('ic_walk', 'dynamic_retrieval'),
      graphEdge('dynamic_retrieval', 'prompt_regimes'),
      graphEdge('task_suite', 'prompt_regimes'),
      graphEdge('prompt_regimes', 'model_run'),
      graphEdge('model_run', 'metric_router'),
      graphEdge('metric_router', 'task1_metric'),
      graphEdge('metric_router', 'task2_metric'),
      graphEdge('metric_router', 'task34_metric'),
      graphEdge('task1_metric', 'report'),
      graphEdge('task2_metric', 'report'),
      graphEdge('task34_metric', 'report'),
      secondaryEdge('report', 'doctor_study'),
      secondaryEdge('report', 'repo_snapshot'),
      secondaryEdge('repo_snapshot', 'release_boundary'),
      secondaryEdge('release_boundary', 'license_boundary'),
    ],
  }],
]);

const expectedLabelDigests = new Map([
  ['RLWDQA', {
    en: 'e7a92803650daf803557f2580fbfb871162ef167a6bdae638e7d2c1f97cc5251',
    zh: '19af2b9537e19029b533db887d67452c192103797c36dbe43c79e3ab00f5bd3a',
  }],
  ['RULER', {
    en: '88e3151fb10e1a64569cf6ab3c51e0d3a84dabd0146206ef20ed8f1ecbfab55b',
    zh: '10094da6e86144730336ec9e90e457cec13725f9a4def0a90c059d288a4e7950',
  }],
  ['RareArena', {
    en: '01a524db72134d16b267ea29620bad798eeccfeb2aaaac4606e3a2e22520f9b7',
    zh: '8f3f7fc4c599e4e4fc37140805199a59fb4ea3997b7a83e60167f7ac190a9892',
  }],
  ['RareBench', {
    en: '267629afd59f77e8d2c782a912e6df01b8b26babd0b2b8e21ea9a96e8ca2102f',
    zh: '3ac94b50254c4bad8d48c5907797bff990138e8d70f07bc26949f4d2a064f89d',
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

const expectedSourcePaths = id => ({
  drawio_source_en: `drawio/${id}/${id}.en.drawio`,
  drawio_source_zh: `drawio/${id}/${id}.zh.drawio`,
  drawio_spec_en: `drawio/${id}/${id}.en.spec.yaml`,
  drawio_spec_zh: `drawio/${id}/${id}.zh.spec.yaml`,
  drawio_arch_en: `drawio/${id}/${id}.en.arch.json`,
  drawio_arch_zh: `drawio/${id}/${id}.zh.arch.json`,
});

function normalizedNode({ id, type, size, position, style }) {
  return { id, type, size, position, style: style ?? null };
}

function normalizedEdge({ from, to, type = 'primary', style, waypoints }) {
  return {
    from,
    to,
    type,
    style: style ?? null,
    waypoints: waypoints ?? null,
  };
}

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(normalizedNode),
    edges: graph.edges.map(normalizedEdge),
    modules: graph.modules ?? [],
  };
}

function nodeLabelDigest(graph) {
  const canonical = JSON.stringify(graph.nodes.map(({ id, label }) => ({ id, label })));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function nodeLabel(graph, id) {
  const candidate = graph.nodes.find(current => current.id === id);
  assert.ok(candidate, `missing node ${id}`);
  return String(candidate.label);
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

const normalizedLabel = value => decodeXml(value).replace(/\s+/gu, ' ').trim();

test('locks all eight source specs to exact bilingual labels, geometry, styles, and edge tuples', () => {
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
      assert.deepEqual(positionedTopology(graph), {
        nodes: expected.nodes,
        edges: expected.edges,
        modules: [],
      }, `${id}.${language} full positioned topology`);
      assert.equal(
        nodeLabelDigest(graph),
        expectedLabelDigests.get(id)[language],
        `${id}.${language} complete node-label digest`,
      );
      assert.ok(graph.nodes.every(current => String(current.label).split('\n').length <= 5), `${id}.${language} line count`);
      assert.ok(graph.nodes.every(current => String(current.label).split('\n').every(line => [...line].length <= 54)), `${id}.${language} line width`);
      assert.equal(graph.edges.some(current => String(current.label ?? '').trim()), false, `${id}.${language} no edge labels`);
      for (const current of graph.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(current.style?.dashed, true, `${id}.${language} ${current.from}->${current.to} dashed`);
      }
      for (const current of graph.edges.filter(candidate => candidate.type === 'primary')) {
        assert.notEqual(current.style?.dashed, true, `${id}.${language} ${current.from}->${current.to} primary`);
      }
    }

    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.doesNotMatch(readFileSync(specPath(id, 'en'), 'utf8'), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const current of zh.nodes) {
      assert.match(String(current.label), /[\u3400-\u9fff]/u, `${id}.${current.id} Chinese semantics`);
    }
  }
});

test('locks source-stage paths, empty fallbacks, and awaiting-independent-signoff notes', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, null, `${id} canonical Mermaid fallback`);
    assert.equal(detail.flowchart_en, '', `${id} English fallback`);
    assert.equal(detail.flowchart_zh, '', `${id} Chinese fallback`);
    const pathKeys = Object.keys(expectedSourcePaths(id));
    assert.deepEqual(
      Object.fromEntries(pathKeys.map(key => [key, detail[key]])),
      expectedSourcePaths(id),
      `${id} six source paths`,
    );
    assert.equal(detail.drawio_flowchart_en, `drawio/${id}/${id}.en.svg`, `${id} English SVG path`);
    assert.equal(detail.drawio_flowchart_zh, `drawio/${id}/${id}.zh.svg`, `${id} Chinese SVG path`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-18/u, `${id} review date`);
    assert.match(
      detail.drawio_review_note,
      /status=source-reconstructed-awaiting-independent-signoff/u,
      `${id} source-stage status`,
    );
    assert.match(
      detail.drawio_review_note,
      /strict Draw\.io\/XML and runtime visual review are required next.*formal assets.*remain gated.*independent reviewer approval/isu,
      `${id} publication gate`,
    );
    assert.doesNotMatch(detail.drawio_review_note, /Formal publication evidence/iu, `${id} no premature signoff`);
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} evidence note length`);
  }
});

test('locks RLWDQA to its two result-only table occurrences and all missing-disclosure boundaries', () => {
  const detail = readDetail('RLWDQA');
  const en = readSpec('RLWDQA', 'en');
  assert.match(nodeLabel(en, 'source_evidence'), /2511\.21631v2.*ee075d08e67d.*4ce6bd67718d/isu);
  assert.match(nodeLabel(en, 'occurrence_audit'), /Exactly Two.*Table Headers.*No Citation or Definition/isu);
  assert.match(nodeLabel(en, 'vit_context'), /Table 11.*1\.7B.*1\.5T.*Downstream VLM Comparison/isu);
  assert.doesNotMatch(nodeLabel(en, 'vit_context'), /validation/iu);
  assert.match(nodeLabel(en, 'vit_result'), /SigLIP-2 58\.7.*Qwen3-ViT 66\.1.*Metric Name Unstated/isu);
  assert.match(nodeLabel(en, 'deepstack_context'), /Table 12.*15B-A2B.*200B.*No Post-training/isu);
  assert.match(nodeLabel(en, 'deepstack_result'), /Baseline 67\.7.*DeepStack 68\.1.*Metric Name Unstated/isu);
  assert.match(nodeLabel(en, 'disclosure_scope'), /Two Ablation-table Comparisons.*No Item or Example.*No Build Procedure/isu);
  assert.match(nodeLabel(en, 'identity_boundary'), /Undisclosed by Qwen3-VL.*No Standalone Paper Citation.*No Report-linked Repo or Data Card/isu);
  assert.match(nodeLabel(en, 'construction_boundary'), /Construction Undisclosed.*Provenance.*Annotation.*Quality Control/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Release Undisclosed.*Size.*Splits.*Schema.*License/isu);
  assert.match(nodeLabel(en, 'evaluator_boundary'), /Evaluation Undisclosed.*Prompt.*Scorer.*Metric Definition/isu);
  assert.match(nodeLabel(en, 'status_boundary'), /Cannot Be Reconstructed.*Do Not Substitute Another QA Pipeline/isu);
  assert.match(detail.drawio_review_note, /RLWDQA appears exactly twice.*both occurrences are table headers/isu);
  assert.match(detail.drawio_review_note, /Table 11.*downstream vision-language performance.*Table 12.*validation sets/isu);
  assert.doesNotMatch(detail.drawio_review_note, /Table 11.*vision-language validation/isu);
  assert.match(detail.drawio_review_note, /Taxonomy boundary.*broad Multimodal L1.*VLM benchmark column.*L2.*difficulty.*related-benchmark.*document QA/isu);
  assert.match(detail.drawio_review_note, /96588727e44c78b25ba03ea03b8e12f7e64fd0da/u);
  assert.match(detail.drawio_review_note, /ee075d08e67de1148d6437c6c1d481f7894183b8793905a2deb5f62664f49380/u);
  assert.match(detail.drawio_review_note, /4ce6bd67718d45ad150009892d0337f61f62e4fc3b0d442c76d2f4fd01f07b0d/u);
  assert.match(detail.intro, /表 11.*表 12.*未定义.*未披露/u);
  assert.match(detail.intro_en, /undefined.*Tables 11 and 12.*does not disclose/iu);
  for (const key of ['metric', 'metric_en', 'modality', 'modality_en', 'language', 'language_en', 'task_type', 'task_type_en']) {
    assert.equal(detail[key], '', `RLWDQA ${key} must remain undisclosed`);
  }
  assert.deepEqual({
    l1: detail.l1,
    l1_color: detail.l1_color,
    l2: detail.l2,
    l1_en: detail.l1_en,
    l2_en: detail.l2_en,
    default_l1: detail.default_l1,
    default_l2: detail.default_l2,
  }, {
    l1: '多模态理解',
    l1_color: '#7C3AED',
    l2: '未披露',
    l1_en: 'Multimodal',
    l2_en: 'Undisclosed',
    default_l1: 'Multimodal',
    default_l2: 'Undisclosed',
  }, 'RLWDQA taxonomy must stay at the broad VLM level disclosed by Table 11');
  assert.equal(detail.difficulty, '', 'RLWDQA difficulty must remain undisclosed');
  assert.equal(detail.difficulty_en, '', 'RLWDQA English difficulty must remain undisclosed');
  assert.deepEqual(detail.related_benchmarks, [], 'RLWDQA related benchmarks must not imply an undisclosed task identity');
});

test('locks RULER v3 construction, 13 configurations, length sweep, metric, and version drift', () => {
  const detail = readDetail('RULER');
  const en = readSpec('RULER', 'en');
  assert.match(nodeLabel(en, 'source_evidence'), /2404\.06654v3.*8a4bc6ca28d8.*dbc6a83c2f60.*38da79d79519/isu);
  assert.match(nodeLabel(en, 'retrieval'), /Eight Configs.*S-NIAH 3.*MK-NIAH 3.*MV-NIAH 1.*MQ-NIAH 1/isu);
  assert.match(nodeLabel(en, 'multihop'), /Variable Tracking.*One Chain.*Four Hops.*Five Variable Names/isu);
  assert.match(nodeLabel(en, 'aggregation'), /CWE.*10 Common Words.*30x.*3x.*alpha 2\.0/isu);
  assert.match(nodeLabel(en, 'qa'), /SQuAD.*Single-hop.*HotpotQA.*Multi-hop.*Distractor/isu);
  assert.match(nodeLabel(en, 'task_suite'), /13 Representative Configurations.*Four Behavior Categories.*Correlation Study/isu);
  assert.match(nodeLabel(en, 'generate'), /500 Examples per Length.*Auto-generated.*No Fixed Row Split/isu);
  assert.match(nodeLabel(en, 'length_grid'), /4K.*8K.*16K.*32K.*64K.*128K/isu);
  assert.match(nodeLabel(en, 'prompt_contract'), /Model.*Task Templates.*Instruction.*Context.*Query.*Answer Prefix.*Template-specific/isu);
  assert.match(nodeLabel(en, 'direct_answer'), /No One-shot Demonstration.*Task Answer Prefix/isu);
  assert.doesNotMatch(nodeLabel(en, 'direct_answer'), /Direct Answer|No Explanation/iu);
  assert.match(nodeLabel(en, 'vt_cwe_one_shot'), /VT and CWE.*One Demonstration/isu);
  assert.match(nodeLabel(en, 'inference'), /17.*15 Open.*GPT-4.*Gemini.*Paper.*vLLM.*BF16.*Eight A100s.*Llama2.*GPT.*Gemini.*API/isu);
  assert.match(nodeLabel(en, 'recall_metric'), /Recall-based Accuracy.*Target Presence/isu);
  assert.match(nodeLabel(en, 'effective_length'), /85\.6%.*Llama2-7B.*4K.*Claimed Length/isu);
  assert.match(nodeLabel(en, 'paper_snapshot'), /dbc6a83c2f60.*2024-08-01.*13 Names.*Llama2.*vLLM.*GPT.*OpenAI.*Gemini.*API/isu);
  assert.match(nodeLabel(en, 'current_drift'), /38da79d79519.*2026-06-25.*Generator Fixes.*RULERv2/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Apache-2\.0/isu);
  assert.match(detail.drawio_review_note, /8a4bc6ca28d84570eec7f42652400c2121f4c8bc361701634e596772e396fc22/u);
  assert.match(detail.drawio_review_note, /dbc6a83c2f60d034dfaab8e7af42dde1a5d2e3dc/u);
  assert.match(detail.drawio_review_note, /38da79d79519ef87aa46ae804f838e1eab7f86d7/u);
  assert.match(detail.drawio_review_note, /task suite.*length grid.*model-plus-task prompt templates.*jointly determine generation/isu);
  assert.match(detail.drawio_review_note, /prompt route.*demonstration.*assembled before the generator.*counted in the sequence-length budget/isu);
  assert.match(detail.drawio_review_note, /paper.*vLLM.*BF16.*eight A100.*explicitly configures Llama2-7B-Chat via vLLM.*GPT.*OpenAI.*Gemini.*API/isu);
  assert.match(detail.drawio_review_note, /does not enumerate all 15 open-source models as vLLM entries/isu);
  assert.match(detail.drawio_review_note, /no-explanation.*template-specific|template-specific.*no-explanation/isu);
});

test('locks RareArena paper construction, human review, evaluator, release counts, and 2026 drift', () => {
  const detail = readDetail('RareArena');
  const en = readSpec('RareArena', 'en');
  assert.match(nodeLabel(en, 'source_evidence'), /10\.1016\/j\.landig\.2025\.100953.*80e16b143872/isu);
  assert.match(nodeLabel(en, 'pmc_release'), /June 2024.*5\.8 Million.*PMC-Patients/isu);
  assert.match(nodeLabel(en, 'candidate_pool'), /250,294/isu);
  assert.match(nodeLabel(en, 'case_filter'), /Expert-designed.*One Patient.*GPT-4o-2024-05-13/isu);
  assert.match(nodeLabel(en, 'filtered_cases'), /104,000.*Ground-truth Label/isu);
  assert.match(nodeLabel(en, 'coder_retrieval'), /CODER.*Top Ten.*Cosine/isu);
  assert.match(nodeLabel(en, 'gpt_mapping'), /57,000.*Gold Label Stays Extracted Diagnosis/isu);
  assert.match(nodeLabel(en, 'mapping_audit'), /100.*94%/isu);
  assert.match(nodeLabel(en, 'rds_truncation'), /before Any Diagnostic Test.*No-test Cases May Remain/isu);
  assert.match(nodeLabel(en, 'rdc_truncation'), /before Final Diagnosis.*Cleaned Diagnostic Results.*Requires/isu);
  assert.match(nodeLabel(en, 'rds_release'), /49,760.*4,597/isu);
  assert.match(nodeLabel(en, 'rdc_release'), /22,901.*3,522/isu);
  assert.match(nodeLabel(en, 'human_review'), /Two Physicians.*Third Adjudicator.*100.*50 per Task.*Leakage.*Fidelity.*Complexity/isu);
  assert.match(nodeLabel(en, 'model_prompt'), /Top Five.*Temperature 0\.1.*Evaluation Regime/isu);
  assert.match(nodeLabel(en, 'zero_shot_primary'), /Primary Full-benchmark.*Same Zero-shot Prompt.*RDS.*RDC/isu);
  assert.match(nodeLabel(en, 'prompt_subset'), /Random 500-case Subset.*CoT.*Few-shot.*Three Fixed Random Demonstrations.*Disjoint/isu);
  assert.match(nodeLabel(en, 'judge'), /Score 2.*Synonym.*Score 1.*Hypernym.*Score 0.*Missing/isu);
  assert.match(nodeLabel(en, 'metrics'), /Top-1 Recall.*Top-5 Recall.*1 or 2/isu);
  assert.match(nodeLabel(en, 'version_history'), /4a822f1f9c99.*f8dc1fb2c088.*b18bc13492d9/isu);
  assert.match(nodeLabel(en, 'current_drift'), /80e16b143872.*2026-03-14.*Stricter.*Hypernym.*Not the Paper/isu);
  assert.match(nodeLabel(en, 'sampled_sets'), /RDS 8,562.*3,727.*RDC 4,376.*2,644.*Not Paper-scale/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /CC BY-NC-SA 4\.0.*GitHub.*Hugging Face/isu);
  assert.match(detail.drawio_review_note, /5\.8 million.*250,294.*104,000.*57,000/isu);
  assert.match(detail.drawio_review_note, /4a822f1f9c992adca6d90221537f50dc2b05a399/u);
  assert.match(detail.drawio_review_note, /f8dc1fb2c08826259911cc45b71435d2f0d7b898/u);
  assert.match(detail.drawio_review_note, /b18bc13492d9e8999cb143c9db31ac29bd3fd12e/u);
  assert.match(detail.drawio_review_note, /80e16b1438729562b19c3b3103a31ac9f4949048/u);
  assert.match(detail.drawio_review_note, /random 500-case subset.*chain-of-thought.*few-shot.*three fixed randomly selected demonstrations.*disjoint/isu);
});

test('locks RareBench four task datasets, dynamic prompting, metrics, safeguards, and license boundaries', () => {
  const detail = readDetail('RareBench');
  const en = readSpec('RareBench', 'en');
  const zh = readSpec('RareBench', 'zh');
  assert.match(nodeLabel(en, 'source_evidence'), /2402\.06341v2.*f8755b27ca79.*CC BY 4\.0.*82a9d8ca86c9/isu);
  assert.match(nodeLabel(en, 'public_source'), /MME 40\/17.*LIRICAL 370\/252.*HMS 88\/39.*RAMEDIS 624\/63.*1,122 \/ 362/isu);
  assert.match(nodeLabel(en, 'pumch_source'), /1,650.*1,183 Rare.*467 Common/isu);
  assert.match(nodeLabel(en, 'privacy_filter'), /Remove All Personal Information.*Physicians Monitor.*Filter/isu);
  assert.match(nodeLabel(en, 'task1'), /34 Diseases.*87 EHRs.*PTE.*GEE.*GES/isu);
  assert.match(nodeLabel(en, 'task2'), /3 Diseases.*33 EHRs.*ALS.*PNH.*MSA/isu);
  assert.match(nodeLabel(en, 'task3'), /77 Diseases.*527 EHRs.*60 Rare.*467 Common/isu);
  assert.match(nodeLabel(en, 'task4'), /421 Diseases.*2,185 Cases.*Public.*PUMCH/isu);
  assert.match(nodeLabel(en, 'knowledge_sources'), /HPO.*OMIM.*Orphanet.*CCRD/isu);
  assert.match(nodeLabel(en, 'knowledge_graph'), /17,232.*9,260.*21,505 Phenotype-Phenotype Edges/isu);
  assert.match(nodeLabel(zh, 'knowledge_graph'), /17,232.*9,260.*21,505 条表型-表型边/isu);
  assert.match(nodeLabel(en, 'ic_walk'), /IC-weighted.*Node2vec.*256D/isu);
  assert.match(nodeLabel(en, 'dynamic_retrieval'), /Three-shot.*Patient Embedding.*Cosine.*Top Three/isu);
  assert.match(nodeLabel(en, 'task1_metric'), /Precision.*Recall.*F1.*Exact PTE and GES.*Semantic Match for GEE/isu);
  assert.match(nodeLabel(en, 'task2_metric'), /Recall.*ALS.*PNH.*MSA/isu);
  assert.match(nodeLabel(en, 'task34_metric'), /Top-k Recall.*1.*3.*10.*Median Rank/isu);
  assert.match(nodeLabel(en, 'doctor_study'), /75.*16 Diseases.*Five Departments.*50 Specialist/isu);
  assert.match(nodeLabel(en, 'repo_snapshot'), /82a9d8ca86c9.*Apache-2\.0/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /chenxz\/RareBench.*6f054e040719.*PUMCH_ADM 75.*16.*Full 1,650 Not Public.*RAMEDIS.*624 \/ 74.*Paper.*624 \/ 63/isu);
  assert.match(nodeLabel(en, 'license_boundary'), /Article.*CC BY 4\.0.*Repository Code.*Apache-2\.0.*HF Dataset Card.*Apache-2\.0.*Unreleased Full PUMCH/isu);
  assert.match(detail.drawio_review_note, /f8755b27ca798c59d53ea1261a77108a97ea1b5cc8fc5104402f255775f8371e/u);
  assert.match(detail.drawio_review_note, /82a9d8ca86c983ad6b22c5092fbb5b05ec66a0b6/u);
  assert.match(detail.drawio_review_note, /6f054e04071953ef2c1779b279074245f2ab398c/u);
  assert.match(detail.drawio_review_note, /88f68edf095f04fd741bd012bc9ae3009c1cbb624b548bf3ef83188ac30922ce/u);
  assert.match(detail.drawio_review_note, /458ebbbd7b8f2975aa9c3a1773e9c1fb103563a291775b6fd5e979375ed1ab3c/u);
  assert.match(detail.drawio_review_note, /021059237c9a7748f996b377d1436ca1e43354dad232ecd855cb8f6d692b2c42/u);
  assert.match(detail.drawio_review_note, /MME 40\/17.*LIRICAL 370\/252.*HMS 88\/39.*RAMEDIS 624\/63/isu);
  assert.match(detail.drawio_review_note, /article.*CC BY 4\.0.*code.*Apache-2\.0.*Hugging Face.*apache-2\.0.*75.*full 1,650.*RAMEDIS 624\/74.*paper Table 1 624\/63/isu);
  for (const key of ['metric', 'metric_en', 'scale', 'scale_en']) {
    assert.equal(detail[key], '', `RareBench ${key} must not collapse task- and release-specific facts`);
  }
});

test('strictly renders all eight source specs as valid Draw.io XML in temporary paths', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a12k-source-xml-'));
  let renderCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli,
          specPath(id, language),
          generated,
          '--validate',
          '--strict',
          '--write-sidecars',
        ], { stdio: 'pipe' });

        assert.deepEqual(
          parseYaml(readFileSync(generated.replace(/\.drawio$/u, '.spec.yaml'), 'utf8')),
          readSpec(id, language),
          `${id}.${language} strict semantic replay`,
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
          `${id}.${language} XML node labels`,
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
    assert.equal(renderCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
