import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { inventory, runHtmlFlowcharts, optionalExports } from './test_html_flowcharts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
function fixture(t, source, name = 'fixture.scoped.test.mjs') {
  const dir = mkdtempSync(join(tmpdir(), 'html-flowchart-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, name);
  writeFileSync(file, source);
  return file;
}
const prelude = `import test from 'node:test'; import assert from 'node:assert/strict';\n`;
async function execute(file, registry = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const program = `import { runHtmlFlowcharts } from ${JSON.stringify(pathToFileURL(join(here, 'test_html_flowcharts.mjs')).href)};
    const messages = [];
    const result = await runHtmlFlowcharts({ files: [${JSON.stringify(file)}], registry: ${JSON.stringify(registry)}, output: message => messages.push(message) });
    console.log(JSON.stringify({ ...result, messages: messages.join('\\n') }));`;
  const worker = join(dirname(file), 'run-fixture.mjs');
  writeFileSync(worker, program);
  return JSON.parse(execFileSync(process.execPath, [worker], { env, encoding: 'utf8' }));
}

test('exact export classification preserves semantic names mentioning SVG and exports', async t => {
  const file = fixture(t, prelude + `
    test('exports', () => { throw new Error('optional callback must not execute'); });
    test('SVG source semantic contract', () => assert.equal(1, 1));
    test('exports source fallback', () => assert.equal(1, 1));
  `);
  const result = await execute(file, { 'fixture.scoped.test.mjs': ['exports'] });
  assert.equal(result.passed, 2);
  assert.equal(result.failed, 0, result.messages);
  assert.equal(result.excluded, 1);
});

test('stale export names fail classification rather than silently dropping coverage', t => {
  const file = fixture(t, prelude + `test('source', () => {});`);
  assert.throws(() => inventory([file], { 'fixture.scoped.test.mjs': ['old export name'] }), /stale export classification/);
});

test('new unclassified exports and conditional skips fail closed', async t => {
  const file = fixture(t, prelude + `
    import { readFileSync } from 'node:fs';
    test('new export', () => readFileSync('/tmp/new.svg'));
    test('new gated export', { skip: true }, () => {});
  `);
  const result = await execute(file);
  assert.ok(result.failed > 0);
  assert.match(result.messages, /unclassified optional export read/);
  assert.match(result.messages, /unexpected semantic skip/);
  assert.equal(result.failed, 2, 'each failed or skipped test is counted once');
});

test('noDesktop blocks subprocesses even with executable CLI environment values', async t => {
  const marker = fixture(t, '');
  rmSync(marker);
  const file = fixture(t, prelude + `
    import { execFileSync } from 'node:child_process';
    import { existsSync } from 'node:fs';
    test('CLI values cannot activate exporters', () => {
      assert.equal(existsSync(process.env.IMPORTER_DRAWIO_E2E_CLI), false);
      assert.equal(existsSync(process.env.DRAWIO_DESKTOP_CLI), false);
      assert.equal(existsSync('/Applications/draw.io.app/Contents/MacOS/draw.io'), false);
      assert.equal(existsSync('/Users/example/.agents/skills/drawio/scripts/cli.js'), false);
      execFileSync(process.execPath, ['-e', ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'invoked')`)}]);
    });
  `);
  const old = { IMPORTER_DRAWIO_E2E_CLI: process.env.IMPORTER_DRAWIO_E2E_CLI, DRAWIO_DESKTOP_CLI: process.env.DRAWIO_DESKTOP_CLI };
  t.after(() => { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.IMPORTER_DRAWIO_E2E_CLI = process.execPath;
  process.env.DRAWIO_DESKTOP_CLI = process.execPath;
  const result = await execute(file);
  assert.ok(result.failed > 0);
  assert.match(result.messages, /unclassified subprocess/);
  assert.equal(existsSync(marker), false);
});

test('real AA-Omniscience semantic regression still fails through the HTML runner', async t => {
  const name = 'paper_review_site_a1a.scoped.test.mjs';
  const source = readFileSync(join(here, name), 'utf8')
    .replace("resolve(dirname(fileURLToPath(import.meta.url)), '../..')", JSON.stringify(resolve(here, '../..')))
    .replace("'./normalize_importer_build_process_assets.mjs'", JSON.stringify(pathToFileURL(join(here, 'normalize_importer_build_process_assets.mjs')).href))
    .replace('/GPT-5/u', '/DELIBERATELY_WRONG_MODEL/u');
  const file = fixture(t, source, name);
  const result = await execute(file, optionalExports);
  assert.ok(result.failed > 0);
  assert.match(result.messages, /uses GPT-5 for AA-Omniscience/);
  assert.ok(result.passed > 0, 'other retained semantics still execute');
});

test('real 2Wiki semantic/topology test passes with only spec/arch assets and rejects a bad edge', async t => {
  const { default: ts } = await import('typescript');
  const source = readFileSync(join(here, 'paper_review_site_a1a.scoped.test.mjs'), 'utf8');
  const ast = ts.createSourceFile('fixture.mjs', source, ts.ScriptTarget.Latest, true);
  const helpers = ast.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && ['readSpec', 'nodeBlock', 'edgeBlock'].includes(statement.name?.text));
  const regression = ast.statements.find(statement => statement.expression?.arguments?.[0]?.text
    === 'serializes 2WikiMultihopQA type gates, post-processing, and distractor retrieval');
  assert.ok(regression);
  const file = fixture(t, '');
  const publicDir = dirname(file);
  const { mkdirSync } = await import('node:fs');
  const assetDir = join(publicDir, 'drawio', '2WikiMultihopQA');
  mkdirSync(assetDir, { recursive: true });
  for (const language of ['en', 'zh']) {
    for (const extension of ['spec.yaml', 'arch.json']) {
      const name = `2WikiMultihopQA.${language}.${extension}`;
      writeFileSync(join(assetDir, name), readFileSync(resolve(here, '../../client/public/drawio/2WikiMultihopQA', name)));
    }
  }
  writeFileSync(file, prelude + `import { readFileSync } from 'node:fs'; import { join } from 'node:path';
    const publicDir = ${JSON.stringify(publicDir)};
    ${helpers.map(statement => statement.getText(ast)).join('\n')}
    ${regression.getText(ast)}
  `);
  const good = await execute(file);
  assert.equal(good.failed, 0, good.messages);
  assert.equal(good.passed, 1);
  const spec = join(assetDir, '2WikiMultihopQA.en.spec.yaml');
  writeFileSync(spec, readFileSync(spec, 'utf8').replace('to: comparison\n    type: primary', 'to: comparison\n    type: secondary'));
  const bad = await execute(file);
  assert.ok(bad.failed > 0, bad.messages);
  assert.match(bad.messages, /serializes 2WikiMultihopQA/);
});
