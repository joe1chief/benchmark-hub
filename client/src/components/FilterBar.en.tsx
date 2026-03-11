// LLM Benchmark Costco — FilterBar (English)
import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const L1_CATEGORIES = [
  { label: 'General Language',   color: '#2563EB' },
  { label: 'Agent Capability',   color: '#10A37F' },
  { label: 'Multimodal',         color: '#7C3AED' },
  { label: 'Code',               color: '#EA580C' },
  { label: 'Science & Reasoning',color: '#0891B2' },
  { label: 'Safety & Alignment', color: '#DC2626' },
  { label: 'Math',               color: '#D97706' },
  { label: 'Long Context',       color: '#059669' },
  { label: 'Medical & Health',   color: '#DB2777' },
  { label: 'Video Understanding',color: '#6D28D9' },
  { label: 'Chart & Document',   color: '#0D9488' },
  { label: 'Spatial & 3D',       color: '#6366F1' },
];

const YEARS = ['2026','2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015','2014','2013','2012','Before 2012'];
const DIFFICULTIES = ['Frontier','Expert','Advanced','Basic'];
const OPENNESS_OPTIONS = [
  { value: 'public',        label: 'Public',       color: '#10A37F' },
  { value: 'partly public', label: 'Partly Public', color: '#F59E0B' },
  { value: 'in-house',      label: 'In-house',      color: '#EF4444' },
];

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
  const isDark = theme === 'dark';
  const hasActive = filters.l1 || filters.year || filters.difficulty || filters.openness || filters.widelyTested;
  const widelyActive = !!filters.widelyTested;

  const baseSelectStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    padding: '5px 10px',
    borderRadius: '10px',
    border: `1px solid ${isDark ? '#2D2D2D' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
    color: isDark ? '#9CA3AF' : '#6B7280',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
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
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              color: isDark ? '#4B5563' : '#9CA3AF',
            }}
          >
            <SlidersHorizontal size={13} />
            <span>Filter</span>
          </div>

          <div className="flex-1 space-y-2 overflow-hidden">
            {/* Row 1: L1 categories + Widely Adopted */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {L1_CATEGORIES.map(cat => {
                const active = filters.l1 === cat.label;
                const count = counts[cat.label] || 0;
                return (
                  <button
                    key={cat.label}
                    onClick={() => onChange({ l1: active ? '' : cat.label })}
                    className="inline-flex items-center gap-1.5 transition-all duration-150"
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
                    {cat.label}
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>{count}</span>
                  </button>
                );
              })}

              {/* Divider */}
              <div
                className="w-px h-5 mx-0.5"
                style={{ backgroundColor: isDark ? '#2D2D2D' : '#E5E7EB' }}
              />

              {/* Widely Adopted button */}
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
                title="Filter benchmarks widely adopted by major AI labs"
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>🏅</span>
                <span>Widely Adopted</span>
                {widelyTestedCount > 0 && (
                  <span style={{ fontSize: '10px', opacity: widelyActive ? 0.85 : 0.6 }}>{widelyTestedCount}</span>
                )}
              </button>
            </div>

            {/* Row 2: Year + Difficulty + Openness + Sort + Clear */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Year */}
              <select
                value={filters.year}
                onChange={e => onChange({ year: e.target.value })}
                style={baseSelectStyle}
              >
                <option value="">All Years</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Difficulty */}
              <select
                value={filters.difficulty}
                onChange={e => onChange({ difficulty: e.target.value })}
                style={baseSelectStyle}
              >
                <option value="">All Levels</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

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
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Sort */}
              <select
                value={filters.sort}
                onChange={e => onChange({ sort: e.target.value as SortType })}
                style={baseSelectStyle}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">Name A→Z</option>
              </select>

              {/* Clear filters */}
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
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
