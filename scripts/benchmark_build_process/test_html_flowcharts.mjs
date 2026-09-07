/** Website-only scoped regressions. Run the original glob for optional export fidelity.
 * Exact file + test names below are the reviewed export classification. New tests
 * run by default; unexpected skips, export reads and child processes fail closed.
 */
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, basename, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from 'node:test';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
export const optionalExports =
{
  "paper_review_site_a10a.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10a",
    "strictly rebuilds and normalizes all eight A10a specs without byte drift",
    "checks optional export fidelity: keeps BLINK canonical paper and HF counts separate from README drift"
  ],
  "paper_review_site_a10b.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10b",
    "strictly rebuilds and normalizes all eight A10b specs without byte drift"
  ],
  "paper_review_site_a10c.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10c",
    "strictly rebuilds and normalizes all eight A10c specs without byte drift",
    "registration replaces legacy summaries with A10c reviewed semantic arrays"
  ],
  "paper_review_site_a10d.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10d",
    "reproduces A10d SVG and PNG exports from their checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10d specs without byte drift",
    "routes CiteBench evaluation branches without node crossings or shared report corridors",
    "separates ClassBench verifier evidence and repair re-test at the quality gate"
  ],
  "paper_review_site_a10e.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10e",
    "strictly rebuilds and normalizes all eight A10e specs without byte drift",
    "checks optional export fidelity: keeps Claw-Eval provenance, authoring counts, audit evidence, and score exact"
  ],
  "paper_review_site_a10f.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10f",
    "reproduces A10f SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10f specs without byte drift"
  ],
  "paper_review_site_a10g.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10g",
    "reproduces A10g SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10g specs without byte drift"
  ],
  "paper_review_site_a10h.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10h",
    "reproduces both normalized CraftBench SVG and PNG exports from Draw.io sources",
    "strictly rebuilds and normalizes all eight A10h specs without byte drift",
    "checks optional export fidelity: keeps CraftBench as a released AWM scenario, not a standalone benchmark"
  ],
  "paper_review_site_a10i.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10i",
    "reproduces all eight A10i SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10i specs without byte drift"
  ],
  "paper_review_site_a10j.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10j",
    "reproduces A10j SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10j specs without byte drift"
  ],
  "paper_review_site_a10k.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10k",
    "reproduces all eight A10k SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10k specs without byte drift"
  ],
  "paper_review_site_a10l.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10l",
    "reproduces A10l SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10l specs without byte drift"
  ],
  "paper_review_site_a10m.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10m",
    "reproduces A10m SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10m specs without byte drift"
  ],
  "paper_review_site_a10n.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10n",
    "reproduces A10n SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10n specs without byte drift"
  ],
  "paper_review_site_a10o.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10o",
    "reproduces A10o SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10o specs without byte drift"
  ],
  "paper_review_site_a10p.scoped.test.mjs": [
    "reproduces A10p SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10p specs without byte drift",
    "publishes native fixed-light assets with bounded xl label geometry for A10p"
  ],
  "paper_review_site_a10q.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10q",
    "reproduces all eight A10q fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10q specs without byte drift"
  ],
  "paper_review_site_a10r.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10r",
    "reproduces all eight A10r fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10r specs without byte drift",
    "checks optional export fidelity: keeps bilingual node text within reviewed native-text boxes"
  ],
  "paper_review_site_a10s.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10s",
    "reproduces all eight A10s fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10s specs without byte drift"
  ],
  "paper_review_site_a10t.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10t",
    "reproduces all eight A10t fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10t specs without byte drift"
  ],
  "paper_review_site_a10u.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10u",
    "reproduces all eight A10u fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10u specs without byte drift"
  ],
  "paper_review_site_a10v.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10v",
    "reproduces all eight A10v fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10v specs without byte drift"
  ],
  "paper_review_site_a10w.scoped.test.mjs": [
    "reproduces A10w SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10w specs without byte drift",
    "publishes native fixed-light assets with bounded xl label geometry for A10w"
  ],
  "paper_review_site_a10x.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10x",
    "reproduces A10x SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10x specs without byte drift"
  ],
  "paper_review_site_a10y.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10y",
    "reproduces all eight A10y SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A10y specs without byte drift"
  ],
  "paper_review_site_a10z.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A10z",
    "reproduces all eight A10z fixed-light SVG and PNG exports",
    "strictly rebuilds and normalizes all eight A10z specs without byte drift"
  ],
  "paper_review_site_a11a.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11a",
    "reproduces exactly eight A11a SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A11a specs without byte drift"
  ],
  "paper_review_site_a11b.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11b",
    "reproduces exactly eight A11b SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A11b specs without byte drift"
  ],
  "paper_review_site_a11c.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11c",
    "reproduces exactly eight A11c SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A11c specs without byte drift"
  ],
  "paper_review_site_a11d.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11d",
    "reproduces exactly eight A11d SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A11d specs without byte drift"
  ],
  "paper_review_site_a11e.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11e",
    "reproduces exactly eight A11e SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A11e specs without byte drift"
  ],
  "paper_review_site_a11f.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11f",
    "reproduces exactly eight A11f SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A11f specs without byte drift"
  ],
  "paper_review_site_a11g.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11g",
    "reproduces exactly twelve A11g SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11g specs without byte drift"
  ],
  "paper_review_site_a11h.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11h",
    "reproduces exactly twelve A11h SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11h specs without byte drift",
    "routes LinuxArena evaluation branches and monitor loop without interior edge crossings"
  ],
  "paper_review_site_a11i.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11i",
    "reproduces exactly twelve A11i SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11i specs without byte drift"
  ],
  "paper_review_site_a11j.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11j",
    "reproduces exactly twelve A11j SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11j specs without byte drift"
  ],
  "paper_review_site_a11k.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A11k",
    "reproduces exactly twelve A11k SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11k specs without byte drift"
  ],
  "paper_review_site_a11l.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for every reviewed A11l node",
    "reproduces exactly twelve A11l SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11l specs without byte drift"
  ],
  "paper_review_site_a11m.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for every reviewed A11m node",
    "reproduces exactly twelve A11m SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11m specs without byte drift"
  ],
  "paper_review_site_a11n.scoped.test.mjs": [
    "publishes synchronized formal topology, native fixed-light SVG, and readable PNG pairs for A11n",
    "reproduces exactly twelve A11n SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11n specs without byte drift"
  ],
  "paper_review_site_a11o.scoped.test.mjs": [
    "publishes synchronized formal topology, native fixed-light SVG, and readable PNG pairs for A11o",
    "reproduces exactly twelve A11o SVG and PNG exports from checked-in Draw.io sources",
    "strictly rebuilds and normalizes all twelve A11o specs without byte drift"
  ],
  "paper_review_site_a11p.scoped.test.mjs": [
    "publishes exact parent-labeled Draw.io topology with native fixed-light SVG and PNG",
    "reproduces exactly all twelve A11p SVG and PNG exports from checked-in Draw.io",
    "strictly rebuilds and parent-normalizes all twelve A11p specs without byte drift"
  ],
  "paper_review_site_a11q.scoped.test.mjs": [
    "publishes exact parent-labeled Draw.io topology with native fixed-light SVG and PNG",
    "reproduces exactly all twelve A11q SVG and PNG exports from checked-in Draw.io",
    "strictly rebuilds and parent-normalizes all twelve A11q specs without byte drift"
  ],
  "paper_review_site_a11r.scoped.test.mjs": [
    "publishes exact parent-labeled Draw.io topology with native fixed-light SVG and PNG",
    "reproduces exactly all twelve A11r SVG and PNG exports from checked-in Draw.io",
    "strictly rebuilds and parent-normalizes all twelve A11r specs without byte drift"
  ],
  "paper_review_site_a11s.scoped.test.mjs": [
    "publishes exact parent-labeled Draw.io topology with native fixed-light SVG and PNG",
    "reproduces exactly all twelve A11s SVG and PNG exports from checked-in Draw.io",
    "strictly rebuilds and parent-normalizes all twelve A11s specs without byte drift"
  ],
  "paper_review_site_a11t.scoped.test.mjs": [
    "publishes exact parent-labeled Draw.io topology with fixed-light SVG and PNG",
    "reproduces all twelve A11t SVG and PNG exports byte-for-byte",
    "strictly rebuilds and parent-normalizes all twelve A11t specs without drift"
  ],
  "paper_review_site_a11u.scoped.test.mjs": [
    "strictly renders A11u semantic boundary edges when the Draw.io build CLI is available",
    "publishes all six A11u packages as parent-labeled Draw.io, fixed-light SVG, and PNG",
    "reproduces all twelve A11u SVG and PNG exports byte-for-byte",
    "strictly rebuilds and parent-normalizes all twelve A11u specs without drift"
  ],
  "paper_review_site_a11v.scoped.test.mjs": [
    "publishes all six A11v packages as parent-labeled Draw.io, fixed-light SVG, and PNG",
    "reproduces all twelve A11v SVG and PNG exports byte-for-byte",
    "strictly rebuilds and parent-normalizes all twelve A11v specs without drift"
  ],
  "paper_review_site_a11w.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A11w",
    "strictly reproduces all twelve A11w source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a11x.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A11x",
    "strictly reproduces all twelve A11x source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a11y.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A11y",
    "strictly reproduces all twelve A11y source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a11z.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A11z",
    "strictly reproduces all twelve A11z source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12a.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12a",
    "strictly reproduces all twelve A12a source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12b.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12b",
    "strictly reproduces all twelve A12b source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12c.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12c",
    "strictly reproduces all twelve A12c source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12d.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12d",
    "strictly reproduces all twelve A12d source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12f.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12f",
    "strictly reproduces all four A12f source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12g.scoped.test.mjs": [
    "publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12g",
    "strictly reproduces all eight A12g source and rendered assets byte-for-byte"
  ],
  "paper_review_site_a12h_promptcblue_prontoqa.source.scoped.test.mjs": [
    "strictly renders all four source specs as valid Draw.io XML without touching formal assets"
  ],
  "paper_review_site_a12k_rlwdqa_ruler_rarearena_rarebench.source.scoped.test.mjs": [
    "strictly renders all eight source specs as valid Draw.io XML in temporary paths"
  ],
  "paper_review_site_a1a.scoped.test.mjs": [
    "publishes native-text fixed-light Draw.io, SVG, and PNG assets",
    "runs the importer asset normalizer portably through the repo-local Node CLI"
  ],
  "paper_review_site_a1b.scoped.test.mjs": [
    "publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs"
  ],
  "paper_review_site_a2a.scoped.test.mjs": [
    "keeps Draw.io and SVG labels synchronized with architecture counts",
    "publishes non-empty Draw.io Desktop PNG renders"
  ],
  "paper_review_site_a2b.scoped.test.mjs": [
    "publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs"
  ],
  "paper_review_site_a3a.scoped.test.mjs": [
    "publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs"
  ],
  "paper_review_site_a3b.scoped.test.mjs": [
    "publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs",
    "checks optional export fidelity: uses the paper category names and a compact layered AlignBench layout",
    "checks optional export fidelity: restores original AlpacaEval without importing the later LC gate",
    "routes All-Angles downstream evaluation edges in independent node-clear corridors"
  ],
  "paper_review_site_a4a.scoped.test.mjs": [
    "publishes native fixed-light SVG and visible PNG for every language",
    "strictly rebuilds and normalizes all 12 specs without byte drift"
  ],
  "paper_review_site_a5a.scoped.test.mjs": [
    "publishes seven bilingual, topology-identical native Draw.io packages"
  ],
  "paper_review_site_a6a.scoped.test.mjs": [
    "publishes six bilingual, topology-identical native Draw.io packages",
    "strictly rebuilds and normalizes all 12 specs without byte drift"
  ],
  "paper_review_site_a6b.scoped.test.mjs": [
    "publishes native fixed-light XML/SVG and readable PNG pairs",
    "strictly rebuilds and normalizes all 12 specs without byte drift"
  ],
  "paper_review_site_a7.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A7",
    "strictly rebuilds and normalizes all 24 A7 specs without byte drift"
  ],
  "paper_review_site_a8a.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8a",
    "strictly rebuilds and normalizes all eight A8a specs without byte drift"
  ],
  "paper_review_site_a8b.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8b",
    "strictly rebuilds and normalizes all eight A8b specs without byte drift"
  ],
  "paper_review_site_a8c.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8c",
    "strictly rebuilds and normalizes all eight A8c specs without byte drift"
  ],
  "paper_review_site_a8d.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8d",
    "strictly rebuilds and normalizes all eight A8d specs without byte drift"
  ],
  "paper_review_site_a8e.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8e",
    "strictly rebuilds and normalizes all eight A8e specs without byte drift"
  ],
  "paper_review_site_a8f.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8f",
    "strictly rebuilds and normalizes all eight A8f specs without byte drift"
  ],
  "paper_review_site_a8g.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A8g",
    "strictly rebuilds and normalizes all eight A8g specs without byte drift"
  ],
  "paper_review_site_a9a.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A9a",
    "strictly rebuilds and normalizes all eight A9a specs without byte drift"
  ],
  "paper_review_site_a9b.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A9b",
    "strictly rebuilds and normalizes all eight A9b specs without byte drift"
  ],
  "paper_review_site_a9c.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A9c",
    "strictly rebuilds and normalizes all eight A9c specs without byte drift"
  ],
  "paper_review_site_a9d.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A9d",
    "strictly rebuilds and normalizes all eight A9d specs without byte drift"
  ],
  "paper_review_site_a9e.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A9e",
    "reproduces the revised A9e SVG and PNG exports from their checked-in Draw.io sources",
    "strictly rebuilds and normalizes all eight A9e specs without byte drift"
  ],
  "paper_review_site_a9f.scoped.test.mjs": [
    "publishes native fixed-light SVG and readable PNG pairs for A9f",
    "strictly rebuilds and normalizes all eight A9f specs without byte drift"
  ],
  "paper_review_site_a5b.scoped.test.mjs": [
    "checks optional export fidelity: pins primary-source versions and publishes native fixed-light SVG/PNG pairs"
  ]
};

