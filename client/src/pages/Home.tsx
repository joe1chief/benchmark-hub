// LLM Benchmark Costco — Home (Next-Gen Cyber-HUD & Multi-View Matrix)
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useBenchmarks, useFilteredBenchmarks } from '@/hooks/useBenchmarks';
import type { Benchmark } from '@/types/benchmark';
import Navbar, { ViewMode } from '@/components/Navbar';
import FilterBar from '@/components/FilterBar';
import HeroStats from '@/components/HeroStats';
import BenchmarkCard from '@/components/BenchmarkCard';
import BenchmarkDrawer from '@/components/BenchmarkDrawer';
import NeuralBackground from '@/components/NeuralBackground';
import BenchmarkGalaxy from '@/components/BenchmarkGalaxy';
import BenchmarkArena from '@/components/BenchmarkArena';
import CommandPalette from '@/components/CommandPalette';
import { Loader2, SearchX, ArrowUp, Sparkles, Scale, LayoutGrid } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LangContext';
import {
  findBenchmarkByRouteId,
  migrateBenchmarkStorage,
  resolveBenchmarkId,
} from '@/lib/benchmarkRoute';

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
  starredOnly?: boolean;
  flowchartOnly?: boolean;
};

export default function Home() {
  const { data, loading, error } = useBenchmarks();
  const [selected, setSelected] = useState<Benchmark | null>(null);
  const [page, setPage] = useState(1);
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // View Mode: 'grid' | 'galaxy' | 'arena'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view') as ViewMode;
      return (v === 'galaxy' || v === 'arena') ? v : 'grid';
    } catch {
      return 'grid';
    }
  });

  // Starred benchmarks LocalStorage State
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    try {
      return migrateBenchmarkStorage(localStorage);
    } catch {
      return [];
    }
  });

  const toggleStar = useCallback((id: string) => {
    setStarredIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try {
        localStorage.setItem('starred-benchmarks', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  // Multi-Benchmark Comparison Arena State (up to 4 items)
  const [compareIds, setCompareIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('arena-benchmarks');
      return saved ? JSON.parse(saved) : ['SWE-bench', 'MMLU-Pro', 'MATH-500'];
    } catch {
      return ['SWE-bench', 'MMLU-Pro', 'MATH-500'];
    }
  });

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter(x => x !== id);
      } else {
        if (prev.length >= 4) {
          next = [...prev.slice(1), id];
        } else {
          next = [...prev, id];
        }
      }
      try {
        localStorage.setItem('arena-benchmarks', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  const addCompareBenchmark = useCallback((b: Benchmark) => {
    setCompareIds(prev => {
      if (prev.includes(b.id)) return prev;
      const next = prev.length >= 4 ? [...prev.slice(1), b.id] : [...prev, b.id];
      try { localStorage.setItem('arena-benchmarks', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeCompareBenchmark = useCallback((id: string) => {
    setCompareIds(prev => {
      const next = prev.filter(x => x !== id);
      try { localStorage.setItem('arena-benchmarks', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Initialize filters from URL query parameters
  const [filters, setFilters] = useState<FiltersType>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return {
        search: params.get('q') || '',
        l1: params.get('category') || '',
        year: params.get('year') || '',
        difficulty: params.get('difficulty') || '',
        modality: params.get('modality') || '',
        openness: params.get('openness') || '',
        sort: (params.get('sort') as SortType) || 'newest',
        widelyTested: params.get('widely') === 'true' ? true : undefined,
        starredOnly: params.get('starred') === 'true' ? true : undefined,
        flowchartOnly: params.get('flowchart') === 'true' ? true : undefined,
      };
    } catch {
      return {
        search: '', l1: '', year: '', difficulty: '',
        modality: '', openness: '', sort: 'newest',
      };
    }
  });

  const { theme } = useTheme();
  const { t, lang } = useLang();
  const isDark = theme === 'dark';
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Exclude starredOnly and flowchartOnly when calling hook to avoid type compiler errors
  const { starredOnly, flowchartOnly, ...restFilters } = filters;
  const baseFiltered = useFilteredBenchmarks(data, restFilters as any);

  const filtered = useMemo(() => {
    let res = baseFiltered;
    if (starredOnly) {
      res = res.filter(b => starredIds.includes(b.id));
    }
    if (flowchartOnly) {
      res = res.filter(b => !!(b.drawio_flowchart_en || b.drawio_flowchart_zh || b.mermaid_flowchart));
    }
    return res;
  }, [baseFiltered, starredOnly, flowchartOnly, starredIds]);

  const widelyTestedCount = useMemo(() => data.filter(b => b.widely_tested === true).length, [data]);

  // Compare candidates object list
  const comparedBenchmarks = useMemo(() => {
    return compareIds
      .map(id => data.find(b => b.id === id))
      .filter((b): b is Benchmark => !!b);
  }, [compareIds, data]);

  const replaceBenchmarkQuery = useCallback((benchmarkId?: string) => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (benchmarkId) {
        params.set('benchmark', benchmarkId);
      } else {
        params.delete('benchmark');
      }
      if (viewMode !== 'grid') {
        params.set('view', viewMode);
      } else {
        params.delete('view');
      }
      const queryString = params.toString();
      const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      console.error('Benchmark URL sync failed:', e);
    }
  }, [viewMode]);

  useEffect(() => {
    if (loading || data.length === 0) return;
    try {
      const routeId = new URLSearchParams(window.location.search).get('benchmark');
      if (!routeId) return;
      const benchmark = findBenchmarkByRouteId(data, routeId);
      if (!benchmark) return;
      setSelected(benchmark);
      const canonicalId = resolveBenchmarkId(routeId);
      if (canonicalId !== routeId) replaceBenchmarkQuery(canonicalId);
    } catch (e) {
      console.error('Benchmark route restore failed:', e);
    }
  }, [data, loading, replaceBenchmarkQuery]);

  // Sync filters & viewMode to URL query parameters
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      for (const key of ['q', 'category', 'year', 'difficulty', 'modality', 'openness', 'sort', 'widely', 'starred', 'flowchart', 'view']) {
        params.delete(key);
      }
      if (filters.search) params.set('q', filters.search);
      if (filters.l1) params.set('category', filters.l1);
      if (filters.year) params.set('year', filters.year);
      if (filters.difficulty) params.set('difficulty', filters.difficulty);
      if (filters.modality) params.set('modality', filters.modality);
      if (filters.openness) params.set('openness', filters.openness);
      if (filters.sort !== 'newest') params.set('sort', filters.sort);
      if (filters.widelyTested) params.set('widely', 'true');
      if (filters.starredOnly) params.set('starred', 'true');
      if (filters.flowchartOnly) params.set('flowchart', 'true');
      if (viewMode !== 'grid') params.set('view', viewMode);

      const queryString = params.toString();
      const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      console.error('URL sync failed:', e);
    }
  }, [filters, viewMode]);

  // Back to Top button scroll detection
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 450);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle stat metrics click to update filters
  const handleStatClick = useCallback((statType: 'total' | 'dims' | 'families' | 'widely') => {
    if (statType === 'widely') {
      setFilters(prev => ({ ...prev, widelyTested: prev.widelyTested ? undefined : true }));
      setPage(1);
    } else if (statType === 'families') {
      setViewMode('galaxy');
    } else if (statType === 'dims') {
      const filterBar = document.getElementById('filter-bar');
      if (filterBar) {
        filterBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (statType === 'total') {
      setFilters({
        search: '', l1: '', year: '', difficulty: '',
        modality: '', openness: '', sort: 'newest',
        widelyTested: undefined,
        starredOnly: undefined,
        flowchartOnly: undefined,
      });
      setPage(1);
      setViewMode('grid');
    }
  }, []);

  const counts = useMemo(() => {
    const base = data.filter(b => {
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        return (
          (b.name || '').toLowerCase().includes(q) ||
          (b.intro || '').toLowerCase().includes(q) ||
          (b.org || '').toLowerCase().includes(q)
        );
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
    replaceBenchmarkQuery(b.id);
  }, [replaceBenchmarkQuery]);

  const handleCloseBenchmark = useCallback(() => {
    setSelected(null);
    replaceBenchmarkQuery();
  }, [replaceBenchmarkQuery]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || viewMode !== 'grid') return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setPage(p => p + 1); },
      { rootMargin: '300px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, paged.length, viewMode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin shadow-[0_0_20px_rgba(0,240,255,0.4)]" />
          <span className="text-xs font-mono-tech text-cyan-400">
            [SYS_SYNC] {t.loading}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center p-8 rounded-2xl border border-rose-500/30 bg-rose-950/20 font-mono-tech">
          <p className="text-sm font-bold text-rose-400 mb-1">{t.loadError}</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden cyber-grid-bg bg-slate-50 dark:bg-[#060913] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Interactive Neural Particle Physics Background */}
      <NeuralBackground />

      {/* Ambient gradient lighting */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute rounded-full animate-orb-1"
          style={{
            width: '55vw', height: '55vw', top: '-20vw', left: '-10vw',
            background: isDark ? 'radial-gradient(circle, rgba(0,240,255,0.08) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(16,163,127,0.06) 0%, transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full animate-orb-2"
          style={{
            width: '45vw', height: '45vw', top: '15vh', right: '-8vw',
            background: isDark ? 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(26,115,232,0.05) 0%, transparent 65%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

      {/* Main interactive application content */}
      <div className="relative z-10">
        <Navbar
          search={filters.search}
          onSearchChange={v => handleFilterChange({ search: v })}
          total={data.length}
          filtered={filtered.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          compareCount={compareIds.length}
          starredCount={starredIds.length}
          onOpenCommandPalette={() => setIsCommandOpen(true)}
        />

        <div className="container">
          <HeroStats
            data={data}
            activeFilters={filters}
            onStatClick={handleStatClick}
          />
        </div>

        {/* View mode routing */}
        {viewMode === 'grid' && (
          <>
            <FilterBar
              filters={filters}
              onChange={handleFilterChange}
              counts={counts}
              widelyTestedCount={widelyTestedCount}
              starredCount={starredIds.length}
            />

            <main className="container py-8">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md">
                  <SearchX size={36} className="text-slate-400 dark:text-slate-600 mb-3" />
                  <p className="text-sm font-bold font-mono-tech text-slate-700 dark:text-slate-300 mb-1">
                    {t.noResults}
                  </p>
                  <p className="text-xs text-slate-500 font-sans">
                    {t.noResultsHint}
                  </p>
                </div>
              ) : (
                <>
                  {/* Telemetry info count */}
                  <div className="flex items-center justify-between mb-5 text-xs font-mono-tech text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 pulse-dot"></span>
                      <span>
                        {lang === 'zh' ? '匹配评测节点: ' : 'Matched Nodes: '}
                        <strong className="text-slate-900 dark:text-cyan-300 font-bold">{filtered.length}</strong>
                        {filters.l1 && <span> &bull; {t.l1[filters.l1] || filters.l1}</span>}
                        {filters.year && <span> &bull; {filters.year}{lang === 'zh' ? '年' : ''}</span>}
                        {filters.difficulty && <span> &bull; {t.difficulty[filters.difficulty] || filters.difficulty}</span>}
                        {filters.widelyTested && <span className="text-amber-500"> &bull; 🏅 {t.widelyAdopted}</span>}
                        {filters.starredOnly && <span className="text-amber-500"> &bull; ⭐ {lang === 'zh' ? '已收藏' : 'Starred'}</span>}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-3 text-[11px]">
                      <span>按住卡片 <strong>⇋ VS</strong> 可加入对决雷达</span>
                    </div>
                  </div>

                  {/* 3-column Cyber Matrix Card Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {paged.map((b, i) => (
                      <BenchmarkCard
                        key={b.id}
                        benchmark={b}
                        onClick={handleSelectBenchmark}
                        isStarred={starredIds.includes(b.id)}
                        onToggleStar={e => {
                          e.stopPropagation();
                          toggleStar(b.id);
                        }}
                        isCompared={compareIds.includes(b.id)}
                        onToggleCompare={e => {
                          e.stopPropagation();
                          toggleCompare(b.id);
                        }}
                        style={{
                          animationDelay: `${Math.min(i % PAGE_SIZE, 24) * 20}ms`,
                          animation: 'fadeInUp 0.25s ease both',
                        }}
                      />
                    ))}
                  </div>

                  {/* Infinite scroll loader */}
                  {hasMore && (
                    <div ref={sentinelRef} className="flex justify-center items-center py-10 gap-2 font-mono-tech text-xs text-slate-500">
                      <Loader2 size={14} className="animate-spin text-cyan-500" />
                      <span>{t.loadingMore}</span>
                    </div>
                  )}

                  {!hasMore && filtered.length > PAGE_SIZE && (
                    <div className="flex justify-center py-8">
                      <span className="text-xs font-mono-tech text-slate-400 dark:text-slate-600">
                        {t.allShown(filtered.length)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </main>
          </>
        )}

        {viewMode === 'galaxy' && (
          <main className="container py-6">
            <BenchmarkGalaxy
              benchmarks={filtered}
              onSelectBenchmark={handleSelectBenchmark}
              selectedBenchmark={selected}
              searchQuery={filters.search}
              activeCategory={filters.l1}
            />
          </main>
        )}

        {viewMode === 'arena' && (
          <main className="container py-6">
            <BenchmarkArena
              benchmarks={comparedBenchmarks}
              allBenchmarks={data}
              onRemoveBenchmark={removeCompareBenchmark}
              onAddBenchmark={addCompareBenchmark}
              onSelectBenchmark={handleSelectBenchmark}
            />
          </main>
        )}

        {/* Bottom decorative neon gradient line */}
        <div
          className="h-px w-full opacity-30 mt-12"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #00F0FF 25%, #10A37F 50%, #8B5CF6 75%, transparent 100%)',
          }}
        />
        <div className="h-8" />

        {/* Floating Back to Top Button */}
        {showBackToTop && (
          <button
            onClick={scrollToTop}
            className="back-to-top fixed bottom-8 right-8 z-40 flex items-center justify-center w-11 h-11 rounded-xl shadow-2xl cursor-pointer transition-all duration-300 active:scale-95 border border-cyan-500/40 bg-slate-900/90 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950"
            title={lang === 'zh' ? '回到顶部' : 'Back to Top'}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>

      {/* Detail drawer terminal */}
      {selected && (
        <BenchmarkDrawer
          benchmark={selected}
          allBenchmarks={data}
          isStarred={starredIds.includes(selected.id)}
          onToggleStar={() => toggleStar(selected.id)}
          onClose={handleCloseBenchmark}
          onSelectBenchmark={handleSelectBenchmark}
        />
      )}

      {/* Cmd+K Quick Command Palette Modal */}
      <CommandPalette
        benchmarks={data}
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onSelectBenchmark={handleSelectBenchmark}
        onSwitchView={setViewMode}
      />
    </div>
  );
}
