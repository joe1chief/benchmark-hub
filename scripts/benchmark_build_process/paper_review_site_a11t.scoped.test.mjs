import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';
import { parse as parseYaml } from 'yaml';
import { assertPngFidelity } from './assert_png_fidelity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['MedExQA', 'MedHELM', 'MedHallu', 'MedMCQA', 'MedNLI', 'MedQA'];
const expectedCounts = new Map([
  ['MedExQA', { nodes: 26, edges: 29 }],
  ['MedHELM', { nodes: 30, edges: 34 }],
  ['MedHallu', { nodes: 30, edges: 33 }],
  ['MedMCQA', { nodes: 30, edges: 31 }],
  ['MedNLI', { nodes: 29, edges: 28 }],
  ['MedQA', { nodes: 30, edges: 33 }],
]);
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const svgNormalizer = join(root, 'scripts/benchmark_build_process/normalize_drawio_svg.mjs');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readSpec = (id, language = 'en') => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const catalog = new Map(readJson(join(publicDir, 'benchmarks.json')).map(item => [item.id, item]));

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function topology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type }) => ({ id, type })),
    edges: graph.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: (graph.modules ?? []).map(({ id, position, size }) => ({ id, position, size })),
  };
}

function canonicalGraph(graph) {
  return {
    nodes: graph.nodes.map(({ id, label, type, size }) => ({ id, label, type, size })),
    edges: graph.edges.map(({ from, to, type, label }) => {
      const edge = { from, to, type };
      if (label !== undefined) edge.label = label;
      return edge;
    }),
    modules: graph.modules ?? [],
  };
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function mermaidEdgeLabel(label) {
  return mermaidLabel(label).replace(/\|/gu, '&#124;');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
    const label = String(edge.label ?? '').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${mermaidEdgeLabel(label)}|` : '-->')
      : (label ? `-. ${mermaidEdgeLabel(label)} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`, 'u'))?.[1] ?? '';
}

function decodeXml(value) {
  return String(value)
    .replace(/&#xa;/giu, '\n')
    .replace(/&#10;/gu, '\n')
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

const normalizedLabel = value => decodeXml(value).replace(/\s+/gu, ' ').trim();

function drawioCells(xml) {
  const tags = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
  const childEdgeLabels = tags.filter(tag => readAttribute(tag, 'style').split(';').includes('edgeLabel'));
  return {
    nodes: tags.filter(tag => (
      readAttribute(tag, 'vertex') === '1'
      && !readAttribute(tag, 'style').split(';').includes('edgeLabel')
    )),
    edges: tags.filter(tag => readAttribute(tag, 'edge') === '1'),
    childEdgeLabels,
  };
}

function formalGraph(xml, arch, context) {
  const cells = drawioCells(xml);
  assert.equal(cells.nodes.length, arch.nodes.length, `${context} Draw.io node count`);
  assert.equal(cells.edges.length, arch.edges.length, `${context} Draw.io edge count`);
  assert.deepEqual(
    cells.nodes.map(tag => normalizedLabel(readAttribute(tag, 'value'))),
    arch.nodes.map(node => normalizedLabel(node.label)),
    `${context} Draw.io node order and labels`,
  );
  const cellIdToNodeId = new Map(
    cells.nodes.map((tag, index) => [readAttribute(tag, 'id'), arch.nodes[index].id]),
  );
  return {
    cells,
    edges: cells.edges.map(tag => ({
      from: cellIdToNodeId.get(readAttribute(tag, 'source')),
      to: cellIdToNodeId.get(readAttribute(tag, 'target')),
      label: normalizedLabel(readAttribute(tag, 'value')),
    })),
  };
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('keeps all six A11t packages bilingual, geometric, language-pure, and explicit', () => {
  for (const id of benchmarkIds) {
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual geometry`);
    assert.equal(en.nodes.length, expectedCounts.get(id).nodes, `${id}.en nodes`);
    assert.equal(en.edges.length, expectedCounts.get(id).edges, `${id}.en edges`);
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u, `${id}.en language`);
    assert.ok(zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))), `${id}.zh semantics`);
    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.equal(new Set(spec.nodes.map(node => node.id)).size, spec.nodes.length, `${id}.${language} IDs`);
      for (const edge of spec.edges) {
        const label = String(edge.label ?? '').trim();
        if (label && language === 'en') assert.doesNotMatch(label, /[\u3400-\u9fff]/u);
        if (label && language === 'zh') assert.match(label, /[\u3400-\u9fff]/u);
      }
      for (const decision of spec.nodes.filter(node => node.type === 'decision')) {
        const outgoing = spec.edges.filter(edge => edge.from === decision.id);
        assert.ok(outgoing.length >= 2, `${id}.${language}.${decision.id} outcomes`);
        assert.ok(outgoing.every(edge => String(edge.label ?? '').trim()), `${id}.${language}.${decision.id} labels`);
        assert.ok(new Set(outgoing.map(edge => edge.label)).size >= 2, `${id}.${language}.${decision.id} semantics`);
        assert.ok(new Set(outgoing.map(edge => edge.to)).size >= 2, `${id}.${language}.${decision.id} targets`);
      }
      for (const node of spec.nodes) {
        assert.ok(!Object.hasOwn(node, 'fontSize'), `${id}.${language}.${node.id} ignored fontSize`);
        const fontSize = node.style?.fontSize;
        assert.ok(fontSize === undefined || (fontSize >= 8 && fontSize <= 10), `${id}.${language}.${node.id} fontSize`);
      }
    }
    assert.ok(readDetail(id).drawio_review_note.length >= 1_500, `${id} review evidence`);
  }
});

