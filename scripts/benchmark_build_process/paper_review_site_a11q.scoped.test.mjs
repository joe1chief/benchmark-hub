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
const benchmarkIds = [
  'MT-AIME2024',
  'MT-Bench-101',
  'MTVQA',
  'MUIRBENCH',
  'MVBench',
  'Mantis-Eval',
];
const expectedCounts = new Map([
  ['MT-AIME2024', { nodes: 30, edges: 37 }],
  ['MT-Bench-101', { nodes: 26, edges: 28 }],
  ['MTVQA', { nodes: 30, edges: 35 }],
  ['MUIRBENCH', { nodes: 30, edges: 39 }],
  ['MVBench', { nodes: 30, edges: 30 }],
  ['Mantis-Eval', { nodes: 26, edges: 24 }],
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
  join(publicDir, 'drawio', id, id + '.' + language + '.spec.yaml'),
  'utf8',
));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, id + '.' + language + '.arch.json'),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', id + '.json'));

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, 'missing node ' + id);
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
  for (const node of graph.nodes) lines.push('    ' + node.id + '["' + mermaidLabel(node.label) + '"]');
  for (const edge of graph.edges) {
    const label = String(edge.label ?? '').trim();
    let arrow;
    if (edge.type === 'primary') {
      arrow = label ? '-->|' + mermaidEdgeLabel(label) + '|' : '-->';
    } else {
      arrow = label ? '-. ' + mermaidEdgeLabel(label) + ' .->' : '-.->';
    }
    lines.push('    ' + edge.from + ' ' + arrow + ' ' + edge.to);
  }
  return lines.join('\n');
}

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^{}$()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp('(?:^|\\s)' + escapedName + '="([^"]*)"', 'u'))?.[1] ?? '';
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
  assert.equal(cells.nodes.length, arch.nodes.length, context + ' Draw.io node count');
  assert.equal(cells.edges.length, arch.edges.length, context + ' Draw.io edge count');
  assert.deepEqual(
    cells.nodes.map(tag => normalizedLabel(readAttribute(tag, 'value'))),
    arch.nodes.map(node => normalizedLabel(node.label)),
    context + ' Draw.io node order and labels',
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

test('keeps all six A11q source packages bilingual, geometric, language-pure, and explicit', () => {
  for (const id of benchmarkIds) {
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), id + ' bilingual geometry');
    assert.equal(en.nodes.length, expectedCounts.get(id).nodes, id + '.en nodes');
    assert.equal(en.edges.length, expectedCounts.get(id).edges, id + '.en edges');
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u, id + '.en node language');
    assert.ok(zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))), id + '.zh every node has Chinese semantics');

    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      assert.equal(spec.meta.profile, 'academic-paper', id + '.' + language + ' profile');
      assert.equal(spec.meta.theme, 'academic-color', id + '.' + language + ' theme');
      assert.equal(spec.meta.layout, 'horizontal', id + '.' + language + ' layout');
      assert.equal(spec.meta.routing, 'orthogonal', id + '.' + language + ' routing');
      const nodeIds = new Set(spec.nodes.map(node => node.id));
      assert.equal(nodeIds.size, spec.nodes.length, id + '.' + language + ' unique node IDs');
      for (const edge of spec.edges) {
        assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to), id + '.' + language + ' ' + edge.from + '->' + edge.to);
        const label = String(edge.label ?? '').trim();
        if (!label) continue;
        if (language === 'en') {
          assert.doesNotMatch(label, /[\u3400-\u9fff]/u, id + '.en edge language');
        } else {
          assert.match(label, /[\u3400-\u9fff]/u, id + '.zh edge language');
        }
      }
      for (const decision of spec.nodes.filter(node => node.type === 'decision')) {
        const outgoing = spec.edges.filter(edge => edge.from === decision.id);
        assert.ok(outgoing.length >= 2, id + '.' + language + '.' + decision.id + ' outcomes');
        assert.ok(outgoing.every(edge => String(edge.label ?? '').trim()), id + '.' + language + '.' + decision.id + ' labels');
        assert.ok(new Set(outgoing.map(edge => String(edge.label).trim())).size >= 2, id + '.' + language + '.' + decision.id + ' semantic outcomes');
        assert.ok(new Set(outgoing.map(edge => edge.to)).size >= 2, id + '.' + language + '.' + decision.id + ' targets');
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length >= 1_000, id + ' review evidence');
  }
});

