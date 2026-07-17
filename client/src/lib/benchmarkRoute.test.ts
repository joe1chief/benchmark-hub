import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_ID_ALIASES,
  findBenchmarkByRouteId,
  migrateBenchmarkStorage,
  resolveBenchmarkId,
} from './benchmarkRoute';

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>();

  constructor(initialValues: Record<string, string> = {}) {
    Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
  }

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const benchmarks = [
  { id: 'AlignBench' },
  { id: 'InfographicVQA' },
  { id: 'SFE' },
  { id: 'HLE' },
  { id: 'ComplexFuncBench_Audio' },
];

describe('benchmark route identity compatibility', () => {
  it.each([
    ['AlignmentBench', 'AlignBench'],
    ['AlimentBench', 'AlignBench'],
    ['InfoVQA', 'InfographicVQA'],
    ["Scientists'_First_Exam", 'SFE'],
    ['Humanity’s_Last_Exam_(HLE)', 'HLE'],
    ['ComplexFunBench', 'ComplexFuncBench_Audio'],
  ])('resolves the legacy id %s to %s', (legacyId, canonicalId) => {
    expect(BENCHMARK_ID_ALIASES[legacyId]).toBe(canonicalId);
    expect(resolveBenchmarkId(legacyId)).toBe(canonicalId);
    expect(findBenchmarkByRouteId(benchmarks, legacyId)?.id).toBe(canonicalId);
  });

  it('passes canonical ids through unchanged', () => {
    expect(resolveBenchmarkId('AlignBench')).toBe('AlignBench');
    expect(findBenchmarkByRouteId(benchmarks, 'AlignBench')).toEqual({ id: 'AlignBench' });
  });

  it('returns no benchmark for an unknown exact id', () => {
    expect(resolveBenchmarkId('alignbench')).toBe('alignbench');
    expect(findBenchmarkByRouteId(benchmarks, 'alignbench')).toBeUndefined();
  });
});

describe('benchmark localStorage identity migration', () => {
  it('migrates all six legacy starred ids and deduplicates canonical ids', () => {
    const storage = new FakeStorage({
      'starred-benchmarks': JSON.stringify([
        'AlignmentBench',
        'AlimentBench',
        'AlignBench',
        'InfoVQA',
        "Scientists'_First_Exam",
        'Humanity’s_Last_Exam_(HLE)',
        'ComplexFunBench',
        'UnchangedBenchmark',
        'UnchangedBenchmark',
      ]),
    });

    expect(migrateBenchmarkStorage(storage)).toEqual([
      'AlignBench',
      'InfographicVQA',
      'SFE',
      'HLE',
      'ComplexFuncBench_Audio',
      'UnchangedBenchmark',
    ]);
    expect(JSON.parse(storage.getItem('starred-benchmarks') ?? 'null')).toEqual([
      'AlignBench',
      'InfographicVQA',
      'SFE',
      'HLE',
      'ComplexFuncBench_Audio',
      'UnchangedBenchmark',
    ]);
  });

  it.each(Object.entries(BENCHMARK_ID_ALIASES))(
    'moves note-%s to note-%s and removes the legacy key',
    (legacyId, canonicalId) => {
      const storage = new FakeStorage({ [`note-${legacyId}`]: `note for ${legacyId}` });

      migrateBenchmarkStorage(storage);

      expect(storage.getItem(`note-${canonicalId}`)).toBe(`note for ${legacyId}`);
      expect(storage.getItem(`note-${legacyId}`)).toBeNull();
    },
  );

  it('keeps an existing canonical note while removing the legacy note', () => {
    const storage = new FakeStorage({
      'note-InfoVQA': 'legacy note',
      'note-InfographicVQA': 'canonical note',
    });

    migrateBenchmarkStorage(storage);

    expect(storage.getItem('note-InfographicVQA')).toBe('canonical note');
    expect(storage.getItem('note-InfoVQA')).toBeNull();
  });

  it.each(['{', JSON.stringify({ id: 'AlignBench' })])(
    'leaves malformed or non-array starred data untouched: %s',
    rawValue => {
      const storage = new FakeStorage({ 'starred-benchmarks': rawValue });

      expect(() => migrateBenchmarkStorage(storage)).not.toThrow();
      expect(migrateBenchmarkStorage(storage)).toEqual([]);
      expect(storage.getItem('starred-benchmarks')).toBe(rawValue);
    },
  );

  it('is idempotent across repeated migrations', () => {
    const storage = new FakeStorage({
      'starred-benchmarks': JSON.stringify(['AlignmentBench', 'AlignBench']),
      'note-AlignmentBench': 'legacy note',
    });

    const firstResult = migrateBenchmarkStorage(storage);
    const firstSnapshot = [...Array(storage.length)].map((_, index) => {
      const key = storage.key(index)!;
      return [key, storage.getItem(key)];
    });
    const secondResult = migrateBenchmarkStorage(storage);
    const secondSnapshot = [...Array(storage.length)].map((_, index) => {
      const key = storage.key(index)!;
      return [key, storage.getItem(key)];
    });

    expect(secondResult).toEqual(firstResult);
    expect(secondSnapshot).toEqual(firstSnapshot);
  });
});