test('locks MedExQA corpus, split, evaluation arms, parser, and human review', () => {
  const graph = readSpec('MedExQA');
  assert.match(nodeLabel(graph, 'corpus'), /965 English MCQs.*148.*377.*111.*194.*135/isu);
  assert.match(nodeLabel(graph, 'split'), /Development: 5 Each = 25.*Test: 143 \+ 372 \+ 106 \+ 189 \+ 130 = 940/isu);
  assert.match(nodeLabel(graph, 'release_rights'), /CC BY-NC-SA 4\.0.*Noncommercial.*Research Use/isu);
  assert.match(nodeLabel(graph, 'evaluation_arm'), /Next-Token Classification.*Chat Answer \+ Explanation/isu);
  assert.match(nodeLabel(graph, 'chat_parser'), /Regex Answer Patterns.*thefuzz Fallback.*No Abstain State/isu);
  assert.match(nodeLabel(graph, 'explanation_zero'), /All Explanation Metrics to Zero.*Answer Is Wrong/isu);
  assert.match(nodeLabel(graph, 'human_evaluation'), /25 Dev Items.*Three Health MSc Annotators.*0\.5.*1:/isu);
});

test('locks MedHELM taxonomy, access split, jury denominator, and clinician validation', () => {
  const graph = readSpec('MedHELM');
  assert.match(nodeLabel(graph, 'draft_taxonomy'), /Five Categories.*21 Subcategories.*98 Candidate Tasks/isu);
  assert.match(nodeLabel(graph, 'clinicians'), /29 Clinicians.*14 Specialties.*Four Institutions/isu);
  assert.match(nodeLabel(graph, 'refine'), /96\.7%.*4\.21 of 5.*107 Comments/isu);
  assert.match(nodeLabel(graph, 'final_taxonomy'), /Five Categories.*22 Subcategories.*121 Medical Tasks/isu);
  assert.match(nodeLabel(graph, 'suite'), /35-Benchmark Suite.*13 Open-Ended.*22 Closed-Ended.*14 Public.*7 Gated.*14 Private/isu);
  assert.match(nodeLabel(graph, 'jury_score'), /int\(score\).*Failed Juror Removes All Three.*3 Jurors × 3 Axes/isu);
  assert.match(nodeLabel(graph, 'jury_failure'), /No Successful Juror → 0.*Bad JSON.*Drops the Whole Juror/isu);
  assert.match(nodeLabel(graph, 'clinician_validation'), /ACI-Bench 31.*MEDIQA-QA 25.*20 Clinicians.*ICC/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Equal Macro over 35.*Half-Credit Ties.*Available Pairs Only/isu);
});

