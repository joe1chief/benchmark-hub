import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../..', import.meta.url).pathname;
const benchmarkIds = [
  'DiagnosisArena',
  'GAIA',
  'HalluLens',
  'IFBench',
  'IFEval',
  'LiveCodeBench',
];
const languages = ['en', 'zh'];

function readText(path) {
  return readFileSync(join(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function readArch(id, language) {
  return readJson(`client/public/drawio/${id}/${id}.${language}.arch.json`);
}

function readSpec(id, language) {
  return readText(`client/public/drawio/${id}/${id}.${language}.spec.yaml`);
}

function readDetail(id) {
  return readJson(`client/public/benchmarks_detail/${id}.json`);
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to }) => `${from}->${to}`));
}

function nodeMap(arch) {
  return new Map(arch.nodes.map((node) => [node.id, node]));
}

function estimateNativeSingleLineWidth(label) {
  const text = label.replace(/\s+/gu, ' ').trim();
  return [...text].reduce((width, character) => {
    if (/\p{Script=Han}/u.test(character)) return width + 11;
    if (/\s/u.test(character)) return width + 3;
    if (/[A-Z]/u.test(character)) return width + 7;
    if (/[a-z]/u.test(character)) return width + 5.5;
    if (/[0-9]/u.test(character)) return width + 6;
    return width + 4;
  }, 0);
}

function topologySignature(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => `${id}:${type}`).sort(),
    edges: arch.edges
      .map(({ from, to, type }) => `${from}->${to}:${type}`)
      .sort(),
  };
}

test('GAIA keeps repaired-and-revalidated questions separate from discarded questions in both languages', () => {
  for (const language of languages) {
    const arch = readArch('GAIA', language);
    const edges = edgeSet(arch);
    const nodes = nodeMap(arch);

    assert.equal(nodes.get('compare')?.type, 'decision', language);
    assert.equal(nodes.get('revalidate')?.type, 'decision', language);
    assert.equal(nodes.get('discard')?.type, 'terminal', language);
    assert.ok(edges.has('compare->repair'), language);
    assert.ok(edges.has('repair->revalidate'), language);
    assert.ok(edges.has('revalidate->validated'), language);
    assert.ok(edges.has('revalidate->discard'), language);
    assert.ok(edges.has('compare->discard'), language);
    assert.equal(edges.has('repair->validated'), false, language);
  }
});

test('HalluLens follows the paper retry loop and records the official batch-code discrepancy', () => {
  for (const language of languages) {
    const arch = readArch('HalluLens', language);
    const edges = edgeSet(arch);
    const nodes = nodeMap(arch);

    assert.equal(nodes.get('precise_answerability')?.type, 'decision', language);
    assert.equal(nodes.get('precise_retry')?.type, 'process', language);
    assert.equal(nodes.get('precise_length')?.type, 'decision', language);
    assert.equal(nodes.get('precise_discard')?.type, 'terminal', language);
    assert.ok(edges.has('precise_question->precise_answerability'), language);
    assert.ok(edges.has('precise_answerability->precise_answer'), language);
    assert.ok(edges.has('precise_answerability->precise_retry'), language);
    assert.ok(edges.has('precise_retry->precise_question'), language);
    assert.equal(edges.has('precise_answerability->precise_discard'), false, language);
    assert.ok(edges.has('precise_answer->precise_length'), language);
    assert.ok(edges.has('precise_length->precise_final'), language);
    assert.ok(edges.has('precise_length->precise_discard'), language);
  }

  assert.match(readSpec('HalluLens', 'en'), /paper.*regenerat.*official.*batch.*filter/isu);
  assert.match(readSpec('HalluLens', 'zh'), /论文.*重新生成.*官方.*批处理.*过滤/su);
  assert.match(readDetail('HalluLens').drawio_review_note, /paper.*regenerat/iu);
  assert.match(readDetail('HalluLens').drawio_review_note, /official.*batch.*filter/iu);
});

test('IFBench combines independent test-constraint and held-out-WildChat inputs in both languages', () => {
  for (const language of languages) {
    const edges = edgeSet(readArch('IFBench', language));

    assert.ok(edges.has('constraints->combine'), language);
    assert.ok(edges.has('prompts->combine'), language);
    assert.equal(edges.has('constraints->prompts'), false, language);
  }
});

