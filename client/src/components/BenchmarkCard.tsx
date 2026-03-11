// LLM Benchmark Costco — BenchmarkCard (i18n + Neon Glow Effect)
import React, { useRef, useCallback } from 'react';
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
  'Frontier': { text: '#DC2626', bg: 'rgba(220,38,38,0.08)', bgDark: 'rgba(220,38,38,0.12)' },
  'Expert': { text: '#D97706', bg: 'rgba(217,119,6,0.08)', bgDark: 'rgba(217,119,6,0.12)' },
  'Advanced': { text: '#2563EB', bg: 'rgba(37,99,235,0.08)', bgDark: 'rgba(37,99,235,0.12)' },
  'Basic': { text: '#6B7280', bg: 'rgba(107,114,128,0.08)', bgDark: 'rgba(107,114,128,0.10)' },
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
  const cardRef = useRef<HTMLDivElement>(null);

  // Use English difficulty key when in English mode
  const diffKey = isEn ? (b.difficulty_en || b.difficulty) : b.difficulty;
  const diffColor = DIFFICULTY_COLORS[diffKey] || DIFFICULTY_COLORS[b.difficulty];

  // Use English fields when in English mode
  const intro = isEn ? (b.intro_en || b.intro) : b.intro;
  const modality = isEn ? (b.modality_en || b.modality) : b.modality;

  const opennessConfig: Record<string, { icon: typeof Unlock; color: string; label: string }> = {
    'public':        { icon: Unlock,      color: '#10A37F', label: t.publicLabel  },
    'partly public': { icon: ShieldAlert, color: '#F59E0B', label: t.partlyLabel  },
    'in-house':      { icon: Lock,        color: '#EF4444', label: t.privateLabel },
  };
  const opennessInfo = b.openness ? opennessConfig[b.openness] : undefined;

  // 鼠标移动时更新 CSS 变量，驱动荧光光晕跟随鼠标
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mx', `${x}%`);
    el.style.setProperty('--my', `${y}%`);
  }, []);

  return (
    <article
      className="group relative cursor-pointer benchmark-card-glow"
      style={style}
      onClick={() => onClick(b)}
      onMouseMove={handleMouseMove}
      ref={cardRef}
    >
      {/* 扫光线 */}
      <div className="scan-line" aria-hidden="true" />

      <div
        className={`
          h-full flex flex-col rounded-2xl border overflow-hidden transition-all duration-300
          ${widelyTested ? 'benchmark-card-featured' : ''}
          ${isDark
            ? 'bg-[#161616] border-[#242424] hover:border-[#10A37F44] hover:shadow-[0_8px_32px_rgba(16,163,127,0.15),0_0_0_1px_rgba(16,163,127,0.15)]'
            : 'bg-white border-[#E5E7EB] hover:border-[#10A37F55] hover:shadow-[0_4px_24px_rgba(16,163,127,0.12),0_0_0_1px_rgba(16,163,127,0.12)]'
          }
        `}
      >
        {/* Top color bar — 荧光扩散 */}
        <div
          className="card-color-bar h-[3px] w-full shrink-0 transition-all duration-300 group-hover:h-[4px]"
          style={{
            backgroundColor: b.l1_color || '#999',
            boxShadow: `0 0 0px ${b.l1_color || '#999'}00`,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 8px ${b.l1_color || '#10A37F'}99, 0 0 16px ${b.l1_color || '#10A37F'}44`;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0px ${b.l1_color || '#999'}00`;
          }}
        />

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
          <div className="flex flex-wrap gap-1.5 pt-1 border-t" style={{ borderColor: isDark ? '#242424' : '#F3F4F6' }}>
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