export function inventory(files, registry = optionalExports) {
  const tests = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const registered = new Set();
    for (const statement of ast.statements) {
      const call = statement.expression;
      if (!call || !ts.isCallExpression(call) || call.expression.getText(ast) !== 'test') continue;
      if (!ts.isStringLiteral(call.arguments[0])) throw new Error(`${file}: use literal test names for classification`);
      const name = call.arguments[0].text;
      if (registered.has(name)) throw new Error(`${file}: duplicate test name ${name}`);
      registered.add(name);
      tests.push({ file, name, optional: (registry[basename(file)] ?? []).includes(name) });
    }
    for (const name of registry[basename(file)] ?? []) {
      if (!registered.has(name)) throw new Error(`${file}: stale export classification: ${name}`);
    }
    if (!registered.size) throw new Error(`${file}: no classified test registrations`);
  }
  return tests;
}

// Installed before test modules evaluate (including their transitive imports).
// This is a regression guard, not a security sandbox for hostile test code.
export function installNoDesktopGuard() {
  const missing = join(here, '__html_no_external_toolchain__');
  for (const key of ['IMPORTER_DRAWIO_E2E_CLI', 'DRAWIO_DESKTOP_CLI', 'CI_DRAWIO_DESKTOP_CLI',
    'IMAGEMAGICK_MAGICK', 'IMAGEMAGICK_COMPARE']) process.env[key] = missing;
  for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
    childProcess[name] = () => { throw new Error('HTML-only: unclassified subprocess; external toolchains are disabled'); };
  }
  for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream', 'existsSync']) {
    const original = fs[name];
    fs[name] = function(path, ...args) {
      if (/\.(?:drawio|svg|png)$/i.test(String(path))) {
        throw new Error(`HTML-only: unclassified optional export read: ${path}`);
      }
      return original.call(this, path, ...args);
    };
  }
  for (const name of ['readFile', 'open']) {
    const original = fs.promises[name];
    fs.promises[name] = function(path, ...args) {
      if (/\.(?:drawio|svg|png)$/i.test(String(path))) {
        return Promise.reject(new Error(`HTML-only: unclassified optional export read: ${path}`));
      }
      return original.call(this, path, ...args);
    };
  }
  const exists = fs.existsSync;
  fs.existsSync = path => /(?:draw\.io\.app|\/\.agents\/skills\/drawio\/|\/(?:magick|compare)$|__html_no_external_toolchain__)/.test(String(path))
    ? false : exists(path);
  syncBuiltinESMExports();
}

