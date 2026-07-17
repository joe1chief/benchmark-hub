import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'CURIE',
  'ChartEditBench',
  'CiteEval',
  'CodeSimpleQA',
  'DeepPlanning',
  'DeepResearchEval',
  'DeepSearchQA',
];

function readSpec(id, language) {
  return readFileSync(
    join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
    'utf8',
  );
}

function readDetail(id) {
  return JSON.parse(readFileSync(
    join(publicDir, 'benchmarks_detail', `${id}.json`),
    'utf8',
  ));
}

function extractTopology(spec) {
  const nodeSection = spec.match(/^nodes:\n([\s\S]*?)^edges:\n/mu)?.[1] ?? '';
  const edgeSection = spec.match(/^edges:\n([\s\S]*?)^modules:/mu)?.[1] ?? '';
  const nodes = [...nodeSection.matchAll(/^  - id: ([^\n]+)$/gmu)]
    .map(match => match[1]);
  const edges = [...edgeSection.matchAll(
    /^  - from: ([^\n]+)\n    to: ([^\n]+)\n    type: ([^\n]+)/gmu,
  )].map(([, from, to, type]) => `${from}->${to}:${type}`);
  return { nodes, edges };
}

function nodeBlock(spec, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - id: ${escapedId}\\n(?: {4,}[^\\n]*\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

function edgeBlock(spec, from, to) {
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedTo = to.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?:    [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

test('keeps all seven reviewed diagrams bilingual and topologically identical', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      extractTopology(readSpec(id, 'en')),
      extractTopology(readSpec(id, 'zh')),
      `${id} must keep identical EN/ZH node ids and typed edges`,
    );
  }
});

test('expands all eight CURIE source paths into task-specific ground truth', () => {
  const sourceNodes = [
    'dft_source',
    'mpv_source',
    'hfd_source',
    'hfe_source',
    'qecc_source',
    'geo_source',
    'biogr_source',
    'pdb_source',
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('CURIE', language);
    for (const source of sourceNodes) {
      assert.notEqual(nodeBlock(spec, source), '', `${language}: missing ${source}`);
    }
    assert.match(
      edgeBlock(spec, 'source_paths', 'task_ground_truth'),
      /^    type: primary$/mu,
    );
    assert.match(nodeBlock(spec, 'dft_source'), /74.*75|74.*一处写 75/iu);
    assert.match(nodeBlock(spec, 'official_package'), /578.*580/iu);
  }
});

test('keeps ChartEditBench VQAs as a side asset of each rendered chart', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('ChartEditBench', language);
    assert.match(edgeBlock(spec, 'five_done', 'edit_chains'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'edit_chains', 'final_dataset'), /^    type: primary$/mu);
    assert.equal(edgeBlock(spec, 'five_done', 'vqa_generation'), '');
    assert.equal(edgeBlock(spec, 'vqa_generation', 'edit_chains'), '');
    assert.match(
      edgeBlock(spec, 'initial_rendered', 'vqa_generation'),
      /^    type: optional$/mu,
    );
    assert.match(
      edgeBlock(spec, 'edit_rendered', 'vqa_generation'),
      /^    type: optional$/mu,
    );
    assert.match(nodeBlock(spec, 'vqa_generation'), /5 VQA|5 个 VQA/iu);
    assert.match(nodeBlock(spec, 'vqa_asset'), /derived.*30|推导.*30/iu);
    assert.match(nodeBlock(spec, 'vqa_asset'), /total unknown|总量未知/iu);
  }
});