test('locks MedHallu paper conflicts, retry topology, runner drift, and abstention parsing', () => {
  const graph = readSpec('MedHallu');
  assert.match(nodeLabel(graph, 'source_mix'), /10,000.*1,000 Expert.*9,000 Random/isu);
  assert.match(nodeLabel(graph, 'categories'), /Four Hallucination Types.*Misinterpretation.*Fabrication/isu);
  assert.match(nodeLabel(graph, 'quality'), /Figure 2\/S4 ≥1.*S3 Majority/isu);
  assert.match(nodeLabel(graph, 'correctness'), /RoBERTa.*Threshold Unreported.*DeBERTa.*\.75.*Llama-3\.1/isu);
  assert.ok(graph.edges.some(edge => edge.from === 'attempt_gate' && edge.to === 'generate'), 'fresh candidate retry');
  assert.match(nodeLabel(graph, 'fallback'), /Maximum Cosine Similarity.*Gold Answer.*Easy/isu);
  assert.match(nodeLabel(graph, 'repo_build_drift'), /First 9,000 Artificial.*T \.8.*Up to 10 Candidates.*No Seed/isu);
  assert.match(nodeLabel(graph, 'repo_pair'), /Unseeded Random Choice.*Gold Answer or Hallucinated Answer/isu);
  assert.match(nodeLabel(graph, 'repo_parser'), /1 \/ not \/ non.*not sure.*Therefore → Class 1/isu);
  assert.match(nodeLabel(graph, 'repo_scored'), /Exclude Class 2.*Tier Denominators/isu);
});

test('locks MedMCQA released totals, split ambiguity, paper reader, and blind submission', () => {
  const graph = readSpec('MedMCQA');
  assert.match(nodeLabel(graph, 'dedupe'), /193,155.*21 Subjects.*2,400 Topics/isu);
  assert.match(nodeLabel(graph, 'exam_split'), /182,822.*4,183.*6,150.*193,155.*>194K.*Swap Dev\/Test/isu);
  assert.match(nodeLabel(graph, 'release'), /Public Test Omits cop \+ exp.*Ground Truth Remains Private/isu);
  assert.match(nodeLabel(graph, 'construction_gap'), /No Build \/ Dedup \/ Split Scripts.*Sampling \/ Adjudication Unreported/isu);
  assert.match(nodeLabel(graph, 'repo_eval_drift'), /Archive JSONL ≠ Code CSV.*No Adapter.*min val_loss ≠ Highest Score/isu);
  assert.match(nodeLabel(graph, 'retriever'), /DPR \+ Wikipedia.*PubMedBERT \+ PubMed.*250 Tokens/isu);
  assert.match(nodeLabel(graph, 'reader'), /Four Sequences.*No Generative Prompt \/ Parser/isu);
  assert.match(nodeLabel(graph, 'submission'), /id \+ Prediction.*Integers 1–4.*Google Form/isu);
  assert.match(nodeLabel(graph, 'external_score'), /Private-gold Test Accuracy.*Not Disclosed/isu);
});

test('locks MedNLI source versions, clinician construction, split, access, and six-seed score', () => {
  const graph = readSpec('MedNLI');
  assert.match(nodeLabel(graph, 'paper_source'), /MIMIC-III v1\.3.*38,597.*2,078,705/isu);
  assert.match(nodeLabel(graph, 'pilot'), /Two Board-certified Radiologists.*100 Unique Premises Each/isu);
  assert.match(nodeLabel(graph, 'discard'), /16 Premises Removed/isu);
  assert.match(nodeLabel(graph, 'cross_label'), /184 Premises.*552 Sentence Pairs/isu);
  assert.match(nodeLabel(graph, 'agreement'), /Kappa = 0\.78/isu);
  assert.match(nodeLabel(graph, 'single_annotation'), /No Multiple Labels per Pair/isu);
  assert.match(nodeLabel(graph, 'dataset'), /4,683 Premises.*14,049 Unique Sentence Pairs/isu);
  assert.match(nodeLabel(graph, 'split'), /11,232.*1,395.*1,422/isu);
  assert.match(nodeLabel(graph, 'version_boundary'), /Paper: MIMIC-III v1\.3.*PhysioNet Parent: MIMIC-III v1\.4/isu);
  assert.match(nodeLabel(graph, 'access_boundary'), /CITI Training.*Signed DUA.*Health Data License 1\.5\.0/isu);
  assert.match(nodeLabel(graph, 'unavailable'), /Test Labels Are Redacted.*No Test Accuracy/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Six Identical-hyperparameter Seeds.*Mean Accuracy/isu);
});

