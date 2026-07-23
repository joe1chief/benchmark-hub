import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const reviewBatch = '2026-07-18-importer57';
const reviewFixture = JSON.parse(readFileSync(
  join(root, 'scripts/benchmark_build_process/fixtures/importer57_review.json'),
  'utf8',
));
const benchmarkIds = reviewFixture.benchmarks.map(record => record.id).sort();
const fixtureById = new Map(reviewFixture.benchmarks.map(record => [record.id, record]));
const semanticBoundaries = new Map(Object.entries(reviewFixture.semantic_boundaries));
const expectedLanguageExemptions = {
  CruxEval: ['code_generator', 'input_task', 'output_task'],
  LiveDRBench: ['build_scifacts', 'build_novelds', 'release'],
  LiveMathBench: ['cnmo', 'ccee', 'amc', 'wlpmc', 'full'],
  MBPP: ['full_split', 'sanitized_split', 'release'],
  MRCR: ['release'],
  'MedCalc-Bench': ['open_patients', 'pinned_release'],
  OctoBench: ['reference_rollouts'],
  Oolong: ['synth_split', 'synth_final', 'crd3', 'stats_source', 'dnd', 'toy'],
  'Spider_2.0': ['query_sources', 'retained', 'agentic_release', 'lite_release', 'snow_release'],
};

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(join(publicDir, 'benchmarks_build_process_manifest.json'));
const catalog = readJson(join(publicDir, 'benchmarks.json'));
const manifestById = new Map(manifest.map(record => [record.id, record]));
const catalogById = new Map(catalog.map(record => [record.id, record]));

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', `${path} signature`);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', `${path} IHDR`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function svgDimensions(path) {
  const svg = readFileSync(path, 'utf8');
  const viewBox = svg.match(/\bviewBox="([^"]+)"/u)?.[1]
    ?.trim().split(/\s+/u).map(Number);
  assert.equal(viewBox?.length, 4, `${path} viewBox`);
  assert.ok(viewBox.every(Number.isFinite), `${path} numeric viewBox`);
  return { width: viewBox[2], height: viewBox[3] };
}

function readMetaField(spec, field) {
  const lines = spec.split(/\r?\n/u);
  const index = lines.findIndex(line => line.startsWith(`  ${field}:`));
  assert.notEqual(index, -1, `missing meta.${field}`);
  const inline = lines[index].slice(field.length + 3).trim();
  if (!/^[>|][-+]?$/u.test(inline)) return inline.replace(/^['"]|['"]$/gu, '');
  const values = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line && !/^\s{4,}/u.test(line)) break;
    values.push(line.trim());
  }
  return values.join(' ').replace(/\s+/gu, ' ').trim();
}

function auditSummary() {
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/benchmark_build_process/audit_build_process_assets.mjs'), '--json', '--allow-incomplete'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(result.signal, null, result.stderr);
  assert.ok(result.stdout.trim(), result.stderr || 'audit did not emit JSON');
  return JSON.parse(result.stdout);
}

test('locks the evidence-ledger batch to the exact 57 imported benchmark ids', () => {
  assert.equal(reviewFixture.review_batch, reviewBatch);
  assert.equal(benchmarkIds.length, 57);
  assert.equal(new Set(benchmarkIds).size, 57);
  assert.deepEqual(
    manifest.filter(record => record.review_batch === reviewBatch).map(record => record.id).sort(),
    benchmarkIds,
  );
});

test('locks exact primary sources, source types, and full locators in an independent fixture', () => {
  for (const id of benchmarkIds) {
    const expected = fixtureById.get(id);
    const entry = manifestById.get(id);
    assert.ok(entry, `${id} manifest record`);
    assert.equal(entry.source_url, expected.source_url, `${id} primary source`);
    assert.equal(entry.source_type, expected.source_type, `${id} source type`);
    assert.equal(entry.source_locator, expected.source_locator, `${id} exact source locator`);
    for (const fact of expected.locator_includes) {
      assert.ok(entry.source_locator.includes(fact), `${id} locator fact: ${fact}`);
    }
    assert.equal(entry.spec_authority, 'checked_in', `${id} checked-in spec authority`);
    for (const field of ['diagram', 'diagram_labels_en', 'diagram_labels_zh', 'diagram_types']) {
      assert.equal(Object.hasOwn(entry, field), false, `${id} stale ${field}`);
    }
    assert.equal(entry.paper_alignment_review?.source_url, expected.source_url, `${id} reviewed URL`);
    assert.equal(entry.paper_alignment_review?.source_locator, expected.source_locator, `${id} reviewed locator`);
  }
});

