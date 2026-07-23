export function isArxivUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:'
      && (url.hostname === 'arxiv.org' || url.hostname.endsWith('.arxiv.org'))
    );
  } catch {
    return false;
  }
}

export function escapeCitationText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