test('uses only valid academic font overrides across the A11q source specs', () => {
  const violations = [];
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      for (const node of readSpec(id, language).nodes) {
        if (Object.hasOwn(node, 'fontSize')) violations.push(id + '.' + language + '.' + node.id + ' ignored node-level fontSize');
        if (node.style === null) {
          violations.push(id + '.' + language + '.' + node.id + ' empty style');
          continue;
        }
        if (node.style !== undefined && (typeof node.style !== 'object' || Array.isArray(node.style))) {
          violations.push(id + '.' + language + '.' + node.id + ' non-object style');
          continue;
        }
        const fontSize = node.style?.fontSize;
        if (fontSize !== undefined && (typeof fontSize !== 'number' || fontSize < 8 || fontSize > 10)) {
          violations.push(id + '.' + language + '.' + node.id + ' invalid fontSize=' + fontSize);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('locks MT-AIME2024 release shape, repair boundary, inference routes, and scoring drift', () => {
  const graph = readSpec('MT-AIME2024');
  assert.match(nodeLabel(graph, 'source'), /All 30 Competition Problems.*English Question and Solution.*Verified Numerical Answer/isu);
  assert.match(nodeLabel(graph, 'question_translation'), /GPT-4o.*Do Not Solve or Drop Details.*Preserve Math Notation/isu);
  assert.match(nodeLabel(graph, 'qa_boundary'), /Retry and Adjudication Unreported.*One MATH500 Item Was Removed.*No MT-AIME2024 Removal/isu);
  assert.match(nodeLabel(graph, 'release'), /test Split.*30 Physical Rows.*55 Language Columns.*answer.*No ID.*Solution.*Locale/isu);
  assert.match(nodeLabel(graph, 'release_audit'), /30 × 56.*No Nulls.*1,650 Logical Language Instances.*29 Unique Answers.*23–902/isu);
  assert.match(nodeLabel(graph, 'entrypoint_blocked'), /Missing samples Key.*Absent train Split.*No Scores/isu);
  assert.match(nodeLabel(graph, 'group_b'), /AF.*AR.*DE.*EN.*14 Languages, Not Full Benchmark/isu);
  assert.match(nodeLabel(graph, 'budget_forcing'), /Truncate When over Budget.*Prompt More Reasoning When under/isu);
  assert.match(nodeLabel(graph, 'orm'), /Generate N Full Responses.*Qwen2\.5-Math-72B-RM.*Select Highest-reward/isu);
  assert.match(nodeLabel(graph, 'prm'), /Generate Candidate Continuations.*Selects Each Step/isu);
  assert.match(nodeLabel(graph, 'substring_gate'), /Parsed String.*Contain the Other/isu);
  assert.match(nodeLabel(graph, 'accuracy'), /100 × Correct.*len\(df\).*Denominator Includes Failures/isu);
  assert.match(nodeLabel(graph, 'consistency_classifier'), /Equal Row Counts.*Parse \+ math_verify Only.*No String-containment Fallback/isu);
  assert.match(nodeLabel(graph, 'fleiss'), /Languages Are Binary Raters.*Fleiss.*Kappa/isu);
});

test('locks MT-Bench-101 unanimous curation, golden-context items, judge drift, and macro score', () => {
  const graph = readSpec('MT-Bench-101');
  assert.match(nodeLabel(graph, 'taxonomy'), /Perceptivity.*Adaptability.*Interactivity.*Memory.*Questioning/isu);
  assert.match(nodeLabel(graph, 'task_catalog'), /13 Third-level Tasks.*CM.*AR.*PI.*30 Topics.*At Least 10 per Task/isu);
  assert.match(nodeLabel(graph, 'generate'), />1,000 per Task/isu);
  assert.match(nodeLabel(graph, 'curation_gate'), /All Five Annotators.*Approve/isu);
  assert.match(nodeLabel(graph, 'release'), /1,388 English Dialogues.*4,208 History Turns.*13 Tasks.*Apache-2\.0/isu);
  assert.match(nodeLabel(graph, 'release_audit'), /task.*id.*history.*2–7 Turns.*SI 1138 and 1142/isu);
  assert.match(nodeLabel(graph, 'skip_first'), /FR.*CR.*AR.*SA.*SC.*CM.*593 Dialogues/isu);
  assert.match(nodeLabel(graph, 'evaluation_items'), /3,615 Evaluation Items.*4,208 Turns − 593 First Turns.*Golden Prior History/isu);
  assert.match(nodeLabel(graph, 'judge'), /GPT-4.*1–10.*Rating: \[\[score\]\].*0\.6/isu);
  assert.match(nodeLabel(graph, 'judge_drift'), /gpt-4-1106-preview.*0\.8.*MR\/GR/isu);
  assert.match(nodeLabel(graph, 'invalid_policy'), /Skip Invalid Judge Output.*No 1–10 Range Check.*Empty Dialogue Disappears/isu);
  assert.match(nodeLabel(graph, 'task_mean'), /Unweighted Mean of Dialogue Minima.*13 Tasks.*Missing Dialogues Shrink Denominator/isu);
  assert.match(nodeLabel(graph, 'paper_average'), /Macro Mean of 13 Task Scores.*Public Summarizer Omits/isu);
  assert.match(nodeLabel(graph, 'human_validation'), /100 Dialogues.*Five Experts.*87%.*80%/isu);
});

test('locks MTVQA source mix, two-round annotation, released schema, and macro denominator', () => {
  const graph = readSpec('MTVQA');
  assert.match(nodeLabel(graph, 'public_source'), /30%.*ICDAR MLT19/isu);
  assert.match(nodeLabel(graph, 'web_source'), /20%.*LAION-OCR.*Common Crawl/isu);
  assert.match(nodeLabel(graph, 'manual_source'), /50%.*Native Real-world Scenarios/isu);
  assert.match(nodeLabel(graph, 'language_pool'), /Nine Native Languages.*8,980 Raw.*8,895 Candidates/isu);
  assert.match(nodeLabel(graph, 'annotator_train'), /Native Use 10\+ Years.*University Degree.*Pilot/isu);
  assert.match(nodeLabel(graph, 'maker_round'), /3 Annotators.*5 QAs.*First 3 Read.*Last 2 Reason/isu);
  assert.match(nodeLabel(graph, 'checker_gate'), /Two Independent Checkers.*Relevance.*Correctness.*Redundancy.*Ethics/isu);
  assert.match(nodeLabel(graph, 'audit_gate'), /10% Language Audit/isu);
  assert.match(nodeLabel(graph, 'release'), /8,794 Images.*28,607 QA Pairs.*CC BY-NC 4\.0/isu);
  assert.match(nodeLabel(graph, 'split'), /image.*id.*qa_pairs.*lang.*KO → KR.*Train 6,678 \/ 21,829.*Test 2,116 \/ 6,778.*No Adapter/isu);
  assert.match(nodeLabel(graph, 'match_gate'), /Any Target Is a Substring.*Remove Periods from Prediction.*Not Strict Exact Equality/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Mean Rows per File.*Unweighted Mean of Files.*No 9-file Check.*Missing Files Shrink Macro/isu);
  assert.match(nodeLabel(graph, 'human'), /Ten Educated Native Speakers.*79\.7%/isu);
});

test('locks MUIRBENCH paired construction, release drift, executable parser, and complete denominator', () => {
  const graph = readSpec('MUIRBENCH');
  assert.match(nodeLabel(graph, 'existing_source'), /531.*40\.8%.*GeneCIS.*SeedBench.*IconQA/isu);
  assert.match(nodeLabel(graph, 'derived_source'), /282.*21\.7%.*NLVR2.*HallusionBench.*ISVQA.*MMBench/isu);
  assert.match(nodeLabel(graph, 'new_source'), /487.*37\.5%.*HistoricalMap.*UnivBuilding.*PubMedMQA.*SciSlides/isu);
  assert.match(nodeLabel(graph, 'answerable_pool'), /1,300 Answerable.*2–9 Ordered Images/isu);
  assert.match(nodeLabel(graph, 'image_transform'), /315 Counterparts.*24\.2%/isu);
  assert.match(nodeLabel(graph, 'question_transform'), /459 Counterparts.*35\.3%/isu);
  assert.match(nodeLabel(graph, 'option_transform'), /526 Counterparts.*40\.5%/isu);
  assert.match(nodeLabel(graph, 'quality_gate'), /Two-stage QC.*4 Experts.*86\.3%/isu);
  assert.match(nodeLabel(graph, 'release'), /2,600 MCQs.*11,264 Images.*1,300 Pairs.*4\.3.*2–9/isu);
  assert.match(nodeLabel(graph, 'schema'), /image_list.*3–5 Choices.*Paper images → Release image_list/isu);
  assert.match(nodeLabel(graph, 'modality_gate'), /VLMEvalKit.*T=0.*Retry=10.*No Full Runner/isu);
  assert.match(nodeLabel(graph, 'random_fallback'), /random\.seed\(42\).*Available Labels/isu);
  assert.match(nodeLabel(graph, 'paper_first'), /Paper Says First Occurrence/isu);
  assert.match(nodeLabel(graph, 'code_last'), /rfind.*argmax.*Latest Position/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Full-set Denominator.*2,600/isu);
});

test('locks MVBench and Mantis-Eval release audits, wrapper boundaries, parsers, and denominators', () => {
  const mv = readSpec('MVBench');
  assert.match(nodeLabel(mv, 'spatial_tasks'), /Nine Spatial Task Categories.*20 Temporal Tasks/isu);
  assert.match(nodeLabel(mv, 'sources'), /11 Public Video Datasets/isu);
  assert.match(nodeLabel(mv, 'temporal_gate'), /Mainly 5-35 Seconds/isu);
  assert.match(nodeLabel(mv, 'source_rules'), /STAR.*Shift Clip Start.*End.*CLEVRER.*>10 Conditions/isu);
  assert.match(nodeLabel(mv, 'sample_options'), /3-5 Options/isu);
  assert.match(nodeLabel(mv, 'release'), /20 Temporal Tasks.*200 MCQs per Task.*4,000/isu);
  assert.match(nodeLabel(mv, 'release_snapshot'), /3,569 \/ 4,000.*151 Groups.*582 Rows.*1,000 Rows Carry Start \/ End/isu);
  assert.match(nodeLabel(mv, 'release_drift'), /5 One-option.*118 Two-option/isu);
  assert.match(nodeLabel(mv, 'rights_boundary'), /320 NTU Videos Require Manual Access/isu);
  assert.match(nodeLabel(mv, 'sample_frames'), /VideoChat2 Notebook Reference.*16 Frames.*Other Models Set Their Own Inputs/isu);
  assert.match(nodeLabel(mv, 'score_row'), /Option Tokens Contain Either Way.*Ignore Answer Content.*No LLM Judge/isu);
  assert.match(nodeLabel(mv, 'aggregate'), /Overall Correct \/ 4,000.*Equal 200 Rows per Task/isu);

  const mantis = readSpec('Mantis-Eval');
  assert.match(nodeLabel(mantis, 'release'), /217 Test Examples.*2\.5 Images.*Maximum 5/isu);
  assert.match(nodeLabel(mantis, 'sequence_input'), /True Path.*Interleaved.*Missing Image Placeholders.*Released Image Order/isu);
  assert.match(nodeLabel(mantis, 'flat_input'), /False Path.*Images-first.*QwenVL Keeps List.*Other Wrappers May Merge/isu);
  assert.match(nodeLabel(mantis, 'mc_parse'), /Final Answer:.*The Answer Is.*Answer:.*First Alphabetic Character/isu);
  assert.match(nodeLabel(mantis, 'text_fallback'), /Raw Response.*Strip A\..*A:.*\(A\).*Gold Option.*Case-sensitive Exact Equality/isu);
  assert.match(nodeLabel(mantis, 'short_parse'), /Marker Precedence.*Else Keep Raw.*Case-insensitive Exact Equality/isu);
  assert.match(nodeLabel(mantis, 'aggregate'), /200-row Denominator.*17-row Denominator.*217-row Denominator/isu);
  assert.match(nodeLabel(mantis, 'construction_boundary'), /Candidate Counts.*Rejection Rules.*QC Review.*Adjudication.*Distractor Generation/isu);
  assert.match(nodeLabel(mantis, 'release_snapshot'), /217 Rows.*200 MCQ.*17 Short.*145 \/ 39 \/ 32 \/ 1/isu);
  assert.match(nodeLabel(mantis, 'source_boundary'), /Google Search.*Manual 50.*ChatGPT 42.*ImagenHub 28/isu);
});

test('pins exact A11q paper, repository, dataset, evaluator, and release revisions', () => {
  const expected = new Map([
    ['MT-AIME2024', { paper_url: 'https://arxiv.org/abs/2502.17407v2', arxiv_pdf_url: 'https://arxiv.org/pdf/2502.17407v2', homepage: 'https://huggingface.co/datasets/amphora/MCLM/tree/aa789e49b04d5ca054c3a2a70d9bacd8a7499106', openness: 'public', has_leaderboard: false }],
    ['MT-Bench-101', { paper_url: 'https://arxiv.org/abs/2402.14762v3', arxiv_pdf_url: 'https://arxiv.org/pdf/2402.14762v3', homepage: 'https://github.com/mtbench101/mt-bench-101/tree/bc18b3e2c18c99164e11528f1a79c92083db5953', openness: 'public', has_leaderboard: false }],
    ['MTVQA', { paper_url: 'https://arxiv.org/abs/2405.11985v5', arxiv_pdf_url: 'https://arxiv.org/pdf/2405.11985v5', homepage: 'https://bytedance.github.io/MTVQA/', openness: '数据公开（CC BY-NC 4.0）；代码仓库未声明许可证', has_leaderboard: true }],
    ['MUIRBENCH', { paper_url: 'https://arxiv.org/abs/2406.09411v2', arxiv_pdf_url: 'https://arxiv.org/pdf/2406.09411v2', homepage: 'https://muirbench.github.io/', openness: '数据公开（CC BY 4.0，源图权利各异）；代码仓库未声明许可证', has_leaderboard: false }],
    ['MVBench', { paper_url: 'https://arxiv.org/abs/2311.17005v4', arxiv_pdf_url: 'https://arxiv.org/pdf/2311.17005v4', homepage: 'https://github.com/OpenGVLab/Ask-Anything/tree/4dd8210b030374bb0c510a57dfbe916f70d3ef71/video_chat2', openness: 'partly public', has_leaderboard: true }],
    ['Mantis-Eval', { paper_url: 'https://arxiv.org/abs/2405.01483v3', arxiv_pdf_url: 'https://arxiv.org/pdf/2405.01483v3', homepage: 'https://github.com/TIGER-AI-Lab/Mantis/tree/f3a319202d882a1794d28440b77bba7c58869a9e', openness: 'public', has_leaderboard: true }],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    for (const [field, value] of Object.entries(fields)) assert.equal(detail[field], value, id + '.' + field);
    assert.ok(detail.drawio_review_note.length >= 1_000, id + ' detailed review note');
  }
  assert.match(readDetail('MT-AIME2024').drawio_review_note, /aa789e49b04d5ca054c3a2a70d9bacd8a7499106.*99eef7f6a3e3fd3eb5fad66686bd887a744ef9ae.*7504d56a60f14a541b681eb582dbf7d178ccc97141392d3fd074e7ce3641ec75/isu);
  assert.match(readDetail('MT-Bench-101').drawio_review_note, /bc18b3e2c18c99164e11528f1a79c92083db5953.*da7b1c3a007efea1dcca985a242e13a0ba51abd1.*1a1e433acf7e2ef013b5001b60fd8e48bc3e4202460727e25b2ea8575aae7d80/isu);
  assert.match(readDetail('MTVQA').drawio_review_note, /f37ab7e63539235609fb655101b71443750a11fca48896a7988a402af13f8279.*efc6a78a701516a76649430e1100c98e2904a7d8.*9659063458f3f9bbba8e70877277469b90171194.*7cdca63ec6cd71cdd0b52f79fc3176bb9ce36a9c/isu);
  assert.match(readDetail('MUIRBENCH').drawio_review_note, /e1f166ca3e2bee85d11d2cf370620d61afcd9210b65f3d318107cbe1fb619abe.*840b85fe960ab6160cd566fe8360bfa80f9164db.*4c393cffc985c77d28de3b9045e2e5186920df80/isu);
  assert.match(readDetail('MVBench').drawio_review_note, /4dd8210b030374bb0c510a57dfbe916f70d3ef71.*eb6a79a080abbaa4e1c75cf5da135067a9da4c00.*71ac7a28183a3d9610ad149f19ee2195cc31c65e.*230a2d4fac8900333c61754641c7a13e069ac9c6/isu);
  assert.match(readDetail('Mantis-Eval').drawio_review_note, /f3a319202d882a1794d28440b77bba7c58869a9e.*44d20bf6d3c0a3f4e3da040829a2d234c67c79a0.*33561424de2e03b46382bbdbad977af752c32954.*a3d92f9eb22c31d8c2d9d5b432c5a0ff1ef6dfd5/isu);
});

test('keeps every A11q fallback byte-synchronized with each exact source and formal arch', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      const arch = readArch(id, language);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec), id + '.' + language + ' exact arch');
      assert.equal(arch.title, spec.meta.title, id + '.' + language + ' arch title');
      assert.equal(arch.source, spec.meta.source ?? 'generated', id + '.' + language + ' arch source');
      assert.equal(arch.profile, spec.meta.profile, id + '.' + language + ' arch profile');
      assert.equal(arch.theme, spec.meta.theme, id + '.' + language + ' arch theme');
      assert.equal(arch.layout, spec.meta.layout, id + '.' + language + ' arch layout');
      assert.deepEqual(arch.counts, { ...expectedCounts.get(id), modules: (spec.modules ?? []).length }, id + '.' + language + ' arch counts');
      assert.equal(detail['flowchart_' + language], renderFallback(spec), id + '.' + language + ' source fallback');
      assert.equal(detail['flowchart_' + language], renderFallback(arch), id + '.' + language + ' arch fallback');
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, id + '.generic fallback');
  }
});