test('keeps fallback catalog fields consistent with final details', () => {
  const fallbackFields = [
    'paper_url',
    'arxiv_pdf_url',
    'pdf_cdn_url',
    'homepage',
    'build_method',
    'build_method_en',
  ];
  for (const id of benchmarkIds) {
    const detail = readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
    const aggregate = catalogById.get(id);
    const entry = manifestById.get(id);
    assert.ok(aggregate, `${id} catalog record`);
    assert.ok(entry, `${id} manifest record`);
    if (id === 'WorldTravel') {
      assert.equal(detail.homepage, '', 'WorldTravel must not reuse the unrelated ccbench.org homepage');
    }
    for (const field of fallbackFields) {
      const expected = detail[field] ?? '';
      assert.deepEqual(aggregate[field] ?? '', expected, `${id}.${field}`);
    }
  }
});

test('records strict, visual, and paper-alignment approval with measured native assets', () => {
  for (const id of benchmarkIds) {
    const entry = manifestById.get(id);
    assert.deepEqual(entry.strict_validation, { en: 'passed', zh: 'passed' }, `${id} strict gate`);
    assert.equal(entry.review_status, 'visually_reviewed', `${id} visual gate`);
    assert.equal(entry.visual_review?.reviewed_at, '2026-07-18', `${id} visual date`);
    assert.equal(entry.paper_alignment_review?.status, 'passed', `${id} paper gate`);
    assert.equal(entry.paper_alignment_review?.reviewed_at, '2026-07-18', `${id} paper date`);
    assert.equal(entry.paper_alignment_review?.source_url, entry.source_url, `${id} reviewed URL`);
    assert.equal(entry.paper_alignment_review?.source_locator, entry.source_locator, `${id} reviewed locator`);
    assert.deepEqual(
      entry.svg_foreign_object_reviewed,
      { en: false, zh: false },
      `${id} uses native SVG text rather than reviewed foreignObject fallback`,
    );

    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const pngPath = `${base}.png`;
      const svgPath = `${base}.svg`;
      assert.ok(existsSync(pngPath), `${id}.${language} PNG`);
      assert.ok(existsSync(svgPath), `${id}.${language} SVG`);
      const png = pngDimensions(pngPath);
      const svg = svgDimensions(svgPath);
      assert.ok(png.width > 0 && png.height > 0, `${id}.${language} PNG dimensions`);
      assert.ok(svg.width > 0 && svg.height > 0, `${id}.${language} SVG dimensions`);
      assert.deepEqual(entry.visual_review?.dimensions?.png?.[language], png, `${id}.${language} recorded PNG size`);
      assert.deepEqual(entry.visual_review?.dimensions?.svg?.[language], svg, `${id}.${language} recorded SVG size`);
      const svgText = readFileSync(svgPath, 'utf8');
      assert.doesNotMatch(svgText, /<foreignObject|light-dark\(|Text is not SVG - cannot display/iu, `${id}.${language} native fixed-light SVG`);
    }

    assert.match(entry.visual_review?.artifact ?? '', /Draw\.io Desktop.*PNG.*SVG/iu, `${id} reviewed artifacts`);
    assert.match(entry.visual_review?.result ?? '', /native[- ]text.*fixed[- ]light.*(?:no clipping|unclipped)/iu, `${id} visual evidence`);
    assert.doesNotMatch(entry.visual_review?.artifact ?? '', /DOM|page check/iu, `${id} must not claim an unperformed DOM review`);
  }
});

