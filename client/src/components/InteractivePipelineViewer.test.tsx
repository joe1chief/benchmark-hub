import { layoutPipeline, pipelineEdgeGeometry } from '@/lib/pipelineLayout';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { XMLParser } from 'fast-xml-parser';
import InteractivePipelineViewer, { PipelineEdge } from './InteractivePipelineViewer';
import type { Benchmark } from '@/types/benchmark';
import { LangProvider } from '@/contexts/LangContext';

const mockBenchmark = {
  id: 'ARC-AGI-2',
  name: 'ARC-AGI-2',
  l1: '通用推理',
  l1_color: '#3B82F6',
  l2: '抽象推理',
  intro: 'ARC-AGI-2 基准测试',
  paper_url: 'https://arxiv.org/abs/2505.11831',
  arxiv_pdf_url: 'https://arxiv.org/pdf/2505.11831',
  pdf_cdn_url: '',
  published: '2025-05',
  year: '2025',
  org: 'ARC Prize',
  build_method: '人工设计与校验',
  metric: 'Task Accuracy',
  openness: 'open',
  modality: '视觉/网格',
  language: 'en',
  task_type: '推理',
  difficulty: '前沿',
  eval_feature: '两阶段评测',
  scale: '1000 tasks',
  has_leaderboard: true,
  pdf_filename: 'arc.pdf',
  family: 'ARC',
  variant: '2',
  widely_tested: true,
  related_benchmarks: [],
  homepage: 'https://arcprize.org',
  drawio_flowchart_en: 'drawio/ARC-AGI-2/ARC-AGI-2.en.svg',
  drawio_flowchart_zh: 'drawio/ARC-AGI-2/ARC-AGI-2.zh.svg',
} as unknown as Benchmark;

describe('InteractivePipelineViewer', () => {
  it('renders loading state initially during server/static render', () => {
    const html = renderToStaticMarkup(
      <LangProvider>
        <InteractivePipelineViewer benchmark={mockBenchmark} isDark={true} />
      </LangProvider>
    );
    expect(html).toContain('animate-spin');
  });
});


const graphOf = (ids: string[], pairs: [string, string][]) => ({
  nodes: ids.map(id => ({ id, label: id })),
  edges: pairs.map(([from, to]) => ({ from, to })),
});
const positions = (result: ReturnType<typeof layoutPipeline>) => result.laidOutNodes
  .map(({ id, layer, row, x, y }) => ({ id, layer, row, x, y }));

function verifyComplete(graph: ReturnType<typeof graphOf>) {
  const before = JSON.stringify(graph);
  const result = layoutPipeline(graph);
  expect(result.laidOutNodes.map(node => node.id)).toEqual(graph.nodes.map(node => node.id));
  expect(result.edges).toBe(graph.edges);
  expect(JSON.stringify(graph)).toBe(before);
  for (const node of result.laidOutNodes) {
    expect([node.layer, node.column, node.row, node.x, node.y].every(Number.isFinite)).toBe(true);
    expect(node.layer).toBeGreaterThanOrEqual(0);
    expect(node.layer).toBeLessThan(graph.nodes.length);
    expect(node.x).toBe(node.layer * 290 + 40);
    expect(node.y).toBe(node.row * 160 + 40);
    expect(result.nodeMap.get(node.id)).toBe(node);
  }
  return result;
}

