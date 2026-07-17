import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const auditScript = new URL('./audit_build_process_assets.mjs', import.meta.url);

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createCompleteFixture() {
  const root = mkdtempSync(join(tmpdir(), 'build-process-audit-'));
  const detailDir = join(root, 'client/public/benchmarks_detail');
  const drawioDir = join(root, 'client/public/drawio/AlphaBench');
  mkdirSync(detailDir, { recursive: true });
  mkdirSync(drawioDir, { recursive: true });

  const assetFields = {
    drawio_flowchart_en: 'drawio/AlphaBench/AlphaBench.en.svg',
    drawio_flowchart_zh: 'drawio/AlphaBench/AlphaBench.zh.svg',
    drawio_source_en: 'drawio/AlphaBench/AlphaBench.en.drawio',
    drawio_source_zh: 'drawio/AlphaBench/AlphaBench.zh.drawio',
    drawio_spec_en: 'drawio/AlphaBench/AlphaBench.en.spec.yaml',
    drawio_spec_zh: 'drawio/AlphaBench/AlphaBench.zh.spec.yaml',
    drawio_arch_en: 'drawio/AlphaBench/AlphaBench.en.arch.json',
    drawio_arch_zh: 'drawio/AlphaBench/AlphaBench.zh.arch.json',
  };

  writeJson(join(detailDir, 'AlphaBench.json'), {
    id: 'AlphaBench',
    paper_url: 'https://arxiv.org/abs/1234.5678',
    ...assetFields,
  });

  writeJson(join(root, 'client/public/benchmarks_build_process_manifest.json'), [
    {
      id: 'AlphaBench',
      source_type: 'paper',
      source_url: 'https://arxiv.org/abs/1234.5678',
      source_locator: 'Section 3',
      evidence_summary_en: 'The paper describes collection, review, and evaluation.',
      evidence_summary_zh: '论文说明了收集、复核与评测流程。',
      construction_steps_en: ['Collect', 'Review'],
      construction_steps_zh: ['收集', '复核'],
      evaluation_steps_en: ['Evaluate'],
      evaluation_steps_zh: ['评测'],
      strict_validation: { en: 'passed', zh: 'passed' },
      review_status: 'visually_reviewed',
      paper_alignment_review: {
        status: 'passed',
        source_url: 'https://arxiv.org/abs/1234.5678',
        source_locator: 'Section 3',
      },
      assets: assetFields,
    },
  ]);
  writeJson(join(root, 'client/public/benchmarks.json'), [
    {
      id: 'AlphaBench',
      ...assetFields,
    },
  ]);

  writeFileSync(
    join(drawioDir, 'AlphaBench.en.spec.yaml'),
    'meta:\n  title: AlphaBench Build Process\n  description: Paper-aligned process.\n  legend: Solid arrows show the main flow.\nnodes: []\nedges: []\n',
  );
  writeFileSync(
    join(drawioDir, 'AlphaBench.zh.spec.yaml'),
    'meta:\n  title: AlphaBench 构建流程\n  description: 与论文对齐的构建流程。\n  legend: 实线箭头表示主流程。\nnodes: []\nedges: []\n',
  );
  for (const suffix of ['en.drawio', 'zh.drawio']) {
    writeFileSync(join(drawioDir, `AlphaBench.${suffix}`), '<mxfile><diagram/></mxfile>\n');
  }
  for (const suffix of ['en.arch.json', 'zh.arch.json']) {
    writeJson(join(drawioDir, `AlphaBench.${suffix}`), { nodes: [], edges: [] });
  }
  for (const suffix of ['en.svg', 'zh.svg']) {
    writeFileSync(
      join(drawioDir, `AlphaBench.${suffix}`),
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text>AlphaBench</text></svg>\n',
    );
  }
  for (const suffix of ['en.png', 'zh.png']) {
    writeFileSync(join(drawioDir, `AlphaBench.${suffix}`), 'png fixture\n');
  }

  return root;
}

function assetFieldsFor(id) {
  return {
    drawio_flowchart_en: `drawio/${id}/${id}.en.svg`,
    drawio_flowchart_zh: `drawio/${id}/${id}.zh.svg`,
    drawio_source_en: `drawio/${id}/${id}.en.drawio`,
    drawio_source_zh: `drawio/${id}/${id}.zh.drawio`,
    drawio_spec_en: `drawio/${id}/${id}.en.spec.yaml`,
    drawio_spec_zh: `drawio/${id}/${id}.zh.spec.yaml`,
    drawio_arch_en: `drawio/${id}/${id}.en.arch.json`,
    drawio_arch_zh: `drawio/${id}/${id}.zh.arch.json`,
  };
}

