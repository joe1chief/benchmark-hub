import { describe, expect, it } from 'vitest';

import { escapeCitationText, isArxivUrl } from './benchmarkText';

describe('isArxivUrl', () => {
  it.each([
    'https://arxiv.org/abs/2501.00001',
    'https://export.arxiv.org/pdf/2501.00001',
  ])('accepts official arXiv host %s', value => {
    expect(isArxivUrl(value)).toBe(true);
  });

  it.each([
    'https://arxiv.org.evil.example/abs/2501.00001',
    'https://example.com/?next=arxiv.org',
    'not a URL containing arxiv.org',
  ])('rejects substring-only match %s', value => {
    expect(isArxivUrl(value)).toBe(false);
  });
});

describe('escapeCitationText', () => {
  it('escapes backslashes before double quotes', () => {
    expect(escapeCitationText('path\\name "quoted"')).toBe(
      'path\\\\name \\"quoted\\"',
    );
  });
});
