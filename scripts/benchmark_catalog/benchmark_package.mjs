// Compile reviewed intake data through the same graph model used by the website.
// This module does not fetch sources, certify a paper review, or write files.
import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { buildFlowchartModel } from '../benchmark_build_process/flowchart_model.mjs';
import { applyFallbacks, renderFallback } from '../benchmark_build_process/sync_detail_fallbacks_from_arch.mjs';

const STRING_FIELDS = [
  'id', 'name', 'l1', 'l1_color', 'l2', 'intro', 'paper_url', 'arxiv_pdf_url',
  'pdf_cdn_url', 'published', 'year', 'org', 'build_method', 'metric', 'openness',
  'modality', 'language', 'task_type', 'difficulty', 'eval_feature', 'scale',
  'pdf_filename', 'family', 'variant', 'homepage', 'l1_en', 'l2_en', 'difficulty_en',
  'openness_en', 'modality_en', 'task_type_en', 'build_method_en', 'eval_feature_en',
  'intro_en', 'language_en', 'scale_en', 'metric_en', 'default_l1', 'default_l2',
];
const BOOLEAN_FIELDS = ['has_leaderboard', 'widely_tested'];
const TRANSLATED_FIELDS = ['l2', 'difficulty', 'openness', 'modality', 'task_type', 'build_method', 'eval_feature', 'intro', 'language', 'scale', 'metric'];
const EVIDENCE_FIELDS = [
  'source_type', 'source_url', 'source_locator', 'evidence_summary_en',
  'evidence_summary_zh', 'paper_alignment_review', 'known_limits_en', 'known_limits_zh',
  'language_exempt_node_ids',
];
const LANGUAGES = ['en', 'zh'];
const OBJECT = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const jsonText = value => `${JSON.stringify(value, null, 2)}\n`;
export const sha256 = text => createHash('sha256').update(text).digest('hex');

function object(value, name) {
  if (!OBJECT(value)) throw new Error(`${name} must be an object`);
}

function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
}

