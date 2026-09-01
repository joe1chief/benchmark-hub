// LLM Benchmark Costco — Navbar (Cyber-HUD & Multi-View Switcher)
import React from 'react';
import { Search, X, Sun, Moon, Sparkles, Terminal, Star, Scale, LayoutGrid } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';

export type ViewMode = 'grid' | 'galaxy' | 'arena';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  filtered: number;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  compareCount?: number;
  starredCount?: number;
  onOpenCommandPalette?: () => void;
}

export default function Navbar({
  search,
  onSearchChange,
  total,
  filtered,
  viewMode,
  onViewModeChange,
  compareCount = 0,
  starredCount = 0,
  onOpenCommandPalette,
}: Props) {
  const { theme, toggleTheme, switchable } = useTheme();
  const { lang, t, toggleLang } = useLang();
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-cyan-500/20 bg-white/90 dark:bg-slate-950/85 backdrop-blur-xl transition-colors duration-200">
      <div className="container">
        <div className="flex items-center justify-between gap-4 h-16">

          {/* Left: Cyber Logo & Telemetry Indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-950/30 border border-cyan-500/40 hud-bracket shadow-[0_0_15px_rgba(0,240,255,0.15)]">
              <span className="logo-emoji-glow text-lg">🔬</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-hud font-bold text-[15px] tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-[0_0_10px_rgba(0,240,255,0.25)]">
                  {t.siteTitle}
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.2 text-[9px] font-mono-tech uppercase tracking-widest text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 rounded">
                  HUD v2.5
                </span>
              </div>
              <div className="text-[10px] font-mono-tech text-slate-500 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>
                <span>SYS // ONLINE &bull; {total} NODES</span>
              </div>
            </div>
          </div>

          {/* Center: Multi-View Mode Switcher */}
          <div className="hidden md:flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono-tech">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/40 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={13} />
              <span>⊞ 矩阵列表</span>
            </button>
            <button
              onClick={() => onViewModeChange('galaxy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'galaxy'
                  ? 'bg-white dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/40 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>◈</span>
              <span>星图拓扑</span>
            </button>
            <button
              onClick={() => onViewModeChange('arena')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all relative ${
                viewMode === 'arena'
                  ? 'bg-white dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/40 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Scale size={13} />
              <span>⇋ 对决竞技场</span>
              {compareCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-cyan-500 text-slate-950">
                  {compareCount}
                </span>
              )}
            </button>
          </div>

          {/* Right: Quick Search Input & Utilities */}
          <div className="flex items-center gap-2.5">
            {/* Quick Search */}
            <div className="relative w-44 sm:w-60 md:w-72">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-cyan-400"
              />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full pl-8 pr-16 py-1.5 text-xs font-mono-tech bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-cyan-500/30 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
              />
              {search ? (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={12} />
                </button>
              ) : (
                <button
                  onClick={onOpenCommandPalette}
                  className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center text-[9px] font-mono-tech text-slate-400 dark:text-cyan-400/80 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700"
                >
                  ⌘K
                </button>
              )}
            </div>

            {/* Language Toggle */}
            <button
              onClick={toggleLang}
              title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono-tech text-slate-600 dark:text-slate-300 hover:border-cyan-400 hover:text-cyan-400 transition-all"
            >
              <span className="text-[12px]">{lang === 'zh' ? '🇺🇸' : '🇨🇳'}</span>
              <span>{lang === 'zh' ? 'EN' : '中文'}</span>
            </button>

            {/* Theme Toggle */}
            {switchable && toggleTheme && (
              <button
                onClick={toggleTheme}
                title={isDark ? t.switchToLight : t.switchToDark}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-400 transition-all"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
