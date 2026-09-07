import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { upsertJsonRecord } from './json_records.mjs';

const rawA = '{"id":"A","unknown":{"x":["]}","\\\"",{"n":1e3}]},"label":"\\u4e2d\\ud83d\\ude00","literal":"\\\\u1234"}';
const rawB = '{"id":"B","n":2.5000,"nested":[{"s":"[},\\\"😀"}]}';

test('updates only the selected raw record and preserves unknown field semantics', () => {
  const text = ` \n[\t${rawA} ,\r\n  ${rawB}\t]\r\n`;
  const a = JSON.parse(rawA);
  const updated = { ...a, label: '新😀' };
  const output = upsertJsonRecord(text, updated, { mode: 'replace' });
  const rawUpdated = JSON.stringify(updated).replace(/[^\x00-\x7f]/g, c =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  assert.equal(output, text.replace(rawA, rawUpdated));
  assert.deepEqual(JSON.parse(output), [updated, JSON.parse(rawB)]);
  assert.equal(upsertJsonRecord(output, updated), output);
});

test('semantic no-op preserves number notation, key order and Unicode escapes exactly', () => {
  const text = `[${rawA},${rawB}]\n`;
  const a = JSON.parse(rawA);
  const reordered = { literal: a.literal, label: a.label, unknown: a.unknown, id: a.id };
  assert.equal(upsertJsonRecord(text, reordered), text);
});

test('compact append leaves existing records and closing whitespace unchanged', () => {
  const text = `[${rawA},${rawB} ]\n`;
  const added = { id: 'C', label: 'literal \\u9999 and 😀', n: 0.125, flag: false };
  const out = upsertJsonRecord(text, added, { mode: 'insert' });
  assert.equal(out, `[${rawA},${rawB},${JSON.stringify(added)} ]\n`);
  assert.deepEqual(JSON.parse(out).at(-1), added);
});

test('pretty CRLF append and replacement use local indentation and ASCII escaping', () => {
  const first = '{\r\n\t\t"id": "A",\r\n\t\t"label": "\\u4e2d"\r\n\t}';
  const text = `[\r\n\t${first}\r\n]\r\n`;
  const added = { id: 'B', label: '文😀', extra: { list: [1, null, true] } };
  const out = upsertJsonRecord(text, added);
  assert.ok(out.startsWith(`[\r\n\t${first},\r\n\t{\r\n\t\t"id": "B"`));
  assert.ok(out.includes('"label": "\\u6587\\ud83d\\ude00"'));
  assert.ok(out.endsWith('\r\n\t}\r\n]\r\n'));
  assert.equal(out.replaceAll('\r\n', '').includes('\n'), false);
  assert.deepEqual(JSON.parse(out), [JSON.parse(first), added]);
  const updated = { ...added, label: '新' };
  const replacement = upsertJsonRecord(out, updated);
  assert.ok(replacement.startsWith(`[\r\n\t${first},\r\n\t`));
  assert.deepEqual(JSON.parse(replacement)[1], updated);
});

test('single-line spaced JSON retains separator style outside string contents', () => {
  const text = '[ {"id": "A", "label": "literal , : \\\""} ]';
  const added = { id: 'B', label: 'new , : 😀', items: [1, 2] };
  const out = upsertJsonRecord(text, added);
  assert.equal(out, text.slice(0, -2) + ', {"id": "B", "label": "new , : 😀", "items": [1, 2]} ]');
  assert.deepEqual(JSON.parse(out)[1], added);
});

test('empty arrays preserve outer bytes and use compact or pretty local style', () => {
  assert.equal(upsertJsonRecord(' []\r\n', { id: 'A' }), ' [{"id":"A"}]\r\n');
  assert.equal(upsertJsonRecord('[\r\n]\r\n', { id: 'A' }), '[\r\n  {\r\n    "id": "A"\r\n  }\r\n]\r\n');
  assert.equal(upsertJsonRecord('[  ]', { id: 'A' }), '[{"id":"A"}  ]');
});

test('literal backslash-u does not imply an ASCII-escaped document', () => {
  const text = '[{"id":"A","label":"\\\\u4e2d"}]';
  const out = upsertJsonRecord(text, { id: 'B', label: '汉😀' });
  assert.ok(out.includes('汉😀'));
  assert.deepEqual(JSON.parse(out)[0], { id: 'A', label: '\\u4e2d' });
});

test('rejects malformed JSON, missing ids, duplicates and conflicting modes', () => {
  for (const text of ['{}', '[1]', '[{}]', '[{"id":""}]', '[{"id":"A"},{"id":"A"}]', '[{"id":"A"},]']) {
    assert.throws(() => upsertJsonRecord(text, { id: 'A' }));
  }
  for (const record of [{}, { id: '' }, { id: '  ' }, { id: 1 }, null, []]) {
    assert.throws(() => upsertJsonRecord('[]', record));
  }
  assert.throws(() => upsertJsonRecord('[]', { id: 'A' }, { mode: 'replace' }), /not found/);
  assert.throws(() => upsertJsonRecord('[{"id":"A"}]', { id: 'A' }, { mode: 'insert' }), /already exists/);
  assert.throws(() => upsertJsonRecord('[]', { id: 'A' }, { mode: 'typo' }), /Unknown mode/);
  for (const value of [undefined, NaN, Infinity, new Date(), 1n]) {
    assert.throws(() => upsertJsonRecord('[]', { id: 'A', unknown: value }));
  }
});

test('actual checked-in manifest preserves every byte outside the replaced first record', () => {
  const text = readFileSync(new URL('../../client/public/benchmarks_build_process_manifest.json', import.meta.url), 'utf8');
  const records = JSON.parse(text);
  assert.ok(records.length > 1);
  assert.equal(upsertJsonRecord(text, structuredClone(records[0])), text);
  const updated = { ...records[0], evidence_summary_en: records[0].evidence_summary_en + ' Local test.' };
  const out = upsertJsonRecord(text, updated, { mode: 'replace' });
  // A scalar text edit should be the only difference in the real ASCII-escaped manifest.
  assert.equal(out, text.replace(
    JSON.stringify(records[0].evidence_summary_en), JSON.stringify(updated.evidence_summary_en)));
  assert.deepEqual(JSON.parse(out), [updated, ...records.slice(1)]);
  const added = { id: '__test_append__', evidence_summary_zh: '测试😀' };
  const appended = upsertJsonRecord(text, added);
  const lastClosing = text.lastIndexOf('}');
  assert.equal(appended.slice(0, lastClosing + 1), text.slice(0, lastClosing + 1));
  assert.ok(appended.endsWith(text.slice(lastClosing + 1)));
  assert.deepEqual(JSON.parse(appended), [...records, added]);
});


test('no-op keeps negative zero and extreme numeric spellings without rewriting', () => {
  const text = '[{"id":"A","zero":-0,"huge":1e400,"decimal":1.234500}]';
  assert.equal(upsertJsonRecord(text, JSON.parse(text)[0]), text);
  assert.throws(() => upsertJsonRecord(text, { ...JSON.parse(text)[0], newField: true }), /losslessly/);
});

test('empty-array initialization and middle/last updates remain idempotent', () => {
  for (const initial of ['[]', '[\n]\n', '[\r\n]\r\n']) {
    let text = initial;
    const records = [
      { id: 'A', text: 'emoji 😀 and [\"]}\\', nested: [{ key: 'a,b:c' }] },
      { id: 'B', text: '\\u1234', values: [0, -1, 1.25, null, false] },
      { id: 'C', text: '\u2028 and \u2029' },
    ];
    for (const record of records) {
      text = upsertJsonRecord(text, record);
      assert.equal(upsertJsonRecord(text, structuredClone(record)), text);
    }
    assert.deepEqual(JSON.parse(text), records);
    for (const index of [1, 2]) {
      const before = text;
      const original = records[index];
      records[index] = { ...original, text: 'updated' };
      text = upsertJsonRecord(text, records[index]);
      assert.deepEqual(JSON.parse(text), records);
      assert.equal(upsertJsonRecord(text, records[index]), text);
      assert.equal(before.slice(0, before.indexOf('"id":' + (initial === '[]' ? '' : ' ') + '"' + original.id + '"')),
                   text.slice(0, text.indexOf('"id":' + (initial === '[]' ? '' : ' ') + '"' + original.id + '"')));
    }
  }
});
