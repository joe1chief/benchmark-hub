import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderFallback, applyFallbacks } from './sync_detail_fallbacks_from_arch.mjs';
import * as fs from 'node:fs';
import { writeFileBatchAtomically } from './atomic_file_batch.mjs';

const command = resolve('scripts/benchmark_build_process/check_arch_sources.mjs');

test('failed graph generation rolls back new files and restores existing files together', () => {
  const root = mkdtempSync(join(tmpdir(), 'costco-model-rollback-'));
  const created = join(root, 'new.arch.json');
  const existing = join(root, 'existing.arch.json');
  writeFileSync(existing, 'original');
  try {
    assert.throws(() => writeFileBatchAtomically([{ path: created, content: 'new' }, { path: existing, content: 'updated' }], {
      allowCreate: true,
      transactionId: 'rollback',
      fsOps: { ...fs, renameSync(source, destination) {
        if (source.endsWith('.1.tmp')) throw new Error('simulated publication failure');
        fs.renameSync(source, destination);
      } },
    }), /simulated publication failure/);
    assert.equal(fs.existsSync(created), false);
    assert.equal(readFileSync(existing, 'utf8'), 'original');
    assert.deepEqual(fs.readdirSync(root), ['existing.arch.json']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Mermaid fallback preserves decisions, labeled outcomes, dashed boundaries and escaping', () => {
  const rendered = renderFallback({
    nodes: [{ id: 'gate', label: 'Ready?\n"check"' }, { id: 'run', label: 'Run' }],
    edges: [{ from: 'gate', to: 'run', type: 'primary', label: 'Yes | proceed' },
      { from: 'run', to: 'gate', type: 'optional', label: 'No\nretry' }],
  });
  assert.ok(rendered.includes('gate["Ready?<br/>\\"check\\""]'));
  assert.ok(rendered.includes('gate -->|Yes &#124; proceed| run'));
  assert.ok(rendered.includes('run -. No<br/>retry .-> gate'));
});

test('fallback synchronization preserves catalog-specific metadata and resolved links', () => {
  const catalog = { id: 'RepoBench', related_benchmarks: ['CrossCodeEval_Base'], metric: 'Catalog metric', flowchart_en: 'old' };
  const updated = applyFallbacks(catalog, { en: 'English', zh: '中文' });
  assert.deepEqual(updated, { ...catalog, flowchart_en: 'English', flowchart_zh: '中文', mermaid_flowchart: 'English' });
  assert.equal(catalog.flowchart_en, 'old', 'input record stays unchanged');
});

test('source gate detects drift and missing artifacts, refuses silent writes, and rebuilds deterministically', () => {
  const root = mkdtempSync(join(tmpdir(), 'costco-source-gate-'));
  const base = join(root, 'client/public');
  const drawio = join(base, 'drawio/Example');
  const details = join(base, 'benchmarks_detail');
  mkdirSync(drawio, { recursive: true }); mkdirSync(details, { recursive: true });
  const record = { id: 'Example', flowchart_en: 'flowchart LR\n    source["Source"]', flowchart_zh: 'flowchart LR\n    source["来源"]' };
  record.mermaid_flowchart = record.flowchart_en;
  writeFileSync(join(base, 'benchmarks.json'), JSON.stringify([record]));
  writeFileSync(join(details, 'Example.json'), JSON.stringify(record));
  for (const language of ['en', 'zh']) {
    writeFileSync(join(drawio, `Example.${language}.spec.yaml`), `meta:\n  title: Example\nnodes:\n  - id: source\n    label: ${language === 'en' ? 'Source' : '来源'}\nedges: []\nmodules: []\n`);
    writeFileSync(join(drawio, `Example.${language}.arch.json`), '{}\n');
  }
  const run = (...args) => spawnSync(process.execPath, [command, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, IMPORTER_DRAWIO_E2E_CLI: '/nonexistent-exporter', DRAWIO_DESKTOP_CLI: '/nonexistent-desktop' } });
  try {
    assert.equal(run().status, 1, 'stale sidecars fail the gate');
    assert.equal(readFileSync(join(drawio, 'Example.en.arch.json'), 'utf8'), '{}\n', 'check mode must not write');
    assert.equal(run('--write').status, 0, 'explicit regeneration succeeds');
    assert.equal(run().status, 0, 'regenerated metadata is deterministic');
    const path = join(drawio, 'Example.en.arch.json');
    const original = readFileSync(path, 'utf8');
    for (const mutate of [a => a.nodes[0].label = 'Wrong', a => a.modules.push({id:'fake'}), a => a.edges.push({from:'source',to:'ghost'})]) {
      const arch = JSON.parse(original); mutate(arch); writeFileSync(path, JSON.stringify(arch));
      assert.equal(run().status, 1, 'node, module and edge drift fail');
      writeFileSync(path, original);
    }
    record.flowchart_en = 'stale';
    writeFileSync(join(details, 'Example.json'), JSON.stringify(record));
    assert.equal(run().status, 1, 'detail fallback drift fails');
    record.flowchart_en = record.mermaid_flowchart;
    writeFileSync(join(details, 'Example.json'), JSON.stringify(record));
    unlinkSync(path);
    assert.notEqual(run().status, 0, 'missing artifacts must never be skipped');
    assert.equal(run('--write').status, 0, 'explicit generation creates a missing HTML asset');
    assert.equal(readFileSync(path, 'utf8'), original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
