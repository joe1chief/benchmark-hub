#!/usr/bin/env node
// Validate a complete proposed catalog in an isolated directory before committing
// the small, deterministic set of affected files to the requested checkout.
import {
  closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync,
  readFileSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { buildFlowchartModel } from '../benchmark_build_process/flowchart_model.mjs';
import { applyFallbacks, renderFallback } from '../benchmark_build_process/sync_detail_fallbacks_from_arch.mjs';
import { writeFileBatchAtomically } from '../benchmark_build_process/atomic_file_batch.mjs';
import { compileBenchmarkPackage, generationRecord, graphPaths, jsonText, sha256, validateId } from './benchmark_package.mjs';
import { upsertJsonRecord } from './json_records.mjs';

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = 'client/public/benchmarks.json';
const MANIFEST = 'client/public/benchmarks_build_process_manifest.json';
const DETAIL_DIR = 'client/public/benchmarks_detail';
const GRAPH_DIR = 'client/public/drawio';
const LANGUAGES = ['en', 'zh'];
// These fields describe the previous source/diagram or its optional exports.
// A reviewed source update replaces them instead of retaining stale evidence.
const MANAGED_MANIFEST_FIELDS = new Set([
  'id', 'source_type', 'source_url', 'source_locator', 'evidence_summary_en', 'evidence_summary_zh',
  'construction_steps_en', 'construction_steps_zh', 'evaluation_steps_en', 'evaluation_steps_zh',
  'strict_validation', 'svg_foreign_object_reviewed', 'review_status', 'assets', 'review_batch',
  'visual_review', 'paper_alignment_review', 'spec_authority', 'html_generation', 'diagram_labels_en',
  'diagram_labels_zh', 'diagram_types', 'diagram', 'display_name', 'language_exempt_node_ids',
  'known_limits_en', 'known_limits_zh',
]);

function safePath(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('../') || rel === '..') throw new Error(`Path escapes repository: ${path}`);
  let current = root;
  for (const part of rel.split('/')) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink is not allowed in managed paths: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return target;
}

