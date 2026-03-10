// LLM Benchmark Costco — FilterBar (i18n)
import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
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
}
interface Props {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  counts: Record<string, number>;
  widelyTestedCount?: number;
}

export default function FilterBar({ filters, onChange, counts, widelyTestedCount = 0 }: Props) {
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';
  const hasActive = filters.l1 || filters.year || filters.difficulty || filters.openness || filters.widelyTested;
  const widelyActive = !!filters.widelyTested;

  const OPENNESS_OPTIONS = [
    { value: 'public',        label: t.publicLabel,   color: '#10A37F' },
    { value: 'partly public', label: t.partlyLabel,   color: '#F59E0B' },
    { value: 'in-house',      label: t.inHouse,       color: '#EF4444' },
  ];

  const baseSelectStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    padding: '5px 24px 5px 10px',
    borderRadius: '10px',
    border: `1px solid ${isDark ? '#2D2D2D' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
    color: isDark ? '#9CA3AF' : '#6B7280',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${isDark ? '%236B7280' : '%239CA3AF'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 6px center',
    backgroundSize: '12px',
  };

  return (
    <div
      className="sticky border-b transition-colors duration-200"
      style={{
        top: '3.75rem',
        zIndex: 20,
        backgroundColor: isDark ? '#0F0F0F' : '#FFFFFF',
        borderColor: isDark ? '#1F1F1F' : '#F3F4F6',
      }}
    >
      <div className="container py-3">
        <div className="flex items-start gap-4">

          {/* Filter icon */}
          <div
            className="flex items-center gap-1.5 shrink-0 pt-[7px]"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: isDark ? '#4B5563' : '#9CA3AF' }}
          >
            <SlidersHorizontal size={13} />
            <span>{lang === 'zh' ? '筛选' : 'Filter'}</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-hidden">
            {/* Row 1: L1 categories */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {L1_CATEGORIES.map(cat => {
                const label = t.l1[cat.key] || cat.key;
                const active = filters.l1 === cat.key;
                const count = counts[cat.key] || 0;
                return (
                  <button
                    key={cat.key}
                    onClick={() => onChange({ l1: active ? '' : cat.key })}
                    className="inline-flex items-center gap-1 transition-all duration-150"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: active ? 500 : 400,
                      padding: '4px 10px',
                      borderRadius: '10px',
                      border: `1px solid ${active ? cat.color : (isDark ? '#2D2D2D' : '#E5E7EB')}`,
                      backgroundColor: active ? cat.color : (isDark ? '#1A1A1A' : '#FFFFFF'),
                      color: active ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#6B7280'),
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = cat.color;
                        e.currentTarget.style.color = cat.color;
                        e.currentTarget.style.backgroundColor = cat.color + '0F';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = isDark ? '#2D2D2D' : '#E5E7EB';
                        e.currentTarget.style.color = isDark ? '#9CA3AF' : '#6B7280';
                        e.currentTarget.style.backgroundColor = isDark ? '#1A1A1A' : '#FFFFFF';
                      }
                    }}
                  >
                    {label}
                    <span style={{ fontSize: '10px', opacity: 0.5 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Row 2: widely adopted + secondary filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Widely adopted button */}
              <button
                onClick={() => onChange({ widelyTested: widelyActive ? undefined : true })}
                className="inline-flex items-center gap-1.5 transition-all duration-150"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '12px',
                  fontWeight: widelyActive ? 600 : 500,
                  padding: '4px 12px',
                  borderRadius: '10px',
                  border: `1px solid ${widelyActive ? '#F59E0B' : (isDark ? '#44320A' : '#FDE68A')}`,
                  backgroundColor: widelyActive
                    ? '#F59E0B'
                    : (isDark ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.05)'),
                  color: widelyActive ? '#FFFFFF' : (isDark ? '#D97706' : '#B45309'),
                  cursor: 'pointer',
                  boxShadow: widelyActive ? '0 2px 8px rgba(245,158,11,0.3)' : 'none',
                }}
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>🏅</span>
                <span>{t.widelyAdopted}</span>
                {widelyTestedCount > 0 && (
                  <span style={{ fontSize: '10px', opacity: widelyActive ? 0.85 : 0.6 }}>{widelyTestedCount}</span>
                )}
              </button>

              {/* Divider */}
              <div className="w-px h-5 mx-0.5" style={{ backgroundColor: isDark ? '#2D2D2D' : '#E5E7EB' }} />

              {/* Year */}
              <select value={filters.year} onChange={e => onChange({ year: e.target.value })} style={baseSelectStyle}>
                <option value="">{t.allYears}</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Difficulty */}
              <select value={filters.difficulty} onChange={e => onChange({ difficulty: e.target.value })} style={baseSelectStyle}>
                <option value="">{t.allDifficulty}</option>
                {(lang === 'zh' ? DIFFICULTIES_ZH : DIFFICULTIES_EN).map(d => (
                  <option key={d} value={d}>{t.difficulty[d] || d}</option>
                ))}
              </select>

              {/* Divider */}
              <div className="w-px h-5 mx-0.5" style={{ backgroundColor: isDark ? '#2D2D2D' : '#E5E7EB' }} />

              {/* Openness */}
              <div className="flex items-center gap-1">
                {OPENNESS_OPTIONS.map(opt => {
                  const active = filters.openness === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onChange({ openness: active ? '' : opt.value })}
                      className="inline-flex items-center gap-1 transition-all duration-150"
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '4px 8px',
                        borderRadius: '8px',
                        border: `1px solid ${active ? opt.color : (isDark ? '#2D2D2D' : '#E5E7EB')}`,
                        backgroundColor: active ? opt.color + '18' : 'transparent',
                        color: active ? opt.color : (isDark ? '#6B7280' : '#9CA3AF'),
                        cursor: 'pointer',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.color }} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Divider */}
              <div className="w-px h-5 mx-0.5" style={{ backgroundColor: isDark ? '#2D2D2D' : '#E5E7EB' }} />

              {/* Sort */}
              <select value={filters.sort} onChange={e => onChange({ sort: e.target.value as SortType })} style={baseSelectStyle}>
                <option value="newest">{t.sortNewest}</option>
                <option value="oldest">{t.sortOldest}</option>
                <option value="name">{t.sortName}</option>
              </select>

              {/* Clear */}
              {hasActive && (
                <button
                  onClick={() => onChange({ l1: '', year: '', difficulty: '', openness: '', widelyTested: undefined })}
                  className="flex items-center gap-1 transition-colors"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '12px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    color: isDark ? '#6B7280' : '#9CA3AF',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = isDark ? '#E5E7EB' : '#374151';
                    e.currentTarget.style.backgroundColor = isDark ? '#1F1F1F' : '#F3F4F6';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = isDark ? '#6B7280' : '#9CA3AF';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <X size={12} />
                  {lang === 'zh' ? '清除' : 'Clear'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
