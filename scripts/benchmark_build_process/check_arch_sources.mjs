#!/usr/bin/env node
// Validate HTML graph data against its source with the project-owned projection.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildFlowchartModel } from './flowchart_model.mjs';

import { writeFileBatchAtomically } from './atomic_file_batch.mjs';
import { renderFallback } from './sync_detail_fallbacks_from_arch.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const rootArg = rootIndex >= 0 ? args.splice(rootIndex, 2)[1] : undefined;
if (rootIndex >= 0 && !rootArg) throw new Error('--root requires a directory');
const root = rootArg ? resolve(rootArg) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (args.some(arg => arg !== '--write')) throw new Error('Usage: check_arch_sources.mjs [--write]');
const drawioRoot = join(root, 'client/public/drawio');
const drift = [];
const writes = [];
const fallbackDrift = [];
let checked = 0;
const records = JSON.parse(readFileSync(join(root, 'client/public/benchmarks.json'), 'utf8'));
if (!Array.isArray(records)) throw new Error('Catalog must be an array');
const ids = new Set();
for (const record of records) {
  const { id } = record;
  if (typeof id !== 'string' || !id.trim() || /[\\/\0]/u.test(id) || id === '.' || id === '..' || ids.has(id)) throw new Error(`Invalid or duplicate benchmark id: ${id}`);
  ids.add(id);
  const detail = JSON.parse(readFileSync(join(root, 'client/public/benchmarks_detail', `${id}.json`), 'utf8'));
  if (detail.id !== id) throw new Error(`${id}: detail identity mismatch`);
  for (const language of ['en', 'zh']) {
    const base = join(drawioRoot, id, `${id}.${language}`);
    const exists = existsSync(`${base}.arch.json`);
    if (!exists && !args.includes('--write')) throw new Error(`${id}.${language}: missing architecture sidecar`);
    const spec = parse(readFileSync(`${base}.spec.yaml`, 'utf8'));
    const metadata = buildFlowchartModel(spec, { title: `${id}.${language}` });
    const expected = JSON.stringify(metadata, null, 2) + '\n';
    const fallback = renderFallback(metadata);
    for (const field of [`flowchart_${language}`, ...(language === 'en' ? ['mermaid_flowchart'] : [])]) {
      if (detail[field] !== fallback || record[field] !== fallback) fallbackDrift.push(`${id}.${field}`);
    }
    checked++;
    if (exists && readFileSync(`${base}.arch.json`, 'utf8') === expected) continue;
    drift.push(`${id}.${language}`);
    if (args.includes('--write')) writes.push({ path: `${base}.arch.json`, content: expected });
  }
}
if (checked === 0) throw new Error('No architecture sidecars found');
if (writes.length) writeFileBatchAtomically(writes, { allowCreate: true });
console.log(JSON.stringify({ checked, drift: drift.length, updated: args.includes('--write'), ids: drift, fallbackDrift }, null, 2));
if ((!args.includes('--write') && drift.length) || fallbackDrift.length) process.exitCode = 1;
