#!/usr/bin/env node

import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

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
const CORE_ASSET_SUFFIXES = [
  'en.svg',
  'zh.svg',
  'en.drawio',
  'zh.drawio',
  'en.spec.yaml',
  'zh.spec.yaml',
  'en.arch.json',
  'zh.arch.json',
];
const ID_SET_ORDER = [
  'catalog',
  'detail',
  'manifest',
  'physical_assets',
  'complete_core_assets',
];
const TECHNICAL_LABEL_ALLOWLIST = new Set([
  'BLEU-1、BLEU-4、ROUGE-1、ROUGE-2、ROUGE-L',
  'BLEU-1、BLEU-4、ROUGE-L',
  'ClinicalTrials.gov XML',
  'D-LLaVA',
  'DFT-C · HFD · HFE · QECC · GEO\nROUGE-L',
  'F1、IoU、mAP',
  'Grid-LLaVA',
  'LongSeal 254',
  'MIMIC、ChatDoctor、DrugBank、Drugs.com',
  'Mean IoU',
  'MiniGPT4-CoT',
  'Open Images',
  'Pass@1',
  'Seal-Hard 254',
  'SecureBio VMQA4',
  'mG-Pass@16',
  'score@k',
]);

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    json: false,
    allowIncomplete: false,
    queueJson: null,
    queueMarkdown: null,
  };
  const seen = new Set();

  const markSeen = (option) => {
    if (seen.has(option)) {
      throw new Error(`Invalid audit arguments: duplicate option ${option}.`);
    }
    seen.add(option);
  };
  const readValue = (option, index) => {
    markSeen(option);
    const value = argv[index + 1];
    if (
      typeof value !== 'string'
      || !value.trim()
      || value.startsWith('-')
    ) {
      throw new Error(`Invalid audit arguments: ${option} requires a value.`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = resolve(readValue(arg, index));
      index += 1;
    } else if (arg === '--json') {
      markSeen(arg);
      args.json = true;
    } else if (arg === '--allow-incomplete') {
      markSeen(arg);
      args.allowIncomplete = true;
    } else if (arg === '--queue-json') {
      args.queueJson = readValue(arg, index);
      index += 1;
    } else if (arg === '--queue-markdown') {
      args.queueMarkdown = readValue(arg, index);
      index += 1;
    } else {
      throw new Error(`Invalid audit arguments: unexpected argument ${arg}.`);
    }
  }

  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readMetaField(spec, field) {
  const lines = spec.split(/\r?\n/);
  const fieldPattern = new RegExp(`^  ${field}:\\s*(.*)$`);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(fieldPattern);
    if (!match) continue;
    const inlineValue = match[1].trim();
    if (!/^[>|][-+]?$/u.test(inlineValue)) return inlineValue;

    const blockLines = [];
    for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
      const line = lines[blockIndex];
      if (line && !/^\s{4,}/u.test(line)) break;
      blockLines.push(line.trim());
    }
    return blockLines.join(' ').trim();
  }

  return '';
}

function countIds(records, getId = (record) => record.id) {
  const counts = new Map();
  for (const record of records) {
    const id = getId(record);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function duplicateIdIssues(counts, issue) {
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, issue, count }))
    .sort((left, right) => compareText(left.id, right.id));
}

function compareText(left, right) {
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');
  if (leftText < rightText) return -1;
  if (leftText > rightText) return 1;
  return 0;
}

function sortManifestRecords(records) {
  return [...records].sort((left, right) => (
    compareText(left?.id, right?.id)
    || compareText(JSON.stringify(left), JSON.stringify(right))
  ));
}

function inspectBenchmarkId(record, location) {
  const hasId = record !== null
    && typeof record === 'object'
    && Object.prototype.hasOwnProperty.call(record, 'id');
  const rawId = hasId ? record.id : null;
  let reason = null;
  if (!hasId) reason = 'missing';
  else if (rawId === null) reason = 'null';
  else if (typeof rawId !== 'string') reason = 'non_string';
  else if (!rawId.trim()) reason = 'blank';
  if (!reason) return { id: rawId, issue: null };

  const locator = location.file
    ? `file:${location.file}`
    : `record:${location.record_index}`;
  const syntheticKey = `__invalid__:${location.source}:${locator}`;
  return {
    id: null,
    issue: {
      id: syntheticKey,
      synthetic_key: syntheticKey,
      issue: 'invalid_benchmark_id',
      ...location,
      raw_id: rawId,
      reason,
    },
  };
}

function partitionValidRecords(records, source) {
  const validRecords = [];
  const issues = [];
  records.forEach((record, recordIndex) => {
    const inspected = inspectBenchmarkId(record, {
      source,
      record_index: recordIndex,
    });
    if (inspected.issue) issues.push(inspected.issue);
    else validRecords.push(record);
  });
  return { validRecords, issues };
}

function exactIdSetIssues(idSets) {
  const allIds = [...new Set(
    ID_SET_ORDER.flatMap((name) => [...idSets[name]]),
  )].sort(compareText);
  return allIds.flatMap((id) => {
    const presentIn = ID_SET_ORDER.filter((name) => idSets[name].has(id));
    if (presentIn.length === ID_SET_ORDER.length) return [];
    return [{
      id,
      issue: 'id_set_mismatch',
      present_in: presentIn,
      missing_from: ID_SET_ORDER.filter((name) => !idSets[name].has(id)),
    }];
  });
}