test('models CiteEval preprocessing before three full-response blind passes', () => {
  const chain = [
    ['responses', 'remove_thinking'],
    ['remove_thinking', 'sentence_split'],
    ['sentence_split', 'citation_indices'],
    ['citation_indices', 'valid_indices'],
    ['valid_indices', 'blind_passes'],
    ['blind_passes', 'statements'],
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('CiteEval', language);
    for (const [from, to] of chain) {
      assert.match(edgeBlock(spec, from, to), /^    type: primary$/mu);
    }
    assert.match(nodeBlock(spec, 'sentence_split'), /NLTK 3\.8\.1/u);
    assert.match(nodeBlock(spec, 'citation_indices'), /regex|正则/iu);
    assert.match(nodeBlock(spec, 'valid_indices'), /valid.*passage|有效.*段落/iu);
    assert.match(
      nodeBlock(spec, 'blind_passes'),
      /3.*(?:response|完整响应)|(?:response|完整响应).*3/iu,
    );
    assert.match(nodeBlock(spec, 'statements'), /full context|完整上下文/iu);
  }
});

test('shows both CodeSimpleQA totals and the bilingual reviewer threshold', () => {
  const en = readSpec('CodeSimpleQA', 'en');
  const zh = readSpec('CodeSimpleQA', 'zh');

  assert.match(
    nodeBlock(en, 'final'),
    /1,478 \(§2\) \/\s+1,498 \(Abstract & Table 2\)/u,
  );
  assert.match(
    nodeBlock(zh, 'final'),
    /1,478（§2）\/\s+1,498（摘要与表 2）/u,
  );
  assert.match(nodeBlock(en, 'review'), /3\+ reviewer consensus/iu);
  assert.match(nodeBlock(zh, 'review'), /至少 3 位复核者共识/u);
  assert.match(
    nodeBlock(en, 'senior_conflict'),
    /Senior reviewer count conflict · 3\/4/u,
  );
  assert.match(
    nodeBlock(zh, 'senior_conflict'),
    /高级工程师人数冲突 · 3\/4/u,
  );
});

test('keeps DeepPlanning unique-optimum adjustment before verbalization and 360 cases', () => {
  const orderedEdges = [
    ['environment', 'unique'],
    ['unique', 'verbalize'],
    ['verbalize', 'review'],
    ['review', 'final'],
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('DeepPlanning', language);
    for (const [from, to] of orderedEdges) {
      assert.match(edgeBlock(spec, from, to), /^    type: primary$/mu);
    }
    assert.match(nodeBlock(spec, 'unique'), /one optimum|唯一最优解/iu);
    assert.match(nodeBlock(spec, 'final'), /360.*language cases|360.*语言实例/iu);
  }
});

test('keeps DeepResearchEval 200 to 155 to 100 without an 80-percent filter edge', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('DeepResearchEval', language);
    assert.match(nodeBlock(spec, 'candidates'), /200/u);
    assert.match(nodeBlock(spec, 'retained'), /155/u);
    assert.match(nodeBlock(spec, 'selection'), /100/u);
    assert.match(nodeBlock(spec, 'final'), /100/u);
    assert.match(edgeBlock(spec, 'search_needed', 'retained'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'retained', 'expert_rank'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'expert_rank', 'selection'), /^    type: primary$/mu);
    assert.doesNotMatch(
      spec.match(/^edges:\n([\s\S]*?)^modules:/mu)?.[1] ?? '',
      /80%|four[- ]vote|四票/iu,
    );
  }
});

test('keeps Chinese CiteEval and DeepResearchEval labels localized', () => {
  const citeEvalZh = readSpec('CiteEval', 'zh');
  assert.match(nodeBlock(citeEvalZh, 'full_split'), /全量开发集 948 \/ 测试集 3,000/u);
  assert.match(nodeBlock(citeEvalZh, 'sample'), /从开发集抽样 300 个/u);
  assert.match(nodeBlock(citeEvalZh, 'retrieval_annotations'), /检索 · 编辑 \+ 3 次评分/u);
  assert.match(nodeBlock(citeEvalZh, 'metric_split'), /指标开发集 200 \/ 测试集 1,000/u);
  assert.match(edgeBlock(citeEvalZh, 'context_vote', 'retrieval_annotations'), /label: 检索/u);
  assert.match(edgeBlock(citeEvalZh, 'context_vote', 'na'), /用户知识 \/ 响应知识 \/ 参数知识/u);

  assert.match(
    nodeBlock(readSpec('DeepResearchEval', 'zh'), 'persona_model'),
    /人设生成模型 · GPT-5-mini/u,
  );
});

