import { useState, useEffect, useMemo } from 'react';
import type { Benchmark } from '@/types/benchmark';

interface Filters {
  search: string;
  l1: string;
  year: string;
  difficulty: string;
  modality: string;
  openness: string;
  sort: 'newest' | 'oldest' | 'name';
  widelyTested?: boolean;
}

export function useBenchmarks() {
  const [data, setData] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`./benchmarks.json?v=${Date.now()}`)
      .then(r => r.json())
      .then((d: Benchmark[]) => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}

export function useFilteredBenchmarks(data: Benchmark[], filters: Filters) {
  return useMemo(() => {
    let result = [...data];

    // 搜索
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.intro.toLowerCase().includes(q) ||
        b.org.toLowerCase().includes(q) ||
        b.l1.toLowerCase().includes(q) ||
        b.l2.toLowerCase().includes(q) ||
        (b.family && b.family.toLowerCase().includes(q))
      );
    }

    // L1 筛选
    if (filters.l1) {
      result = result.filter(b => b.l1 === filters.l1);
    }

    // 年份筛选
    if (filters.year) {
      result = result.filter(b => b.year === filters.year);
    }

    // 难度筛选
    if (filters.difficulty) {
      result = result.filter(b => b.difficulty === filters.difficulty);
    }

    // 模态筛选
    if (filters.modality) {
      result = result.filter(b => b.modality.includes(filters.modality));
    }

    // 公开性筛选
    if (filters.openness) {
      result = result.filter(b => b.openness === filters.openness);
    }

    // 广泛采用筛选
    if (filters.widelyTested) {
      result = result.filter(b => (b as any).widely_tested === true);
    }

    // 排序
    if (filters.sort === 'newest') {
      result.sort((a, b) => b.published.localeCompare(a.published));
    } else if (filters.sort === 'oldest') {
      result.sort((a, b) => a.published.localeCompare(b.published));
    } else if (filters.sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    }

    return result;
  }, [data, filters]);
}
