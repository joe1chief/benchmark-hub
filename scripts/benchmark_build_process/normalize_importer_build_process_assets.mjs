#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeDrawioSvgContent } from './normalize_drawio_svg.mjs';

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`, 'u'))?.[1];
}

function normalizeCellStyle(style) {
  const entries = style.split(';').filter(Boolean);
  const normalized = [];
  let insertedTextMode = false;

  for (const entry of entries) {
    if (entry.startsWith('convertToSvg=')) continue;
    if (entry.startsWith('html=')) {
      if (!insertedTextMode) {
        normalized.push('html=0', 'convertToSvg=1');
        insertedTextMode = true;
      }
      continue;
    }
    normalized.push(entry);
  }

  if (!insertedTextMode) normalized.push('html=0', 'convertToSvg=1');
  return normalized.join(';');
}

export function normalizeImporterDrawioContent(xml) {
  if (!/<mxfile\b/u.test(xml)) throw new Error('Expected a Draw.io mxfile document.');

  const cellTags = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
  const labeledEdgeIds = new Set();
  for (const tag of cellTags) {
    const style = readAttribute(tag, 'style') ?? '';
    const parent = readAttribute(tag, 'parent');
    if (style.split(';').includes('edgeLabel') && parent) labeledEdgeIds.add(parent);
  }

  return xml
    .replace(/math="[01]"/gu, 'math="0"')
    .replace(/<mxCell\b[^>]*>/gu, (tag) => {
      let normalized = tag;
      const style = readAttribute(tag, 'style');
      if (style !== undefined) {
        normalized = normalized.replace(
          /\bstyle="[^"]*"/u,
          `style="${normalizeCellStyle(style)}"`,
        );
      }

      const id = readAttribute(tag, 'id');
      if (id && labeledEdgeIds.has(id) && readAttribute(tag, 'edge') === '1') {
        normalized = normalized.replace(/\bvalue="[^"]*"/u, 'value=""');
      }
      return normalized;
    });
}

function selectLightColor(css) {
  let output = css;
  let searchFrom = 0;
  while (true) {
    const functionStart = output.indexOf('light-dark(', searchFrom);
    if (functionStart < 0) return output;

    const valueStart = functionStart + 'light-dark('.length;
    let depth = 1;
    let comma = -1;
    let end = -1;
    for (let index = valueStart; index < output.length; index += 1) {
      const character = output[index];
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
      if (character === ',' && depth === 1 && comma < 0) comma = index;
    }

    if (comma < 0 || end < 0) throw new Error('Malformed light-dark() expression in SVG.');
    const lightValue = output.slice(valueStart, comma).trim();
    output = `${output.slice(0, functionStart)}${lightValue}${output.slice(end + 1)}`;
    searchFrom = functionStart + lightValue.length;
  }
}

export function normalizeImporterSvgContent(svg) {
  if (!/<svg\b/u.test(svg)) throw new Error('Expected an SVG document.');
  return selectLightColor(normalizeDrawioSvgContent(svg));
}

function normalizePath(inputPath) {
  const path = resolve(inputPath);
  const extension = extname(path).toLowerCase();
  const original = readFileSync(path, 'utf8');
  let normalized;
  if (extension === '.drawio') normalized = normalizeImporterDrawioContent(original);
  else if (extension === '.svg') normalized = normalizeImporterSvgContent(original);
  else throw new Error(`Unsupported asset extension: ${extension || '(none)'}`);
  writeFileSync(path, normalized);
  console.log(`Normalized importer build-process asset: ${path}`);
}

function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: node normalize_importer_build_process_assets.mjs <diagram.drawio|diagram.svg> [...]');
    process.exitCode = 2;
    return;
  }
  for (const path of paths) normalizePath(path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
