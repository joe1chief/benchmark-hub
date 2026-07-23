export const BENCHMARK_ID_ALIASES: Readonly<Record<string, string>> = {
  AlignmentBench: 'AlignBench',
  AlimentBench: 'AlignBench',
  InfoVQA: 'InfographicVQA',
  "Scientists'_First_Exam": 'SFE',
  'Humanity’s_Last_Exam_(HLE)': 'HLE',
  ComplexFunBench: 'ComplexFuncBench_Audio',
};

export const STARRED_BENCHMARKS_STORAGE_KEY = 'starred-benchmarks';

type BenchmarkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function resolveBenchmarkId(routeId: string): string {
  return Object.hasOwn(BENCHMARK_ID_ALIASES, routeId)
    ? BENCHMARK_ID_ALIASES[routeId]
    : routeId;
}

export function findBenchmarkByRouteId<T extends { id: string }>(
  benchmarks: readonly T[],
  routeId: string,
): T | undefined {
  const resolvedId = resolveBenchmarkId(routeId);
  return benchmarks.find(benchmark => benchmark.id === resolvedId);
}

export function findBenchmarkByReference<T extends { id: string; name: string }>(
  benchmarks: readonly T[],
  reference: string,
): T | undefined {
  const exactIdMatch = benchmarks.find(benchmark => benchmark.id === reference);
  if (exactIdMatch) return exactIdMatch;

  const displayNameMatches = benchmarks.filter(benchmark => benchmark.name === reference);
  return displayNameMatches.length === 1 ? displayNameMatches[0] : undefined;
}

export function resolveRelatedBenchmarks<T extends { id: string; name: string }>(
  benchmarks: readonly T[],
  references: readonly string[],
  currentBenchmarkId?: string,
): T[] {
  const seenIds = new Set<string>();
  const resolved: T[] = [];

  references.forEach(reference => {
    const benchmark = findBenchmarkByReference(benchmarks, reference);
    if (!benchmark || benchmark.id === currentBenchmarkId || seenIds.has(benchmark.id)) return;
    seenIds.add(benchmark.id);
    resolved.push(benchmark);
  });

  return resolved;
}

export function migrateBenchmarkStorage(storage: BenchmarkStorage): string[] {
  let starredIds: string[] = [];

  try {
    const rawStarredIds = storage.getItem(STARRED_BENCHMARKS_STORAGE_KEY);
    if (rawStarredIds !== null) {
      const parsedStarredIds: unknown = JSON.parse(rawStarredIds);
      if (Array.isArray(parsedStarredIds)) {
        starredIds = Array.from(
          new Set(
            parsedStarredIds
              .filter((id): id is string => typeof id === 'string')
              .map(resolveBenchmarkId),
          ),
        );
        storage.setItem(STARRED_BENCHMARKS_STORAGE_KEY, JSON.stringify(starredIds));
      }
    }
  } catch {
    // Keep malformed or inaccessible storage untouched and let the page start safely.
  }

  Object.entries(BENCHMARK_ID_ALIASES).forEach(([legacyId, canonicalId]) => {
    const legacyNoteKey = `note-${legacyId}`;
    const canonicalNoteKey = `note-${canonicalId}`;

    try {
      const legacyNote = storage.getItem(legacyNoteKey);
      if (legacyNote === null) return;

      const canonicalNote = storage.getItem(canonicalNoteKey);
      if (canonicalNote === null) {
        storage.setItem(canonicalNoteKey, legacyNote);
        storage.removeItem(legacyNoteKey);
      } else if (canonicalNote === legacyNote) {
        storage.removeItem(legacyNoteKey);
      }
    } catch {
      // Preserve whichever copy remains when a storage operation is unavailable.
    }
  });

  return starredIds;
}
