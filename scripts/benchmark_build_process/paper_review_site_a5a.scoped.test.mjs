import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'BABE',
  'Belebele',
  'BeyondSWE',
  'BenchCAD',
  'BioMysteryBench',
  'BIG-Bench_Hard',
  'BBEH',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function readCatalogRecord(id) {
  return readJson(join(publicDir, 'benchmarks.json')).find(entry => entry.id === id);
}

function readArch(id, language) {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readAsset(id, language, extension) {
  return readFileSync(join(publicDir, 'drawio', id, `${id}.${language}.${extension}`));
}

function nodeMap(arch) {
  return new Map(arch.nodes.map(node => [node.id, node]));
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to, type }) => `${from}->${to}:${type}`));
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function pngDimensions(buffer) {
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('publishes seven bilingual, topology-identical native Draw.io packages', () => {
  for (const id of benchmarkIds) {
    const en = readArch(id, 'en');
    const zh = readArch(id, 'zh');
    assert.deepEqual(topology(zh), topology(en), `${id} bilingual topology`);
    for (const language of ['en', 'zh']) {
      const drawio = readAsset(id, language, 'drawio').toString('utf8');
      const svg = readAsset(id, language, 'svg').toString('utf8');
      const png = pngDimensions(readAsset(id, language, 'png'));
      assert.match(drawio, /<mxfile\b/u, `${id}.${language}.drawio`);
      assert.match(svg, /<text(?:\s|>)/u, `${id}.${language}.svg native text`);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      assert.ok(png.width >= 800 && png.height >= 400, `${id}.${language}.png dimensions`);
      assert.ok(png.width / png.height < 4.5, `${id}.${language}.png readable aspect ratio`);
    }
  }
});

test('keeps BeyondSWE, BBH, and BBEH catalog fallbacks identical to details', () => {
  for (const id of ['BeyondSWE', 'BIG-Bench_Hard', 'BBEH']) {
    assert.deepEqual(readCatalogRecord(id), readDetail(id), id);
  }
});

test('keeps BABE on the paper construction and diagnostic path without inventing a total', () => {
  const detail = readDetail('BABE');
  const nodes = nodeMap(readArch('BABE', 'en'));
  const edges = edgeSet(readArch('BABE', 'en'));
  assert.match(detail.paper_url, /2602\.05857/u);
  assert.match(detail.scale, /12.*45%.*55%/u);
  assert.match(detail.scale, /未披露/u);
  assert.match(nodes.get('expert_triplet')?.label ?? '', /three.*question|three-item/iu);
  assert.match(nodes.get('multi_trial')?.label ?? '', /n\s*=\s*1.*2.*4.*8/isu);
  assert.ok(edges.has('revision->senior_review:optional'));
  assert.ok(edges.has('llm_filter->strong_relation:data'));
  assert.ok(edges.has('llm_filter->weak_relation:data'));
});

test('models Belebele authoring QA, translation, and the five-language conditional transliteration', () => {
  const detail = readDetail('Belebele');
  const nodes = nodeMap(readArch('Belebele', 'en'));
  const edges = edgeSet(readArch('Belebele', 'en'));
  assert.match(detail.scale, /900.*488.*122.*115.*29.*27.*109,?800/u);
  assert.match(nodes.get('guidelines')?.label ?? '', /guideline/iu);
  assert.match(nodes.get('authoring')?.label ?? '', /five.*round/isu);
  assert.match(nodes.get('english_set')?.label ?? '', /900.*488/isu);
  assert.match(nodes.get('english_set')?.label ?? '', /20%/u);
  assert.match(nodes.get('indic_condition')?.label ?? '', /Hindi.*Bengali.*Urdu.*Nepali.*Sinhala/isu);
  assert.ok(edges.has('guidelines->authoring:primary'));
  assert.ok(edges.has('translate->proofread:primary'));
  assert.ok(edges.has('proofread->indic_condition:primary'));
  assert.ok(edges.has('indic_condition->transliterate:optional'));
  assert.ok(edges.has('indic_condition->dataset:primary'));
  assert.ok(edges.has('transliterate->dataset:optional'));
});

test('preserves all four BeyondSWE candidate funnels and two-stage cross-task audit', () => {
  const detail = readDetail('BeyondSWE');
  const nodes = nodeMap(readArch('BeyondSWE', 'en'));
  const edges = edgeSet(readArch('BeyondSWE', 'en'));
  assert.match(detail.scale, /500.*246/u);
  assert.match(nodes.get('crossrepo')?.label ?? '', /3,?000.*linked/isu);
  assert.match(nodes.get('domainfix')?.label ?? '', /800.*21.*11/isu);
  assert.match(nodes.get('depmigrate')?.label ?? '', /7,?000.*23/isu);
  assert.match(nodes.get('doc2repo')?.label ?? '', /2025.*3.*20/isu);
  assert.match(nodes.get('stability')?.label ?? '', /five.*run.*800.*200.*1,?000.*60/isu);
  assert.match(nodes.get('task_review')?.label ?? '', /3.*domain.*4.*SWE.*spec.*test.*200.*72.*178.*50/isu);
  assert.match(nodes.get('swe_audit')?.label ?? '', /five senior software.*environment.*data cleaning/isu);
  assert.match(nodes.get('cross_task_audit')?.label ?? '', /five senior PhD.*software engineering.*LLM/isu);
  assert.match(nodes.get('metrics')?.label ?? '', /P2P.*F2P.*Doc2Repo/isu);
  for (const funnel of ['crossrepo', 'domainfix', 'depmigrate', 'doc2repo']) {
    assert.ok(edges.has(`${funnel}->environment:primary`));
    assert.equal(edges.has(`${funnel}->task_review:primary`), false);
  }
  assert.ok(edges.has('environment->stability:primary'));
  assert.ok(edges.has('stability->task_review:primary'));
  assert.ok(edges.has('task_review->swe_audit:primary'));
  assert.ok(edges.has('swe_audit->cross_task_audit:primary'));
  assert.ok(edges.has('cross_task_audit->dataset:primary'));
});

test('keeps BenchCAD construction counts, sandbox, release bundles, and four task families explicit', () => {
  const detail = readDetail('BenchCAD');
  const nodes = nodeMap(readArch('BenchCAD', 'en'));
  assert.match(detail.scale, /17,?900.*106.*4,?800.*748/u);
  assert.match(nodes.get('standards')?.label ?? '', /52.*47/isu);
  assert.match(nodes.get('family_modules')?.label ?? '', /106.*49/isu);
  assert.match(nodes.get('sandbox')?.label ?? '', /30.*second/isu);
  assert.match(nodes.get('qa_bank')?.label ?? '', /2,?400.*4,?800/isu);
  assert.match(nodes.get('edit_bank')?.label ?? '', /748/u);
  assert.match(nodes.get('report')?.label ?? '', /Vision2Code.*Vision QA.*Code QA.*Code Edit/isu);
});

test('updates BioMysteryBench to v11 with anti-cheat, expert QC, and all-or-nothing grading', () => {
  const detail = readDetail('BioMysteryBench');
  const nodes = nodeMap(readArch('BioMysteryBench', 'en'));
  assert.match(detail.scale, /90.*73.*17/u);
  assert.match(detail.drawio_review_note, /v11/iu);
  for (const value of ['99', '90', '9', '24']) assert.match(detail.drawio_review_note, new RegExp(value, 'u'));
  assert.match(nodes.get('validation')?.label ?? '', /mandatory.*notebook/isu);
  assert.match(nodes.get('human_trials')?.label ?? '', /up to five|≤\s*5/iu);
  assert.match(nodes.get('release')?.label ?? '', /90.*73.*17/isu);
  assert.match(nodes.get('access_policy')?.label ?? '', /accession.*reverse.*lookup.*prohibited/isu);
  assert.match(nodes.get('grade')?.label ?? '', /all-or-nothing/iu);
  assert.match(nodes.get('solve')?.label ?? '', /five.*episode|5.*episode/iu);
});

test('splits true BBH from BBEH and preserves each official evaluation contract', () => {
  const bbh = readDetail('BIG-Bench_Hard');
  const bbeh = readDetail('BBEH');
  const bbhNodes = nodeMap(readArch('BIG-Bench_Hard', 'en'));
  const bbhEdges = edgeSet(readArch('BIG-Bench_Hard', 'en'));
  const bbehNodes = nodeMap(readArch('BBEH', 'en'));

  assert.match(bbh.paper_url, /2210\.09261/u);
  assert.doesNotMatch(`${bbh.intro} ${bbh.drawio_review_note}`, /Extra Hard|BBEH/u);
  assert.match(bbh.scale, /23.*27/u);
  assert.match(bbh.scale, /6,?511/u);
  assert.match(bbhNodes.get('bigbench')?.label ?? '', /209.*uneven.*metadata/isu);
  assert.doesNotMatch(bbhNodes.get('bigbench')?.label ?? '', /model and average-human results available/iu);
  assert.match(bbhNodes.get('structure_filter')?.label ?? '', />3.*209.*187.*<103.*187.*130/isu);
  assert.match(bbhNodes.get('baseline_filter')?.label ?? '', /human baseline.*130.*85.*(?:MC|multiple.choice).*exact match.*85.*78/isu);
  assert.match(bbhNodes.get('hardness_filter')?.label ?? '', /model.*human.*78.*36.*13.*extreme.*out-of-scope.*36.*23/isu);
  assert.ok(bbhEdges.has('bigbench->structure_filter:primary'));
  assert.ok(bbhEdges.has('structure_filter->baseline_filter:primary'));
  assert.ok(bbhEdges.has('baseline_filter->hardness_filter:primary'));
  assert.ok(bbhEdges.has('hardness_filter->dataset:primary'));
  assert.match(bbhNodes.get('examples')?.label ?? '', /usually 250.*187.*146.*178/isu);
  assert.match(
    bbhNodes.get('human_cot')?.label ?? '',
    /(?:three.*(?:CoT|chain-of-thought)|(?:CoT|chain-of-thought).*three).*task/isu,
  );
  assert.match(bbhNodes.get('decode')?.label ?? '', /PaLM.*InstructGPT.*Codex.*greedy.*(?:temperature|tau).*0/isu);
  assert.match(bbhNodes.get('score')?.label ?? '', /exact match.*unweighted.*23/isu);

  assert.match(bbeh.paper_url, /2502\.19187/u);
  assert.match(bbeh.intro, /Extra Hard|BBEH/u);
  assert.match(bbeh.scale, /4,?520.*460/u);
  assert.match(bbehNodes.get('harder_tasks')?.label ?? '', /23.*harder counterpart/isu);
  assert.match(bbehNodes.get('full_set')?.label ?? '', /4,?520/iu);
  assert.match(bbehNodes.get('full_set')?.label ?? '', /200.*120/isu);
  assert.match(bbehNodes.get('difficulty_gate')?.label ?? '', /(?:two|both).*reference.*70%/isu);
  assert.match(bbehNodes.get('harmonic')?.label ?? '', /adjusted harmonic/iu);
  assert.match(bbehNodes.get('micro')?.label ?? '', /micro average/iu);
});
