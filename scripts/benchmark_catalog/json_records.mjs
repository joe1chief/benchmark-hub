import { isDeepStrictEqual } from 'node:util';

// JSON.parse owns validation and semantics. This scanner only locates tokens in
// validated JSON, ignoring brackets, commas, and escaped quotes inside strings.
function tokens(text) {
  const result = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if ('[]{}:,'.includes(char)) {
      result.push({ char, index: i });
    }
  }
  return result;
}

function arrayLayout(text) {
  const structural = tokens(text);
  const spans = [];
  let depth = 0;
  let start;
  for (const { char, index } of structural) {
    if (char === '[' || char === '{') {
      if (depth === 1) start = index;
      depth++;
    } else if (char === ']' || char === '}') {
      depth--;
      if (depth === 1) spans.push({ start, end: index + 1 });
    }
  }
  return { spans, open: structural[0].index };
}

function unicodeStyle(text) {
  let escaped = 0;
  let literal = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!inString) {
      if (char === '"') inString = true;
    } else if (char === '\\') {
      if (text[i + 1] === 'u') {
        if (parseInt(text.slice(i + 2, i + 6), 16) > 127) escaped++;
        i += 5;
      } else i++;
    } else if (char === '"') inString = false;
    else if (char.charCodeAt(0) > 127) literal++;
  }
  return escaped + literal ? escaped > literal : undefined;
}

function lineIndent(text, position) {
  const prefix = text.slice(text.lastIndexOf('\n', position - 1) + 1, position);
  return /^[\t ]*$/.test(prefix) ? prefix : '';
}

function formatFor(text, span) {
  const interior = text.slice(text.indexOf('[') + 1, text.lastIndexOf(']'));
  const raw = span ? text.slice(span.start, span.end) : '';
  const newline = (raw.match(/\r\n|\n|\r/) || text.match(/\r\n|\n|\r/) || ['\n'])[0];
  const base = span ? lineIndent(text, span.start) : (/\r\n|\n|\r/.test(interior) ? '  ' : '');
  const firstPropertyIndent = raw.match(/(?:\r\n|\n|\r)([\t ]*)"/);
  const pretty = /\r\n|\n|\r/.test(raw) || (!span && /\r\n|\n|\r/.test(interior));
  const unit = firstPropertyIndent && firstPropertyIndent[1].startsWith(base)
    ? firstPropertyIndent[1].slice(base.length) || '  '
    : base || '  ';
  const structural = tokens(raw);
  const colon = structural.find(token => token.char === ':');
  const comma = structural.find(token => token.char === ',');
  const after = token => token ? raw.slice(token.index + 1).match(/^[\t ]*/)[0] : '';
  return {
    newline, base, unit, pretty,
    colonSpace: after(colon), commaSpace: after(comma),
    ascii: unicodeStyle(raw) ?? unicodeStyle(text) ?? false,
  };
}

function render(record, format) {
  let serialized = JSON.stringify(record, null, format.pretty ? format.unit : undefined);
  if (format.pretty) {
    serialized = serialized.replace(/\n/g, format.newline + format.base);
  } else {
    // JSON.stringify is compact; only add separator whitespace outside strings.
    const structural = tokens(serialized);
    for (let i = structural.length - 1; i >= 0; i--) {
      const { char, index } = structural[i];
      const space = char === ':' ? format.colonSpace : char === ',' ? format.commaSpace : '';
      if (space) serialized = serialized.slice(0, index + 1) + space + serialized.slice(index + 1);
    }
  }
  if (format.ascii) {
    serialized = serialized.replace(/[^\x00-\x7f]/g, char =>
      `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  }
  return serialized;
}

function assertRecord(record, context) {
  if (record === null || Array.isArray(record) || typeof record !== 'object'
      || typeof record.id !== 'string' || !record.id.trim()) {
    throw new TypeError(`${context} must be an object with a non-empty string id`);
  }
}

/**
 * Return JSON array text with one complete record inserted/replaced by id.
 * mode: upsert (default), insert (reject existing), replace (reject missing).
 * Unchanged records and surrounding bytes are copied verbatim; semantically
 * equal replacement returns the original text, including its key order/escapes.
 * Caller owns preservation of fields within the replaced record. No disk I/O.
 */
export function upsertJsonRecord(text, record, { mode = 'upsert' } = {}) {
  if (typeof text !== 'string') throw new TypeError('JSON source must be a string');
  if (!['upsert', 'insert', 'replace'].includes(mode)) throw new TypeError(`Unknown mode: ${mode}`);
  const records = JSON.parse(text);
  if (!Array.isArray(records)) throw new TypeError('JSON source must be a top-level array');
  assertRecord(record, 'New record');
  const seen = new Set();
  for (const existing of records) {
    assertRecord(existing, 'Existing record');
    if (seen.has(existing.id)) throw new Error(`Duplicate record id: ${existing.id}`);
    seen.add(existing.id);
  }
  const index = records.findIndex(existing => existing.id === record.id);
  if (mode === 'insert' && index !== -1) throw new Error(`Record already exists: ${record.id}`);
  if (mode === 'replace' && index === -1) throw new Error(`Record not found: ${record.id}`);
  if (index !== -1 && isDeepStrictEqual(records[index], record)) return text;
  // Reject lossy values (undefined, NaN, Date, toJSON, etc.) rather than silently
  // dropping unknown fields. JSON.parse remains the sole semantic parser.
  const serialized = JSON.stringify(record);
  if (!isDeepStrictEqual(JSON.parse(serialized), record)) {
    throw new TypeError('New record must contain only losslessly serializable JSON values');
  }

  const { spans, open } = arrayLayout(text);
  if (index !== -1) {
    const span = spans[index];
    const replacement = render(record, formatFor(text, span));
    return text.slice(0, span.start) + replacement + text.slice(span.end);
  }

  const last = spans.at(-1);
  const format = formatFor(text, last);
  const addition = render(record, format);
  if (!last) {
    // Insert before existing trailing array whitespace; retain that whitespace.
    const leading = format.pretty ? format.newline + format.base : '';
    return text.slice(0, open + 1) + leading + addition + text.slice(open + 1);
  }
  const separator = spans.length > 1
    ? text.slice(spans.at(-2).end, last.start)
    : `,${/\r\n|\n|\r/.test(text.slice(open + 1, last.start))
      ? format.newline + format.base : text.slice(open + 1, last.start)}`;
  // Insert immediately after the last record, before the original closing gap.
  return text.slice(0, last.end) + separator + addition + text.slice(last.end);
}
