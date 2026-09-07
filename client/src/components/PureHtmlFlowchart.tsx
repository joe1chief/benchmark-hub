// LLM Benchmark Costco — Pure CSS + HTML Flowchart Engine
// Renders paper-aligned benchmark build & evaluation flowcharts completely from scratch using CSS & HTML DOM
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Copy, Check, Maximize2, Minimize2, ListFilter, Network } from 'lucide-react';
import type { Benchmark } from '@/types/benchmark';
import { partitionBuildProcess, type StageModule } from '@/lib/buildProcessStages';
import { BuildProcessLanes, ProcessTransitions, processNodeTitle, SHAPE_CONFIG } from './BuildProcessCards';
import { useLang } from '@/contexts/LangContext';

interface ArchNode {
  id: string;
  module?: string;
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
  modules?: StageModule[];
  nodes: ArchNode[];
  edges: ArchEdge[];
}

interface Props {
  benchmark: Benchmark;
  isDark: boolean;
  initialFullscreen?: boolean;
}

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

  const { allNodes, nodeMap, edges } = useMemo(
    () => partitionBuildProcess(archData), [archData],
  );

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
      `| Step | Phase | Stage Operation & Verification Gate |`,
      `| :--- | :--- | :--- |`,
    ];

    allNodes.forEach((n, idx) => {
      const parts = n.label.split('\n').map(s => s.trim()).filter(Boolean);
      const title = processNodeTitle(n, isEn);
      const details = parts.slice(1).join('; ');
      const category = SHAPE_CONFIG[n.type]?.[isEn ? 'nameEn' : 'nameZh'] || n.type;
      lines.push(`| ${idx + 1} | ${category} | **${title}** ${details ? `— ${details}` : ''} |`);
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
          <div style={{ zoom: scale }}>
            <BuildProcessLanes arch={archData} isDark={isDark} isEn={isEn}
              selectedNodeId={selectedNodeId}
              onSelect={id => setSelectedNodeId(selectedNodeId === id ? null : id)} />
          </div>
        ) : (
          /* ── Stage Matrix Layout (Structured Table) ── */
          <div className="overflow-x-auto pb-4">
            <table className={`w-full text-left text-xs border-collapse ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-100/60'}`}>
                  <th className="py-2.5 px-3 font-mono-tech text-cyan-400">#</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'PHASE' : '阶段类型'}</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'OPERATION' : '核心操作与准则'}</th>
                  <th className="py-2.5 px-3 font-mono-tech text-slate-400">{isEn ? 'LEADS TO' : '下游流转'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {allNodes.map((n, idx) => {
                  const cfg = SHAPE_CONFIG[n.type] || SHAPE_CONFIG.process;
                  const Icon = cfg.icon;
                  const lines = n.label.split('\n').map(l => l.trim()).filter(Boolean);
                  const title = processNodeTitle(n, isEn);
                  const details = lines.slice(1).join('; ');

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
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-200 dark:text-slate-100">{title}</div>
                        {details && <div className="text-[11px] text-slate-400 mt-0.5">{details}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tech text-[10.5px] text-teal-400">
                        <ProcessTransitions nodeId={n.id} edges={edges} nodeMap={nodeMap} isEn={isEn} onSelect={setSelectedNodeId} />
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
                  {isEn ? 'Step details' : '步骤详情'}
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
              <ProcessTransitions nodeId={selectedNode.id} edges={edges} nodeMap={nodeMap} isEn={isEn} onSelect={setSelectedNodeId} />
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
