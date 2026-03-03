// LLM Benchmark Costco — Home (English)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useBenchmarks, useFilteredBenchmarks } from '@/hooks/useBenchmarks';
import type { Benchmark } from '@/types/benchmark';
import Navbar from '@/components/Navbar.en';
import FilterBar from '@/components/FilterBar.en';
import HeroStats from '@/components/HeroStats.en';
import BenchmarkCard from '@/components/BenchmarkCard.en';
import BenchmarkDrawer from '@/components/BenchmarkDrawer.en';
import { Loader2, SearchX } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const PAGE_SIZE = 60;

type SortType = 'newest' | 'oldest' | 'name';
type FiltersType = {
  search: string;
  l1: string;
  year: string;
  difficulty: string;
  modality: string;
  openness: string;
  sort: SortType;
  widelyTested?: boolean;
};

// Map Chinese L1 labels → English for filtering
const L1_EN_MAP: Record<string, string> = {
  '通用语言能力': 'General Language', 'Agent能力': 'Agent Capability',
  '多模态理解': 'Multimodal', '代码能力': 'Code',
  '科学推理': 'Science & Reasoning', '安全对齐': 'Safety & Alignment',
  '数学推理': 'Math', '长文本理解': 'Long Context',
  '医疗健康': 'Medical & Health', '视频理解': 'Video Understanding',
  '图表与文档理解': 'Chart & Document', '空间与3D理解': 'Spatial & 3D',
};
// Reverse map: English → Chinese (for filtering against raw data)
const L1_ZH_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(L1_EN_MAP).map(([zh, en]) => [en, zh])
);

// Map English difficulty → Chinese (for filtering against raw data)
const DIFF_ZH_MAP: Record<string, string> = {
  'Frontier': '前沿', 'Expert': '专家', 'Advanced': '进阶', 'Basic': '基础',
};

