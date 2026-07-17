import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const e2eDrawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI;
const assetNormalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const benchmarkIds = [
  'EHRSQL',
  'FRAMES',
  'GSM8K',
  'GaRAGe',
  'HELMET',
  'HealthBench',
  'HumanEval',
  'InfiniteBench',
];

const paperContracts = {
  EHRSQL: {
    paper: 'https://arxiv.org/abs/2301.07695v6',
    pdf: 'https://arxiv.org/pdf/2301.07695v6',
    note: /Section 3\.1\.1.*Section 3\.3.*Section 4\.1.*Table 4.*v1\.5\.0/isu,
  },
  FRAMES: {
    paper: 'https://arxiv.org/abs/2409.12941v3',
    pdf: 'https://arxiv.org/pdf/2409.12941v3',
    note: /Section 2.*Appendix Figures 5 and 7.*Table 2.*test\.tsv/isu,
  },
  GSM8K: {
    paper: 'https://arxiv.org/abs/2110.14168v2',
    pdf: 'https://arxiv.org/pdf/2110.14168v2',
    note: /Section 2.*Appendix A.*train\.jsonl.*test\.jsonl/isu,
  },
  GaRAGe: {
    paper: 'https://arxiv.org/abs/2506.07671v1',
    pdf: 'https://arxiv.org/pdf/2506.07671v1',
    note: /Sections 2\.1-2\.3.*Figure 2.*Appendices B\.5-B\.6/isu,
  },
  HELMET: {
    paper: 'https://arxiv.org/abs/2410.02694v3',
    pdf: 'https://arxiv.org/pdf/2410.02694v3',
    note: /Section 2.*Table 3.*Appendices B, D, and E\.1/isu,
  },
  HealthBench: {
    paper: 'https://arxiv.org/abs/2505.08775v1',
    pdf: 'https://arxiv.org/pdf/2505.08775v1',
    note: /Sections 3-4.*Appendices B and E.*Table 3/isu,
  },
  HumanEval: {
    paper: 'https://arxiv.org/abs/2107.03374v2',
    pdf: 'https://arxiv.org/pdf/2107.03374v2',
    note: /Sections 2\.2 and 3\.2.*Figure 2/isu,
  },
  InfiniteBench: {
    paper: 'https://arxiv.org/abs/2402.13718v3',
    pdf: 'https://arxiv.org/pdf/2402.13718v3',
    note: /ACL 2024\.acl-long\.814.*Sections 3\.1-3\.2.*Table 2.*Appendix D.*51d9b37.*90f0394/isu,
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language) {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readSpec(id, language) {
  return readFileSync(
    join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
    'utf8',
  );
}

function nodeMap(arch) {
  return new Map(arch.nodes.map(node => [node.id, node]));
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to, type }) => `${from}->${to}:${type}`));
}

function assertEdges(edges, language, expected) {
  for (const edge of expected) {
    assert.ok(edges.has(edge), `${language} missing ${edge}`);
  }
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('keeps all eight reviewed diagrams bilingual and topologically identical', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

test('locks the EHRSQL poll, template split, release counts, and bypass semantics', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('EHRSQL', language);
    const arch = readArch('EHRSQL', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    for (const [nodeId, pattern] of [
      ['poll', /222/u],
      ['templates', /230/u],
      ['answerable', /174/u],
      ['unanswerable', /56/u],
      ['release_total', /24,405/u],
    ]) {
      assert.match(nodes.get(nodeId)?.label ?? '', pattern, `${language} ${nodeId}`);
    }
    assert.match(spec, /v1\.5\.0/u);
    assert.match(spec, language === 'en' ? /Section 3/u : /第 3 节/u);
    assertEdges(edges, language, [
      'poll->utterances:primary',
      'filter_merge->templates:primary',
      'templates->answerable:primary',
      'templates->unanswerable:primary',
      'paraphrase_generation->paraphrase_qc:primary',
      'paraphrase_qc->answerable_merge:primary',
      'answerable_merge->fill_values:primary',
      'fill_values->execution_filter:primary',
      'execution_filter->release_total:primary',
      'unanswerable->unanswerable_package:primary',
      'unanswerable_package->release_total:primary',
    ]);
    assert.equal(edges.has('unanswerable->execution_filter:primary'), false);
  }
});

test('locks the FRAMES rejected pilot and parallel human quality gates', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('FRAMES', language);
    const nodes = nodeMap(readArch('FRAMES', language));
    const edges = edgeSet(readArch('FRAMES', language));
    assert.match(spec, language === 'en' ? /Section 2.*appendix/isu : /第 2 节与附录/u);
    assert.match(nodes.get('synthetic_pilot')?.label ?? '', /Gemini/iu);
    assert.match(nodes.get('pilot_limits')?.label ?? '', /reject|未达标/iu);
    assert.match(nodes.get('reasoning_tags')?.label ?? '', /5|五/u);
    assert.match(nodes.get('delayed_recheck')?.label ?? '', /3|三/u);
    assert.match(nodes.get('final_set')?.label ?? '', /824/u);
    assertEdges(edges, language, [
      'synthetic_pilot->pilot_limits:primary',
      'pilot_limits->human_instruction:primary',
      'human_instruction->expert_authoring:primary',
      'expert_authoring->record_fields:primary',
      'reasoning_tags->delayed_recheck:primary',
      'reasoning_tags->quality_controls:primary',
      'delayed_recheck->final_set:primary',
      'quality_controls->final_set:primary',
    ]);
  }
});

