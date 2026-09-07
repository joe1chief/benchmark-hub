// LLM Benchmark Costco — Pure CSS + HTML Flowchart Engine
// Renders paper-aligned benchmark build & evaluation flowcharts completely from scratch using CSS & HTML DOM
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  Copy,
  Check,
  Sparkles,
  Layers,
  ArrowRight,
  BookOpen,
  Filter,
  CheckCircle2,
  Info,
  Maximize2,
  Minimize2,
  ListFilter,
  Network,
} from 'lucide-react';
import type { Benchmark } from '@/types/benchmark';
import { useLang } from '@/contexts/LangContext';

interface ArchNode {
  id: string;
  label: string;
  type: string;
  size?: string;
  column?: number;
  row?: number;
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
  initialFullscreen?: boolean;
}

// Shape & Theme configurations for HTML+CSS flowchart nodes
const SHAPE_CONFIG: Record<string, {
  nameEn: string;
  nameZh: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  borderClass: string;
  bgClass: string;
  accentColor: string;
  shapeStyle: string;
}> = {
  database: {
    nameEn: 'DATA SOURCE / REPO',
    nameZh: '数据源 / 语料库',
    icon: Database,
    borderClass: 'border-cyan-500/50 hover:border-cyan-400',
    bgClass: 'bg-cyan-500/[0.07] hover:bg-cyan-500/[0.12]',
    accentColor: '#06B6D4',
    shapeStyle: 'rounded-xl border-t-4 border-t-cyan-400',
  },
  document: {
    nameEn: 'SPEC / CANDIDATE',
    nameZh: '候选集 / 规约文档',
    icon: FileText,
    borderClass: 'border-blue-500/50 hover:border-blue-400',
    bgClass: 'bg-blue-500/[0.07] hover:bg-blue-500/[0.12]',
    accentColor: '#3B82F6',
    shapeStyle: 'rounded-xl',
  },
  process: {
    nameEn: 'PROCESS / EXECUTION',
    nameZh: '处理阶段 / 执行管道',
    icon: Cpu,
    borderClass: 'border-emerald-500/50 hover:border-emerald-400',
    bgClass: 'bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12]',
    accentColor: '#10B981',
    shapeStyle: 'rounded-xl',
  },
  decision: {
    nameEn: 'QUALITY GATE / FILTER',
    nameZh: '质检闸门 / 准入判定',
    icon: GitBranch,
    borderClass: 'border-amber-500/50 hover:border-amber-400',
    bgClass: 'bg-amber-500/[0.07] hover:bg-amber-500/[0.12]',
    accentColor: '#F59E0B',
    shapeStyle: 'rounded-2xl border-l-4 border-l-amber-400',
  },
  user: {
    nameEn: 'HUMAN REVIEW / AUDIT',
    nameZh: '人工复核 / 专家标注',
    icon: Users,
    borderClass: 'border-purple-500/50 hover:border-purple-400',
    bgClass: 'bg-purple-500/[0.07] hover:bg-purple-500/[0.12]',
    accentColor: '#8B5CF6',
    shapeStyle: 'rounded-xl border-t-4 border-t-purple-400',
  },
  terminal: {
    nameEn: 'BENCHMARK / METRIC',
    nameZh: '基准冻结 / 评测打分',
    icon: ShieldCheck,
    borderClass: 'border-pink-500/50 hover:border-pink-400',
    bgClass: 'bg-pink-500/[0.07] hover:bg-pink-500/[0.12]',
    accentColor: '#EC4899',
    shapeStyle: 'rounded-2xl border-r-4 border-r-pink-400',
  },
};

