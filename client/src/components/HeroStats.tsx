// OpenAI 风格 Hero 统计区
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
  const orgs = new Set(data.flatMap(b => b.org.split('、').map(o => o.trim()))).size;
  const years = new Set(data.map(b => b.year)).size;

  const stats = [
    { value: total, label: '评测基准', suffix: '个' },
    { value: categories, label: '能力维度', suffix: '个' },
    { value: orgs, label: '发布机构', suffix: '+' },
    { value: years, label: '年份跨度', suffix: '年' },
  ];

  return (
    <div className={`border-b transition-colors duration-200 ${isDark ? 'bg-[#111111] border-gray-800' : 'bg-white border-gray-100'}`}>
      <div className="container py-10">
        {/* 标题 */}
        <div className="mb-8">
          <h1 className={`text-[32px] font-bold tracking-tight mb-2 transition-colors ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            AI Benchmark Hub
          </h1>
          <p className={`text-[15px] max-w-2xl leading-relaxed transition-colors ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            覆盖大型语言模型评测领域的 {total} 个主流基准，涵盖 Agent 能力、多模态理解、代码能力等 12 个核心维度。
            每个基准均附有完整论文文档，支持在线阅读。
          </p>
        </div>

        {/* 统计数字 */}
        <div className="flex flex-wrap gap-8">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col">
              <div className="flex items-baseline gap-0.5">
                <span className={`text-[28px] font-bold tabular-nums transition-colors ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{s.value}</span>
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
