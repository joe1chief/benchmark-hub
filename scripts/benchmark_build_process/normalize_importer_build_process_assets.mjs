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

function normalizeCellValueNewlines(tag) {
  return tag.replace(/\bvalue="([^"]*)"/u, (_attribute, value) => (
    `value="${normalizeAttributeValueNewlines(value)}"`
  ));
}

function normalizeAttributeValueNewlines(value) {
  return value.replace(/\r\n|\r|\n/gu, '&#xa;');
}

function formatCoordinate(value) {
  return String(Number(value.toFixed(6)));
}

function readEdgeLabel(cell) {
  const openingTag = cell.match(/<mxCell\b[^>]*>/u)?.[0] ?? '';
  const geometryTag = cell.match(/<mxGeometry\b[^>]*>/u)?.[0] ?? '';
  const value = readAttribute(openingTag, 'value');
  const rawX = Number.parseFloat(readAttribute(geometryTag, 'x') ?? '');
  const rawY = Number.parseFloat(readAttribute(geometryTag, 'y') ?? '');

  return {
    parent: readAttribute(openingTag, 'parent'),
    value: value === undefined ? undefined : normalizeAttributeValueNewlines(value),
    x: Number.isFinite(rawX) ? formatCoordinate((rawX * 2) - 1) : undefined,
    y: Number.isFinite(rawY) ? formatCoordinate(rawY) : undefined,
    offset: cell.match(/<mxPoint\b[^>]*\bas="offset"[^>]*\/>/u)?.[0],
  };
}

function applyEdgeLabelPosition(geometryTag, label) {
  const attributes = [];
  if (label.x !== undefined) attributes.push(`x="${label.x}"`);
  if (label.y !== undefined) attributes.push(`y="${label.y}"`);
  if (attributes.length === 0) return geometryTag;

  const withoutOldPosition = geometryTag
    .replace(/\s+x="[^"]*"/u, '')
    .replace(/\s+y="[^"]*"/u, '');
  return withoutOldPosition.replace('<mxGeometry', `<mxGeometry ${attributes.join(' ')}`);
}

function mergeEdgeLabelGeometry(cell, label) {
  const selfClosing = cell.match(/<mxGeometry\b[^>]*\/>/u);
  if (selfClosing) {
    const [geometryTag] = selfClosing;
    const positioned = applyEdgeLabelPosition(geometryTag, label);
    if (!label.offset) return cell.replace(geometryTag, positioned);
    const prefix = cell.slice(0, selfClosing.index);
    const indentation = prefix.match(/(?:^|\n)([ \t]*)$/u)?.[1] ?? '';
    const expanded = cell.includes('\n')
      ? `${positioned.slice(0, -2)}>\n${indentation}  ${label.offset}\n${indentation}</mxGeometry>`
      : `${positioned.slice(0, -2)}>${label.offset}</mxGeometry>`;
    return cell.replace(geometryTag, expanded);
  }

  const expanded = cell.match(/(<mxGeometry\b[^>]*>)([\s\S]*?)(<\/mxGeometry>)/u);
  if (!expanded) return cell;

  const [, geometryTag, originalBody, closingTag] = expanded;
  const prefix = cell.slice(0, expanded.index);
  const indentation = prefix.match(/(?:^|\n)([ \t]*)$/u)?.[1] ?? '';
  const positioned = applyEdgeLabelPosition(geometryTag, label);
  let body = originalBody;
  if (label.offset) {
    if (/<mxPoint\b[^>]*\bas="offset"[^>]*\/>/u.test(body)) {
      body = body.replace(/<mxPoint\b[^>]*\bas="offset"[^>]*\/>/u, label.offset);
    } else {
      body = cell.includes('\n')
        ? `\n${indentation}  ${label.offset}${body}`
        : `${label.offset}${body}`;
    }
  }
  return cell.replace(expanded[0], `${positioned}${body}${closingTag}`);
}

function normalizeImporterDiagramContent(xml) {
  const cellBlocks = [...xml.matchAll(/<mxCell\b[^>]*(?:\/>|>[\s\S]*?<\/mxCell>)/gu)]
    .map(match => match[0]);
  const edgeLabelsByParent = new Map();
  const edgeLabelCellIds = new Set();
  for (const cell of cellBlocks) {
    const tag = cell.match(/<mxCell\b[^>]*>/u)?.[0] ?? '';
    const style = readAttribute(tag, 'style') ?? '';
    if (!style.split(';').includes('edgeLabel')) continue;

    const id = readAttribute(tag, 'id');
    const label = readEdgeLabel(cell);
    if (id) edgeLabelCellIds.add(id);
    if (label.parent && label.value !== undefined && !edgeLabelsByParent.has(label.parent)) {
      edgeLabelsByParent.set(label.parent, label);
    }
  }

  let normalizedXml = xml
    .replace(/math="[01]"/gu, 'math="0"')
    .replace(/<mxCell\b[^>]*>/gu, (tag) => {
      let normalized = normalizeCellValueNewlines(tag);
      const style = readAttribute(tag, 'style');
      if (style !== undefined) {
        normalized = normalized.replace(
          /\bstyle="[^"]*"/u,
          `style="${normalizeCellStyle(style)}"`,
        );
      }

      const id = readAttribute(tag, 'id');
      if (id && edgeLabelsByParent.has(id) && readAttribute(tag, 'edge') === '1') {
        const { value: label } = edgeLabelsByParent.get(id);
        if (/\bvalue="[^"]*"/u.test(normalized)) {
          normalized = normalized.replace(/\bvalue="[^"]*"/u, `value="${label}"`);
        } else {
          normalized = normalized.replace('<mxCell', `<mxCell value="${label}"`);
        }
      }
      return normalized;
    });

  normalizedXml = normalizedXml.replace(
    /<mxCell\b(?![^>]*\/>)[^>]*>[\s\S]*?<\/mxCell>/gu,
    (cell) => {
      const openingTag = cell.match(/<mxCell\b[^>]*>/u)?.[0] ?? '';
      const id = readAttribute(openingTag, 'id');
      const label = id ? edgeLabelsByParent.get(id) : undefined;
      return label && readAttribute(openingTag, 'edge') === '1'
        ? mergeEdgeLabelGeometry(cell, label)
        : cell;
    },
  );

  normalizedXml = normalizedXml.replace(
    /(?:^[ \t]*)?<mxCell\b[^>]*(?:\/>|>[\s\S]*?<\/mxCell>)(?:\r?\n)?/gmu,
    (cell) => {
      const openingTag = cell.match(/<mxCell\b[^>]*>/u)?.[0] ?? '';
      const id = readAttribute(openingTag, 'id');
      return id && edgeLabelCellIds.has(id) ? '' : cell;
    },
  );

  return normalizedXml;
}

export function normalizeImporterDrawioContent(xml) {
  if (!/<mxfile\b/u.test(xml)) throw new Error('Expected a Draw.io mxfile document.');

  let diagramCount = 0;
  const normalizedXml = xml.replace(
    /<diagram\b[^>]*>[\s\S]*?<\/diagram>/gu,
    (diagram) => {
      diagramCount += 1;
      return normalizeImporterDiagramContent(diagram);
    },
  );
  if (diagramCount === 0) throw new Error('Expected at least one Draw.io diagram page.');
  return normalizedXml;
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