function addCompleteBenchmark(root, id, {
  paperStatus = 'passed',
  strictEn = 'passed',
  strictZh = 'passed',
  visualStatus = 'visually_reviewed',
} = {}) {
  const fields = assetFieldsFor(id);
  const sourceUrl = `https://arxiv.org/abs/${id === 'BetaBench' ? '2345.6789' : '3456.7890'}`;
  const sourceLocator = 'Section 4';
  const detailDir = join(root, 'client/public/benchmarks_detail');
  const drawioDir = join(root, `client/public/drawio/${id}`);
  mkdirSync(drawioDir, { recursive: true });
  writeJson(join(detailDir, `${id}.json`), {
    id,
    paper_url: sourceUrl,
    ...fields,
  });

  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.push({
    id,
    source_type: 'paper',
    source_url: sourceUrl,
    source_locator: sourceLocator,
    strict_validation: { en: strictEn, zh: strictZh },
    review_status: visualStatus,
    paper_alignment_review: {
      status: paperStatus,
      source_url: sourceUrl,
      source_locator: sourceLocator,
    },
    assets: fields,
  });
  writeJson(manifestPath, manifest);

  const aggregatePath = join(root, 'client/public/benchmarks.json');
  const aggregate = JSON.parse(readFileSync(aggregatePath, 'utf8'));
  aggregate.push({ id, ...fields });
  writeJson(aggregatePath, aggregate);

  writeFileSync(
    join(drawioDir, `${id}.en.spec.yaml`),
    `meta:\n  title: ${id} Build Process\n  description: Paper-aligned process.\n  legend: Solid arrows show the main flow.\nnodes: []\nedges: []\n`,
  );
  writeFileSync(
    join(drawioDir, `${id}.zh.spec.yaml`),
    `meta:\n  title: ${id} 构建流程\n  description: 与论文对齐的构建流程。\n  legend: 实线箭头表示主流程。\nnodes: []\nedges: []\n`,
  );
  for (const suffix of ['en.drawio', 'zh.drawio']) {
    writeFileSync(join(drawioDir, `${id}.${suffix}`), '<mxfile><diagram/></mxfile>\n');
  }
  for (const suffix of ['en.arch.json', 'zh.arch.json']) {
    writeJson(join(drawioDir, `${id}.${suffix}`), { nodes: [], edges: [] });
  }
  for (const suffix of ['en.svg', 'zh.svg']) {
    writeFileSync(
      join(drawioDir, `${id}.${suffix}`),
      `<svg xmlns="http://www.w3.org/2000/svg"><text>${id}</text></svg>\n`,
    );
  }
  for (const suffix of ['en.png', 'zh.png']) {
    writeFileSync(join(drawioDir, `${id}.${suffix}`), 'png fixture\n');
  }
}

function writeArchPair(root, en, zh = en) {
  const drawioDir = join(root, 'client/public/drawio/AlphaBench');
  writeJson(join(drawioDir, 'AlphaBench.en.arch.json'), en);
  writeJson(join(drawioDir, 'AlphaBench.zh.arch.json'), zh);
}

test('reports one complete bilingual benchmark when all required assets exist', () => {
  const root = createCompleteFixture();
  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.detail_total, 1);
  assert.equal(summary.manifest_total, 1);
  assert.equal(summary.complete_bilingual_total, 1);
  assert.equal(summary.strict_valid_total, 1);
  assert.equal(summary.visually_reviewed_total, 1);
  assert.equal(summary.paper_aligned_total, 1);
  assert.equal(summary.png_complete_total, 1);
  assert.equal(summary.id_sets_equal, true);
  assert.deepEqual(summary.id_set_issues, []);
  assert.deepEqual(summary.png_issues, []);
  assert.deepEqual(summary.strict_issues, []);
  assert.deepEqual(summary.visual_issues, []);
  assert.deepEqual(summary.paper_alignment_issues, []);
  assert.deepEqual(summary.unresolved_queue, []);
  assert.deepEqual(summary.missing_ids, []);
  assert.deepEqual(summary.broken_references, []);
});

test('rejects English and Chinese architecture sidecars with different topology', () => {
  const root = createCompleteFixture();
  const en = {
    nodes: [
      { id: 'source', label: 'Source', type: 'document' },
      { id: 'gate', label: 'Accepted?', type: 'decision' },
      { id: 'yes', label: 'Release', type: 'terminal' },
      { id: 'no', label: 'Revise', type: 'process' },
    ],
    edges: [
      { from: 'source', to: 'gate', type: 'primary' },
      { from: 'gate', to: 'yes', type: 'primary' },
      { from: 'gate', to: 'no', type: 'optional' },
    ],
  };
  const zh = {
    nodes: [
      { id: 'source', label: '来源', type: 'document' },
      { id: 'gate', label: '通过？', type: 'decision' },
      { id: 'yes', label: '发布', type: 'terminal' },
      { id: 'no', label: '修订', type: 'process' },
    ],
    edges: [
      { from: 'source', to: 'gate', type: 'primary' },
      { from: 'gate', to: 'yes', type: 'primary' },
      { from: 'no', to: 'gate', type: 'optional' },
    ],
  };
  writeArchPair(root, en, zh);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.topology_issues, [
    { id: 'AlphaBench', issue: 'bilingual_edge_topology_mismatch' },
  ]);
});

