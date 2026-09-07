import type { Benchmark } from '@/types/benchmark';

/** Metadata availability, not a network health check. Renderers load the
 * canonical /drawio/<id>/<id>.<lang>.arch.json resources independently. */
export function hasBenchmarkFlowchart(
  benchmark: Benchmark,
  catalogEntry?: Benchmark,
): boolean {
  const records = [benchmark];
  if (catalogEntry?.id === benchmark.id) records.push(catalogEntry);
  return records.some(record => [
    record.drawio_arch_en,
    record.drawio_arch_zh,
    // Preserve existing content-only records during the HTML-first migration.
    record.flowchart_en,
    record.flowchart_zh,
    record.mermaid_flowchart,
  ].some(value => typeof value === 'string' && value.trim().length > 0));
}
