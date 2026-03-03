// LLM Benchmark Costco 胶囊卡片组件
// 设计：白底、左侧色条、胶囊标签、勋章、公开性、年月显示、OpenAI 渐变色 hover 效果
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

  return (
    <div
      className="group relative rounded-xl p-[1px] cursor-pointer transition-all duration-200 hover:-translate-y-px"
      style={style}
      onClick={() => onClick(b)}
    >
      {/* 渐变色边框 - hover 时显示 */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, #10A37F, #1A73E8, #7C3AED)'
            : 'linear-gradient(135deg, #10A37F, #1A73E8, #7C3AED)',
          padding: '1px',
        }}
      />
      {/* 默认边框 */}
      <div className={`absolute inset-0 rounded-xl border transition-opacity duration-300 group-hover:opacity-0 ${
        isDark ? 'border-gray-800' : 'border-gray-200'
      }`} />

      {/* 卡片内容容器 */}
      <div className={`relative rounded-[11px] p-5 overflow-hidden transition-all duration-150 ${
        isDark
          ? 'bg-[#161616] group-hover:shadow-lg group-hover:shadow-black/30'
          : 'bg-white group-hover:shadow-md'
      }`}>
        {/* 左侧分类色条 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[11px] transition-all duration-150 group-hover:w-[4px]"
          style={{ backgroundColor: b.l1_color }}
        />

        {/* 卡片内容 */}
        <div className="pl-2">
          {/* 顶部：名称 + 勋章 + 难度标签 */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className={`font-semibold text-[15px] leading-snug transition-colors line-clamp-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                <span className="group-hover:bg-clip-text group-hover:text-transparent transition-all"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #10A37F 0%, #1A73E8 50%, #7C3AED 100%)',
                    WebkitBackgroundClip: 'text',
                  }}
                >
                  {b.name}
                </span>
              </h3>
              {/* 勋章：广泛测试 */}
              {b.widely_tested && (
                <span title="被主要大模型厂商技术报告广泛测试" className="shrink-0">
                  <Award size={14} className="text-amber-500" />
                </span>
              )}
            </div>
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
            {/* 年月显示 */}
            {b.published && (
              <span className={`flex items-center gap-1 text-[12px] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                <Calendar size={11} />
                {b.published}
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
            {/* 公开性标签 */}
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
                backgroundColor: b.l1_color + (isDark ? '22' : '18'),
                color: b.l1_color,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Layers size={9} />
              {b.l1}
            </span>
            {/* Family 标签 */}
            {b.family && (
              <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                isDark ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`} style={{ fontFamily: 'var(--font-mono)' }}>
                {b.family}
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
    </div>
  );
}