test('rejects a decision node with only one unique outgoing target', () => {
  const root = createCompleteFixture();
  writeArchPair(root, {
    nodes: [
      { id: 'gate', label: 'Accepted?', type: 'decision' },
      { id: 'next', label: 'Next', type: 'process' },
    ],
    edges: [
      { from: 'gate', to: 'next', type: 'primary' },
    ],
  }, {
    nodes: [
      { id: 'gate', label: '通过？', type: 'decision' },
      { id: 'next', label: '下一步', type: 'process' },
    ],
    edges: [
      { from: 'gate', to: 'next', type: 'primary' },
    ],
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.topology_issues, [
    {
      id: 'AlphaBench',
      node: 'gate',
      issue: 'decision_has_fewer_than_two_unique_targets',
      outgoing_targets: 1,
    },
  ]);
});

test('rejects decision branches whose targets do not exist', () => {
  const root = createCompleteFixture();
  const en = {
    nodes: [{ id: 'gate', label: 'Accepted?', type: 'decision' }],
    edges: [
      { from: 'gate', to: 'missing_yes', type: 'primary', label: 'Yes' },
      { from: 'gate', to: 'missing_no', type: 'optional', label: 'No' },
    ],
  };
  const zh = {
    nodes: [{ id: 'gate', label: '通过？', type: 'decision' }],
    edges: [
      { from: 'gate', to: 'missing_yes', type: 'primary', label: '是' },
      { from: 'gate', to: 'missing_no', type: 'optional', label: '否' },
    ],
  };
  writeArchPair(root, en, zh);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.topology_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      edge: 'gate->missing_yes',
      issue: 'edge_target_missing',
    },
    {
      id: 'AlphaBench',
      language: 'en',
      edge: 'gate->missing_no',
      issue: 'edge_target_missing',
    },
    {
      id: 'AlphaBench',
      language: 'zh',
      edge: 'gate->missing_yes',
      issue: 'edge_target_missing',
    },
    {
      id: 'AlphaBench',
      language: 'zh',
      edge: 'gate->missing_no',
      issue: 'edge_target_missing',
    },
    {
      id: 'AlphaBench',
      node: 'gate',
      issue: 'decision_has_fewer_than_two_unique_targets',
      outgoing_targets: 0,
    },
  ]);
});

test('rejects duplicate node ids in architecture sidecars', () => {
  const root = createCompleteFixture();
  writeArchPair(root, {
    nodes: [
      { id: 'source', label: 'Source A', type: 'document' },
      { id: 'source', label: 'Source B', type: 'process' },
    ],
    edges: [],
  }, {
    nodes: [
      { id: 'source', label: '来源甲', type: 'document' },
      { id: 'source', label: '来源乙', type: 'process' },
    ],
    edges: [],
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.topology_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      node: 'source',
      count: 2,
      issue: 'duplicate_node_id',
    },
    {
      id: 'AlphaBench',
      language: 'zh',
      node: 'source',
      count: 2,
      issue: 'duplicate_node_id',
    },
  ]);
});

test('rejects missing and untranslated Chinese edge labels', () => {
  const root = createCompleteFixture();
  const nodesEn = [
    { id: 'source', label: 'Source', type: 'document' },
    { id: 'review', label: 'Review', type: 'process' },
    { id: 'release', label: 'Release', type: 'terminal' },
  ];
  const nodesZh = [
    { id: 'source', label: '来源', type: 'document' },
    { id: 'review', label: '复核', type: 'process' },
    { id: 'release', label: '发布', type: 'terminal' },
  ];
  writeArchPair(root, {
    nodes: nodesEn,
    edges: [
      { from: 'source', to: 'review', type: 'primary', label: 'Collected' },
      { from: 'review', to: 'release', type: 'primary', label: 'Pass' },
    ],
  }, {
    nodes: nodesZh,
    edges: [
      { from: 'source', to: 'review', type: 'primary', label: '' },
      { from: 'review', to: 'release', type: 'primary', label: 'Pass' },
    ],
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'edge:source->review:primary',
      issue: 'bilingual_edge_label_presence_mismatch',
    },
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'edge:review->release:primary',
      issue: 'untranslated_chinese_edge_label',
    },
  ]);
});

test('rejects a wholly untranslated Chinese architecture sidecar', () => {
  const root = createCompleteFixture();
  const arch = {
    nodes: [
      { id: 'source', label: 'Source Records', type: 'document' },
      { id: 'report', label: 'Report Accuracy', type: 'terminal' },
    ],
    edges: [
      { from: 'source', to: 'report', type: 'primary' },
    ],
  };
  writeArchPair(root, arch);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'nodes',
      issue: 'missing_chinese_node_text',
    },
  ]);
});

test('rejects untranslated Chinese node labels hidden by one translated node', () => {
  const root = createCompleteFixture();
  writeArchPair(root, {
    nodes: [
      { id: 'source', label: 'Source Records', type: 'document' },
      { id: 'review', label: 'Validate', type: 'process' },
      { id: 'report', label: 'Report Accuracy', type: 'terminal' },
    ],
    edges: [
      { from: 'source', to: 'review', type: 'primary' },
      { from: 'review', to: 'report', type: 'primary' },
    ],
  }, {
    nodes: [
      { id: 'source', label: '原始记录', type: 'document' },
      { id: 'review', label: 'Validate', type: 'process' },
      { id: 'report', label: 'Report Accuracy', type: 'terminal' },
    ],
    edges: [
      { from: 'source', to: 'review', type: 'primary' },
      { from: 'review', to: 'report', type: 'primary' },
    ],
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'node:review',
      issue: 'untranslated_chinese_node_label',
    },
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'node:report',
      issue: 'untranslated_chinese_node_label',
    },
  ]);
});

test('allows a Chinese diagram whose non-Chinese nodes are formulas or explicit technical exemptions', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].language_exempt_node_ids = ['bleu'];
  writeJson(manifestPath, manifest);
  const arch = {
    nodes: [
      { id: 'bleu', label: 'BLEU', type: 'terminal' },
      { id: 'formula', label: 'F1=2PR/(P+R)', type: 'formula' },
    ],
    edges: [
      { from: 'bleu', to: 'formula', type: 'primary' },
    ],
  };
  writeArchPair(root, arch);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, []);
});

