import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  return root;
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
  assert.deepEqual(summary.missing_ids, []);
  assert.deepEqual(summary.broken_references, []);
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

test('allows a wholly uncovered benchmark only when incomplete coverage is allowed', () => {
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

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.detail_total, 2);
  assert.deepEqual(summary.missing_ids, ['BetaBench']);
  assert.deepEqual(summary.broken_references, []);
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
