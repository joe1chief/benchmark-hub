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
  for (const [alias, canonical] of Object.entries(BENCHMARK_ID_ALIASES)) {
    assert.ok(!catalogIdSet.has(alias), `legacy id must not remain published: ${alias}`);
    assert.ok(catalogIdSet.has(canonical), `canonical id must remain published: ${canonical}`);
  }

  for (const record of [...catalog, ...details.map(({ record }) => record)]) {
    const related = record.related_benchmarks ?? [];
    assert.deepEqual(related, [...new Set(related)], `${record.id} related ids must be deduplicated`);
    assert.ok(!related.includes(record.id), `${record.id} must not relate to itself`);
    for (const alias of Object.keys(BENCHMARK_ID_ALIASES)) {
      assert.ok(!related.includes(alias), `${record.id} must not reference legacy id ${alias}`);
    }
  }

  const seoDescription = readFileSync(join(root, 'client/index.html'), 'utf8').match(
    /<meta name="description" content="(\d+) 个大模型评测基准/u,
  );
  assert.ok(seoDescription, 'SEO description must expose the benchmark count');
  assert.equal(Number(seoDescription[1]), catalog.length, 'SEO count must equal catalog count');
});