export default function PureHtmlFlowchart({ benchmark: b, isDark, initialFullscreen = false }: Props) {
  const { lang } = useLang();
  const isEn = lang === 'en';

  const [archData, setArchData] = useState<ArchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewLayout, setViewLayout] = useState<'swimlane' | 'matrix'>('swimlane');
  const [scale, setScale] = useState(1.0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  // Fetch bilingual arch.json
  useEffect(() => {
    setLoading(true);
    setSelectedNodeId(null);
    setSimulating(false);
    setSimStep(-1);

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

  // Separate nodes into Construction and Evaluation Swimlanes
  const { constructionNodes, evaluationNodes, allNodes, nodeMap, edges } = useMemo(() => {
    if (!archData?.nodes) {
      return {
        constructionNodes: [],
        evaluationNodes: [],
        allNodes: [],
        nodeMap: new Map<string, ArchNode>(),
        edges: [],
      };
    }

    const nMap = new Map<string, ArchNode>();
    archData.nodes.forEach(n => nMap.set(n.id, n));

    const evalKeywords = [
      'eval', 'test', 'infer', 'prompt', 'judge', 'cot', 'extract',
      'score', 'metric', 'report', 'accuracy', 'pass@', '评测', '推理',
      '提示', '裁判', '抽取', '得分', '准确率', 'leaderboard',
    ];

    const construct: ArchNode[] = [];
    const evaluate: ArchNode[] = [];

    archData.nodes.forEach((node, idx) => {
      const lower = (node.id + ' ' + node.label).toLowerCase();
      const isEval =
        evalKeywords.some(kw => lower.includes(kw)) ||
        idx >= Math.floor(archData.nodes.length * 0.6);

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
      edges: archData.edges || [],
    };
  }, [archData]);

  // Outgoing flow mapping
  const outgoingMap = useMemo(() => {
    const map = new Map<string, string[]>();
    edges.forEach(e => {
      if (!map.has(e.from)) map.set(e.from, []);
      map.get(e.from)!.push(e.to);
    });
    return map;
  }, [edges]);

  // Simulation execution loop
  useEffect(() => {
    let timer: any;
    if (simulating && allNodes.length > 0) {
      timer = setInterval(() => {
        setSimStep(prev => {
          const next = prev + 1;
          if (next >= allNodes.length) {
            setSimulating(false);
            return -1;
          }
          setSelectedNodeId(allNodes[next]?.id || null);
          return next;
        });
      }, 1200);
    }
    return () => clearInterval(timer);
  }, [simulating, allNodes]);

  // Copy Markdown Pipeline
  const handleCopyMarkdown = () => {
    if (!archData) return;
    const lines = [
      `### ${b.name} Build Process Flowchart (${isEn ? 'Paper-Aligned' : '论文严格对齐'})`,
      `**Source Paper:** ${b.paper_url || 'N/A'}`,
      '',
      `| Step | Phase | Node ID | Stage Operation & Verification Gate |`,
      `| :--- | :--- | :--- | :--- |`,
    ];

    allNodes.forEach((n, idx) => {
      const parts = n.label.split('\n').map(s => s.trim()).filter(Boolean);
      const title = parts[0] || n.id;
      const details = parts.slice(1).join('; ');
      const category = SHAPE_CONFIG[n.type]?.[isEn ? 'nameEn' : 'nameZh'] || n.type;
      lines.push(`| ${idx + 1} | ${category} | \`${n.id}\` | **${title}** ${details ? `— ${details}` : ''} |`);
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeMap.get(selectedNodeId) || null;
  }, [selectedNodeId, nodeMap]);

  return (
    <div
      className={`relative flex flex-col rounded-xl border overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none border-0' : 'min-h-[580px]'
      } ${isDark ? 'bg-[#040813] border-slate-800' : 'bg-slate-50/80 border-slate-200'}`}
    >
      {/* ── Top Flowchart Control Bar (HTML+CSS) ── */}
      <header className={`flex flex-wrap items-center justify-between px-4 py-2.5 border-b shrink-0 z-20 backdrop-blur-md ${
        isDark ? 'bg-slate-950/80 border-slate-800 text-slate-200' : 'bg-white/90 border-slate-200 text-slate-800'
      }`}>
        {/* Left: Flowchart Title & Breadcrumb */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#00F0FF] shrink-0 animate-pulse" />
          <div>
            <h3 className="font-hud font-bold text-xs sm:text-sm tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 truncate max-w-[240px] sm:max-w-md">
              {archData?.title || `${b.name} Build Process`}
            </h3>
            <p className="text-[10px] font-mono-tech text-slate-400">
              {isEn ? 'Pure CSS+HTML Native Flowchart' : '纯 CSS+HTML 原生流程图渲染'} · {allNodes.length} NODES · {edges.length} EDGES
            </p>
          </div>
        </div>

        {/* Right: Tools & Toggles */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Switcher */}
          <div className={`flex items-center p-0.5 rounded-lg border text-xs font-mono-tech ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setViewLayout('swimlane')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                viewLayout === 'swimlane'
                  ? (isDark ? 'bg-cyan-500/20 text-cyan-300 font-bold shadow-sm' : 'bg-white text-cyan-700 font-bold shadow-sm')
                  : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600')
              }`}
            >
              <Network size={11} />
              <span>{isEn ? 'Swimlane Flow' : '泳道流程图'}</span>
            </button>
            <button
              onClick={() => setViewLayout('matrix')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-all ${
                viewLayout === 'matrix'
                  ? (isDark ? 'bg-cyan-500/20 text-cyan-300 font-bold shadow-sm' : 'bg-white text-cyan-700 font-bold shadow-sm')
                  : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600')
              }`}
            >
              <ListFilter size={11} />
              <span>{isEn ? 'Stage Matrix' : '阶段矩阵'}</span>
            </button>
          </div>

          {/* Simulation Walkthrough */}
          <button
            onClick={() => {
              if (simulating) {
                setSimulating(false);
              } else {
                setSimStep(-1);
                setSimulating(true);
              }
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono-tech border transition-all ${
              simulating
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
            }`}
          >
            {simulating ? <Pause size={11} /> : <Play size={11} />}
            <span className="hidden sm:inline">{simulating ? (isEn ? 'Pause' : '暂停') : (isEn ? 'Walkthrough' : '单步演进')}</span>
          </button>

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center rounded-lg border border-slate-700/50 dark:border-slate-800 overflow-hidden text-xs">
            <button
              onClick={() => setScale(s => Math.min(s + 0.1, 1.4))}
              className={`p-1.5 transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-600'}`}
              title={isEn ? 'Zoom in' : '放大'}
            >
              <ZoomIn size={12} />
            </button>
            <span className="text-[10px] font-mono-tech px-1.5 select-none text-slate-400 min-w-[34px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.max(s - 0.1, 0.7))}
              className={`p-1.5 transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-600'}`}
              title={isEn ? 'Zoom out' : '缩小'}
            >
              <ZoomOut size={12} />
            </button>
            <button
              onClick={() => setScale(1.0)}
              className={`p-1.5 transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-600'}`}
              title={isEn ? 'Reset zoom' : '重置缩放'}
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Copy Table */}
          <button
            onClick={handleCopyMarkdown}
            className={`p-1.5 rounded-lg border transition-colors ${
              copied
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                : isDark
                ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                : 'border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
            title={isEn ? 'Copy Markdown Flowchart' : '复制流程表格'}
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
            title={isFullscreen ? (isEn ? 'Exit fullscreen' : '退出全屏') : (isEn ? 'Fullscreen' : '全屏模式')}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </header>

      {/* ── Flowchart Canvas Area ── */}
      <main className={`flex-1 p-4 overflow-auto transition-transform ${isDark ? 'cyber-grid-bg' : 'bg-slate-100/50'}`}>
        {loading ? (
          <div className="py-24 text-center text-slate-400 font-mono-tech text-xs">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            // RENDERING NATIVE CSS+HTML FLOWCHART...
          </div>
        ) : viewLayout === 'swimlane' ? (
          /* ── Swimlane Layout (Track A & Track B) ── */
          <div
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            className="space-y-6 min-w-[860px] pb-10"
          >
            {/* Swimlane 1: Dataset Construction Flow */}
            <section className={`rounded-xl border p-4 backdrop-blur-md ${
              isDark ? 'bg-slate-950/70 border-cyan-900/40' : 'bg-white/80 border-cyan-200'
            }`}>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-cyan-500/20">
                <Database size={15} className="text-cyan-400" />
                <h4 className="font-hud font-bold text-xs uppercase tracking-wider text-cyan-300">
                  {isEn ? 'Track A: Dataset Construction Pipeline' : '泳道 A：数据集采集、过滤与构建流'}
                </h4>
                <span className="text-[10px] font-mono-tech text-slate-500 ml-auto">
                  {constructionNodes.length} STAGES
                </span>
              </div>

              {/* Horizontal CSS Flex Flow */}
              <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1">
                {constructionNodes.map((node, idx) => {
                  const isSelected = selectedNodeId === node.id;
                  const cfg = SHAPE_CONFIG[node.type] || SHAPE_CONFIG.process;
                  const Icon = cfg.icon;
                  const lines = node.label.split('\n').map(l => l.trim()).filter(Boolean);
                  const title = lines[0] || node.id;
                  const bullets = lines.slice(1);

                  return (
                    <React.Fragment key={node.id}>
                      {/* Node Block */}
                      <div
                        onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                        className={`w-56 shrink-0 p-3.5 rounded-xl border backdrop-blur-md transition-all duration-200 cursor-pointer ${
                          cfg.shapeStyle
                        } ${cfg.borderClass} ${cfg.bgClass} ${
                          isSelected
                            ? 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.35)] scale-105 z-20'
                            : isDark ? 'bg-slate-900/90' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-mono-tech font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                            style={{ color: cfg.accentColor, borderColor: `${cfg.accentColor}40`, backgroundColor: `${cfg.accentColor}15` }}
                          >
                            <Icon size={9} />
                            <span>{isEn ? cfg.nameEn : cfg.nameZh}</span>
                          </span>
                          <span className="text-[9.5px] font-mono-tech text-slate-500">
                            #{node.id}
                          </span>
                        </div>

                        <h5 className={`text-xs font-bold leading-snug mb-1.5 transition-colors line-clamp-2 ${
                          isSelected ? 'text-cyan-300' : isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}>
                          {title}
                        </h5>

                        {bullets.length > 0 && (
                          <div className="space-y-1 mt-2 pt-1.5 border-t border-slate-800/40 text-[10.5px]">
                            {bullets.slice(0, 2).map((bullet, bIdx) => (
                              <div key={bIdx} className="text-slate-400 dark:text-slate-300 truncate">
                                • {bullet}
                              </div>
                            ))}
                            {bullets.length > 2 && (
                              <span className="text-[9px] font-mono-tech text-cyan-400/80 block pt-0.5">
                                +{bullets.length - 2} more...
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Pure CSS Flow Connector Arrow */}
                      {idx < constructionNodes.length - 1 && (
                        <div className="flex items-center justify-center shrink-0 px-1">
                          <div className="flex items-center">
                            <div className="w-5 h-[2px] bg-gradient-to-r from-cyan-500 to-teal-400" />
                            <ArrowRight size={12} className="text-teal-400 -ml-1" />
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>

            {/* Swimlane 2: Model Evaluation & Scoring Flow */}
            <section className={`rounded-xl border p-4 backdrop-blur-md ${
              isDark ? 'bg-slate-950/70 border-purple-900/40' : 'bg-white/80 border-purple-200'
            }`}>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-purple-500/20">
                <Bot size={15} className="text-purple-400" />
                <h4 className="font-hud font-bold text-xs uppercase tracking-wider text-purple-300">
                  {isEn ? 'Track B: Model Evaluation & Scoring Protocol' : '泳道 B：模型推理、判定与指标打分流'}
                </h4>
                <span className="text-[10px] font-mono-tech text-slate-500 ml-auto">
                  {evaluationNodes.length} STAGES
                </span>
              </div>

              {/* Horizontal CSS Flex Flow */}
              <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1">
                {evaluationNodes.map((node, idx) => {
                  const isSelected = selectedNodeId === node.id;
                  const cfg = SHAPE_CONFIG[node.type] || SHAPE_CONFIG.terminal;
                  const Icon = cfg.icon;
                  const lines = node.label.split('\n').map(l => l.trim()).filter(Boolean);
                  const title = lines[0] || node.id;
                  const bullets = lines.slice(1);

                  return (
                    <React.Fragment key={node.id}>
                      {/* Node Block */}
                      <div
                        onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                        className={`w-56 shrink-0 p-3.5 rounded-xl border backdrop-blur-md transition-all duration-200 cursor-pointer ${
                          cfg.shapeStyle
                        } ${cfg.borderClass} ${cfg.bgClass} ${
                          isSelected
                            ? 'ring-2 ring-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.35)] scale-105 z-20'
                            : isDark ? 'bg-slate-900/90' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-mono-tech font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                            style={{ color: cfg.accentColor, borderColor: `${cfg.accentColor}40`, backgroundColor: `${cfg.accentColor}15` }}
                          >
                            <Icon size={9} />
                            <span>{isEn ? cfg.nameEn : cfg.nameZh}</span>
                          </span>
                          <span className="text-[9.5px] font-mono-tech text-slate-500">
                            #{node.id}
                          </span>
                        </div>

                        <h5 className={`text-xs font-bold leading-snug mb-1.5 transition-colors line-clamp-2 ${
                          isSelected ? 'text-purple-300' : isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}>
                          {title}
                        </h5>

                        {bullets.length > 0 && (
                          <div className="space-y-1 mt-2 pt-1.5 border-t border-slate-800/40 text-[10.5px]">
                            {bullets.slice(0, 2).map((bullet, bIdx) => (
                              <div key={bIdx} className="text-slate-400 dark:text-slate-300 truncate">
                                • {bullet}
                              </div>
                            ))}
                            {bullets.length > 2 && (
                              <span className="text-[9px] font-mono-tech text-purple-400/80 block pt-0.5">
                                +{bullets.length - 2} more...
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Pure CSS Flow Connector Arrow */}
                      {idx < evaluationNodes.length - 1 && (
                        <div className="flex items-center justify-center shrink-0 px-1">
                          <div className="flex items-center">
                            <div className="w-5 h-[2px] bg-gradient-to-r from-purple-500 to-pink-400" />
                            <ArrowRight size={12} className="text-pink-400 -ml-1" />
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          /* ── Stage Matrix Layout (Structured Table) ── */
          <div className="overflow-x-auto pb-4">
            <table className={`w-full text-left text-xs border-collapse ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-100/60'}`}>
                  <th className="py-2.5 px-3 font-mono-tech text-cyan-400">#</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'PHASE' : '阶段类型'}</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'NODE ID' : '节点标识'}</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'OPERATION' : '核心操作与准则'}</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'LEADS TO' : '下游流转'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {allNodes.map((n, idx) => {
                  const cfg = SHAPE_CONFIG[n.type] || SHAPE_CONFIG.process;
                  const Icon = cfg.icon;
                  const lines = n.label.split('\n').map(l => l.trim()).filter(Boolean);
                  const title = lines[0] || n.id;
                  const details = lines.slice(1).join('; ');
                  const outgoing = outgoingMap.get(n.id) || [];

                  return (
                    <tr
                      key={n.id}
                      onClick={() => setSelectedNodeId(selectedNodeId === n.id ? null : n.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedNodeId === n.id
                          ? (isDark ? 'bg-cyan-950/40 font-bold' : 'bg-cyan-50 font-bold')
                          : (isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-100/50')
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono-tech text-slate-500">{String(idx + 1).padStart(2, '0')}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center gap-1 text-[9.5px] font-mono-tech font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                          style={{ color: cfg.accentColor, borderColor: `${cfg.accentColor}40`, backgroundColor: `${cfg.accentColor}15` }}
                        >
                          <Icon size={9} />
                          <span>{isEn ? cfg.nameEn : cfg.nameZh}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono-tech text-cyan-400">{n.id}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-200 dark:text-slate-100">{title}</div>
                        {details && <div className="text-[11px] text-slate-400 mt-0.5">{details}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tech text-[10.5px] text-teal-400">
                        {outgoing.join(', ') || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Floating Node Inspector Panel ── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`absolute bottom-4 right-4 z-40 max-w-sm w-full p-4 rounded-xl border shadow-2xl backdrop-blur-xl ${
              isDark ? 'bg-slate-950/95 border-cyan-500/50 text-slate-200' : 'bg-white/95 border-cyan-500/30 text-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono-tech text-cyan-400 uppercase font-bold">
                  STAGE SPECIFICATION · #{selectedNode.id}
                </span>
                <h4 className="font-bold text-sm text-cyan-300 mt-0.5">
                  {selectedNode.label.split('\n')[0]}
                </h4>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-slate-200 text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
              {selectedNode.label.split('\n').slice(1).map((item, iIdx) => (
                <div key={iIdx} className="flex items-start gap-1.5 text-slate-300">
                  <span className="text-cyan-400 font-bold shrink-0 mt-0.5">▸</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono-tech text-slate-400">
              <span>OUTGOING: {outgoingMap.get(selectedNode.id)?.length || 0}</span>
              {b.paper_url && (
                <a
                  href={b.paper_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink size={9} />
                  <span>{isEn ? 'Verify in Paper' : '论文对照'}</span>
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
