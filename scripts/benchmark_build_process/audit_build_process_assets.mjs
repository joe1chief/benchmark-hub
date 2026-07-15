#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
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

export function auditBuildProcessAssets(root) {
  const publicDir = join(root, 'client/public');
  const detailDir = join(publicDir, 'benchmarks_detail');
  const aggregatePath = join(publicDir, 'benchmarks.json');
  const manifestPath = join(publicDir, 'benchmarks_build_process_manifest.json');
  const detailFiles = readdirSync(detailDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const details = detailFiles.map((detailFile) => ({
    detailFile,
    detail: readJson(join(detailDir, detailFile)),
  }));
  const detailIds = new Set(
    details.map(({ detailFile, detail }) => (
      detail.id || basename(detailFile, '.json')
    )),
  );
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : [];
  const manifestIds = new Set(manifest.map((entry) => entry.id));
  const manifestById = new Map(manifest.map((entry) => [entry.id, entry]));
  const aggregate = existsSync(aggregatePath) ? readJson(aggregatePath) : [];
  const aggregateById = new Map(aggregate.map((entry) => [entry.id, entry]));
  const aggregateIssues = [];
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
      }
    }
    aggregateIssues.push(...entryIssues);
    if (entryIssues.length === 0) completeAggregateTotal += 1;
  }
  const sourceIssues = manifest
    .filter((entry) => !String(entry.source_locator || '').trim())
    .map((entry) => ({ id: entry.id, issue: 'missing_source_locator' }));
  sourceIssues.push(
    ...manifest
      .filter((entry) => !detailIds.has(entry.id))
      .map((entry) => ({ id: entry.id, issue: 'manifest_id_without_detail' })),
  );
  const missingIds = [];
  const brokenReferences = [];
  const languageIssues = [];
  const svgIssues = [];
  let completeBilingualTotal = 0;

  for (const { detailFile, detail } of details) {
    const id = detail.id || basename(detailFile, '.json');
    const missingFields = REQUIRED_ASSET_FIELDS.filter((field) => !detail[field]);
    const hasStarted = manifestIds.has(id)
      || REQUIRED_ASSET_FIELDS.some((field) => Boolean(detail[field]));
    const missingFiles = REQUIRED_ASSET_FIELDS
      .filter((field) => detail[field])
      .filter((field) => !existsSync(join(publicDir, detail[field])))
      .map((field) => ({ field, path: detail[field] }));

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
    if (detail.drawio_spec_zh) {
      const zhSpecPath = join(publicDir, detail.drawio_spec_zh);
      if (existsSync(zhSpecPath)) {
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
      const enSpecPath = join(publicDir, detail.drawio_spec_en);
      if (existsSync(enSpecPath)) {
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
      const svgPath = join(publicDir, detail[field]);
      if (!existsSync(svgPath)) continue;
      const svg = readFileSync(svgPath, 'utf8');
      if (!/<svg\b/iu.test(svg)) {
        svgIssues.push({ id, language, issue: 'invalid_svg_root' });
      }
      if (svg.includes('light-dark(')) {
        svgIssues.push({ id, language, issue: 'adaptive_color_scheme' });
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
      && missingFields.length === 0
      && missingFiles.length === 0
    ) {
      completeBilingualTotal += 1;
    }
  }

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
  if (
    hasBrokenReferences
    || hasSourceIssues
    || hasLanguageIssues
    || hasSvgIssues
    || hasAggregateIssues
    || (isIncomplete && !args.allowIncomplete)
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
