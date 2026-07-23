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
  'MMSU',
  'MMT-Bench',
  'MMVP',
  'MMVU',
  'MORSE-500',
  'MSEarthMCQ',
];
const expectedCounts = new Map([
  ['MMSU', { nodes: 30, edges: 32 }],
  ['MMT-Bench', { nodes: 30, edges: 31 }],
  ['MMVP', { nodes: 19, edges: 20 }],
  ['MMVU', { nodes: 29, edges: 34 }],
  ['MORSE-500', { nodes: 18, edges: 21 }],
  ['MSEarthMCQ', { nodes: 21, edges: 27 }],
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

test('keeps all six A11p source packages bilingual, geometric, language-pure, and explicit', () => {
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

test('uses only valid academic font overrides across the A11p source specs', () => {
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

test('locks MMSU v3 construction, retained-revision loops, and evaluator denominator drift', () => {
  const graph = readSpec('MMSU');
  assert.match(nodeLabel(graph, 'evidence'), /2506\.04779v3.*217d1d3f.*548e2283/isu);
  assert.match(nodeLabel(graph, 'framework'), /Six Named Subfields.*47 Spoken-language Tasks/isu);
  assert.match(nodeLabel(graph, 'open_audio'), /3,837 Clips.*76\.74%/isu);
  assert.match(nodeLabel(graph, 'custom_audio'), /672 Clips.*13\.44%.*Professional Actors.*15 Diverse Real Speakers/isu);
  assert.match(nodeLabel(graph, 'synthetic'), /491 Clips.*9\.82%.*Azure.*20 Selected Voices/isu);
  assert.match(nodeLabel(graph, 'pair_review'), /Five Groups.*Two Annotators Each.*1,000 Items per Pair.*Four Criteria/isu);
  assert.match(nodeLabel(graph, 'revise'), /Re-record.*Rewrite.*Modify Choices.*Retained Revisions Return/isu);
  assert.match(nodeLabel(graph, 'cross_review'), /Shuffle Whole Dataset.*Different Pair/isu);
  assert.match(nodeLabel(graph, 'revise_round'), /2–3 Rounds/isu);
  assert.match(nodeLabel(graph, 'expert_final'), /Three Linguistics Experts.*No More Than 20 Minor Adjustments/isu);
  assert.match(nodeLabel(graph, 'dataset'), /5,000 MCQs.*47 Tasks.*2,580.*2,420.*7\.01 Seconds/isu);
  assert.match(nodeLabel(graph, 'release_boundary'), /548e2283.*5,000 Rows.*13 Fields.*MIT/isu);
  assert.match(nodeLabel(graph, 'paper_eval'), /22 Models.*12 SpeechLLMs.*10 OmniLLMs.*Balanced A–D/isu);
  assert.match(nodeLabel(graph, 'evaluator_boundary'), /Does Not Specify Response Parser.*February 2026.*No Revision Pin/isu);
  assert.match(nodeLabel(graph, 'load_jsonl'), /Malformed JSON Lines Are Skipped.*No 5,000-ID Completeness Check.*Duplicate.*Unknown/isu);
  assert.match(nodeLabel(graph, 'first_gate'), /First Character.*Uppercase A–D/isu);
  assert.match(nodeLabel(graph, 'second_gate'), /Length > 1.*Second-last.*A–D/isu);
  assert.match(nodeLabel(graph, 'skipped'), /Skip Row Entirely.*Nonempty Malformed.*Normalization Exception.*Excluded from Denominator/isu);
  assert.match(nodeLabel(graph, 'metrics'), /Micro Accuracy.*Denominator Follows Accepted Rows/isu);
  assert.match(nodeLabel(graph, 'compare_gate'), /Exact Match.*Contribution 1.*Mismatch.*Contribution 0/isu);
  assert.deepEqual(
    graph.edges.filter(edge => edge.from === 'compare_gate').map(edge => edge.to),
    ['metrics'],
  );
});

test('locks MMT-Bench construction, 30-model paper scope, parser drift, and task-map protocol', () => {
  const graph = readSpec('MMT-Bench');
  assert.match(nodeLabel(graph, 'evidence'), /2404\.16006v1.*8ec8203c.*5e900028.*2255d3a7/isu);
  assert.match(nodeLabel(graph, 'meta'), /All Coauthors.*Deduplicate.*32 Meta-tasks/isu);
  assert.match(nodeLabel(graph, 'criteria_gate'), /All Three Subtask Criteria/isu);
  assert.match(nodeLabel(graph, 'sampling'), /At Most 200 per Subtask.*Equal Samples per Contributing Dataset/isu);
  assert.match(nodeLabel(graph, 'metadata'), /Manually Tag Required Capability.*Visual-prompt.*Input-image Type/isu);
  assert.match(nodeLabel(graph, 'rules'), /Random Distractor Images.*Up to Eight Choices/isu);
  assert.match(nodeLabel(graph, 'chatgpt'), /Confusing Wrong Choices.*Up to Eight Choices/isu);
  assert.match(nodeLabel(graph, 'dataset'), /31,325.*32 Meta-tasks.*162 Subtasks.*13 Visual Input Types.*14 Capabilities/isu);
  assert.match(nodeLabel(graph, 'release_boundary'), /2255d3a7.*CC BY 4\.0.*84012c95.*Root Has No LICENSE/isu);
  assert.match(nodeLabel(graph, 'paper_eval'), /30 Publicly Available LVLMs/isu);
  assert.match(nodeLabel(graph, 'parser_drift'), /Paper Failure → Z.*Random Choice \/ Z.*A–D.*Up to 8 Choices.*Row-weighted.*Subtask Mean/isu);
  assert.match(nodeLabel(graph, 'accuracy'), /Z Is Wrong.*Meta = Mean of All Its Subtasks.*Overall\* Excludes Visual Recognition/isu);
  assert.match(nodeLabel(graph, 'probe'), /Qwen-VL-Chat.*Pretrained Initial Weights/isu);
  assert.match(nodeLabel(graph, 'vectors'), /Three Epochs.*162 Subtasks.*3\.5M Parameters/isu);
  assert.match(nodeLabel(graph, 'distance'), /162 × 162.*1 − Cosine Similarity.*0 to 2/isu);
  assert.match(nodeLabel(graph, 'task_map'), /12 Clusters.*Kendall Tau.*In-domain.*Out-of-domain/isu);
  assert.match(nodeLabel(graph, 'valid_gate'), /Valid Option.*Compare against Gold.*No \/ Refusal.*Z.*Always Incorrect/isu);
  assert.deepEqual(
    graph.edges.filter(edge => edge.from === 'valid_gate').map(edge => edge.to),
    ['accuracy'],
  );
});

test('locks MMVP parallel blindness selection, consecutive-pair scoring, and separate human study', () => {
  const graph = readSpec('MMVP');
  const edges = edgeSignatures(graph);
  assert.ok(edges.has('candidate_pairs->clip:'));
  assert.ok(edges.has('candidate_pairs->dino:'));
  assert.ok(edges.has('clip->blind_gate:'));
  assert.ok(edges.has('dino->blind_gate:'));
  assert.ok(![...edges].some(edge => edge.startsWith('clip->dino:')), 'CLIP and DINO must remain parallel');
  assert.match(nodeLabel(graph, 'corpora'), /ImageNet-1K.*LAION-Aesthetics.*§2\.1/isu);
  assert.match(nodeLabel(graph, 'clip'), /CLIP ViT-L-14.*Cosine Similarity/isu);
  assert.match(nodeLabel(graph, 'dino'), /DINOv2 ViT-L-14.*Cosine Similarity/isu);
  assert.match(nodeLabel(graph, 'not_blind'), /At Most 0\.95.*At Least 0\.6/isu);
  assert.ok(edges.has('blind_gate->inspect:CLIP > 0.95 and DINOv2 < 0.6'));
  assert.match(nodeLabel(graph, 'questions'), /Two Paired Questions.*One Question per Image.*Direct and Unambiguous/isu);
  assert.match(nodeLabel(graph, 'release'), /150 Image Pairs.*300 Questions.*2401\.06209v2/isu);
  assert.match(nodeLabel(graph, 'patterns'), /Nine Visual Patterns.*Direction.*Presence.*State.*Count.*Position.*Appearance.*Structure.*Text.*Viewpoint/isu);
  assert.match(nodeLabel(graph, 'model_runner'), /Independently.*Temp 0\.2.*1,024/isu);
  assert.match(nodeLabel(graph, 'gpt_grader'), /gpt-4-0314.*Temp 0\.2.*Yes or No.*Retry without Cap/isu);
  assert.match(nodeLabel(graph, 'pair_zero'), /Any “no” or Non-yes\/no.*Unparsed Grade Is Not Correct/isu);
  assert.match(nodeLabel(graph, 'paired_accuracy'), /Consecutive Pairs \/ 150.*25%/isu);
  assert.match(nodeLabel(graph, 'human_study'), /Four Volunteers.*300 Questions.*95\.7%/isu);
  assert.match(nodeLabel(graph, 'release_boundary'), /37eafecab8a3.*300 Images.*MIT Card.*763500597e65.*LICENSE Absent/isu);
});

test('locks MMVU expert-count conflict, hidden split, rights boundary, and grader failures', () => {
  const graph = readSpec('MMVU');
  assert.match(nodeLabel(graph, 'study'), /133 College \/ Graduate Students.*Two.*Examples.*27 Subjects \/ 4 Disciplines/isu);
  assert.match(nodeLabel(graph, 'experts'), /Main §3\.1: 67 Total.*Appendix A\.1: 73 IDs Listed.*At Least Two per Subject/isu);
  assert.match(nodeLabel(graph, 'concepts'), /Authoritative Texts.*Every Chapter.*Dynamic Visual Concepts/isu);
  assert.match(nodeLabel(graph, 'videos'), /YouTube.*CC Verified.*Data API v3.*No Audio.*Minimal On-screen Text.*No Lectures/isu);
  assert.match(nodeLabel(graph, 'questions'), /Two or Three Questions.*Domain Knowledge.*Start \/ End Timestamps/isu);
  assert.match(nodeLabel(graph, 'mcq'), /Four Plausible Distractors.*Five Options.*Randomly Shuffles/isu);
  assert.match(nodeLabel(graph, 'solutions'), /Wikipedia-linked Knowledge.*Step-by-step Rationale.*GPT-4o-proofread/isu);
  assert.match(nodeLabel(graph, 'validation'), /Top-annotator Review.*Text-only.*One-frame.*Video Necessity/isu);
  assert.match(nodeLabel(graph, 'revise'), /523 Examples Revised.*Second Expert Review/isu);
  assert.match(nodeLabel(graph, 'excluded'), /72 Examples Removed/isu);
  assert.match(nodeLabel(graph, 'release'), /3,000 QA.*1,529 Videos.*1,858 MCQ.*1,142 Open.*4d54223d912f/isu);
  assert.match(nodeLabel(graph, 'rights_boundary'), /YouTube CC.*License Undeclared.*CC BY-SA Is Site-only/isu);
  assert.match(nodeLabel(graph, 'public_validation'), /b937f414a87e.*1,000 Rows.*625 MCQ \/ 375 Open.*Knowledge.*Rationale Populated/isu);
  assert.match(nodeLabel(graph, 'hidden_test'), /2,000 Items.*Author-held.*Author-run.*Not Independently Inspectable/isu);
  assert.match(nodeLabel(graph, 'inference'), /CoT or Direct.*Temp 1\.0.*1,024.*8,192/isu);
  assert.match(nodeLabel(graph, 'mcq_grade'), /GPT-4o.*A–E.*Ground Truth.*Boolean/isu);
  assert.match(nodeLabel(graph, 'open_grade'), /Explicit, Unambiguous.*Equivalent Technique \/ Concept.*Do Not Invent/isu);
  assert.match(nodeLabel(graph, 'grader_failure'), /Bad Request or 10 Attempts Exhausted.*Empty Extracted Answer.*correct=False/isu);
  assert.match(nodeLabel(graph, 'accuracy'), /Correct Items \/ Evaluated Items.*Unversioned “gpt-4o” Alias/isu);
});

test('locks MORSE-500 and MSEarthMCQ release totals, failure paths, and denominator boundaries', () => {
  const morse = readSpec('MORSE-500');
  assert.match(nodeLabel(morse, 'design'), /Six Reasoning Categories.*Animations.*Robotics.*Physics/isu);
  assert.match(nodeLabel(morse, 'implement'), /Domain Experts.*Vibe Coding.*Manim.*Matplotlib.*OpenCV.*MoviePy/isu);
  assert.match(nodeLabel(morse, 'generate'), /Five Complexity Dimensions.*Deterministic Labels.*Embedded Questions/isu);
  assert.match(nodeLabel(morse, 'auto_qc'), /≥512p.*Codec.*Complete Content.*Parameter-label Consistency/isu);
  assert.match(nodeLabel(morse, 'human_qc'), /One Answer.*Visually Grounded.*Human-solvable/isu);
  assert.match(nodeLabel(morse, 'repair'), /2-3 Rounds per Category/isu);
  assert.match(nodeLabel(morse, 'release'), /500 Videos.*3\.1 Hours.*A64.*M84.*P64.*Plan100.*S108.*T80/isu);
  assert.match(nodeLabel(morse, 'prepare'), /Maximum Side 512 Pixels/isu);
  assert.match(nodeLabel(morse, 'frame_input'), /2 FPS.*At Most 32/isu);
  assert.match(nodeLabel(morse, 'extract'), /Qwen2\.5-72B-Instruct-AWQ.*Temperature 0.*First Nonempty Line/isu);
  assert.match(nodeLabel(morse, 'extraction_error'), /Literal “Error”.*Keep Row/isu);
  assert.match(nodeLabel(morse, 'compare'), /Exact String.*Stripped-empty.*“non”.*Missing → “nan” and Remains/isu);
  assert.match(nodeLabel(morse, 'score'), /Correct \/ Remaining Questions.*Six Categories/isu);

  const earth = readSpec('MSEarthMCQ');
  const edges = edgeSignatures(earth);
  assert.match(nodeLabel(earth, 'papers'), />400K.*MinerU JSON.*CC BY 4\.0.*Five Earth Spheres/isu);
  assert.match(nodeLabel(earth, 'filter'), /Qwen2\.5-VL-72B.*Repeated Sampling.*About 83K Papers/isu);
  assert.match(nodeLabel(earth, 'align'), />2 Sentences.*64,560 Papers.*289,891 Figures/isu);
  assert.match(nodeLabel(earth, 'refine'), /GPT-4o.*Original Caption.*Paper Context.*Valid-context/isu);
  assert.match(nodeLabel(earth, 'phase_a'), /Original Caption.*Five MLLMs/isu);
  assert.match(nodeLabel(earth, 'phase_b'), />60% Correct.*Refined Caption.*Same Five/isu);
  assert.match(nodeLabel(earth, 'phase_c'), />60% Correct.*GPT-4o.*InternVL2\.5-78B.*Qwen2\.5-VL-72B/isu);
  assert.ok(edges.has('phase_a->discard:All correct'));
  assert.ok(edges.has('phase_a->phase_b:>40% wrong'));
  assert.ok(edges.has('phase_a->sample:Otherwise'));
  assert.ok(edges.has('phase_b->sample:Pass >60%'));
  assert.ok(edges.has('phase_b->phase_c:Fail ≤60%'));
  assert.ok(edges.has('phase_c->sample:Pass >60%'));
  assert.ok(edges.has('phase_c->discard:Fail ≤60%'));
  assert.match(nodeLabel(earth, 'sample'), /3,000 MCQs.*900.*1,800.*300.*Expert Review/isu);
  assert.match(nodeLabel(earth, 'expert_valid'), /Master's-level Earth Scientists.*Complete Question.*Correct Answer/isu);
  assert.match(nodeLabel(earth, 'release'), /2,784 MCQs.*216 Removals.*2,117.*667.*1,255.*1,529/isu);
  assert.match(nodeLabel(earth, 'model_answer'), /Image.*Question.*Original Caption.*JSON Answer and Explanation/isu);
  assert.match(nodeLabel(earth, 'omitted'), /Processing Exception.*No Result Row/isu);
  assert.match(nodeLabel(earth, 'initial_compare'), /Regex Option.*Raw Answer Text.*Gold Option or Content/isu);
  assert.match(nodeLabel(earth, 'similarity'), /all-MiniLM-L6-v2.*Closest Option Text/isu);
  assert.match(nodeLabel(earth, 'retry_compare'), /May Flip Initial Error to Correct/isu);
  assert.match(nodeLabel(earth, 'score'), /Correct \/ Evaluated Mapped Rows.*Analysis Slices/isu);
});

test('pins exact A11p paper, repository, dataset, evaluator, and release revisions', () => {
  const expected = new Map([
    ['MMSU', {
      paper_url: 'https://arxiv.org/abs/2506.04779v3',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2506.04779v3',
      homepage: 'https://github.com/dingdongwang/MMSU/tree/217d1d3f5ad59203ed16f44c0fd913f4f8add2b4',
      openness: 'public',
      has_leaderboard: true,
    }],
    ['MMT-Bench', {
      paper_url: 'https://arxiv.org/abs/2404.16006v1',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2404.16006v1',
      homepage: 'https://github.com/OpenGVLab/MMT-Bench/tree/5e900028e8bc5636ce31dd263e975e3882c29f82',
      org: 'Shanghai Artificial Intelligence Laboratory, Shanghai Jiao Tong University, The University of Hong Kong, The University of Adelaide, Zhejiang University, Shenzhen Institutes of Advanced Technology, Chinese Academy of Sciences',
      openness: 'public',
      has_leaderboard: true,
    }],
    ['MMVP', {
      paper_url: 'https://arxiv.org/abs/2401.06209v2',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2401.06209v2',
      homepage: 'https://github.com/tsb0601/MMVP',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MMVU', {
      paper_url: 'https://arxiv.org/abs/2501.12380v1',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2501.12380v1',
      homepage: 'https://mmvu-benchmark.github.io/',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MORSE-500', {
      paper_url: 'https://arxiv.org/abs/2506.05523v1',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2506.05523v1',
      homepage: 'https://morse-500.github.io/',
      org: 'University of Maryland, College Park, Capital One',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MSEarthMCQ', {
      paper_url: 'https://arxiv.org/abs/2505.20740v3',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2505.20740v3',
      homepage: 'https://huggingface.co/datasets/MSEarth-Data/MSEarth-Benchmark-MCQ',
      openness: 'public',
      has_leaderboard: false,
    }],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(detail[field], value, `${id}.${field}`);
    }
  }
  assert.match(readDetail('MMSU').drawio_review_note, /f07121645670c3d9b78340a7a4ec0e3116fd8820a32cf9e1ddafb59a724998a2.*217d1d3f5ad59203ed16f44c0fd913f4f8add2b4.*698fac8b7d1b7295cd6688e9fa7197ed34ec155e.*548e2283105825bf908a7db5c09c00dbcf42bd4c/isu);
  assert.match(readDetail('MMT-Bench').drawio_review_note, /386e96e079eb0cc4ac0d7ef5700e4f924780975cebaef62b4afa6828b0ad3ee1.*8ec8203c44b420d299e01a5f74410455da34a52d.*e700458829d134ece339b65731d5aae988be1fe5.*5e900028e8bc5636ce31dd263e975e3882c29f82.*2255d3a7b250ae6d87383dbb9ab0d6416432ece7.*84012c95e31c2986521ea5b7c16a88e36e9958c2/isu);
  assert.match(readDetail('MMT-Bench').drawio_review_note, /valid choices plus Z with seed 2680/isu);
  assert.match(readDetail('MMVP').drawio_review_note, /763500597e65c3446f09047837ceda76f4e264bf.*37eafecab8a3940c50c2ade5b36de69dbc99a8cf/isu);
  assert.match(readDetail('MMVP').drawio_review_note, /300 images.*301-line Questions\.csv including its header/isu);
  assert.match(readDetail('MMVU').drawio_review_note, /4d54223d912f498707c105ab645a921abce6e39a.*b937f414a87e9012acba49d95669020b24fa9ee9/isu);
  assert.match(readDetail('MORSE-500').drawio_review_note, /07743de968fe3e64f9797eb327f2811aac4adafb.*2f441908e0f524c49ded73dee00a3ee5527cfa35/isu);
  assert.match(readDetail('MORSE-500').drawio_review_note, /dataset card declares CC BY 4\.0.*code repository LICENSE is CC BY-SA 4\.0/isu);
  assert.match(readDetail('MSEarthMCQ').drawio_review_note, /d3ad753c2a4d7ba244d8bf8ece5ec3ba5413cc39.*0eea8f4d9ae7c9f37a10de66f142d585c7f3c53a/isu);
  assert.match(readDetail('MSEarthMCQ').drawio_review_note, /dataset card has no license metadata.*OpenDataLab.*CC BY 4\.0/isu);
});

test('keeps every A11p fallback byte-synchronized with each exact source and formal arch', () => {
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

test('reproduces exactly all twelve A11p SVG and PNG exports from checked-in Draw.io', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11p-exports-'));
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
        assertSvgFidelity(
          generatedSvg,
          `${base}.svg`,
          `${id}.${language}.svg bytes`,
        );
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`],
          { stdio: 'pipe' },
        );
        assertPngFidelity(
          generatedPng,
          `${base}.png`,
          `${id}.${language}.png fidelity`,
        );
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and parent-normalizes all twelve A11p specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11p-builds-'));
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
