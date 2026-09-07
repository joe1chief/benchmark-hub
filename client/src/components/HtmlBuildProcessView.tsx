// LLM Benchmark Costco — Pure HTML + CSS Build Process Explorer
// Re-renders paper-aligned benchmark construction & evaluation workflows using modern CSS Grid & Flexbox
import React, { useState, useEffect, useMemo } from 'react';
import { Database, Cpu, GitBranch, ShieldCheck, Users, FileText, ExternalLink, Copy, Check, BookOpen, Filter } from 'lucide-react';
import { BuildProcessCards } from './BuildProcessCards';
import type { Benchmark } from '@/types/benchmark';
import { partitionBuildProcess, type StageModule } from '@/lib/buildProcessStages';

interface ArchNode {
  id: string;
  module?: string;
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
  modules?: StageModule[];
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
  const [activeStageFilter, setActiveStageFilter] = useState<'all' | 'construction' | 'evaluation' | 'unassigned'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch bilingual arch.json
  useEffect(() => {
    setLoading(true);
    setActiveStageFilter('all');
    setSelectedNodeId(null);
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

  const { constructionNodes, evaluationNodes, unassignedNodes, allNodes, edges } = useMemo(
    () => partitionBuildProcess(archData), [archData],
  );

  // Nodes to display based on filter
  const displayedNodes = useMemo(() => {
    if (activeStageFilter === 'construction') return constructionNodes;
    if (activeStageFilter === 'evaluation') return evaluationNodes;
    if (activeStageFilter === 'unassigned') return unassignedNodes;
    return allNodes;
  }, [activeStageFilter, constructionNodes, evaluationNodes, unassignedNodes, allNodes]);

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
            {isEn ? 'Pipeline' : '流程'} ({allNodes.length})
          </button>
          {constructionNodes.length > 0 && (
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
          )}
          {evaluationNodes.length > 0 && (
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
          )}
          {unassignedNodes.length > 0 && unassignedNodes.length < allNodes.length && (
          <button
            onClick={() => setActiveStageFilter('unassigned')}
            aria-pressed={activeStageFilter === 'unassigned'}
            className={`px-3 py-1.5 rounded-lg transition-all ${activeStageFilter === 'unassigned' ? 'bg-slate-500/20 font-bold' : ''}`}
          >
            {isEn ? 'Other pipeline steps' : '其他流程步骤'} ({unassignedNodes.length})
          </button>
          )}
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
        <BuildProcessCards nodes={displayedNodes} allNodes={allNodes} edges={edges}
          isDark={isDark} isEn={isEn} selectedNodeId={selectedNodeId}
          onSelect={id => setSelectedNodeId(selectedNodeId === id ? null : id)} />
      )}
    </div>
  );
}
