import { BuildProcessLanes, BuildProcessCards } from './BuildProcessCards';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { partitionBuildProcess } from '@/lib/buildProcessStages';
import { renderToStaticMarkup } from 'react-dom/server';
import PureHtmlFlowchart from './PureHtmlFlowchart';
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
  build_method: '高认知复杂度任务过量生成, 测试子对级人类筛选',
  build_method_en: 'Over-generation of higher-cognitive-complexity tasks',
  metric: 'Pass@2像素级精确整题正确率',
  metric_en: 'Pass@2 pixel-exact full-task correctness',
  openness: 'open',
  modality: '视觉/网格',
  language: 'en',
  task_type: '推理',
  difficulty: '前沿',
  eval_feature: '两阶段评测',
  eval_feature_en: 'Two-stage protocol',
  scale: '1000 tasks',
  scale_en: '1000 tasks',
  has_leaderboard: true,
  pdf_filename: 'arc.pdf',
  family: 'ARC',
  variant: '2',
  widely_tested: true,
  related_benchmarks: [],
  homepage: 'https://arcprize.org',
  drawio_flowchart_en: 'drawio/ARC-AGI-2/ARC-AGI-2.en.svg',
  drawio_flowchart_zh: 'drawio/ARC-AGI-2/ARC-AGI-2.zh.svg',
  drawio_review_note: 'Reviewed against arXiv:2505.11831v2 §4.1–§4.4',
} as unknown as Benchmark;

describe('PureHtmlFlowchart', () => {
  it('renders native CSS+HTML flowchart header and controls', () => {
    const html = renderToStaticMarkup(
      <LangProvider>
        <PureHtmlFlowchart benchmark={mockBenchmark} isDark={true} />
      </LangProvider>
    );
    expect(html).toContain('Pure CSS+HTML Native Flowchart');
    expect(html).toContain('Swimlane Flow');
  });
});

// Shared by the native flowchart and stage-card view. Keep these regressions in
// the existing frontend CI entrypoint so test:build-process runs them as well.

const ids = (nodes: { id: string }[]) => nodes.map(node => node.id);
const readArch = (id: string, lang: string) => JSON.parse(readFileSync(
  new URL(`../../public/drawio/${id}/${id}.${lang}.arch.json`, import.meta.url), 'utf8',
));

