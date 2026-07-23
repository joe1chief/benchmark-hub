import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const drawioDesktop = process.env.CI_DRAWIO_DESKTOP_CLI;
assert.ok(drawioDesktop, 'CI_DRAWIO_DESKTOP_CLI must point to the CI Draw.io wrapper');

const root = resolve(import.meta.dirname, '../..');
const source = join(
  root,
  'client/public/drawio/TAU-Bench/TAU-Bench.en.drawio',
);
const outputDir = mkdtempSync(join(tmpdir(), 'drawio-desktop-smoke-'));
const svg = join(outputDir, 'TAU-Bench.en.svg');
const png = join(outputDir, 'TAU-Bench.en.png');

try {
  execFileSync(drawioDesktop, [
    '-x',
    '-f', 'svg',
    '--svg-theme', 'light',
    '-o', svg,
    source,
  ], { stdio: 'pipe' });
  execFileSync(drawioDesktop, [
    '-x',
    '-f', 'png',
    '-o', png,
    source,
  ], { stdio: 'pipe' });

  const svgText = readFileSync(svg, 'utf8');
  assert.match(svgText, /<svg\b/u);
  assert.ok(statSync(svg).size > 1_000, 'Draw.io SVG smoke output is unexpectedly small');

  const pngBytes = readFileSync(png);
  assert.deepEqual(
    pngBytes.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  assert.ok(pngBytes.readUInt32BE(16) > 0, 'Draw.io PNG width must be positive');
  assert.ok(pngBytes.readUInt32BE(20) > 0, 'Draw.io PNG height must be positive');

  console.log('Draw.io Desktop produced valid SVG and PNG outputs.');
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
