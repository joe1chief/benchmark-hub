import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compileBenchmarkPackage, jsonText, sha256 } from './benchmark_package.mjs';
import { manageBenchmark } from './manage_benchmark.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const input = JSON.parse(fs.readFileSync(new URL('./fixtures/new-benchmark.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(join(project, 'client/public/benchmarks.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(join(project, 'client/public/benchmarks_build_process_manifest.json'), 'utf8'));

function put(root, path, content) {
  const full = join(root, path);
  fs.mkdirSync(dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function fixture(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'benchmark-add-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const record = { ...catalog.find(entry => entry.id === 'GAIA'), related_benchmarks: [] };
  const detail = { ...JSON.parse(fs.readFileSync(join(project, 'client/public/benchmarks_detail/GAIA.json'), 'utf8')), related_benchmarks: [], preserved_detail_note: 'Existing detail-only metadata' };
  put(root, 'client/public/benchmarks.json', jsonText([record]));
  put(root, 'client/public/benchmarks_detail/GAIA.json', jsonText(detail));
  put(root, 'client/public/benchmarks_build_process_manifest.json', jsonText([ledger.find(entry => entry.id === 'GAIA')]));
  for (const language of ['en', 'zh']) {
    for (const suffix of ['spec.yaml', 'arch.json']) {
      const path = `client/public/drawio/GAIA/GAIA.${language}.${suffix}`;
      put(root, path, fs.readFileSync(join(project, path), 'utf8'));
    }
  }
  put(root, 'README.md', '# Test catalog\n\n**1 LLM evaluation benchmarks** across 1 capability dimensions\n');
  return root;
}

function snapshot(root) {
  const files = {};
  function walk(path) {
    for (const item of fs.readdirSync(join(root, path), { withFileTypes: true })) {
      const relative = path ? `${path}/${item.name}` : item.name;
      if (item.isDirectory()) walk(relative);
      else files[relative] = sha256(fs.readFileSync(join(root, relative)));
    }
  }
  walk('');
  return files;
}

test('compiles a complete bilingual package with existing category styling and no export fields', () => {
  const before = structuredClone(input);
  const result = compileBenchmarkPackage(input, { catalog });
  assert.deepEqual(input, before);
  assert.equal(result.benchmark.l1_color, '#10A37F');
  assert.equal(result.benchmark.year, '2026');
  assert.equal(result.benchmark.l1_en, 'Agent Capability');
  assert.equal(result.benchmark.mermaid_flowchart, result.benchmark.flowchart_en);
  assert.equal(result.models.en.nodes.length, 6);
  assert.deepEqual(result.models.en.modules.map(module => module.nodes), result.models.zh.modules.map(module => module.nodes));
  assert.equal(result.benchmark.drawio_flowchart_en, undefined);
  assert.equal(result.benchmark.drawio_source_en, undefined);
  assert.equal(result.manifest.strict_validation, undefined, 'must not manufacture a legacy validation pass');
  assert.equal(result.manifest.visual_review, undefined, 'must not manufacture a visual review');
  assert.equal(result.manifest.html_generation.arch_sha256.en, sha256(jsonText(result.models.en)));
});

test('rejects incomplete review, unsafe identity, broken endpoints and divergent bilingual lanes', () => {
  const cases = [
    [draft => draft.evidence.paper_alignment_review.status = 'pending', /must already be passed/],
    [draft => draft.evidence.paper_alignment_review.source_locator = 'different version', /exact evidence/],
    [draft => draft.evidence.paper_alignment_review.reviewed_at = '2026-02-31', /actual YYYY-MM-DD/],
    [draft => draft.benchmark.id = '../escape', /Unsafe benchmark id/],
    [draft => draft.benchmark.paper_url = 'javascript:alert(1)', /HTTP\(S\)/],
    [draft => draft.benchmark.description = 'obsolete schema field', /Unknown benchmark field/],
    [draft => draft.benchmark.metric_en = '', /metric_en is required/],
    [draft => draft.benchmark.published = '2026-13', /published must/],
    [draft => draft.specs.en.edges[0].to = 'missing', /unknown endpoint/],
    [draft => draft.specs.zh.modules[0].nodes.pop(), /module membership must match/],
    [draft => draft.specs.zh.edges[2].label = '', /module membership must match/],
    [draft => draft.specs.en.nodes[0].module = 'misspelled_module', /undeclared module/],
    [draft => draft.specs.en.modules[1].nodes.push('source'), /conflicting module membership/],
  ];
  for (const [mutate, expected] of cases) {
    const draft = structuredClone(input); mutate(draft);
    assert.throws(() => compileBenchmarkPackage(draft, { catalog }), expected);
  }
});

test('dry run validates the proposed full catalog without changing the checkout', t => {
  const root = fixture(t);
  const before = snapshot(root);
  const result = manageBenchmark({ root, input });
  assert.equal(result.committed, false);
  assert.equal(result.changed_files.length, 8);
  assert.deepEqual(result.validation.graph_sources, { status: 'passed', checked: 4, drift: 0, fallback_drift: 0 });
  assert.equal(result.validation.html_assets.complete, 2);
  assert.deepEqual(snapshot(root), before);
});

test('adding is atomic and a repeated package is a byte-identical no-op', t => {
  const root = fixture(t);
  const before = snapshot(root);
  const first = manageBenchmark({ root, input, write: true });
  assert.equal(first.committed, true);
  const added = snapshot(root);
  const second = manageBenchmark({ root, input, write: true });
  assert.equal(second.committed, false);
  assert.deepEqual(second.changed_files, []);
  assert.deepEqual(snapshot(root), added);
  for (const [path, hash] of Object.entries(before)) {
    if (['client/public/benchmarks.json', 'client/public/benchmarks_build_process_manifest.json', 'README.md'].includes(path)) continue;
    assert.equal(added[path], hash, `Unrelated file changed: ${path}`);
  }
  const newCatalog = JSON.parse(fs.readFileSync(join(root, 'client/public/benchmarks.json'), 'utf8'));
  assert.equal(newCatalog.length, 2);
  assert.equal(newCatalog[0].id, 'GAIA', 'preserves existing catalog ordering');
  assert.equal(newCatalog[1].id, input.benchmark.id);
  assert.match(fs.readFileSync(join(root, 'README.md'), 'utf8'), /2 LLM evaluation benchmarks/);
});

test('rebuild restores missing graphs and drifted fallbacks exactly without rewriting authored inputs', t => {
  const root = fixture(t);
  manageBenchmark({ root, input, write: true });
  const before = snapshot(root);
  const id = input.benchmark.id;
  put(root, `client/public/drawio/${id}/${id}.en.arch.json`, '{}\n');
  fs.unlinkSync(join(root, `client/public/drawio/${id}/${id}.zh.arch.json`));
  for (const path of ['client/public/benchmarks.json', `client/public/benchmarks_detail/${id}.json`]) {
    const data = JSON.parse(fs.readFileSync(join(root, path), 'utf8'));
    const record = Array.isArray(data) ? data.find(entry => entry.id === id) : data;
    record.flowchart_en = 'stale'; record.flowchart_zh = 'stale'; record.mermaid_flowchart = 'stale';
    put(root, path, jsonText(data));
  }
  const manifestPath = 'client/public/benchmarks_build_process_manifest.json';
  const manifest = JSON.parse(fs.readFileSync(join(root, manifestPath), 'utf8'));
  manifest.find(entry => entry.id === id).html_generation = null;
  put(root, manifestPath, jsonText(manifest));
  const result = manageBenchmark({ root, rebuildId: id, write: true });
  assert.equal(result.committed, true);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(manageBenchmark({ root, rebuildId: id }).changed_files, []);
  assert.deepEqual(manageBenchmark({ root, rebuildId: 'GAIA' }).changed_files, [], 'legacy graph is reproduced without adding lineage or changing source metadata');
});

test('the full validator rejects unresolved relationships and untranslated graphs before any writes', t => {
  const root = fixture(t);
  const before = snapshot(root);
  const related = structuredClone(input);
  related.benchmark.related_benchmarks = ['UnknownBenchmark'];
  assert.throws(() => manageBenchmark({ root, input: related, write: true }), /Catalog validation failed/);
  const untranslated = structuredClone(input);
  untranslated.specs.zh.nodes[0].label = 'Source records';
  assert.throws(() => manageBenchmark({ root, input: untranslated, write: true }), /HTML asset audit failed/);
  assert.deepEqual(snapshot(root), before);
});

test('refuses a changed existing entry instead of overwriting it', t => {
  const root = fixture(t);
  manageBenchmark({ root, input, write: true });
  const before = snapshot(root);
  const changed = structuredClone(input);
  changed.benchmark.intro_en = 'A different statement';
  assert.throws(() => manageBenchmark({ root, input: changed, write: true }), /already exists with different content/);
  assert.deepEqual(snapshot(root), before);
});

test('reviewed updates preserve omitted metadata and extensions, replace source evidence, and rebuild identically', t => {
  const root = fixture(t);
  manageBenchmark({ root, input, write: true });
  const id = input.benchmark.id;
  const catalogPath = 'client/public/benchmarks.json';
  const manifestPath = 'client/public/benchmarks_build_process_manifest.json';
  const detailPath = `client/public/benchmarks_detail/${id}.json`;
  for (const path of [catalogPath, detailPath]) {
    const data = JSON.parse(fs.readFileSync(join(root, path), 'utf8'));
    const record = Array.isArray(data) ? data.find(entry => entry.id === id) : data;
    record.curator_note = path === catalogPath ? 'catalog note' : 'detail note';
    record.drawio_flowchart_en = 'obsolete.svg';
    record.drawio_scoring_note = 'obsolete source claim';
    record.drawio_review_note = 'old locator';
    record.has_leaderboard = true;
    put(root, path, jsonText(data));
  }
  const ledgerData = JSON.parse(fs.readFileSync(join(root, manifestPath), 'utf8'));
  const oldEntry = ledgerData.find(entry => entry.id === id);
  oldEntry.curator_note = 'manifest note';
  oldEntry.visual_review = { status: 'passed', obsolete: true };
  oldEntry.construction_steps_en = ['Obsolete statement'];
  put(root, manifestPath, jsonText(ledgerData));
  const oldUnrelated = fs.readFileSync(join(root, 'client/public/benchmarks_detail/GAIA.json'), 'utf8');
  const before = snapshot(root);
  const draft = structuredClone(input);
  draft.benchmark = { id, intro: '修订后的合成测试说明', intro_en: 'Revised synthetic test description', published: '2025-12', has_leaderboard: false };
  draft.evidence.source_locator = 'Revised synthetic fixture source section';
  draft.evidence.paper_alignment_review.source_locator = draft.evidence.source_locator;
  draft.specs.en.nodes[0].label += '\nReviewed revision';
  draft.specs.zh.nodes[0].label += '\n已审核修订';
  const proposed = manageBenchmark({ root, update: draft });
  assert.equal(proposed.mode, 'update');
  assert.equal(proposed.committed, false);
  assert.equal(proposed.changed_files.length, 7);
  assert.deepEqual(proposed.preserved_fields, { catalog: ['curator_note'], detail: ['curator_note'], manifest: ['curator_note'] });
  assert.deepEqual(snapshot(root), before);
  const applied = manageBenchmark({ root, update: draft, write: true });
  assert.deepEqual(applied.changed_files, proposed.changed_files);
  assert.equal(applied.committed, true);
  const records = JSON.parse(fs.readFileSync(join(root, catalogPath), 'utf8'));
  const record = records.find(entry => entry.id === id);
  assert.deepEqual(records.map(entry => entry.id), ['GAIA', id]);
  assert.equal(record.metric, input.benchmark.metric);
  assert.equal(record.has_leaderboard, false);
  assert.equal(record.year, '2025');
  assert.equal(record.curator_note, 'catalog note');
  assert.equal(record.drawio_flowchart_en, undefined);
  assert.equal(record.drawio_scoring_note, undefined);
  assert.equal(record.drawio_review_note, draft.evidence.source_locator);
  const detail = JSON.parse(fs.readFileSync(join(root, detailPath), 'utf8'));
  assert.equal(detail.curator_note, 'detail note');
  assert.equal(detail.intro, record.intro);
  assert.equal(detail.metric, record.metric);
  const updatedEntry = JSON.parse(fs.readFileSync(join(root, manifestPath), 'utf8')).find(entry => entry.id === id);
  assert.equal(updatedEntry.curator_note, 'manifest note');
  assert.equal(updatedEntry.visual_review, undefined);
  assert.equal(updatedEntry.construction_steps_en, undefined);
  assert.equal(updatedEntry.source_locator, draft.evidence.source_locator);
  assert.equal(fs.readFileSync(join(root, 'client/public/benchmarks_detail/GAIA.json'), 'utf8'), oldUnrelated);
  const after = snapshot(root);
  assert.deepEqual(manageBenchmark({ root, update: draft }).changed_files, []);
  assert.deepEqual(manageBenchmark({ root, rebuildId: id }).changed_files, []);
  assert.deepEqual(snapshot(root), after);
});

test('update metadata patches require explicit translation pairs and derive changed category/year defaults', () => {
  const existing = compileBenchmarkPackage(input, { catalog }).benchmark;
  const patch = structuredClone(input);
  patch.benchmark = { id: existing.id, intro: '仅修改中文' };
  assert.throws(() => compileBenchmarkPackage(patch, { catalog, existingBenchmark: existing }), /Update intro and intro_en together/);
  patch.benchmark = { id: existing.id, metric_en: 'Translation correction only' };
  assert.throws(() => compileBenchmarkPackage(patch, { catalog, existingBenchmark: existing }), /Update metric and metric_en together/);
  const category = catalog.find(entry => entry.l1 !== existing.l1);
  patch.benchmark = { id: existing.id, l1: category.l1, published: '2024-05', related_benchmarks: [] };
  const result = compileBenchmarkPackage(patch, { catalog, existingBenchmark: existing });
  const newPackage = structuredClone(input);
  newPackage.benchmark.l1 = category.l1;
  const defaults = compileBenchmarkPackage(newPackage, { catalog }).benchmark;
  assert.equal(result.benchmark.l1_color, defaults.l1_color);
  assert.equal(result.benchmark.l1_en, defaults.l1_en);
  assert.equal(result.benchmark.default_l1, defaults.default_l1);
  assert.equal(result.benchmark.year, '2024');
  assert.deepEqual(result.benchmark.related_benchmarks, []);
  assert.equal(result.benchmark.scale, existing.scale);
  patch.benchmark.id = 'AnotherID';
  assert.throws(() => compileBenchmarkPackage(patch, { catalog, existingBenchmark: existing }), /retain the existing benchmark ID/);
});

test('omitted standard detail metadata survives an update and only explicit patch fields replace it', t => {
  const root = fixture(t);
  manageBenchmark({ root, input, write: true });
  const id = input.benchmark.id;
  const detailPath = `client/public/benchmarks_detail/${id}.json`;
  const detail = JSON.parse(fs.readFileSync(join(root, detailPath), 'utf8'));
  detail.pdf_cdn_url = 'https://example.org/detail.pdf';
  detail.homepage = 'https://example.org/detail-home';
  detail.has_leaderboard = true;
  detail.scale = '仅详情页的规模说明';
  detail.scale_en = 'Detail-specific scale description';
  put(root, detailPath, jsonText(detail));
  assert.deepEqual(manageBenchmark({ root, rebuildId: id }).changed_files, [], 'valid existing metadata may differ between catalog and detail');
  const unchanged = snapshot(root);
  const draft = { ...structuredClone(input), benchmark: { id } };
  assert.deepEqual(manageBenchmark({ root, update: draft, write: true }).changed_files, []);
  assert.deepEqual(snapshot(root), unchanged);
  draft.benchmark = { id, intro: '新的说明', intro_en: 'New description' };
  manageBenchmark({ root, update: draft, write: true });
  const preserved = JSON.parse(fs.readFileSync(join(root, detailPath), 'utf8'));
  for (const key of ['pdf_cdn_url', 'homepage', 'has_leaderboard', 'scale', 'scale_en']) assert.equal(preserved[key], detail[key], key);
  assert.equal(preserved.intro, draft.benchmark.intro);
  const listed = JSON.parse(fs.readFileSync(join(root, 'client/public/benchmarks.json'), 'utf8')).find(entry => entry.id === id);
  assert.equal(listed.intro, preserved.intro);
  assert.notEqual(listed.pdf_cdn_url, preserved.pdf_cdn_url);
  draft.benchmark = { id, pdf_cdn_url: '', homepage: '', has_leaderboard: false };
  manageBenchmark({ root, update: draft, write: true });
  const cleared = JSON.parse(fs.readFileSync(join(root, detailPath), 'utf8'));
  assert.equal(cleared.pdf_cdn_url, '');
  assert.equal(cleared.homepage, '');
  assert.equal(cleared.has_leaderboard, false);
  assert.equal(cleared.scale, detail.scale);
});

test('update rejects missing identities and incomplete review or bilingual graphs without writes', t => {
  const root = fixture(t);
  assert.throws(() => manageBenchmark({ root, update: input, write: true }), /Cannot update an unregistered benchmark/);
  manageBenchmark({ root, input, write: true });
  const before = snapshot(root);
  for (const [mutate, pattern] of [
    [draft => draft.evidence.paper_alignment_review.status = 'pending', /must already be passed/],
    [draft => delete draft.specs.zh, /specs.zh must be an object/],
    [draft => draft.specs.zh.edges.pop(), /module membership must match/],
    [draft => draft.benchmark.name = 'GAIA', /name already exists/],
  ]) {
    const draft = structuredClone(input); mutate(draft);
    assert.throws(() => manageBenchmark({ root, update: draft, write: true }), pattern);
    assert.deepEqual(snapshot(root), before);
  }
  assert.throws(() => manageBenchmark({ root, update: input, input }), /Choose exactly one/);
});

test('a failed update rolls back source, metadata, evidence and projections as one batch', t => {
  const root = fixture(t);
  manageBenchmark({ root, input, write: true });
  const before = snapshot(root);
  const draft = structuredClone(input);
  draft.benchmark.intro_en = 'Reviewed updated test intro';
  draft.specs.en.nodes[0].label += '\nUpdated test';
  draft.specs.zh.nodes[0].label += '\n更新测试';
  assert.throws(() => manageBenchmark({ root, update: draft, write: true, fsOps: {
    ...fs,
    renameSync(source, destination) {
      if (source.endsWith('.tmp') && destination.endsWith('/benchmarks_build_process_manifest.json')) throw new Error('simulated update commit failure');
      fs.renameSync(source, destination);
    },
  } }), /simulated update commit failure/);
  assert.deepEqual(snapshot(root), before);
});

test('a commit failure rolls back catalog, manifest and every new graph file together', t => {
  const root = fixture(t);
  const before = snapshot(root);
  assert.throws(() => manageBenchmark({ root, input, write: true, fsOps: {
    ...fs,
    renameSync(source, destination) {
      if (source.endsWith('.tmp') && destination.endsWith('/benchmarks_build_process_manifest.json')) throw new Error('simulated manifest commit failure');
      fs.renameSync(source, destination);
    },
  } }), /simulated manifest commit failure/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(fs.existsSync(join(root, `client/public/drawio/${input.benchmark.id}`)), false);
});

test('detects concurrent source changes and preserves the other writer', t => {
  const root = fixture(t);
  const path = join(root, 'client/public/benchmarks.json');
  const externalChange = fs.readFileSync(path, 'utf8') + '\n';
  assert.throws(() => manageBenchmark({ root, input, write: true, beforeCommit() {
    fs.writeFileSync(path, externalChange);
  } }), /Input changed during validation/);
  assert.equal(fs.readFileSync(path, 'utf8'), externalChange);
  assert.equal(fs.existsSync(join(root, `client/public/benchmarks_detail/${input.benchmark.id}.json`)), false);
  assert.equal(fs.existsSync(join(root, '.benchmark-catalog.lock')), false);
});

test('rejects managed-path symlinks and leaves an existing writer lock untouched', t => {
  const root = fixture(t);
  const lock = join(root, '.benchmark-catalog.lock');
  fs.writeFileSync(lock, 'owned by another process');
  assert.throws(() => manageBenchmark({ root, input, write: true }), /EEXIST/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'owned by another process');
  fs.unlinkSync(lock);
  const path = join(root, 'client/public/benchmarks_detail/GAIA.json');
  const external = join(root, 'external.json');
  fs.renameSync(path, external);
  fs.symlinkSync(external, path);
  assert.throws(() => manageBenchmark({ root, input }), /Symlink is not allowed/);
  assert.ok(fs.existsSync(external));
});

test('CLI dry-run and root selection use the same validated pipeline', t => {
  const root = fixture(t);
  const before = snapshot(root);
  const command = join(project, 'scripts/benchmark_catalog/manage_benchmark.mjs');
  const packagePath = join(project, 'scripts/benchmark_catalog/fixtures/new-benchmark.json');
  const result = spawnSync(process.execPath, [command, '--root', root, '--input', packagePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).write, false);
  assert.deepEqual(snapshot(root), before);
  const invalid = spawnSync(process.execPath, [command, '--input', packagePath, '--write', '--write'], { encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Duplicate option/);
  manageBenchmark({ root, input, write: true });
  const added = snapshot(root);
  const update = spawnSync(process.execPath, [command, '--root', root, '--update', packagePath], { encoding: 'utf8' });
  assert.equal(update.status, 0, update.stderr);
  assert.equal(JSON.parse(update.stdout).mode, 'update');
  assert.deepEqual(JSON.parse(update.stdout).changed_files, []);
  assert.deepEqual(snapshot(root), added);
  const conflict = spawnSync(process.execPath, [command, '--input', packagePath, '--update', packagePath], { encoding: 'utf8' });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /exactly one/);
});
