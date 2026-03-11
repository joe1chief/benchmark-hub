// LLM Benchmark Costco — Navbar (i18n + Logo Shimmer Effect)
import React from 'react';
import { Search, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  filtered: number;
}

export default function Navbar({ search, onSearchChange, total, filtered }: Props) {
  const { theme, toggleTheme, switchable } = useTheme();
  const { lang, t, toggleLang } = useLang();
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
            {/* emoji 微光晕 */}
            <span
              className="logo-emoji-glow text-[20px] leading-none"
              role="img"
              aria-label="microscope"
            >
              🔬
            </span>
            {/* 文字流光 */}
            <span
              className="logo-shimmer font-semibold text-[14px] tracking-tight"
              style={{
                fontFamily: "'Inter', -apple-system, sans-serif",
              }}
            >
              {t.siteTitle}
            </span>
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
              placeholder={t.searchPlaceholder}
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
            <span>{lang === 'zh' ? '个 Benchmark' : t.benchmarks}</span>
          </div>

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-all"
            style={{
              fontFamily: "'Inter', sans-serif",
              borderColor: isDark ? '#2D2D2D' : '#E5E7EB',
              color: isDark ? '#9CA3AF' : '#6B7280',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#10A37F';
              e.currentTarget.style.color = '#10A37F';
              e.currentTarget.style.backgroundColor = 'rgba(16,163,127,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = isDark ? '#2D2D2D' : '#E5E7EB';
              e.currentTarget.style.color = isDark ? '#9CA3AF' : '#6B7280';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span className="text-[13px] leading-none">{lang === 'zh' ? '🇺🇸' : '🇨🇳'}</span>
            <span>{lang === 'zh' ? 'EN' : '中文'}</span>
          </button>

          {/* Theme toggle */}
          {switchable && toggleTheme && (
            <button
              onClick={toggleTheme}
              title={isDark ? t.switchToLight : t.switchToDark}
              className="p-2 rounded-xl transition-colors shrink-0"
              style={{ color: isDark ? '#6B7280' : '#9CA3AF', backgroundColor: 'transparent' }}
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
              style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#3D3D3D' : '#D1D5DB' }}
            >
              {t.poweredBy}{' '}
              <span style={{ fontWeight: 600, color: isDark ? '#10A37F66' : '#10A37F88' }}>
                Ant AQ eval team
              </span>
              {t.poweredBySuffix}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
