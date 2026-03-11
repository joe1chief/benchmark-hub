// LLM Benchmark Costco — BenchmarkCard (i18n + heavy-elephant-39 Neon Glow)
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { Calendar, Building2, BarChart3, Layers, Lock, Unlock, ShieldAlert } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';

interface Props {
  benchmark: Benchmark;
  onClick: (b: Benchmark) => void;
  style?: React.CSSProperties;
}

const DIFFICULTY_COLORS: Record<string, { text: string; bg: string; bgDark: string }> = {
  // Chinese keys
  '前沿': { text: '#DC2626', bg: 'rgba(220,38,38,0.08)', bgDark: 'rgba(220,38,38,0.12)' },
  '专家': { text: '#D97706', bg: 'rgba(217,119,6,0.08)', bgDark: 'rgba(217,119,6,0.12)' },
  '进阶': { text: '#2563EB', bg: 'rgba(37,99,235,0.08)', bgDark: 'rgba(37,99,235,0.12)' },
  '基础': { text: '#6B7280', bg: 'rgba(107,114,128,0.08)', bgDark: 'rgba(107,114,128,0.10)' },
  '中等': { text: '#6B7280', bg: 'rgba(107,114,128,0.08)', bgDark: 'rgba(107,114,128,0.10)' },
  // English keys
  'Frontier':     { text: '#DC2626', bg: 'rgba(220,38,38,0.08)', bgDark: 'rgba(220,38,38,0.12)' },
  'Expert':       { text: '#D97706', bg: 'rgba(217,119,6,0.08)', bgDark: 'rgba(217,119,6,0.12)' },
  'Advanced':     { text: '#2563EB', bg: 'rgba(37,99,235,0.08)', bgDark: 'rgba(37,99,235,0.12)' },
  'Basic':        { text: '#6B7280', bg: 'rgba(107,114,128,0.08)', bgDark: 'rgba(107,114,128,0.10)' },
  'Intermediate': { text: '#6B7280', bg: 'rgba(107,114,128,0.08)', bgDark: 'rgba(107,114,128,0.10)' },
};

function truncateOrg(org: string, maxLen = 20): string {
  if (!org) return '';
  const first = org.split(/[、,，]/)[0].trim();
  return first.length <= maxLen ? first : first.slice(0, maxLen - 1) + '…';
}

export default function BenchmarkCard({ benchmark: b, onClick, style }: Props) {
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';
  const isEn = lang === 'en';
  const widelyTested = b.widely_tested === true;

  const diffKey = isEn ? (b.difficulty_en || b.difficulty) : b.difficulty;
  const diffColor = DIFFICULTY_COLORS[diffKey] || DIFFICULTY_COLORS[b.difficulty];

  const intro = isEn ? (b.intro_en || b.intro) : b.intro;
  const modality = isEn ? (b.modality_en || b.modality) : b.modality;

  const opennessConfig: Record<string, { icon: typeof Unlock; color: string; label: string }> = {
    'public':        { icon: Unlock,      color: '#10A37F', label: t.publicLabel  },
    'partly public': { icon: ShieldAlert, color: '#F59E0B', label: t.partlyLabel  },
    'in-house':      { icon: Lock,        color: '#EF4444', label: t.privateLabel },
  };
  const opennessInfo = b.openness ? opennessConfig[b.openness] : undefined;

  return (
    <article
      className={`group cursor-pointer benchmark-card-glow ${widelyTested ? 'benchmark-card-featured' : ''}`}
      style={style}
      onClick={() => onClick(b)}
    >
      {/* 扫光线 */}
      <div className="scan-line" aria-hidden="true" />

      {/* 内层内容区 — heavy-elephant-39 的 .card-info */}
      <div className="benchmark-card-inner h-full flex flex-col">

        {/* Card content */}
        <div className="flex flex-col flex-1 px-5 pt-4 pb-4 gap-3">

          {/* Row 1: medal + name + difficulty */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {widelyTested && (
                <span
                  className="shrink-0 text-[16px] leading-none select-none"
                  title={t.widelyNotice}
                  style={{ filter: 'drop-shadow(0 1px 3px rgba(245,158,11,0.5))' }}
                >
                  🏅
                </span>
              )}
              <span
                className="font-semibold text-[14px] leading-snug truncate transition-all duration-300 group-hover:brightness-110"
                style={{
                  color: b.l1_color || '#999',
                  fontFamily: "'Inter', -apple-system, sans-serif",
                  letterSpacing: '-0.01em',
                  textShadow: 'none',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLSpanElement).style.textShadow = `0 0 12px ${b.l1_color || '#10A37F'}88`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLSpanElement).style.textShadow = 'none';
                }}
              >
                {b.name}
              </span>
            </div>

            {/* Difficulty badge */}
            {b.difficulty && diffColor && (
              <span
                className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md transition-all duration-200 group-hover:brightness-110"
                style={{
                  color: diffColor.text,
                  backgroundColor: isDark ? diffColor.bgDark : diffColor.bg,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {t.difficulty[b.difficulty] || b.difficulty_en || b.difficulty}
              </span>
            )}
          </div>

          {/* Description */}
          <p
            className="text-[13px] leading-relaxed line-clamp-2 flex-1"
            style={{ color: isDark ? '#9CA3AF' : '#6B7280' }}
          >
            {intro || '—'}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {b.published && (
              <span className="flex items-center gap-1 text-[11.5px]" style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}>
                <Calendar size={11} />
                {b.published}
              </span>
            )}
            {b.org && (
              <span
                className="flex items-center gap-1 text-[11.5px]"
                style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}
                title={b.org}
              >
                <Building2 size={11} className="shrink-0" />
                <span className="truncate" style={{ maxWidth: '130px' }}>
                  {truncateOrg(b.org)}
                </span>
              </span>
            )}
            {b.has_leaderboard && (
              <span className="flex items-center gap-1 text-[11.5px]" style={{ color: '#10A37F' }}>
                <BarChart3 size={11} />
                {t.leaderboard}
              </span>
            )}
            {opennessInfo && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: opennessInfo.color }}>
                <opennessInfo.icon size={10} />
                {opennessInfo.label}
              </span>
            )}
          </div>

          {/* Bottom tags */}
          <div className="flex flex-wrap gap-1.5 pt-1 border-t" style={{ borderColor: isDark ? '#2A2A2A' : '#F3F4F6' }}>
            {b.l1 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md transition-all duration-200 group-hover:brightness-110"
                style={{ backgroundColor: (b.l1_color || '#999') + (isDark ? '1A' : '12'), color: b.l1_color || '#999' }}
              >
                <Layers size={9} />
                {t.l1[b.l1] || b.l1}
              </span>
            )}
            {b.family && (
              <span
                className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md"
                style={{ backgroundColor: isDark ? 'rgba(16,163,127,0.10)' : 'rgba(16,163,127,0.08)', color: '#10A37F' }}
              >
                {b.family}
              </span>
            )}
            {modality && (
              <span
                className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: isDark ? '#9CA3AF' : '#9CA3AF' }}
              >
                {(modality || '').split(/[+,，]/)[0].trim() || modality}
              </span>
            )}
          </div>

        </div>
      </div>
    </article>
  );
}