function writeStaged(root, path, content) {
  const destination = safePath(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function snapshotHtmlInputs(root, staging) {
  const files = new Map();
  const directories = new Map();
  const capture = path => {
    const content = readFileSync(safePath(root, path), 'utf8');
    files.set(path, content);
    writeStaged(staging, path, content);
  };
  const list = path => {
    const entries = readdirSync(safePath(root, path), { withFileTypes: true });
    directories.set(path, entries.map(entry => entry.name).sort());
    return entries;
  };
  for (const path of [CATALOG, MANIFEST, 'README.md']) capture(path);
  mkdirSync(join(staging, DETAIL_DIR), { recursive: true });
  mkdirSync(join(staging, GRAPH_DIR), { recursive: true });
  for (const entry of list(DETAIL_DIR)) {
    if (entry.name.endsWith('.json')) capture(`${DETAIL_DIR}/${entry.name}`);
  }
  for (const entry of list(GRAPH_DIR)) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink in graph directory: ${entry.name}`);
    if (!entry.isDirectory()) continue;
    const directory = `${GRAPH_DIR}/${entry.name}`;
    const children = list(directory);
    let copied = 0;
    for (const child of children) {
      if (/\.(?:spec\.yaml|arch\.json)$/u.test(child.name)) {
        capture(`${directory}/${child.name}`);
        copied++;
      }
    }
    // Preserve the physical ID set for the canonical audit, even for an orphan
    // legacy-only directory. Export images are not needed by HTML validation.
    if (children.length && !copied) writeStaged(staging, `${directory}/.legacy-presence`, 'optional export exists\n');
  }
  return { files, directories };
}

function assertSnapshotUnchanged(root, snapshot, targetPaths) {
  for (const [path, content] of snapshot.files) {
    if (!existsSync(safePath(root, path)) || readFileSync(safePath(root, path), 'utf8') !== content) {
      throw new Error(`Input changed during validation; no files committed: ${path}`);
    }
  }
  for (const [path, names] of snapshot.directories) {
    const current = readdirSync(safePath(root, path)).sort();
    if (JSON.stringify(names) !== JSON.stringify(current)) throw new Error(`Directory changed during validation; no files committed: ${path}`);
  }
  for (const path of targetPaths) {
    if (!snapshot.files.has(path) && existsSync(safePath(root, path))) throw new Error(`New output appeared during validation: ${path}`);
  }
}

function runGate(executable, args, label) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.error ? `: ${result.error.message}` : ''}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return result.stdout;
}

function validateStaged(staging) {
  runGate('python3', [join(SCRIPT_ROOT, 'scripts/update_readme_stats.py'), '--root', staging], 'README statistics');
  const catalogOutput = runGate('python3', [join(SCRIPT_ROOT, 'scripts/validate_benchmarks.py'), '--html', '--root', staging], 'Catalog validation');
  const source = JSON.parse(runGate(process.execPath, [join(SCRIPT_ROOT, 'scripts/benchmark_build_process/check_arch_sources.mjs'), '--root', staging], 'Canonical graph source validation'));
  const audit = JSON.parse(runGate(process.execPath, [join(SCRIPT_ROOT, 'scripts/benchmark_build_process/audit_build_process_assets.mjs'), '--html', '--json', '--root', staging], 'HTML asset audit'));
  return {
    catalog: 'passed', readme_statistics: 'passed',
    catalog_warnings: catalogOutput.split('\n').filter(line => /\bWARN:/u.test(line)).map(line => line.trim()),
    graph_sources: { status: 'passed', checked: source.checked, drift: source.drift, fallback_drift: source.fallbackDrift.length },
    html_assets: { status: 'passed', benchmarks: audit.aggregate_total, complete: audit.complete_bilingual_total },
    paper_review: 'checked supplied review metadata; source content was not independently reviewed by this command',
  };
}

function uniqueRecord(records, id, name) {
  if (!Array.isArray(records)) throw new Error(`${name} must be an array`);
  const matching = records.filter(record => record.id === id);
  if (matching.length > 1) throw new Error(`Duplicate ${name} id: ${id}`);
  return matching[0];
}

function planAdd(input, catalog, manifest, snapshot) {
  const compiled = compileBenchmarkPackage(input, { catalog });
  const { id } = compiled;
  const detailPath = `${DETAIL_DIR}/${id}.json`;
  const existing = uniqueRecord(catalog, id, 'catalog');
  const existingManifest = uniqueRecord(manifest, id, 'manifest');
  if (catalog.some(record => record.name === compiled.benchmark.name && record.id !== id)) throw new Error(`Benchmark name already exists: ${compiled.benchmark.name}`);
  const outputs = new Map([
    [detailPath, jsonText(compiled.benchmark)],
    ...LANGUAGES.flatMap(language => [
      [`client/public/${compiled.benchmark[`drawio_spec_${language}`]}`, compiled.specs[language]],
      [`client/public/${compiled.benchmark[`drawio_arch_${language}`]}`, jsonText(compiled.models[language])],
    ]),
  ]);
  if (existing) {
    const identical = JSON.stringify(existing) === JSON.stringify(compiled.benchmark)
      && JSON.stringify(existingManifest) === JSON.stringify(compiled.manifest)
      && [...outputs].every(([path, content]) => snapshot.files.get(path) === content);
    if (!identical) throw new Error(`${id} already exists with different content. Use --update with a reviewed package, or --rebuild for derived-file drift.`);
  } else {
    if (existingManifest || snapshot.directories.has(`${GRAPH_DIR}/${id}`) || snapshot.files.has(detailPath)) throw new Error(`Orphan files or manifest already use ${id}; reconcile them before adding`);
    outputs.set(CATALOG, upsertJsonRecord(snapshot.files.get(CATALOG), compiled.benchmark, { mode: 'insert' }));
    outputs.set(MANIFEST, upsertJsonRecord(snapshot.files.get(MANIFEST), compiled.manifest, { mode: 'insert' }));
  }
  return { id, outputs };
}

function planUpdate(input, catalog, manifest, snapshot) {
  const id = validateId(input?.benchmark?.id);
  const record = uniqueRecord(catalog, id, 'catalog');
  const manifestEntry = uniqueRecord(manifest, id, 'manifest');
  if (!record || !manifestEntry) throw new Error(`Cannot update an unregistered benchmark: ${id}; use --input for new entries`);
  const detailPath = `${DETAIL_DIR}/${id}.json`;
  const detail = JSON.parse(snapshot.files.get(detailPath) ?? 'null');
  if (!detail || detail.id !== id) throw new Error(`${id}: missing or mismatched detail identity`);
  const compiled = compileBenchmarkPackage(input, { catalog, existingBenchmark: record });
  const compiledDetail = compileBenchmarkPackage(input, { catalog, existingBenchmark: { ...record, ...detail } });
  if (catalog.some(entry => entry.name === compiled.benchmark.name && entry.id !== id)) {
    throw new Error(`Benchmark name already exists: ${compiled.benchmark.name}`);
  }
  const preservedFields = {};
  const updateRecord = (previous, kind, benchmark) => {
    preservedFields[kind] = Object.keys(previous)
      .filter(key => !Object.hasOwn(benchmark, key) && !key.startsWith('drawio_')).sort();
    const next = {
      ...Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith('drawio_'))),
      ...benchmark,
    };
    // Existing scoped source notes remain bound to the newly reviewed source.
    if (Object.hasOwn(previous, 'drawio_review_note')) next.drawio_review_note = compiled.manifest.source_locator;
    return next;
  };
  const updatedRecord = updateRecord(record, 'catalog', compiled.benchmark);
  const updatedDetail = updateRecord(detail, 'detail', compiledDetail.benchmark);
  preservedFields.manifest = Object.keys(manifestEntry).filter(key => !MANAGED_MANIFEST_FIELDS.has(key)).sort();
  const updatedManifest = {
    ...Object.fromEntries(preservedFields.manifest.map(key => [key, manifestEntry[key]])),
    ...compiled.manifest,
  };
  const outputs = new Map(LANGUAGES.flatMap(language => [
    [`client/public/${compiled.benchmark[`drawio_spec_${language}`]}`, compiled.specs[language]],
    [`client/public/${compiled.benchmark[`drawio_arch_${language}`]}`, jsonText(compiled.models[language])],
  ]));
  if (!isDeepStrictEqual(record, updatedRecord)) outputs.set(CATALOG, upsertJsonRecord(snapshot.files.get(CATALOG), updatedRecord, { mode: 'replace' }));
  if (!isDeepStrictEqual(detail, updatedDetail)) outputs.set(detailPath, jsonText(updatedDetail));
  if (!isDeepStrictEqual(manifestEntry, updatedManifest)) outputs.set(MANIFEST, upsertJsonRecord(snapshot.files.get(MANIFEST), updatedManifest, { mode: 'replace' }));
  return { id, outputs, preservedFields };
}

function planRebuild(id, catalog, manifest, snapshot) {
  validateId(id);
  const record = uniqueRecord(catalog, id, 'catalog');
  const manifestEntry = uniqueRecord(manifest, id, 'manifest');
  if (!record || !manifestEntry) throw new Error(`Cannot rebuild an unregistered benchmark: ${id}`);
  const detailPath = `${DETAIL_DIR}/${id}.json`;
  const detail = JSON.parse(snapshot.files.get(detailPath) ?? 'null');
  if (!detail || detail.id !== id) throw new Error(`${id}: missing or mismatched detail identity`);
  const paths = graphPaths(id);
  const specs = {};
  const models = {};
  const outputs = new Map();
  for (const language of LANGUAGES) {
    for (const kind of ['spec', 'arch']) {
      const field = `drawio_${kind}_${language}`;
      if ([record[field], detail[field], manifestEntry.assets?.[field]].some(path => path !== paths[field])) {
        throw new Error(`${id}: ${field} must agree with its canonical path in catalog, detail and manifest`);
      }
    }
    const specPath = `client/public/${paths[`drawio_spec_${language}`]}`;
    specs[language] = snapshot.files.get(specPath);
    if (specs[language] === undefined) throw new Error(`Missing authored source: ${specPath}`);
    models[language] = buildFlowchartModel(parse(specs[language]), { title: `${id}.${language}` });
    outputs.set(`client/public/${paths[`drawio_arch_${language}`]}`, jsonText(models[language]));
  }
  const fallbacks = Object.fromEntries(LANGUAGES.map(language => [language, renderFallback(models[language])]));
  const updatedRecord = applyFallbacks(record, fallbacks);
  const updatedDetail = applyFallbacks(detail, fallbacks);
  if (JSON.stringify(record) !== JSON.stringify(updatedRecord)) outputs.set(CATALOG, upsertJsonRecord(snapshot.files.get(CATALOG), updatedRecord, { mode: 'replace' }));
  if (JSON.stringify(detail) !== JSON.stringify(updatedDetail)) outputs.set(detailPath, jsonText(updatedDetail));
  if (Object.hasOwn(manifestEntry, 'html_generation')) {
    const updatedManifest = { ...manifestEntry, html_generation: generationRecord(specs, models) };
    if (JSON.stringify(manifestEntry) !== JSON.stringify(updatedManifest)) outputs.set(MANIFEST, upsertJsonRecord(snapshot.files.get(MANIFEST), updatedManifest, { mode: 'replace' }));
  }
  return { id, outputs };
}

export function manageBenchmark({ root = SCRIPT_ROOT, input, update, rebuildId, write = false, fsOps, beforeCommit } = {}) {
  if ([input, update, rebuildId].filter(value => value !== undefined).length !== 1) throw new Error('Choose exactly one new input package, update package or rebuild ID');
  const mode = input !== undefined ? 'add' : update !== undefined ? 'update' : 'rebuild';
  root = realpathSync(resolve(root));
  const staging = mkdtempSync(join(tmpdir(), 'costco-benchmark-'));
  const lockPath = join(root, '.benchmark-catalog.lock');
  let lock;
  const createdDirectories = [];
  try {
    if (write) {
      lock = openSync(lockPath, 'wx');
      writeFileSync(lock, jsonText({ pid: process.pid, mode, id: input?.benchmark?.id ?? update?.benchmark?.id ?? rebuildId }));
    }
    const snapshot = snapshotHtmlInputs(root, staging);
    const catalog = JSON.parse(snapshot.files.get(CATALOG));
    const manifest = JSON.parse(snapshot.files.get(MANIFEST));
    const planned = mode === 'add' ? planAdd(input, catalog, manifest, snapshot)
      : mode === 'update' ? planUpdate(update, catalog, manifest, snapshot) : planRebuild(rebuildId, catalog, manifest, snapshot);
    for (const [path, content] of planned.outputs) writeStaged(staging, path, content);
    const validation = validateStaged(staging);
    planned.outputs.set('README.md', readFileSync(join(staging, 'README.md'), 'utf8'));
    const changes = [...planned.outputs].filter(([path, content]) => snapshot.files.get(path) !== content);
    const report = {
      mode, id: planned.id, write,
      changed_files: changes.map(([path, content]) => ({ path, action: snapshot.files.has(path) ? 'update' : 'create', sha256: sha256(content) })),
      validation, committed: false,
    };
    if (planned.preservedFields) report.preserved_fields = planned.preservedFields;
    if (write && changes.length) {
      beforeCommit?.();
      assertSnapshotUnchanged(root, snapshot, changes.map(([path]) => path));
      for (const [path] of changes) {
        const directory = dirname(safePath(root, path));
        if (!existsSync(directory)) {
          // Only a new benchmark graph directory may be absent in a valid root.
          mkdirSync(directory);
          createdDirectories.push(directory);
        }
      }
      const result = writeFileBatchAtomically(changes.map(([path, content]) => ({ path: safePath(root, path), content })), { allowCreate: true, ...(fsOps ? { fsOps } : {}) });
      report.committed = result.committed;
      if (result.cleanupErrors.length) report.cleanup_warnings = result.cleanupErrors.map(item => `Backup remains: ${relative(root, item.path)}`);
    }
    return report;
  } catch (error) {
    for (const directory of createdDirectories.reverse()) {
      try { rmdirSync(directory); } catch (cleanupError) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(cleanupError.code)) throw new AggregateError([error, cleanupError], 'Operation failed and an empty directory could not be removed');
      }
    }
    throw error;
  } finally {
    try { rmSync(staging, { recursive: true, force: true }); }
    finally {
      if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
    }
  }
}

function parseArgs(argv) {
  const options = { root: SCRIPT_ROOT, write: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (arg === '--help') return null;
    if (arg === '--write') { options.write = true; continue; }
    if (!['--root', '--input', '--update', '--rebuild'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    if (arg === '--root') options.root = resolve(value);
    if (arg === '--input') options.inputPath = resolve(value);
    if (arg === '--update') options.updatePath = resolve(value);
    if (arg === '--rebuild') options.rebuildId = value;
  }
  if ([options.inputPath, options.updatePath, options.rebuildId].filter(value => value !== undefined).length !== 1) throw new Error('Use exactly one of --input PACKAGE.json, --update PACKAGE.json or --rebuild ID');
  if (options.inputPath) options.input = JSON.parse(readFileSync(options.inputPath, 'utf8'));
  if (options.updatePath) options.update = JSON.parse(readFileSync(options.updatePath, 'utf8'));
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options) console.log('Usage: manage_benchmark.mjs (--input PACKAGE.json | --update PACKAGE.json | --rebuild ID) [--root REPOSITORY] [--write]\nWithout --write, validates the proposed result in a temporary directory and prints the exact file plan.');
    else console.log(jsonText(manageBenchmark(options)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
