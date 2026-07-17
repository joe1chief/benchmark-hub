import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const e2eDrawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI;
const assetNormalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const fixtureDir = join(root, 'scripts/benchmark_build_process/fixtures/importer_build_process');
const benchmarkIds = [
  'LiveDRBench',
  'LiveMathBench',
  'LongDocURL',
  'MARS-Bench',
  'MBPP',
  'MCP-Bench',
  'MRCR',
  'MaXIFE',
  'MedMT-Bench',
  'MemoryAgentBench',
  'MultiChallenge',
  'OctoBench',
  'Oolong',
  'PolyMATH',
];

const readSpec = (id, language) => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
);

const readDrawio = (id, language) => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.drawio`),
  'utf8',
);

function extractTopology(spec) {
  const nodeSection = spec.match(/^nodes:\n([\s\S]*?)^edges:\n/mu)?.[1] ?? '';
  const edgeSection = spec.match(/^edges:\n([\s\S]*?)^modules:/mu)?.[1] ?? '';
  const nodes = [...nodeSection.matchAll(/^  - id: ([^\n]+)$/gmu)].map(match => match[1]);
  const edges = [...edgeSection.matchAll(
    /^  - from: ([^\n]+)\n    to: ([^\n]+)\n    type: ([^\n]+)(?:\n    label: ([^\n]+))?/gmu,
  )].map(([, from, to, type]) => `${from}->${to}:${type}`);
  return { nodes, edges };
}

function edgeBlock(spec, from, to) {
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedTo = to.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?:    [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

test('keeps the 14 importer diagrams bilingual and topologically identical', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      extractTopology(readSpec(id, 'en')),
      extractTopology(readSpec(id, 'zh')),
      `${id} must keep the same node ids and typed edges in EN and ZH`,
    );
  }
});

test('models MaXIFE release as the union of core and cross-lingual inputs', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('MaXIFE', language);
    assert.match(spec, /^  - id: release_union$/mu);
    assert.match(spec, /^  - from: parallel\n    to: release_union$/mu);
    assert.match(spec, /^  - from: cross\n    to: release_union$/mu);
    assert.match(spec, /^  - from: release_union\n    to: final$/mu);
    assert.doesNotMatch(spec, /^  - from: cross\n    to: final$/mu);
  }

  const detail = JSON.parse(readFileSync(
    join(publicDir, 'benchmarks_detail/MaXIFE.json'),
    'utf8',
  ));
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2506.01776v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2506.01776v2');
});

test('makes MCP-Bench phases and every material branch explicit', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('MCP-Bench', language);
    for (const moduleId of ['construction', 'execution', 'evaluation', 'aggregation']) {
      assert.match(spec, new RegExp(`^  - id: ${moduleId}$`, 'mu'));
    }
    assert.match(spec, /^  - id: judge_axes\n    label: .*5.*\n    type: decision$/mu);

    for (const [from, to] of [
      ['quality_gate', 'retry_task'],
      ['retry_task', 'task_pair'],
      ['quality_gate', 'human_review'],
      ['continue_gate', 'parallel_calls'],
      ['parallel_calls', 'round_planner'],
      ['continue_gate', 'final_response'],
      ['judge_axes', 'shuffled_judges'],
      ['judge_axes', 'overall_score'],
    ]) {
      assert.match(
        edgeBlock(spec, from, to),
        /^    label: \S+/mu,
        `${language} ${from}->${to} must have an explicit branch or loop label`,
      );
    }
  }
});

test('renders MCP-Bench phases as readable horizontal lanes', () => {
  const moduleLabels = {
    en: ['1 · Benchmark construction', '2 · Live MCP execution', '3 · Evidence and judging', '4 · Score aggregation'],
    zh: ['1 · Benchmark 构建', '2 · Live MCP 执行', '3 · 证据与评估', '4 · 分数聚合'],
  };

  for (const language of ['en', 'zh']) {
    const drawio = readDrawio('MCP-Bench', language);
    for (const label of moduleLabels[language]) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const geometry = drawio.match(new RegExp(
        `value="${escapedLabel}"[\\s\\S]{0,600}?<mxGeometry[^>]+width="([0-9.]+)"[^>]+height="([0-9.]+)"`,
        'u',
      ));
      assert.ok(geometry, `${language} lane ${label} must have geometry`);
      assert.ok(Number(geometry[1]) >= 180, `${language} lane ${label} is too narrow`);
      assert.ok(Number(geometry[2]) >= 100, `${language} lane ${label} is too short`);
    }
  }
});

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/giu).map(value => Number.parseInt(value, 16) / 255);
  const linear = channels.map(value => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

test('keeps the MCP evaluation lane at readable WCAG contrast', () => {
  for (const language of ['en', 'zh']) {
    assert.match(
      readSpec('MCP-Bench', language),
      /^  - id: evaluation\n    label: [^\n]+\n    color: \$accentLight$/mu,
    );

    const drawio = readDrawio('MCP-Bench', language);
    const laneStyle = drawio.match(
      /value="3 · [^"]+" style="([^"]+)"[^>]* vertex="1" parent="1"/u,
    )?.[1] ?? '';
    const fill = laneStyle.match(/(?:^|;)fillColor=(#[0-9A-Fa-f]{6})(?:;|$)/u)?.[1];
    const text = laneStyle.match(/(?:^|;)fontColor=(#[0-9A-Fa-f]{6})(?:;|$)/u)?.[1];
    assert.ok(fill && text, `${language} evaluation lane must expose fixed fill/text colors`);
    const lighter = Math.max(relativeLuminance(fill), relativeLuminance(text));
    const darker = Math.min(relativeLuminance(fill), relativeLuminance(text));
    assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5, `${language} evaluation lane contrast`);
  }
});

test('stores edge labels once in Draw.io instead of rendering duplicates', () => {
  for (const id of ['MCP-Bench', 'MaXIFE']) {
    for (const language of ['en', 'zh']) {
      const drawio = readDrawio(id, language);
      const edgeValues = [...drawio.matchAll(
        /<mxCell id="\d+" value="([^"]*)"[^>]* edge="1"/gu,
      )].map(match => match[1]);
      assert.ok(edgeValues.length > 0, `${id}.${language} must contain edges`);
      assert.deepEqual(
        edgeValues.filter(Boolean),
        [],
        `${id}.${language} edge values duplicate their explicit label vertices`,
      );
    }
  }
});

test('optionally rebuilds MCP-Bench and MaXIFE through the formal chain without label drift', {
  skip: e2eDrawioCli ? false : 'set IMPORTER_DRAWIO_E2E_CLI to opt in',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'importer-build-process-rebuild-'));
  try {
    for (const id of ['MCP-Bench', 'MaXIFE']) {
      for (const language of ['en', 'zh']) {
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(
          process.execPath,
          [
            e2eDrawioCli,
            join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
            generated,
            '--validate',
            '--strict',
          ],
          { stdio: 'pipe' },
        );
        execFileSync(process.execPath, [assetNormalizer, generated], { stdio: 'pipe' });
        const once = readFileSync(generated, 'utf8');
        execFileSync(process.execPath, [assetNormalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), once, `${id}.${language} normalization must be idempotent`);
        assert.equal(
          once,
          readDrawio(id, language),
          `${id}.${language} checked-in Draw.io drifted from formal rebuild`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('normalizes a repository raw-CLI fixture without duplicate labels or drift', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'importer-build-process-fixture-'));
  const generated = join(tempRoot, 'fixture.drawio');
  try {
    const raw = readFileSync(join(fixtureDir, 'duplicate-edge-labels.raw.drawio'), 'utf8');
    assert.match(raw, /<mxCell id="edge-labeled" value="Pass"[^>]* edge="1"/u);
    assert.match(raw, /<mxCell id="edge-label" value="Pass"[^>]* parent="edge-labeled"/u);
    writeFileSync(generated, raw);
    execFileSync(process.execPath, [assetNormalizer, generated], { stdio: 'pipe' });
    const once = readFileSync(generated, 'utf8');
    assert.equal(once, readFileSync(join(fixtureDir, 'duplicate-edge-labels.normalized.drawio'), 'utf8'));
    execFileSync(process.execPath, [assetNormalizer, generated], { stdio: 'pipe' });
    assert.equal(readFileSync(generated, 'utf8'), once, 'fixture normalization must be idempotent');
    assert.doesNotMatch(once, /<mxCell id="edge-labeled" value="[^"]+"[^>]* edge="1"/u);
    assert.match(once, /<mxCell id="edge-label" value="Pass"[^>]* parent="edge-labeled"/u);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps the default scoped test portable outside a developer workstation', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/Users\//u);
});

test('spells out LongDocURL text-type-bbox region triples', () => {
  assert.match(readSpec('LongDocURL', 'en'), /text-type-bbox\n\s+region triples/u);
  assert.match(readSpec('LongDocURL', 'zh'), /text-type-bbox\n\s+区域三元组/u);
});

test('pins MemoryAgentBench to arXiv v3 with paper locators', () => {
  const detail = JSON.parse(readFileSync(
    join(publicDir, 'benchmarks_detail/MemoryAgentBench.json'),
    'utf8',
  ));
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2507.05257v3');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2507.05257v3');

  for (const language of ['en', 'zh']) {
    const spec = readSpec('MemoryAgentBench', language);
    assert.match(spec, /arXiv v3/u);
    assert.match(spec, /(?:Sections 3\.1|第 3\.1)/u);
    assert.match(spec, /(?:Appendix B\.1\.2-B\.4\.2|附录 B\.1\.2-B\.4\.2)/u);
    assert.match(spec, /(?:Tables 2 and 6|表 2 和表 6)/u);
    assert.doesNotMatch(spec, /(?:A\.1\.2-A\.4\.2|Tables 1 and 5|表 1 和表 5)/u);
  }
});

test('preserves MemoryAgentBench source counts in both languages', () => {
  const en = readSpec('MemoryAgentBench', 'en');
  const zh = readSpec('MemoryAgentBench', 'zh');
  for (const [id, enLabel, zhLabel] of [
    ['ar_source', '3 AR sources', '3类AR来源'],
    ['ttl_source', '6 TTL sources', '6类TTL来源'],
    ['lru_source', '2 LRU sources', '2类LRU来源'],
  ]) {
    assert.match(en, new RegExp(`^  - id: ${id}\\n    label: ${enLabel}$`, 'mu'));
    assert.match(zh, new RegExp(`^  - id: ${id}\\n    label: ${zhLabel}$`, 'mu'));
  }
});

test('distinguishes the MultiChallenge one-of-six responder from the three-of-six gate', () => {
  assert.match(
    readSpec('MultiChallenge', 'en'),
    /^  - id: responder\n    label: 1-of-6 reply$/mu,
  );
  const zh = readSpec('MultiChallenge', 'zh');
  assert.match(zh, /^  - id: responder\n    label: 六选一随机 Responder$/mu);
  assert.match(zh, /^  - id: model_gate\n    label: 至少3\/6失败\?$/mu);
});

test('publishes native fixed-light SVGs from native-text Draw.io sources', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const drawio = readDrawio(id, language);
      const styles = [...drawio.matchAll(/ style="([^"]+)"/gu)].map(match => match[1]);
      assert.ok(styles.length > 0, `${id}.${language}.drawio must contain styled cells`);
      for (const style of styles) {
        assert.match(style, /(?:^|;)html=0(?:;|$)/u, `${id}.${language}.drawio html=0`);
        assert.match(style, /(?:^|;)convertToSvg=1(?:;|$)/u, `${id}.${language}.drawio convertToSvg=1`);
      }
      assert.doesNotMatch(drawio, /math="1"/u, `${id}.${language}.drawio math=0`);

      const svg = readFileSync(
        join(publicDir, 'drawio', id, `${id}.${language}.svg`),
        'utf8',
      );
      assert.match(svg, /<text(?:\s|>)/u, `${id}.${language}.svg native text`);
      assert.doesNotMatch(svg, /<foreignObject\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /data:image\//u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
    }
  }
});
