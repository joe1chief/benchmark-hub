// LLM Benchmark Costco 主页
// 设计：OpenAI 渐变色效果，白底极简，#10A37F 绿色强调
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

  // Handle clicking a related benchmark in the drawer
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
    <div className={`min-h-screen transition-colors duration-200 relative ${isDark ? 'bg-[#0F0F0F]' : 'bg-[#FAFAFA]'}`}>
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
      <main className="container py-6 relative z-10">
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

            {/* 加载更多 - 渐变色按钮 */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="group relative px-8 py-2.5 text-[13px] font-medium rounded-lg overflow-hidden transition-all duration-300 hover:shadow-lg"
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
      <div className="h-1 w-full" style={{
        background: 'linear-gradient(90deg, #10A37F 0%, #1A73E8 33%, #7C3AED 66%, #F59E0B 100%)',
      }} />

      {/* 详情抽屉 */}
      <BenchmarkDrawer
        benchmark={selected}
        allBenchmarks={data}
        onClose={() => setSelected(null)}
        onSelectBenchmark={handleSelectBenchmark}
      />

      {/* 全局动画 */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
