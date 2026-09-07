import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InteractivePipelineViewer from './InteractivePipelineViewer';
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