export default function Home() {
  const { data, loading, error } = useBenchmarks();
  const [selected, setSelected] = useState<Benchmark | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FiltersType>({
    search: '', l1: '', year: '', difficulty: '',
    modality: '', openness: '', sort: 'newest',
  });
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Convert English filter values to Chinese before passing to useFilteredBenchmarks
  const rawFilters = useMemo(() => ({
    ...filters,
    l1: L1_ZH_MAP[filters.l1] || filters.l1,
    difficulty: DIFF_ZH_MAP[filters.difficulty] || filters.difficulty,
  }), [filters]);

  const filtered = useFilteredBenchmarks(data, rawFilters);
  const widelyTestedCount = useMemo(() => data.filter(b => (b as any).widely_tested === true).length, [data]);

  // Counts keyed by English label
  const counts = useMemo(() => {
    const base = data.filter(b => {
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        return b.name.toLowerCase().includes(q) || b.intro.toLowerCase().includes(q) || b.org.toLowerCase().includes(q);
      }
      return true;
    });
    const c: Record<string, number> = {};
    base.forEach(b => {
      const enLabel = L1_EN_MAP[b.l1] || b.l1;
      c[enLabel] = (c[enLabel] || 0) + 1;
    });
    return c;
  }, [data, filters.search]);

  const handleFilterChange = useCallback((partial: Partial<FiltersType>) => {
    setFilters(prev => ({ ...prev, ...partial }));
    setPage(1);
  }, []);

  const handleSelectBenchmark = useCallback((b: Benchmark) => setSelected(b), []);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setPage(p => p + 1); },
      { rootMargin: '300px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, paged.length]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: isDark ? '#0A0A0A' : '#FAFAFA' }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: '#10A37F' }} />
          <span
            className="text-[13px]"
            style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#6B7280' : '#9CA3AF' }}
          >
            Loading benchmarks…
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: isDark ? '#0A0A0A' : '#FAFAFA' }}
      >
        <div className="text-center">
          <p className="text-[15px] font-medium mb-1" style={{ color: isDark ? '#E5E7EB' : '#374151' }}>Failed to load data</p>
          <p className="text-[13px]" style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ backgroundColor: isDark ? '#0A0A0A' : '#FAFAFA' }}
    >
      {/* Dynamic gradient background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute rounded-full animate-orb-1"
          style={{ width: '55vw', height: '55vw', top: '-20vw', left: '-10vw',
            background: isDark ? 'radial-gradient(circle, rgba(16,163,127,0.14) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(16,163,127,0.07) 0%, transparent 65%)',
            filter: 'blur(80px)' }} />
        <div className="absolute rounded-full animate-orb-2"
          style={{ width: '45vw', height: '45vw', top: '15vh', right: '-8vw',
            background: isDark ? 'radial-gradient(circle, rgba(26,115,232,0.12) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(26,115,232,0.06) 0%, transparent 65%)',
            filter: 'blur(100px)' }} />
        <div className="absolute rounded-full animate-orb-3"
          style={{ width: '50vw', height: '50vw', bottom: '-8vw', left: '15vw',
            background: isDark ? 'radial-gradient(circle, rgba(124,58,237,0.10) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 65%)',
            filter: 'blur(120px)' }} />
        <div className="absolute rounded-full animate-orb-4"
          style={{ width: '30vw', height: '30vw', bottom: '5vh', right: '5vw',
            background: isDark ? 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 65%)',
            filter: 'blur(80px)' }} />
      </div>

      {/* Content layer */}
      <div className="relative z-10">
        <Navbar
          search={filters.search}
          onSearchChange={v => handleFilterChange({ search: v })}
          total={data.length}
          filtered={filtered.length}
        />

        <HeroStats data={data} />

        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          counts={counts}
          widelyTestedCount={widelyTestedCount}
        />

        <main className="container py-8">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <SearchX size={36} style={{ color: isDark ? '#374151' : '#D1D5DB' }} className="mb-3" />
              <p className="text-[15px] font-medium mb-1"
                style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#6B7280' : '#9CA3AF' }}>
                No benchmarks found
              </p>
              <p className="text-[13px]" style={{ color: isDark ? '#4B5563' : '#D1D5DB' }}>
                Try adjusting your search or clearing filters
              </p>
            </div>
          ) : (
            <>
              {/* Result count */}
              <div className="flex items-center mb-5">
                <p className="text-[13px]"
                  style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#4B5563' : '#9CA3AF' }}>
                  <span style={{ fontWeight: 600, color: isDark ? '#D1D5DB' : '#374151' }}>{filtered.length}</span>
                  {' '}results
                  {filters.l1 && <span style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}> · {filters.l1}</span>}
                  {filters.year && <span style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}> · {filters.year}</span>}
                  {filters.difficulty && <span style={{ color: isDark ? '#6B7280' : '#9CA3AF' }}> · {filters.difficulty}</span>}
                  {filters.widelyTested && <span style={{ color: '#F59E0B' }}> · 🏅 Widely Adopted</span>}
                </p>
              </div>

              {/* Card grid: 3 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {paged.map((b, i) => (
                  <BenchmarkCard
                    key={b.id}
                    benchmark={b}
                    onClick={setSelected}
                    style={{
                      animationDelay: `${Math.min(i % PAGE_SIZE, 24) * 25}ms`,
                      animation: 'fadeInUp 0.28s ease both',
                    }}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={sentinelRef} className="flex justify-center items-center py-10 gap-2">
                  <Loader2 size={16} className="animate-spin" style={{ color: '#10A37F' }} />
                  <span className="text-[12px]"
                    style={{ fontFamily: "'Inter', sans-serif", color: isDark ? '#4B5563' : '#D1D5DB' }}>
                    Loading more…
                  </span>
                </div>
              )}

              {!hasMore && filtered.length > PAGE_SIZE && (
                <div className="flex justify-center py-8">
                  <span className="text-[12px]" style={{ color: isDark ? '#2D2D2D' : '#E5E7EB' }}>
                    — All {filtered.length} results shown —
                  </span>
                </div>
              )}
            </>
          )}
        </main>

        {/* Footer gradient line */}
        <div className="h-px w-full"
          style={{ background: 'linear-gradient(90deg, transparent 0%, #10A37F 25%, #1A73E8 50%, #7C3AED 75%, transparent 100%)', opacity: 0.3 }} />
        <div className="h-8" />
      </div>

      {/* Detail drawer */}
      {selected && (
        <BenchmarkDrawer
          benchmark={selected}
          allBenchmarks={data}
          onClose={() => setSelected(null)}
          onSelectBenchmark={handleSelectBenchmark}
        />
      )}
    </div>
  );
}
