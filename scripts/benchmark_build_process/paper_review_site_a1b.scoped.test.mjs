import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'AIGCBench',
  'AIME',
  'AIME-24',
  'AIME-25',
  'AIRS-Bench',
  'AInsteinBench',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language) {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readSpec(id, language) {
  return readFileSync(join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`), 'utf8');
}

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
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

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('keeps all six A1b diagrams bilingual with identical node ids and typed edges', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

test('keeps AIGCBench automatic metrics and human study as parallel consumers', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIGCBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('webvid')?.label ?? '', /WebVid.*1,?000|1,?000.*WebVid/isu);
    assert.match(nodes.get('laion')?.label ?? '', /LAION.*925|925.*LAION/isu);
    assert.match(nodes.get('prompts')?.label ?? '', /3,?000/u);
    assert.match(nodes.get('generate')?.label ?? '', /SDXL.*1280.*720/isu);
    assert.match(nodes.get('release')?.label ?? '', /2,?003.*3,?928|3,?928.*2,?003/isu);
    assert.match(nodes.get('normalize')?.label ?? '', /16.*4|前\s*16.*4/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /11.*4|4.*11/isu);
    assert.match(nodes.get('human_sample')?.label ?? '', /30.*method|每种方法.*30/iu);
    assert.match(nodes.get('human_vote')?.label ?? '', /42/u);
    assert.ok(edges.has('release->i2v:primary'));
    assert.ok(edges.has('i2v->normalize:primary'));
    assert.ok(edges.has('normalize->metrics:primary'));
    assert.ok(edges.has('metrics->auto_report:primary'));
    assert.ok(edges.has('i2v->human_sample:primary'));
    assert.ok(edges.has('human_sample->human_vote:primary'));
    assert.ok(edges.has('human_vote->human_report:primary'));
    assert.ok(edges.has('auto_report->alignment:primary'));
    assert.ok(edges.has('human_report->alignment:primary'));
    assert.equal(edges.has('auto_report->human_sample:primary'), false);
  }
});

test('discloses that the AIME site entry is MathArena and preserves all protocol branches', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIME', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(arch.title, /AIME.*MathArena|MathArena.*AIME/iu);
    assert.match(nodes.get('snapshot')?.label ?? '', /162/u);
    assert.match(nodes.get('snapshot')?.label ?? '', /AIME.*HMMT.*BRUMO.*30/isu);
    assert.match(nodes.get('snapshot')?.label ?? '', /CMIMC.*40/isu);
    assert.match(nodes.get('snapshot')?.label ?? '', /USAMO.*6.*IMO.*6/isu);
    assert.match(nodes.get('snapshot')?.label ?? '', /Project Euler.*20/isu);
    assert.match(nodes.get('ordinary_answers')?.label ?? '', /4/u);
    assert.match(nodes.get('project_euler')?.label ?? '', /tool|工具/iu);
    assert.match(nodes.get('ordinary_proofs')?.label ?? '', /4.*responses|4.*响应|每题.*4.*份/isu);
    assert.match(nodes.get('ordinary_proofs')?.label ?? '', /anonym|匿名/iu);
    assert.match(nodes.get('proof_score')?.label ?? '', /2.*human|2.*人工|两名.*人工/iu);
    assert.match(nodes.get('proof_score')?.label ?? '', /partial[- ]credit|部分分/iu);
    assert.match(nodes.get('imo_samples')?.label ?? '', /IMO.*2025.*32|32.*IMO.*2025/isu);
    assert.match(nodes.get('judge_bracket')?.label ?? '', /judge.*bracket|裁判.*淘汰|模型裁判.*对阵/iu);
    assert.match(nodes.get('imo_human')?.label ?? '', /2.*human|2.*人工|两名.*人工/iu);
    for (const edge of [
      'route->ordinary_answers:primary',
      'route->project_euler:primary',
      'route->ordinary_proofs:primary',
      'route->imo_samples:primary',
      'imo_samples->judge_bracket:primary',
      'judge_bracket->selected_proof:primary',
      'selected_proof->imo_human:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
  }
  assert.match(readDetail('AIME').drawio_review_note, /site ID AIME.*MathArena|站点 ID AIME.*MathArena/iu);
});

test('keeps AIME-24 official packaging separate from optional downstream scoring conventions', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIME-24', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('forms')?.label ?? '', language === 'zh' ? /两场互为替代的考试安排/u : /alternate.*administrations/iu);
    assert.match(nodes.get('format')?.label ?? '', /15.*3.*000.*999/isu);
    assert.match(nodes.get('package')?.label ?? '', /train.*30|30.*train/iu);
    assert.match(nodes.get('fields')?.label ?? '', /id.*problem.*solution.*answer.*url.*year/isu);
    assert.match(nodes.get('optional_harness')?.label ?? '', /(?:boxed|方框).*Avg@k.*Mean@k|(?:boxed|方框).*Avg.*Mean/isu);
    assert.ok(edges.has('package->fields:primary'));
    assert.ok(edges.has('fields->optional_harness:optional'));
  }
});

test('keeps AIME-25 I and II as independent test configs and makes union optional', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIME-25', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('form_i')?.label ?? '', /I.*15|15.*I/isu);
    assert.match(nodes.get('form_ii')?.label ?? '', /II.*15|15.*II/isu);
    assert.match(nodes.get('config_i')?.label ?? '', /test/iu);
    assert.match(nodes.get('config_ii')?.label ?? '', /test/iu);
    assert.match(nodes.get('optional_union')?.label ?? '', /optional.*30|可选.*30/iu);
    assert.ok(edges.has('form_i->config_i:primary'));
    assert.ok(edges.has('form_ii->config_ii:primary'));
    assert.ok(edges.has('config_i->release:primary'));
    assert.ok(edges.has('config_ii->release:primary'));
    assert.ok(edges.has('config_i->optional_union:optional'));
    assert.ok(edges.has('config_ii->optional_union:optional'));
    assert.ok(edges.has('optional_union->optional_harness:optional'));
  }
});

test('records AIRS-Bench search, allocation, validation, run, and fitted-rating details', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIRS-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('bands')?.label ?? '', /4.*25|四.*25/isu);
    assert.match(nodes.get('allocations')?.label ?? '', /4.*alloc|4.*分配/iu);
    assert.match(nodes.get('search')?.label ?? '', /10,?000.*12|12.*10,?000/isu);
    assert.match(nodes.get('final_selection')?.label ?? '', /4.*7.*5.*4.*4e-3/isu);
    assert.match(nodes.get('package')?.label ?? '', /20.*17.*16.*7/isu);
    assert.match(nodes.get('validation')?.label ?? '', /\.02.*CI.*rank|\.02.*置信.*排名/isu);
    assert.match(nodes.get('agent')?.label ?? '', /24.*H200.*10.*seed|24.*H200.*10.*种子/isu);
    assert.match(nodes.get('rating')?.label ?? '', /Bradley.?Terry|\bBT\b/iu);
    assert.match(nodes.get('rating')?.label ?? '', /Elo/iu);
    for (const edge of [
      'candidates->bands:primary',
      'bands->allocations:primary',
      'allocations->search:primary',
      'search->final_selection:primary',
      'final_selection->validation:primary',
      'validation->package:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
  }
});

test('keeps AInsteinBench historical and synthetic construction lanes separate until release', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AInsteinBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    const required = [
      'repositories->pr_crawl:primary',
      'pr_crawl->pr_filter:primary',
      'pr_filter->historical_env:primary',
      'historical_env->f2p:primary',
      'f2p->feature_pr_api:primary',
      'feature_pr_api->historical_expert:primary',
      'repositories->module_selection:primary',
      'module_selection->ablation_prompt:primary',
      'ablation_prompt->synthetic_tests:primary',
      'synthetic_tests->reconstructed_verify:primary',
      'reconstructed_verify->synthetic_expert:primary',
      'historical_expert->release:primary',
      'synthetic_expert->release:primary',
    ];
    for (const edge of required) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.match(nodes.get('feature_pr_api')?.label ?? '', /fix patch|修复补丁/iu);
    assert.match(nodes.get('feature_pr_api')?.label ?? '', /test-used|测试使用/iu);
    assert.match(nodes.get('synthetic_tests')?.label ?? '', /simulation.*parameter.*output|仿真.*参数.*输出/isu);
    for (const nodeId of ['historical_expert', 'synthetic_expert']) {
      const label = nodes.get(nodeId)?.label ?? '';
      assert.match(label, /under(?:-?\s*\/\s*over)?-?coverage|覆盖不足/iu, `${language} ${nodeId} undercoverage`);
      assert.match(label, /overcoverage|over-coverage|过度覆盖/iu, `${language} ${nodeId} overcoverage`);
      assert.match(label, /false positive|假阳性/iu, `${language} ${nodeId} false positives`);
      assert.match(label, /false negative|假阴性/iu, `${language} ${nodeId} false negatives`);
    }
    assert.match(nodes.get('release')?.label ?? '', /244.*6|6.*244/isu);
  }
});

test('pins every A1b primary source version, source revision, and locator', () => {
  const expected = {
    AIGCBench: ['https://arxiv.org/abs/2401.01651v3', /§3.*§5\.3.*cc230c8474fdd1af8a7a0749981aa1d09198eaf3/isu],
    AIME: ['https://arxiv.org/abs/2505.23281v3', /§3\.1.*§3\.4.*§4\.3.*Appendix C.*Appendix D.*a11194deff8c67a232974a383795e8a2776b4c6f/isu],
    'AIME-24': ['', /MAA.*HuggingFaceH4\/aime_2024.*2fe88a2f1091d5048c0f36abc874fb997b3dd99a.*AI-MO/isu],
    'AIME-25': ['', /MAA.*opencompass\/AIME2025.*a6ad95f611d72cf628a80b58bd0432ef6638f958/isu],
    'AIRS-Bench': ['https://arxiv.org/abs/2602.06855v3', /§4.*§5.*Appendix A.*18e4f1d501069cf7d7e2740d81c2ca748c56a6a1/isu],
    AInsteinBench: ['https://arxiv.org/abs/2512.21373v1', /§3\.1.*§3\.5.*§4.*Appendix A.*d9b1383e86c2ae43dcb3ddbcaf34c21ceb786cca/isu],
  };
  for (const [id, [paper, notePattern]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paper, `${id} paper version`);
    if (paper) assert.equal(detail.arxiv_pdf_url, paper.replace('/abs/', '/pdf/'));
    assert.match(detail.drawio_review_note, notePattern, `${id} source and locator`);
  }
});

test('publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const { width, height } = pngDimensions(`${base}.png`);
      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /math="0"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\//u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(|color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
      if (id === 'AIME-24') {
        assert.doesNotMatch(drawio, /\\\(|\\\)/u, `${id}.${language}.drawio literal math delimiters`);
        assert.doesNotMatch(svg, /\\\(|\\\)/u, `${id}.${language}.svg literal math delimiters`);
      }
      assert.ok(width >= 800 && height >= 200, `${id}.${language}.png dimensions`);
    }
  }
});