export async function runHtmlFlowcharts({ files, registry = optionalExports, output = console.log } = {}) {
  files ??= fs.readdirSync(here).filter(name => /^paper_review_site_a.*\.scoped\.test\.mjs$/.test(name))
    .sort().map(name => join(here, name));
  const tests = inventory(files, registry);
  let passed = 0, failed = 0;
  const excluded = tests.filter(test => test.optional);
  output(`HTML-only scoped regressions: ${files.length} files; ${tests.length - excluded.length} retained; ${excluded.length} optional export tests excluded; noDesktop=true`);
  // Each file gets its own exact exclusion list, preventing name collisions from
  // accidentally excluding an unrelated semantic test in another scoped file.
  for (const file of files) {
    const expected = tests.filter(test => test.file === file && !test.optional);
    const skipNames = tests.filter(test => test.file === file && test.optional).map(test => test.name);
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stream = run({ files: [file], concurrency: 1,
      execArgv: ['--import', `${pathToFileURL(fileURLToPath(import.meta.url)).href}?noDesktop`],
      testSkipPatterns: skipNames.length ? [new RegExp(`^(?:${skipNames.map(escape).join('|')})$`)] : [],
    });
    const seen = new Set();
    for await (const event of stream) {
      if (event.type === 'test:fail') {
        seen.add(event.data.name);
        failed++;
        output(`FAIL ${basename(file)}: ${event.data.name}\n${event.data.details?.error?.stack ?? event.data.details?.error}`);
      }
      if (event.type === 'test:pass') {
        const { name, skip, todo } = event.data;
        if (skipNames.includes(name) && skip) continue;
        if (expected.some(test => test.name === name)) {
          seen.add(name);
          if (skip || todo) { failed++; output(`FAIL unexpected semantic skip/todo: ${name}`); }
          else passed++;
        } else { failed++; output(`FAIL unclassified test registration: ${name}`); }
      }
    }
    for (const test of expected) if (!seen.has(test.name)) { failed++; output(`FAIL semantic test did not pass: ${test.name}`); }
  }
  output(`HTML-only result: ${passed} retained passed; ${failed} failures; ${excluded.length} optional export tests excluded.`);
  return { passed, failed, excluded: excluded.length, total: tests.length };
}

if (new URL(import.meta.url).searchParams.has('noDesktop')) installNoDesktopGuard();
else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await runHtmlFlowcharts(); process.exitCode = result.failed ? 1 : 0; }
  catch (error) { console.error(error); process.exitCode = 1; }
}
