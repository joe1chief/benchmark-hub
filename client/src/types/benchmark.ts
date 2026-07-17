export interface Benchmark {
  id: string;
  name: string;
  l1: string;
  l1_color: string;
  l2: string;
  intro: string;
  paper_url: string;
  arxiv_pdf_url: string;
  pdf_cdn_url: string;
  published: string;
  year: string;
  org: string;
  build_method: string;
  metric: string;
  openness: string;       // 'public' | 'partly public' | 'in-house'
  modality: string;
  language: string;
  task_type: string;
  difficulty: string;
  eval_feature: string;
  scale: string;
  has_leaderboard: boolean;
  pdf_filename: string;
  // Family & variant
  family: string;         // Family name, empty if standalone
  variant: string;        // Variant/version name within family
  widely_tested: boolean; // Medal: widely tested by major LLM tech reports
  related_benchmarks: string[]; // Canonical benchmark IDs or unique display names
  homepage: string;       // Official homepage URL
  // English i18n fields
  l1_en?: string;
  l2_en?: string;
  difficulty_en?: string;
  openness_en?: string;
  modality_en?: string;
  task_type_en?: string;
  build_method_en?: string;
  eval_feature_en?: string;
  intro_en?: string;
  language_en?: string;
  scale_en?: string;
  metric_en?: string;
  // Flowchart fields
  mermaid_flowchart?: string | null;
  flowchart_en?: string;
  flowchart_zh?: string;
  drawio_flowchart_en?: string;
  drawio_flowchart_zh?: string;
  drawio_source_en?: string;
  drawio_source_zh?: string;
  drawio_spec_en?: string;
  drawio_spec_zh?: string;
  drawio_arch_en?: string;
  drawio_arch_zh?: string;
  drawio_review_note?: string;
  // Default taxonomy fields
  default_l1?: string;
  default_l2?: string;
}

export const L1_CATEGORIES = [
  '通用语言能力',
  'Agent能力',
  '多模态理解',
  '代码能力',
  '科学推理',
  '安全对齐',
  '数学推理',
  '长文本理解',
  '医疗健康',
  '视频理解',
  '图表与文档理解',
  '空间与3D理解',
] as const;

export const DIFFICULTY_LEVELS = ['前沿', '专家', '进阶', '基础'] as const;

export const OPENNESS_LEVELS = ['public', 'partly public', 'in-house'] as const;

export const YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012'] as const;
