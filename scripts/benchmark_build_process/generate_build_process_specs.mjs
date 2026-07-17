#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { writeFileBatchAtomically } from './atomic_file_batch.mjs';

const VALID_ID = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const NODE_TYPES = new Set([
  'service',
  'database',
  'decision',
  'terminal',
  'queue',
  'user',
  'document',
  'formula',
  'cloud',
  'process',
  'input',
  'output',
  'loss',
  'feature',
  'conv',
  'pool',
  'embed',
  'temporal',
  'attention',
  'gate',
  'norm',
  'graph',
  'matrix',
  'operator',
  'tensor3d',
]);
const NODE_SIZES = new Set([
  'tiny',
  'small',
  'medium',
  'large',
  'xl',
  'tensor_sm',
  'tensor_md',
  'tensor_lg',
  'tensor_xl',
]);
const EDGE_TYPES = new Set([
  'primary',
  'data',
  'optional',
  'dependency',
  'bidirectional',
]);
const REQUIRED_ASSET_FIELDS = [
  'drawio_flowchart_en',
  'drawio_flowchart_zh',
  'drawio_source_en',
  'drawio_source_zh',
  'drawio_spec_en',
  'drawio_spec_zh',
  'drawio_arch_en',
  'drawio_arch_zh',
];

function validateBenchmarkId(id) {
  if (
    typeof id !== 'string'
    || !id.trim()
    || id === '.'
    || id === '..'
    || id.includes('/')
    || id.includes('\\')
    || id.includes('\0')
  ) {
    throw new Error(`unsafe benchmark id: ${id}`);
  }
}

function resolveContained(base, ...segments) {
  const resolvedBase = resolve(base);
  const target = resolve(resolvedBase, ...segments);
  const relativePath = relative(resolvedBase, target);
  if (
    relativePath === '..'
    || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`resolved path escapes base directory: ${segments.join('/')}`);
  }
  return target;
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    ids: [],
    syncData: false,
    syncDataOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') {
      args.root = resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--id') {
      args.ids.push(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--sync-data') {
      args.syncData = true;
    } else if (argv[index] === '--sync-data-only') {
      args.syncDataOnly = true;
    }
  }
  return args;
}

function syncRecord(record, entry) {
  return {
    ...record,
    ...entry.assets,
    drawio_review_note: `Aligned with ${entry.source_locator}. ${entry.evidence_summary_en}`,
  };
}

function prepareBenchmarkDataSync(publicDir, selectedEntries) {
  const listPath = join(publicDir, 'benchmarks.json');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  const selectedById = new Map(selectedEntries.map((entry) => [entry.id, entry]));
  for (const entry of selectedEntries) {
    for (const field of REQUIRED_ASSET_FIELDS) {
      const assetPath = entry.assets?.[field];
      if (typeof assetPath !== 'string' || !assetPath.trim()) {
        throw new Error(`${entry.id}: requires non-empty asset ${field}`);
      }
      if (isAbsolute(assetPath)) {
        throw new Error(`${entry.id}: asset ${field} must be a relative public path`);
      }
      resolveContained(publicDir, assetPath);
    }
  }
  const foundListIds = new Set();
  const syncedList = list.map((record) => {
    const entry = selectedById.get(record.id);
    if (!entry) return record;
    foundListIds.add(record.id);
    return syncRecord(record, entry);
  });
  const missingListIds = selectedEntries
    .map((entry) => entry.id)
    .filter((id) => !foundListIds.has(id));
  if (missingListIds.length > 0) {
    throw new Error(`Benchmark list records not found: ${missingListIds.join(', ')}`);
  }

  const detailWrites = [];
  for (const entry of selectedEntries) {
    const detailPath = resolveContained(
      join(publicDir, 'benchmarks_detail'),
      `${entry.id}.json`,
    );
    const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
    detailWrites.push({
      path: detailPath,
      content: `${JSON.stringify(syncRecord(detail, entry), null, 2)}\n`,
    });
  }
  return {
    listPath,
    listContent: `${JSON.stringify(syncedList, null, 2)}\n`,
    detailWrites,
  };
}