test('partitions construction and evaluation steps across every final architecture node', () => {
  for (const id of benchmarkIds) {
    const entry = manifestById.get(id);
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const arch = readJson(`${base}.arch.json`);
      const labelsById = new Map(arch.nodes.map(node => [
        node.id,
        String(node.label).replace(/\s*\n\s*/gu, ' · ').trim(),
      ]));
      const boundary = semanticBoundaries.get(id);
      const constructionIds = boundary?.construction_node_ids
        ?? arch.nodes.map(node => node.id);
      const evaluationIds = boundary?.evaluation_node_ids ?? [];
      const expectedConstruction = constructionIds.map(nodeId => labelsById.get(nodeId));
      const expectedEvaluation = evaluationIds.map(nodeId => labelsById.get(nodeId));
      assert.ok(expectedConstruction.every(Boolean), `${id}.${language} construction node ids`);
      assert.ok(expectedEvaluation.every(Boolean), `${id}.${language} evaluation node ids`);
      assert.deepEqual(
        entry[`construction_steps_${language}`],
        expectedConstruction,
        `${id}.${language} construction boundary`,
      );
      assert.deepEqual(
        entry[`evaluation_steps_${language}`],
        expectedEvaluation,
        `${id}.${language} evaluation boundary`,
      );
      assert.deepEqual(
        new Set([...constructionIds, ...evaluationIds]),
        new Set(arch.nodes.map(node => node.id)),
        `${id}.${language} node coverage`,
      );
      assert.equal(
        constructionIds.length + evaluationIds.length,
        arch.nodes.length,
        `${id}.${language} no duplicate boundary nodes`,
      );
    }
  }
});

test('retains bilingual spec evidence summaries after semantic partitioning', () => {
  for (const id of benchmarkIds) {
    const entry = manifestById.get(id);
    for (const language of ['en', 'zh']) {
      const spec = readFileSync(
        join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
        'utf8',
      );
      const evidence = entry[`evidence_summary_${language}`];
      assert.ok(evidence.includes(readMetaField(spec, 'description')), `${id}.${language} description evidence`);
      assert.ok(evidence.includes(readMetaField(spec, 'legend')), `${id}.${language} legend evidence`);
    }
  }
});

test('removes publication-only review notes from all 57 fallback catalog records', () => {
  const generic = /Published bilingual Draw\.io package synchronized|Publication alone is not formal/iu;
  for (const id of benchmarkIds) {
    const entry = manifestById.get(id);
    const aggregate = catalogById.get(id);
    const detail = readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
    assert.doesNotMatch(aggregate.drawio_review_note ?? '', generic, `${id} fallback review note`);
    assert.equal(aggregate.drawio_review_note, detail.drawio_review_note, `${id} review note sync`);
    assert.doesNotMatch(aggregate.drawio_review_note ?? '', /\.\./u, `${id} duplicate period`);
    assert.doesNotMatch(entry.evidence_summary_en ?? '', generic, `${id} English evidence`);
    assert.doesNotMatch(entry.evidence_summary_zh ?? '', generic, `${id} Chinese evidence`);
  }
});

test('does not exempt MathBench labels that now carry Chinese semantics', () => {
  assert.deepEqual(manifestById.get('MathBench').language_exempt_node_ids ?? [], []);
});

test('limits Chinese-language exemptions to exact proper-noun and identifier nodes', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      manifestById.get(id).language_exempt_node_ids ?? [],
      expectedLanguageExemptions[id] ?? [],
      `${id} exact language exemption set`,
    );
  }
});

test('leaves no target-specific audit issue or queue item while preserving the remaining site queue', () => {
  const summary = auditSummary();
  const targetIds = new Set(benchmarkIds);
  const issueArrays = [
    'id_set_issues',
    'png_issues',
    'broken_references',
    'language_issues',
    'source_issues',
    'svg_issues',
    'aggregate_issues',
    'data_consistency_issues',
    'topology_issues',
    'strict_issues',
    'visual_issues',
    'paper_alignment_issues',
    'review_issues',
  ];
  for (const field of issueArrays) {
    const targetIssues = (summary[field] ?? []).filter(issue => targetIds.has(issue.id));
    assert.deepEqual(targetIssues, [], `${field}: ${JSON.stringify(targetIssues)}`);
  }
  assert.deepEqual(
    summary.unresolved_queue.filter(record => targetIds.has(record.id)),
    [],
    'all 57 reviewed importer records must be absent from the unresolved queue',
  );
  assert.ok(
    summary.unresolved_queue.some(record => !targetIds.has(record.id)),
    'the site-wide queue must remain non-zero until the other benchmark batches are reviewed',
  );
});
