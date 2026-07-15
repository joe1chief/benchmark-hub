#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  basename,
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
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--allow-incomplete') {
      args.allowIncomplete = true;
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
    .map(([id, count]) => ({ id, issue, count }));
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
  const details = detailFiles.map((detailFile) => ({
    detailFile,
    detail: readJson(join(detailDir, detailFile)),
  }));
  const detailIdCounts = countIds(
    details,
    ({ detailFile, detail }) => detail.id || basename(detailFile, '.json'),
  );
  const detailIds = new Set(
    details.map(({ detailFile, detail }) => (
      detail.id || basename(detailFile, '.json')
    )),
  );
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : [];
  const manifestIdCounts = countIds(manifest);
  const manifestIds = new Set(manifest.map((entry) => entry.id));
  const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
  const aggregate = existsSync(aggregatePath) ? readJson(aggregatePath) : [];
  const aggregateIdCounts = countIds(aggregate);
  const aggregateById = new Map(aggregate.map((entry) => [entry.id, entry]));
  const physicalDrawioIds = new Set(
    existsSync(drawioDir)
      ? readdirSync(drawioDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => readdirSync(join(drawioDir, entry.name)).length > 0)
        .map((entry) => entry.name)
      : [],
  );
  const aggregateIssues = duplicateIdIssues(
    aggregateIdCounts,
    'duplicate_list_record',
  );
  let completeAggregateTotal = 0;
  for (const manifestEntry of manifest) {
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
    ...manifest
    .filter((entry) => !String(entry.source_url || '').trim())
    .map((entry) => ({ id: entry.id, issue: 'missing_source_url' })),
  );
  sourceIssues.push(
    ...manifest
    .filter((entry) => !String(entry.source_locator || '').trim())
    .map((entry) => ({ id: entry.id, issue: 'missing_source_locator' })),
  );
  sourceIssues.push(
    ...manifest
      .filter((entry) => !detailIds.has(entry.id))
      .map((entry) => ({ id: entry.id, issue: 'manifest_id_without_detail' })),
  );
  const reviewIssues = [];
  for (const entry of manifest) {
    for (const language of ['en', 'zh']) {
      if (entry.strict_validation?.[language] !== 'passed') {
        reviewIssues.push({
          id: entry.id,
          language,
          issue: 'strict_validation_not_passed',
        });
      }
    }
    if (entry.review_status !== 'visually_reviewed') {
      reviewIssues.push({ id: entry.id, issue: 'visual_review_not_passed' });
    }
    if (entry.paper_alignment_review?.status !== 'passed') {
      reviewIssues.push({
        id: entry.id,
        issue: 'paper_alignment_review_not_passed',
      });
    } else {
      if (entry.paper_alignment_review.source_url !== entry.source_url) {
        reviewIssues.push({
          id: entry.id,
          issue: 'paper_alignment_source_url_mismatch',
          expected_source_url: entry.source_url,
          reviewed_source_url: entry.paper_alignment_review.source_url ?? null,
        });
      }
      if (entry.paper_alignment_review.source_locator !== entry.source_locator) {
        reviewIssues.push({
          id: entry.id,
          issue: 'paper_alignment_source_mismatch',
          expected_source_locator: entry.source_locator,
          reviewed_source_locator: entry.paper_alignment_review.source_locator ?? null,
        });
      }
    }
  }
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

  for (const { detailFile, detail } of details) {
    const id = detail.id || basename(detailFile, '.json');
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
      .sort()
      .map((id) => ({ id, issue: 'assets_without_manifest_record' })),
  );

  return {
    detail_total: detailFiles.length,
    aggregate_total: aggregate.length,
    manifest_total: manifest.length,
    complete_bilingual_total: completeBilingualTotal,
    complete_aggregate_total: completeAggregateTotal,
    strict_valid_total: manifest.filter(
      (entry) => entry.strict_validation?.en === 'passed'
        && entry.strict_validation?.zh === 'passed',
    ).length,
    visually_reviewed_total: manifest.filter(
      (entry) => entry.review_status === 'visually_reviewed',
    ).length,
    missing_ids: [...new Set(missingIds)].sort(),
    broken_references: brokenReferences,
    language_issues: languageIssues,
    source_issues: sourceIssues,
    svg_issues: svgIssues,
    aggregate_issues: aggregateIssues,
    data_consistency_issues: dataConsistencyIssues,
    topology_issues: topologyIssues,
    review_issues: reviewIssues,
  };
}

function printHumanSummary(summary) {
  console.log(`Details: ${summary.detail_total}`);
  console.log(`Aggregate: ${summary.aggregate_total}`);
  console.log(`Manifest: ${summary.manifest_total}`);
  console.log(`Complete bilingual: ${summary.complete_bilingual_total}`);
  console.log(`Complete aggregate: ${summary.complete_aggregate_total}`);
  console.log(`Strict valid: ${summary.strict_valid_total}`);
  console.log(`Visually reviewed: ${summary.visually_reviewed_total}`);
  console.log(`Missing: ${summary.missing_ids.length}`);
  console.log(`Broken references: ${summary.broken_references.length}`);
  console.log(`Language issues: ${summary.language_issues.length}`);
  console.log(`Source issues: ${summary.source_issues.length}`);
  console.log(`SVG issues: ${summary.svg_issues.length}`);
  console.log(`Aggregate issues: ${summary.aggregate_issues.length}`);
  console.log(`Data consistency issues: ${summary.data_consistency_issues.length}`);
  console.log(`Topology issues: ${summary.topology_issues.length}`);
  console.log(`Review issues: ${summary.review_issues.length}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = auditBuildProcessAssets(args.root);
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
  if (
    hasBrokenReferences
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
