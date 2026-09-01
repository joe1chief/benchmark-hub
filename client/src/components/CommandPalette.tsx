import React, { useEffect, useState } from 'react';
import type { Benchmark } from '@/types/benchmark';
import { Search, Sparkles, Terminal, X, ArrowRight } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';

interface Props {
  benchmarks: Benchmark[];
  isOpen: boolean;
  onClose: () => void;
  onSelectBenchmark: (b: Benchmark) => void;
  onSwitchView: (view: 'grid' | 'galaxy' | 'arena') => void;
}

export default function CommandPalette({
  benchmarks,
  isOpen,
  onClose,
  onSelectBenchmark,
  onSwitchView,
}: Props) {
  const [query, setQuery] = useState('');
  const { lang } = useLang();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();
  const filtered = benchmarks
    .filter(b => {
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        (b.intro && b.intro.toLowerCase().includes(q)) ||
        (b.org && b.org.toLowerCase().includes(q)) ||
        (b.l1 && b.l1.toLowerCase().includes(q))
      );
    })
    .slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-slate-950 border border-cyan-500/40 shadow-[0_0_50px_rgba(0,240,255,0.2)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Search header */}
        <div className="p-4 border-b border-cyan-500/20 bg-slate-900/60 flex items-center gap-3">
          <Terminal size={18} className="text-cyan-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder={lang === 'zh' ? '输入指令或搜索评测集 (如 SWE-bench, MMLU)...' : 'Type command or search benchmark (e.g. SWE-bench, MMLU)...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 font-mono-tech outline-none"
          />
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Quick actions if query is empty */}
        {!query && (
          <div className="p-3 bg-slate-900/30 border-b border-slate-800 text-[11px] font-mono-tech flex items-center justify-between text-slate-400">
            <span>快捷模式切换:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { onSwitchView('grid'); onClose(); }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 text-slate-300"
              >
                ⊞ 矩阵视图
              </button>
              <button
                onClick={() => { onSwitchView('galaxy'); onClose(); }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 text-slate-300"
              >
                ◈ 星图拓扑
              </button>
              <button
                onClick={() => { onSwitchView('arena'); onClose(); }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 text-slate-300"
              >
                ⇋ 对决竞技场
              </button>
            </div>
          </div>
        )}

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-900">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono-tech text-slate-500">
              未找到匹配指令或评测节点
            </div>
          ) : (
            filtered.map(b => (
              <div
                key={b.id}
                onClick={() => {
                  onSelectBenchmark(b);
                  onClose();
                }}
                className="p-3 rounded-xl hover:bg-slate-900 cursor-pointer flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {b.widely_tested && <span className="text-sm">🏅</span>}
                  <span className="font-hud font-bold text-sm text-white group-hover:text-cyan-400 transition-colors truncate">
                    {b.name}
                  </span>
                  <span className="text-[10px] font-mono-tech px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {b.l1}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono-tech text-slate-500">
                  <span>{b.year}</span>
                  <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform text-cyan-400" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-[10px] font-mono-tech text-slate-500 flex items-center justify-between px-4">
          <span>ESC 退出 &bull; ↑↓ 导航 &bull; ↵ 打开</span>
          <span className="text-cyan-400">BENCHMARK // COMMANDER</span>
        </div>
      </div>
    </div>
  );
}
