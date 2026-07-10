import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DrawioSvgChart, getDrawioImageWidth } from './BenchmarkDrawer';

describe('DrawioSvgChart', () => {
  it('scales from the SVG natural width so labels remain readable', () => {
    expect(getDrawioImageWidth(2393, 0.9)).toBe('2154px');
    expect(getDrawioImageWidth(null, 0.9)).toBe('90%');
  });

  it('renders a white canvas behind light academic SVGs in dark mode', () => {
    const html = renderToStaticMarkup(
      <DrawioSvgChart
        src="./drawio/AlphaBench/AlphaBench.en.svg"
        alt="AlphaBench build process"
        isDark
      />,
    );

    expect(html).toContain('overflow-auto bg-white');
  });
});
