// LLM Benchmark Costco 筛选栏
import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const L1_CATEGORIES = [
  { label: '通用语言能力', color: '#2563EB' },
  { label: 'Agent能力', color: '#10A37F' },
  { label: '多模态理解', color: '#7C3AED' },
  { label: '代码能力', color: '#EA580C' },
  { label: '科学推理', color: '#0891B2' },
  { label: '安全对齐', color: '#DC2626' },
  { label: '数学推理', color: '#D97706' },
  { label: '长文本理解', color: '#059669' },
  { label: '医疗健康', color: '#DB2777' },
  { label: '视频理解', color: '#6D28D9' },
  { label: '图表与文档理解', color: '#0D9488' },
  { label: '空间与3D理解', color: '#6366F1' },
];

const YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2012以前'];
const DIFFICULTIES = ['前沿', '专家', '进阶', '基础'];
const OPENNESS_OPTIONS = [
  { value: 'public', label: 'Public', color: '#10A37F' },
  { value: 'partly public', label: 'Partly Public', color: '#F59E0B' },
  { value: 'in-house', label: 'In-house', color: '#EF4444' },
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
  const hasActive = filters.l1 || filters.year || filters.difficulty || filters.openness || filters.widelyTested;
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const selectClass = isDark
    ? 'text-[12px] px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 outline-none focus:border-[#10A37F] transition-colors'
    : 'text-[12px] px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none focus:border-[#10A37F] transition-colors';

  const widelyActive = !!filters.widelyTested;

  return (
    <div className={`border-b sticky top-[3.75rem] z-20 transition-colors duration-200 ${isDark ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-100'}`}>
      <div className="container py-3">
        <div className="flex items-start gap-4">
          {/* 筛选图标 */}
          <div className={`flex items-center gap-1.5 text-[12px] shrink-0 pt-1.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            <SlidersHorizontal size={13} />
            <span>筛选</span>
          </div>

          {/* 筛选内容 */}
          <div className="flex-1 space-y-2 overflow-hidden">
            {/* L1 分类 + 广泛采用按钮 */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {L1_CATEGORIES.map(cat => {
                const active = filters.l1 === cat.label;
                const count = counts[cat.label] || 0;
                return (
                  <button
                    key={cat.label}
                    onClick={() => onChange({ l1: active ? '' : cat.label })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all duration-100 border"
                    style={active ? {
                      backgroundColor: cat.color,
                      color: 'white',
                      borderColor: cat.color,
                    } : isDark ? {
                      backgroundColor: 'transparent',
                      color: '#9CA3AF',
                      borderColor: '#374151',
                    } : {
                      backgroundColor: 'white',
                      color: '#6B7280',
                      borderColor: '#E5E7EB',
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = cat.color;
                        e.currentTarget.style.color = cat.color;
                        e.currentTarget.style.backgroundColor = cat.color + '15';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = isDark ? '#374151' : '#E5E7EB';
                        e.currentTarget.style.color = isDark ? '#9CA3AF' : '#6B7280';
                        e.currentTarget.style.backgroundColor = isDark ? 'transparent' : 'white';
                      }
                    }}
                  >
                    {cat.label}
                    <span className="text-[10px] opacity-70">{count}</span>
                  </button>
                );
              })}

              {/* 分隔线 */}
              <div className={`w-px h-5 mx-0.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />

              {/* 广泛采用筛选按钮 */}
              <button
                onClick={() => onChange({ widelyTested: widelyActive ? undefined : true })}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold transition-all duration-150 border ${
                  widelyActive
                    ? 'text-white border-transparent shadow-md'
                    : isDark
                      ? 'text-gray-300 border-amber-800/60 hover:border-amber-600 hover:text-amber-400'
                      : 'text-gray-600 border-amber-200 hover:border-amber-400 hover:text-amber-600'
                }`}
                style={widelyActive ? {
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  boxShadow: '0 2px 12px rgba(245,158,11,0.4)',
                } : isDark ? {
                  backgroundColor: 'rgba(245,158,11,0.08)',
                } : {
                  backgroundColor: 'rgba(245,158,11,0.06)',
                }}
                title="筛选被主要大模型厂商技术报告广泛采用的基准"
              >
                <span className="text-[14px] leading-none">🏅</span>
                <span>广泛采用</span>
                {widelyTestedCount > 0 && (
                  <span className={`text-[10px] ${widelyActive ? 'opacity-80' : 'opacity-60'}`}>{widelyTestedCount}</span>
                )}
              </button>
            </div>

            {/* 第二行：年份 + 难度 + 公开性 + 排序 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 年份下拉 */}
              <select
                value={filters.year}
                onChange={e => onChange({ year: e.target.value })}
                className={selectClass}
              >
                <option value="">全部年份</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* 难度下拉 */}
              <select
                value={filters.difficulty}
                onChange={e => onChange({ difficulty: e.target.value })}
                className={selectClass}
              >
                <option value="">全部难度</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* 公开性筛选 */}
              <div className="flex items-center gap-1">
                {OPENNESS_OPTIONS.map(opt => {
                  const active = filters.openness === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onChange({ openness: active ? '' : opt.value })}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all duration-100 border ${
                        active
                          ? 'text-white'
                          : isDark
                            ? 'text-gray-400 border-gray-700 hover:border-gray-600'
                            : 'text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                      style={active ? {
                        backgroundColor: opt.color,
                        borderColor: opt.color,
                      } : {}}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.color }} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* 排序 */}
              <select
                value={filters.sort}
                onChange={e => onChange({ sort: e.target.value as SortType })}
                className={selectClass}
              >
                <option value="newest">最新优先</option>
                <option value="oldest">最早优先</option>
                <option value="name">字母排序 A→Z</option>
              </select>

              {/* 清除筛选 */}
              {hasActive && (
                <button
                  onClick={() => onChange({ l1: '', year: '', difficulty: '', openness: '', widelyTested: undefined })}
                  className={`flex items-center gap-1 text-[12px] transition-colors px-2 py-1 rounded-lg ${
                    isDark
                      ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <X size={12} />
                  清除筛选
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
