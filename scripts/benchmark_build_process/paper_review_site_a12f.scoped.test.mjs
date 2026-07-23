import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PersonQA', 'PopQA'];
const expectedCounts = new Map([
  ['PersonQA', { nodes: 16, edges: 16 }],
  ['PopQA', { nodes: 25, edges: 25 }],
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
    nodes: graph.nodes.map(({ id, type, size, style, position }) => (
      { id, type, size, style, position }
    )),
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

function renderFallback(graph) {
  const encode = label => String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${encode(node.label)}"]`);
  for (const edge of graph.edges) {
    lines.push(`    ${edge.from} ${edge.type === 'primary' ? '-->' : '-.->'} ${edge.to}`);
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

test('keeps the A12f PersonQA and PopQA bilingual packages synchronized', () => {
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
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u);
    assert.ok(zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))));
    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      assert.equal(spec.meta.profile, 'academic-paper');
      assert.equal(spec.meta.theme, 'academic-color');
      assert.equal(spec.meta.layout, 'horizontal');
      assert.equal(spec.meta.routing, 'orthogonal');
      assert.ok(spec.edges.every(edge => edge.label === undefined));
      for (const edge of spec.edges.filter(candidate => candidate.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id}.${language} secondary dashed`);
      }
      assert.equal(detail[`flowchart_${language}`], renderFallback(spec));
      assert.equal(summary[`flowchart_${language}`], detail[`flowchart_${language}`]);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en);
    assert.equal(summary.mermaid_flowchart, detail.flowchart_en);
    assert.match(
      detail.drawio_review_note,
      /Formal publication evidence \[site-a12f-paper-alignment\]/u,
    );
    assert.equal(summary.drawio_review_note, detail.drawio_review_note);
  }
});

test('registers both A12f packages with complete paper-aligned manifest semantics', () => {
  for (const id of benchmarkIds) {
    const entry = manifest.get(id);
    assert.ok(entry, `${id} manifest entry`);
    assert.equal(entry.review_batch, 'site-a12f-paper-alignment');
    assert.equal(entry.review_status, 'visually_reviewed');
    assert.equal(entry.visual_review?.reviewed_at, '2026-07-18');
    assert.equal(entry.paper_alignment_review?.status, 'passed');
    assert.equal(entry.paper_alignment_review?.reviewed_at, '2026-07-18');
    assert.ok(entry.paper_alignment_review?.source_url);
    assert.ok(entry.paper_alignment_review?.source_locator);
    assert.equal(
      entry.evidence_summary_zh,
      String(readSpec(id, 'zh').meta.description).replace(/\s+/gu, ' ').trim(),
    );
    for (const language of ['en', 'zh']) {
      const labels = readArch(id, language).nodes.map(node => manifestLabel(node.label));
      const steps = [
        ...(entry[`construction_steps_${language}`] ?? []),
        ...(entry[`evaluation_steps_${language}`] ?? []),
      ];
      assert.equal(steps.length, labels.length, `${id}.${language} step count`);
      assert.deepEqual(new Set(steps), new Set(labels), `${id}.${language} manifest labels`);
    }
  }
});

test('publishes complete native Draw.io, fixed-light SVG, and PNG packages for A12f', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec));
      assert.deepEqual(arch.counts, {
        ...expectedCounts.get(id),
        modules: (spec.modules ?? []).length,
      });
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const cells = [...drawio.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
      const edgeCells = cells.filter(cell => /\bedge="1"/u.test(cell));
      assert.equal(edgeCells.length, spec.edges.length);
      assert.equal(
        edgeCells.filter(cell => /(?:^|;)dashed=1(?:;|$)/u.test(
          cell.match(/\bstyle="([^"]*)"/u)?.[1] ?? '',
        )).length,
        spec.edges.filter(edge => edge.type === 'secondary').length,
      );
      assert.match(drawio, /<mxGraphModel[^>]*\bmath="0"[^>]*\bbackground="#FFFFFF"/u);
      assert.doesNotMatch(drawio, /html=1|math="1"|edgeLabel/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/iu);
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180);
    }
  }
});

test('strictly reproduces all four A12f source and rendered assets byte-for-byte', {
  skip: existsSync(drawioCli) && existsSync(drawioDesktop)
    ? false
    : 'Draw.io build and desktop CLIs are required',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a12f-'));
  let count = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli, `${base}.spec.yaml`, generated,
          '--validate', '--strict', '--write-sidecars',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'));
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
        );
        const svg = generated.replace(/\.drawio$/u, '.svg');
        const png = generated.replace(/\.drawio$/u, '.png');
        execFileSync(drawioDesktop, [
          '-x', '-f', 'svg', '--svg-theme', 'light', '-o', svg, generated,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, svg], { stdio: 'pipe' });
        assert.equal(readFileSync(svg, 'utf8'), readFileSync(`${base}.svg`, 'utf8'));
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'png', '-o', png, generated],
          { stdio: 'pipe' },
        );
        assert.deepEqual(readFileSync(png), readFileSync(`${base}.png`));
        count += 1;
      }
    }
    assert.equal(count, 4);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
