// LLM Benchmark Costco Hero 统计区 - OpenAI 渐变色效果
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  data: Benchmark[];
}

export default function HeroStats({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const total = data.length;
  const categories = new Set(data.map(b => b.l1)).size;
  const families = new Set(data.filter(b => b.family).map(b => b.family)).size;
  const widelyTested = data.filter(b => b.widely_tested).length;

  const stats = [
    { value: total, label: '评测基准', suffix: '个' },
    { value: categories, label: '能力维度', suffix: '个' },
    { value: families, label: 'Benchmark 家族', suffix: '个' },
    { value: widelyTested, label: '广泛测试', suffix: '个' },
  ];

  return (
    <div className="relative overflow-hidden border-b transition-colors duration-200"
      style={{
        borderColor: isDark ? 'rgba(55,65,81,0.5)' : 'rgba(243,244,246,1)',
      }}
    >
      {/* OpenAI 风格渐变背景 */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: isDark
          ? 'linear-gradient(135deg, rgba(16,163,127,0.08) 0%, rgba(26,115,232,0.06) 40%, rgba(124,58,237,0.05) 70%, rgba(15,15,15,0.95) 100%)'
          : 'linear-gradient(135deg, rgba(16,163,127,0.06) 0%, rgba(26,115,232,0.04) 40%, rgba(124,58,237,0.03) 70%, rgba(250,250,250,0.9) 100%)',
      }} />
      {/* 渐变光晕 */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full pointer-events-none" style={{
        background: isDark
          ? 'radial-gradient(circle, rgba(16,163,127,0.12) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(16,163,127,0.08) 0%, transparent 70%)',
      }} />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full pointer-events-none" style={{
        background: isDark
          ? 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)',
      }} />

      <div className="container py-10 relative z-10">
        {/* 标题 */}
        <div className="mb-8">
          <h1 className="text-[32px] font-bold tracking-tight mb-2">
            <span className="bg-clip-text text-transparent" style={{
              backgroundImage: isDark
                ? 'linear-gradient(135deg, #4ADE80 0%, #10A37F 30%, #38BDF8 60%, #A78BFA 100%)'
                : 'linear-gradient(135deg, #10A37F 0%, #1A73E8 50%, #7C3AED 100%)',
            }}>
              LLM Benchmark Costco
            </span>
          </h1>
          <p className={`text-[15px] max-w-2xl leading-relaxed transition-colors ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            覆盖大型语言模型评测领域的 {total} 个主流基准，涵盖 Agent 能力、多模态理解、代码能力等 {categories} 个核心维度。
            每个基准均附有完整论文文档，支持在线阅读。
          </p>
        </div>

        {/* 统计数字 */}
        <div className="flex flex-wrap gap-8">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col">
              <div className="flex items-baseline gap-0.5">
                <span className="text-[28px] font-bold tabular-nums bg-clip-text text-transparent" style={{
                  backgroundImage: isDark
                    ? `linear-gradient(135deg, ${['#4ADE80','#38BDF8','#A78BFA','#FBBF24'][i]} 0%, ${['#10A37F','#1A73E8','#7C3AED','#F59E0B'][i]} 100%)`
                    : `linear-gradient(135deg, ${['#10A37F','#1A73E8','#7C3AED','#F59E0B'][i]} 0%, ${['#059669','#1557B0','#5B21B6','#D97706'][i]} 100%)`,
                }}>
                  {s.value}
                </span>
                <span className={`text-[16px] font-medium ml-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.suffix}</span>
              </div>
              <span className={`text-[13px] mt-0.5 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
