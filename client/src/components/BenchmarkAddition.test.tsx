import { PipelineEdge } from './InteractivePipelineViewer';
import { layoutPipeline } from '@/lib/pipelineLayout';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseYaml } from 'yaml';
import { BuildProcessCards, BuildProcessLanes, type ProcessGraph } from './BuildProcessCards';
import BenchmarkDrawer from './BenchmarkDrawer';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LangProvider } from '@/contexts/LangContext';
import type { Benchmark } from '@/types/benchmark';

type Language = 'en' | 'zh';
type Spec = ProcessGraph & { meta: Record<string, unknown> };
interface PackageInput {
  format: string;
  benchmark: Benchmark;
  evidence: Record<string, unknown>;
  specs: Record<Language, Spec>;
}
interface CompiledPackage {
  id: string;
  benchmark: Benchmark;
  manifest: Record<string, unknown>;
  specs: Record<Language, string>;
  models: Record<Language, ProcessGraph>;
}
type Compiler = (input: PackageInput, options: { catalog: Benchmark[] }) => CompiledPackage;

const root = new URL('../../../', import.meta.url);
const roundTrip = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
let input: PackageInput;
let generated: CompiledPackage;
let serialized: CompiledPackage;
let regenerated: CompiledPackage;

beforeAll(async () => {
  // Use the production package compiler and maintained fixture. No fallback
  // fixture, skipped tests, generated data writes, or exporter subprocesses.
  const moduleUrl = new URL('scripts/benchmark_catalog/benchmark_package.mjs', root).href;
  const { compileBenchmarkPackage } = await import(/* @vite-ignore */ moduleUrl) as {
    compileBenchmarkPackage: Compiler;
  };
  input = JSON.parse(readFileSync(new URL('scripts/benchmark_catalog/fixtures/new-benchmark.json', root), 'utf8'));
  const catalog: Benchmark[] = JSON.parse(readFileSync(new URL('client/public/benchmarks.json', root), 'utf8'));
  expect(catalog.some(entry => entry.id === input.benchmark.id)).toBe(false);
  generated = compileBenchmarkPackage(roundTrip(input), { catalog: roundTrip(catalog) });
  serialized = roundTrip(generated);
  // Recompile the emitted YAML, not just the original object a second time.
  regenerated = compileBenchmarkPackage({
    ...roundTrip(input),
    specs: { en: parseYaml(serialized.specs.en), zh: parseYaml(serialized.specs.zh) },
  }, { catalog: roundTrip(catalog) });
});

afterEach(() => vi.unstubAllGlobals());

// Parse the actual SSR output as a tree. Do not strip HTML with a regexp:
// escaped labels, nested icons, attributes, and per-card boundaries matter.
type XmlNode = Record<string, unknown>;
interface Element { name: string; attributes: Record<string, unknown>; children: XmlNode[] }
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false,
  attributeNamePrefix: '', parseTagValue: false, trimValues: false });
function elements(tree: XmlNode[], name: string): Element[] {
  return tree.flatMap(node => Object.entries(node).flatMap(([tag, children]) => {
    if (!Array.isArray(children)) return [];
    const element = { name: tag, attributes: (node[':@'] ?? {}) as Record<string, unknown>, children };
    return [...(tag === name ? [element] : []), ...elements(children, name)];
  }));
}
function textContent(tree: XmlNode[]): string {
  return tree.flatMap(node => Object.entries(node).flatMap(([tag, value]) => {
    if (tag === '#text') return [String(value)];
    return Array.isArray(value) ? [textContent(value)] : [];
  })).join(' ');
}
function parseMarkup(html: string): XmlNode[] { return parser.parse(html); }
function title(label: string): string { return label.split('\n').map(line => line.trim()).find(Boolean)!; }
function cardsIn(tree: XmlNode[]): Element[] { return elements(tree, 'article'); }
function cardTitles(tree: XmlNode[]): string[] {
  return cardsIn(tree).map(card => textContent(elements(card.children, 'h5')[0].children));
}
function expectedMembers(spec: Spec, moduleIds: string[]): string[] {
  const modules = spec.modules?.filter(module => moduleIds.includes(module.id)) ?? [];
  const listed = modules.flatMap(module => [...(module.nodes ?? []), ...(module.nodeIds ?? [])]);
  return spec.nodes.filter(node => listed.includes(node.id)
    || modules.some(module => module.id === node.module)).map(node => title(node.label));
}