test('publishes exact parent-labeled Draw.io topology with native fixed-light SVG and PNG', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id + ' bilingual formal topology');
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, id + '.' + language);
      const drawio = readFileSync(base + '.drawio', 'utf8');
      const svg = readFileSync(base + '.svg', 'utf8');
      const formal = formalGraph(drawio, arch, id + '.' + language);
      assert.deepEqual(formal.edges, arch.edges.map(edge => ({ from: edge.from, to: edge.to, label: normalizedLabel(edge.label ?? '') })), id + '.' + language + ' Draw.io topology');
      assert.deepEqual(
        formal.cells.edges.map(tag => normalizedLabel(readAttribute(tag, 'value'))).filter(Boolean).sort(),
        arch.edges.map(edge => normalizedLabel(edge.label ?? '')).filter(Boolean).sort(),
        id + '.' + language + ' parent edge-label multiset',
      );
      assert.equal(formal.cells.childEdgeLabels.length, 0, id + '.' + language + ' child edge labels');
      assert.match(drawio, /<mxGraphModel[^>]*\bmath="0"[^>]*\bbackground="#FFFFFF"/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      for (const tag of [...formal.cells.nodes, ...formal.cells.edges]) {
        const style = readAttribute(tag, 'style');
        assert.match(style, /(?:^|;)html=0(?:;|$)/u, id + '.' + language + ' native text');
        assert.match(style, /(?:^|;)convertToSvg=1(?:;|$)/u, id + '.' + language + ' SVG conversion');
      }
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|Text is not SVG - cannot display|light-dark\s*\(|prefers-color-scheme|color-scheme:\s*light\s+dark/iu, id + '.' + language + ' fixed-light native SVG');
      const svgSearchable = searchableLabel(svg.replace(/<[^>]+>/gu, ' '));
      for (const label of [...arch.nodes.map(node => node.label), ...arch.edges.map(edge => edge.label ?? '')]) {
        for (const line of String(label).split(/\r?\n/gu).filter(Boolean)) {
          const needle = searchableLabel(line);
          assert.ok(needle.length < 3 || svgSearchable.includes(needle), id + '.' + language + '.svg missing visible line: ' + line);
        }
      }
      const dimensions = pngDimensions(base + '.png');
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, id + '.' + language + ' PNG dimensions');
    }
  }
});

test('reproduces exactly all twelve A11q SVG and PNG exports from checked-in Draw.io', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11q-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, id + '.' + language);
        const generatedSvg = join(tempRoot, id + '.' + language + '.svg');
        const generatedPng = join(tempRoot, id + '.' + language + '.png');
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, base + '.drawio'], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(generatedSvg, base + '.svg', id + '.' + language + '.svg bytes');
        execFileSync(drawioDesktop, ['-x', '-f', 'png', '-o', generatedPng, base + '.drawio'], { stdio: 'pipe' });
        assertPngFidelity(generatedPng, base + '.png', id + '.' + language + '.png fidelity');
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and parent-normalizes all twelve A11q specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11q-builds-'));
  let rebuildCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, id + '.' + language);
        const generated = join(tempRoot, id + '.' + language + '.drawio');
        execFileSync(process.execPath, [drawioCli, base + '.spec.yaml', generated, '--validate', '--strict', '--write-sidecars'], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(base + '.drawio', 'utf8'), id + '.' + language + '.drawio bytes');
        assert.equal(readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'), readFileSync(base + '.arch.json', 'utf8'), id + '.' + language + '.arch bytes');
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
