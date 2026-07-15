import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { writeFileBatchAtomically } from './atomic_file_batch.mjs';

test('writes every staged file and removes transaction artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'atomic-file-batch-success-'));
  const first = join(root, 'first.json');
  const second = join(root, 'second.json');
  writeFileSync(first, 'old-first\n');
  writeFileSync(second, 'old-second\n');

  writeFileBatchAtomically([
    { path: first, content: 'new-first\n' },
    { path: second, content: 'new-second\n' },
  ], { transactionId: 'success' });

  assert.equal(readFileSync(first, 'utf8'), 'new-first\n');
  assert.equal(readFileSync(second, 'utf8'), 'new-second\n');
  assert.deepEqual(readdirSync(root).sort(), ['first.json', 'second.json']);
});

test('rolls back every target when a commit rename fails midway', () => {
  const root = mkdtempSync(join(tmpdir(), 'atomic-file-batch-rollback-'));
  const first = join(root, 'first.json');
  const second = join(root, 'second.json');
  writeFileSync(first, 'old-first\n');
  writeFileSync(second, 'old-second\n');
  let renameCalls = 0;
  const fsOps = {
    existsSync,
    renameSync(from, to) {
      renameCalls += 1;
      if (renameCalls === 4) throw new Error('injected commit failure');
      renameSync(from, to);
    },
    unlinkSync,
    writeFileSync,
  };

  assert.throws(
    () => writeFileBatchAtomically([
      { path: first, content: 'new-first\n' },
      { path: second, content: 'new-second\n' },
    ], { fsOps, transactionId: 'rollback' }),
    /injected commit failure/u,
  );

  assert.equal(readFileSync(first, 'utf8'), 'old-first\n');
  assert.equal(readFileSync(second, 'utf8'), 'old-second\n');
  assert.deepEqual(readdirSync(root).sort(), ['first.json', 'second.json']);
});

test('reports every cleanup failure without misreporting a committed batch as rolled back', () => {
  const root = mkdtempSync(join(tmpdir(), 'atomic-file-batch-cleanup-'));
  const first = join(root, 'first.json');
  const second = join(root, 'second.json');
  writeFileSync(first, 'old-first\n');
  writeFileSync(second, 'old-second\n');
  const attemptedCleanup = [];
  const fsOps = {
    existsSync,
    renameSync,
    unlinkSync(path) {
      if (path.endsWith('.bak')) {
        attemptedCleanup.push(path);
        throw new Error(`injected cleanup failure: ${path}`);
      }
      unlinkSync(path);
    },
    writeFileSync,
  };

  const result = writeFileBatchAtomically([
    { path: first, content: 'new-first\n' },
    { path: second, content: 'new-second\n' },
  ], { fsOps, transactionId: 'cleanup' });

  assert.equal(result.committed, true);
  assert.equal(result.cleanupErrors.length, 2);
  assert.equal(attemptedCleanup.length, 2);
  assert.equal(readFileSync(first, 'utf8'), 'new-first\n');
  assert.equal(readFileSync(second, 'utf8'), 'new-second\n');
});
