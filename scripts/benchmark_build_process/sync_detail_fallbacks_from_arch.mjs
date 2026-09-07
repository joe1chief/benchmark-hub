#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { writeFileBatchAtomically } from './atomic_file_batch.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const catalogPath = join(publicDir, 'benchmarks.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const idsIndex = argv.indexOf('--ids');
  const archRootIndex = argv.indexOf('--arch-root');
  const allowedLength = archRootIndex === -1 ? 2 : 4;
  if (idsIndex === -1 || !argv[idsIndex + 1] || argv.length !== allowedLength) {
    throw new Error(
      'Usage: sync_detail_fallbacks_from_arch.mjs --ids id1,id2 [--arch-root directory]',
    );
  }
  if (archRootIndex !== -1 && !argv[archRootIndex + 1]) {
    throw new Error('--arch-root requires a directory');
  }
  const ids = argv[idsIndex + 1].split(',').map(value => value.trim()).filter(Boolean);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error('--ids must contain a non-empty unique comma-separated list');
  }
  return {
    ids,
    archRoot: archRootIndex === -1
      ? join(publicDir, 'drawio')
      : resolve(argv[archRootIndex + 1]),
  };
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function mermaidEdgeLabel(label) {
  return mermaidLabel(label).replace(/\|/gu, '&#124;');
}

export function applyFallbacks(record, fallbacks) {
  return {
    ...record,
    flowchart_en: fallbacks.en,
    flowchart_zh: fallbacks.zh,
    mermaid_flowchart: fallbacks.en,
  };
}

export function renderFallback(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of arch.edges) {
    const label = String(edge.label ?? '').trim();
    let arrow;
    if (edge.type === 'primary') {
      arrow = label ? `-->|${mermaidEdgeLabel(label)}|` : '-->';
    } else {
      arrow = label ? `-. ${mermaidEdgeLabel(label)} .->` : '-.->';
    }
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function main() {
  const { ids, archRoot } = parseArgs(process.argv.slice(2));
  const catalog = readJson(catalogPath);
  const catalogIndex = new Map(catalog.map((record, index) => [record.id, index]));
  const originalCatalog = JSON.stringify(catalog);
  const writes = [];

  for (const id of ids) {
    const detailPath = join(publicDir, 'benchmarks_detail', `${id}.json`);
    if (!existsSync(detailPath)) throw new Error(`${id}: missing detail record`);
    const detail = readJson(detailPath);
    if (detail.id !== id) throw new Error(`${id}: detail identity mismatch`);

    const fallbacks = {};
    for (const language of ['en', 'zh']) {
      const archPath = join(archRoot, id, `${id}.${language}.arch.json`);
      if (!existsSync(archPath)) throw new Error(`${id}.${language}: missing architecture sidecar`);
      fallbacks[language] = renderFallback(readJson(archPath));
    }

    const updatedDetail = applyFallbacks(detail, fallbacks);
    if (JSON.stringify(updatedDetail) !== JSON.stringify(detail)) {
      writes.push({ path: detailPath, content: `${JSON.stringify(updatedDetail, null, 2)}\n` });
    }

    const index = catalogIndex.get(id);
    if (index === undefined) throw new Error(`${id}: missing catalog record`);
    catalog[index] = applyFallbacks(catalog[index], fallbacks);
  }

  if (JSON.stringify(catalog) !== originalCatalog) {
    writes.push({ path: catalogPath, content: `${JSON.stringify(catalog, null, 2)}\n` });
  }
  if (writes.length) writeFileBatchAtomically(writes);
  console.log(`Synchronized bilingual Mermaid fallbacks for ${ids.length} benchmark details.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