function issueCode(gate, issue) {
  const qualifiers = [];
  if (issue.source) qualifiers.push(issue.source);
  if (issue.record_index !== undefined) qualifiers.push(`record=${issue.record_index}`);
  if (issue.file) qualifiers.push(`file=${issue.file}`);
  if (issue.reason) qualifiers.push(`reason=${issue.reason}`);
  if (issue.language) qualifiers.push(issue.language);
  if (issue.field) qualifiers.push(issue.field);
  if (issue.node) qualifiers.push(issue.node);
  if (issue.edge) qualifiers.push(issue.edge);
  if (issue.missing_from) qualifiers.push(`missing=${issue.missing_from.join(',')}`);
  return [gate, issue.issue, ...qualifiers].join(':');
}

function indexIssuesById(issueGroups) {
  const index = new Map();
  for (const [gate, issues] of issueGroups) {
    for (const issue of issues) {
      if (!issue?.id) continue;
      if (!index.has(issue.id)) index.set(issue.id, []);
      index.get(issue.id).push(issueCode(gate, issue));
    }
  }
  return index;
}

function nextActionForGates(gates) {
  if (!gates.id_set) {
    return 'Reconcile the benchmark ID across catalog, detail, manifest, physical assets, and complete core assets.';
  }
  if (!gates.core) {
    return 'Create or fix the referenced bilingual SVG, draw.io, spec, and architecture files.';
  }
  if (!gates.paper) {
    return 'Review and, if needed, redraw the build process against the primary source; then record its exact URL and locator.';
  }
  if (!gates.strict) {
    return 'Run strict draw.io validation for both languages and record passed evidence.';
  }
  if (!gates.visual) {
    return 'Review both rendered diagrams and record visually_reviewed status.';
  }
  return 'Export both English and Chinese PNG previews from the reviewed draw.io assets.';
}

function addFallbackIssue(issues, gate, code) {
  if (!issues.some((issue) => issue.startsWith(`${gate}:`))) {
    issues.push(`${gate}:${code}`);
  }
}

function buildUnresolvedQueue({
  allIds,
  manifestById,
  idSetIssues,
  completeCoreAssetIds,
  physicalDrawioIds,
  pngCompleteIds,
  pngIssues,
  brokenReferences,
  aggregateIssues,
  dataConsistencyIssues,
  sourceIssues,
  strictIssues,
  visualIssues,
  paperAlignmentIssues,
  languageIssues,
  svgIssues,
  topologyIssues,
}) {
  const recordIdentityIssues = [
    ...aggregateIssues.filter((issue) => issue.issue === 'duplicate_list_record'),
    ...sourceIssues.filter((issue) => (
      ['duplicate_manifest_record', 'duplicate_detail_record',
        'manifest_id_without_detail', 'assets_without_manifest_record']
        .includes(issue.issue)
    )),
  ];
  const issueIndex = indexIssuesById([
    ['id_set', idSetIssues],
    ['core', brokenReferences],
    ['core', aggregateIssues],
    ['core', dataConsistencyIssues],
    ['id_set', recordIdentityIssues],
    ['paper', sourceIssues.filter((issue) => (
      ['missing_source_url', 'missing_source_locator'].includes(issue.issue)
    ))],
    ['png', pngIssues],
    ['strict', strictIssues],
    ['visual', visualIssues],
    ['paper', paperAlignmentIssues],
    ['strict', languageIssues],
    ['strict', svgIssues],
    ['strict', topologyIssues],
  ]);
  const idSetIssueIds = new Set(
    [...idSetIssues, ...recordIdentityIssues].map((issue) => issue.id),
  );
  const strictIssueIds = new Set([
    ...strictIssues,
    ...languageIssues,
    ...svgIssues,
    ...topologyIssues,
  ].map((issue) => issue.id));
  const visualIssueIds = new Set(visualIssues.map((issue) => issue.id));
  const paperIssueIds = new Set([
    ...paperAlignmentIssues,
    ...sourceIssues.filter((issue) => (
      ['missing_source_url', 'missing_source_locator'].includes(issue.issue)
    )),
  ].map((issue) => issue.id));
  const coreIssueIds = new Set([
    ...brokenReferences,
    ...aggregateIssues,
    ...dataConsistencyIssues,
  ].map((issue) => issue.id));
  const invalidIdIssueById = new Map(
    idSetIssues
      .filter((issue) => issue.issue === 'invalid_benchmark_id')
      .map((issue) => [issue.id, issue]),
  );

  return [...allIds].sort(compareText).flatMap((id) => {
    const manifestEntry = manifestById.get(id);
    const gates = {
      id_set: !idSetIssueIds.has(id),
      core: completeCoreAssetIds.has(id) && !coreIssueIds.has(id),
      png: pngCompleteIds.has(id),
      strict: Boolean(manifestEntry)
        && !strictIssueIds.has(id)
        && manifestEntry.strict_validation?.en === 'passed'
        && manifestEntry.strict_validation?.zh === 'passed',
      visual: Boolean(manifestEntry)
        && !visualIssueIds.has(id)
        && manifestEntry.review_status === 'visually_reviewed',
      paper: Boolean(manifestEntry) && !paperIssueIds.has(id),
    };
    if (Object.values(gates).every(Boolean)) return [];

    const issues = [...(issueIndex.get(id) || [])];
    if (!gates.id_set) addFallbackIssue(issues, 'id_set', 'id_set_mismatch');
    if (!gates.core) addFallbackIssue(issues, 'core', 'core_assets_incomplete');
    if (!gates.png) addFallbackIssue(issues, 'png', 'png_incomplete');
    if (!gates.strict) addFallbackIssue(issues, 'strict', 'strict_validation_not_passed');
    if (!gates.visual) addFallbackIssue(issues, 'visual', 'visual_review_not_passed');
    if (!gates.paper) addFallbackIssue(issues, 'paper', 'paper_alignment_review_not_passed');
    const paperReview = manifestEntry?.paper_alignment_review;
    const invalidIdIssue = invalidIdIssueById.get(id);
    return [{
      id,
      ...(invalidIdIssue ? {
        input_location: {
          source: invalidIdIssue.source,
          ...(invalidIdIssue.record_index !== undefined
            ? { record_index: invalidIdIssue.record_index }
            : {}),
          ...(invalidIdIssue.file ? { file: invalidIdIssue.file } : {}),
          raw_id: invalidIdIssue.raw_id,
          reason: invalidIdIssue.reason,
        },
      } : {}),
      source_type: manifestEntry?.source_type ?? null,
      source_url: manifestEntry?.source_url ?? null,
      source_locator: manifestEntry?.source_locator ?? null,
      gates,
      issues: [...new Set(issues)].sort(compareText),
      review_state: {
        strict_validation: {
          en: manifestEntry?.strict_validation?.en ?? null,
          zh: manifestEntry?.strict_validation?.zh ?? null,
        },
        visual_review: manifestEntry?.review_status ?? null,
        paper_alignment: paperReview?.status ?? null,
        paper_source_url: paperReview?.source_url ?? null,
        paper_source_locator: paperReview?.source_locator ?? null,
      },
      asset_state: {
        physical_directory_present: physicalDrawioIds.has(id),
        core_complete: completeCoreAssetIds.has(id),
        png_complete: pngCompleteIds.has(id),
      },
      next_action: nextActionForGates(gates),
    }];
  });
}

