import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_ID_ALIASES,
  findBenchmarkByRouteId,
  resolveBenchmarkId,
} from './benchmarkRoute';

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