test('locks GSM8K human scale-up, optional GPT-3 seeds, and two agreement checks', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('GSM8K', language);
    const nodes = nodeMap(readArch('GSM8K', language));
    const edges = edgeSet(readArch('GSM8K', language));
    assert.match(spec, /v2/u);
    assert.match(spec, language === 'en' ? /Section 2 and Appendix A/u : /第 2 节与附录 A/u);
    assert.match(nodes.get('collection')?.label ?? '', /Upwork.*1K.*Surge/isu);
    assert.match(nodes.get('seed_assist')?.label ?? '', /175B GPT-3/u);
    assert.match(nodes.get('release')?.label ?? '', /7,473.*1,319/su);
    assertEdges(edges, language, [
      'collection->authoring:primary',
      'seed_assist->authoring:primary',
      'authoring->resolve:primary',
      'resolve->agreement:primary',
      'agreement->recheck:primary',
      'recheck->release:primary',
    ]);
  }
});

test('locks the GaRAGe search, grounding annotation, and answer-validation chain', () => {
  const chain = [
    'seed_topics->search_plan:primary',
    'search_plan->question_search:primary',
    'question_search->question_generation:primary',
    'question_generation->question_filtering:primary',
    'question_filtering->query_decomposition:primary',
    'query_decomposition->passage_retrieval:primary',
    'passage_retrieval->grounding_selection:primary',
    'grounding_selection->question_annotation:primary',
    'question_annotation->grounding_annotation:primary',
    'grounding_annotation->answer_writing:primary',
    'answer_writing->answer_validation:primary',
    'answer_validation->release:primary',
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('GaRAGe', language);
    const arch = readArch('GaRAGe', language);
    assert.match(spec, /(?:Section|第)\s*2/iu);
    assert.match(spec, /Figure\s+2/u);
    assert.match(nodeMap(arch).get('release')?.label ?? '', /2,366/u);
    assertEdges(edgeSet(arch), language, chain);
  }
});

test('locks HELMET four assembly branches and protocol packaging after 21 tasks', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HELMET', language);
    const arch = readArch('HELMET', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(spec, language === 'en' ? /seven long-context categories/iu : /七类长上下文任务/u);
    assert.match(nodes.get('recall')?.label ?? '', /4|四/u);
    assert.match(nodes.get('suite')?.label ?? '', /7.*21/su);
    assertEdges(edges, language, [
      'sources->assemble:primary',
      'sources->adapt:primary',
      'assemble->retrieval:primary',
      'assemble->recall:primary',
      'adapt->icl:primary',
      'adapt->longdoc:primary',
      'retrieval->suite:primary',
      'recall->suite:primary',
      'icl->suite:primary',
      'longdoc->suite:primary',
      'suite->length:primary',
      'length->prompt:primary',
      'prompt->metrics:primary',
      'metrics->release:primary',
    ]);
  }
});

test('locks HealthBench physician counts, three sources, and rubric-consensus merge', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HealthBench', language);
    const arch = readArch('HealthBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(spec, language === 'en' ? /Sections\s+3-4/iu : /第 3-4 节/u);
    for (const [nodeId, pattern] of [
      ['applicants', /1,021/u],
      ['cohort', /262.*-31/su],
      ['source_streams', /3|三/u],
      ['filtering', /o1.*3|o1.*三/su],
      ['conversations', /5,000/u],
      ['consensus', />50%.*(?:≥2|至少2).*34/su],
      ['final', /48,562/u],
    ]) {
      assert.match(nodes.get(nodeId)?.label ?? '', pattern, `${language} ${nodeId}`);
    }
    assertEdges(edges, language, [
      'source_streams->filtering:primary',
      'filtering->conversations:primary',
      'conversations->rubrics:primary',
      'conversations->consensus:primary',
      'rubrics->final:primary',
      'consensus->final:primary',
    ]);
    assert.equal(edges.has('rubrics->consensus:primary'), false);
  }
});