test('allows controlled metric and official dataset identifiers in Chinese diagrams', () => {
  const root = createCompleteFixture();
  const labels = [
    'BLEU-1、BLEU-4、ROUGE-L',
    'MIMIC、ChatDoctor、DrugBank、Drugs.com',
    'Pass@1',
    'mG-Pass@16',
    'F1、IoU、mAP',
    'score@k',
    'MiniGPT4-CoT',
    'Grid-LLaVA',
    'Open Images',
    'Mean IoU',
    'ClinicalTrials.gov XML',
    'SecureBio VMQA4',
    'Seal-Hard 254',
  ];
  writeArchPair(root, {
    nodes: labels.map((label, index) => ({
      id: `technical_${index}`,
      label,
      type: 'process',
    })),
    edges: labels.slice(1).map((_, index) => ({
      from: `technical_${index}`,
      to: `technical_${index + 1}`,
      type: 'primary',
    })),
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, []);
});

test('rejects generic English labels even when they contain a number', () => {
  const root = createCompleteFixture();
  writeArchPair(root, {
    nodes: [{ id: 'task', label: 'Task 1', type: 'process' }],
    edges: [],
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [{
    id: 'AlphaBench',
    language: 'zh',
    field: 'nodes',
    issue: 'missing_chinese_node_text',
  }]);
});

test('rejects ordinary English disguised as technical identifiers', () => {
  const root = createCompleteFixture();
  const labels = [
    ['translated', '已翻译'],
    ['upper', 'SOURCE'],
    ['camel', 'ValidateData'],
    ['dotted', 'Collect.data'],
    ['atSign', 'Report@Now'],
    ['numbered', 'SourceData 1'],
  ];
  const englishArch = {
    nodes: labels.map(([id]) => ({ id, label: 'English source', type: 'process' })),
    edges: [],
  };
  const chineseArch = {
    nodes: labels.map(([id, label]) => ({ id, label, type: 'process' })),
    edges: [],
  };
  writeArchPair(root, englishArch, chineseArch);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(
    summary.language_issues.map((issue) => issue.field),
    ['node:upper', 'node:camel', 'node:dotted', 'node:atSign', 'node:numbered'],
  );
});

test('rejects a blank Chinese node label', () => {
  const root = createCompleteFixture();
  writeArchPair(root, {
    nodes: [{ id: 'source', label: 'Source', type: 'document' }],
    edges: [],
  }, {
    nodes: [{ id: 'source', label: '   ', type: 'document' }],
    edges: [],
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [{
    id: 'AlphaBench',
    language: 'zh',
    field: 'node:source',
    issue: 'missing_node_label',
  }]);
});

for (const [name, label] of [
  ['Cyrillic', 'Источник'],
  ['Korean', '데이터셋'],
]) {
  test(`rejects ${name} text in a Chinese diagram unless explicitly exempted`, () => {
    const root = createCompleteFixture();
    writeArchPair(root, {
      nodes: [{ id: 'source', label, type: 'document' }],
      edges: [],
    });

    const result = spawnSync(
      process.execPath,
      [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.language_issues, [{
      id: 'AlphaBench',
      language: 'zh',
      field: 'nodes',
      issue: 'missing_chinese_node_text',
    }]);
  });
}

test('rejects a covered benchmark without a current paper-alignment review', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].paper_alignment_review = {
    status: 'pending',
    source_locator: 'Section 3',
  };
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.review_issues, [
    { id: 'AlphaBench', issue: 'paper_alignment_review_not_passed' },
  ]);
});

test('rejects stale strict, visual, and paper-source review evidence', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].strict_validation.en = 'pending';
  manifest[0].review_status = 'pending_review';
  manifest[0].paper_alignment_review.source_locator = 'Section 2';
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.review_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      issue: 'strict_validation_not_passed',
    },
    { id: 'AlphaBench', issue: 'visual_review_not_passed' },
    {
      id: 'AlphaBench',
      issue: 'paper_alignment_source_mismatch',
      expected_source_locator: 'Section 3',
      reviewed_source_locator: 'Section 2',
    },
  ]);
});

test('rejects paper review evidence tied to a different source URL', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].source_url = 'https://arxiv.org/abs/9999.9999';
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.review_issues, [
    {
      id: 'AlphaBench',
      issue: 'paper_alignment_source_url_mismatch',
      expected_source_url: 'https://arxiv.org/abs/9999.9999',
      reviewed_source_url: 'https://arxiv.org/abs/1234.5678',
    },
  ]);
});

test('rejects a manifest and paper review that both omit the primary source URL', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  delete manifest[0].source_url;
  delete manifest[0].paper_alignment_review.source_url;
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.source_issues, [
    { id: 'AlphaBench', issue: 'missing_source_url' },
  ]);
});

test('rejects a missing aggregate asset field even when incomplete coverage is allowed', () => {
  const root = createCompleteFixture();
  const listPath = join(root, 'client/public/benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  delete list[0].drawio_flowchart_zh;
  writeJson(listPath, list);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.aggregate_total, 1);
  assert.equal(summary.complete_aggregate_total, 0);
  assert.deepEqual(summary.aggregate_issues, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_zh',
      issue: 'missing_asset_field',
      expected_path: 'drawio/AlphaBench/AlphaBench.zh.svg',
      actual_path: null,
    },
  ]);
});

