import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const normalizer = new URL('./normalize_drawio_svg.mjs', import.meta.url);

test('locks a desktop-exported SVG to the light academic color scheme', () => {
  const root = mkdtempSync(join(tmpdir(), 'drawio-svg-normalize-'));
  const svgPath = join(root, 'diagram.svg');
  writeFileSync(
    svgPath,
    '<svg style="background: transparent; color-scheme: light dark;" content="&lt;mxfile&gt;Text is not SVG - cannot display&lt;/mxfile&gt;"><foreignObject><div style="color: light-dark(#212121, #d1d1d1); background-color: light-dark(#ffffff, #111111); stroke: light-dark(rgb(33, 150, 243), rgb(66, 66, 66));"><rect style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212));"/>Node</div></foreignObject></svg>\n',
  );

  const result = spawnSync(
    process.execPath,
    [normalizer.pathname, svgPath],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const normalized = readFileSync(svgPath, 'utf8');
  assert.match(normalized, /color-scheme: light;/u);
  assert.match(normalized, /color: #212121;/u);
  assert.match(normalized, /background-color: #ffffff;/u);
  assert.match(normalized, /stroke: rgb\(33, 150, 243\);/u);
  assert.match(normalized, /fill: #ffffff;/u);
  assert.doesNotMatch(normalized, /light-dark\(/u);
  assert.doesNotMatch(normalized, /\scontent="|Text is not SVG/u);
});