function writeBenchmarkDataSync(syncPlan) {
  const result = writeFileBatchAtomically([
    { path: syncPlan.listPath, content: syncPlan.listContent },
    ...syncPlan.detailWrites,
  ]);
  for (const cleanupFailure of result.cleanupErrors) {
    const message = cleanupFailure.error instanceof Error
      ? cleanupFailure.error.message
      : String(cleanupFailure.error);
    console.warn(
      `Benchmark data committed, but backup cleanup failed for ${cleanupFailure.path}: ${message}`,
    );
  }
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function nodePosition(index, totalSteps) {
  const columns = totalSteps > 14 ? 8 : 7;
  const row = Math.floor(index / columns);
  const offset = index % columns;
  const column = row % 2 === 0 ? offset : columns - 1 - offset;
  return { x: 16 + column * 240, y: 40 + row * 376 };
}

function defaultTitle(entry, language) {
  const displayName = entry.display_name || entry.id;
  return language === 'zh'
    ? `${displayName} 构建与评测流程`
    : `${displayName} Build and Evaluation Process`;
}

function validateEntryMetadata(entry) {
  for (const field of [
    'source_locator',
    'evidence_summary_en',
    'evidence_summary_zh',
  ]) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) {
      throw new Error(`${entry.id}: requires non-empty ${field}`);
    }
  }
}

function metaLines(entry, language, title) {
  const isChinese = language === 'zh';
  const description = entry[`evidence_summary_${language}`];
  const legend = isChinese
    ? `来源：${entry.source_locator}。实线箭头表示论文或官方资料明确支持的主流程。`
    : `Source: ${entry.source_locator}. Solid arrows show the main flow explicitly supported by the paper or official documentation.`;
  return [
    'meta:',
    '  profile: academic-paper',
    '  source: generated',
    '  theme: academic-color',
    '  layout: horizontal',
    '  routing: orthogonal',
    `  title: ${yamlString(title)}`,
    `  description: ${yamlString(description)}`,
    `  legend: ${yamlString(legend)}`,
  ];
}