test('rejects an aggregate asset path that differs from the manifest', () => {
  const root = createCompleteFixture();
  const listPath = join(root, 'client/public/benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  list[0].drawio_flowchart_en = 'drawio/AlphaBench/Wrong.en.svg';
  writeJson(listPath, list);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.aggregate_total, 1);
  assert.equal(summary.complete_aggregate_total, 0);
  assert.deepEqual(summary.aggregate_issues, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_en',
      issue: 'asset_path_mismatch',
      expected_path: 'drawio/AlphaBench/AlphaBench.en.svg',
      actual_path: 'drawio/AlphaBench/Wrong.en.svg',
    },
  ]);
});

test('rejects duplicate benchmark ids in the aggregate list', () => {
  const root = createCompleteFixture();
  const listPath = join(root, 'client/public/benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  list.push({ ...list[0] });
  writeJson(listPath, list);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.complete_aggregate_total, 0);
  assert.deepEqual(summary.aggregate_issues, [
    {
      id: 'AlphaBench',
      issue: 'duplicate_list_record',
      count: 2,
    },
  ]);
});

test('rejects duplicate benchmark ids in the manifest', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.push({ ...manifest[0] });
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.complete_aggregate_total, 0);
  assert.deepEqual(summary.source_issues, [
    {
      id: 'AlphaBench',
      issue: 'duplicate_manifest_record',
      count: 2,
    },
  ]);
});

test('rejects duplicate benchmark ids across detail files', () => {
  const root = createCompleteFixture();
  const detailDir = join(root, 'client/public/benchmarks_detail');
  const detail = JSON.parse(
    readFileSync(join(detailDir, 'AlphaBench.json'), 'utf8'),
  );
  writeJson(join(detailDir, 'AlphaBench-copy.json'), detail);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.complete_bilingual_total, 0);
  assert.deepEqual(summary.source_issues, [
    {
      id: 'AlphaBench',
      issue: 'duplicate_detail_record',
      count: 2,
    },
  ]);
});

test('rejects an aggregate path that agrees with the manifest but has no file', () => {
  const root = createCompleteFixture();
  const missingPath = 'drawio/AlphaBench/Missing.en.svg';
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].assets.drawio_flowchart_en = missingPath;
  writeJson(manifestPath, manifest);

  const listPath = join(root, 'client/public/benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  list[0].drawio_flowchart_en = missingPath;
  writeJson(listPath, list);

  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  detail.drawio_flowchart_en = missingPath;
  writeJson(detailPath, detail);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.complete_aggregate_total, 0);
  assert.deepEqual(summary.aggregate_issues, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_en',
      issue: 'asset_file_missing',
      expected_path: missingPath,
      actual_path: missingPath,
    },
  ]);
});

test('rejects a detail asset path that differs from the manifest and aggregate list', () => {
  const root = createCompleteFixture();
  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  detail.drawio_flowchart_en = 'drawio/AlphaBench/Wrong.en.svg';
  writeJson(detailPath, detail);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.data_consistency_issues, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_en',
      issue: 'detail_asset_path_mismatch',
      expected_path: 'drawio/AlphaBench/AlphaBench.en.svg',
      actual_path: 'drawio/AlphaBench/Wrong.en.svg',
    },
  ]);
});

test('does not count a detail path mismatch as complete when both files exist', () => {
  const root = createCompleteFixture();
  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  detail.drawio_flowchart_en = 'drawio/AlphaBench/Alternate.en.svg';
  writeJson(detailPath, detail);
  writeFileSync(
    join(root, 'client/public/drawio/AlphaBench/Alternate.en.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><text>Alternate</text></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.complete_bilingual_total, 0);
  assert.equal(summary.data_consistency_issues.length, 1);
});

test('rejects a manifest benchmark missing from the aggregate list', () => {
  const root = createCompleteFixture();
  writeJson(join(root, 'client/public/benchmarks.json'), []);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.aggregate_total, 0);
  assert.equal(summary.complete_aggregate_total, 0);
  assert.deepEqual(summary.aggregate_issues, [
    { id: 'AlphaBench', issue: 'missing_list_record' },
  ]);
});

test('rejects a manifest entry without an exact primary-source locator', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  delete manifest[0].source_locator;
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.source_issues, [
    { id: 'AlphaBench', issue: 'missing_source_locator' },
  ]);
});

test('rejects an English-only title in a Chinese diagram spec', () => {
  const root = createCompleteFixture();
  const specPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.zh.spec.yaml',
  );
  const spec = readFileSync(specPath, 'utf8').replace(
    'AlphaBench 构建流程',
    'AlphaBench Build Process',
  );
  writeFileSync(specPath, spec);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'title',
      issue: 'missing_chinese_text',
    },
  ]);
});

test('rejects an English-only block description in a Chinese diagram spec', () => {
  const root = createCompleteFixture();
  const specPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.zh.spec.yaml',
  );
  const spec = readFileSync(specPath, 'utf8').replace(
    'description: 与论文对齐的构建流程。',
    'description: >-\n    Paper-aligned construction and evaluation process.',
  );
  writeFileSync(specPath, spec);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'description',
      issue: 'missing_chinese_text',
    },
  ]);
});

test('rejects an English-only legend in a Chinese diagram spec', () => {
  const root = createCompleteFixture();
  const specPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.zh.spec.yaml',
  );
  const spec = readFileSync(specPath, 'utf8').replace(
    'legend: 实线箭头表示主流程。',
    'legend: Solid arrows show the main flow.',
  );
  writeFileSync(specPath, spec);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      field: 'legend',
      issue: 'missing_chinese_text',
    },
  ]);
});

