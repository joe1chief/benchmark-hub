// OpenAI 风格顶部导航栏
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
    <header className={`sticky top-0 z-30 backdrop-blur-sm border-b transition-colors duration-200 ${
      isDark
        ? 'bg-[#0F0F0F]/95 border-gray-800'
        : 'bg-white/95 border-gray-100'
    }`}>
      <div className="container">
        <div className="flex items-center gap-4 h-14">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#10A37F' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="white" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.7" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.7" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.4" />
              </svg>
            </div>
            <span className={`font-semibold text-[15px] tracking-tight transition-colors ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Benchmark Hub
            </span>
          </div>

          {/* 搜索框 */}
          <div className="flex-1 max-w-xl relative">
            <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="搜索 Benchmark 名称、机构、分类..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className={`w-full pl-9 pr-8 py-2 text-[13px] border rounded-lg outline-none transition-all placeholder:text-gray-400 ${
                isDark
                  ? 'bg-gray-800/80 border-gray-700 text-gray-200 focus:border-[#10A37F] focus:ring-2 focus:ring-[#10A37F]/10'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-[#10A37F] focus:ring-2 focus:ring-[#10A37F]/10'
              }`}
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 统计 */}
          <div className={`hidden sm:flex items-center gap-1 text-[13px] shrink-0 transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            <span className={`font-semibold transition-colors ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{filtered}</span>
            {filtered !== total && <span>/ {total}</span>}
            <span>个 Benchmark</span>
          </div>

          {/* 深色模式切换 */}
          {switchable && toggleTheme && (
            <button
              onClick={toggleTheme}
              title={isDark ? '切换到亮色模式' : '切换到深色模式'}
              className={`p-2 rounded-lg transition-colors shrink-0 ${
                isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Powered by 标识 */}
      <div className={`border-t transition-colors duration-200 ${isDark ? 'border-gray-800/60' : 'border-gray-50'}`}>
        <div className="container">
          <div className="flex items-center justify-end h-6">
            <span className={`text-[11px] tracking-wide transition-colors ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
              powered by{' '}
              <span className={`font-semibold transition-colors ${isDark ? 'text-[#10A37F]/70' : 'text-[#10A37F]/60'}`}>
                Ant AQ eval team
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
