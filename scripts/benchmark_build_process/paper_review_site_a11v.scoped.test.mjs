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
const formalBenchmarkIds = [
  'MiniF2F-Test',
  'Minimal-LinuxBench',
  'MixEval',
  'MixEval-Hard',
  'MlogiQA',
  'Monorepo-Bench',
];
const expectedCounts = new Map([
  ['MiniF2F-Test', { nodes: 21, edges: 25 }],
  ['Minimal-LinuxBench', { nodes: 16, edges: 18 }],
  ['MixEval', { nodes: 26, edges: 27 }],
  ['MixEval-Hard', { nodes: 30, edges: 32 }],
  ['MlogiQA', { nodes: 24, edges: 24 }],
  ['Monorepo-Bench', { nodes: 17, edges: 16 }],
]);
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const svgNormalizer = join(root, 'scripts/benchmark_build_process/normalize_drawio_svg.mjs');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));
const readArch = (id, language) => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const catalog = new Map(readJson(join(publicDir, 'benchmarks.json')).map(item => [item.id, item]));

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

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function mermaidEdgeLabel(label) {
  return mermaidLabel(label).replace(/\|/gu, '&#124;');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
    const label = String(edge.label ?? '').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${mermaidEdgeLabel(label)}|` : '-->')
      : (label ? `-. ${mermaidEdgeLabel(label)} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^{}$()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp('(?:^|\\s)' + escapedName + '="([^"]*)"', 'u'))?.[1] ?? '';
}

function topology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type }) => ({ id, type })),
    edges: graph.edges.map(({ from, to, type }) => ({ from, to, type })),
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

function decodeXml(value) {
  return String(value)
    .replace(/&#xa;/giu, '\n')
    .replace(/&#10;/gu, '\n')
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

const normalizedLabel = value => decodeXml(value).replace(/\s+/gu, ' ').trim();

function drawioCells(xml) {
  const tags = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
  const childEdgeLabels = tags.filter(tag => readAttribute(tag, 'style').split(';').includes('edgeLabel'));
  return {
    nodes: tags.filter(tag => (
      readAttribute(tag, 'vertex') === '1'
      && !readAttribute(tag, 'style').split(';').includes('edgeLabel')
    )),
    edges: tags.filter(tag => readAttribute(tag, 'edge') === '1'),
    childEdgeLabels,
  };
}

function formalGraph(xml, arch, context) {
  const cells = drawioCells(xml);
  assert.equal(cells.nodes.length, arch.nodes.length, `${context} Draw.io node count`);
  assert.equal(cells.edges.length, arch.edges.length, `${context} Draw.io edge count`);
  assert.deepEqual(
    cells.nodes.map(tag => normalizedLabel(readAttribute(tag, 'value'))),
    arch.nodes.map(node => normalizedLabel(node.label)),
    `${context} Draw.io node order and labels`,
  );
  const cellIdToNodeId = new Map(
    cells.nodes.map((tag, index) => [readAttribute(tag, 'id'), arch.nodes[index].id]),
  );
  return {
    cells,
    edges: cells.edges.map(tag => ({
      from: cellIdToNodeId.get(readAttribute(tag, 'source')),
      to: cellIdToNodeId.get(readAttribute(tag, 'target')),
      label: normalizedLabel(readAttribute(tag, 'value')),
      style: readAttribute(tag, 'style'),
    })),
  };
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('keeps all six A11v formal packages synchronized with bilingual sources and fallbacks', () => {
  for (const id of formalBenchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual geometry`);
    assert.equal(en.nodes.length, expectedCounts.get(id).nodes, `${id}.en nodes`);
    assert.equal(en.edges.length, expectedCounts.get(id).edges, `${id}.en edges`);
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u, `${id}.en language`);
    assert.ok(zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))), `${id}.zh semantics`);
    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      const arch = readArch(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec), `${id}.${language} exact arch`);
      assert.deepEqual(arch.counts, {
        ...expectedCounts.get(id),
        modules: (spec.modules ?? []).length,
      }, `${id}.${language} arch counts`);
      assert.equal(detail[`flowchart_${language}`], renderFallback(spec), `${id}.${language} source fallback`);
      assert.equal(detail[`flowchart_${language}`], renderFallback(arch), `${id}.${language} arch fallback`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
  }
});

test("keeps source topology independent of optional exports: paper_review_site_a11v", () => {
  for (const id of formalBenchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal topology`);
  }
});

test('publishes all six A11v packages as parent-labeled Draw.io, fixed-light SVG, and PNG', () => {
  for (const id of formalBenchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal topology`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const formal = formalGraph(drawio, arch, `${id}.${language}`);
      assert.deepEqual(
        formal.edges.map(({ from, to, label }) => ({ from, to, label })),
        arch.edges.map(edge => ({
          from: edge.from,
          to: edge.to,
          label: normalizedLabel(edge.label ?? ''),
        })),
        `${id}.${language} Draw.io edges`,
      );
      assert.equal(formal.cells.childEdgeLabels.length, 0, `${id}.${language} child edge labels`);
      for (const [index, edge] of arch.edges.entries()) {
        const style = formal.edges[index].style;
        if (edge.type === 'secondary') {
          assert.match(style, /(?:^|;)dashed=1(?:;|$)/u, `${id}.${language} dashed boundary`);
        } else {
          assert.doesNotMatch(style, /(?:^|;)dashed=1(?:;|$)/u, `${id}.${language} primary edge`);
        }
      }
      assert.match(drawio, /<mxGraphModel[^>]*\bmath="0"[^>]*\bbackground="#FFFFFF"/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      for (const tag of [...formal.cells.nodes, ...formal.cells.edges]) {
        const style = readAttribute(tag, 'style');
        assert.match(style, /(?:^|;)html=0(?:;|$)/u, `${id}.${language} native text`);
        assert.match(style, /(?:^|;)convertToSvg=1(?:;|$)/u, `${id}.${language} SVG conversion`);
      }
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/iu);
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language} PNG size`);
    }
  }
});

test('reproduces all twelve A11v SVG and PNG exports byte-for-byte', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11v-exports-'));
  let exportCount = 0;
  try {
    for (const id of formalBenchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const svg = join(tempRoot, `${id}.${language}.svg`);
        const png = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x',
          '-f',
          'svg',
          '--svg-theme',
          'light',
          '-o',
          svg,
          `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, svg], { stdio: 'pipe' });
        assertSvgFidelity(svg, `${base}.svg`, `${id}.${language}.svg bytes`);
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'png', '-o', png, `${base}.drawio`],
          { stdio: 'pipe' },
        );
        assertPngFidelity(png, `${base}.png`, `${id}.${language}.png fidelity`);
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and parent-normalizes all twelve A11v specs without drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11v-builds-'));
  let rebuildCount = 0;
  try {
    for (const id of formalBenchmarkIds) {
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
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}.drawio bytes`);
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
          `${id}.${language}.arch bytes`,
        );
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