test('rejects Chinese prose in an English diagram title', () => {
  const root = createCompleteFixture();
  const specPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.spec.yaml',
  );
  const spec = readFileSync(specPath, 'utf8').replace(
    'AlphaBench Build Process',
    'AlphaBench 构建流程',
  );
  writeFileSync(specPath, spec);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.language_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      field: 'title',
      issue: 'contains_chinese_text',
    },
  ]);
});

test('reports a missing Chinese SVG field as a broken asset reference', () => {
  const root = createCompleteFixture();
  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  delete detail.drawio_flowchart_zh;
  writeJson(detailPath, detail);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.broken_references, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_zh',
      path: null,
      issue: 'missing_asset_field',
    },
  ]);
});

test('rejects an SVG containing draw.io fallback text', () => {
  const root = createCompleteFixture();
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text>Text is not SVG - cannot display</text></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      issue: 'drawio_fallback_text',
    },
  ]);
});

test('rejects an SVG containing a rendered math parse error', () => {
  const root = createCompleteFixture();
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg"><g data-mml-node="merror" data-mjx-error="Double subscripts: use braces to clarify"><text>Double subscript</text></g></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      issue: 'formula_render_error',
    },
  ]);
});

test('allows ordinary SVG text that mentions an unknown command', () => {
  const root = createCompleteFixture();
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg"><text>Unknown command examples</text></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, []);
});

test('allows the MathJax stylesheet selector for merror nodes', () => {
  const root = createCompleteFixture();
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg"><style>g[data-mml-node="merror"] { fill: red; }</style><text>Valid formula</text></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, []);
});

for (const errorElement of [
  '<merror><mtext>bad math</mtext></merror>',
  '<mathml:merror><mathml:mtext>bad math</mathml:mtext></mathml:merror>',
  '<mjx-merror>bad math</mjx-merror>',
]) {
  test(`rejects rendered formula error element ${errorElement.split('>')[0]}>`, () => {
    const root = createCompleteFixture();
    const svgPath = join(
      root,
      'client/public/drawio/AlphaBench/AlphaBench.en.svg',
    );
    writeFileSync(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg">${errorElement}</svg>\n`,
    );

    const result = spawnSync(
      process.execPath,
      [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.svg_issues, [{
      id: 'AlphaBench',
      language: 'en',
      issue: 'formula_render_error',
    }]);
  });
}

test('rejects a referenced file that is not an SVG document', () => {
  const root = createCompleteFixture();
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.zh.svg',
  );
  writeFileSync(svgPath, 'not an svg\n');

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, [
    {
      id: 'AlphaBench',
      language: 'zh',
      issue: 'invalid_svg_root',
    },
  ]);
});

test('rejects a manifest benchmark ID that has no detail page', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.push({
    ...manifest[0],
    id: 'GhostBench',
    source_url: 'https://arxiv.org/abs/9999.9999',
  });
  writeJson(manifestPath, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.source_issues, [
    { id: 'GhostBench', issue: 'manifest_id_without_detail' },
  ]);
});

test('reports a wholly uncovered benchmark even when queue generation is allowed', () => {
  const root = createCompleteFixture();
  writeJson(
    join(root, 'client/public/benchmarks_detail/BetaBench.json'),
    { id: 'BetaBench', paper_url: 'https://arxiv.org/abs/2345.6789' },
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.detail_total, 2);
  assert.deepEqual(summary.missing_ids, ['BetaBench']);
  assert.deepEqual(summary.broken_references, []);
  assert.equal(summary.id_sets_equal, false);
});

test('rejects started benchmark assets that have no manifest review record', () => {
  const root = createCompleteFixture();
  writeJson(
    join(root, 'client/public/benchmarks_build_process_manifest.json'),
    [],
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.source_issues, [
    { id: 'AlphaBench', issue: 'assets_without_manifest_record' },
  ]);
});

test('rejects aggregate-only asset references that have no manifest review record', () => {
  const root = createCompleteFixture();
  writeJson(
    join(root, 'client/public/benchmarks_build_process_manifest.json'),
    [],
  );
  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  writeJson(detailPath, {
    id: 'AlphaBench',
    paper_url: 'https://arxiv.org/abs/1234.5678',
  });

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.source_issues, [
    { id: 'AlphaBench', issue: 'assets_without_manifest_record' },
  ]);
});

test('rejects physical benchmark assets that have no manifest review record', () => {
  const root = createCompleteFixture();
  writeJson(
    join(root, 'client/public/benchmarks_detail/BetaBench.json'),
    { id: 'BetaBench', paper_url: 'https://arxiv.org/abs/2345.6789' },
  );
  const betaDir = join(root, 'client/public/drawio/BetaBench');
  mkdirSync(betaDir, { recursive: true });
  writeFileSync(
    join(betaDir, 'BetaBench.en.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><text>BetaBench</text></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.source_issues, [
    { id: 'BetaBench', issue: 'assets_without_manifest_record' },
  ]);
});

