import React, { createContext, useContext, useState, useCallback } from 'react';

export type Lang = 'zh' | 'en';

// ─── All UI strings ───────────────────────────────────────────────────────────
export const STRINGS = {
  zh: {
    // Navbar
    siteTitle: 'LLM Benchmark Costco',
    searchPlaceholder: '搜索名称、机构、分类…',
    benchmarks: '个基准',
    switchToLight: '切换浅色',
    switchToDark: '切换深色',
    poweredBy: '由',
    poweredBySuffix: '提供支持',

    // HeroStats
    heroTitle: 'LLM Benchmark Costco',
    heroDesc: (total: number, cats: number) =>
      `收录 ${total} 个大模型评测基准，涵盖 ${cats} 个能力维度。每条记录均附完整论文，支持在线阅读。`,
    statBenchmarks: '个基准',
    statDims: '能力维度',
    statFamilies: '基准家族',
    statWidely: '广泛采用',

    // FilterBar
    allCategories: '全部分类',
    allYears: '全部年份',
    allDifficulty: '全部难度',
    allModality: '全部模态',
    allOpenness: '全部开放性',
    sortNewest: '最新优先',
    sortOldest: '最早优先',
    sortName: '名称排序',
    widelyAdopted: '广泛采用',
    public: '公开',
    partlyPublic: '部分公开',
    inHouse: '内部',
    text: '文本',
    image: '图像',
    video: '视频',
    audio: '音频',
    multimodal: '多模态',
    frontier: '前沿',
    expert: '专家',
    advanced: '进阶',
    basic: '基础',

    // BenchmarkCard
    leaderboard: '排行榜',
    publicLabel: 'Public',
    partlyLabel: '部分公开',
    privateLabel: 'Private',

    // BenchmarkDrawer
    detailsTab: '详情',
    paperTab: '完整论文',
    paperNA: '(无)',
    widelyNotice: '该基准被 OpenAI、Google、Anthropic、Meta 等主流 AI 实验室广泛引用和测试。',
    actionHomepage: '主页',
    actionReadPaper: '阅读完整论文',
    actionPaperPage: '论文页面',
    actionDownload: '下载 PDF',
    sectionBasic: '基本信息',
    sectionEval: '评测信息',
    sectionFamily: '家族',
    sectionRelated: '相关基准',
    fieldPublished: '发布时间',
    fieldOrg: '机构',
    fieldModality: '模态',
    fieldLanguage: '语言',
    fieldTaskType: '任务类型',
    fieldScale: '规模',
    fieldBuildMethod: '构建方式',
    fieldMetric: '评估指标',
    fieldEvalFeature: '评测特点',
    fieldDataAccess: '数据访问',
    fieldLeaderboard: '排行榜',
    hasLeaderboard: '公开排行榜',
    noLeaderboard: '无',
    pdfLoading: '加载论文中',
    pdfError: '无法加载 PDF',
    pdfErrorDesc: '所有加载方式均失败，请直接打开。',
    retry: '重试',
    openDirectly: '直接打开',
    fullscreen: '全屏',
    collapse: '收起',
    viaLabel: '通过',
    switchLoader: '切换加载器',
    reload: '重新加载',
    openNewTab: '在新标签打开',
    downloadPdf: '下载 PDF',
    pdfFooterHint: '如显示异常，请在新标签打开。',
    originalLink: '原始链接',

    // Home
    noResults: '未找到相关基准',
    noResultsHint: '请尝试调整搜索词或清除筛选条件',
    results: '个结果',
    loadingMore: '加载更多…',
    allShown: (n: number) => `— 已显示全部 ${n} 个结果 —`,
    loading: '加载中…',
    loadError: '数据加载失败',

    // L1 category labels
    l1: {
      '通用语言能力': '通用语言能力',
      'Agent能力': 'Agent 能力',
      '多模态理解': '多模态理解',
      '代码能力': '代码能力',
      '科学推理': '科学推理',
      '安全对齐': '安全对齐',
      '数学推理': '数学推理',
      '长文本理解': '长文本理解',
      '医疗健康': '医疗健康',
      '视频理解': '视频理解',
      '图表与文档理解': '图表与文档理解',
      '空间与3D理解': '空间与3D理解',
    } as Record<string, string>,

    // Difficulty labels
    difficulty: {
      '前沿': '前沿',
      '专家': '专家',
      '进阶': '进阶',
      '基础': '基础',
    } as Record<string, string>,
  },

  en: {
    // Navbar
    siteTitle: 'LLM Benchmark Costco',
    searchPlaceholder: 'Search by name, org, category…',
    benchmarks: 'Benchmarks',
    switchToLight: 'Switch to Light',
    switchToDark: 'Switch to Dark',
    poweredBy: 'powered by',
    poweredBySuffix: '',

    // HeroStats
    heroTitle: 'LLM Benchmark Costco',
    heroDesc: (total: number, cats: number) =>
      `A curated database of ${total} LLM evaluation benchmarks across ${cats} capability dimensions. Each entry includes the full paper for inline reading.`,
    statBenchmarks: 'Benchmarks',
    statDims: 'Capability Dims',
    statFamilies: 'Families',
    statWidely: 'Widely Adopted',

    // FilterBar
    allCategories: 'All Categories',
    allYears: 'All Years',
    allDifficulty: 'All Levels',
    allModality: 'All Modalities',
    allOpenness: 'All Access',
    sortNewest: 'Newest First',
    sortOldest: 'Oldest First',
    sortName: 'By Name',
    widelyAdopted: 'Widely Adopted',
    public: 'Public',
    partlyPublic: 'Partly Public',
    inHouse: 'In-house',
    text: 'Text',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    multimodal: 'Multimodal',
    frontier: 'Frontier',
    expert: 'Expert',
    advanced: 'Advanced',
    basic: 'Basic',

    // BenchmarkCard
    leaderboard: 'Leaderboard',
    publicLabel: 'Public',
    partlyLabel: 'Partly',
    privateLabel: 'Private',

    // BenchmarkDrawer
    detailsTab: 'Details',
    paperTab: 'Full Paper',
    paperNA: '(N/A)',
    widelyNotice: 'This benchmark is widely cited and tested by major AI labs including OpenAI, Google, Anthropic, and Meta.',
    actionHomepage: 'Homepage',
    actionReadPaper: 'Read Full Paper',
    actionPaperPage: 'Paper Page',
    actionDownload: 'Download PDF',
    sectionBasic: 'Basic Info',
    sectionEval: 'Evaluation',
    sectionFamily: 'Family',
    sectionRelated: 'Related Benchmarks',
    fieldPublished: 'Published',
    fieldOrg: 'Institution',
    fieldModality: 'Modality',
    fieldLanguage: 'Language',
    fieldTaskType: 'Task Type',
    fieldScale: 'Scale',
    fieldBuildMethod: 'Build Method',
    fieldMetric: 'Metric',
    fieldEvalFeature: 'Eval Feature',
    fieldDataAccess: 'Data Access',
    fieldLeaderboard: 'Leaderboard',
    hasLeaderboard: 'Public Leaderboard',
    noLeaderboard: 'None',
    pdfLoading: 'Loading paper',
    pdfError: 'Failed to load PDF',
    pdfErrorDesc: 'All loaders failed. Try opening directly.',
    retry: 'Retry',
    openDirectly: 'Open Directly',
    fullscreen: 'Fullscreen',
    collapse: 'Collapse',
    viaLabel: 'via',
    switchLoader: 'Switch loader',
    reload: 'Reload',
    openNewTab: 'Open in new tab',
    downloadPdf: 'Download PDF',
    pdfFooterHint: 'If display is broken, open in a new tab.',
    originalLink: 'Original link',

    // Home
    noResults: 'No benchmarks found',
    noResultsHint: 'Try adjusting your search or clearing filters',
    results: 'results',
    loadingMore: 'Loading more…',
    allShown: (n: number) => `— All ${n} results shown —`,
    loading: 'Loading…',
    loadError: 'Failed to load data',

    // L1 category labels
    l1: {
      '通用语言能力': 'General Language',
      'Agent能力': 'Agent Capability',
      '多模态理解': 'Multimodal',
      '代码能力': 'Code',
      '科学推理': 'Science & Reasoning',
      '安全对齐': 'Safety & Alignment',
      '数学推理': 'Math',
      '长文本理解': 'Long Context',
      '医疗健康': 'Medical & Health',
      '视频理解': 'Video Understanding',
      '图表与文档理解': 'Chart & Document',
      '空间与3D理解': 'Spatial & 3D',
    } as Record<string, string>,

    // Difficulty labels
    difficulty: {
      '前沿': 'Frontier',
      '专家': 'Expert',
      '进阶': 'Advanced',
      '基础': 'Basic',
    } as Record<string, string>,
  },
} as const;

export type Strings = typeof STRINGS['zh'];

// ─── Context ──────────────────────────────────────────────────────────────────
interface LangContextType {
  lang: Lang;
  t: Strings;
  toggleLang: () => void;
}

const LangContext = createContext<LangContextType>({
  lang: 'zh',
  t: STRINGS.zh,
  toggleLang: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('lang') as Lang) || 'zh';
    } catch {
      return 'zh';
    }
  });

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'zh' ? 'en' : 'zh';
      try { localStorage.setItem('lang', next); } catch {}
      return next;
    });
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: STRINGS[lang], toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
