import { BuildProcessCards } from './BuildProcessCards';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HtmlBuildProcessView from './HtmlBuildProcessView';
import type { Benchmark } from '@/types/benchmark';

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

describe('HtmlBuildProcessView', () => {
  it('renders paper grounding banner and build method metrics', () => {
    const html = renderToStaticMarkup(
      <HtmlBuildProcessView benchmark={mockBenchmark} isDark={true} isEn={true} />
    );
    expect(html).toContain('Paper-Grounded Build Architecture');
    expect(html).toContain('Pass@2 pixel-exact full-task correctness');
    expect(html).toContain('100% Paper Aligned');
  });

  it('renders Chinese localized labels when isEn is false', () => {
    const html = renderToStaticMarkup(
      <HtmlBuildProcessView benchmark={mockBenchmark} isDark={true} isEn={false} />
    );
    expect(html).toContain('基于论文的构建方法与流程拓扑');
    expect(html).toContain('Pass@2像素级精确整题正确率');
  });
});


it('keeps the stage-card renderer rich and labels every branch without exposing internal IDs', () => {
  const nodes = [
    { id: 'private_check', type: 'decision', label: '人工复验\n逐项核对证据\n保留完整说明' },
    { id: 'private_repair', type: 'process', label: '修复候选\n重新提交' },
  ];
  const html = renderToStaticMarkup(<BuildProcessCards nodes={nodes} allNodes={nodes}
    edges={[{ from: 'private_check', to: 'private_repair', label: '未通过' },
      { from: 'private_repair', to: 'private_check', label: '再次复验' }]}
    isEn={false} isDark selectedNodeId="private_check" onSelect={() => {}} />);
  const text = html.replace(/<[^>]*>/g, '');
  expect(html.match(/<article /g)).toHaveLength(2);
  for (const value of ['人工复验', '逐项核对证据', '保留完整说明', '修复候选', '重新提交', '未通过', '再次复验']) {
    expect(text).toContain(value);
  }
  expect(text).not.toContain('private_');
  expect(html).toContain('aria-pressed="true"');
});
