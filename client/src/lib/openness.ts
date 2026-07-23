export type CanonicalOpenness = 'public' | 'partly public' | 'in-house' | '';

export function canonicalizeOpenness(value: unknown): CanonicalOpenness | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['', '未披露', 'not disclosed', 'unknown'].includes(normalized)) return '';
  if (
    normalized.includes('partly')
    || normalized.includes('部分公开')
    || ['public subset', 'mixed'].includes(normalized)
    || normalized.includes('自动门控')
    || (normalized.includes('完整快照') && normalized.includes('未披露'))
  ) {
    return 'partly public';
  }
  if (
    normalized === 'private'
    || normalized.startsWith('in-house')
    || normalized.includes('内部数据集')
  ) {
    return 'in-house';
  }
  if (
    normalized.startsWith('public')
    || normalized.startsWith('公开')
    || normalized.startsWith('数据公开')
  ) {
    return 'public';
  }
  return undefined;
}
