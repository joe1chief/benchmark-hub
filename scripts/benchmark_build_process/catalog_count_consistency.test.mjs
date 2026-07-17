import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('keeps the SEO benchmark count synchronized with the catalog', () => {
  const catalog = JSON.parse(readFileSync(
    join(root, 'client/public/benchmarks.json'),
    'utf8',
  ));
  const indexHtml = readFileSync(join(root, 'client/index.html'), 'utf8');
  const seoCount = indexHtml.match(
    /<meta name="description" content="(\d+) 个大模型评测基准/u,
  );

  assert.ok(seoCount, 'client/index.html must expose the catalog count in its SEO description');
  assert.equal(Number(seoCount[1]), catalog.length);
});