test('locks HumanEval hand authoring and parallel visible-hidden task fields', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HumanEval', language);
    const arch = readArch('HumanEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(spec, /v2/u);
    assert.match(spec, language === 'en' ? /Sections 2\.2 and 3\.2/u : /第 2\.2 与 3\.2 节/u);
    assert.match(nodes.get('authoring')?.label ?? '', /Hand-written|手写原创/iu);
    assert.match(nodes.get('final')?.label ?? '', /164/u);
    assertEdges(edges, language, [
      'target->authoring:primary',
      'authoring->prompt:primary',
      'authoring->reference:primary',
      'prompt->final:primary',
      'reference->final:primary',
    ]);
    assert.equal(edges.has('prompt->reference:primary'), false);
  }
});

test('locks InfiniteBench four branches, 12-task merge, schema, and pinned release count', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('InfiniteBench', language);
    const arch = readArch('InfiniteBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(spec, /ACL 2024/u);
    assert.match(spec, language === 'en' ? /pinned official code and data commits/iu : /固定官方代码与数据提交/u);
    assert.match(nodes.get('novel_tasks')?.label ?? '', /4|四/u);
    assert.match(nodes.get('script_task')?.label ?? '', /En\.Dia/u);
    assert.match(nodes.get('code_task')?.label ?? '', /Code\.Debug/u);
    assert.match(nodes.get('synthetic_tasks')?.label ?? '', /6|六/u);
    assert.match(nodes.get('merge_tasks')?.label ?? '', /12/u);
    assert.match(nodes.get('release_schema')?.label ?? '', /5|五/u);
    assert.match(nodes.get('final_dataset')?.label ?? '', /3,946/u);
    assertEdges(edges, language, [
      'novel_tasks->merge_tasks:primary',
      'script_task->merge_tasks:primary',
      'code_task->merge_tasks:primary',
      'synthetic_tasks->merge_tasks:primary',
      'merge_tasks->release_schema:primary',
      'release_schema->final_dataset:primary',
      'final_dataset->hf_release:primary',
    ]);
  }
});

test('uses only the target language apart from benchmark proper nouns', () => {
  for (const id of benchmarkIds) {
    const enLabels = readArch(id, 'en').nodes.map(({ label }) => label).join('\n');
    const zhLabels = readArch(id, 'zh').nodes.map(({ label }) => label).join('\n');
    assert.doesNotMatch(enLabels, /\p{Script=Han}/u, `${id} English labels`);
    assert.match(zhLabels, /\p{Script=Han}/u, `${id} Chinese labels`);
  }
});

test('adds Chinese semantics around release and task-code proper nouns', () => {
  for (const [id, nodeId] of [
    ['HealthBench', 'final'],
    ['InfiniteBench', 'script_task'],
    ['InfiniteBench', 'code_task'],
  ]) {
    const node = readArch(id, 'zh').nodes.find(({ id: candidate }) => candidate === nodeId);
    assert.ok(node, `${id}.${nodeId} must exist`);
    assert.match(node.label, /\p{Script=Han}/u, `${id}.${nodeId} Chinese semantics`);
  }
  const healthBenchFinal = readArch('HealthBench', 'zh').nodes
    .find(({ id }) => id === 'final');
  assert.equal(
    healthBenchFinal.label,
    'HealthBench\n5,000 对话\n48,562 唯一标准',
    'HealthBench release label must stay compact enough for its terminal',
  );
  const infiniteBenchNodes = new Map(
    readArch('InfiniteBench', 'zh').nodes.map(node => [node.id, node]),
  );
  assert.equal(infiniteBenchNodes.get('script_task').label, 'En.Dia\n剧本对话');
  assert.equal(infiniteBenchNodes.get('code_task').label, 'Code.Debug\n代码调试');
});

test('pins every primary paper version and records visible source locators', () => {
  for (const [id, contract] of Object.entries(paperContracts)) {
    const detail = readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
    assert.equal(detail.paper_url, contract.paper, `${id} paper version`);
    assert.equal(detail.arxiv_pdf_url, contract.pdf, `${id} PDF version`);
    assert.match(detail.drawio_review_note, contract.note, `${id} source locators`);
  }
});

