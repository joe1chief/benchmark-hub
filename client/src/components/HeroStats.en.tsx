// LLM Benchmark Costco — HeroStats (English)
import React from 'react';
import type { Benchmark } from '@/types/benchmark';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  data: Benchmark[];
}

export default function HeroStats({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const total        = data.length;
  const categories   = new Set(data.map(b => b.l1)).size;
  const families     = new Set(data.filter(b => b.family).map(b => b.family)).size;
  const widelyTested = data.filter(b => (b as any).widely_tested).length;

  const stats = [
    { value: total,        label: 'Benchmarks',       color: '#10A37F' },
    { value: categories,   label: 'Capability Dims',  color: '#1A73E8' },
    { value: families,     label: 'Families',         color: '#7C3AED' },
    { value: widelyTested, label: 'Widely Adopted',   color: '#F59E0B' },
  ];

  return (
    <div
      className="border-b transition-colors duration-200"
      style={{ borderColor: isDark ? '#1F1F1F' : '#F3F4F6' }}
    >
      <div className="container py-10">
        {/* Title */}
        <div className="mb-8">
          <h1
            className="text-[30px] font-semibold tracking-tight mb-2.5"
            style={{
              fontFamily: "'Inter', -apple-system, sans-serif",
              letterSpacing: '-0.02em',
              background: isDark
                ? 'linear-gradient(90deg, #F9FAFB 0%, #D1D5DB 100%)'
                : 'linear-gradient(90deg, #111827 0%, #374151 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            LLM Benchmark Costco
          </h1>
          <p
            className="text-[14px] max-w-xl leading-relaxed"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: isDark ? '#6B7280' : '#9CA3AF',
            }}
          >
            A curated database of{' '}
            <strong style={{ color: isDark ? '#D1D5DB' : '#374151', fontWeight: 600 }}>{total}</strong>{' '}
            LLM evaluation benchmarks across{' '}
            <strong style={{ color: isDark ? '#D1D5DB' : '#374151', fontWeight: 600 }}>{categories}</strong>{' '}
            capability dimensions. Each entry includes the full paper for inline reading.
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-10">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1">
                <span
                  className="text-[32px] font-bold tabular-nums leading-none"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    letterSpacing: '-0.03em',
                    color: s.color,
                  }}
                >
                  {s.value}
                </span>
              </div>
              <span
                className="text-[12px]"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: isDark ? '#4B5563' : '#9CA3AF',
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