function validateExplicitDiagram(entry) {
  const { diagram } = entry;
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
    throw new Error(`${entry.id}: explicit diagram must define at least one node`);
  }
  if (!Array.isArray(diagram.edges)) {
    throw new Error(`${entry.id}: explicit diagram edges must be an array`);
  }

  const nodeIds = new Set();
  for (const node of diagram.nodes) {
    if (typeof node.id !== 'string' || !VALID_ID.test(node.id)) {
      throw new Error(`${entry.id}: invalid node id "${node.id}"`);
    }
    if (nodeIds.has(node.id)) {
      throw new Error(`${entry.id}: duplicate explicit node id "${node.id}"`);
    }
    nodeIds.add(node.id);
    for (const language of ['en', 'zh']) {
      if (
        typeof node[`label_${language}`] !== 'string'
        || !node[`label_${language}`].trim()
      ) {
        throw new Error(
          `${entry.id}: node "${node.id}" requires label_${language}`,
        );
      }
    }
    if (typeof node.type !== 'string' || !NODE_TYPES.has(node.type)) {
      throw new Error(
        `${entry.id}: node "${node.id}" has unknown node type "${node.type}"`,
      );
    }
    if (node.size != null && !NODE_SIZES.has(node.size)) {
      throw new Error(
        `${entry.id}: node "${node.id}" has unknown node size "${node.size}"`,
      );
    }
    if (
      !node.position
      || !Number.isFinite(node.position.x)
      || !Number.isFinite(node.position.y)
    ) {
      throw new Error(
        `${entry.id}: node "${node.id}" requires finite position x and y`,
      );
    }
  }

  const outgoingCounts = new Map(diagram.nodes.map((node) => [node.id, 0]));
  const outgoingTargets = new Map(
    diagram.nodes.map((node) => [node.id, new Set()]),
  );
  for (const edge of diagram.edges) {
    for (const endpoint of ['from', 'to']) {
      if (typeof edge[endpoint] !== 'string' || !VALID_ID.test(edge[endpoint])) {
        throw new Error(
          `${entry.id}: edge ${endpoint} has invalid node id "${edge[endpoint]}"`,
        );
      }
      if (!nodeIds.has(edge[endpoint])) {
        throw new Error(
          `${entry.id}: edge ${endpoint} references unknown node "${edge[endpoint]}"`,
        );
      }
    }
    outgoingCounts.set(edge.from, outgoingCounts.get(edge.from) + 1);
    outgoingTargets.get(edge.from).add(edge.to);
    if (edge.type != null && !EDGE_TYPES.has(edge.type)) {
      throw new Error(
        `${entry.id}: edge "${edge.from}->${edge.to}" has unknown edge type "${edge.type}"`,
      );
    }
    const hasEnglishLabel = edge.label_en != null;
    const hasChineseLabel = edge.label_zh != null;
    if (hasEnglishLabel !== hasChineseLabel) {
      throw new Error(
        `${entry.id}: edge "${edge.from}->${edge.to}" requires both label_en and label_zh`,
      );
    }
    for (const language of ['en', 'zh']) {
      if (
        edge[`label_${language}`] != null
        && typeof edge[`label_${language}`] !== 'string'
      ) {
        throw new Error(
          `${entry.id}: edge "${edge.from}->${edge.to}" label_${language} must be a string`,
        );
      }
    }
    if (
      edge.label_position != null
      && !['start', 'center', 'end'].includes(edge.label_position)
    ) {
      throw new Error(
        `${entry.id}: edge "${edge.from}->${edge.to}" has invalid label_position`,
      );
    }
    if (edge.waypoints != null) {
      if (!Array.isArray(edge.waypoints)) {
        throw new Error(
          `${entry.id}: edge "${edge.from}->${edge.to}" waypoints must be an array`,
        );
      }
      edge.waypoints.forEach((point, index) => {
        if (
          !point
          || !Number.isFinite(point.x)
          || !Number.isFinite(point.y)
        ) {
          throw new Error(
            `${entry.id}: edge "${edge.from}->${edge.to}" waypoint ${index} requires finite x and y`,
          );
        }
        if (index > 0) {
          const previous = edge.waypoints[index - 1];
          if (
            Math.abs(previous.x - point.x) < 1
            && Math.abs(previous.y - point.y) < 1
          ) {
            throw new Error(
              `${entry.id}: edge "${edge.from}->${edge.to}" waypoints ${index - 1} and ${index} must be at least 1px apart`,
            );
          }
        }
      });
    }
  }

  for (const node of diagram.nodes) {
    if (node.type === 'decision' && outgoingCounts.get(node.id) < 2) {
      throw new Error(
        `${entry.id}: decision node "${node.id}" must have at least 2 outgoing edges`,
      );
    }
    if (node.type === 'decision' && outgoingTargets.get(node.id).size < 2) {
      throw new Error(
        `${entry.id}: decision node "${node.id}" must have at least 2 unique outgoing targets`,
      );
    }
  }
}

function renderExplicitSpec(entry, language) {
  validateExplicitDiagram(entry);
  const { diagram } = entry;
  const title = diagram[`title_${language}`] || defaultTitle(entry, language);
  const lines = [
    ...metaLines(entry, language, title),
    'nodes:',
  ];

  for (const node of diagram.nodes) {
    lines.push(
      `  - id: ${node.id}`,
      `    label: ${yamlString(node[`label_${language}`])}`,
      `    type: ${node.type}`,
      `    size: ${node.size || 'xl'}`,
      '    position:',
      `      x: ${node.position.x}`,
      `      'y': ${node.position.y}`,
    );
  }

  lines.push('edges:');
  for (const edge of diagram.edges) {
    lines.push(
      `  - from: ${edge.from}`,
      `    to: ${edge.to}`,
      `    type: ${edge.type || 'primary'}`,
    );
    if (edge[`label_${language}`] != null) {
      lines.push(`    label: ${yamlString(edge[`label_${language}`])}`);
    }
    if (edge.label_position != null) {
      lines.push(`    labelPosition: ${edge.label_position}`);
    }
    if (edge.waypoints?.length) {
      lines.push('    waypoints:');
      for (const point of edge.waypoints) {
        lines.push(
          `      - x: ${point.x}`,
          `        'y': ${point.y}`,
        );
      }
    }
  }
  lines.push('modules: []', '');
  return lines.join('\n');
}

