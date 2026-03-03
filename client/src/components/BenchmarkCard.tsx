// OpenAI 风格胶囊卡片组件
// 设计：白底、左侧色条、胶囊标签、hover 轻阴影
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { Calendar, Building2, BarChart3, Layers } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  benchmark: Benchmark;
  onClick: (b: Benchmark) => void;
  style?: React.CSSProperties;
}

const DIFFICULTY_STYLE_LIGHT: Record<string, string> = {
  '前沿': 'bg-red-50 text-red-700 border border-red-200',
  '专家': 'bg-orange-50 text-orange-700 border border-orange-200',
  '进阶': 'bg-blue-50 text-blue-700 border border-blue-200',
  '基础': 'bg-gray-50 text-gray-600 border border-gray-200',
};

const DIFFICULTY_STYLE_DARK: Record<string, string> = {
  '前沿': 'bg-red-950/50 text-red-400 border border-red-900/60',
  '专家': 'bg-orange-950/50 text-orange-400 border border-orange-900/60',
  '进阶': 'bg-blue-950/50 text-blue-400 border border-blue-900/60',
  '基础': 'bg-gray-800/50 text-gray-400 border border-gray-700/60',
};

export default function BenchmarkCard({ benchmark: b, onClick, style }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const diffStyle = isDark
    ? (DIFFICULTY_STYLE_DARK[b.difficulty] || 'bg-gray-800/50 text-gray-400 border border-gray-700/60')
    : (DIFFICULTY_STYLE_LIGHT[b.difficulty] || 'bg-gray-50 text-gray-600 border border-gray-200');

  return (
    <div
      className={`group relative border rounded-xl p-5 cursor-pointer transition-all duration-150 overflow-hidden ${
        isDark
          ? 'bg-[#161616] border-gray-800 hover:border-gray-600 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-px'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md hover:-translate-y-px'
      }`}
      style={style}
      onClick={() => onClick(b)}
    >
      {/* 左侧分类色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-150 group-hover:w-[4px]"
        style={{ backgroundColor: b.l1_color }}
      />

      {/* 卡片内容 */}
      <div className="pl-2">
        {/* 顶部：名称 + 难度标签 */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={`font-semibold text-[15px] leading-snug group-hover:text-[#10A37F] transition-colors line-clamp-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            {b.name}
          </h3>
          {b.difficulty && (
            <span className={`tag-capsule shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${diffStyle}`}
              style={{ fontFamily: 'var(--font-mono)' }}>
              {b.difficulty}
            </span>
          )}
        </div>

        {/* 简介 */}
        <p className={`text-[13px] leading-relaxed line-clamp-2 mb-3 transition-colors ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {b.intro || '暂无简介'}
        </p>

        {/* 元信息行 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          {b.year && (
            <span className={`flex items-center gap-1 text-[12px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <Calendar size={11} />
              {b.year}
            </span>
          )}
          {b.org && (
            <span className={`flex items-center gap-1 text-[12px] truncate max-w-[160px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <Building2 size={11} />
              <span className="truncate">{b.org.split('、')[0].split(',')[0].trim()}</span>
            </span>
          )}
          {b.has_leaderboard && (
            <span className="flex items-center gap-1 text-[12px] text-[#10A37F]">
              <BarChart3 size={11} />
              排行榜
            </span>
          )}
        </div>

        {/* 底部标签行 */}
        <div className="flex flex-wrap gap-1.5">
          {/* L1 标签 */}
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: b.l1_color + (isDark ? '22' : '18'),
              color: b.l1_color,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Layers size={9} />
            {b.l1}
          </span>
          {/* L2 标签 */}
          {b.l2 && b.l2 !== b.l1 && (
            <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}
              style={{ fontFamily: 'var(--font-mono)' }}>
              {b.l2}
            </span>
          )}
          {/* 模态标签 */}
          {b.modality && (
            <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border transition-colors ${isDark ? 'bg-gray-800/50 text-gray-500 border-gray-700/50' : 'bg-gray-50 text-gray-400 border-gray-100'}`}
              style={{ fontFamily: 'var(--font-mono)' }}>
              {b.modality.split('+')[0].trim()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
