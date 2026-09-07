#!/usr/bin/env node
// Use the same pinned generator as the export-fidelity suite; never infer metadata
// from the current sidecar, since it is a generated artifact rather than a source.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { writeFileBatchAtomically } from './atomic_file_batch.mjs';
import { renderFallback } from './sync_detail_fallbacks_from_arch.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const rootArg = rootIndex >= 0 ? args.splice(rootIndex, 2)[1] : undefined;
if (rootIndex >= 0 && !rootArg) throw new Error('--root requires a directory');
const root = rootArg ? resolve(rootArg) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = process.env.IMPORTER_DRAWIO_E2E_CLI;
if (!cli || !existsSync(cli)) throw new Error('Set IMPORTER_DRAWIO_E2E_CLI to the pinned Draw.io toolchain CLI (see scripts/ci/install_drawio_toolchain*.sh).');
if (args.some(arg => arg !== '--write')) throw new Error('Usage: check_arch_sources.mjs [--write]');
const { buildArchMetadata } = await import(pathToFileURL(join(dirname(cli), 'runtime/artifacts.js')).href);
const yaml = createRequire(resolve(cli))('js-yaml');
const drawioRoot = join(root, 'client/public/drawio');
const drift = [];
const writes = [];
const fallbackDrift = [];
let checked = 0;
const records = JSON.parse(readFileSync(join(root, 'client/public/benchmarks.json'), 'utf8'));
for (const record of records) {
  const { id } = record;
  const detail = JSON.parse(readFileSync(join(root, 'client/public/benchmarks_detail', `${id}.json`), 'utf8'));
  if (detail.id !== id) throw new Error(`${id}: detail identity mismatch`);
  for (const language of ['en', 'zh']) {
    const base = join(drawioRoot, id, `${id}.${language}`);
    if (!existsSync(`${base}.arch.json`)) throw new Error(`${id}.${language}: missing architecture sidecar`);
    const spec = yaml.load(readFileSync(`${base}.spec.yaml`, 'utf8'));
    const metadata = buildArchMetadata(spec, { outputFile: `${base}.drawio` });
    const expected = JSON.stringify(metadata, null, 2) + '\n';
    const fallback = renderFallback(metadata);
    for (const field of [`flowchart_${language}`, ...(language === 'en' ? ['mermaid_flowchart'] : [])]) {
      if (detail[field] !== fallback || record[field] !== fallback) fallbackDrift.push(`${id}.${field}`);
    }
    checked++;
    if (readFileSync(`${base}.arch.json`, 'utf8') === expected) continue;
    drift.push(`${id}.${language}`);
    if (args.includes('--write')) writes.push({ path: `${base}.arch.json`, content: expected });
  }
}
if (checked === 0) throw new Error('No architecture sidecars found');
if (writes.length) writeFileBatchAtomically(writes);
console.log(JSON.stringify({ checked, drift: drift.length, updated: args.includes('--write'), ids: drift, fallbackDrift }, null, 2));
if ((!args.includes('--write') && drift.length) || fallbackDrift.length) process.exitCode = 1;