function verifyCards(tree: XmlNode[], graph: ProcessGraph) {
  const cards = cardsIn(tree);
  expect(cards).toHaveLength(graph.nodes.length);
  expect(cardTitles(tree).sort()).toEqual(graph.nodes.map(node => title(node.label)).sort());
  for (const node of graph.nodes) {
    const card = cards.find(candidate => textContent(elements(candidate.children, 'h5')[0].children) === title(node.label))!;
    const cardText = textContent(card.children);
    for (const line of node.label.split('\n').map(line => line.trim()).filter(Boolean)) {
      expect(cardText).toContain(line);
    }
    const transitions = graph.edges.filter(edge => edge.from === node.id);
    const arrows = elements(card.children, 'path').filter(path => path.attributes.d === 'M1 7H25');
    expect(arrows).toHaveLength(transitions.length);
    transitions.forEach((edge, index) => {
      if (edge.label) expect(cardText).toContain(edge.label);
      const target = graph.nodes.find(candidate => candidate.id === edge.to)!;
      expect(cardText).toContain(title(target.label));
      expect(arrows[index].attributes['stroke-dasharray']).toBe(edge.type === 'primary' ? undefined : '3 3');
    });
  }
}

const cases = [
  { lang: 'en' as const, isDark: false }, { lang: 'en' as const, isDark: true },
  { lang: 'zh' as const, isDark: false }, { lang: 'zh' as const, isDark: true },
];

describe('new benchmark package → shared HTML views', () => {
  it('preserves source labels, graph structure and deterministic models through JSON and emitted YAML', () => {
    expect(serialized.models).toEqual(generated.models);
    expect(regenerated.models).toEqual(generated.models);
    expect(regenerated.benchmark).toEqual(generated.benchmark);
    expect(regenerated.manifest).toEqual(generated.manifest);
    for (const lang of ['en', 'zh'] as const) {
      const spec = input.specs[lang];
      const model = generated.models[lang];
      expect(model.nodes.map(node => [node.id, node.label])).toEqual(spec.nodes.map(node => [node.id, node.label]));
      expect(model.edges.map(edge => [edge.from, edge.to, edge.label])).toEqual(spec.edges.map(edge => [edge.from, edge.to, edge.label]));
      // Ensure the maintained fixture actually exercises branching and explicit phases.
      expect(spec.nodes.some(node => node.type === 'decision'
        && spec.edges.filter(edge => edge.from === node.id && edge.label).length >= 2)).toBe(true);
      expect(expectedMembers(spec, ['construction', 'construction_track', 'build']).length).toBeGreaterThan(0);
      expect(expectedMembers(spec, ['evaluation', 'evaluation_track', 'evaluate']).length).toBeGreaterThan(0);
    }
    expect(generated.models.en.nodes.map(node => [node.id, node.type])).toEqual(generated.models.zh.nodes.map(node => [node.id, node.type]));
    expect(generated.models.en.edges.map(edge => [edge.from, edge.to, edge.type])).toEqual(generated.models.zh.edges.map(edge => [edge.from, edge.to, edge.type]));
  });

  it.each(cases)('renders identical complete Cards/Lanes after regeneration: $lang, dark=$isDark', ({ lang, isDark }) => {
    const graph = generated.models[lang];
    const props = { isEn: lang === 'en', isDark, selectedNodeId: graph.nodes[0].id, onSelect: () => {} };
    const renderCards = (model: ProcessGraph) => renderToStaticMarkup(
      <BuildProcessCards {...props} nodes={model.nodes} allNodes={model.nodes} edges={model.edges} />,
    );
    const renderLanes = (model: ProcessGraph) => renderToStaticMarkup(<BuildProcessLanes {...props} arch={model} />);
    for (const render of [renderCards, renderLanes]) {
      const html = render(graph);
      expect(render(serialized.models[lang])).toBe(html);
      expect(render(regenerated.models[lang])).toBe(html);
      const tree = parseMarkup(html);
      verifyCards(tree, graph);
      expect(cardsIn(tree).every(card => String(card.attributes.class).includes(isDark ? 'text-slate-200' : 'text-slate-800'))).toBe(true);
      expect(elements(tree, 'button').filter(button => button.attributes['aria-pressed'] === 'true')).toHaveLength(1);
    }
    const sections = elements(parseMarkup(renderLanes(graph)), 'section');
    for (const [moduleIds, heading] of [
      [['construction', 'construction_track', 'build'], lang === 'en' ? 'Dataset Construction Pipeline' : '数据集构建流程'],
      [['evaluation', 'evaluation_track', 'evaluate'], lang === 'en' ? 'Evaluation & Scoring Protocol' : '评测与打分流程'],
    ] as const) {
      const section = sections.find(section => textContent(elements(section.children, 'h4')[0].children).startsWith(heading));
      expect(section).toBeDefined();
      expect(cardTitles(section!.children)).toEqual(expectedMembers(input.specs[lang], [...moduleIds]));
    }
  });

  it.each(cases)('enables the real Drawer from generated arch-only metadata: $lang, dark=$isDark', ({ lang, isDark }) => {
    expect(generated.id).toBe(input.benchmark.id);
    for (const language of ['en', 'zh'] as const) {
      expect(generated.benchmark[`drawio_arch_${language}`]).toBe(`drawio/${generated.id}/${generated.id}.${language}.arch.json`);
      expect(generated.benchmark[`drawio_flowchart_${language}`]).toBeFalsy();
      expect(generated.benchmark[`drawio_source_${language}`]).toBeFalsy();
    }
    // Remove compatibility text so it cannot accidentally satisfy availability.
    const archOnly: Benchmark = { ...serialized.benchmark,
      flowchart_en: '', flowchart_zh: '', mermaid_flowchart: null };
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'lang' ? lang : null });
    const renderDrawer = (benchmark: Benchmark) => parseMarkup(renderToStaticMarkup(
      <ThemeProvider defaultTheme={isDark ? 'dark' : 'light'}><LangProvider>
        <BenchmarkDrawer benchmark={benchmark} allBenchmarks={[benchmark]}
          onClose={() => {}} onSelectBenchmark={() => {}} />
      </LangProvider></ThemeProvider>,
    ));
    const findTab = (tree: XmlNode[]) => elements(tree, 'button')
      .find(button => textContent(button.children).trim() === (lang === 'en' ? 'Build Process' : '构建流程'));
    const tree = renderDrawer(archOnly);
    const tab = findTab(tree);
    expect(tab).toBeDefined();
    expect(tab!.attributes).not.toHaveProperty('disabled');
    expect(elements(tree, 'img')).toHaveLength(0);
    const unavailable = findTab(renderDrawer({ ...archOnly, drawio_arch_en: '', drawio_arch_zh: '' }));
    expect(unavailable).toBeDefined();
    expect(unavailable!.attributes).toHaveProperty('disabled');
  });
});


