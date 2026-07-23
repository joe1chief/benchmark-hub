import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assetDir = path.join(repoRoot, 'client/public/drawio/ChartEditBench');

function readAsset(language, extension) {
  return readFileSync(path.join(assetDir, `ChartEditBench.${language}.${extension}`), 'utf8');
}

function edgeBlock(spec, from, to) {
  const match = spec.match(
    new RegExp(
      `  - from: ${from}\\n    to: ${to}\\n[\\s\\S]*?(?=\\n  - from:|\\nmodules:)`,
      'u',
    ),
  );
  return match?.[0] ?? '';
}

function xmlEscapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function vertex(xml, label) {
  const match = xml.match(
    new RegExp(
      `<mxCell id="([^"]+)" value="${xmlEscapePattern(label)}"[^>]* vertex="1"[^>]*><mxGeometry x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"`,
      'u',
    ),
  );
  assert.ok(match, `missing draw.io vertex: ${label}`);
  const [, id, x, y, width, height] = match;
  return { id, x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
}

function edge(xml, source, target) {
  const match = xml.match(
    new RegExp(
      `<mxCell id="([^"]+)" value="" style="([^"]*)" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">([\\s\\S]*?)</mxGeometry></mxCell>`,
      'u',
    ),
  );
  assert.ok(match, `missing draw.io edge ${source}->${target}`);
  return { style: match[2], geometry: match[3] };
}

test('routes the initial-rendered VQA side edge below the main edit node', () => {
  const labels = {
    en: {
      initial: 'Initial rendered state',
      nextEdit: 'Generate next edit',
      vqa: '5 VQAs / chart',
    },
    zh: {
      initial: '初始渲染状态',
      nextEdit: '生成下一轮编辑',
      vqa: '每张图 5 个 VQA',
    },
  };

  for (const language of ['en', 'zh']) {
    const spec = readAsset(language, 'spec.yaml');
    const block = edgeBlock(spec, 'initial_rendered', 'vqa_generation');
    assert.match(block, /^    type: optional$/mu);
    const specPoints = [...block.matchAll(/      - x: (\d+)\n        'y': (\d+)/gu)].map(
      ([, x, y]) => ({ x: Number(x), y: Number(y) }),
    );
    assert.deepEqual(
      specPoints,
      [
        { x: 704, y: 440 },
        { x: 900, y: 440 },
      ],
      `${language}: checked spec must define the clear lower corridor`,
    );

    const xml = readAsset(language, 'drawio');
    const initial = vertex(xml, labels[language].initial);
    const nextEdit = vertex(xml, labels[language].nextEdit);
    const vqa = vertex(xml, labels[language].vqa);
    const routed = edge(xml, initial.id, vqa.id);
    assert.match(routed.style, /(?:^|;)dashed=1(?:;|$)/u);
    assert.match(routed.style, /(?:^|;)endArrow=open(?:;|$)/u);
    assert.doesNotMatch(routed.style, /(?:^|;)(?:exit|entry)[XYD][^=]*=/u);

    const points = [...routed.geometry.matchAll(/<mxPoint x="([^"]+)" y="([^"]+)"\/>/gu)].map(
      ([, x, y]) => ({ x: Number(x), y: Number(y) }),
    );
    assert.deepEqual(points, specPoints, `${language}: draw.io waypoints must match the checked spec`);
    assert.ok(points[0].x < nextEdit.x, `${language}: first turn must stay left of the edit node`);
    assert.ok(
      points[0].y >= nextEdit.y + nextEdit.height + 30,
      `${language}: lower corridor must clear the edit node by at least 30px`,
    );
    assert.ok(
      vqa.y - points.at(-1).y >= 30,
      `${language}: final target-entry segment must be at least 30px`,
    );
  }
});
