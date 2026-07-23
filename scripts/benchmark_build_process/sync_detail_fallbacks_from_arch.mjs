#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function renderFallback(arch) {
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

    detail.flowchart_en = fallbacks.en;
    detail.flowchart_zh = fallbacks.zh;
    detail.mermaid_flowchart = fallbacks.en;
    writeFileSync(detailPath, `${JSON.stringify(detail, null, 2)}\n`);

    const index = catalogIndex.get(id);
    if (index === undefined) throw new Error(`${id}: missing catalog record`);
    catalog[index] = detail;
  }

  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Synchronized bilingual Mermaid fallbacks for ${ids.length} benchmark details.`);
}

main();
