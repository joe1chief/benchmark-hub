#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function normalizeDrawioSvgContent(svg) {
  return svg
    .replace(/color-scheme:\s*light\s+dark;/gu, 'color-scheme: light;')
    .replace(
      /light-dark\(\s*(rgba?\([^)]*\))\s*,\s*rgba?\([^)]*\)\s*\)/giu,
      '$1',
    )
    .replace(
      /light-dark\(\s*(#[0-9a-f]{3,8})\s*,\s*#[0-9a-f]{3,8}\s*\)/giu,
      '$1',
    );
}

function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: node normalize_drawio_svg.mjs <diagram.svg> [...]');
    process.exitCode = 2;
    return;
  }

  for (const inputPath of paths) {
    const path = resolve(inputPath);
    const original = readFileSync(path, 'utf8');
    const normalized = normalizeDrawioSvgContent(original);
    writeFileSync(path, normalized);
    console.log(`Normalized: ${path}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
