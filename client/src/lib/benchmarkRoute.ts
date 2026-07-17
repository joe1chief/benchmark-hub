export const BENCHMARK_ID_ALIASES: Readonly<Record<string, string>> = {
  AlignmentBench: 'AlignBench',
  AlimentBench: 'AlignBench',
  InfoVQA: 'InfographicVQA',
  "Scientists'_First_Exam": 'SFE',
  'Humanity’s_Last_Exam_(HLE)': 'HLE',
  ComplexFunBench: 'ComplexFuncBench_Audio',
};

export function resolveBenchmarkId(routeId: string): string {
  return BENCHMARK_ID_ALIASES[routeId] ?? routeId;
}

export function findBenchmarkByRouteId<T extends { id: string }>(
  benchmarks: readonly T[],
  routeId: string,
): T | undefined {
  const resolvedId = resolveBenchmarkId(routeId);
  return benchmarks.find(benchmark => benchmark.id === resolvedId);
}