function topologySignature(items, fields) {
  return JSON.stringify(
    (Array.isArray(items) ? items : [])
      .map((item) => fields.map((field) => item?.[field] ?? '').join('\u0000'))
      .sort(),
  );
}

function resolveContainedAsset(publicDir, assetPath) {
  if (
    typeof assetPath !== 'string'
    || !assetPath.trim()
    || isAbsolute(assetPath)
  ) return null;
  const resolvedPublicDir = resolve(publicDir);
  const target = resolve(resolvedPublicDir, assetPath);
  const relativePath = relative(resolvedPublicDir, target);
  if (
    relativePath === '..'
    || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(relativePath)
  ) {
    return null;
  }
  return target;
}

function architectureTopologyIssues(id, language, arch) {
  const nodes = Array.isArray(arch?.nodes) ? arch.nodes : [];
  const edges = Array.isArray(arch?.edges) ? arch.edges : [];
  const nodeCounts = countIds(nodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const issues = duplicateIdIssues(nodeCounts, 'duplicate_node_id')
    .map(({ id: node, count, issue }) => ({
      id,
      language,
      node,
      count,
      issue,
    }));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        id,
        language,
        edge: `${edge.from}->${edge.to}`,
        issue: 'edge_source_missing',
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        id,
        language,
        edge: `${edge.from}->${edge.to}`,
        issue: 'edge_target_missing',
      });
    }
  }
  return issues;
}

function decisionTopologyIssues(id, arch) {
  const nodeIds = new Set(
    (Array.isArray(arch?.nodes) ? arch.nodes : []).map((node) => node.id),
  );
  const outgoingTargets = new Map();
  for (const edge of Array.isArray(arch?.edges) ? arch.edges : []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    if (!outgoingTargets.has(edge.from)) outgoingTargets.set(edge.from, new Set());
    outgoingTargets.get(edge.from).add(edge.to);
  }
  return (Array.isArray(arch?.nodes) ? arch.nodes : [])
    .filter((node) => node.type === 'decision')
    .filter((node) => (outgoingTargets.get(node.id)?.size || 0) < 2)
    .map((node) => ({
      id,
      node: node.id,
      issue: 'decision_has_fewer_than_two_unique_targets',
      outgoing_targets: outgoingTargets.get(node.id)?.size || 0,
    }));
}

function isTechnicalIdentifierLabel(label) {
  return TECHNICAL_LABEL_ALLOWLIST.has(label);
}

function edgeTopologyKey(edge) {
  return `${edge?.from ?? ''}->${edge?.to ?? ''}:${edge?.type ?? ''}`;
}

function labeledEdgeCounts(edges) {
  const counts = new Map();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const key = edgeTopologyKey(edge);
    if (!counts.has(key)) counts.set(key, 0);
    if (String(edge?.label || '').trim()) {
      counts.set(key, counts.get(key) + 1);
    }
  }
  return counts;
}

function isLanguageExemptNode(node, exemptNodeIds) {
  const label = String(node?.label || '').trim();
  return exemptNodeIds.has(node?.id)
    || node?.type === 'formula'
    || !/\p{L}/u.test(label)
    || isTechnicalIdentifierLabel(label);
}