describe('explicit build-process stage membership', () => {
  it('uses nodes and nodeIds lists before legacy node.module, ignoring labels and position', () => {
    const nodes = [
      { id: 'score', label: 'Judge / 评测', module: 'evaluation' },
      { id: 'repair', label: 'Revalidate inference test' },
      { id: 'source', label: 'Dataset construction' },
    ];
    const result = partitionBuildProcess({ nodes, modules: [
      { id: 'construction', nodes: ['repair', 'score'] },
      { id: 'evaluation', nodeIds: ['source'] },
    ] });
    expect(ids(result.constructionNodes)).toEqual(['score', 'repair']);
    expect(ids(result.evaluationNodes)).toEqual(['source']);
    expect(result.unassignedNodes).toEqual([]);
  });

  it('keeps missing, unknown and conflicting assignments neutral without duplicating nodes', () => {
    const nodes = ['shared', 'unknown', 'missing', 'duplicate'].map(id => ({ id }));
    const result = partitionBuildProcess({ nodes, modules: [
      { id: 'construction_track', nodes: ['shared', 'duplicate', 'duplicate', 'absent'] },
      { id: 'evaluation_track', nodeIds: ['shared'] },
      { id: 'track_b', nodes: ['unknown'] },
    ] });
    expect(ids(result.unassignedNodes)).toEqual(['shared', 'unknown', 'missing']);
    expect(ids(result.constructionNodes)).toEqual(['duplicate']);
    expect(result.evaluationNodes).toEqual([]);
    expect(result.allNodes).toBe(nodes);
  });

  it('supports legacy node.module only when its module is declared', () => {
    const result = partitionBuildProcess({ nodes: [
      { id: 'a', module: 'build' }, { id: 'b', module: 'evaluate' },
      { id: 'c', module: 'construction' },
    ], modules: [{ id: 'build' }, { id: 'evaluate' }] });
    expect(ids(result.constructionNodes)).toEqual(['a']);
    expect(ids(result.evaluationNodes)).toEqual(['b']);
    expect(ids(result.unassignedNodes)).toEqual(['c']);
  });

  it('preserves all edges including cycles and cross-stage links, and does not mutate the graph', () => {
    const arch = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [
      { from: 'a', to: 'b', label: 'accept' }, { from: 'b', to: 'a', label: 'repair' },
    ], modules: [{ id: 'construction', nodes: ['a'] }, { id: 'evaluation', nodes: ['b'] }] };
    const before = JSON.stringify(arch);
    const result = partitionBuildProcess(arch);
    expect(result.edges).toBe(arch.edges);
    expect(result.nodeMap.get('a')).toBe(arch.nodes[0]);
    expect(JSON.stringify(arch)).toBe(before);
  });

  it('keeps GAIA repair, revalidate and solvers neutral in both languages when modules are absent', () => {
    for (const lang of ['en', 'zh']) {
      const arch = readArch('GAIA', lang);
      const result = partitionBuildProcess(arch);
      expect(ids(result.unassignedNodes)).toEqual(ids(arch.nodes));
      expect(ids(result.unassignedNodes)).toEqual(expect.arrayContaining(['repair', 'revalidate', 'solvers']));
      expect(result.constructionNodes).toEqual([]);
      expect(result.evaluationNodes).toEqual([]);
      expect(result.edges).toBe(arch.edges);
    }
  });

  it('keeps phase membership language independent with explicit nodeIds', () => {
    const modules = [
      { id: 'construction', nodeIds: ['repair', 'revalidate'] },
      { id: 'evaluation', nodeIds: ['measure'] },
    ];
    const en = partitionBuildProcess({ nodes: [
      { id: 'repair', label: 'Repair inference tests' },
      { id: 'revalidate', label: 'Judge quality' },
      { id: 'measure', label: 'Dataset' },
    ], modules });
    const zh = partitionBuildProcess({ nodes: [
      { id: 'repair', label: '修复' }, { id: 'revalidate', label: '复验' },
      { id: 'measure', label: '指标' },
    ], modules });
    expect(ids(en.constructionNodes)).toEqual(['repair', 'revalidate']);
    expect(ids(en.constructionNodes)).toEqual(ids(zh.constructionNodes));
    expect(ids(en.evaluationNodes)).toEqual(ids(zh.evaluationNodes));
  });

  it('handles an unloaded graph', () => {
    const result = partitionBuildProcess(null);
    expect(result.allNodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});


const neutralGraph = {
  modules: [],
  nodes: [
    { id: 'internal_gate', type: 'decision', label: 'Quality review\nIndependent reviewers\nKeep all evidence\nCheck every criterion' },
    { id: 'internal_fix', type: 'process', label: 'Repair candidate\nCorrect the reported issue' },
    { id: 'internal_keep', type: 'terminal', label: 'Validated collection\nPreserve approved samples' },
  ],
  edges: [
    { from: 'internal_gate', to: 'internal_fix', label: 'Needs repair' },
    { from: 'internal_gate', to: 'internal_keep', label: 'Accepted' },
    { from: 'internal_fix', to: 'internal_gate', label: 'Revalidate' },
  ],
};

describe('neutral pipeline UI', () => {
  it.each([true, false])('renders rich wrapping cards and readable branch outcomes (English: %s)', isEn => {
    const html = renderToStaticMarkup(<BuildProcessLanes arch={neutralGraph} isEn={isEn} isDark={false}
      selectedNodeId="internal_fix" onSelect={() => {}} />);
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toContain(isEn ? 'Pipeline' : '流程');
    expect(html.match(/<article /g)).toHaveLength(3);
    expect(html).toContain('grid-cols-1 md:grid-cols-2 xl:grid-cols-3');
    for (const node of neutralGraph.nodes) {
      for (const line of node.label.split('\n')) expect(text).toContain(line);
      expect(text).not.toContain(node.id);
    }
    for (const edge of neutralGraph.edges) expect(text).toContain(edge.label);
    expect(html).toContain('aria-pressed="true"');
    expect(text).not.toContain('Evaluation &amp; Scoring Protocol');
    expect(text).not.toContain('Dataset Construction Pipeline');
    expect(text).not.toContain('未指定阶段');
  });

  it('uses Other pipeline steps only for a partially assigned graph', () => {
    const html = renderToStaticMarkup(<BuildProcessLanes
      arch={{ ...neutralGraph, modules: [{ id: 'construction', nodeIds: ['internal_gate'] }] }}
      isEn isDark selectedNodeId={null} onSelect={() => {}} />);
    expect(html).toContain('Other pipeline steps');
    expect(html.match(/<article /g)).toHaveLength(3);
    expect(html).toContain('Needs repair');
  });
});


describe('typed pipeline connections', () => {
  it.each(['primary', 'evidence', 'optional', 'data', 'unknown', undefined])(
    'renders %s connections with the correct line style and original label', type => {
      const html = renderToStaticMarkup(<BuildProcessCards
        nodes={neutralGraph.nodes} allNodes={neutralGraph.nodes}
        edges={[{ from: 'internal_gate', to: 'internal_fix', type, label: 'Needs repair' }]}
        isEn isDark={false} selectedNodeId={null} onSelect={() => {}} />);
      expect(html).toContain('d="M1 7H25"');
      if (type === 'primary') expect(html).not.toContain('stroke-dasharray');
      else expect(html).toContain('stroke-dasharray="3 3"');
      const text = html.replace(/<[^>]*>/g, '');
      expect(text).toContain('Needs repair');
      expect(text).toContain('Repair candidate');
      expect(text).not.toContain('internal_');
    },
  );
});
