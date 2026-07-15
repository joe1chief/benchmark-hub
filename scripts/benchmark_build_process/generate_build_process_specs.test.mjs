import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const generatorScript = new URL(
  './generate_build_process_specs.mjs',
  import.meta.url,
);

function createRootWithManifest(prefix, entries) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const publicDir = join(root, 'client/public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify(entries, null, 2)}\n`,
  );
  return { root, publicDir };
}

function explicitGraphEntry(overrides = {}) {
  return {
    id: 'BranchBench',
    evidence_summary_en: 'Paper-aligned branch and review loop.',
    evidence_summary_zh: '与论文对齐的分支与复核回路。',
    source_locator: 'Section 3.2 and Figure 2',
    diagram: {
      title_en: 'BranchBench Dataset Build and Evaluation',
      title_zh: 'BranchBench 数据构建与评测流程',
      nodes: [
        {
          id: 'source',
          label_en: 'Source Records',
          label_zh: '原始记录',
          type: 'document',
          position: { x: 40, y: 220 },
        },
        {
          id: 'review',
          label_en: 'Quality Review?',
          label_zh: '质量通过？',
          type: 'decision',
          position: { x: 320, y: 220 },
        },
        {
          id: 'accept',
          label_en: 'Release Set',
          label_zh: '发布数据集',
          type: 'database',
          position: { x: 600, y: 80 },
        },
        {
          id: 'revise',
          label_en: 'Revise Record',
          label_zh: '修订样本',
          type: 'process',
          position: { x: 600, y: 360 },
        },
      ],
      edges: [
        { from: 'source', to: 'review', type: 'primary' },
        {
          from: 'review',
          to: 'accept',
          type: 'primary',
          label_en: 'Pass',
          label_zh: '通过',
          label_position: 'end',
        },
        {
          from: 'review',
          to: 'revise',
          type: 'optional',
          label_en: 'Fail',
          label_zh: '未通过',
        },
        {
          from: 'revise',
          to: 'review',
          type: 'optional',
          label_en: 'Recheck',
          label_zh: '复核',
        },
      ],
    },
    ...overrides,
  };
}

test('preserves explicit bilingual branches, loops, labels, and positions', () => {
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-graph-',
    [explicitGraphEntry()],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const outputDir = join(publicDir, 'drawio/BranchBench');
  const en = readFileSync(join(outputDir, 'BranchBench.en.spec.yaml'), 'utf8');
  const zh = readFileSync(join(outputDir, 'BranchBench.zh.spec.yaml'), 'utf8');
  assert.match(en, /title: "BranchBench Dataset Build and Evaluation"/u);
  assert.match(zh, /title: "BranchBench 数据构建与评测流程"/u);
  assert.match(
    en,
    /id: review[\s\S]*?label: "Quality Review\?"[\s\S]*?type: decision[\s\S]*?x: 320[\s\S]*?'y': 220/u,
  );
  assert.match(
    en,
    /from: review\n    to: accept\n    type: primary\n    label: "Pass"\n    labelPosition: end/u,
  );
  assert.match(
    zh,
    /from: review\n    to: revise\n    type: optional\n    label: "未通过"/u,
  );
  assert.equal((en.match(/^  - from:/gmu) || []).length, 4);
  assert.equal((zh.match(/^  - from:/gmu) || []).length, 4);
});

test('preserves explicit edge waypoints in generated specs', () => {
  const entry = explicitGraphEntry();
  entry.diagram.edges[0].waypoints = [
    { x: 180, y: 120 },
    { x: 180, y: 220 },
  ];
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-waypoints-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const en = readFileSync(
    join(publicDir, 'drawio/BranchBench/BranchBench.en.spec.yaml'),
    'utf8',
  );
  assert.match(
    en,
    /from: source[\s\S]*?to: review[\s\S]*?waypoints:\n      - x: 180\n        'y': 120\n      - x: 180\n        'y': 220/u,
  );
});

test('rejects an explicit edge waypoint with a non-finite coordinate', () => {
  const entry = explicitGraphEntry();
  entry.diagram.edges[0].waypoints = [{ x: null, y: 120 }];
  const { root } = createRootWithManifest(
    'build-process-generator-invalid-waypoint-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /edge "source->review" waypoint 0 requires finite x and y/u,
  );
});

