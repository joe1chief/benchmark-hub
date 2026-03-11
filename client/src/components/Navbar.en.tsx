// LLM Benchmark Costco — Navbar (English + Logo Shimmer Effect)
import React from 'react';
import { Search, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  filtered: number;
}

export default function Navbar({ search, onSearchChange, total, filtered }: Props) {
  const { theme, toggleTheme, switchable } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header
      className={`sticky top-0 z-30 border-b transition-colors duration-200 ${
        isDark
          ? 'bg-[#0F0F0F]/96 border-[#242424]'
          : 'bg-white/96 border-[#E5E7EB]'
      }`}
      style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
    >
      <div className="container">
        <div className="flex items-center gap-5 h-14">

          {/* Logo — 流光特效 */}
          <div className="logo-container flex items-center gap-2.5 shrink-0 cursor-default select-none">
            <span
              className="logo-emoji-glow text-[20px] leading-none"
              role="img"
              aria-label="microscope"
            >
              🔬
            </span>
            <div className="flex flex-col leading-none">
              <span
                className="logo-shimmer font-semibold text-[14px] tracking-tight"
                style={{
                  fontFamily: "'Inter', -apple-system, sans-serif",
                }}
              >
                LLM Benchmark Costco
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-lg relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}
            />
            <input
              type="text"
              placeholder="Search by name, org, category..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-[7px] text-[13px] border rounded-xl outline-none transition-all"
              style={{
                fontFamily: "'Inter', sans-serif",
                backgroundColor: isDark ? '#1A1A1A' : '#F9FAFB',
                borderColor: isDark ? '#2D2D2D' : '#E5E7EB',
                color: isDark ? '#E5E7EB' : '#111827',
                boxShadow: 'none',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#10A37F';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,163,127,0.08)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = isDark ? '#2D2D2D' : '#E5E7EB';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Stats */}
          <div
            className="hidden sm:flex items-center gap-1 text-[13px] shrink-0"
            style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#6B7280' : '#9CA3AF' }}
          >
            <span style={{ fontWeight: 600, color: isDark ? '#E5E7EB' : '#111827' }}>{filtered}</span>
            {filtered !== total && <span style={{ color: isDark ? '#4B5563' : '#D1D5DB' }}>/ {total}</span>}
            <span>Benchmarks</span>
          </div>

          {/* Theme toggle */}
          {switchable && toggleTheme && (
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light' : 'Switch to Dark'}
              className="p-2 rounded-xl transition-colors shrink-0"
              style={{
                color: isDark ? '#6B7280' : '#9CA3AF',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = isDark ? '#1F1F1F' : '#F3F4F6';
                e.currentTarget.style.color = isDark ? '#E5E7EB' : '#374151';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDark ? '#6B7280' : '#9CA3AF';
              }}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Powered by bar */}
      <div
        className="border-t transition-colors duration-200"
        style={{ borderColor: isDark ? '#1A1A1A' : '#F9FAFB' }}
      >
        <div className="container">
          <div className="flex items-center justify-end h-[22px]">
            <span
              className="text-[11px]"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: isDark ? '#3D3D3D' : '#D1D5DB',
              }}
            >
              powered by{' '}
              <span style={{ fontWeight: 600, color: isDark ? '#10A37F66' : '#10A37F88' }}>
                Ant AQ eval team
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
