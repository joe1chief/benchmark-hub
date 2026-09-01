// LLM Benchmark Costco — BenchmarkCard (Next-Gen Cyber-HUD & Neon Tracing)
import React, { useState } from 'react';
import type { Benchmark } from '@/types/benchmark';
import { Calendar, Building2, BarChart3, Layers, Lock, Unlock, ShieldAlert, Star, Scale, Zap } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';
import { canonicalizeOpenness } from '@/lib/openness';

interface Props {
  benchmark: Benchmark;
  onClick: (b: Benchmark) => void;
  style?: React.CSSProperties;
  isStarred?: boolean;
  onToggleStar?: (e: React.MouseEvent) => void;
  isCompared?: boolean;
  onToggleCompare?: (e: React.MouseEvent) => void;
}

const DIFFICULTY_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  // Chinese keys
  '前沿': { text: '#F43F5E', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.35)' },
  '专家': { text: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)' },
  '进阶': { text: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)' },
  '基础': { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.35)' },
  '中等': { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.35)' },
  // English keys
  'Frontier':     { text: '#F43F5E', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.35)' },
  'Expert':       { text: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)' },
  'Advanced':     { text: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)' },
  'Basic':        { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.35)' },
  'Intermediate': { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.35)' },
};

function truncateOrg(org: string, maxLen = 20): string {
  if (!org) return '';
  const first = org.split(/[、,，/]/)[0].trim();
  return first.length <= maxLen ? first : first.slice(0, maxLen - 1) + '…';
}

export default function BenchmarkCard({
  benchmark: b,
  onClick,
  style,
  isStarred,
  onToggleStar,
  isCompared,
  onToggleCompare,
}: Props) {
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';
  const isEn = lang === 'en';
  const widelyTested = b.widely_tested === true;

  const diffKey = isEn ? (b.difficulty_en || b.difficulty) : b.difficulty;
  const diffColor = DIFFICULTY_COLORS[diffKey] || DIFFICULTY_COLORS[b.difficulty] || DIFFICULTY_COLORS['基础'];

  const intro = isEn ? (b.intro_en || b.intro) : b.intro;
  const modality = isEn ? (b.modality_en || b.modality) : b.modality;

  const opennessConfig: Record<string, { icon: typeof Unlock; color: string; label: string }> = {
    'public':        { icon: Unlock,      color: '#10A37F', label: t.publicLabel  },
    'partly public': { icon: ShieldAlert, color: '#F59E0B', label: t.partlyLabel  },
    'in-house':      { icon: Lock,        color: '#EF4444', label: t.privateLabel },
  };
  const opennessInfo = opennessConfig[canonicalizeOpenness(b.openness) || ''];
  const hasFlowchart = !!(b.drawio_flowchart_en || b.drawio_flowchart_zh || b.mermaid_flowchart);

  return (
    <article
      className={`group cursor-pointer cyber-card hud-bracket rounded-2xl relative overflow-hidden flex flex-col justify-between select-none ${
        widelyTested ? 'ring-1 ring-amber-500/30' : ''
      }`}
      style={{
        ...style,
        '--card-color': b.l1_color || '#00F0FF',
      } as React.CSSProperties}
      onClick={() => onClick(b)}
    >
      {/* 扫光流束 */}
      <div className="scan-glint" aria-hidden="true" />

      {/* 动态左侧领域霓虹灯条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl transition-all duration-300 group-hover:w-[6px]"
        style={{
          backgroundColor: b.l1_color || '#00F0FF',
          boxShadow: `0 0 12px ${b.l1_color || '#00F0FF'}88`,
        }}
      />

      {/* Content Inner Container */}
      <div className="p-5 pl-6 flex flex-col flex-1 justify-between gap-3.5 relative z-10">

        {/* Row 1: Badges, Title & Actions */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            {/* Title with icon */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {widelyTested && (
                <span
                  className="shrink-0 text-base leading-none select-none drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                  title={t.widelyNotice}
                >
                  🏅
                </span>
              )}
              <h3
                className="font-hud font-bold text-[15px] leading-snug truncate transition-all duration-200 text-slate-900 dark:text-slate-100 group-hover:text-cyan-400 group-hover:text-glow-cyan"
              >
                {b.name}
              </h3>
            </div>

            {/* Top Right Quick Actions */}
            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
              {/* Star Button */}
              {onToggleStar && (
                <button
                  onClick={onToggleStar}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isStarred
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                      : 'border-transparent text-slate-400 hover:text-amber-400 hover:bg-slate-800/40'
                  }`}
                  title={isStarred ? 'Unstar' : 'Star Benchmark'}
                >
                  <Star size={13} className={isStarred ? 'fill-amber-400' : ''} />
                </button>
              )}

              {/* Compare Button */}
              {onToggleCompare && (
                <button
                  onClick={onToggleCompare}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isCompared
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                      : 'border-transparent text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40'
                  }`}
                  title={isCompared ? 'Remove from Arena' : 'Add to Arena Compare'}
                >
                  <Scale size={13} />
                </button>
              )}

              {/* Difficulty badge */}
              {b.difficulty && diffColor && (
                <span
                  className="text-[10.5px] font-mono-tech font-bold px-2 py-0.5 rounded-md border"
                  style={{
                    color: diffColor.text,
                    backgroundColor: diffColor.bg,
                    borderColor: diffColor.border,
                  }}
                >
                  {t.difficulty[b.difficulty] || b.difficulty_en || b.difficulty}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <p
            className="text-[12.5px] leading-relaxed line-clamp-2 text-slate-600 dark:text-slate-400 font-sans"
          >
            {intro || '—'}
          </p>
        </div>

        {/* Middle Specs Bar: Metadata & Status */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-tech text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
          {b.published && (
            <span className="flex items-center gap-1">
              <Calendar size={11} className="text-slate-400" />
              <span>{b.published}</span>
            </span>
          )}
          {b.org && (
            <span className="flex items-center gap-1" title={b.org}>
              <Building2 size={11} className="text-slate-400 shrink-0" />
              <span className="truncate max-w-[120px]">{truncateOrg(b.org)}</span>
            </span>
          )}
          {hasFlowchart && (
            <span
              className="flex items-center gap-0.5 text-cyan-500 dark:text-cyan-400 font-medium"
              title={lang === 'zh' ? '包含评测构建流程图 (Pipeline Flowchart)' : 'Contains construction pipeline flowchart'}
            >
              <Zap size={11} />
              <span>Pipeline</span>
            </span>
          )}
          {opennessInfo && (
            <span className="flex items-center gap-1 font-semibold uppercase text-[10.5px]" style={{ color: opennessInfo.color }}>
              <opennessInfo.icon size={10} />
              <span>{opennessInfo.label}</span>
            </span>
          )}
        </div>

        {/* Bottom Tags */}
        <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="flex flex-wrap items-center gap-1.5">
            {b.l1 && (
              <span
                className="inline-flex items-center gap-1 text-[10.5px] font-mono-tech font-semibold px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor: `${b.l1_color || '#00F0FF'}15`,
                  color: b.l1_color || '#00F0FF',
                  border: `1px solid ${b.l1_color || '#00F0FF'}30`,
                }}
              >
                <Layers size={9} />
                {t.l1[b.l1] || b.l1}
              </span>
            )}
            {b.family && (
              <span className="inline-flex items-center text-[10.5px] font-mono-tech font-medium px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {b.family}
              </span>
            )}
          </div>

          {modality && (
            <span className="text-[10px] font-mono-tech text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
              {modality.split(/[+,，]/)[0].trim()}
            </span>
          )}
        </div>

      </div>
    </article>
  );
}
