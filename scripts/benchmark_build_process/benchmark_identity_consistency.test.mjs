import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');

const BENCHMARK_ID_ALIASES = {
  AlignmentBench: 'AlignBench',
  AlimentBench: 'AlignBench',
  InfoVQA: 'InfographicVQA',
  "Scientists'_First_Exam": 'SFE',
  'Humanity’s_Last_Exam_(HLE)': 'HLE',
  ComplexFunBench: 'ComplexFuncBench_Audio',
};

const BENCHMARK_DISPLAY_ALIASES = {
  'Humanity’s Last Exam (HLE)': 'HLE',
};

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const sorted = values => [...values].sort((left, right) => left.localeCompare(right));

test('keeps benchmark identities canonical across every published surface', () => {
  const catalog = readJson(join(publicDir, 'benchmarks.json'));
  const manifest = readJson(join(publicDir, 'benchmarks_build_process_manifest.json'));
  const detailDir = join(publicDir, 'benchmarks_detail');
  const drawioDir = join(publicDir, 'drawio');

  const detailFiles = readdirSync(detailDir).filter(file => file.endsWith('.json'));
  const details = detailFiles.map(file => ({
    file,
    record: readJson(join(detailDir, file)),
  }));
  for (const { file, record } of details) {
    assert.equal(file, `${record.id}.json`, `detail filename must match its id: ${file}`);
  }

  const catalogIds = catalog.map(record => record.id);
  const detailIds = details.map(({ record }) => record.id);
  const manifestIds = manifest.map(record => record.id);
  const drawioIds = readdirSync(drawioDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  assert.equal(new Set(catalogIds).size, catalogIds.length, 'catalog ids must be unique');
  assert.equal(new Set(detailIds).size, detailIds.length, 'detail ids must be unique');
  assert.equal(new Set(manifestIds).size, manifestIds.length, 'manifest ids must be unique');
  assert.deepEqual(sorted(detailIds), sorted(catalogIds), 'detail ids must equal catalog ids');
  assert.deepEqual(sorted(manifestIds), sorted(catalogIds), 'manifest ids must equal catalog ids');
  assert.deepEqual(sorted(drawioIds), sorted(catalogIds), 'drawio ids must equal catalog ids');
  assert.equal(catalog.length, 609, 'identity normalization must leave 609 benchmarks');

  const catalogIdSet = new Set(catalogIds);
  const catalogIdsByName = new Map();
  for (const record of catalog) {
    const ids = catalogIdsByName.get(record.name) ?? [];
    ids.push(record.id);
    catalogIdsByName.set(record.name, ids);
  }

  const canonicalizeRelatedReference = reference => {
    const aliasedId = BENCHMARK_ID_ALIASES[reference] ?? BENCHMARK_DISPLAY_ALIASES[reference];
    if (aliasedId) return aliasedId;
    if (catalogIdSet.has(reference)) return reference;

    const matchingIds = catalogIdsByName.get(reference) ?? [];
    assert.equal(
      matchingIds.length,
      1,
      `related benchmark reference must resolve to one catalog id or unique display name: ${reference}`,
    );
    return matchingIds[0];
  };

  for (const [alias, canonical] of Object.entries(BENCHMARK_ID_ALIASES)) {
    assert.ok(!catalogIdSet.has(alias), `legacy id must not remain published: ${alias}`);
    assert.ok(catalogIdSet.has(canonical), `canonical id must remain published: ${canonical}`);
  }

  const publishedRecords = [...catalog, ...details.map(({ record }) => record)];
  for (const alias of Object.keys(BENCHMARK_DISPLAY_ALIASES)) {
    const referencingIds = publishedRecords
      .filter(record => (record.related_benchmarks ?? []).includes(alias))
      .map(record => record.id);
    assert.deepEqual(
      referencingIds,
      [],
      `legacy display alias must not remain in related benchmarks: ${alias}`,
    );
  }

  for (const record of publishedRecords) {
    const related = record.related_benchmarks ?? [];
    for (const alias of Object.keys(BENCHMARK_ID_ALIASES)) {
      assert.ok(!related.includes(alias), `${record.id} must not reference legacy id ${alias}`);
    }
    for (const alias of Object.keys(BENCHMARK_DISPLAY_ALIASES)) {
      assert.ok(!related.includes(alias), `${record.id} must not reference legacy display alias ${alias}`);
    }

    const canonicalRelated = related.map(canonicalizeRelatedReference);
    assert.deepEqual(
      canonicalRelated,
      [...new Set(canonicalRelated)],
      `${record.id} related benchmarks must be deduplicated after canonicalization`,
    );
    assert.ok(!canonicalRelated.includes(record.id), `${record.id} must not relate to itself`);
  }

  const seoDescription = readFileSync(join(root, 'client/index.html'), 'utf8').match(
    /<meta name="description" content="(\d+) 个大模型评测基准/u,
  );
  assert.ok(seoDescription, 'SEO description must expose the benchmark count');
  assert.equal(Number(seoDescription[1]), catalog.length, 'SEO count must equal catalog count');

  for (const language of ['en', 'zh']) {
    const svgPath = join(
      drawioDir,
      'ComplexFuncBench_Audio',
      `ComplexFuncBench_Audio.${language}.svg`,
    );
    assert.doesNotMatch(
      readFileSync(svgPath, 'utf8'),
      /light-dark\s*\(/u,
      `ComplexFuncBench_Audio ${language} SVG must use a fixed light academic palette`,
    );
  }

  const audioManifest = manifest.find(record => record.id === 'ComplexFuncBench_Audio');
  assert.ok(audioManifest, 'ComplexFuncBench_Audio manifest record must exist');
  assert.equal(audioManifest.visual_review.reviewed_at, '2026-07-18');
  assert.match(audioManifest.visual_review.artifact, /Draw\.io Desktop 30\.0\.2 PNG exports/u);
  assert.match(audioManifest.visual_review.artifact, /2445\s*[x×]\s*681/u);
  assert.match(audioManifest.visual_review.result, /2473\s*[x×]\s*709/u);
  assert.doesNotMatch(
    `${audioManifest.visual_review.artifact} ${audioManifest.visual_review.result}`,
    /DOM|2503\s*(?:x|×|by)\s*739/iu,
    'ComplexFuncBench_Audio review evidence must not retain stale DOM or dimensions claims',
  );
});