describe('cycle-safe pipeline layout', () => {
  it('keeps DAG multi-parent longest paths and original row order', () => {
    const graph = graphOf(['root', 'short', 'join', 'long', 'middle', 'end'], [
      ['root', 'short'], ['short', 'join'], ['root', 'long'],
      ['long', 'middle'], ['middle', 'join'], ['join', 'end'],
    ]);
    const result = verifyComplete(graph);
    expect(positions(result)).toEqual([
      { id: 'root', layer: 0, row: 0, x: 40, y: 40 },
      { id: 'short', layer: 1, row: 0, x: 330, y: 40 },
      { id: 'join', layer: 3, row: 0, x: 910, y: 40 },
      { id: 'long', layer: 1, row: 1, x: 330, y: 200 },
      { id: 'middle', layer: 2, row: 0, x: 620, y: 40 },
      { id: 'end', layer: 4, row: 0, x: 1200, y: 40 },
    ]);
    expect(result.maxLayers).toBe(5);
    expect(result.maxRowHeight).toBe(440);
  });

  it('condenses a root-reachable repair loop without losing downstream ranks or feedback edges', () => {
    const graph = graphOf(['root', 'review', 'prepare', 'release', 'score'], [
      ['root', 'prepare'], ['prepare', 'review'], ['review', 'prepare'],
      ['review', 'release'], ['release', 'score'],
    ]);
    const result = verifyComplete(graph);
    expect(result.laidOutNodes.map(node => [node.id, node.layer, node.row])).toEqual([
      ['root', 0, 0], ['review', 1, 0], ['prepare', 1, 1], ['release', 2, 0], ['score', 3, 0],
    ]);
    expect(result.edges).toContainEqual({ from: 'review', to: 'prepare' });
  });

  it('lays out a pure cycle with no root, in input order', () => {
    const result = verifyComplete(graphOf(['c', 'a', 'b'], [['a', 'b'], ['b', 'c'], ['c', 'a']]));
    expect(result.laidOutNodes.map(node => [node.layer, node.row])).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(result.maxRowHeight).toBe(600);
  });

  it('keeps self-loops and advances their downstream nodes', () => {
    const result = verifyComplete(graphOf(['loop', 'end'], [['loop', 'loop'], ['loop', 'end']]));
    expect(result.laidOutNodes.map(node => node.layer)).toEqual([0, 1]);
    expect(result.edges).toHaveLength(2);
  });

  it('ranks disconnected DAGs, cycles and isolated nodes without inventing connections', () => {
    const graph = graphOf(['isolated', 'a', 'b', 'root', 'leaf', 'cycleEnd'], [
      ['a', 'b'], ['b', 'a'], ['b', 'cycleEnd'], ['root', 'leaf'],
    ]);
    const result = verifyComplete(graph);
    expect(result.laidOutNodes.map(node => [node.layer, node.row])).toEqual([
      [0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1],
    ]);
  });

  it('deduplicates condensation links only, preserving parallel original edges', () => {
    const graph = graphOf(['a', 'b', 'c', 'd'], [
      ['a', 'b'], ['b', 'a'], ['a', 'c'], ['b', 'c'], ['b', 'c'], ['c', 'd'],
    ]);
    const result = verifyComplete(graph);
    expect(result.laidOutNodes.map(node => node.layer)).toEqual([0, 0, 1, 2]);
    expect(result.edges).toHaveLength(6);
  });

  it('does not mutate frozen nodes, preexisting coordinates, edges or metadata', () => {
    const graph = Object.freeze({
      nodes: Object.freeze([
        Object.freeze({ id: 'a', label: 'Source', x: 999, y: 888, row: 42 }),
        Object.freeze({ id: 'b', label: 'Target', x: 777, y: 666, row: 24 }),
      ]),
      edges: Object.freeze([Object.freeze({ from: 'a', to: 'b', type: 'optional', label: 'Feedback' })]),
    });
    const result = layoutPipeline(graph);
    expect(result.laidOutNodes[0]).not.toBe(graph.nodes[0]);
    expect(result.laidOutNodes[0].x).toBe(40);
    expect(graph.nodes[0].x).toBe(999);
    expect(result.edges).toBe(graph.edges);
  });

  it('handles a long cycle without recursion limits', () => {
    const count = 12000;
    const nodes = Array.from({ length: count }, (_, index) => ({ id: String(index) }));
    const edges = nodes.map((node, index) => ({ from: node.id, to: String((index + 1) % count) }));
    const result = layoutPipeline({ nodes, edges });
    expect(result.laidOutNodes).toHaveLength(count);
    expect(result.laidOutNodes.every(node => node.layer === 0 && Number.isFinite(node.y))).toBe(true);
    expect(result.laidOutNodes[count - 1].row).toBe(count - 1);
    expect(result.edges).toBe(edges);
  });

  it('preserves unloaded and empty graph extents', () => {
    expect(layoutPipeline(null)).toMatchObject({ laidOutNodes: [], maxLayers: 0, maxRowHeight: 0 });
    expect(layoutPipeline({ nodes: [], edges: [] })).toMatchObject({ laidOutNodes: [], maxLayers: 1, maxRowHeight: 120 });
  });
});


describe('pipeline edge routes and visible branch semantics', () => {
  const upper = Object.freeze({ id: 'upper', x: 40, y: 40 });
  const lower = Object.freeze({ id: 'lower', x: 40, y: 200 });
  const right = Object.freeze({ id: 'right', x: 330, y: 40 });

  it('preserves the ordinary forward Bezier coordinates', () => {
    expect(pipelineEdgeGeometry(upper, right)).toEqual({
      d: 'M 280 95 C 320 95, 290 95, 330 95', labelX: 305, labelY: 87,
    });
    expect(pipelineEdgeGeometry(upper, { ...right, y: 200 }).d)
      .toBe('M 280 95 C 320 95, 290 255, 330 255');
  });

  it('routes same-column downward edges outside the right card boundary', () => {
    expect(pipelineEdgeGeometry(upper, lower)).toEqual({
      d: 'M 280 95 C 304 95, 304 255, 280 255', labelX: 304, labelY: 167,
    });
  });

  it('routes upward feedback outside the left card boundary', () => {
    expect(pipelineEdgeGeometry(lower, upper)).toEqual({
      d: 'M 40 255 C 16 255, 16 95, 40 95', labelX: 16, labelY: 167,
    });
  });

  it('routes a self-loop outside the card using two distinct right-side ports', () => {
    expect(pipelineEdgeGeometry(upper, upper)).toEqual({
      d: 'M 280 120 C 320 120, 320 70, 280 70', labelX: 312, labelY: 87,
    });
    expect(upper).toEqual({ id: 'upper', x: 40, y: 40 });
  });

  it.each(['primary', 'optional', 'evidence', 'data', 'dashed', undefined])(
    'renders %s edges with visible source labels and the correct SVG dash style', type => {
      const edge = Object.freeze({ from: lower.id, to: upper.id, type, label: 'Repair < 2 / 修订后复验' });
      for (const isDark of [false, true]) {
        const html = renderToStaticMarkup(<svg><PipelineEdge edge={edge} from={lower} to={upper}
          isDark={isDark} isHighlighted /></svg>);
        const tree = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(html);
        expect(tree.svg.g.path.d).toBe('M 40 255 C 16 255, 16 95, 40 95');
        expect(tree.svg.g.path['stroke-dasharray']).toBe(type === 'primary' ? 'none' : '5,5');
        expect(tree.svg.g.text['#text']).toBe(edge.label);
        expect(Number(tree.svg.g.text.x)).toBe(16);
        expect(Number(tree.svg.g.text.y)).toBe(167);
        expect(tree.svg.g.circle.animateMotion.path).toBe(tree.svg.g.path.d);
        expect(edge.label).toBe('Repair < 2 / 修订后复验');
      }
    },
  );
});