test('rejects consecutive explicit waypoints less than one pixel apart', () => {
  const entry = explicitGraphEntry();
  entry.diagram.edges[0].waypoints = [
    { x: 100, y: 100 },
    { x: 100.5, y: 100.5 },
  ];
  const { root } = createRootWithManifest(
    'build-process-generator-degenerate-waypoint-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /edge "source->review" waypoints 0 and 1 must be at least 1px apart/u,
  );
});

test('rejects an explicit edge that references an unknown node', () => {
  const entry = explicitGraphEntry();
  entry.diagram.edges[0].to = 'missing';
  const { root } = createRootWithManifest(
    'build-process-generator-unknown-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown node "missing"/u);
});

test('rejects a decision node with fewer than two outgoing paths', () => {
  const entry = explicitGraphEntry();
  entry.diagram.edges = entry.diagram.edges.filter(
    (edge) => !(edge.from === 'review' && edge.to === 'revise'),
  );
  const { root } = createRootWithManifest(
    'build-process-generator-decision-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /decision node "review" must have at least 2 outgoing edges/u);
});

test('rejects duplicate decision edges that lead to only one unique exit', () => {
  const entry = explicitGraphEntry();
  entry.diagram.edges = entry.diagram.edges.filter(
    (edge) => !(edge.from === 'review' && edge.to === 'revise'),
  );
  entry.diagram.edges.push({
    from: 'review',
    to: 'accept',
    type: 'optional',
    label_en: 'Fail',
    label_zh: '未通过',
  });
  const { root } = createRootWithManifest(
    'build-process-generator-duplicate-exit-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /decision node "review" must have at least 2 unique outgoing targets/u,
  );
});

test('rejects an explicit node id that is unsafe in the Draw.io DSL', () => {
  const entry = explicitGraphEntry();
  entry.diagram.nodes[1].id = 'review: pass';
  entry.diagram.edges = [];
  const { root } = createRootWithManifest(
    'build-process-generator-invalid-id-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid node id "review: pass"/u);
});

test('rejects unknown explicit node, size, and edge types', () => {
  for (const [mutate, expected] of [
    [
      (entry) => { entry.diagram.nodes[0].type = 'hexagon'; },
      /unknown node type "hexagon"/u,
    ],
    [
      (entry) => { entry.diagram.nodes[0].size = 'huge'; },
      /unknown node size "huge"/u,
    ],
    [
      (entry) => { entry.diagram.edges[0].type = 'conditional'; },
      /unknown edge type "conditional"/u,
    ],
  ]) {
    const entry = explicitGraphEntry();
    mutate(entry);
    const { root } = createRootWithManifest(
      'build-process-generator-invalid-enum-',
      [entry],
    );
    const result = spawnSync(
      process.execPath,
      [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
  }
});

test('rejects missing bilingual evidence metadata instead of serializing undefined', () => {
  const entry = explicitGraphEntry();
  delete entry.evidence_summary_en;
  const { root } = createRootWithManifest(
    'build-process-generator-metadata-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BranchBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires non-empty evidence_summary_en/u);
});

test('validates every selected benchmark before writing any spec files', () => {
  const valid = explicitGraphEntry({ id: 'ValidBench' });
  const invalid = explicitGraphEntry({ id: 'InvalidBench' });
  invalid.diagram.edges[0].to = 'missing';
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-atomic-',
    [valid, invalid],
  );

  const result = spawnSync(
    process.execPath,
    [
      generatorScript.pathname,
      '--root',
      root,
      '--id',
      'ValidBench',
      '--id',
      'InvalidBench',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.equal(existsSync(join(publicDir, 'drawio/ValidBench')), false);
});

test('rejects a path-unsafe benchmark id before creating output files', () => {
  const unsafeId = '../../EscapeBench';
  const entry = explicitGraphEntry({ id: unsafeId });
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-path-',
    [entry],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', unsafeId],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe benchmark id/u);
  assert.equal(existsSync(join(publicDir, '../EscapeBench')), false);
});

test('rejects incomplete asset metadata before sync or spec writes', () => {
  const entry = explicitGraphEntry();
  entry.assets = {
    drawio_flowchart_en: 'drawio/BranchBench/BranchBench.en.svg',
    drawio_flowchart_zh: 'drawio/BranchBench/BranchBench.zh.svg',
    drawio_source_en: 'drawio/BranchBench/BranchBench.en.drawio',
    drawio_source_zh: 'drawio/BranchBench/BranchBench.zh.drawio',
    drawio_spec_en: 'drawio/BranchBench/BranchBench.en.spec.yaml',
    drawio_spec_zh: 'drawio/BranchBench/BranchBench.zh.spec.yaml',
    drawio_arch_en: 'drawio/BranchBench/BranchBench.en.arch.json',
  };
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-assets-',
    [entry],
  );
  const detailDir = join(publicDir, 'benchmarks_detail');
  mkdirSync(detailDir, { recursive: true });
  const listPath = join(publicDir, 'benchmarks.json');
  const originalList = `${JSON.stringify([{ id: 'BranchBench' }], null, 2)}\n`;
  writeFileSync(listPath, originalList);
  writeFileSync(
    join(detailDir, 'BranchBench.json'),
    `${JSON.stringify({ id: 'BranchBench' }, null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [
      generatorScript.pathname,
      '--root',
      root,
      '--id',
      'BranchBench',
      '--sync-data',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires non-empty asset drawio_arch_zh/u);
  assert.equal(readFileSync(listPath, 'utf8'), originalList);
  assert.equal(existsSync(join(publicDir, 'drawio/BranchBench')), false);
});

test('rejects an absolute asset path even when it is inside the public directory', () => {
  const entry = explicitGraphEntry();
  entry.assets = {
    drawio_flowchart_en: 'drawio/BranchBench/BranchBench.en.svg',
    drawio_flowchart_zh: 'drawio/BranchBench/BranchBench.zh.svg',
    drawio_source_en: 'drawio/BranchBench/BranchBench.en.drawio',
    drawio_source_zh: 'drawio/BranchBench/BranchBench.zh.drawio',
    drawio_spec_en: 'drawio/BranchBench/BranchBench.en.spec.yaml',
    drawio_spec_zh: 'drawio/BranchBench/BranchBench.zh.spec.yaml',
    drawio_arch_en: 'drawio/BranchBench/BranchBench.en.arch.json',
    drawio_arch_zh: 'drawio/BranchBench/BranchBench.zh.arch.json',
  };
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-absolute-asset-',
    [entry],
  );
  entry.assets.drawio_flowchart_en = join(
    publicDir,
    'drawio/BranchBench/BranchBench.en.svg',
  );
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([entry], null, 2)}\n`,
  );
  const detailDir = join(publicDir, 'benchmarks_detail');
  mkdirSync(detailDir, { recursive: true });
  const listPath = join(publicDir, 'benchmarks.json');
  const originalList = `${JSON.stringify([{ id: 'BranchBench' }], null, 2)}\n`;
  writeFileSync(listPath, originalList);
  writeFileSync(
    join(detailDir, 'BranchBench.json'),
    `${JSON.stringify({ id: 'BranchBench' }, null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [
      generatorScript.pathname,
      '--root',
      root,
      '--id',
      'BranchBench',
      '--sync-data',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /asset drawio_flowchart_en must be a relative public path/u);
  assert.equal(readFileSync(listPath, 'utf8'), originalList);
  assert.equal(existsSync(join(publicDir, 'drawio/BranchBench')), false);
});

test('rejects an unknown legacy node type before writing specs', () => {
  const { root, publicDir } = createRootWithManifest(
    'build-process-generator-legacy-type-',
    [{
      id: 'LegacyBench',
      evidence_summary_en: 'Paper-aligned process.',
      evidence_summary_zh: '与论文对齐的流程。',
      source_locator: 'Section 3',
      construction_steps_en: ['Collect'],
      construction_steps_zh: ['收集'],
      evaluation_steps_en: [],
      evaluation_steps_zh: [],
      diagram_labels_en: ['Collect'],
      diagram_labels_zh: ['收集'],
      diagram_types: ['hexagon'],
    }],
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'LegacyBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown legacy node type "hexagon"/u);
  assert.equal(existsSync(join(publicDir, 'drawio/LegacyBench')), false);
});

test('writes topology-aligned English and Chinese academic specs', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-'));
  const publicDir = join(root, 'client/public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([
      {
        id: 'AlphaBench',
        evidence_summary_en: 'Paper-aligned construction and evaluation.',
        evidence_summary_zh: '与论文对齐的构建与评测流程。',
        source_locator: 'Section 3 and Appendix A',
        construction_steps_en: ['Collect source records', 'Review records'],
        construction_steps_zh: ['收集原始记录', '复核记录'],
        evaluation_steps_en: ['Run evaluation', 'Report accuracy'],
        evaluation_steps_zh: ['执行评测', '报告准确率'],
        diagram_labels_en: ['Source Records', 'Peer Review', 'Run Models', 'Report Accuracy'],
        diagram_labels_zh: ['原始记录', '人工复核', '运行模型', '报告准确率'],
        diagram_types: ['document', 'process', 'process', 'terminal'],
      },
    ], null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'AlphaBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const outputDir = join(publicDir, 'drawio/AlphaBench');
  const en = readFileSync(join(outputDir, 'AlphaBench.en.spec.yaml'), 'utf8');
  const zh = readFileSync(join(outputDir, 'AlphaBench.zh.spec.yaml'), 'utf8');
  assert.match(en, /profile: academic-paper/u);
  assert.match(en, /label: "Source Records"/u);
  assert.match(zh, /label: "原始记录"/u);
  assert.deepEqual(
    [...en.matchAll(/- id: (step_\d+)/gu)].map((match) => match[1]),
    [...zh.matchAll(/- id: (step_\d+)/gu)].map((match) => match[1]),
  );
  assert.deepEqual(
    [...en.matchAll(/from: (step_\d+)\n    to: (step_\d+)/gu)].map((match) => match.slice(1)),
    [...zh.matchAll(/from: (step_\d+)\n    to: (step_\d+)/gu)].map((match) => match.slice(1)),
  );
});

test('uses a display name for titles without changing the benchmark id', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-name-'));
  const publicDir = join(root, 'client/public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([{
      id: "Scientists'_First_Exam",
      display_name: "Scientists' First Exam",
      evidence_summary_en: 'Paper-aligned process.',
      evidence_summary_zh: '与论文对齐的流程。',
      source_locator: 'Section 3',
      construction_steps_en: ['Collect records'],
      construction_steps_zh: ['收集记录'],
      evaluation_steps_en: ['Report results'],
      evaluation_steps_zh: ['报告结果'],
      diagram_labels_en: ['Collect', 'Report'],
      diagram_labels_zh: ['收集', '报告'],
      diagram_types: ['document', 'terminal'],
    }], null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', "Scientists'_First_Exam"],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const spec = readFileSync(
    join(publicDir, "drawio/Scientists'_First_Exam/Scientists'_First_Exam.en.spec.yaml"),
    'utf8',
  );
  assert.match(spec, /title: "Scientists' First Exam Build and Evaluation Process"/u);
});

test('syncs manifest asset paths into list and detail records when requested', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-sync-'));
  const publicDir = join(root, 'client/public');
  const detailDir = join(publicDir, 'benchmarks_detail');
  mkdirSync(detailDir, { recursive: true });
  const entry = {
    id: 'AlphaBench',
    evidence_summary_en: 'Paper-aligned construction and evaluation.',
    evidence_summary_zh: '与论文对齐的构建与评测流程。',
    source_locator: 'Section 3 and Appendix A',
    construction_steps_en: ['Collect source records'],
    construction_steps_zh: ['收集原始记录'],
    evaluation_steps_en: ['Report accuracy'],
    evaluation_steps_zh: ['报告准确率'],
    diagram_labels_en: ['Source Records', 'Report Accuracy'],
    diagram_labels_zh: ['原始记录', '报告准确率'],
    diagram_types: ['document', 'terminal'],
    assets: {
      drawio_flowchart_en: 'drawio/AlphaBench/AlphaBench.en.svg',
      drawio_flowchart_zh: 'drawio/AlphaBench/AlphaBench.zh.svg',
      drawio_source_en: 'drawio/AlphaBench/AlphaBench.en.drawio',
      drawio_source_zh: 'drawio/AlphaBench/AlphaBench.zh.drawio',
      drawio_spec_en: 'drawio/AlphaBench/AlphaBench.en.spec.yaml',
      drawio_spec_zh: 'drawio/AlphaBench/AlphaBench.zh.spec.yaml',
      drawio_arch_en: 'drawio/AlphaBench/AlphaBench.en.arch.json',
      drawio_arch_zh: 'drawio/AlphaBench/AlphaBench.zh.arch.json',
    },
  };
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([entry], null, 2)}\n`,
  );
  writeFileSync(
    join(publicDir, 'benchmarks.json'),
    `${JSON.stringify([{ id: 'AlphaBench', name: 'AlphaBench' }], null, 2)}\n`,
  );
  writeFileSync(
    join(detailDir, 'AlphaBench.json'),
    `${JSON.stringify({ id: 'AlphaBench', name: 'AlphaBench' }, null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'AlphaBench', '--sync-data'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const listRecord = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json')))[0];
  const detailRecord = JSON.parse(readFileSync(join(detailDir, 'AlphaBench.json')));
  assert.equal(listRecord.drawio_flowchart_en, entry.assets.drawio_flowchart_en);
  assert.equal(detailRecord.drawio_arch_zh, entry.assets.drawio_arch_zh);
  assert.match(detailRecord.drawio_review_note, /Section 3 and Appendix A/u);
});

test('syncs benchmark data without overwriting hand-authored specs', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-sync-only-'));
  const publicDir = join(root, 'client/public');
  const detailDir = join(publicDir, 'benchmarks_detail');
  const drawioDir = join(publicDir, 'drawio/AlphaBench');
  mkdirSync(detailDir, { recursive: true });
  mkdirSync(drawioDir, { recursive: true });
  const assets = {
    drawio_flowchart_en: 'drawio/AlphaBench/AlphaBench.en.svg',
    drawio_flowchart_zh: 'drawio/AlphaBench/AlphaBench.zh.svg',
    drawio_source_en: 'drawio/AlphaBench/AlphaBench.en.drawio',
    drawio_source_zh: 'drawio/AlphaBench/AlphaBench.zh.drawio',
    drawio_spec_en: 'drawio/AlphaBench/AlphaBench.en.spec.yaml',
    drawio_spec_zh: 'drawio/AlphaBench/AlphaBench.zh.spec.yaml',
    drawio_arch_en: 'drawio/AlphaBench/AlphaBench.en.arch.json',
    drawio_arch_zh: 'drawio/AlphaBench/AlphaBench.zh.arch.json',
  };
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([{
      id: 'AlphaBench',
      evidence_summary_en: 'Paper-aligned process.',
      evidence_summary_zh: '与论文对齐的流程。',
      source_locator: 'Section 3',
      assets,
    }], null, 2)}\n`,
  );
  writeFileSync(
    join(publicDir, 'benchmarks.json'),
    `${JSON.stringify([{ id: 'AlphaBench' }], null, 2)}\n`,
  );
  writeFileSync(
    join(detailDir, 'AlphaBench.json'),
    `${JSON.stringify({ id: 'AlphaBench' }, null, 2)}\n`,
  );
  const handAuthored = 'meta:\n  title: Hand Authored\nnodes: []\nedges: []\n';
  writeFileSync(join(drawioDir, 'AlphaBench.en.spec.yaml'), handAuthored);
  writeFileSync(join(drawioDir, 'AlphaBench.zh.spec.yaml'), handAuthored);

  const result = spawnSync(
    process.execPath,
    [
      generatorScript.pathname,
      '--root',
      root,
      '--id',
      'AlphaBench',
      '--sync-data-only',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    readFileSync(join(drawioDir, 'AlphaBench.en.spec.yaml'), 'utf8'),
    handAuthored,
  );
  assert.equal(
    readFileSync(join(drawioDir, 'AlphaBench.zh.spec.yaml'), 'utf8'),
    handAuthored,
  );
  const listRecord = JSON.parse(readFileSync(join(publicDir, 'benchmarks.json')))[0];
  const detailRecord = JSON.parse(readFileSync(join(detailDir, 'AlphaBench.json')));
  assert.equal(listRecord.drawio_flowchart_en, assets.drawio_flowchart_en);
  assert.equal(detailRecord.drawio_arch_zh, assets.drawio_arch_zh);
});

test('validates explicit topology before sync-data-only mutates benchmark data', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-sync-only-invalid-'));
  const publicDir = join(root, 'client/public');
  const detailDir = join(publicDir, 'benchmarks_detail');
  const drawioDir = join(publicDir, 'drawio/BranchBench');
  mkdirSync(detailDir, { recursive: true });
  mkdirSync(drawioDir, { recursive: true });
  const entry = explicitGraphEntry({
    assets: {
      drawio_flowchart_en: 'drawio/BranchBench/BranchBench.en.svg',
      drawio_flowchart_zh: 'drawio/BranchBench/BranchBench.zh.svg',
      drawio_source_en: 'drawio/BranchBench/BranchBench.en.drawio',
      drawio_source_zh: 'drawio/BranchBench/BranchBench.zh.drawio',
      drawio_spec_en: 'drawio/BranchBench/BranchBench.en.spec.yaml',
      drawio_spec_zh: 'drawio/BranchBench/BranchBench.zh.spec.yaml',
      drawio_arch_en: 'drawio/BranchBench/BranchBench.en.arch.json',
      drawio_arch_zh: 'drawio/BranchBench/BranchBench.zh.arch.json',
    },
  });
  entry.diagram.edges[0].to = 'missing';
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([entry], null, 2)}\n`,
  );
  const listContent = `${JSON.stringify([{ id: 'BranchBench' }], null, 2)}\n`;
  writeFileSync(join(publicDir, 'benchmarks.json'), listContent);
  writeFileSync(
    join(detailDir, 'BranchBench.json'),
    `${JSON.stringify({ id: 'BranchBench' }, null, 2)}\n`,
  );
  const handAuthored = 'meta:\n  title: Hand Authored\nnodes: []\nedges: []\n';
  writeFileSync(join(drawioDir, 'BranchBench.en.spec.yaml'), handAuthored);

  const result = spawnSync(
    process.execPath,
    [
      generatorScript.pathname,
      '--root',
      root,
      '--id',
      'BranchBench',
      '--sync-data-only',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /edge to references unknown node "missing"/u);
  assert.equal(readFileSync(join(publicDir, 'benchmarks.json'), 'utf8'), listContent);
  assert.equal(
    readFileSync(join(drawioDir, 'BranchBench.en.spec.yaml'), 'utf8'),
    handAuthored,
  );
});

test('uses an eight-column layout for fifteen-step diagrams', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-wide-'));
  const publicDir = join(root, 'client/public');
  mkdirSync(publicDir, { recursive: true });
  const steps = Array.from({ length: 15 }, (_, index) => `Step ${index + 1}`);
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([{
      id: 'WideBench',
      evidence_summary_en: 'Paper-aligned process with fifteen stages.',
      evidence_summary_zh: '与论文对齐的十五阶段流程。',
      source_locator: 'Section 3',
      construction_steps_en: steps,
      construction_steps_zh: steps.map((_, index) => `阶段${index + 1}`),
      evaluation_steps_en: [],
      evaluation_steps_zh: [],
      diagram_labels_en: steps,
      diagram_labels_zh: steps.map((_, index) => `阶段${index + 1}`),
      diagram_types: steps.map(() => 'process'),
    }], null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'WideBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const spec = readFileSync(
    join(publicDir, 'drawio/WideBench/WideBench.en.spec.yaml'),
    'utf8',
  );
  assert.match(spec, /id: step_8[\s\S]*?x: 1696[\s\S]*?'y': 40/u);
  assert.match(spec, /id: step_9[\s\S]*?x: 1696[\s\S]*?'y': 416/u);
  assert.match(spec, /id: step_15[\s\S]*?x: 256[\s\S]*?'y': 416/u);
});

test('rejects an entry whose short labels do not cover every documented step', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-'));
  const publicDir = join(root, 'client/public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([
      {
        id: 'BetaBench',
        evidence_summary_en: 'Paper-aligned process.',
        evidence_summary_zh: '与论文对齐的流程。',
        source_locator: 'Section 4',
        construction_steps_en: ['Collect', 'Review'],
        construction_steps_zh: ['收集', '复核'],
        evaluation_steps_en: ['Evaluate'],
        evaluation_steps_zh: ['评测'],
        diagram_labels_en: ['Collect', 'Evaluate'],
        diagram_labels_zh: ['收集', '评测'],
        diagram_types: ['document', 'terminal'],
      },
    ], null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'BetaBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /labels \(2\) must match steps \(3\)/u);
});

test('rejects an entry whose node types do not cover every documented step', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-process-generator-'));
  const publicDir = join(root, 'client/public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    join(publicDir, 'benchmarks_build_process_manifest.json'),
    `${JSON.stringify([
      {
        id: 'GammaBench',
        evidence_summary_en: 'Paper-aligned process.',
        evidence_summary_zh: '与论文对齐的流程。',
        source_locator: 'Section 4',
        construction_steps_en: ['Collect', 'Review'],
        construction_steps_zh: ['收集', '复核'],
        evaluation_steps_en: ['Evaluate'],
        evaluation_steps_zh: ['评测'],
        diagram_labels_en: ['Collect', 'Review', 'Evaluate'],
        diagram_labels_zh: ['收集', '复核', '评测'],
        diagram_types: ['document', 'terminal'],
      },
    ], null, 2)}\n`,
  );

  const result = spawnSync(
    process.execPath,
    [generatorScript.pathname, '--root', root, '--id', 'GammaBench'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /types \(2\) must match steps \(3\)/u);
});