function renderSpec(entry, language) {
  validateEntryMetadata(entry);
  if (entry.diagram) return renderExplicitSpec(entry, language);

  const constructionSteps = entry[`construction_steps_${language}`] || [];
  const evaluationSteps = entry[`evaluation_steps_${language}`] || [];
  const steps = [...constructionSteps, ...evaluationSteps];
  const labels = entry[`diagram_labels_${language}`] || [];
  const types = entry.diagram_types || [];
  if (labels.length !== steps.length) {
    throw new Error(
      `${entry.id}: ${language} diagram labels (${labels.length}) must match steps (${steps.length})`,
    );
  }
  if (types.length !== steps.length) {
    throw new Error(
      `${entry.id}: diagram types (${types.length}) must match steps (${steps.length})`,
    );
  }
  labels.forEach((label, index) => {
    if (typeof label !== 'string' || !label.trim()) {
      throw new Error(
        `${entry.id}: ${language} diagram label ${index + 1} must be a non-empty string`,
      );
    }
  });
  types.forEach((type) => {
    if (typeof type !== 'string' || !NODE_TYPES.has(type)) {
      throw new Error(`${entry.id}: unknown legacy node type "${type}"`);
    }
  });

  const lines = [
    ...metaLines(entry, language, defaultTitle(entry, language)),
    'nodes:',
  ];

  labels.forEach((label, index) => {
    const position = nodePosition(index, labels.length);
    lines.push(
      `  - id: step_${index + 1}`,
      `    label: ${yamlString(label)}`,
      `    type: ${types[index]}`,
      '    size: xl',
      '    position:',
      `      x: ${position.x}`,
      `      'y': ${position.y}`,
    );
  });

  lines.push('edges:');
  for (let index = 1; index < labels.length; index += 1) {
    lines.push(
      `  - from: step_${index}`,
      `    to: step_${index + 1}`,
      '    type: primary',
    );
  }
  lines.push('modules: []', '');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ids.length === 0) {
    throw new Error('Usage: generate_build_process_specs.mjs --id <benchmark> [--id <benchmark>]');
  }
  const publicDir = join(args.root, 'client/public');
  const manifest = JSON.parse(
    readFileSync(join(publicDir, 'benchmarks_build_process_manifest.json'), 'utf8'),
  );
  const entries = new Map(manifest.map((entry) => [entry.id, entry]));

  const selectedEntries = [];
  for (const id of args.ids) {
    validateBenchmarkId(id);
    const entry = entries.get(id);
    if (!entry) throw new Error(`Manifest entry not found: ${id}`);
    validateBenchmarkId(entry.id);
    validateEntryMetadata(entry);
    selectedEntries.push(entry);
  }

  const renderedEntries = selectedEntries.map((entry) => ({
    entry,
    specs: new Map(
      ['en', 'zh'].map((language) => [language, renderSpec(entry, language)]),
    ),
  }));
  const syncPlan = args.syncData || args.syncDataOnly
    ? prepareBenchmarkDataSync(publicDir, selectedEntries)
    : null;

  if (!args.syncDataOnly) {
    for (const { entry, specs } of renderedEntries) {
      const outputDir = resolveContained(
        join(publicDir, 'drawio'),
        entry.id,
      );
      mkdirSync(outputDir, { recursive: true });
      for (const [language, spec] of specs) {
        const outputPath = join(outputDir, `${entry.id}.${language}.spec.yaml`);
        writeFileSync(outputPath, spec);
        console.log(`Generated: ${outputPath}`);
      }
    }
  }
  if (syncPlan) {
    writeBenchmarkDataSync(syncPlan);
    console.log(`Synced benchmark data: ${args.ids.join(', ')}`);
  }
}

main();
