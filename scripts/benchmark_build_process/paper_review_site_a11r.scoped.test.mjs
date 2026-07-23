import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'MatBench',
  'Math-VR',
  'MathCanvas-Bench',
  'MathOlympiad-Bench',
  'MathVision',
  'MathVista',
];
const expectedCounts = new Map([
  ['MatBench', { nodes: 16, edges: 17 }],
  ['Math-VR', { nodes: 25, edges: 26 }],
  ['MathCanvas-Bench', { nodes: 26, edges: 28 }],
  ['MathOlympiad-Bench', { nodes: 17, edges: 20 }],
  ['MathVision', { nodes: 29, edges: 34 }],
  ['MathVista', { nodes: 30, edges: 34 }],
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
    let arrow;
    if (edge.type === 'primary') {
      arrow = label ? `-->|${mermaidEdgeLabel(label)}|` : '-->';
    } else {
      arrow = label ? `-. ${mermaidEdgeLabel(label)} .->` : '-.->';
    }
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

function normalizedLabel(value) {
  return decodeXml(value).replace(/\s+/gu, ' ').trim();
}

function searchableLabel(value) {
  return normalizedLabel(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function drawioCells(xml) {
  const tags = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
  const childEdgeLabels = tags.filter(tag => (
    readAttribute(tag, 'style').split(';').includes('edgeLabel')
  ));
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

function edgeSignatures(graph) {
  return new Set(graph.edges.map(edge => `${edge.from}->${edge.to}:${edge.label ?? ''}`));
}

test('keeps all six A11r source packages bilingual, geometric, language-pure, and explicit', () => {
  for (const id of benchmarkIds) {
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual geometry`);
    assert.equal(en.nodes.length, expectedCounts.get(id).nodes, `${id}.en nodes`);
    assert.equal(en.edges.length, expectedCounts.get(id).edges, `${id}.en edges`);
    assert.doesNotMatch(
      en.nodes.map(node => node.label).join('\n'),
      /[\u3400-\u9fff]/u,
      `${id}.en node language`,
    );
    assert.ok(
      zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))),
      `${id}.zh every node has Chinese semantics`,
    );

    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      const nodeIds = new Set(spec.nodes.map(node => node.id));
      assert.equal(nodeIds.size, spec.nodes.length, `${id}.${language} unique node IDs`);
      for (const edge of spec.edges) {
        assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to), `${id}.${language} ${edge.from}->${edge.to}`);
        const label = String(edge.label ?? '').trim();
        if (!label) continue;
        if (language === 'en') {
          assert.doesNotMatch(label, /[\u3400-\u9fff]/u, `${id}.en edge language`);
        } else {
          assert.match(label, /[\u3400-\u9fff]/u, `${id}.zh edge language`);
        }
      }
      for (const decision of spec.nodes.filter(node => node.type === 'decision')) {
        const outgoing = spec.edges.filter(edge => edge.from === decision.id);
        assert.ok(outgoing.length >= 2, `${id}.${language}.${decision.id} outcomes`);
        assert.ok(outgoing.every(edge => String(edge.label ?? '').trim()), `${id}.${language}.${decision.id} labels`);
        assert.ok(
          new Set(outgoing.map(edge => String(edge.label).trim())).size >= 2,
          `${id}.${language}.${decision.id} semantic outcomes`,
        );
        assert.ok(
          new Set(outgoing.map(edge => edge.to)).size >= 2,
          `${id}.${language}.${decision.id} targets`,
        );
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length >= 1_000, `${id} review evidence`);
  }
});

test('uses only valid academic font overrides across the A11r source specs', () => {
  const violations = [];
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      for (const node of readSpec(id, language).nodes) {
        if (Object.hasOwn(node, 'fontSize')) {
          violations.push(`${id}.${language}.${node.id} ignored node-level fontSize`);
        }
        if (node.style === null) {
          violations.push(`${id}.${language}.${node.id} empty style`);
          continue;
        }
        if (node.style !== undefined && (typeof node.style !== 'object' || Array.isArray(node.style))) {
          violations.push(`${id}.${language}.${node.id} non-object style`);
          continue;
        }
        const fontSize = node.style?.fontSize;
        if (fontSize !== undefined && (
          typeof fontSize !== 'number' || fontSize < 8 || fontSize > 10
        )) {
          violations.push(`${id}.${language}.${node.id} invalid fontSize=${fontSize}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('locks MatBench task modifications, five-fold protocol, package drift, and adapter boundary', () => {
  const graph = readSpec('MatBench');
  assert.match(nodeLabel(graph, 'clean'), /Methods Table 2 Items 1–11.*Task-specific.*Items 7\/8 Remove Auxiliary Columns/isu);
  assert.match(nodeLabel(graph, 'tasks'), /13 Supervised Tasks.*10 Regression.*3 Classification.*Paper 1,296.*v0\.6 1,265/isu);
  assert.match(nodeLabel(graph, 'folds'), /Five Outer Test Folds.*Seed 18012019.*StratifiedKFold.*80%.*20%/isu);
  assert.match(nodeLabel(graph, 'fit'), /Outer Training Data.*Held-out Sample.*Missing.*Extra.*Rejected/isu);
  assert.match(nodeLabel(graph, 'regression_metric'), /MAE.*Five Folds.*Lower Is Better/isu);
  assert.match(nodeLabel(graph, 'classification_metric'), /ROC-AUC.*Five Folds.*Higher Is Better/isu);
  assert.match(nodeLabel(graph, 'select_four'), /Fold 0 Test Files Only.*Steels.*Band Gap.*Is-metal.*Glass/isu);
  assert.match(nodeLabel(graph, 'numeric_parse'), /One Float.*Incomplete.*Undetermined.*0.*First Number.*None.*0/isu);
  assert.match(nodeLabel(graph, 'class_judge'), /A\/B.*CORRECT\/INCORRECT.*First A or B.*unknown.*Not Correct/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /\(2 − MAE\) \/ 2 × 100.*\(2000 − MAE\) \/ 2000 × 100.*Arithmetic Mean/isu);
});

test('locks Math-VR filter ordering, geometry drift, judge retries, truthiness, and denominators', () => {
  const graph = readSpec('Math-VR');
  assert.match(nodeLabel(graph, 'collect'), /about 900K.*Public Websites.*Source URLs and Crawl Date Not Disclosed/isu);
  assert.match(nodeLabel(graph, 'image_gate'), /Qwen2\.5-VL-72B.*Reasoning-relevant Mathematical Figure/isu);
  assert.match(nodeLabel(graph, 'standardize'), /GPT-4\.1.*Transcribe.*Separate Question and Solution.*Markdown/isu);
  assert.match(nodeLabel(graph, 'corpus'), /89,075 Unique Questions.*178,150.*Split Is Not Yet Finalized/isu);
  assert.match(nodeLabel(graph, 'taxonomy'), /29% Text.*71% Multimodal.*81% Main p\.4.*77% Fig\. 3.*76% Fig\. 6/isu);
  assert.match(nodeLabel(graph, 'candidates'), /3,000-question.*Exclude Proof.*Exclude Most Multiple-choice.*Seed Not Reported/isu);
  assert.match(nodeLabel(graph, 'benchmark'), /86,575 Train.*2,500 Test.*1,000 Text.*1,500 Multimodal.*5,000 Chinese/isu);
  assert.match(nodeLabel(graph, 'response'), /Only Supplied IDs.*No 2,500-ID Coverage Check/isu);
  assert.match(nodeLabel(graph, 'judge'), /GPT-4\.1.*No Question Images/isu);
  assert.match(nodeLabel(graph, 'json_gate'), /First “\{”.*Last “\}”.*json\.loads Only.*No Schema or Type Validation/isu);
  assert.match(nodeLabel(graph, 'retry_gate'), /At Most Five Judge Calls/isu);
  assert.match(nodeLabel(graph, 'omit'), /Absent from result\.json.*Absent from the Mean/isu);
  assert.match(nodeLabel(graph, 'full_score'), /PS = 100.*AC = 100 Only.*“False” or 1.*PS 100.*AC 0/isu);
  assert.match(nodeLabel(graph, 'partial_score'), /0\.7 × final_score \/ max_score × 100.*No Type or Range Validation/isu);
  assert.match(nodeLabel(graph, 'report'), /Missing IDs Do Not Enter Denominators.*Missing Fields Count as Zero/isu);
});

test('locks MathCanvas construction funnel and valid-evaluation denominator', () => {
  const graph = readSpec('MathCanvas-Bench');
  assert.match(nodeLabel(graph, 'collect'), /632K/isu);
  assert.match(nodeLabel(graph, 'deduplicate'), /303K.*222K.*Threshold Not Reported/isu);
  assert.match(nodeLabel(graph, 'image_enhance'), /SwinIR.*512 × 512/isu);
  assert.match(nodeLabel(graph, 'taxonomy'), /GPT-4\.1.*Eight Major Knowledge Categories/isu);
  assert.match(nodeLabel(graph, 'weighted_sample'), /Category Share to Power 0\.7.*3K/isu);
  assert.match(nodeLabel(graph, 'benchmark_release'), /3,079 Records.*Eight Test Configurations/isu);
  assert.match(nodeLabel(graph, 'leakage_gate'), /5-gram Jaccard Similarity > 0\.4/isu);
  assert.match(nodeLabel(graph, 'training_release'), /218,604.*219K/isu);
  assert.match(nodeLabel(graph, 'judge_input'), /Text Reasoning Steps Only.*Images Are Not Sent/isu);
  assert.match(nodeLabel(graph, 'gpt_judge'), /gpt-4\.1-2025-04-14.*Missing Answer → null.*Incorrect/isu);
  assert.match(nodeLabel(graph, 'valid_evaluation_gate'), /API.*Schema Successful.*One to Four Parts/isu);
  assert.match(nodeLabel(graph, 'invalid_evaluation'), /Exclude from Metric Denominator.*API\/Schema Failure or Unsupported Count/isu);
  assert.match(nodeLabel(graph, 'multi_score'), /Two to Four Parts.*1\.3× Weight.*Normalize Weights/isu);
  assert.match(nodeLabel(graph, 'metrics'), /Denominator: valid_evaluations.*Complete.*Weighted/isu);
});

test('locks MathOlympiad normalization, Lean validation, two repairs, and Pass@32', () => {
  const graph = readSpec('MathOlympiad-Bench');
  assert.match(nodeLabel(graph, 'composition'), /158 IMO.*1959–2024.*131 IMO Shortlist.*2006–2023.*68 National.*3 Puzzles/isu);
  assert.match(nodeLabel(graph, 'repair'), /Human-process.*Complete.*Dependencies.*Split Theorems.*Mathlib/isu);
  assert.match(nodeLabel(graph, 'normalize'), /Exactly One Formal Theorem.*One Corresponding Informal Statement/isu);
  assert.match(nodeLabel(graph, 'compile_statement'), /by sorry.*Target Mathlib/isu);
  assert.match(nodeLabel(graph, 'release'), /360 Human-verified Records/isu);
  assert.match(nodeLabel(graph, 'overlap_audit'), /MiniF2F.*At Least Three.*No Analogous Issue/isu);
  assert.match(nodeLabel(graph, 'setup'), /Lean 4\.9\.0-rc1.*N Independent Attempts/isu);
  assert.match(nodeLabel(graph, 'generate'), /30,000 Tokens/isu);
  assert.match(nodeLabel(graph, 'proof_gate'), /No apply\? \/ exact\?/isu);
  assert.match(nodeLabel(graph, 'correction_gate'), /Fewer than Two Repairs/isu);
  assert.match(nodeLabel(graph, 'revise'), /Verifier Feedback.*40,000 Tokens/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Pass@N.*N = 32/isu);
});

test('locks MathVision four-stage curation, release counts, parsing, and accuracy', () => {
  const graph = readSpec('MathVision');
  assert.match(nodeLabel(graph, 'collect'), /19 Competitions.*Copyright.*Hard-to-retrieve Answers/isu);
  assert.match(nodeLabel(graph, 'extract'), /Mathpix.*9,000.*3,500/isu);
  assert.match(nodeLabel(graph, 'alignment'), /Ten Senior STEM Annotators.*Cross-verified/isu);
  assert.match(nodeLabel(graph, 'stage1_keep'), /3,352 Problems/isu);
  assert.match(nodeLabel(graph, 'dedup_screen'), /Lexical Overlap.*Levenshtein.*Manual Review/isu);
  assert.match(nodeLabel(graph, 'curated'), /3,040.*1,532 Multiple-choice.*1,508 Free-form/isu);
  assert.match(nodeLabel(graph, 'subjects'), /16 Subjects.*Three Independent Groups.*GPT-4V.*Gemini Pro/isu);
  assert.match(nodeLabel(graph, 'difficulty'), /Five Difficulty Levels.*Manually Correct Boundaries/isu);
  assert.match(nodeLabel(graph, 'release'), /Full Test: 3,040.*Testmini: 304/isu);
  assert.match(nodeLabel(graph, 'normalize'), /Strip Units and LaTeX.*Tuples and Expressions.*Rounded to 2 dp/isu);
  assert.match(nodeLabel(graph, 'compare'), /Answer Letter or Option Value.*Empty Never Matches/isu);
  assert.match(nodeLabel(graph, 'report'), /Overall.*16 Subjects.*5 Levels.*All Evaluated Rows/isu);
});

test('locks MathVista construction branches, hidden-test boundary, and evaluator drift', () => {
  const graph = readSpec('MathVista');
  assert.match(nodeLabel(graph, 'mathqa_sources'), /Nine MathQA Datasets/isu);
  assert.match(nodeLabel(graph, 'mathqa_pool'), /2,666/isu);
  assert.match(nodeLabel(graph, 'vqa_sources'), /More Than 70.*19 Public Sources/isu);
  assert.match(nodeLabel(graph, 'math_reasoning'), /Three Expert Annotators.*Majority Vote.*0\.775/isu);
  assert.match(nodeLabel(graph, 'vqa_pool'), /2,739/isu);
  assert.match(nodeLabel(graph, 'new_sources'), /IQTest 228.*FunctionQA 400.*Paper 107.*Release 108/isu);
  assert.match(nodeLabel(graph, 'new_pool'), /736/isu);
  assert.match(nodeLabel(graph, 'merge'), /31 Sources.*6,141.*3,392.*2,749/isu);
  assert.match(nodeLabel(graph, 'release'), /testmini: 1,000 Public Labels.*test: 5,141 Hidden Labels.*≥4 per Source/isu);
  assert.match(nodeLabel(graph, 'llm_extract'), /Five Demonstrations.*AZURE_OPENAI_MODEL.*Empty on Extraction Exception/isu);
  assert.match(nodeLabel(graph, 'hidden_submit'), /5,141 Test Labels Not Public.*Online Evaluation Platform/isu);
  assert.match(nodeLabel(graph, 'readme_drift'), /Email Test Result File.*Authors Generate the Score File.*CodaLab Under Construction/isu);
  assert.match(nodeLabel(graph, 'report'), /Overall and Nine Metadata Keys/isu);
});

test('pins exact A11r paper, repository, dataset, and release evidence', () => {
  const expected = new Map([
    ['MatBench', { paper_url: 'https://arxiv.org/abs/2005.00707v2', arxiv_pdf_url: 'https://arxiv.org/pdf/2005.00707v2', homepage: 'https://github.com/materialsproject/matbench', openness: 'public', has_leaderboard: true }],
    ['Math-VR', { paper_url: 'https://arxiv.org/abs/2510.11718v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2510.11718v1', homepage: 'https://math-vr.github.io', openness: 'public', has_leaderboard: true }],
    ['MathCanvas-Bench', { paper_url: 'https://arxiv.org/abs/2510.14958v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2510.14958v1', homepage: 'https://huggingface.co/datasets/shiwk24/MathCanvas-Bench/tree/52ab630135728de9dbc1d1a724ebcf613678b8b3', org: 'Multimedia Laboratory (MMLab), The Chinese University of Hong Kong, Huawei Research, BUAA', openness: 'public', has_leaderboard: false }],
    ['MathOlympiad-Bench', { paper_url: 'https://arxiv.org/abs/2508.03613v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2508.03613v1', homepage: 'https://huggingface.co/datasets/Goedel-LM/MathOlympiadBench/tree/1397f5ece2baea32fc65c0a156d7670fc9842f5b', openness: 'public', has_leaderboard: false }],
    ['MathVision', { paper_url: 'https://arxiv.org/abs/2402.14804v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2402.14804v1', homepage: 'https://mathllm.github.io/mathvision/', openness: 'public', has_leaderboard: true }],
    ['MathVista', { paper_url: 'https://arxiv.org/abs/2310.02255v3', arxiv_pdf_url: 'https://arxiv.org/pdf/2310.02255v3', homepage: 'https://mathvista.github.io/', openness: 'public', has_leaderboard: true }],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(detail[field], value, id + '.' + field);
    }
    assert.ok(detail.drawio_review_note.length >= 1_000, id + ' detailed review note');
  }
  assert.match(readDetail('MatBench').drawio_review_note, /936176db18ca4cd7b38cbd957c017a5bac770c6b.*f5de1701fafaa0bbfef435f07b505796a226b5d9.*34da831f41494ebc3ece902fc9200dbba696a93e/isu);
  assert.match(readDetail('Math-VR').drawio_review_note, /45b8c8885a12b172041a781ee45a13c48c56d401.*b15f5bb8454409c05dae801c235c7fc571689044.*4c4361142039c44994cca92d6d3987442fc6c6f0/isu);
  assert.match(readDetail('MathCanvas-Bench').drawio_review_note, /9b48cc81ab1f63d418a954e4502c3c6274068a7b.*52ab630135728de9dbc1d1a724ebcf613678b8b3.*fa759293ced51819bbfca63c09cb834b20ddb140/isu);
  assert.match(readDetail('MathOlympiad-Bench').drawio_review_note, /2e9036e118464aa96a8bebaf9f5b9d091aa3585c.*1397f5ece2baea32fc65c0a156d7670fc9842f5b.*2f65ba7f1a9144b20c8e7358513548e317d26de1/isu);
  assert.match(readDetail('MathVision').drawio_review_note, /a1f5cc3add200c0cd080fad463e500f44ef1fb41.*2837ddb3f13abaf6b3997c12d80753e5470bd46a/isu);
  assert.match(readDetail('MathVista').drawio_review_note, /53d525874bdde205128e6b160b7357a88277d479.*2b6ad69445fbb5695c9b165475e8decdbeb97747/isu);
});

test('keeps every A11r fallback byte-synchronized with each exact source and formal arch', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      const arch = readArch(id, language);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec), `${id}.${language} exact arch`);
      assert.equal(arch.title, spec.meta.title, `${id}.${language} arch title`);
      assert.equal(arch.source, spec.meta.source ?? 'generated', `${id}.${language} arch source`);
      assert.equal(arch.profile, spec.meta.profile, `${id}.${language} arch profile`);
      assert.equal(arch.theme, spec.meta.theme, `${id}.${language} arch theme`);
      assert.equal(arch.layout, spec.meta.layout, `${id}.${language} arch layout`);
      assert.deepEqual(arch.counts, {
        ...expectedCounts.get(id),
        modules: (spec.modules ?? []).length,
      }, `${id}.${language} arch counts`);
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(spec),
        `${id}.${language} source fallback`,
      );
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(arch),
        `${id}.${language} arch fallback`,
      );
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id}.generic fallback`);
  }
});

test('publishes exact parent-labeled Draw.io topology with native fixed-light SVG and PNG', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} bilingual formal topology`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const formal = formalGraph(drawio, arch, `${id}.${language}`);
      assert.deepEqual(
        formal.edges,
        arch.edges.map(edge => ({
          from: edge.from,
          to: edge.to,
          label: normalizedLabel(edge.label ?? ''),
        })),
        `${id}.${language} Draw.io topology`,
      );
      assert.deepEqual(
        formal.cells.edges
          .map(tag => normalizedLabel(readAttribute(tag, 'value')))
          .filter(Boolean)
          .sort(),
        arch.edges
          .map(edge => normalizedLabel(edge.label ?? ''))
          .filter(Boolean)
          .sort(),
        `${id}.${language} parent edge-label multiset`,
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
      assert.doesNotMatch(
        svg,
        /<foreignObject\b|data:image\/|Text is not SVG - cannot display|light-dark\s*\(|prefers-color-scheme|color-scheme:\s*light\s+dark/iu,
        `${id}.${language} fixed-light native SVG`,
      );
      const svgSearchable = searchableLabel(svg.replace(/<[^>]+>/gu, ' '));
      for (const label of [
        ...arch.nodes.map(node => node.label),
        ...arch.edges.map(edge => edge.label ?? ''),
      ]) {
        for (const line of String(label).split(/\r?\n/gu).filter(Boolean)) {
          const needle = searchableLabel(line);
          assert.ok(
            needle.length < 3 || svgSearchable.includes(needle),
            `${id}.${language}.svg missing visible line: ${line}`,
          );
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language} PNG dimensions`);
    }
  }
});

test('reproduces exactly all twelve A11r SVG and PNG exports from checked-in Draw.io', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11r-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`],
          { stdio: 'pipe' },
        );
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generatedSvg, 'utf8'),
          readFileSync(`${base}.svg`, 'utf8'),
          `${id}.${language}.svg bytes`,
        );
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`],
          { stdio: 'pipe' },
        );
        assert.deepEqual(
          readFileSync(generatedPng),
          readFileSync(`${base}.png`),
          `${id}.${language}.png bytes`,
        );
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and parent-normalizes all twelve A11r specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11r-builds-'));
  let rebuildCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(
          process.execPath,
          [drawioCli, `${base}.spec.yaml`, generated, '--validate', '--strict', '--write-sidecars'],
          { stdio: 'pipe' },
        );
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}.drawio bytes`,
        );
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