test('pins the PDF field that both Drawers actually prefer over arxiv_pdf_url', () => {
  const detail = readJson(join(publicDir, 'benchmarks_detail/EHRSQL.json'));
  const aggregate = readJson(join(publicDir, 'benchmarks.json'))
    .find(({ id }) => id === 'EHRSQL');
  assert.ok(aggregate, 'EHRSQL aggregate record');

  const expectedPaper = 'https://arxiv.org/abs/2301.07695v6';
  const expectedPdf = 'https://arxiv.org/pdf/2301.07695v6';
  for (const [source, record] of [['aggregate', aggregate], ['detail', detail]]) {
    assert.equal(record.paper_url, expectedPaper, `${source} paper URL`);
    assert.equal(record.arxiv_pdf_url, expectedPdf, `${source} arXiv PDF URL`);
    assert.equal(record.pdf_cdn_url, expectedPdf, `${source} preferred PDF URL`);
    assert.equal(
      record.pdf_cdn_url || record.arxiv_pdf_url,
      expectedPdf,
      `${source} Drawer-resolved PDF URL`,
    );
  }
  assert.deepEqual(
    [aggregate.paper_url, aggregate.arxiv_pdf_url, aggregate.pdf_cdn_url],
    [detail.paper_url, detail.arxiv_pdf_url, detail.pdf_cdn_url],
    'aggregate and detail EHRSQL source URLs',
  );

  for (const drawer of ['BenchmarkDrawer.tsx', 'BenchmarkDrawer.en.tsx']) {
    const source = readFileSync(join(root, 'client/src/components', drawer), 'utf8');
    assert.match(
      source,
      /b\??\.pdf_cdn_url\s*\|\|\s*b\??\.arxiv_pdf_url/u,
      `${drawer} PDF priority contract`,
    );
  }
});

test('publishes native-text fixed-light SVG and PNG pairs from native-text Draw.io', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const styles = [...drawio.matchAll(/ style="([^"]+)"/gu)]
        .map(match => match[1]);
      assert.ok(styles.length > 0, `${id}.${language}.drawio styled cells`);
      for (const style of styles) {
        assert.match(style, /(?:^|;)html=0(?:;|$)/u, `${id}.${language}.drawio html=0`);
        assert.match(
          style,
          /(?:^|;)convertToSvg=1(?:;|$)/u,
          `${id}.${language}.drawio convertToSvg=1`,
        );
      }
      const vertexStyles = [...drawio.matchAll(
        /<mxCell\b[^>]*\bstyle="([^"]+)"[^>]*\bvertex="1"/gu,
      )].map(match => match[1]);
      assert.ok(vertexStyles.length > 0, `${id}.${language}.drawio vertices`);
      for (const style of vertexStyles) {
        assert.match(
          style,
          /(?:^|;)whiteSpace=wrap(?:;|$)/u,
          `${id}.${language}.drawio vertex white-space contract`,
        );
      }
      assert.doesNotMatch(drawio, /math="1"/u, `${id}.${language}.drawio math=0`);

      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(svg, /<text(?:\s|>)/u, `${id}.${language}.svg native text`);
      assert.doesNotMatch(svg, /<foreignObject\b/u, `${id}.${language}.svg foreignObject`);
      assert.doesNotMatch(svg, /data:image\//u, `${id}.${language}.svg raster fallback`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg fallback warning`);
      assert.doesNotMatch(svg, /light-dark\s*\(/u, `${id}.${language}.svg adaptive color`);
      assert.doesNotMatch(svg, /prefers-color-scheme/u, `${id}.${language}.svg dark-mode media query`);
      assert.doesNotMatch(
        svg,
        /color-scheme:\s*light\s+dark/u,
        `${id}.${language}.svg adaptive color scheme`,
      );

      const dimensions = pngDimensions(readFileSync(`${base}.png`));
      assert.ok(dimensions.width > 0, `${id}.${language}.png width`);
      assert.ok(dimensions.height > 0, `${id}.${language}.png height`);
    }
  }
});

test('optionally rebuilds every spec through the portable formal chain without byte drift', {
  skip: e2eDrawioCli ? false : 'set IMPORTER_DRAWIO_E2E_CLI to opt in',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-importer-pass8-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(
          process.execPath,
          [e2eDrawioCli, `${base}.spec.yaml`, generated, '--validate', '--strict'],
          { stdio: 'pipe' },
        );
        execFileSync(process.execPath, [assetNormalizer, generated], { stdio: 'pipe' });
        const normalized = readFileSync(generated, 'utf8');
        assert.equal(normalized, readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
        execFileSync(process.execPath, [assetNormalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), normalized, `${id}.${language} idempotence`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps this scoped release test portable across workstations', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/Users\//u);
});