test('locks MedQA three-region splits, option transforms, corpora, diagnostics, and IR-only code', () => {
  const graph = readSpec('MedQA');
  assert.match(nodeLabel(graph, 'exams'), /USMLE.*MCMLE.*TWMLE/isu);
  assert.match(nodeLabel(graph, 'normalize_options'), /USMLE \+ MCMLE.*Shuffle.*Delete One Wrong Option/isu);
  assert.match(nodeLabel(graph, 'tw_options'), /Four Choices.*No Wrong-option Deletion/isu);
  assert.match(nodeLabel(graph, 'split'), /10,178 \/ 1,272 \/ 1,273.*27,400 \/ 3,425 \/ 3,426.*11,298 \/ 1,412 \/ 1,413/isu);
  assert.match(nodeLabel(graph, 'textbooks'), /18 English.*33 Simplified Chinese/isu);
  assert.match(nodeLabel(graph, 'corpus'), /231,581 Paragraphs.*116,216 Paragraphs/isu);
  assert.match(nodeLabel(graph, 'coverage'), /100 Dev Questions.*88%.*100%.*87%.*Not a Filter/isu);
  assert.match(nodeLabel(graph, 'retrieval_diagnostic'), /Top-25.*24 \/ 8 \/ 68.*75 \/ 21 \/ 4.*60 \/ 16\.7 \/ 23\.3.*Not Scored/isu);
  assert.match(nodeLabel(graph, 'ir_code'), /IR Baseline Only.*Elasticsearch 2\.4\.1/isu);
  assert.match(nodeLabel(graph, 'paper_results'), /36\.7%.*70\.1%.*42\.0%.*No Human Score or Composite/isu);
});

test('pins A11t primary pages, release boundaries, exact commits, and catalog fields', () => {
  const expected = new Map([
    ['MedExQA', { paper_url: 'https://arxiv.org/abs/2406.06331', arxiv_pdf_url: 'https://arxiv.org/pdf/2406.06331', homepage: 'https://github.com/knowlab/MedExQA', openness: 'public, noncommercial license', has_leaderboard: false }],
    ['MedHELM', { paper_url: 'https://arxiv.org/abs/2505.23802', arxiv_pdf_url: 'https://arxiv.org/pdf/2505.23802', homepage: 'https://crfm.stanford.edu/helm/medhelm/latest/', openness: 'partly public', has_leaderboard: true }],
    ['MedHallu', { paper_url: 'https://arxiv.org/abs/2502.14302v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2502.14302v1', homepage: 'https://medhallu.github.io', openness: 'public', has_leaderboard: false }],
    ['MedMCQA', { paper_url: 'https://arxiv.org/abs/2203.14371v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2203.14371v1', homepage: 'https://medmcqa.github.io/', openness: 'public', has_leaderboard: true }],
    ['MedNLI', { paper_url: 'https://arxiv.org/abs/1808.06752v2', arxiv_pdf_url: 'https://arxiv.org/pdf/1808.06752v2', homepage: 'https://jgc128.github.io/mednli/', openness: 'partly public', has_leaderboard: false }],
    ['MedQA', { paper_url: 'https://arxiv.org/abs/2009.13081v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2009.13081v1', homepage: 'https://github.com/jind11/MedQA', openness: 'partly public', has_leaderboard: false }],
  ]);
  const pins = new Map([
    ['MedExQA', /9a5b34af103b0c8ba0c00906e278f6572249fafa.*3a9f80d6de2c354956d7e86d323214b92d547d6e/isu],
    ['MedHELM', /2fcc2945005b9ae9f05d5dd382dabd3faa2de8f0/iu],
    ['MedHallu', /3c49c8ba80e47720333e508821967167ba048d49.*515060458a945c633debc6fd5baac7764416b724/isu],
    ['MedMCQA', /c59ef14ca1990266c4107c7864b45a20fd93e5e0.*16c1fbc6f47d548d2af7837b18e893aa45f45c0be9bda0a9adfff3c625bf9262/isu],
    ['MedNLI', /e1fe2531a9e97ca49203f4d3ef22c5cbf96f0d71.*21f3313de37d60d45fb67a276d63ace9c4a0ac7d/isu],
    ['MedQA', /27b02f66aac217933c9648a06f82e9f720377925.*1c2ca8130b3d86d9a99a432ab9bef14f3bb9807bef20facd9ac86ba36960f629/isu],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    const summary = catalog.get(id);
    assert.ok(summary, `${id} catalog entry`);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(detail[field], value, `${id}.${field}`);
      assert.equal(summary[field], value, `${id} catalog ${field}`);
    }
    for (const field of ['flowchart_en', 'flowchart_zh', 'mermaid_flowchart', 'drawio_review_note']) {
      assert.equal(summary[field], detail[field], `${id} catalog/detail ${field}`);
    }
    assert.match(detail.drawio_review_note, pins.get(id), `${id} fixed evidence pins`);
  }
});