test('splits every DeepSearchQA discrepancy outcome explicitly', () => {
  const expected = [
    ['comparison', 'retain_curator_gt', /No discrepancy|无差异/iu],
    ['comparison', 'resolution_class', /Discrepancy|有差异/iu],
    ['resolution_class', 'update_gt', /GT update|更新真值/iu],
    ['resolution_class', 'keep_gt', /Reviewer incorrect|复核者错误/iu],
    ['resolution_class', 'ambiguity_filter', /Ambiguous|有歧义/iu],
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('DeepSearchQA', language);
    for (const [from, to, label] of expected) {
      assert.match(edgeBlock(spec, from, to), label, `${language}: ${from}->${to}`);
    }
    assert.match(nodeBlock(spec, 'final_dataset'), /900.*17.*584.*316/isu);
    assert.equal(nodeBlock(spec, 'answer_repair'), '');
  }
});

test('pins primary papers and official code or data snapshots', () => {
  const expected = {
    CURIE: {
      paper: 'https://arxiv.org/abs/2503.13517v2',
      pdf: 'https://arxiv.org/pdf/2503.13517v2',
      note: /§3.*Table 3.*Appendix F.*f3afe026fd7b7706d9764a8f12e86f7a5a02645e/isu,
    },
    ChartEditBench: {
      paper: 'https://arxiv.org/abs/2602.15758v1',
      pdf: 'https://arxiv.org/pdf/2602.15758v1',
      note: /§3\.2\.1.*§3\.5/isu,
    },
    CiteEval: {
      paper: 'https://arxiv.org/abs/2506.01829v1',
      pdf: 'https://arxiv.org/pdf/2506.01829v1',
      note: /§3\.1.*§3\.2.*Appendix C\.2.*88f567d244a73607fe1feebdb821f17d96acf796/isu,
    },
    CodeSimpleQA: {
      paper: 'https://arxiv.org/abs/2512.19424v1',
      pdf: 'https://arxiv.org/pdf/2512.19424v1',
      note: /no official (?:repository|repo).*no official data revision.*1,498.*1,478.*3.*4/isu,
    },
    DeepPlanning: {
      paper: 'https://arxiv.org/abs/2601.18137v1',
      pdf: 'https://arxiv.org/pdf/2601.18137v1',
      note: /31a4d36d123688581a9e9744427272b33ce940e0.*213876cce679f993a476d01042e13d111c0e3648/isu,
    },
    DeepResearchEval: {
      paper: 'https://arxiv.org/abs/2601.09688v1',
      pdf: 'https://arxiv.org/pdf/2601.09688v1',
      note: /340fad03c27cb7b5d3ecdce5ed412a241a4f400f.*81574b8119781e818bbc6b98c75b47884b4b3324.*80%.*not a hard gate/isu,
    },
    DeepSearchQA: {
      paper: 'https://arxiv.org/abs/2601.20975v1',
      pdf: 'https://arxiv.org/pdf/2601.20975v1',
      note: /§2.*b2623f8653065c2672de6d941fc5434cd652376c/isu,
    },
  };
  for (const [id, contract] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, contract.paper);
    assert.equal(detail.arxiv_pdf_url, contract.pdf);
    assert.match(detail.drawio_review_note, contract.note);
  }
});

test('publishes all seven diagrams as fixed-light native-text SVG and PNG pairs', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const png = readFileSync(`${base}.png`);

      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.doesNotMatch(
        drawio,
        /<mxCell\b[^>]*\bvalue="[^"]+"[^>]*\bedge="1"/u,
        `${id}.${language}.drawio must render each edge label only through its label cell`,
      );
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u);
      assert.doesNotMatch(svg, /light-dark\s*\(/u);
      assert.doesNotMatch(svg, /color-scheme:\s*light\s+dark/u);
      assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
    }
  }
});
