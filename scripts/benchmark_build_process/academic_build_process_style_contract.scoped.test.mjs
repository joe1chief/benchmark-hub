import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const manifest = JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_build_process_manifest.json'),
  'utf8',
));

const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));

test('keeps every bilingual Build Process on the shared academic style contract', () => {
  assert.equal(manifest.length, 610);
  const violations = [];

  for (const { id } of manifest) {
    const specs = Object.fromEntries(
      ['en', 'zh'].map(language => [language, readSpec(id, language)]),
    );

    for (const [language, spec] of Object.entries(specs)) {
      if (spec.meta?.profile !== 'academic-paper') {
        violations.push(`${id}.${language} profile=${spec.meta?.profile}`);
      }
      if (spec.meta?.theme !== 'academic-color') {
        violations.push(`${id}.${language} theme=${spec.meta?.theme}`);
      }
      if (spec.meta?.routing !== 'orthogonal') {
        violations.push(`${id}.${language} routing=${spec.meta?.routing}`);
      }

      for (const node of spec.nodes || []) {
        if (Object.hasOwn(node, 'fontSize')) {
          violations.push(`${id}.${language}.${node.id} ignored node-level fontSize`);
        }
        if (node.style === null) {
          violations.push(`${id}.${language}.${node.id} empty style`);
        }

        const fontSize = node.style?.fontSize;
        if (fontSize === undefined) continue;
        if (typeof fontSize !== 'number') {
          violations.push(`${id}.${language}.${node.id} nonnumeric fontSize=${fontSize}`);
        } else if (fontSize < 8 || fontSize > 10) {
          violations.push(`${id}.${language}.${node.id} fontSize=${fontSize} outside 8-10`);
        }
      }
    }

    if (specs.en.meta?.layout !== specs.zh.meta?.layout) {
      violations.push(`${id} bilingual layout mismatch`);
    }
  }

  assert.deepEqual(violations, []);
});
