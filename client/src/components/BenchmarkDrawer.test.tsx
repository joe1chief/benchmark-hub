import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import BenchmarkDrawer from './BenchmarkDrawer';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { hasBenchmarkFlowchart } from '@/lib/benchmarkFlowchart';
import type { Benchmark } from '@/types/benchmark';

const record: Benchmark = {
  id: 'ArchOnly', name: 'Architecture-only benchmark',
  l1: '', l1_color: '', l2: '', intro: '', paper_url: '', arxiv_pdf_url: '',
  pdf_cdn_url: '', published: '', year: '', org: '', build_method: '', metric: '',
  openness: '', modality: '', language: '', task_type: '', difficulty: '',
  eval_feature: '', scale: '', has_leaderboard: false, pdf_filename: '',
  family: '', variant: '', widely_tested: false, related_benchmarks: [], homepage: '',
};

function renderDrawer(benchmark: Benchmark, isDark = false) {
  return renderToStaticMarkup(
    <ThemeProvider defaultTheme={isDark ? 'dark' : 'light'}>
      <BenchmarkDrawer benchmark={benchmark} allBenchmarks={[benchmark]}
        onClose={() => {}} onSelectBenchmark={() => {}} />
    </ThemeProvider>,
  );
}

function flowchartTab(html: string) {
  const tab = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
    ?.find(button => button.replace(/<[^>]*>/g, '') === '构建流程');
  expect(tab).toBeDefined();
  return tab!;
}

describe('HTML build-process availability', () => {
  it.each(['drawio_arch_en', 'drawio_arch_zh'] as const)(
    'enables the actual drawer tab from %s alone, without export artifacts', field => {
      const benchmark = { ...record, [field]: `drawio/ArchOnly/ArchOnly.${field.endsWith('en') ? 'en' : 'zh'}.arch.json` };
      for (const isDark of [false, true]) {
        const html = renderDrawer(benchmark, isDark);
        expect(flowchartTab(html)).not.toContain('disabled');
        expect(html).toContain('双栏对照');
        expect(html).not.toContain('<img');
        expect(html).not.toContain('.drawio');
        expect(html).not.toContain('.svg');
        expect(html).not.toContain('.png');
        expect(html).not.toContain('mermaid-cdn');
      }
    },
  );

  it('keeps a same-ID catalog architecture available when detail metadata omits it', () => {
    const catalog = { ...record, drawio_arch_en: 'drawio/ArchOnly/ArchOnly.en.arch.json' };
    expect(hasBenchmarkFlowchart(record, catalog)).toBe(true);
    expect(hasBenchmarkFlowchart(record, { ...catalog, id: 'Different' })).toBe(false);
  });

  it.each(['flowchart_en', 'flowchart_zh', 'mermaid_flowchart'] as const)(
    'preserves existing content-only availability through %s', field => {
      expect(flowchartTab(renderDrawer({ ...record, [field]: 'flowchart LR\nA --> B' })))
        .not.toContain('disabled');
    },
  );

  it('does not advertise HTML availability based on legacy export fields alone', () => {
    const legacyOnly = {
      ...record,
      drawio_flowchart_en: 'drawio/ArchOnly/ArchOnly.en.svg',
      drawio_source_en: 'drawio/ArchOnly/ArchOnly.en.drawio',
      drawio_spec_en: 'drawio/ArchOnly/ArchOnly.en.spec.yaml',
    };
    expect(flowchartTab(renderDrawer(legacyOnly))).toContain('disabled');
    expect(renderDrawer(legacyOnly)).not.toContain('双栏对照');
  });

  it('disables the entry for absent or blank metadata rather than guessing from the ID', () => {
    expect(flowchartTab(renderDrawer(record))).toContain('disabled');
    expect(hasBenchmarkFlowchart({ ...record, drawio_arch_en: '  ', drawio_arch_zh: '',
      flowchart_en: '\n', flowchart_zh: '', mermaid_flowchart: null })).toBe(false);
  });

  it('renders no drawer when nothing is selected', () => {
    const html = renderToStaticMarkup(<ThemeProvider>
      <BenchmarkDrawer benchmark={null} allBenchmarks={[]} onClose={() => {}} onSelectBenchmark={() => {}} />
    </ThemeProvider>);
    expect(html).toBe('');
  });
});
