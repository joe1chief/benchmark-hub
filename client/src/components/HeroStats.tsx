// LLM Benchmark Costco — HeroStats (Cyber-HUD Telemetry Station & KPI Decals)
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';
import { Zap, ShieldCheck, Cpu, Database } from 'lucide-react';

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
  const { t, lang } = useLang();
  const isDark = theme === 'dark';

  const total        = data.length;
  const categories   = new Set(data.map(b => b.l1)).size;
  const families     = new Set(data.filter(b => b.family).map(b => b.family)).size;
  const widelyTested = data.filter(b => b.widely_tested).length;

  const stats = [
    { key: 'total', value: total, label: t.statBenchmarks, color: '#00F0FF', icon: Database, desc: '100% Synced' },
    { key: 'dims', value: categories, label: t.statDims, color: '#3B82F6', icon: Cpu, desc: 'L1 Core Dims' },
    { key: 'families', value: families, label: t.statFamilies, color: '#8B5CF6', icon: Zap, desc: 'Cluster Series' },
    { key: 'widely', value: widelyTested, label: t.statWidely, color: '#F59E0B', icon: ShieldCheck, desc: '🏅 Top Standard' },
  ];

  return (
    <div className="py-6 sm:py-8">
      {/* Title row — Cyber HUD 特效 + 原子轨道装饰 */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3.5 mb-2">
            {/* 原子轨道 Loader */}
            <div
              className="atom-loader-wrap shrink-0"
              style={{
                opacity: isDark ? 1 : 0.8,
                transition: 'opacity 0.3s ease',
              }}
            >
              <AtomLoader />
            </div>

            {/* 标题 — Cyber Gradient */}
            <h1
              className="font-hud text-2xl sm:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]"
            >
              {t.heroTitle}
            </h1>
          </div>

          <p
            className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed font-sans"
          >
            {t.heroDesc(total, categories)}
          </p>
        </div>
      </div>

      {/* 4 Telemetry KPI Metric Cards with Corner Brackets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s, i) => {
          const active = s.key === 'widely' && activeFilters?.widelyTested;
          const Icon = s.icon;
          return (
            <div
              key={i}
              onClick={() => onStatClick?.(s.key as any)}
              className={`p-4 rounded-xl hud-bracket cursor-pointer select-none transition-all duration-300 relative overflow-hidden flex flex-col justify-between border ${
                active
                  ? 'bg-amber-950/40 border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                  : 'bg-white/80 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800/80 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)] hover:-translate-y-0.5'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] font-mono-tech text-slate-500 uppercase tracking-wider">
                  {s.label}
                </span>
                <Icon size={14} style={{ color: s.color }} />
              </div>

              <div className="flex items-baseline gap-2">
                <span
                  className="text-2xl sm:text-3xl font-bold font-hud tabular-nums leading-none"
                  style={{
                    color: s.color,
                    textShadow: active ? `0 0 15px ${s.color}88` : 'none',
                  }}
                >
                  {s.value}
                </span>
                <span className="text-[10px] font-mono-tech text-slate-400">
                  {s.desc}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
