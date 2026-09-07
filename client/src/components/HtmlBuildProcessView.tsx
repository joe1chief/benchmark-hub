// LLM Benchmark Costco — Pure HTML + CSS Build Process Explorer
// Re-renders paper-aligned benchmark construction & evaluation workflows using modern CSS Grid & Flexbox
import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Cpu,
  GitBranch,
  ShieldCheck,
  Users,
  FileText,
  Bot,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  Sparkles,
  Layers,
  ArrowRight,
  BookOpen,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import type { Benchmark } from '@/types/benchmark';

interface ArchNode {
  id: string;
  label: string;
  type: string;
  size?: string;
}

interface ArchEdge {
  from: string;
  to: string;
  type?: string;
  label?: string;
}

interface ArchData {
  version: number;
  title: string;
  type: string;
  layout?: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
}

interface Props {
  benchmark: Benchmark;
  isDark: boolean;
  isEn: boolean;
}

const CATEGORY_STYLES: Record<string, {
  tagEn: string;
  tagZh: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  border: string;
  bg: string;
  text: string;
  badge: string;
}> = {
  database: {
    tagEn: 'RAW SOURCE / DATASET',
    tagZh: '原始数据源 / 数据集',
    icon: Database,
    border: 'border-cyan-500/40 hover:border-cyan-400',
    bg: 'bg-cyan-500/5 hover:bg-cyan-500/10',
    text: 'text-cyan-400',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  document: {
    tagEn: 'SPEC / TAXONOMY',
    tagZh: '规范 / 分类学依据',
    icon: FileText,
    border: 'border-blue-500/40 hover:border-blue-400',
    bg: 'bg-blue-500/5 hover:bg-blue-500/10',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  process: {
    tagEn: 'TRANSFORMATION / PROCESS',
    tagZh: '数据处理 / 转换阶段',
    icon: Cpu,
    border: 'border-emerald-500/40 hover:border-emerald-400',
    bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  decision: {
    tagEn: 'QUALITY GATE / FILTER',
    tagZh: '质检闸门 / 筛选过滤',
    icon: GitBranch,
    border: 'border-amber-500/40 hover:border-amber-400',
    bg: 'bg-amber-500/5 hover:bg-amber-500/10',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  user: {
    tagEn: 'HUMAN ANNOTATION / REVIEW',
    tagZh: '专家标注 / 人工复核',
    icon: Users,
    border: 'border-purple-500/40 hover:border-purple-400',
    bg: 'bg-purple-500/5 hover:bg-purple-500/10',
    text: 'text-purple-400',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  metric: {
    tagEn: 'EVALUATION & METRIC',
    tagZh: '判定判定 / 指标汇总',
    icon: ShieldCheck,
    border: 'border-pink-500/40 hover:border-pink-400',
    bg: 'bg-pink-500/5 hover:bg-pink-500/10',
    text: 'text-pink-400',
    badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  },
};

export default function HtmlBuildProcessView({ benchmark: b, isDark, isEn }: Props) {
  const [archData, setArchData] = useState<ArchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStageFilter, setActiveStageFilter] = useState<'all' | 'construction' | 'evaluation'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch bilingual arch.json
  useEffect(() => {
    setLoading(true);
    const preferredLang = isEn ? 'en' : 'zh';
    const fallbackLang = isEn ? 'zh' : 'en';

    fetch(`./drawio/${b.id}/${b.id}.${preferredLang}.arch.json?v=${Date.now()}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: ArchData) => {
        setArchData(data);
        setLoading(false);
      })
      .catch(() => {
        fetch(`./drawio/${b.id}/${b.id}.${fallbackLang}.arch.json?v=${Date.now()}`)
          .then(r => (r.ok ? r.json() : null))
          .then((fallbackData: ArchData | null) => {
            setArchData(fallbackData);
            setLoading(false);
          });
      });
  }, [b.id, isEn]);

  // Separate nodes into Construction and Evaluation partitions
  const { constructionNodes, evaluationNodes, allNodes, nodeMap } = useMemo(() => {
    if (!archData?.nodes) {
      return { constructionNodes: [], evaluationNodes: [], allNodes: [], nodeMap: new Map<string, ArchNode>() };
    }

    const nMap = new Map<string, ArchNode>();
    archData.nodes.forEach(n => nMap.set(n.id, n));

    // Heuristic or structural partition:
    // Nodes involving model, inference, prompt, judge, extract, metric, report belong to Evaluation; others to Construction
    const evalKeywords = ['eval', 'test', 'infer', 'prompt', 'judge', 'cot', 'extract', 'score', 'metric', 'report', 'accuracy', 'pass@', '评测', '推理', '提示', '裁判', '抽取', '得分', '准确率'];

    const construct: ArchNode[] = [];
    const evaluate: ArchNode[] = [];

    archData.nodes.forEach((node, idx) => {
      const lower = (node.id + ' ' + node.label).toLowerCase();
      const isEval = evalKeywords.some(kw => lower.includes(kw)) || idx >= Math.floor(archData.nodes.length * 0.65);
      if (isEval && idx > 0) {
        evaluate.push(node);
      } else {
        construct.push(node);
      }
    });

    return {
      constructionNodes: construct,
      evaluationNodes: evaluate,
      allNodes: archData.nodes,
      nodeMap: nMap,
    };
  }, [archData]);

  // Outgoing connections for each node
  const outgoingMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (archData?.edges) {
      archData.edges.forEach(e => {
        if (!map.has(e.from)) map.set(e.from, []);
        map.get(e.from)!.push(e.to);
      });
    }
    return map;
  }, [archData]);

  // Nodes to display based on filter
  const displayedNodes = useMemo(() => {
    if (activeStageFilter === 'construction') return constructionNodes;
    if (activeStageFilter === 'evaluation') return evaluationNodes;
    return allNodes;
  }, [activeStageFilter, constructionNodes, evaluationNodes, allNodes]);

  // Copy Markdown Pipeline
  const handleCopyMarkdown = () => {
    if (!archData) return;
    const lines = [
      `### ${b.name} Build Process Pipeline (${isEn ? 'Paper-Aligned' : '论文严格对齐'})`,
      `**Paper:** ${b.paper_url || 'N/A'}`,
      '',
      `| Step | Phase | Key Operation & Parameters |`,
      `| :--- | :--- | :--- |`,
    ];

    allNodes.forEach((n, idx) => {
      const parts = n.label.split('\n').map(s => s.trim()).filter(Boolean);
      const title = parts[0] || n.id;
      const details = parts.slice(1).join('; ');
      const category = CATEGORY_STYLES[n.type]?.[isEn ? 'tagEn' : 'tagZh'] || n.type;
      lines.push(`| ${idx + 1} | ${category} | **${title}** ${details ? `— ${details}` : ''} |`);
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Paper Grounding & Citation Header Banner ── */}
      <div className={`p-4 rounded-xl border backdrop-blur-md transition-all ${
        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-cyan-400" />
              <h4 className="font-hud font-bold text-sm tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300">
                {isEn ? 'Paper-Grounded Build Architecture' : '基于论文的构建方法与流程拓扑'}
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                100% Paper Aligned
              </span>
            </div>
            {b.drawio_review_note && (
              <p className={`text-[11.5px] font-mono-tech line-clamp-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {b.drawio_review_note.replace(/Formal publication evidence.*$/, '').trim()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyMarkdown}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono-tech border transition-all ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : isDark
                  ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? (isEn ? 'Copied' : '已复制') : (isEn ? 'Copy Pipeline' : '复制流程表格')}</span>
            </button>

            {b.paper_url && (
              <a
                href={b.paper_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono-tech bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all"
              >
                <ExternalLink size={12} />
                <span>{isEn ? 'Paper PDF' : '原论文'}</span>
              </a>
            )}
          </div>
        </div>

        {/* Core Methodology Matrix (4 Badges) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-slate-800/50 text-xs font-mono-tech">
          <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950/40 border-slate-800/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] text-slate-500 block mb-0.5">{isEn ? 'BUILD METHOD' : '构建方法'}</span>
            <span className={`font-semibold line-clamp-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {(isEn ? b.build_method_en : b.build_method) || 'Expert Curated'}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950/40 border-slate-800/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] text-slate-500 block mb-0.5">{isEn ? 'EVAL FEATURE' : '评测特征'}</span>
            <span className={`font-semibold line-clamp-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {(isEn ? b.eval_feature_en : b.eval_feature) || 'Multi-stage Protocol'}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950/40 border-slate-800/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] text-slate-500 block mb-0.5">{isEn ? 'METRIC / CRITERIA' : '判定指标'}</span>
            <span className={`font-semibold line-clamp-1 text-cyan-400`}>
              {(isEn ? b.metric_en : b.metric) || 'Accuracy'}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950/40 border-slate-800/60' : 'bg-white border-slate-200'}`}>
            <span className="text-[10px] text-slate-500 block mb-0.5">{isEn ? 'SCALE / SPLITS' : '数据规模/分片'}</span>
            <span className={`font-semibold line-clamp-1 text-teal-400`}>
              {(isEn ? b.scale_en : b.scale) || 'Benchmark Set'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Phase Filter & Stage Navigation ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center p-1 rounded-xl border text-xs font-mono-tech ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            onClick={() => setActiveStageFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeStageFilter === 'all'
                ? (isDark ? 'bg-cyan-500/20 text-cyan-300 font-bold shadow-sm' : 'bg-white text-cyan-700 font-bold shadow-sm')
                : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
            }`}
          >
            {isEn ? 'Full Pipeline' : '全量流程'} ({allNodes.length})
          </button>
          <button
            onClick={() => setActiveStageFilter('construction')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeStageFilter === 'construction'
                ? (isDark ? 'bg-emerald-500/20 text-emerald-300 font-bold shadow-sm' : 'bg-white text-emerald-700 font-bold shadow-sm')
                : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
            }`}
          >
            📦 {isEn ? 'Construction' : '数据集构建'} ({constructionNodes.length})
          </button>
          <button
            onClick={() => setActiveStageFilter('evaluation')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeStageFilter === 'evaluation'
                ? (isDark ? 'bg-purple-500/20 text-purple-300 font-bold shadow-sm' : 'bg-white text-purple-700 font-bold shadow-sm')
                : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
            }`}
          >
            ⚡ {isEn ? 'Evaluation & Scoring' : '评测推理与打分'} ({evaluationNodes.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono-tech text-slate-400">
          <span>{isEn ? 'Click any card to inspect links' : '点击卡片查看上下游流向'}</span>
        </div>
      </div>

      {/* ── Responsive HTML + CSS Stage Grid ── */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-mono-tech text-xs">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          // LOADING CSS+HTML PIPELINE...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {displayedNodes.map((node, index) => {
            const isSelected = selectedNodeId === node.id;
            const category = CATEGORY_STYLES[node.type] || CATEGORY_STYLES.process;
            const CategoryIcon = category.icon;

            const lines = node.label.split('\n').map(l => l.trim()).filter(Boolean);
            const title = lines[0] || node.id;
            const bullets = lines.slice(1);
            const outgoing = outgoingMap.get(node.id) || [];

            return (
              <article
                key={node.id}
                onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                className={`relative group rounded-xl border p-4 transition-all duration-300 cursor-pointer select-none flex flex-col justify-between ${
                  category.border
                } ${category.bg} ${
                  isSelected
                    ? 'ring-2 ring-cyan-400 shadow-[0_0_25px_rgba(0,240,255,0.25)] scale-[1.02] z-10'
                    : isDark
                    ? 'bg-slate-950/80 shadow-sm'
                    : 'bg-white shadow-sm'
                }`}
              >
                {/* Step Pill & Category Header */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-hud font-bold text-[10.5px] tracking-wider px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-slate-700">
                        STEP {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={`text-[9.5px] font-mono-tech font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${category.badge}`}>
                        <CategoryIcon size={9} className="inline mr-1 -mt-0.5" />
                        {isEn ? category.tagEn : category.tagZh}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono-tech text-slate-500">
                      #{node.id}
                    </span>
                  </div>

                  {/* Stage Main Title */}
                  <h4 className={`text-sm font-bold leading-snug mb-2 transition-colors ${
                    isSelected ? 'text-cyan-300' : isDark ? 'text-slate-100 group-hover:text-cyan-300' : 'text-slate-900 group-hover:text-cyan-700'
                  }`}>
                    {title}
                  </h4>

                  {/* Sub-points / Criteria */}
                  {bullets.length > 0 && (
                    <ul className="space-y-1.5 my-2.5 border-t border-slate-800/40 pt-2 text-xs">
                      {bullets.map((bullet, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-1.5 text-slate-400 dark:text-slate-300 leading-relaxed">
                          <span className="text-cyan-400 font-bold shrink-0 mt-0.5">▸</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Card Footer: Outgoing Flow */}
                {outgoing.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/40 flex items-center justify-between text-[10px] font-mono-tech text-slate-500">
                    <span className="flex items-center gap-1">
                      <ArrowRight size={10} className="text-cyan-400" />
                      <span>{isEn ? 'Transitions to' : '流转至'}:</span>
                    </span>
                    <span className="text-cyan-400/90 font-medium truncate max-w-[140px]">
                      {outgoing.map(tid => nodeMap.get(tid)?.label.split('\n')[0] || tid).join(', ')}
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
