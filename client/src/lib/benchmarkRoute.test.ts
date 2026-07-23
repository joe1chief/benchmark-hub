import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_ID_ALIASES,
  findBenchmarkByReference,
  findBenchmarkByRouteId,
  migrateBenchmarkStorage,
  resolveRelatedBenchmarks,
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

  it.each(['constructor', '__proto__', 'toString'])(
    'does not treat inherited object property %s as a benchmark alias',
    reservedId => {
      expect(resolveBenchmarkId(reservedId)).toBe(reservedId);
    },
  );
});

describe('related benchmark reference resolution', () => {
  const relatedCatalog = [
    { id: 'PixMo_Count', name: 'PixMo-Count' },
    { id: 'NYU_CTF_Bench', name: 'NYU CTF Bench' },
    { id: 'ExactId', name: 'Shared name' },
    { id: 'OtherId', name: 'Shared name' },
    { id: 'DisplayOnly', name: 'ExactId' },
  ];

  it('resolves an exact catalog id before considering display names', () => {
    expect(findBenchmarkByReference(relatedCatalog, 'ExactId')?.id).toBe('ExactId');
  });

  it('resolves a unique display name', () => {
    expect(findBenchmarkByReference(relatedCatalog, 'PixMo-Count')?.id).toBe('PixMo_Count');
  });

  it('rejects ambiguous or missing display names', () => {
    expect(findBenchmarkByReference(relatedCatalog, 'Shared name')).toBeUndefined();
    expect(findBenchmarkByReference(relatedCatalog, 'Missing')).toBeUndefined();
  });

  it('deduplicates resolved references and excludes the current benchmark', () => {
    expect(
      resolveRelatedBenchmarks(
        relatedCatalog,
        ['PixMo_Count', 'PixMo-Count', 'NYU CTF Bench', 'ExactId'],
        'ExactId',
      ).map(benchmark => benchmark.id),
    ).toEqual(['PixMo_Count', 'NYU_CTF_Bench']);
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

  it('keeps both copies when a canonical note conflicts with a legacy note', () => {
    const storage = new FakeStorage({
      'note-InfoVQA': 'legacy note',
      'note-InfographicVQA': 'canonical note',
    });

    migrateBenchmarkStorage(storage);

    expect(storage.getItem('note-InfographicVQA')).toBe('canonical note');
    expect(storage.getItem('note-InfoVQA')).toBe('legacy note');
  });

  it('removes a legacy note when its canonical copy is identical', () => {
    const storage = new FakeStorage({
      'note-InfoVQA': 'same note',
      'note-InfographicVQA': 'same note',
    });

    migrateBenchmarkStorage(storage);

    expect(storage.getItem('note-InfographicVQA')).toBe('same note');
    expect(storage.getItem('note-InfoVQA')).toBeNull();
  });

  it('does not discard the second legacy note when two aliases share a canonical id', () => {
    const storage = new FakeStorage({
      'note-AlignmentBench': 'first legacy note',
      'note-AlimentBench': 'second legacy note',
    });

    migrateBenchmarkStorage(storage);

    expect(storage.getItem('note-AlignBench')).toBe('first legacy note');
    expect(storage.getItem('note-AlignmentBench')).toBeNull();
    expect(storage.getItem('note-AlimentBench')).toBe('second legacy note');
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

  it('preserves object-prototype property names as unknown starred ids', () => {
    const storage = new FakeStorage({
      'starred-benchmarks': JSON.stringify(['constructor', '__proto__', 'toString']),
    });

    expect(migrateBenchmarkStorage(storage)).toEqual([
      'constructor',
      '__proto__',
      'toString',
    ]);
    expect(JSON.parse(storage.getItem('starred-benchmarks') ?? 'null')).toEqual([
      'constructor',
      '__proto__',
      'toString',
    ]);
  });
});