test('LiveCodeBench retains platform tests and merges optional generated and failing-test enrichment', () => {
  for (const language of languages) {
    const arch = readArch('LiveCodeBench', language);
    const edges = edgeSet(arch);
    const nodes = nodeMap(arch);

    for (const id of [
      'platform_tests',
      'failing_tests',
      'gpt_generators',
      'candidate_cap',
      'correct_programs',
      'execute_inputs',
      'verified_tests',
      'test_bundle',
      'eval_cap',
      'leetcode_only',
      'codegen_source',
    ]) {
      assert.ok(nodes.has(id), `${language}: missing ${id}`);
    }
    assert.equal(nodes.has('test_gate'), false, language);
    assert.ok(edges.has('platform_rules->platform_tests'), language);
    assert.ok(edges.has('platform_rules->gpt_generators'), language);
    assert.ok(edges.has('platform_rules->failing_tests'), language);
    assert.ok(edges.has('gpt_generators->candidate_cap'), language);
    assert.ok(edges.has('candidate_cap->execute_inputs'), language);
    assert.ok(edges.has('correct_programs->execute_inputs'), language);
    assert.ok(edges.has('execute_inputs->verified_tests'), language);
    assert.ok(edges.has('platform_tests->test_bundle'), language);
    assert.ok(edges.has('failing_tests->test_bundle'), language);
    assert.ok(edges.has('verified_tests->test_bundle'), language);
    assert.ok(edges.has('test_bundle->eval_cap'), language);
    assert.ok(edges.has('eval_cap->canonical_tuple'), language);
    assert.ok(edges.has('canonical_tuple->codegen_source'), language);
    assert.ok(edges.has('canonical_tuple->leetcode_only'), language);
    assert.ok(edges.has('leetcode_only->human_solutions'), language);
    assert.ok(edges.has('leetcode_only->lc_examples'), language);
    assert.equal(nodes.has('generation_repair'), false, language);
    assert.equal(
      arch.nodes.some(({ label }) => /repair|修复/iu.test(label)),
      false,
      language,
    );

    const generator = nodes.get('gpt_generators');
    assert.equal(generator.size, 'large', language);
    const estimatedWidth = estimateNativeSingleLineWidth(generator.label);
    assert.ok(
      estimatedWidth <= 136,
      `${language}: native generator label estimates ${estimatedWidth}px; ` +
        'the 160px node allows 136px after horizontal padding',
    );
  }
});

test('DiagnosisArena identifies Claude 3.5 and the official GitHub namespace in both languages', () => {
  const detail = readDetail('DiagnosisArena');

  assert.equal(detail.homepage, 'https://github.com/SPIRAL-MED/DiagnosisArena');
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2505.14107v4');
  for (const language of languages) {
    assert.match(
      nodeMap(readArch('DiagnosisArena', language)).get('claude_segment')?.label ?? '',
      /Claude 3\.5/iu,
      language,
    );
  }
});

test('IFBench and IFEval pin the reviewed arXiv versions', () => {
  assert.equal(
    readDetail('IFBench').paper_url,
    'https://arxiv.org/abs/2507.02833v3',
  );
  assert.equal(
    readDetail('IFEval').paper_url,
    'https://arxiv.org/abs/2311.07911v1',
  );
});

test('all scoped bilingual bundles have matching topology and native-text Desktop SVGs', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topologySignature(readArch(id, 'en')),
      topologySignature(readArch(id, 'zh')),
      `${id}: bilingual topology`,
    );

    for (const language of languages) {
      const base = `client/public/drawio/${id}/${id}.${language}`;
      const spec = readText(`${base}.spec.yaml`);
      const arch = readArch(id, language);
      const drawio = readText(`${base}.drawio`);
      const svg = readText(`${base}.svg`);

      assert.match(spec, /^meta:\s*$/mu, `${id}.${language}.spec`);
      assert.match(spec, /^nodes:\s*$/mu, `${id}.${language}.spec`);
      assert.match(spec, /^edges:\s*$/mu, `${id}.${language}.spec`);
      assert.ok(arch.nodes.length > 0, `${id}.${language}.arch nodes`);
      assert.ok(arch.edges.length > 0, `${id}.${language}.arch edges`);
      assert.match(drawio, /<mxfile\b/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(svg, /<svg\b/u, `${id}.${language}.svg`);
      assert.match(svg, /host=&quot;Electron&quot;/u, `${id}.${language}.svg Desktop metadata`);
      assert.match(svg, /<text\b/u, `${id}.${language}.svg native text`);
      assert.doesNotMatch(svg, /<foreignObject\b/iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /data:image/iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(/iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /color-scheme:\s*light\s+dark/iu, `${id}.${language}.svg`);
    }
  }
});
