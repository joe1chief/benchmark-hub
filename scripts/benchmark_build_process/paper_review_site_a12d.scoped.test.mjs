import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';
import { parse as parseYaml } from 'yaml';
import { assertPngFidelity } from './assert_png_fidelity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'PRDBench',
  'PaperBench',
  'PaperQA',
  'Pare-Bench',
  'PathVQA',
  'PawBench',
];
const expectedCounts = new Map([
  ['PRDBench', { nodes: 30, edges: 34 }],
  ['PaperBench', { nodes: 30, edges: 31 }],
  ['PaperQA', { nodes: 20, edges: 20 }],
  ['Pare-Bench', { nodes: 28, edges: 33 }],
  ['PathVQA', { nodes: 27, edges: 29 }],
  ['PawBench', { nodes: 27, edges: 28 }],
]);
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const svgNormalizer = join(root, 'scripts/benchmark_build_process/normalize_drawio_svg.mjs');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const catalog = new Map(readJson(join(publicDir, 'benchmarks.json')).map(item => [item.id, item]));
const manifest = new Map(
  readJson(join(publicDir, 'benchmarks_build_process_manifest.json')).map(item => [item.id, item]),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));
const readArch = (id, language) => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function canonicalGraph(graph) {
  return {
    nodes: graph.nodes.map(({ id, label, type, size }) => ({ id, label, type, size })),
    edges: graph.edges.map(({ from, to, type, label }) => {
      const edge = { from, to, type };
      if (label !== undefined) edge.label = label;
      return edge;
    }),
    modules: graph.modules ?? [],
  };
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
    const label = mermaidLabel(edge.label ?? '').replace(/\|/gu, '&#124;').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${label}|` : '-->')
      : (label ? `-. ${label} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function manifestLabel(label) {
  return String(label).replace(/\s*\n\s*/gu, ' · ').trim();
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('keeps the six A12d bilingual sources, fallbacks, and catalog entries synchronized', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const summary = catalog.get(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.ok(summary, `${id} catalog entry`);
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual geometry`);
    assert.deepEqual(
      { nodes: en.nodes.length, edges: en.edges.length },
      expectedCounts.get(id),
      `${id} source counts`,
    );
    assert.doesNotMatch(
      en.nodes.map(node => node.label).join('\n'),
      /[\u3400-\u9fff]/u,
      `${id}.en language`,
    );
    assert.ok(
      zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))),
      `${id}.zh semantics`,
    );
    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.edges.every(edge => edge.label === undefined), `${id}.${language} no edge labels`);
      for (const edge of spec.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id}.${language} ${edge.from}->${edge.to} dashed`);
      }
      assert.equal(detail[`flowchart_${language}`], renderFallback(spec), `${id}.${language} fallback`);
      assert.equal(summary[`flowchart_${language}`], detail[`flowchart_${language}`], `${id}.${language} catalog`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.equal(summary.mermaid_flowchart, detail.flowchart_en, `${id} catalog canonical fallback`);
    assert.match(
      detail.drawio_review_note,
      /Formal publication evidence \[site-a12d-paper-alignment\]/u,
    );
    assert.equal(summary.drawio_review_note, detail.drawio_review_note, `${id} catalog review note`);
  }
});

test('keeps reviewed A12d native-text lines inside their fixed node widths', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const limit = language === 'en' ? 48 : 38;
      for (const node of readSpec(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok(
            [...line].length <= limit,
            `${id}.${language}.${node.id} line is too long: ${line}`,
          );
        }
      }
    }
  }
});

test('registers all six A12d packages with complete paper-aligned manifest semantics', () => {
  for (const id of benchmarkIds) {
    const entry = manifest.get(id);
    assert.ok(entry, `${id} manifest entry`);
    assert.equal(entry.review_batch, 'site-a12d-paper-alignment', `${id} review batch`);
    assert.equal(entry.review_status, 'visually_reviewed', `${id} visual status`);
    assert.equal(entry.visual_review?.reviewed_at, '2026-07-18', `${id} visual date`);
    assert.equal(entry.paper_alignment_review?.status, 'passed', `${id} paper status`);
    assert.equal(entry.paper_alignment_review?.reviewed_at, '2026-07-18', `${id} paper date`);
    assert.ok(entry.paper_alignment_review?.source_url, `${id} source URL`);
    assert.ok(entry.paper_alignment_review?.source_locator, `${id} source locator`);
    assert.equal(
      entry.evidence_summary_zh,
      String(readSpec(id, 'zh').meta.description).replace(/\s+/gu, ' ').trim(),
      `${id} bilingual evidence summary`,
    );

    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const steps = [
        ...(entry[`construction_steps_${language}`] ?? []),
        ...(entry[`evaluation_steps_${language}`] ?? []),
      ];
      const labels = arch.nodes.map(node => manifestLabel(node.label));
      assert.equal(steps.length, labels.length, `${id}.${language} manifest step count`);
      assert.deepEqual(new Set(steps), new Set(labels), `${id}.${language} manifest labels`);
    }
  }
});

test('publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12d', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec), `${id}.${language} arch source`);
      assert.deepEqual(arch.counts, {
        ...expectedCounts.get(id),
        modules: (spec.modules ?? []).length,
      }, `${id}.${language} arch counts`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const cells = [...drawio.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
      const edgeCells = cells.filter(cell => /\bedge="1"/u.test(cell));
      assert.equal(edgeCells.length, spec.edges.length, `${id}.${language} Draw.io edge count`);
      assert.equal(
        edgeCells.filter(cell => /(?:^|;)dashed=1(?:;|$)/u.test(
          cell.match(/\bstyle="([^"]*)"/u)?.[1] ?? '',
        )).length,
        spec.edges.filter(edge => edge.type === 'secondary').length,
        `${id}.${language} dashed edge count`,
      );
      assert.match(drawio, /<mxGraphModel[^>]*\bmath="0"[^>]*\bbackground="#FFFFFF"/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.doesNotMatch(drawio, /edgeLabel/u, `${id}.${language} duplicate edge-label cell`);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/iu);
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language} PNG size`);
    }
  }
});

test('strictly reproduces all twelve A12d source and rendered assets byte-for-byte', {
  skip: existsSync(drawioCli) && existsSync(drawioDesktop)
    ? false
    : 'Draw.io build and desktop CLIs are required',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a12d-'));
  let count = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli,
          `${base}.spec.yaml`,
          generated,
          '--validate',
          '--strict',
          '--write-sidecars',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}.drawio bytes`,
        );
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
          `${id}.${language}.arch bytes`,
        );
        const svg = generated.replace(/\.drawio$/u, '.svg');
        const png = generated.replace(/\.drawio$/u, '.png');
        execFileSync(drawioDesktop, [
          '-x', '-f', 'svg', '--svg-theme', 'light', '-o', svg, generated,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, svg], { stdio: 'pipe' });
        assertSvgFidelity(
          svg,
          `${base}.svg`,
          `${id}.${language}.svg bytes`,
        );
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'png', '-o', png, generated],
          { stdio: 'pipe' },
        );
        assertPngFidelity(png, `${base}.png`, `${id}.${language}.png fidelity`);
        count += 1;
      }
    }
    assert.equal(count, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
