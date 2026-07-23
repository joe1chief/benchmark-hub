import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const imageCompare = [
  process.env.IMAGEMAGICK_COMPARE,
  '/opt/homebrew/bin/compare',
  '/usr/local/bin/compare',
].find(candidate => candidate && existsSync(candidate));

export function assertPngFidelity(actualPath, expectedPath, message) {
  if (imageCompare) {
    assert.doesNotThrow(
      () => execFileSync(
        imageCompare,
        ['-metric', 'AE', actualPath, expectedPath, 'null:'],
        { stdio: 'pipe' },
      ),
      message,
    );
    return;
  }

  assert.deepEqual(readFileSync(actualPath), readFileSync(expectedPath), message);
}