test('rejects asset paths that escape the public directory', () => {
  const root = createCompleteFixture();
  const escapedPath = '../../outside.en.svg';
  writeFileSync(
    join(root, 'outside.en.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><text>Outside</text></svg>\n',
  );

  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].assets.drawio_flowchart_en = escapedPath;
  writeJson(manifestPath, manifest);

  const listPath = join(root, 'client/public/benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  list[0].drawio_flowchart_en = escapedPath;
  writeJson(listPath, list);

  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  detail.drawio_flowchart_en = escapedPath;
  writeJson(detailPath, detail);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.aggregate_issues, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_en',
      issue: 'asset_path_outside_public_dir',
      expected_path: escapedPath,
      actual_path: escapedPath,
    },
  ]);
  assert.deepEqual(summary.broken_references, [
    {
      id: 'AlphaBench',
      field: 'drawio_flowchart_en',
      path: escapedPath,
      issue: 'asset_path_outside_public_dir',
    },
  ]);
});

test('rejects absolute asset paths even when they point inside public', () => {
  const root = createCompleteFixture();
  const absolutePath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );

  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].assets.drawio_flowchart_en = absolutePath;
  writeJson(manifestPath, manifest);

  const listPath = join(root, 'client/public/benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  list[0].drawio_flowchart_en = absolutePath;
  writeJson(listPath, list);

  const detailPath = join(
    root,
    'client/public/benchmarks_detail/AlphaBench.json',
  );
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  detail.drawio_flowchart_en = absolutePath;
  writeJson(detailPath, detail);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.aggregate_issues[0].issue, 'asset_path_outside_public_dir');
  assert.equal(summary.broken_references[0].issue, 'asset_path_outside_public_dir');
});

test('rejects adaptive dark colors in a light academic SVG', () => {
  const root = createCompleteFixture();
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" style="color-scheme: light dark"><text style="color: light-dark(#212121, #d1d1d1)">AlphaBench</text></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, [
    {
      id: 'AlphaBench',
      language: 'en',
      issue: 'adaptive_color_scheme',
    },
  ]);
});

test('allows reviewed desktop fallback text when foreignObject rendered in the target browser', () => {
  const root = createCompleteFixture();
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].svg_foreign_object_reviewed = { en: true, zh: false };
  writeJson(manifestPath, manifest);
  const svgPath = join(
    root,
    'client/public/drawio/AlphaBench/AlphaBench.en.svg',
  );
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" style="color-scheme: light"><switch><foreignObject><div>AlphaBench</div></foreignObject><text>Text is not SVG - cannot display</text></switch></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.svg_issues, []);
});

for (const fixture of [
  {
    name: 'catalog-only',
    id: 'CatalogOnly',
    presentIn: ['catalog'],
    mutate(root) {
      const path = join(root, 'client/public/benchmarks.json');
      const records = JSON.parse(readFileSync(path, 'utf8'));
      records.push({ id: this.id });
      writeJson(path, records);
    },
  },
  {
    name: 'detail-only',
    id: 'DetailOnly',
    presentIn: ['detail'],
    mutate(root) {
      writeJson(
        join(root, `client/public/benchmarks_detail/${this.id}.json`),
        { id: this.id },
      );
    },
  },
  {
    name: 'manifest-only',
    id: 'ManifestOnly',
    presentIn: ['manifest'],
    mutate(root) {
      const path = join(
        root,
        'client/public/benchmarks_build_process_manifest.json',
      );
      const records = JSON.parse(readFileSync(path, 'utf8'));
      records.push({ ...records[0], id: this.id });
      writeJson(path, records);
    },
  },
  {
    name: 'assets-only',
    id: 'AssetsOnly',
    presentIn: ['physical_assets', 'complete_core_assets'],
    mutate(root) {
      const dir = join(root, `client/public/drawio/${this.id}`);
      mkdirSync(dir, { recursive: true });
      for (const suffix of [
        'en.svg',
        'zh.svg',
        'en.drawio',
        'zh.drawio',
        'en.spec.yaml',
        'zh.spec.yaml',
        'en.arch.json',
        'zh.arch.json',
      ]) {
        writeFileSync(join(dir, `${this.id}.${suffix}`), 'fixture\n');
      }
    },
  },
]) {
  test(`reports a deterministic ID-set mismatch for a ${fixture.name} benchmark`, () => {
    const root = createCompleteFixture();
    fixture.mutate(root);

    const result = spawnSync(
      process.execPath,
      [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    const summary = JSON.parse(result.stdout);
    const setOrder = [
      'catalog',
      'detail',
      'manifest',
      'physical_assets',
      'complete_core_assets',
    ];
    assert.equal(summary.id_sets_equal, false);
    assert.deepEqual(summary.id_set_issues, [{
      id: fixture.id,
      issue: 'id_set_mismatch',
      present_in: fixture.presentIn,
      missing_from: setOrder.filter((name) => !fixture.presentIn.includes(name)),
    }]);
  });
}

test('separates review gates and counts only exact paper-source evidence', () => {
  const root = createCompleteFixture();
  const path = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest[0].strict_validation.en = 'pending';
  manifest[0].review_status = 'pending_review';
  manifest[0].paper_alignment_review.source_locator = 'Section 2';
  writeJson(path, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.paper_aligned_total, 0);
  assert.deepEqual(summary.strict_issues, [{
    id: 'AlphaBench',
    language: 'en',
    issue: 'strict_validation_not_passed',
  }]);
  assert.deepEqual(summary.visual_issues, [{
    id: 'AlphaBench',
    issue: 'visual_review_not_passed',
  }]);
  assert.deepEqual(summary.paper_alignment_issues, [{
    id: 'AlphaBench',
    issue: 'paper_alignment_source_mismatch',
    expected_source_locator: 'Section 3',
    reviewed_source_locator: 'Section 2',
  }]);
  assert.deepEqual(summary.review_issues, [
    ...summary.strict_issues,
    ...summary.visual_issues,
    ...summary.paper_alignment_issues,
  ]);
});

test('requires both conventionally named PNG exports in the full gate', () => {
  const root = createCompleteFixture();
  rmSync(join(root, 'client/public/drawio/AlphaBench/AlphaBench.zh.png'));

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.png_complete_total, 0);
  assert.deepEqual(summary.png_issues, [{
    id: 'AlphaBench',
    language: 'zh',
    path: 'drawio/AlphaBench/AlphaBench.zh.png',
    issue: 'png_file_missing',
  }]);
  assert.equal(summary.unresolved_queue[0].gates.png, false);
  assert.equal(
    summary.unresolved_queue[0].next_action,
    'Export both English and Chinese PNG previews from the reviewed draw.io assets.',
  );
});

test('marks duplicate records as an ID-set queue gate failure', () => {
  const root = createCompleteFixture();
  const path = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.push({ ...manifest[0] });
  writeJson(path, manifest);

  const result = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.id_sets_equal, true);
  assert.equal(summary.paper_aligned_total, 1);
  assert.equal(summary.unresolved_queue[0].gates.id_set, false);
  assert.ok(
    summary.unresolved_queue[0].issues.includes('id_set:duplicate_manifest_record'),
  );
});

