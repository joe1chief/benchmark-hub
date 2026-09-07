import { describe, expect, it } from 'vitest';
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
