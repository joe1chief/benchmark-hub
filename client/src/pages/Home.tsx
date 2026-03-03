// LLM Benchmark Costco 主页
// 设计：动态渐变背景，极简卡片，#10A37F 绿色强调
import React, { useState, useMemo, useCallback } from 'react';
import { useBenchmarks, useFilteredBenchmarks } from '@/hooks/useBenchmarks';
import type { Benchmark } from '@/types/benchmark';
import Navbar from '@/components/Navbar';
import FilterBar from '@/components/FilterBar';
import HeroStats from '@/components/HeroStats';
import BenchmarkCard from '@/components/BenchmarkCard';
import BenchmarkDrawer from '@/components/BenchmarkDrawer';
import { Loader2, SearchX } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const PAGE_SIZE = 60;

type SortType = 'newest' | 'oldest' | 'name';
type FiltersType = { search: string; l1: string; year: string; difficulty: string; modality: string; openness: string; sort: SortType };

export default function Home() {
  const { data, loading, error } = useBenchmarks();
  const [selected, setSelected] = useState<Benchmark | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FiltersType>({
    search: '',
    l1: '',
    year: '',
    difficulty: '',
    modality: '',
    openness: '',
    sort: 'newest',
  });
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const filtered = useFilteredBenchmarks(data, filters);

  // 分类计数（基于当前搜索，不含 L1 筛选）
  const counts = useMemo(() => {
    const base = data.filter(b => {
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        return b.name.toLowerCase().includes(q) || b.intro.toLowerCase().includes(q) || b.org.toLowerCase().includes(q);
      }
      return true;
    });
    const c: Record<string, number> = {};
    base.forEach(b => { c[b.l1] = (c[b.l1] || 0) + 1; });
    return c;
  }, [data, filters.search]);

  const handleFilterChange = useCallback((partial: Partial<FiltersType>) => {
    setFilters(prev => ({ ...prev, ...partial }));
    setPage(1);
  }, []);

  const handleSelectBenchmark = useCallback((b: Benchmark) => {
    setSelected(b);
  }, []);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${isDark ? 'bg-[#0F0F0F]' : 'bg-[#FAFAFA]'}`}>
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 size={28} className="animate-spin" style={{ color: '#10A37F' }} />
          <span className="text-[14px]">加载 Benchmark 数据...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${isDark ? 'bg-[#0F0F0F]' : 'bg-[#FAFAFA]'}`}>
        <div className="text-center text-gray-400">
          <p className={`text-[16px] font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>数据加载失败</p>
          <p className="text-[13px]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-200 ${isDark ? 'bg-[#0A0A0A]' : 'bg-[#F8F9FB]'}`}>

      {/* ── 动态渐变背景层 ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* 主渐变光球 1：绿色 */}
        <div
          className="absolute rounded-full blur-[120px] animate-orb-1"
          style={{
            width: '60vw',
            height: '60vw',
            top: '-20vw',
            left: '-15vw',
            background: isDark
              ? 'radial-gradient(circle, rgba(16,163,127,0.18) 0%, rgba(16,163,127,0.04) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(16,163,127,0.12) 0%, rgba(16,163,127,0.03) 60%, transparent 100%)',
          }}
        />
        {/* 主渐变光球 2：蓝色 */}
        <div
          className="absolute rounded-full blur-[140px] animate-orb-2"
          style={{
            width: '50vw',
            height: '50vw',
            top: '20vh',
            right: '-10vw',
            background: isDark
              ? 'radial-gradient(circle, rgba(26,115,232,0.16) 0%, rgba(26,115,232,0.04) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(26,115,232,0.10) 0%, rgba(26,115,232,0.02) 60%, transparent 100%)',
          }}
        />
        {/* 主渐变光球 3：紫色 */}
        <div
          className="absolute rounded-full blur-[160px] animate-orb-3"
          style={{
            width: '55vw',
            height: '55vw',
            bottom: '-10vw',
            left: '20vw',
            background: isDark
              ? 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, rgba(124,58,237,0.03) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0.02) 60%, transparent 100%)',
          }}
        />
        {/* 辅助光球 4：琥珀色 */}
        <div
          className="absolute rounded-full blur-[100px] animate-orb-4"
          style={{
            width: '35vw',
            height: '35vw',
            bottom: '10vh',
            right: '5vw',
            background: isDark
              ? 'radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)',
          }}
        />
        {/* 网格纹理叠加（亮色模式） */}
        {!isDark && (
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: 'linear-gradient(rgba(0,0,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        )}
        {/* 暗色模式噪点纹理 */}
        {isDark && (
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
              backgroundSize: '200px 200px',
            }}
          />
        )}
      </div>

      {/* ── 内容层 ── */}
      <div className="relative z-10">
        {/* 顶部导航 */}
        <Navbar
          search={filters.search}
          onSearchChange={v => handleFilterChange({ search: v })}
          total={data.length}
          filtered={filtered.length}
        />

        {/* Hero 统计区 */}
        <HeroStats data={data} />

        {/* 筛选栏 */}
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          counts={counts}
        />

        {/* 主内容区 */}
        <main className="container py-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <SearchX size={40} className="mb-3 text-gray-300" />
              <p className={`text-[15px] font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>未找到匹配的 Benchmark</p>
              <p className="text-[13px]">尝试修改搜索词或清除筛选条件</p>
            </div>
          ) : (
            <>
              {/* 结果计数 */}
              <div className="flex items-center justify-between mb-4">
                <p className={`text-[13px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  共 <span className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{filtered.length}</span> 个结果
                  {filters.l1 && <span className="ml-1">· {filters.l1}</span>}
                  {filters.year && <span className="ml-1">· {filters.year}年</span>}
                  {filters.difficulty && <span className="ml-1">· {filters.difficulty}难度</span>}
                  {filters.openness && <span className="ml-1">· {filters.openness}</span>}
                </p>
              </div>

              {/* 卡片网格 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {paged.map((b, i) => (
                  <BenchmarkCard
                    key={b.id}
                    benchmark={b}
                    onClick={setSelected}
                    style={{
                      animationDelay: `${Math.min(i, 20) * 30}ms`,
                      animation: 'fadeInUp 0.3s ease both',
                    }}
                  />
                ))}
              </div>

              {/* 加载更多 */}
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="group relative px-8 py-2.5 text-[13px] font-medium rounded-lg overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                    style={{
                      background: 'linear-gradient(135deg, #10A37F 0%, #1A73E8 50%, #7C3AED 100%)',
                      color: 'white',
                    }}
                  >
                    <span className="relative z-10">加载更多（还有 {filtered.length - paged.length} 个）</span>
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {/* 底部渐变装饰线 */}
        <div className="h-px w-full" style={{
          background: 'linear-gradient(90deg, transparent 0%, #10A37F 20%, #1A73E8 50%, #7C3AED 80%, transparent 100%)',
        }} />
        <div className="h-6" />
      </div>

      {/* 详情抽屉 */}
      {selected && (
        <BenchmarkDrawer
          benchmark={selected}
          allBenchmarks={data}
          onClose={() => setSelected(null)}
          onSelectBenchmark={handleSelectBenchmark}
        />
      )}

      {/* 全局动画 */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* 光球浮动动画 */
        @keyframes orbFloat1 {
          0%   { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(3vw, 4vh) scale(1.05); }
          66%  { transform: translate(-2vw, 2vh) scale(0.97); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes orbFloat2 {
          0%   { transform: translate(0, 0) scale(1); }
          25%  { transform: translate(-4vw, 3vh) scale(1.08); }
          75%  { transform: translate(2vw, -4vh) scale(0.95); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes orbFloat3 {
          0%   { transform: translate(0, 0) scale(1); }
          40%  { transform: translate(5vw, -3vh) scale(1.06); }
          80%  { transform: translate(-3vw, 5vh) scale(0.96); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes orbFloat4 {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-3vw, -5vh) scale(1.1); }
          100% { transform: translate(0, 0) scale(1); }
        }

        .animate-orb-1 { animation: orbFloat1 18s ease-in-out infinite; }
        .animate-orb-2 { animation: orbFloat2 22s ease-in-out infinite; }
        .animate-orb-3 { animation: orbFloat3 26s ease-in-out infinite; }
        .animate-orb-4 { animation: orbFloat4 15s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
