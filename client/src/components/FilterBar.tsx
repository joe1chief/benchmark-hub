// LLM Benchmark Costco — FilterBar (Cyber-HUD & Tactical Filter Chips)
import React from 'react';
import { SlidersHorizontal, X, Star, ShieldCheck, Zap, Unlock, RotateCcw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';

const L1_CATEGORIES = [
  { key: '通用语言能力', color: '#2563EB' },
  { key: 'Agent能力',   color: '#10A37F' },
  { key: '多模态理解',  color: '#7C3AED' },
  { key: '代码能力',    color: '#EA580C' },
  { key: '科学推理',    color: '#0891B2' },
  { key: '安全对齐',    color: '#DC2626' },
  { key: '数学推理',    color: '#D97706' },
  { key: '长文本理解',  color: '#059669' },
  { key: '医疗健康',    color: '#DB2777' },
  { key: '视频理解',    color: '#6D28D9' },
  { key: '图表与文档理解', color: '#0D9488' },
  { key: '空间与3D理解',  color: '#6366F1' },
];

const YEARS = ['2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015','2014','2013','2012','2012以前'];
const DIFFICULTIES_ZH = ['前沿','专家','进阶','基础','中等'];
const DIFFICULTIES_EN = ['Frontier','Expert','Advanced','Basic','Intermediate'];

type SortType = 'newest' | 'oldest' | 'name';
interface Filters {
  l1: string;
  year: string;
  difficulty: string;
  openness: string;
  sort: SortType;
  widelyTested?: boolean;
  starredOnly?: boolean;
  flowchartOnly?: boolean;
}

interface Props {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  counts: Record<string, number>;
  widelyTestedCount?: number;
  starredCount?: number;
  flowchartCount?: number;
}

export default function FilterBar({
  filters,
  onChange,
  counts,
  widelyTestedCount = 0,
  starredCount = 0,
}: Props) {
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';
  const hasActive =
    filters.l1 ||
    filters.year ||
    filters.difficulty ||
    filters.openness ||
    filters.widelyTested ||
    filters.starredOnly ||
    filters.flowchartOnly;

  const widelyActive = !!filters.widelyTested;
  const starredActive = !!filters.starredOnly;
  const flowchartActive = !!filters.flowchartOnly;

  const OPENNESS_OPTIONS = [
    { value: 'public',        label: t.publicLabel,   color: '#10A37F' },
    { value: 'partly public', label: t.partlyLabel,   color: '#F59E0B' },
    { value: 'in-house',      label: t.inHouse,       color: '#EF4444' },
  ];

  const selectClassName = `text-xs font-mono-tech py-1 px-2.5 rounded-xl border transition-colors outline-none cursor-pointer ${
    isDark
      ? 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-cyan-500/40 focus:border-cyan-400'
      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 focus:border-cyan-500'
  }`;

  return (
    <div
      id="filter-bar"
      className="sticky border-b transition-colors duration-200 z-30 bg-white/90 dark:bg-slate-950/85 backdrop-blur-xl border-slate-200/80 dark:border-slate-800/80"
      style={{ top: '4rem' }}
    >
      <div className="container py-3">
        <div className="space-y-2.5">

          {/* Row 1: L1 Capability Taxonomy Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => onChange({ l1: '' })}
              className={`shrink-0 text-xs font-mono-tech px-3 py-1.5 rounded-xl border transition-all ${
                !filters.l1
                  ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(0,240,255,0.15)] font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              ✦ {t.allCategories}
            </button>

            {L1_CATEGORIES.map(cat => {
              const label = t.l1[cat.key] || cat.key;
              const active = filters.l1 === cat.key;
              const count = counts[cat.key] || 0;
              return (
                <button
                  key={cat.key}
                  onClick={() => onChange({ l1: active ? '' : cat.key })}
                  className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-mono-tech px-3 py-1.5 rounded-xl border transition-all ${
                    active
                      ? 'font-semibold shadow-sm'
                      : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    backgroundColor: active ? (isDark ? `${cat.color}25` : `${cat.color}15`) : (isDark ? '#0F172A50' : '#F1F5F9'),
                    borderColor: active ? cat.color : (isDark ? '#1E293B' : '#E2E8F0'),
                    color: active ? (isDark ? '#FFFFFF' : cat.color) : (isDark ? '#94A3B8' : '#475569'),
                    boxShadow: active ? `0 0 12px ${cat.color}40` : 'none',
                  }}
                >
                  <span>{label}</span>
                  <span className="text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Row 2: Tactical Quick Filters & Select Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            {/* Quick Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Widely Tested Medals */}
              <button
                onClick={() => onChange({ widelyTested: widelyActive ? undefined : true })}
                className={`inline-flex items-center gap-1.5 text-xs font-mono-tech px-3 py-1.5 rounded-xl border transition-all ${
                  widelyActive
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-semibold'
                    : 'bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 hover:text-amber-500'
                }`}
              >
                <span>🏅</span>
                <span>{t.widelyAdopted}</span>
                {widelyTestedCount > 0 && <span className="text-[10px] opacity-70">({widelyTestedCount})</span>}
              </button>

              {/* Starred Only */}
              <button
                onClick={() => onChange({ starredOnly: starredActive ? undefined : true })}
                className={`inline-flex items-center gap-1.5 text-xs font-mono-tech px-3 py-1.5 rounded-xl border transition-all ${
                  starredActive
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-semibold'
                    : 'bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 hover:text-amber-500'
                }`}
              >
                <Star size={12} className={starredActive ? 'fill-amber-400' : ''} />
                <span>{lang === 'zh' ? '已收藏' : 'Starred'}</span>
                {starredCount > 0 && <span className="text-[10px] opacity-70">({starredCount})</span>}
              </button>
            </div>

            {/* Dropdown Select Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Year Select */}
              <select
                value={filters.year}
                onChange={e => onChange({ year: e.target.value })}
                className={selectClassName}
              >
                <option value="">{t.allYears}</option>
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}{lang === 'zh' && y !== '2012以前' ? '年' : ''}</option>
                ))}
              </select>

              {/* Difficulty Select */}
              <select
                value={filters.difficulty}
                onChange={e => onChange({ difficulty: e.target.value })}
                className={selectClassName}
              >
                <option value="">{t.allDifficulty}</option>
                {(lang === 'zh' ? DIFFICULTIES_ZH : DIFFICULTIES_EN).map(d => (
                  <option key={d} value={d}>{t.difficulty[d] || d}</option>
                ))}
              </select>

              {/* Openness Select */}
              <select
                value={filters.openness}
                onChange={e => onChange({ openness: e.target.value })}
                className={selectClassName}
              >
                <option value="">{t.allOpenness}</option>
                {OPENNESS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Sort Select */}
              <select
                value={filters.sort}
                onChange={e => onChange({ sort: e.target.value as SortType })}
                className={selectClassName}
              >
                <option value="newest">{t.sortNewest}</option>
                <option value="oldest">{t.sortOldest}</option>
                <option value="name">{t.sortName}</option>
              </select>

              {/* Reset all filters */}
              {hasActive && (
                <button
                  onClick={() => onChange({
                    l1: '',
                    year: '',
                    difficulty: '',
                    openness: '',
                    sort: 'newest',
                    widelyTested: undefined,
                    starredOnly: undefined,
                    flowchartOnly: undefined,
                  })}
                  className="flex items-center gap-1 text-xs font-mono-tech px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all"
                  title="Reset Filters"
                >
                  <RotateCcw size={11} />
                  <span>{lang === 'zh' ? '重置' : 'Reset'}</span>
                </button>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