export function auditBuildProcessAssets(root) {
  const publicDir = join(root, 'client/public');
  const detailDir = join(publicDir, 'benchmarks_detail');
  const drawioDir = join(publicDir, 'drawio');
  const aggregatePath = join(publicDir, 'benchmarks.json');
  const manifestPath = join(publicDir, 'benchmarks_build_process_manifest.json');
  const detailFiles = readdirSync(detailDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const rawDetails = detailFiles.map((detailFile) => ({
    detailFile,
    detail: readJson(join(detailDir, detailFile)),
  }));
  const invalidIdIssues = [];
  const details = rawDetails.flatMap(({ detailFile, detail }) => {
    const inspected = inspectBenchmarkId(detail, {
      source: 'detail',
      file: detailFile,
    });
    if (inspected.issue) {
      invalidIdIssues.push(inspected.issue);
      return [];
    }
    return [{ detailFile, detail, id: inspected.id }];
  });
  const detailIdCounts = countIds(details, ({ id }) => id);
  const detailIds = new Set(details.map(({ id }) => id));
  const rawManifest = existsSync(manifestPath) ? readJson(manifestPath) : [];
  const manifestPartition = partitionValidRecords(rawManifest, 'manifest');
  const manifest = manifestPartition.validRecords;
  invalidIdIssues.push(...manifestPartition.issues);
  const sortedManifest = sortManifestRecords(manifest);
  const manifestIdCounts = countIds(manifest);
  const manifestIds = new Set(manifest.map((entry) => entry.id));
  const manifestById = new Map(
    sortedManifest.map((entry) => [entry.id, entry]),
  );
  const rawAggregate = existsSync(aggregatePath) ? readJson(aggregatePath) : [];
  const aggregatePartition = partitionValidRecords(rawAggregate, 'catalog');
  const aggregate = aggregatePartition.validRecords;
  invalidIdIssues.push(...aggregatePartition.issues);
  const aggregateIdCounts = countIds(aggregate);
  const aggregateIds = new Set(aggregate.map((entry) => entry.id));
  const aggregateById = new Map(
    sortManifestRecords(aggregate).map((entry) => [entry.id, entry]),
  );
  const physicalDrawioIds = new Set(
    existsSync(drawioDir)
      ? readdirSync(drawioDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => readdirSync(join(drawioDir, entry.name)).length > 0)
        .map((entry) => entry.name)
      : [],
  );
  const completeCoreAssetIds = new Set(
    [...physicalDrawioIds].filter((id) => CORE_ASSET_SUFFIXES.every((suffix) => (
      existsSync(join(drawioDir, id, `${id}.${suffix}`))
    ))),
  );
  const idSets = {
    catalog: aggregateIds,
    detail: detailIds,
    manifest: manifestIds,
    physical_assets: physicalDrawioIds,
    complete_core_assets: completeCoreAssetIds,
  };
  const idSetIssues = [
    ...invalidIdIssues,
    ...exactIdSetIssues(idSets),
  ].sort((left, right) => compareText(left.id, right.id));
  const allIds = new Set(ID_SET_ORDER.flatMap((name) => [...idSets[name]]));
  const queueIds = new Set([
    ...allIds,
    ...invalidIdIssues.map((issue) => issue.synthetic_key),
  ]);
  const aggregateIssues = duplicateIdIssues(
    aggregateIdCounts,
    'duplicate_list_record',
  );
  let completeAggregateTotal = 0;
  for (const manifestEntry of sortedManifest) {
    if ((aggregateIdCounts.get(manifestEntry.id) || 0) > 1) continue;
    const aggregateEntry = aggregateById.get(manifestEntry.id);
    if (!aggregateEntry) {
      aggregateIssues.push({
        id: manifestEntry.id,
        issue: 'missing_list_record',
      });
      continue;
    }

    const entryIssues = [];
    for (const field of REQUIRED_ASSET_FIELDS) {
      const expectedPath = manifestEntry.assets?.[field] ?? null;
      const actualPath = aggregateEntry[field] || null;
      if (!actualPath) {
        entryIssues.push({
          id: manifestEntry.id,
          field,
          issue: 'missing_asset_field',
          expected_path: expectedPath,
          actual_path: null,
        });
      } else if (actualPath !== expectedPath) {
        entryIssues.push({
          id: manifestEntry.id,
          field,
          issue: 'asset_path_mismatch',
          expected_path: expectedPath,
          actual_path: actualPath,
        });
      } else if (!resolveContainedAsset(publicDir, actualPath)) {
        entryIssues.push({
          id: manifestEntry.id,
          field,
          issue: 'asset_path_outside_public_dir',
          expected_path: expectedPath,
          actual_path: actualPath,
        });
      } else if (!existsSync(resolveContainedAsset(publicDir, actualPath))) {
        entryIssues.push({
          id: manifestEntry.id,
          field,
          issue: 'asset_file_missing',
          expected_path: expectedPath,
          actual_path: actualPath,
        });
      }
    }
    aggregateIssues.push(...entryIssues);
    if (
      entryIssues.length === 0
      && aggregateIdCounts.get(manifestEntry.id) === 1
      && manifestIdCounts.get(manifestEntry.id) === 1
    ) {
      completeAggregateTotal += 1;
    }
  }
  const sourceIssues = [
    ...duplicateIdIssues(manifestIdCounts, 'duplicate_manifest_record'),
    ...duplicateIdIssues(detailIdCounts, 'duplicate_detail_record'),
  ];
  sourceIssues.push(
    ...sortedManifest
    .filter((entry) => !String(entry.source_url || '').trim())
    .map((entry) => ({ id: entry.id, issue: 'missing_source_url' })),
  );
  sourceIssues.push(
    ...sortedManifest
    .filter((entry) => !String(entry.source_locator || '').trim())
    .map((entry) => ({ id: entry.id, issue: 'missing_source_locator' })),
  );
  sourceIssues.push(
    ...sortedManifest
      .filter((entry) => !detailIds.has(entry.id))
      .map((entry) => ({ id: entry.id, issue: 'manifest_id_without_detail' })),
  );
  const strictIssues = [];
  const visualIssues = [];
  const paperAlignmentIssues = [];
  const paperAlignmentCandidateIds = new Set();
  for (const entry of sortedManifest) {
    for (const language of ['en', 'zh']) {
      if (entry.strict_validation?.[language] !== 'passed') {
        strictIssues.push({
          id: entry.id,
          language,
          issue: 'strict_validation_not_passed',
        });
      }
    }
    if (entry.review_status !== 'visually_reviewed') {
      visualIssues.push({ id: entry.id, issue: 'visual_review_not_passed' });
    }
    if (entry.paper_alignment_review?.status !== 'passed') {
      paperAlignmentIssues.push({
        id: entry.id,
        issue: 'paper_alignment_review_not_passed',
      });
    } else {
      const sourceUrl = String(entry.source_url || '').trim();
      const sourceLocator = String(entry.source_locator || '').trim();
      if (!sourceUrl) {
        paperAlignmentIssues.push({
          id: entry.id,
          issue: 'paper_alignment_source_url_missing',
        });
      } else if (entry.paper_alignment_review.source_url !== entry.source_url) {
        paperAlignmentIssues.push({
          id: entry.id,
          issue: 'paper_alignment_source_url_mismatch',
          expected_source_url: entry.source_url,
          reviewed_source_url: entry.paper_alignment_review.source_url ?? null,
        });
      }
      if (!sourceLocator) {
        paperAlignmentIssues.push({
          id: entry.id,
          issue: 'paper_alignment_source_locator_missing',
        });
      } else if (entry.paper_alignment_review.source_locator !== entry.source_locator) {
        paperAlignmentIssues.push({
          id: entry.id,
          issue: 'paper_alignment_source_mismatch',
          expected_source_locator: entry.source_locator,
          reviewed_source_locator: entry.paper_alignment_review.source_locator ?? null,
        });
      }
      if (
        sourceUrl
        && sourceLocator
        && entry.paper_alignment_review.source_url === entry.source_url
        && entry.paper_alignment_review.source_locator === entry.source_locator
      ) {
        paperAlignmentCandidateIds.add(entry.id);
      }
    }
  }
  const reviewIssues = [
    ...strictIssues,
    ...visualIssues,
    ...paperAlignmentIssues,
  ];
  const missingIds = [];
  const brokenReferences = [];
  const languageIssues = [];
  const svgIssues = [];
  const dataConsistencyIssues = [];
  const topologyIssues = [];
  const assetsWithoutManifestIds = new Set(
    [
      ...aggregate
        .filter((entry) => !manifestIds.has(entry.id))
        .filter((entry) => (
          REQUIRED_ASSET_FIELDS.some((field) => Boolean(entry[field]))
        ))
        .map((entry) => entry.id),
      ...[...physicalDrawioIds].filter((id) => !manifestIds.has(id)),
    ],
  );
  let completeBilingualTotal = 0;

  for (const { detail, id } of details) {
    const manifestEntry = manifestById.get(id);
    const missingFields = REQUIRED_ASSET_FIELDS.filter((field) => !detail[field]);
    const hasStarted = manifestIds.has(id)
      || physicalDrawioIds.has(id)
      || REQUIRED_ASSET_FIELDS.some((field) => Boolean(detail[field]));
    if (hasStarted && !manifestIds.has(id)) {
      assetsWithoutManifestIds.add(id);
    }
    const missingFiles = REQUIRED_ASSET_FIELDS
      .filter((field) => detail[field])
      .flatMap((field) => {
        const assetPath = resolveContainedAsset(publicDir, detail[field]);
        if (!assetPath) {
          return [{
            field,
            path: detail[field],
            issue: 'asset_path_outside_public_dir',
          }];
        }
        return existsSync(assetPath) ? [] : [{ field, path: detail[field] }];
      });

    if (!manifestIds.has(id) || missingFields.length > 0) {
      missingIds.push(id);
    }
    if (hasStarted) {
      for (const field of missingFields) {
        brokenReferences.push({
          id,
          field,
          path: null,
          issue: 'missing_asset_field',
        });
      }
    }
    for (const missingFile of missingFiles) {
      brokenReferences.push({ id, ...missingFile });
    }
    const entryConsistencyIssues = [];
    if (manifestEntry) {
      for (const field of REQUIRED_ASSET_FIELDS) {
        const expectedPath = manifestEntry.assets?.[field] ?? null;
        const actualPath = detail[field] || null;
        if (expectedPath && actualPath && expectedPath !== actualPath) {
          entryConsistencyIssues.push({
            id,
            field,
            issue: 'detail_asset_path_mismatch',
            expected_path: expectedPath,
            actual_path: actualPath,
          });
        }
      }
    }
    dataConsistencyIssues.push(...entryConsistencyIssues);
    const archByLanguage = {};
    for (const language of ['en', 'zh']) {
      const field = `drawio_arch_${language}`;
      if (!detail[field]) continue;
      const archPath = resolveContainedAsset(publicDir, detail[field]);
      if (archPath && existsSync(archPath)) {
        archByLanguage[language] = readJson(archPath);
      }
    }
    if (archByLanguage.en && archByLanguage.zh) {
      if (
        topologySignature(archByLanguage.en.nodes, ['id', 'type'])
        !== topologySignature(archByLanguage.zh.nodes, ['id', 'type'])
      ) {
        topologyIssues.push({
          id,
          issue: 'bilingual_node_topology_mismatch',
        });
      }
      if (
        topologySignature(archByLanguage.en.edges, ['from', 'to', 'type'])
        !== topologySignature(archByLanguage.zh.edges, ['from', 'to', 'type'])
      ) {
        topologyIssues.push({
          id,
          issue: 'bilingual_edge_topology_mismatch',
        });
      }
      topologyIssues.push(
        ...architectureTopologyIssues(id, 'en', archByLanguage.en),
        ...architectureTopologyIssues(id, 'zh', archByLanguage.zh),
      );
      topologyIssues.push(...decisionTopologyIssues(id, archByLanguage.en));
      for (const language of ['en', 'zh']) {
        for (const node of archByLanguage[language].nodes || []) {
          if (!String(node.label || '').trim()) {
            languageIssues.push({
              id,
              language,
              field: `node:${node.id}`,
              issue: 'missing_node_label',
            });
          }
        }
      }
      const englishNodeText = archByLanguage.en.nodes
        ?.map((node) => node.label || '')
        .join(' ') || '';
      if (/[㐀-鿿]/u.test(englishNodeText)) {
        languageIssues.push({
          id,
          language: 'en',
          field: 'nodes',
          issue: 'contains_chinese_node_text',
        });
      }
      const exemptNodeIds = new Set(
        manifestEntry?.language_exempt_node_ids || [],
      );
      const translatableNodes = (archByLanguage.zh.nodes || [])
        .filter((node) => String(node.label || '').trim())
        .filter((node) => !isLanguageExemptNode(node, exemptNodeIds));
      const translatedNodes = translatableNodes
        .filter((node) => /[㐀-鿿]/u.test(String(node.label || '')));
      if (translatableNodes.length > 0 && translatedNodes.length === 0) {
        languageIssues.push({
          id,
          language: 'zh',
          field: 'nodes',
          issue: 'missing_chinese_node_text',
        });
      } else {
        for (const node of translatableNodes) {
          if (!/[㐀-鿿]/u.test(String(node.label || ''))) {
            languageIssues.push({
              id,
              language: 'zh',
              field: `node:${node.id}`,
              issue: 'untranslated_chinese_node_label',
            });
          }
        }
      }
      const enLabeledEdgeCounts = labeledEdgeCounts(archByLanguage.en.edges);
      const zhLabeledEdgeCounts = labeledEdgeCounts(archByLanguage.zh.edges);
      for (const [key, enCount] of enLabeledEdgeCounts) {
        if ((zhLabeledEdgeCounts.get(key) || 0) !== enCount) {
          languageIssues.push({
            id,
            language: 'zh',
            field: `edge:${key}`,
            issue: 'bilingual_edge_label_presence_mismatch',
          });
        }
      }
      for (const edge of archByLanguage.en.edges || []) {
        if (/[㐀-鿿]/u.test(String(edge.label || ''))) {
          languageIssues.push({
            id,
            language: 'en',
            field: `edge:${edgeTopologyKey(edge)}`,
            issue: 'contains_chinese_edge_text',
          });
        }
      }
      for (const edge of archByLanguage.zh.edges || []) {
        const label = String(edge.label || '').trim();
        if (
          label
          && /\p{L}/u.test(label)
          && !/[㐀-鿿]/u.test(label)
          && !isTechnicalIdentifierLabel(label)
        ) {
          languageIssues.push({
            id,
            language: 'zh',
            field: `edge:${edgeTopologyKey(edge)}`,
            issue: 'untranslated_chinese_edge_label',
          });
        }
      }
    }
    if (detail.drawio_spec_zh) {
      const zhSpecPath = resolveContainedAsset(publicDir, detail.drawio_spec_zh);
      if (zhSpecPath && existsSync(zhSpecPath)) {
        const zhSpec = readFileSync(zhSpecPath, 'utf8');
        for (const field of ['title', 'description', 'legend']) {
          if (!/[\u3400-\u9fff]/u.test(readMetaField(zhSpec, field))) {
            languageIssues.push({
              id,
              language: 'zh',
              field,
              issue: 'missing_chinese_text',
            });
          }
        }
      }
    }
    if (detail.drawio_spec_en) {
      const enSpecPath = resolveContainedAsset(publicDir, detail.drawio_spec_en);
      if (enSpecPath && existsSync(enSpecPath)) {
        const enSpec = readFileSync(enSpecPath, 'utf8');
        for (const field of ['title', 'description', 'legend']) {
          if (/[\u3400-\u9fff]/u.test(readMetaField(enSpec, field))) {
            languageIssues.push({
              id,
              language: 'en',
              field,
              issue: 'contains_chinese_text',
            });
          }
        }
      }
    }
    for (const language of ['en', 'zh']) {
      const field = `drawio_flowchart_${language}`;
      if (!detail[field]) continue;
      const svgPath = resolveContainedAsset(publicDir, detail[field]);
      if (!svgPath || !existsSync(svgPath)) continue;
      const svg = readFileSync(svgPath, 'utf8');
      if (!/<svg\b/iu.test(svg)) {
        svgIssues.push({ id, language, issue: 'invalid_svg_root' });
      }
      if (svg.includes('light-dark(')) {
        svgIssues.push({ id, language, issue: 'adaptive_color_scheme' });
      }
      if (
        /(?:<(?:(?:[A-Za-z_][\w.-]*):)?(?:merror|mjx-merror)\b|<[A-Za-z][^>]*\bdata-mml-node\s*=\s*["']merror["']|<[A-Za-z][^>]*\bdata-mjx-error\s*=|<[A-Za-z][^>]*\bclass\s*=\s*["'][^"']*\bkatex-error\b)/iu.test(svg)
      ) {
        svgIssues.push({ id, language, issue: 'formula_render_error' });
      }
      const reviewedForeignObject = svg.includes('<foreignObject')
        && manifestById.get(id)?.svg_foreign_object_reviewed?.[language] === true;
      if (
        svg.includes('Text is not SVG - cannot display')
        && !reviewedForeignObject
      ) {
        svgIssues.push({ id, language, issue: 'drawio_fallback_text' });
      }
    }
    if (
      manifestIds.has(id)
      && manifestIdCounts.get(id) === 1
      && detailIdCounts.get(id) === 1
      && missingFields.length === 0
      && missingFiles.length === 0
      && entryConsistencyIssues.length === 0
    ) {
      completeBilingualTotal += 1;
    }
  }
  sourceIssues.push(
    ...[...assetsWithoutManifestIds]
      .sort(compareText)
      .map((id) => ({ id, issue: 'assets_without_manifest_record' })),
  );

  const pngIssues = [];
  const pngCompleteIds = new Set();
  for (const id of [...allIds].sort(compareText)) {
    let complete = true;
    for (const language of ['en', 'zh']) {
      const assetPath = `drawio/${id}/${id}.${language}.png`;
      const resolvedPath = resolveContainedAsset(publicDir, assetPath);
      if (!resolvedPath || !existsSync(resolvedPath)) {
        complete = false;
        pngIssues.push({
          id,
          language,
          path: assetPath,
          issue: 'png_file_missing',
        });
      }
    }
    if (complete) pngCompleteIds.add(id);
  }
  const paperBlockingIds = new Set([
    ...paperAlignmentIssues,
    ...sourceIssues,
  ].map((issue) => issue.id));
  const paperAlignedTotal = [...paperAlignmentCandidateIds]
    .filter((id) => manifestIdCounts.get(id) === 1)
    .filter((id) => aggregateIdCounts.get(id) === 1)
    .filter((id) => detailIdCounts.get(id) === 1)
    .filter((id) => !paperBlockingIds.has(id))
    .length;

  const summary = {
    detail_total: detailFiles.length,
    aggregate_total: rawAggregate.length,
    manifest_total: rawManifest.length,
    complete_bilingual_total: completeBilingualTotal,
    complete_aggregate_total: completeAggregateTotal,
    id_sets_equal: idSetIssues.length === 0,
    id_set_issues: idSetIssues,
    png_complete_total: pngCompleteIds.size,
    png_issues: pngIssues,
    strict_valid_total: manifest.filter(
      (entry) => entry.strict_validation?.en === 'passed'
        && entry.strict_validation?.zh === 'passed',
    ).length,
    visually_reviewed_total: manifest.filter(
      (entry) => entry.review_status === 'visually_reviewed',
    ).length,
    paper_aligned_total: paperAlignedTotal,
    missing_ids: [...new Set(missingIds)].sort(),
    broken_references: brokenReferences,
    language_issues: languageIssues,
    source_issues: sourceIssues,
    svg_issues: svgIssues,
    aggregate_issues: aggregateIssues,
    data_consistency_issues: dataConsistencyIssues,
    topology_issues: topologyIssues,
    strict_issues: strictIssues,
    visual_issues: visualIssues,
    paper_alignment_issues: paperAlignmentIssues,
    review_issues: reviewIssues,
  };
  summary.unresolved_queue = buildUnresolvedQueue({
    allIds: queueIds,
    manifestById,
    idSetIssues,
    completeCoreAssetIds,
    physicalDrawioIds,
    pngCompleteIds,
    pngIssues,
    brokenReferences,
    aggregateIssues,
    dataConsistencyIssues,
    sourceIssues,
    strictIssues,
    visualIssues,
    paperAlignmentIssues,
    languageIssues,
    svgIssues,
    topologyIssues,
  });
  return summary;
}

function isPathContained(base, target) {
  const relativePath = relative(base, target);
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(relativePath)
  );
}

function resolveQueueReportPath(root, requestedPath, extension) {
  if (
    typeof requestedPath !== 'string'
    || !requestedPath.trim()
    || isAbsolute(requestedPath)
  ) {
    throw new Error('Queue report path must be a non-empty repository-relative path.');
  }
  const reportDir = resolve(root, 'docs/reports');
  const target = resolve(root, requestedPath);
  if (!isPathContained(reportDir, target)) {
    throw new Error('Queue reports may only be written under docs/reports.');
  }
  if (extname(target) !== extension) {
    throw new Error(`Queue report must use the ${extension} extension.`);
  }
  if (!existsSync(dirname(target))) {
    throw new Error('Queue report parent directory must already exist.');
  }
  const realRoot = realpathSync(root);
  const realReportDir = realpathSync(reportDir);
  const realParent = realpathSync(dirname(target));
  if (
    !isPathContained(realRoot, realReportDir)
    || !isPathContained(realReportDir, realParent)
  ) {
    throw new Error('Queue report path resolves outside the repository reports directory.');
  }
  try {
    if (lstatSync(target).isSymbolicLink()) {
      throw new Error('Queue report target must not be a symbolic link.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return target;
}

function writeQueueReport(path, contents) {
  const flags = constants.O_WRONLY
    | constants.O_CREAT
    | constants.O_TRUNC
    | (constants.O_NOFOLLOW || 0);
  const descriptor = openSync(path, flags, 0o644);
  try {
    writeFileSync(descriptor, contents, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function markdownCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll(/\r?\n/gu, ' ');
}

function formatQueueMarkdown(summary) {
  const lines = [
    '# Build Process Paper Alignment Queue',
    '',
    'This report is generated from the Build Process audit. Do not edit it by hand.',
    '',
    `- Catalog benchmarks: ${summary.aggregate_total}`,
    `- Complete bilingual core bundles: ${summary.complete_bilingual_total}`,
    `- Complete bilingual PNG bundles: ${summary.png_complete_total}`,
    `- Strict validation passed: ${summary.strict_valid_total}`,
    `- Visual review passed: ${summary.visually_reviewed_total}`,
    `- Paper alignment passed: ${summary.paper_aligned_total}`,
    `- Unresolved benchmarks: ${summary.unresolved_queue.length}`,
    '',
    '| ID | Failing gates | Source | Next action |',
    '| --- | --- | --- | --- |',
  ];
  for (const entry of summary.unresolved_queue) {
    const failingGates = Object.entries(entry.gates)
      .filter(([, passed]) => !passed)
      .map(([gate]) => gate)
      .join(', ');
    const source = [entry.source_type, entry.source_url, entry.source_locator]
      .filter(Boolean)
      .join(' · ');
    lines.push(
      `| ${markdownCell(entry.id)} | ${markdownCell(failingGates)} | ${markdownCell(source)} | ${markdownCell(entry.next_action)} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function writeQueueReports(args, summary) {
  const queueJsonPath = args.queueJson
    ? resolveQueueReportPath(args.root, args.queueJson, '.json')
    : null;
  const queueMarkdownPath = args.queueMarkdown
    ? resolveQueueReportPath(args.root, args.queueMarkdown, '.md')
    : null;
  if (queueJsonPath) {
    writeQueueReport(
      queueJsonPath,
      `${JSON.stringify(summary.unresolved_queue, null, 2)}\n`,
    );
  }
  if (queueMarkdownPath) {
    writeQueueReport(queueMarkdownPath, formatQueueMarkdown(summary));
  }
}

function printHumanSummary(summary) {
  console.log(`Details: ${summary.detail_total}`);
  console.log(`Aggregate: ${summary.aggregate_total}`);
  console.log(`Manifest: ${summary.manifest_total}`);
  console.log(`Complete bilingual: ${summary.complete_bilingual_total}`);
  console.log(`Complete aggregate: ${summary.complete_aggregate_total}`);
  console.log(`ID sets equal: ${summary.id_sets_equal}`);
  console.log(`PNG complete: ${summary.png_complete_total}`);
  console.log(`Strict valid: ${summary.strict_valid_total}`);
  console.log(`Visually reviewed: ${summary.visually_reviewed_total}`);
  console.log(`Paper aligned: ${summary.paper_aligned_total}`);
  console.log(`Missing: ${summary.missing_ids.length}`);
  console.log(`Broken references: ${summary.broken_references.length}`);
  console.log(`Language issues: ${summary.language_issues.length}`);
  console.log(`Source issues: ${summary.source_issues.length}`);
  console.log(`SVG issues: ${summary.svg_issues.length}`);
  console.log(`Aggregate issues: ${summary.aggregate_issues.length}`);
  console.log(`Data consistency issues: ${summary.data_consistency_issues.length}`);
  console.log(`Topology issues: ${summary.topology_issues.length}`);
  console.log(`Review issues: ${summary.review_issues.length}`);
  console.log(`Queue: ${summary.unresolved_queue.length}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = auditBuildProcessAssets(args.root);
  writeQueueReports(args, summary);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printHumanSummary(summary);
  }

  const isIncomplete = summary.complete_bilingual_total !== summary.detail_total;
  const hasBrokenReferences = summary.broken_references.length > 0;
  const hasSourceIssues = summary.source_issues.length > 0;
  const hasLanguageIssues = summary.language_issues.length > 0;
  const hasSvgIssues = summary.svg_issues.length > 0;
  const hasAggregateIssues = summary.aggregate_issues.length > 0;
  const hasDataConsistencyIssues = summary.data_consistency_issues.length > 0;
  const hasTopologyIssues = summary.topology_issues.length > 0;
  const hasReviewIssues = summary.review_issues.length > 0;
  const hasIdSetIssues = summary.id_set_issues.length > 0;
  const hasPngIssues = summary.png_issues.length > 0;
  if (
    hasIdSetIssues
    || hasPngIssues
    || hasBrokenReferences
    || hasSourceIssues
    || hasLanguageIssues
    || hasSvgIssues
    || hasAggregateIssues
    || hasDataConsistencyIssues
    || hasTopologyIssues
    || hasReviewIssues
    || (isIncomplete && !args.allowIncomplete)
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