function onlyKeys(value, allowed, name) {
  object(value, name);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown ${name} field: ${key}`);
  }
}

export function validateId(id, { newEntry = false } = {}) {
  text(id, 'benchmark id');
  if (id !== id.trim() || id === '.' || id === '..' || /[\\/\p{Cc}]/u.test(id)) {
    throw new Error(`Unsafe benchmark id: ${id}`);
  }
  if (newEntry && !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(id)) {
    throw new Error('New benchmark IDs must use ASCII letters, digits, dots, underscores, or hyphens');
  }
  return id;
}

function publicUrl(value, name, required = true) {
  if (!required && value === '') return;
  text(value, name);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTP(S) URL`); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials`);
  }
}

function categoryStyle(catalog, category) {
  const candidates = catalog.filter(entry => entry.l1 === category);
  if (!candidates.length) throw new Error(`Unknown l1 category: ${category}; use a category already present in the catalog`);
  const counts = new Map();
  for (const entry of candidates) {
    const key = JSON.stringify([entry.l1_color, entry.l1_en, entry.default_l1]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const preferred = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
  const [l1_color, l1_en, default_l1] = JSON.parse(preferred);
  return { l1_color: l1_color ?? '', l1_en: l1_en ?? '', default_l1: default_l1 ?? '' };
}

function compileMetadata(input, catalog, existingBenchmark) {
  onlyKeys(input, [...STRING_FIELDS, ...BOOLEAN_FIELDS, 'related_benchmarks'], 'benchmark');
  const id = validateId(input.id, { newEntry: !existingBenchmark });
  if (existingBenchmark) {
    if (id !== existingBenchmark.id) throw new Error('An update must retain the existing benchmark ID');
    for (const field of TRANSLATED_FIELDS) {
      const pair = [field, `${field}_en`];
      if (pair.some(key => Object.hasOwn(input, key) && input[key] !== existingBenchmark[key])
        && !pair.every(key => Object.hasOwn(input, key))) {
        throw new Error(`Update ${field} and ${field}_en together; explicitly retain either value when only correcting its translation`);
      }
    }
    const previous = Object.fromEntries([...STRING_FIELDS, ...BOOLEAN_FIELDS, 'related_benchmarks']
      .filter(key => Object.hasOwn(existingBenchmark, key)).map(key => [key, existingBenchmark[key]]));
    if (Object.hasOwn(input, 'l1') && input.l1 !== previous.l1) {
      for (const key of ['l1_color', 'l1_en', 'default_l1']) delete previous[key];
    }
    if (Object.hasOwn(input, 'published') && input.published !== previous.published) delete previous.year;
    input = { ...previous, ...input };
  }
  for (const key of ['name', 'l1', 'intro', 'intro_en', 'paper_url', 'published', 'org']) text(input[key], `benchmark.${key}`);
  const defaults = Object.fromEntries(STRING_FIELDS.map(key => [key, '']));
  const result = {
    ...defaults,
    ...categoryStyle(catalog, input.l1),
    year: input.published.slice(0, 4),
    has_leaderboard: false,
    widely_tested: false,
    related_benchmarks: [],
    ...input,
    id,
  };
  for (const key of STRING_FIELDS) {
    if (typeof result[key] !== 'string') throw new Error(`benchmark.${key} must be a string; use an empty string for unknown optional text`);
  }
  for (const key of BOOLEAN_FIELDS) {
    if (typeof result[key] !== 'boolean') throw new Error(`benchmark.${key} must be boolean`);
  }
  for (const field of TRANSLATED_FIELDS) {
    if (/[㐀-鿿]/u.test(result[field]) && !result[`${field}_en`].trim()) throw new Error(`benchmark.${field}_en is required when ${field} contains Chinese text`);
    if (/[㐀-鿿]/u.test(result[`${field}_en`])) throw new Error(`benchmark.${field}_en must use English text`);
  }
  if (!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u.test(result.published) || result.year !== result.published.slice(0, 4)) {
    throw new Error('published must be YYYY or YYYY-MM, and year must match its YYYY');
  }
  if (!['public', 'partly public', 'in-house', ''].includes(result.openness)) throw new Error('Use the canonical openness value or an empty string for unknown');
  if (!/^#[0-9a-f]{6}$/iu.test(result.l1_color)) throw new Error('l1_color must be a six-digit hex color');
  for (const key of ['paper_url', 'arxiv_pdf_url', 'pdf_cdn_url', 'homepage']) publicUrl(result[key], `benchmark.${key}`, key === 'paper_url');
  if (!Array.isArray(result.related_benchmarks) || result.related_benchmarks.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('related_benchmarks must be an array of benchmark IDs or unique display names');
  }
  return result;
}

function compileEvidence(evidence) {
  onlyKeys(evidence, EVIDENCE_FIELDS, 'evidence');
  for (const key of ['source_type', 'source_url', 'source_locator', 'evidence_summary_en', 'evidence_summary_zh']) text(evidence[key], `evidence.${key}`);
  publicUrl(evidence.source_url, 'evidence.source_url');
  const review = evidence.paper_alignment_review;
  object(review, 'paper_alignment_review');
  if (review.status !== 'passed') throw new Error('Paper alignment review must already be passed; the importer does not perform or fabricate this review');
  if (review.source_url !== evidence.source_url || review.source_locator !== evidence.source_locator) {
    throw new Error('Paper alignment review must match the exact evidence source_url and source_locator');
  }
  if (typeof review.reviewed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(review.reviewed_at)
    || Number.isNaN(Date.parse(review.reviewed_at)) || new Date(review.reviewed_at).toISOString().slice(0, 10) !== review.reviewed_at) {
    throw new Error('paper_alignment_review.reviewed_at must be an actual YYYY-MM-DD review date');
  }
  for (const key of ['known_limits_en', 'known_limits_zh']) {
    if (evidence[key] !== undefined && typeof evidence[key] !== 'string') throw new Error(`evidence.${key} must be a string`);
  }
  if (evidence.language_exempt_node_ids !== undefined && (!Array.isArray(evidence.language_exempt_node_ids)
    || evidence.language_exempt_node_ids.some(id => typeof id !== 'string' || !id))) {
    throw new Error('language_exempt_node_ids must be a list of technical-identifier node IDs');
  }
  return structuredClone(evidence);
}

// Compare structure including ordering and stage membership; translated labels
// may change, but must not change the lanes or the route followed through a graph.
function structure(model) {
  return JSON.stringify({
    profile: model.profile, theme: model.theme, layout: model.layout,
    nodes: model.nodes.map(({ label, ...node }) => node),
    edges: model.edges.map(({ label, ...edge }) => ({ ...edge, labeled: Boolean(label?.trim()) })),
    modules: model.modules.map(({ label, ...module }) => module),
  });
}

function validateNewMembership(model) {
  const modules = new Map(model.modules.map(module => [module.id, module]));
  for (const node of model.nodes) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(node.id)) throw new Error(`Use a stable ASCII node ID: ${node.id}`);
    if (node.module && !modules.has(node.module)) throw new Error(`Node ${node.id} refers to an undeclared module: ${node.module}`);
    const listed = model.modules.filter(module => [...(module.nodes ?? []), ...(module.nodeIds ?? [])].includes(node.id));
    if (listed.length > 1 || (listed.length && node.module && node.module !== listed[0].id)) {
      throw new Error(`Node ${node.id} has conflicting module membership`);
    }
  }
}

export function graphPaths(id) {
  validateId(id);
  return Object.fromEntries(LANGUAGES.flatMap(language => ['spec', 'arch'].map(kind => [
    `drawio_${kind}_${language}`,
    `drawio/${id}/${id}.${language}.${kind === 'spec' ? 'spec.yaml' : 'arch.json'}`,
  ])));
}

export function generationRecord(specs, models) {
  return {
    format: 'html-flowchart-generation/v1',
    model_version: 1,
    spec_sha256: Object.fromEntries(LANGUAGES.map(language => [language, sha256(specs[language])])),
    arch_sha256: Object.fromEntries(LANGUAGES.map(language => [language, sha256(jsonText(models[language]))])),
  };
}

export function compileBenchmarkPackage(input, { catalog, existingBenchmark } = {}) {
  onlyKeys(input, ['format', 'benchmark', 'evidence', 'specs'], 'package');
  if (input.format !== 'benchmark-package/v1') throw new Error('Unsupported package format; expected benchmark-package/v1');
  if (!Array.isArray(catalog)) throw new Error('catalog must be an array');
  const metadata = compileMetadata(input.benchmark, catalog, existingBenchmark);
  const evidence = compileEvidence(input.evidence);
  onlyKeys(input.specs, LANGUAGES, 'specs');
  const specs = {};
  const models = {};
  for (const language of LANGUAGES) {
    object(input.specs[language], `specs.${language}`);
    const spec = structuredClone(input.specs[language]);
    if (spec.meta !== undefined) object(spec.meta, `specs.${language}.meta`);
    spec.meta = { profile: 'academic-paper', theme: 'academic-color', source: 'generated', layout: 'horizontal', ...spec.meta };
    for (const key of ['title', 'description', 'legend']) text(spec.meta[key], `specs.${language}.meta.${key}`);
    specs[language] = stringify(spec, { lineWidth: 0 });
    models[language] = buildFlowchartModel(parse(specs[language]), { title: `${metadata.id}.${language}` });
    validateNewMembership(models[language]);
  }
  if (structure(models.en) !== structure(models.zh)) throw new Error('EN/ZH graph order, types, edges, styles and module membership must match; translate labels without changing structure');
  const paths = graphPaths(metadata.id);
  const benchmark = applyFallbacks({ ...metadata, ...paths }, Object.fromEntries(LANGUAGES.map(language => [language, renderFallback(models[language])])));
  const manifest = {
    id: metadata.id,
    ...evidence,
    spec_authority: 'checked_in',
    assets: paths,
    html_generation: generationRecord(specs, models),
  };
  return { id: metadata.id, benchmark, manifest, specs, models };
}