it('lays out the compiled six-node repair cycle identically across languages and regeneration', () => {
  const expected = [
    ['source', 0, 0, 40, 40], ['prepare', 1, 0, 330, 40],
    ['review', 1, 1, 330, 200], ['release', 2, 0, 620, 40],
    ['evaluate', 3, 0, 910, 40], ['score', 4, 0, 1200, 40],
  ];
  for (const pkg of [generated, serialized, regenerated]) {
    for (const lang of ['en', 'zh'] as const) {
      const graph = pkg.models[lang];
      const before = JSON.stringify(graph);
      const layout = layoutPipeline(graph);
      expect(layout.laidOutNodes.map(node => [node.id, node.layer, node.row, node.x, node.y])).toEqual(expected);
      expect(layout.laidOutNodes.map(node => node.label)).toEqual(graph.nodes.map(node => node.label));
      expect(layout.edges).toBe(graph.edges);
      expect(layout.edges).toHaveLength(6);
      expect(layout.edges.find(edge => edge.from === 'review' && edge.to === 'prepare')?.label)
        .toBe(lang === 'en' ? 'Repair and recheck' : '修订后复验');
      expect(JSON.stringify(graph)).toBe(before);
      expect(layout.maxLayers).toBe(5);
      expect(layout.maxRowHeight).toBe(440);
    }
  }
});


it.each(cases)('preserves compiled branch labels and feedback routes in actual topology SVG: $lang, dark=$isDark', ({ lang, isDark }) => {
  const renderEdges = (graph: ProcessGraph) => {
    const layout = layoutPipeline(graph);
    return renderToStaticMarkup(<svg>{graph.edges.map((edge, index) =>
      <PipelineEdge key={index} edge={edge} from={layout.nodeMap.get(edge.from)!}
        to={layout.nodeMap.get(edge.to)!} isDark={isDark} />,
    )}</svg>);
  };
  const graph = generated.models[lang];
  const before = JSON.stringify(graph);
  const html = renderEdges(graph);
  expect(renderEdges(serialized.models[lang])).toBe(html);
  expect(renderEdges(regenerated.models[lang])).toBe(html);
  const groups = elements(parseMarkup(html), 'g');
  expect(groups).toHaveLength(6);
  graph.edges.forEach((edge, index) => {
    const group = groups[index];
    const path = elements(group.children, 'path')[0];
    expect(path.attributes['stroke-dasharray']).toBe(edge.type === 'primary' ? 'none' : '5,5');
    const labels = elements(group.children, 'text');
    expect(labels).toHaveLength(edge.label ? 1 : 0);
    if (edge.label) expect(textContent(labels[0].children)).toBe(edge.label);
    if (edge.from === 'prepare' && edge.to === 'review') {
      expect(path.attributes.d).toBe('M 570 95 C 594 95, 594 255, 570 255');
    }
    if (edge.from === 'review' && edge.to === 'prepare') {
      expect(path.attributes.d).toBe('M 330 255 C 306 255, 306 95, 330 95');
    }
  });
  expect(JSON.stringify(graph)).toBe(before);
});
