// LLM Benchmark Costco — HeroStats (English + lazy-cow-47 title fx + nice-sheep-25 atom loader)
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  data: Benchmark[];
  activeFilters?: any;
  onStatClick?: (statType: 'total' | 'dims' | 'families' | 'widely') => void;
}

/** nice-sheep-25 原子轨道 Loader（使用项目原配色 #10A37F） */
function AtomLoader() {
  return (
    <div className="atom-loader" aria-hidden="true">
      <div className="atom-react-star">
        <div className="atom-nucleus" />
        <div className="atom-electron" />
        <div className="atom-electron atom-electron2" />
        <div className="atom-electron atom-electron3" />
      </div>
    </div>
  );
}

export default function HeroStats({ data, activeFilters, onStatClick }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const total        = data.length;
  const categories   = new Set(data.map(b => b.l1)).size;
  const families     = new Set(data.filter(b => b.family).map(b => b.family)).size;
  const widelyTested = data.filter(b => (b as any).widely_tested).length;

  const stats = [
    { key: 'total', value: total,        label: 'Benchmarks',       color: '#10A37F' },
    { key: 'dims', value: categories,   label: 'Capability Dims',  color: '#1A73E8' },
    { key: 'families', value: families,     label: 'Families',         color: '#7C3AED' },
    { key: 'widely', value: widelyTested, label: 'Widely Adopted',   color: '#F59E0B' },
  ];

  return (
    <div className="container py-10">
        {/* Title row — lazy-cow-47 特效 + 原子轨道装饰 */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2.5">
            {/* nice-sheep-25 Atom Loader */}
            <div
              className="atom-loader-wrap"
              style={{
                opacity: isDark ? 1 : 0.7,
                transition: 'opacity 0.3s ease',
                flexShrink: 0,
              }}
            >
              <AtomLoader />
            </div>

            {/* 标题 — lazy-cow-47 特效 */}
            <h1
              className="hero-title-fx text-[30px] font-semibold tracking-tight"
              style={{
                fontFamily: "'Inter', -apple-system, sans-serif",
                color: isDark ? '#34D399' : '#10A37F',
              }}
            >
              LLM Benchmark Costco
            </h1>
          </div>

          <p
            className="text-[14px] max-w-xl leading-relaxed"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: isDark ? '#6B7280' : '#9CA3AF',
            }}
          >
            A curated database of{' '}
            <strong style={{ color: isDark ? '#D1D5DB' : '#374151', fontWeight: 600 }}>{total}</strong>{' '}
            LLM evaluation benchmarks across{' '}
            <strong style={{ color: isDark ? '#D1D5DB' : '#374151', fontWeight: 600 }}>{categories}</strong>{' '}
            capability dimensions. Each entry includes the full paper for inline reading.
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-10">
            {stats.map((s, i) => {
              const active = s.key === 'widely' && activeFilters?.widelyTested;
              return (
                <div
                  key={i}
                  className="flex flex-col gap-0.5 cursor-pointer select-none transition-all duration-300 hover:scale-105 active:scale-95"
                  onClick={() => onStatClick?.(s.key as any)}
                >
                  <span
                    className="text-[32px] font-bold tabular-nums leading-none"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      letterSpacing: '-0.03em',
                      color: s.color,
                      textShadow: active ? `0 0 15px ${s.color}88` : 'none',
                    }}
                  >
                    {s.value}
                  </span>
                  <span
                    className="text-[12px]"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      color: active ? s.color : (isDark ? '#4B5563' : '#9CA3AF'),
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}
