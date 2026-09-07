// LLM Benchmark Costco — Next-Gen Interactive Pipeline Viewer
// Renders paper-aligned benchmark architecture workflows natively in React
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Cpu,
  GitBranch,
  ShieldCheck,
  Users,
  FileText,
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Search,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import type { Benchmark } from '@/types/benchmark';
import { layoutPipeline, pipelineEdgeGeometry } from '@/lib/pipelineLayout';
import { useLang } from '@/contexts/LangContext';

interface ArchNode {
  id: string;
  label: string;
  type: string;
  size?: string;
  layer?: number;
  column?: number;
  row?: number;
  x?: number;
  y?: number;
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
  counts?: { nodes: number; edges: number };
  nodes: ArchNode[];
  edges: ArchEdge[];
}

interface Props {
  benchmark: Benchmark;
  isDark: boolean;
  onFallbackToSvg?: () => void;
  initialFullscreen?: boolean;
}

// Shared with SSR contract tests so branch labels and line styles exercise the
// same SVG element that the interactive viewer displays.
export function PipelineEdge({ edge, from, to, isDark, isHighlighted = false }: {
  edge: ArchEdge;
  from: { id: string; x: number; y: number };
  to: { id: string; x: number; y: number };
  isDark: boolean;
  isHighlighted?: boolean;
}) {
  const { d, labelX, labelY } = pipelineEdgeGeometry(from, to);
  return (
    <g>
      <path d={d} fill="none"
        stroke={isHighlighted ? '#00F0FF' : (isDark ? 'rgba(71, 85, 105, 0.45)' : 'rgba(148, 163, 184, 0.55)')}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        strokeDasharray={edge.type === 'primary' ? 'none' : '5,5'}
        markerEnd={isHighlighted ? 'url(#arrow-active)' : 'url(#arrow-default)'}
        className="transition-colors duration-200" />
      {edge.label && (
        <text x={labelX} y={labelY} textAnchor="middle" fontSize="11"
          fill={isHighlighted ? '#0891B2' : (isDark ? '#CBD5E1' : '#475569')}
          stroke={isDark ? '#020617' : '#F1F5F9'} strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">
          {edge.label}
        </text>
      )}
      {isHighlighted && (
        <circle r="3.5" fill="#00F0FF">
          <animateMotion path={d} dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// Node Type Theme Configuration
const TYPE_CONFIG: Record<string, {
  labelEn: string;
  labelZh: string;
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  bgDark: string;
  bgLight: string;
  borderDark: string;
  borderLight: string;
}> = {
  database: {
    labelEn: 'DATASET',
    labelZh: '数据源/集',
    color: '#06B6D4', // Cyan
    icon: Database,
    bgDark: 'rgba(6, 182, 212, 0.08)',
    bgLight: 'rgba(6, 182, 212, 0.06)',
    borderDark: 'rgba(6, 182, 212, 0.35)',
    borderLight: 'rgba(6, 182, 212, 0.4)',
  },
  document: {
    labelEn: 'EVIDENCE / SPEC',
    labelZh: '标准/规范',
    color: '#3B82F6', // Blue
    icon: FileText,
    bgDark: 'rgba(59, 130, 246, 0.08)',
    bgLight: 'rgba(59, 130, 246, 0.06)',
    borderDark: 'rgba(59, 130, 246, 0.35)',
    borderLight: 'rgba(59, 130, 246, 0.4)',
  },
  process: {
    labelEn: 'PROCESS',
    labelZh: '处理阶段',
    color: '#10B981', // Emerald
    icon: Cpu,
    bgDark: 'rgba(16, 185, 129, 0.08)',
    bgLight: 'rgba(16, 185, 129, 0.06)',
    borderDark: 'rgba(16, 185, 129, 0.35)',
    borderLight: 'rgba(16, 185, 129, 0.4)',
  },
  decision: {
    labelEn: 'GATE / FILTER',
    labelZh: '判定闸门',
    color: '#F59E0B', // Amber
    icon: GitBranch,
    bgDark: 'rgba(245, 158, 11, 0.08)',
    bgLight: 'rgba(245, 158, 11, 0.06)',
    borderDark: 'rgba(245, 158, 11, 0.35)',
    borderLight: 'rgba(245, 158, 11, 0.4)',
  },
  user: {
    labelEn: 'HUMAN REVIEW',
    labelZh: '人工标注/评审',
    color: '#8B5CF6', // Purple
    icon: Users,
    bgDark: 'rgba(139, 92, 246, 0.08)',
    bgLight: 'rgba(139, 92, 246, 0.06)',
    borderDark: 'rgba(139, 92, 246, 0.35)',
    borderLight: 'rgba(139, 92, 246, 0.4)',
  },
  metric: {
    labelEn: 'METRIC / REWARD',
    labelZh: '指标评定',
    color: '#EC4899', // Pink
    icon: ShieldCheck,
    bgDark: 'rgba(236, 72, 153, 0.08)',
    bgLight: 'rgba(236, 72, 153, 0.06)',
    borderDark: 'rgba(236, 72, 153, 0.35)',
    borderLight: 'rgba(236, 72, 153, 0.4)',
  },
};

export default function InteractivePipelineViewer({
  benchmark,
  isDark,
  onFallbackToSvg,
  initialFullscreen = false,
}: Props) {
  const { lang } = useLang();
  const isEn = lang === 'en';

  const [archData, setArchData] = useState<ArchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewport navigation states
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  // Inspection & Simulation states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterKeyword, setFilterKeyword] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [_simActiveIndex, setSimActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch bilingual arch.json
  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedNodeId(null);
    setSimulating(false);
    setSimActiveIndex(-1);

    const preferredLang = isEn ? 'en' : 'zh';
    const fallbackLang = isEn ? 'zh' : 'en';

    fetch(`./drawio/${benchmark.id}/${benchmark.id}.${preferredLang}.arch.json?v=${Date.now()}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ArchData) => {
        setArchData(data);
        setLoading(false);
      })
      .catch(() => {
        // Try fallback language
        fetch(`./drawio/${benchmark.id}/${benchmark.id}.${fallbackLang}.arch.json?v=${Date.now()}`)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then((fallbackData: ArchData) => {
            setArchData(fallbackData);
            setLoading(false);
          })
          .catch(err => {
            setError(err.message || 'Failed to load architecture definition');
            setLoading(false);
          });
      });
  }, [benchmark.id, isEn]);

  // Feedback loops share a column; the condensed DAG determines downstream layers.
  const { laidOutNodes, nodeMap, maxLayers, maxRowHeight } = useMemo(
    () => layoutPipeline(archData), [archData],
  );

  // Simulation execution loop
  useEffect(() => {
    let timer: any;
    if (simulating && laidOutNodes.length > 0) {
      timer = setInterval(() => {
        setSimActiveIndex(prev => {
          const next = prev + 1;
          if (next >= laidOutNodes.length) {
            setSimulating(false);
            return -1;
          }
          setSelectedNodeId(laidOutNodes[next]?.id || null);
          return next;
        });
      }, 1200);
    }
    return () => clearInterval(timer);
  }, [simulating, laidOutNodes]);

  // Handle Drag / Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.interactive-node-card')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Selected Node Details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeMap.get(selectedNodeId) || null;
  }, [selectedNodeId, nodeMap]);

  // Upstream & Downstream relationships of selected node
  const activeRelations = useMemo(() => {
    if (!selectedNodeId || !archData) return { upstream: new Set<string>(), downstream: new Set<string>() };
    const upstream = new Set<string>();
    const downstream = new Set<string>();

    archData.edges.forEach(e => {
      if (e.to === selectedNodeId) upstream.add(e.from);
      if (e.from === selectedNodeId) downstream.add(e.to);
    });

    return { upstream, downstream };
  }, [selectedNodeId, archData]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center py-20 gap-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        <div className="w-9 h-9 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="font-mono-tech text-xs tracking-wider">
          {isEn ? '// LOADING INTERACTIVE ARCHITECTURE GRAPH...' : '// 正在加载纯前端架构流水线...'}
        </span>
      </div>
    );
  }

  if (error || !archData) {
    return (
      <div className={`p-6 text-center space-y-4 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <Info size={28} className="mx-auto text-amber-500" />
        <p className="text-xs font-mono-tech text-slate-400">
          {isEn ? 'Interactive pipeline unavailable for this entry. View raw SVG blueprint instead.' : '此基准暂无交互图谱，可直接查阅原始矢量蓝图。'}
        </p>
        {onFallbackToSvg && (
          <button
            onClick={onFallbackToSvg}
            className="px-3.5 py-1.5 rounded-lg text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-all font-mono-tech"
          >
            {isEn ? 'Switch to Vector SVG' : '切换至原始矢量图'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col rounded-xl border overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[99999] rounded-none border-0' : 'h-[640px]'
      } ${isDark ? 'bg-[#050914] border-slate-800/80' : 'bg-slate-50/90 border-slate-200'}`}
    >
      {/* ── Top Tactical Control Bar ── */}
      <div className={`flex flex-wrap items-center justify-between px-4 py-2.5 border-b shrink-0 z-20 backdrop-blur-md ${
        isDark ? 'bg-slate-950/80 border-slate-800/80 text-slate-200' : 'bg-white/80 border-slate-200 text-slate-800'
      }`}>
        {/* Left: Pipeline Title & Telemetry */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
          <span className="font-hud font-bold text-xs sm:text-sm tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300 truncate max-w-[260px] sm:max-w-md">
            {archData.title || `${benchmark.name} Pipeline`}
          </span>
          <span className={`hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono-tech border ${
            isDark ? 'bg-cyan-950/50 text-cyan-400 border-cyan-800/60' : 'bg-cyan-50 text-cyan-700 border-cyan-200'
          }`}>
            {archData.nodes.length} NODES · {archData.edges.length} EDGES
          </span>
        </div>

        {/* Right: Quick Tools */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Node Search Filter */}
          <div className="relative hidden md:block">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
              placeholder={isEn ? 'Filter nodes...' : '筛选节点...'}
              className={`pl-6 pr-2 py-1 text-[11px] rounded-lg border font-mono-tech focus:outline-none focus:ring-1 focus:ring-cyan-400 ${
                isDark ? 'bg-slate-900 border-slate-800 text-slate-200 placeholder-slate-600' : 'bg-slate-100 border-slate-200 text-slate-800 placeholder-slate-400'
              }`}
            />
          </div>

          {/* Simulation Run Button */}
          <button
            onClick={() => {
              if (simulating) {
                setSimulating(false);
              } else {
                setSimActiveIndex(-1);
                setSimulating(true);
              }
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono-tech border transition-all ${
              simulating
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
            }`}
            title={isEn ? 'Simulate execution walkthrough' : '演示全流程执行流'}
          >
            {simulating ? <Pause size={11} /> : <Play size={11} />}
            <span className="hidden sm:inline">{simulating ? (isEn ? 'Pause' : '暂停') : (isEn ? 'Simulate' : '演示')}</span>
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center rounded-lg border border-slate-700/50 dark:border-slate-800 overflow-hidden">
            <button
              onClick={() => setScale(s => Math.min(s + 0.12, 1.8))}
              className={`p-1.5 transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-600'}`}
              title={isEn ? 'Zoom in' : '放大'}
            >
              <ZoomIn size={12} />
            </button>
            <span className="text-[10px] font-mono-tech px-1.5 select-none text-slate-400 min-w-[34px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.max(s - 0.12, 0.35))}
              className={`p-1.5 transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-600'}`}
              title={isEn ? 'Zoom out' : '缩小'}
            >
              <ZoomOut size={12} />
            </button>
            <button
              onClick={() => {
                setScale(0.85);
                setPan({ x: 30, y: 30 });
              }}
              className={`p-1.5 transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-600'}`}
              title={isEn ? 'Reset view' : '重置视角'}
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
            title={isFullscreen ? (isEn ? 'Exit fullscreen' : '退出全屏') : (isEn ? 'Fullscreen' : '全屏模式')}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* ── Interactive Viewport Canvas ── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`flex-1 relative overflow-hidden select-none cursor-grab active:cursor-grabbing ${
          isDark ? 'cyber-grid-bg' : 'bg-slate-100/50'
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            width: `${Math.max(maxLayers * 300 + 200, 1400)}px`,
            height: `${Math.max(maxRowHeight, 700)}px`,
          }}
          className="absolute inset-0 pointer-events-auto"
        >
          {/* SVG Connection Lines */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}
          >
            <defs>
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={isDark ? '#475569' : '#94A3B8'} />
              </marker>
              <marker
                id="arrow-active"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#00F0FF" />
              </marker>
            </defs>

            {archData.edges.map((edge, idx) => {
              const fromNode = nodeMap.get(edge.from);
              const toNode = nodeMap.get(edge.to);
              if (!fromNode || !toNode || fromNode.x === undefined || fromNode.y === undefined || toNode.x === undefined || toNode.y === undefined) return null;

              const isHighlighted =
                selectedNodeId === edge.from ||
                selectedNodeId === edge.to ||
                (activeRelations.upstream.has(edge.from) && activeRelations.downstream.has(edge.to));

              return <PipelineEdge key={`edge-${idx}`} edge={edge} from={fromNode} to={toNode}
                isDark={isDark} isHighlighted={isHighlighted} />;
            })}
          </svg>

          {/* Interactive React Node Cards */}
          {laidOutNodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isMatchedFilter =
              filterKeyword.trim() === '' ||
              node.label.toLowerCase().includes(filterKeyword.toLowerCase());

            const isRelated =
              activeRelations.upstream.has(node.id) ||
              activeRelations.downstream.has(node.id);

            const typeConfig = TYPE_CONFIG[node.type] || TYPE_CONFIG.process;
            const Icon = typeConfig.icon;

            // Parse label into Title and Details
            const lines = node.label.split('\n').map(l => l.trim()).filter(Boolean);
            const title = lines[0] || node.id;
            const details = lines.slice(1);

            return (
              <div
                key={node.id}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: '240px',
                  minHeight: '110px',
                }}
                className={`interactive-node-card group p-3 rounded-xl border hud-bracket cursor-pointer transition-all duration-200 select-none ${
                  !isMatchedFilter ? 'opacity-25 blur-[0.5px]' : 'opacity-100'
                } ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-950/60 shadow-[0_0_25px_rgba(0,240,255,0.4)] scale-105 z-30'
                    : isRelated
                    ? 'border-cyan-500/60 bg-slate-900/90 shadow-[0_0_15px_rgba(0,240,255,0.2)] z-20'
                    : isDark
                    ? 'bg-slate-950/85 border-slate-800/80 hover:border-cyan-500/40 hover:bg-slate-900 hover:-translate-y-0.5 z-10'
                    : 'bg-white/95 border-slate-200 hover:border-cyan-500/50 hover:bg-slate-50 hover:-translate-y-0.5 z-10'
                }`}
              >
                {/* Node Type Badge */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span
                    className="inline-flex items-center gap-1 text-[9.5px] font-mono-tech font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                    style={{
                      backgroundColor: typeConfig.bgDark,
                      color: typeConfig.color,
                      borderColor: typeConfig.borderDark,
                    }}
                  >
                    <Icon size={10} />
                    <span>{isEn ? typeConfig.labelEn : typeConfig.labelZh}</span>
                  </span>

                  <span className={`text-[10px] font-mono-tech ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    #{node.id}
                  </span>
                </div>

                {/* Node Main Title */}
                <h5 className={`text-xs font-semibold leading-snug line-clamp-2 mb-1.5 transition-colors ${
                  isSelected ? 'text-cyan-300 font-bold' : isDark ? 'text-slate-100 group-hover:text-cyan-300' : 'text-slate-900 group-hover:text-cyan-600'
                }`}>
                  {title}
                </h5>

                {/* Bullet details */}
                {details.length > 0 && (
                  <div className="space-y-0.5 border-t border-slate-800/50 pt-1 mt-1">
                    {details.slice(0, 2).map((bullet, bIdx) => (
                      <div
                        key={bIdx}
                        className={`text-[10.5px] leading-tight font-sans truncate ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        • {bullet}
                      </div>
                    ))}
                    {details.length > 2 && (
                      <span className="text-[9px] font-mono-tech text-cyan-400 block pt-0.5">
                        +{details.length - 2} more specs...
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Right: Floating Node Telemetry Inspector ── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`absolute bottom-4 right-4 z-40 max-w-sm sm:max-w-md w-full p-4 rounded-xl border shadow-2xl backdrop-blur-xl ${
              isDark ? 'bg-slate-950/90 border-cyan-500/40 text-slate-200' : 'bg-white/95 border-cyan-500/30 text-slate-800'
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-slate-800/80">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: TYPE_CONFIG[selectedNode.type]?.bgDark || 'rgba(6,182,212,0.1)',
                      color: TYPE_CONFIG[selectedNode.type]?.color || '#06B6D4',
                      borderColor: TYPE_CONFIG[selectedNode.type]?.borderDark || 'rgba(6,182,212,0.3)',
                    }}
                  >
                    {isEn ? TYPE_CONFIG[selectedNode.type]?.labelEn : TYPE_CONFIG[selectedNode.type]?.labelZh}
                  </span>
                  <span className="text-[10px] font-mono-tech text-slate-400">ID: {selectedNode.id}</span>
                </div>
                <h4 className="font-hud font-bold text-sm text-cyan-300">
                  {selectedNode.label.split('\n')[0]}
                </h4>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-slate-200 p-1 text-xs font-mono-tech rounded hover:bg-slate-800/50"
              >
                ✕
              </button>
            </div>

            {/* Spec bullets */}
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 text-xs">
              {selectedNode.label.split('\n').slice(1).map((line, lIdx) => (
                <div key={lIdx} className="flex items-start gap-1.5 text-slate-300 dark:text-slate-300">
                  <span className="text-cyan-400 font-bold shrink-0 mt-0.5">▸</span>
                  <span className="leading-relaxed">{line}</span>
                </div>
              ))}
            </div>

            {/* Pipeline Connections Info */}
            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10.5px] font-mono-tech text-slate-400">
              <div className="flex items-center gap-2">
                <span>IN: <strong className="text-cyan-400">{activeRelations.upstream.size}</strong></span>
                <span>OUT: <strong className="text-teal-400">{activeRelations.downstream.size}</strong></span>
              </div>
              {benchmark.paper_url && (
                <a
                  href={benchmark.paper_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink size={10} />
                  <span>{isEn ? 'Paper Citation' : '论文证据'}</span>
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer Stats & Legend ── */}
      <div className={`px-4 py-2 border-t shrink-0 z-20 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono-tech ${
        isDark ? 'bg-slate-950/80 border-slate-800/80 text-slate-400' : 'bg-white/80 border-slate-200 text-slate-600'
      }`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-500">// PIPELINE PHASES:</span>
          {Object.entries(TYPE_CONFIG).slice(0, 5).map(([typeKey, cfg]) => (
            <span key={typeKey} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span>{isEn ? cfg.labelEn : cfg.labelZh}</span>
            </span>
          ))}
        </div>

        {onFallbackToSvg && (
          <button
            onClick={onFallbackToSvg}
            className="text-cyan-400 hover:underline inline-flex items-center gap-1"
          >
            <span>{isEn ? 'Switch to Vector SVG Blueprint' : '切换原始矢量蓝图'}</span>
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
