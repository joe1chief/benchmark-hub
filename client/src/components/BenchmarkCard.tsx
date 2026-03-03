// LLM Benchmark Costco 卡片组件
// 设计：名称无边框，纯文字 + 彩色文字阴影，悬浮时有光晕效果
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { Calendar, Building2, BarChart3, Layers, Award, Lock, Unlock, ShieldAlert } from 'lucide-react';
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

const OPENNESS_CONFIG: Record<string, { icon: typeof Unlock; color: string; label: string }> = {
  'public': { icon: Unlock, color: '#10A37F', label: 'Public' },
  'partly public': { icon: ShieldAlert, color: '#F59E0B', label: 'Partly' },
  'in-house': { icon: Lock, color: '#EF4444', label: 'In-house' },
};

export default function BenchmarkCard({ benchmark: b, onClick, style }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const diffStyle = isDark
    ? (DIFFICULTY_STYLE_DARK[b.difficulty] || 'bg-gray-800/50 text-gray-400 border border-gray-700/60')
    : (DIFFICULTY_STYLE_LIGHT[b.difficulty] || 'bg-gray-50 text-gray-600 border border-gray-200');

  const opennessInfo = OPENNESS_CONFIG[b.openness];

  // 名称文字阴影：多层叠加，产生发光感
  const nameTextShadow = isDark
    ? `0 0 12px ${b.l1_color}99, 0 0 24px ${b.l1_color}44, 0 1px 3px rgba(0,0,0,0.8)`
    : `0 0 8px ${b.l1_color}55, 0 1px 2px rgba(0,0,0,0.12), 0 2px 8px ${b.l1_color}33`;

  return (
    <div
      className="group relative cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      style={{ ...style }}
      onClick={() => onClick(b)}
    >
      {/* ── 卡片主体 ── */}
      <div
        className={`relative rounded-xl border transition-all duration-200 overflow-hidden ${
          isDark
            ? 'bg-[#161616] border-gray-800 group-hover:border-gray-700 group-hover:shadow-xl group-hover:shadow-black/40'
            : 'bg-white border-gray-200 group-hover:border-gray-300 group-hover:shadow-lg group-hover:shadow-gray-200/80'
        }`}
      >
        {/* 渐变色边框 overlay - hover 时显示 */}
        <div
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${b.l1_color}88, ${b.l1_color}22, ${b.l1_color}55)`,
            padding: '1px',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* 左侧分类色条 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-200 group-hover:w-[4px]"
          style={{ backgroundColor: b.l1_color }}
        />

        {/* 卡片内容 */}
        <div className="pl-5 pr-4 pt-4 pb-4">
          {/* 顶部：名称 + 难度标签 */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            {/* 名称：无框，纯文字 + 阴影 */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {b.widely_tested && (
                <Award
                  size={12}
                  className="text-amber-500 shrink-0 mt-0.5"
                  title="被主要大模型厂商技术报告广泛测试"
                />
              )}
              <span
                className="font-bold text-[14px] leading-tight truncate"
                style={{
                  color: b.l1_color,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '-0.02em',
                  textShadow: nameTextShadow,
                }}
              >
                {b.name}
              </span>
            </div>
            {/* 难度标签 */}
            {b.difficulty && (
              <span
                className={`tag-capsule shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${diffStyle}`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {b.difficulty}
              </span>
            )}
          </div>

          {/* 简介 */}
          <p className={`text-[12.5px] leading-relaxed line-clamp-2 mb-3 transition-colors ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {b.intro || '暂无简介'}
          </p>

          {/* 元信息行 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            {b.published && (
              <span className={`flex items-center gap-1 text-[11.5px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                <Calendar size={11} />
                {b.published}
              </span>
            )}
            {b.org && (
              <span className={`flex items-center gap-1 text-[11.5px] truncate max-w-[160px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                <Building2 size={11} />
                <span className="truncate">{b.org.split('、')[0].split(',')[0].trim()}</span>
              </span>
            )}
            {b.has_leaderboard && (
              <span className="flex items-center gap-1 text-[11.5px] text-[#10A37F]">
                <BarChart3 size={11} />
                排行榜
              </span>
            )}
            {opennessInfo && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: opennessInfo.color }}>
                <opennessInfo.icon size={10} />
                {opennessInfo.label}
              </span>
            )}
          </div>

          {/* 底部标签行 */}
          <div className="flex flex-wrap gap-1.5">
            {/* L1 标签 */}
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: b.l1_color + (isDark ? '22' : '15'),
                color: b.l1_color,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Layers size={9} />
              {b.l1}
            </span>
            {/* Family 标签 */}
            {b.family && (
              <span
                className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                  isDark ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {b.family}
              </span>
            )}
            {/* 模态标签 */}
            {b.modality && (
              <span
                className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  isDark ? 'bg-gray-800/50 text-gray-500 border-gray-700/50' : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {b.modality.split('+')[0].trim()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