test('keeps every A11t fallback byte-synchronized with source and formal arch', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      const arch = readArch(id, language);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec), `${id}.${language} exact arch`);
      assert.equal(arch.title, spec.meta.title, `${id}.${language} title`);
      assert.equal(arch.source, spec.meta.source ?? 'generated', `${id}.${language} source`);
      assert.equal(arch.profile, spec.meta.profile, `${id}.${language} profile`);
      assert.equal(arch.theme, spec.meta.theme, `${id}.${language} theme`);
      assert.equal(arch.layout, spec.meta.layout, `${id}.${language} layout`);
      assert.deepEqual(arch.counts, { ...expectedCounts.get(id), modules: (spec.modules ?? []).length });
      assert.equal(detail[`flowchart_${language}`], renderFallback(spec), `${id}.${language} source fallback`);
      assert.equal(detail[`flowchart_${language}`], renderFallback(arch), `${id}.${language} arch fallback`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
  }
});

test("keeps source topology independent of optional exports: paper_review_site_a11t", () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal topology`);
  }
});

test('publishes exact parent-labeled Draw.io topology with fixed-light SVG and PNG', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal topology`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const formal = formalGraph(drawio, arch, `${id}.${language}`);
      assert.deepEqual(
        formal.edges,
        arch.edges.map(edge => ({ from: edge.from, to: edge.to, label: normalizedLabel(edge.label ?? '') })),
        `${id}.${language} Draw.io edges`,
      );
      assert.equal(formal.cells.childEdgeLabels.length, 0, `${id}.${language} child edge labels`);
      assert.match(drawio, /<mxGraphModel[^>]*\bmath="0"[^>]*\bbackground="#FFFFFF"/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      for (const tag of [...formal.cells.nodes, ...formal.cells.edges]) {
        const style = readAttribute(tag, 'style');
        assert.match(style, /(?:^|;)html=0(?:;|$)/u, `${id}.${language} native text`);
        assert.match(style, /(?:^|;)convertToSvg=1(?:;|$)/u, `${id}.${language} SVG conversion`);
      }
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/iu);
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language} PNG size`);
    }
  }
});

test('reproduces all twelve A11t SVG and PNG exports byte-for-byte', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11t-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const svg = join(tempRoot, `${id}.${language}.svg`);
        const png = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', svg, `${base}.drawio`], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, svg], { stdio: 'pipe' });
        assertSvgFidelity(svg, `${base}.svg`, `${id}.${language}.svg bytes`);
        execFileSync(drawioDesktop, ['-x', '-f', 'png', '-o', png, `${base}.drawio`], { stdio: 'pipe' });
        assertPngFidelity(png, `${base}.png`, `${id}.${language}.png fidelity`);
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and parent-normalizes all twelve A11t specs without drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11t-builds-'));
  let rebuildCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli,
          `${base}.spec.yaml`,
          generated,
          '--validate',
          '--strict',
          '--write-sidecars',
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}.drawio bytes`);
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
          `${id}.${language}.arch bytes`,
        );
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
