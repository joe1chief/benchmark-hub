import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';

const svg = ({
  width = 100,
  rectX = 10,
  rectWidth = 35,
  pathStart = 0,
  text = '思维链',
  fill = '#ffffff',
  extra = '',
} = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="20px" viewBox="0 0 ${width} 20"><g data-cell-id="1"><path d="M ${pathStart} 0 L 20 0" fill="none" stroke="#424242"/><rect x="${rectX}" y="2" width="${rectWidth}" height="14" fill="${fill}"/><text x="18" y="12">${text}</text>${extra}</g></svg>`;

function withSvgPair(actual, expected, callback) {
  const directory = mkdtempSync(join(tmpdir(), 'svg-fidelity-'));
  const actualPath = join(directory, 'actual.svg');
  const expectedPath = join(directory, 'expected.svg');
  try {
    writeFileSync(actualPath, actual);
    writeFileSync(expectedPath, expected);
    callback(actualPath, expectedPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts cross-macOS geometry drift of at most three pixels', () => {
  withSvgPair(
    svg({ width: 103, rectX: 9, rectWidth: 36, pathStart: 2 }),
    svg(),
    (actualPath, expectedPath) => {
      assert.doesNotThrow(() => assertSvgFidelity(actualPath, expectedPath));
    },
  );
});

test('rejects geometry drift greater than three pixels', () => {
  withSvgPair(svg({ width: 104 }), svg(), (actualPath, expectedPath) => {
    assert.throws(
      () => assertSvgFidelity(actualPath, expectedPath),
      /width.*104.*100/,
    );
  });
});

test('rejects text, style, and topology changes', async t => {
  const cases = [
    ['text', svg({ text: '推理链' })],
    ['style', svg({ fill: '#eeeeee' })],
    ['topology', svg({ extra: '<circle cx="5" cy="5" r="2"/>' })],
  ];

  for (const [name, actual] of cases) {
    await t.test(name, () => {
      withSvgPair(actual, svg(), (actualPath, expectedPath) => {
        assert.throws(() => assertSvgFidelity(actualPath, expectedPath));
      });
    });
  }
});

test('does not treat numbers in visible text as geometry', () => {
  withSvgPair(
    svg({ text: 'Pass@1 = 76.75%' }),
    svg({ text: 'Pass@1 = 76.74%' }),
    (actualPath, expectedPath) => {
      assert.throws(() => assertSvgFidelity(actualPath, expectedPath));
    },
  );
});