test('produces the same sorted issue arrays and unresolved queue after manifest shuffling', () => {
  const root = createCompleteFixture();
  addCompleteBenchmark(root, 'BetaBench', { paperStatus: 'pending' });
  rmSync(join(root, 'client/public/drawio/AlphaBench/AlphaBench.en.png'));
  const manifestPath = join(
    root,
    'client/public/benchmarks_build_process_manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[0].paper_alignment_review.status = 'pending';
  writeJson(manifestPath, manifest.reverse());

  const firstResult = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );
  assert.equal(firstResult.status, 1);
  const first = JSON.parse(firstResult.stdout);

  writeJson(manifestPath, manifest.reverse());
  const secondResult = spawnSync(
    process.execPath,
    [auditScript.pathname, '--root', root, '--json', '--allow-incomplete'],
    { encoding: 'utf8' },
  );
  assert.equal(secondResult.status, 1);
  const second = JSON.parse(secondResult.stdout);

  for (const field of [
    'id_set_issues',
    'png_issues',
    'strict_issues',
    'visual_issues',
    'paper_alignment_issues',
    'review_issues',
    'unresolved_queue',
  ]) {
    assert.deepEqual(first[field], second[field], `${field} must be stable`);
  }
  assert.deepEqual(first.unresolved_queue.map((entry) => entry.id), [
    'AlphaBench',
    'BetaBench',
  ]);
  assert.deepEqual(first.unresolved_queue[0], {
    id: 'AlphaBench',
    source_type: 'paper',
    source_url: 'https://arxiv.org/abs/1234.5678',
    source_locator: 'Section 3',
    gates: {
      id_set: true,
      core: true,
      png: false,
      strict: true,
      visual: true,
      paper: false,
    },
    issues: [
      'paper:paper_alignment_review_not_passed',
      'png:png_file_missing:en',
    ],
    review_state: {
      strict_validation: { en: 'passed', zh: 'passed' },
      visual_review: 'visually_reviewed',
      paper_alignment: 'pending',
      paper_source_url: 'https://arxiv.org/abs/1234.5678',
      paper_source_locator: 'Section 3',
    },
    asset_state: {
      physical_directory_present: true,
      core_complete: true,
      png_complete: false,
    },
    next_action: 'Review and, if needed, redraw the build process against the primary source; then record its exact URL and locator.',
  });
  assert.deepEqual(first.unresolved_queue[1].issues, [
    'paper:paper_alignment_review_not_passed',
  ]);
  assert.equal(
    first.unresolved_queue[1].next_action,
    'Review and, if needed, redraw the build process against the primary source; then record its exact URL and locator.',
  );
});

test('writes queue reports from audit output and rejects report path traversal', () => {
  const root = createCompleteFixture();
  rmSync(join(root, 'client/public/drawio/AlphaBench/AlphaBench.zh.png'));
  mkdirSync(join(root, 'docs/reports'), { recursive: true });
  const queueJson = 'docs/reports/test-queue.json';
  const queueMarkdown = 'docs/reports/test-queue.md';

  const result = spawnSync(
    process.execPath,
    [
      auditScript.pathname,
      '--root', root,
      '--json',
      '--allow-incomplete',
      '--queue-json', queueJson,
      '--queue-markdown', queueMarkdown,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, queueJson), 'utf8')),
    summary.unresolved_queue,
  );
  const markdown = readFileSync(join(root, queueMarkdown), 'utf8');
  assert.match(markdown, /^# Build Process Paper Alignment Queue/mu);
  assert.match(markdown, /\| AlphaBench \|/u);

  const traversalResult = spawnSync(
    process.execPath,
    [
      auditScript.pathname,
      '--root', root,
      '--json',
      '--allow-incomplete',
      '--queue-json', '../escaped-queue.json',
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(traversalResult.status, 0);
  assert.equal(existsSync(join(root, '../escaped-queue.json')), false);
});
