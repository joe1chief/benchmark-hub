import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

// Draw.io 30.0.2 shifts text-derived bounds by at most 3 px across macOS 15/26.
const MAX_GEOMETRY_DRIFT = 3;
const GEOMETRY_ATTRIBUTES = new Set([
  'cx',
  'cy',
  'd',
  'height',
  'points',
  'r',
  'rx',
  'ry',
  'transform',
  'viewBox',
  'width',
  'x',
  'x1',
  'x2',
  'y',
  'y1',
  'y2',
]);
const NUMBER_PATTERN = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: false,
  trimValues: false,
});

function geometryParts(value) {
  const numbers = [...value.matchAll(NUMBER_PATTERN)].map(match => Number(match[0]));
  return {
    numbers,
    skeleton: value.replace(NUMBER_PATTERN, '#'),
  };
}

function assertGeometryEqual(actual, expected, path, attribute) {
  const actualParts = geometryParts(actual);
  const expectedParts = geometryParts(expected);
  assert.equal(
    actualParts.skeleton,
    expectedParts.skeleton,
    `${path} @${attribute} geometry syntax`,
  );
  assert.equal(
    actualParts.numbers.length,
    expectedParts.numbers.length,
    `${path} @${attribute} geometry value count`,
  );
  actualParts.numbers.forEach((actualNumber, index) => {
    const expectedNumber = expectedParts.numbers[index];
    assert.ok(
      Math.abs(actualNumber - expectedNumber) <= MAX_GEOMETRY_DRIFT,
      `${path} @${attribute}[${index}] geometry drift: `
        + `actual ${actualNumber}, expected ${expectedNumber}, `
        + `max ${MAX_GEOMETRY_DRIFT}`,
    );
  });
}

function assertAttributesEqual(actual = {}, expected = {}, path) {
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    `${path} attributes`,
  );
  for (const [attribute, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[attribute];
    if (GEOMETRY_ATTRIBUTES.has(attribute)) {
      assertGeometryEqual(actualValue, expectedValue, path, attribute);
    } else {
      assert.equal(actualValue, expectedValue, `${path} @${attribute}`);
    }
  }
}

function assertNodesEqual(actual, expected, path = 'svg') {
  assert.ok(Array.isArray(actual), `${path} actual children must be an array`);
  assert.ok(Array.isArray(expected), `${path} expected children must be an array`);
  assert.equal(actual.length, expected.length, `${path} child count`);

  actual.forEach((actualNode, index) => {
    const expectedNode = expected[index];
    const actualNames = Object.keys(actualNode).filter(name => name !== ':@');
    const expectedNames = Object.keys(expectedNode).filter(name => name !== ':@');
    assert.deepEqual(actualNames, expectedNames, `${path}[${index}] node type`);

    const name = expectedNames[0];
    const nodePath = `${path}/${name}[${index}]`;
    if (name === '#text') {
      assert.equal(actualNode[name], expectedNode[name], nodePath);
      return;
    }

    assertAttributesEqual(actualNode[':@'], expectedNode[':@'], nodePath);
    assertNodesEqual(actualNode[name], expectedNode[name], nodePath);
  });
}

export function assertSvgFidelity(actualPath, expectedPath, message = 'SVG fidelity') {
  const actual = parser.parse(readFileSync(actualPath, 'utf8'));
  const expected = parser.parse(readFileSync(expectedPath, 'utf8'));
  assert.doesNotThrow(
    () => assertNodesEqual(actual, expected),
    message,
  );
}
