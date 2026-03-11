// LLM Benchmark Costco — HeroStats (i18n + lazy-cow-47 title fx + nice-sheep-25 atom loader)
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';

interface Props {
  data: Benchmark[];
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

export default function HeroStats({ data }: Props) {
  const { theme } = useTheme();
  const { t } = useLang();
  const isDark = theme === 'dark';

  const total        = data.length;
  const categories   = new Set(data.map(b => b.l1)).size;
  const families     = new Set(data.filter(b => b.family).map(b => b.family)).size;
  const widelyTested = data.filter(b => b.widely_tested).length;

  const stats = [
    { value: total,        label: t.statBenchmarks, color: '#10A37F' },
    { value: categories,   label: t.statDims,        color: '#1A73E8' },
    { value: families,     label: t.statFamilies,    color: '#7C3AED' },
    { value: widelyTested, label: t.statWidely,      color: '#F59E0B' },
  ];

  return (
    <div className="container py-10">
        {/* Title row — lazy-cow-47 特效 + 原子轨道装饰 */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2.5">
            {/* nice-sheep-25 原子轨道 Loader */}
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
              {t.heroTitle}
            </h1>
          </div>

          <p
            className="text-[14px] max-w-xl leading-relaxed"
            style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#6B7280' : '#9CA3AF' }}
          >
            {t.heroDesc(total, categories)}
          </p>
        </div>

        {/* Stats + powered-by brutalist 标签 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-10">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span
                  className="text-[32px] font-bold tabular-nums leading-none"
                  style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.03em', color: s.color }}
                >
                  {s.value}
                </span>
                <span
                  className="text-[12px]"
                  style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#4B5563' : '#9CA3AF' }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* quiet-dog-6 brutalist 文字标签 */}
          <div className="quiet-dog-tag">
            <span className="quiet-dog-tag__text">
              {t.poweredByFull}
            </span>
          </div>
        </div>
    </div>
  );
}
