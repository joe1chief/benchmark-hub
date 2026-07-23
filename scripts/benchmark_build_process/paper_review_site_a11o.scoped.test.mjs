import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'MMLongBench',
  'MMLongBench-Doc',
  'MMMLU',
  'MMMLU-non-English',
  'MMMU',
  'MMSIBench',
];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(root, 'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs');
const svgNormalizer = join(root, 'scripts/benchmark_build_process/normalize_drawio_svg.mjs');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';
const imageCompare = [
  process.env.IMAGEMAGICK_COMPARE,
  '/opt/homebrew/bin/compare',
  '/usr/local/bin/compare',
].find(path => path && existsSync(path));

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const readSpec = (id, language = 'en') => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const labels = graph => graph.nodes.map(node => node.label).join('\n');
const nodeLabel = (graph, id) => {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
};

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
      ({ from, to, type, style, labelPosition }) => ({ from, to, type, style, labelPosition }),
    ),
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

function svgVisibleText(svg) {
  return svg
    .replace(/<[^>]*>/gu, '\n')
    .replace(/\\\((.*?)\\\)/gu, '$1')
    .replace(/&#x([0-9a-f]+);/giu, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/gu, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all six A11o source packages bilingual, academic, and explicit at every decision', () => {
  const requiredNodes = new Map([
    ['MMLongBench', ['evidence', 'category_route', 'doc_length_gate', 'metric_route', 'summ_parse_gate', 'doc_format', 'report']],
    ['MMLongBench-Doc', ['evidence', 'document_route', 'source_outcome', 'relevance_gate', 'crosscheck_gate', 'parse_gate', 'answer_format']],
    ['MMMLU', ['evidence', 'translation_boundary', 'access_gate', 'debug_gate', 'language_gate', 'response_gate', 'parse_gate', 'implementation_drift']],
    ['MMMLU-non-English', ['evidence', 'identity', 'scope_boundary', 'model_gate', 'dispatch_gate', 'candidate_gate', 'match_gate', 'metric_drift']],
    ['MMMU', ['evidence', 'scope', 'difficulty', 'final_set', 'qtype', 'mc_valid', 'open_valid', 'aggregate']],
    ['MMSIBench', ['evidence', 'taxonomy', 'dependent', 'quality', 'strategy', 'parsed', 'fallback_valid', 'analyze']],
  ]);

  for (const id of benchmarkIds) {
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual structure`);
    assert.ok(
      zh.nodes.filter(node => /[\u3400-\u9fff]/u.test(String(node.label))).length
        >= Math.floor(zh.nodes.length * 0.6),
      `${id} Chinese labels`,
    );

    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      const nodeIds = new Set(spec.nodes.map(node => node.id));
      assert.equal(nodeIds.size, spec.nodes.length, `${id}.${language} unique node ids`);
      for (const nodeId of requiredNodes.get(id)) {
        assert.ok(nodeIds.has(nodeId), `${id}.${language}.${nodeId}`);
      }
      for (const edge of spec.edges) {
        assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to), `${id}.${language} ${edge.from}->${edge.to}`);
      }
      for (const decision of spec.nodes.filter(node => node.type === 'decision')) {
        const outgoing = spec.edges.filter(edge => edge.from === decision.id);
        assert.ok(outgoing.length >= 2, `${id}.${language}.${decision.id} outcomes`);
        assert.ok(outgoing.every(edge => String(edge.label ?? '').trim()), `${id}.${language}.${decision.id} labels`);
        assert.ok(new Set(outgoing.map(edge => edge.to)).size >= 2, `${id}.${language}.${decision.id} targets`);
        for (const edge of outgoing) {
          const label = String(edge.label).trim();
          if (language === 'en') {
            assert.doesNotMatch(label, /[\u3400-\u9fff]/u, `${id}.en.${decision.id} mixed label`);
          } else {
            assert.match(label, /[\u3400-\u9fff]/u, `${id}.zh.${decision.id} lacks Chinese semantics`);
            assert.doesNotMatch(
              label,
              /[A-Za-z][^|\n]*\s\/\s.*[\u3400-\u9fff]/u,
              `${id}.zh.${decision.id} retains English / Chinese concatenation`,
            );
          }
        }
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length >= 1_000, `${id} review evidence`);
  }
});

test('uses only valid academic font overrides across the A11o source specs', () => {
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
        if (fontSize === undefined) continue;
        if (typeof fontSize !== 'number' || fontSize < 8 || fontSize > 10) {
          violations.push(`${id}.${language}.${node.id} invalid fontSize=${fontSize}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('locks both MMLongBench construction and evaluator failure boundaries', () => {
  const suite = readSpec('MMLongBench');
  assert.match(nodeLabel(suite, 'evidence'), /2505\.10610v3.*69044ca.*0c008eb.*13,331 Rows.*16 Source Datasets/isu);
  assert.match(nodeLabel(suite, 'vrag_build'), /2,272 Rows.*InfoSeek.*ViQuAE.*3 Permutations.*6 Gold Depths/isu);
  assert.match(nodeLabel(suite, 'niah_build'), /5,536 Rows.*VH-Single.*MM-NIAH/isu);
  assert.match(nodeLabel(suite, 'icl_build'), /1,958 Rows.*5\/10\/20\/40\/50 Classes.*Truncate Only the Last Round/isu);
  assert.match(nodeLabel(suite, 'summ_build'), /387 Rows.*15,951 Claims/isu);
  assert.match(nodeLabel(suite, 'doc_build'), /3,178 Rows.*MMLongBench-Doc.*LongDocURL.*SlideVQA/isu);
  assert.match(nodeLabel(suite, 'release'), /13,331 Examples.*961 Rows.*1,082-row Release/isu);
  assert.match(nodeLabel(suite, 'denominator'), /900.*2,250.*400.*200.*300.*4,050/isu);
  assert.match(nodeLabel(suite, 'inference'), /4,050 × 5 = 20,250 Runs.*N\/A/isu);
  assert.match(nodeLabel(suite, 'summ_skip'), /Retry 5×, Then Raise.*Invalid JSON: Skip.*gpt4-scores Only.*Zero Scored Rows → Raise/isu);
  assert.match(nodeLabel(suite, 'doc_parse'), /Answer:.*First Output Line.*No GPT-4o Answer Extractor in v3/isu);
  assert.match(nodeLabel(suite, 'doc_list'), /Paper: Greedy Best Element Match.*Pinned Code Scores Each Gold Element.*Full Parsed Prediction/isu);

  const doc = readSpec('MMLongBench-Doc');
  assert.match(nodeLabel(doc, 'evidence'), /2407\.01523v3.*88b5f09.*1,082 Rows.*README Says 1,091/isu);
  assert.match(nodeLabel(doc, 'annotators'), /Ten Author-Annotators.*54 Batches.*60–90 Minutes per PDF/isu);
  assert.match(nodeLabel(doc, 'candidates'), /1,176 Candidates.*211 Retained\/Revised.*965 New/isu);
  assert.match(nodeLabel(doc, 'relevance_remove'), /94 Low Document-relevance Items/isu);
  assert.match(nodeLabel(doc, 'adjudicate'), /17\.5% Inconsistent.*κ = 0\.42.*Two Primary Authors/isu);
  assert.match(nodeLabel(doc, 'dataset'), /135 PDFs.*1,082 Questions.*184 Source.*898 New.*494 Single.*365 Cross-page.*223 Unanswerable/isu);
  assert.match(nodeLabel(doc, 'extraction'), /T=0.*max_new_tokens=1024.*GPT-4o.*T=0.*max_tokens=256/isu);
  assert.match(nodeLabel(doc, 'local_zero'), /Extractor Exception Returns “Failed”.*run_lvlm\.py.*→ 0.*run_api\.py.*Aborts/isu);
  assert.match(nodeLabel(doc, 'list_score'), /Python eval.*Unequal Length → 0.*Minimum Pairwise ANLS/isu);
  assert.match(nodeLabel(doc, 'report'), /Mean over 1,082.*Recall Denominator = 859.*Predicted Positives.*494\/365\/223/isu);
});

test('locks MMMLU identity, locale, parser, denominator, and private-protocol boundaries', () => {
  const mmmlu = readSpec('MMMLU');
  assert.match(nodeLabel(mmmlu, 'evidence'), /2009\.03300v3.*325a01dc.*01c488b.*652c89d/isu);
  assert.match(nodeLabel(mmmlu, 'paper_scope'), /Source MMLU Paper, Not MMMLU.*57.*15,908.*14,079/isu);
  assert.match(nodeLabel(mmmlu, 'public_test'), /14,042 Rows.*57 Subjects.*37 Fewer/isu);
  assert.match(nodeLabel(mmmlu, 'locale_release'), /14 Locale CSV Files.*AR.*BN.*DE.*ES.*FR.*HI.*ID.*IT.*JA.*KO.*PT.*SW.*YO.*ZH/isu);
  assert.match(nodeLabel(mmmlu, 'release_audit'), /14 × 14,042 = 196,588.*5 Blank Choice Cells.*Gold Differs in 6 Locales.*SW\/YO Subject Drift 445/isu);
  assert.match(nodeLabel(mmmlu, 'default_config'), /196,588 Test Rows.*No Locale Column/isu);
  assert.match(nodeLabel(mmmlu, 'eval_pin'), /15 Runs: EN-US \+ 14 Translations.*Unversioned OpenAI Blob URLs.*Match HF Pin/isu);
  assert.match(nodeLabel(mmmlu, 'debug_sample'), /debug = True.*seed = 0.*10 Items per Locale.*Not a Full/isu);
  assert.match(nodeLabel(mmmlu, 'request_abort'), /No Item-level Retry.*Aborts the Run.*No Final Denominator/isu);
  assert.match(nodeLabel(mmmlu, 'parse_fail'), /extracted_answer = None.*Item Score = 0.*Stays in Denominator/isu);
  assert.match(nodeLabel(mmmlu, 'metric'), /n = 10 by Default.*n = 14,042 Only after debug = False/isu);
  assert.match(nodeLabel(mmmlu, 'report'), /14 Translations.*Mean of 14 Locale Scores.*EN-US Separate/isu);

  const deepseek = readSpec('MMMLU-non-English');
  assert.match(nodeLabel(deepseek, 'evidence'), /2412\.19437v2.*4c2fdb8.*325a01dc.*9b4e978/isu);
  assert.match(nodeLabel(deepseek, 'identity'), /Evaluation Label.*No Separate Data Release or Config/isu);
  assert.match(nodeLabel(deepseek, 'scope_boundary'), /Does Not Enumerate Locales.*All-14 Inclusion Is Unverified/isu);
  assert.match(nodeLabel(deepseek, 'base_models'), /DeepSeek-V2.*Qwen2\.5-72B.*LLaMA-3\.1-405B.*DeepSeek-V3/isu);
  assert.match(nodeLabel(deepseek, 'ppl_protocol'), /Perplexity Route.*Five-shot.*Exact Prompt Is Not Published/isu);
  assert.match(nodeLabel(deepseek, 'failure_boundary'), /Retry, Skip, Zero, or Abort Policy.*Not Published.*Denominator Effect Cannot Be Rebuilt/isu);
  assert.match(nodeLabel(deepseek, 'aggregation_boundary'), /One Scalar per Model.*Macro vs Micro Pooling Unpublished/isu);
  assert.match(nodeLabel(deepseek, 'report'), /64\.0.*74\.8.*73\.8.*79\.4/isu);
  assert.match(nodeLabel(deepseek, 'metric_drift'), /arXiv v2 Table 3 Says EM.*README Say Acc\..*Values Are Identical/isu);
});

test('locks MMMU and MMSIBench construction, parser fallbacks, schemas, and denominators', () => {
  const mmmu = readSpec('MMMU');
  assert.match(nodeLabel(mmmu, 'evidence'), /2311\.16502v4.*f3e473e1.*ff942ca8.*Apache-2\.0/isu);
  assert.match(nodeLabel(mmmu, 'scope'), /Six Disciplines.*30 Subjects.*183 Subfields.*Visual Input Must Matter/isu);
  assert.match(nodeLabel(mmmu, 'recruit'), /50\+ Students.*Matching University Majors.*English.*College Level/isu);
  assert.match(nodeLabel(mmmu, 'raw'), /13K Questions.*One or More Images.*MC or Short Open/isu);
  assert.match(nodeLabel(mmmu, 'difficulty'), /Four-level Annotation.*Very Easy.*Easy.*Medium.*Hard/isu);
  assert.match(nodeLabel(mmmu, 'final_set'), /11,550 Questions.*10,861 MC.*689 Open.*30 Image Types/isu);
  assert.match(nodeLabel(mmmu, 'split'), /Dev.*150.*Validation.*900.*Test.*10,500/isu);
  assert.match(nodeLabel(mmmu, 'parse_mc'), /Prefer \(A\).*Bare A.*More Than 5 Tokens.*Last Occurrence/isu);
  assert.match(nodeLabel(mmmu, 'mc_random'), /random\.choice.*Seed 42.*Enters Denominator/isu);
  assert.match(nodeLabel(mmmu, 'parse_open'), /Numbers Rounded to 2 Decimals.*Deduplicate Candidates/isu);
  assert.match(nodeLabel(mmmu, 'open_wrong'), /No Random Remedy.*Score = 0.*Denominator/isu);
  assert.match(nodeLabel(mmmu, 'aggregate'), /Micro Accuracy.*Weighted Across Subjects.*Omitted Predictions Are Not Added.*Denominator/isu);
  assert.match(readDetail('MMMU').drawio_review_note, /cc1a89b4a27f697702d340bc6a7578b5237135754ddaa9ef105239a3d9847367.*id, question, options, explanation, image_1 through image_7, img_type, answer, topic_difficulty, question_type, and subfield/isu);

  const mmsi = readSpec('MMSIBench');
  assert.match(nodeLabel(mmsi, 'evidence'), /2505\.23764v3.*13e58a2b.*ec7c92bf.*ICLR 2026/isu);
  assert.match(nodeLabel(mmsi, 'sources'), /Matterport 463.*ScanNet 280.*Ego4D 67.*AgiBot 45.*DTU 72.*nuScenes 39.*DAVIS 29.*Waymo 5/isu);
  assert.match(nodeLabel(mmsi, 'pool'), /120K Candidates.*Indoor.*Outdoor.*Driving/isu);
  assert.match(nodeLabel(mmsi, 'sources'), /No Synthetic Scenes/isu);
  assert.match(nodeLabel(mmsi, 'taxonomy'), /Eleven Tasks.*Six Position.*Two Attributes.*Two Motions.*Multi-step/isu);
  assert.match(nodeLabel(mmsi, 'annotate'), /Six 3D-vision Researchers.*300 Hours.*No Question Templates/isu);
  assert.match(nodeLabel(mmsi, 'select'), /Basic Tasks.*Exactly Two.*Multi-step.*Up to Ten/isu);
  assert.match(nodeLabel(mmsi, 'review'), /Three Independent Experts.*Check Every Sample/isu);
  assert.match(nodeLabel(mmsi, 'final_set'), /1,000 Questions.*1,990 Unique Images.*2\.55.*Maximum Ten/isu);
  assert.match(nodeLabel(mmsi, 'difficulty'), /Two New Evaluators.*Wrong Human Answer = Hard.*605.*262.*133/isu);
  assert.match(nodeLabel(mmsi, 'generate'), /37 MLLMs.*Temperature 0.*2,048 Tokens.*Five-person Human Average/isu);
  assert.match(nodeLabel(mmsi, 'regex'), /Double or Single Backticks.*First Standalone A to D.*Reject A Followed by a Word/isu);
  assert.match(nodeLabel(mmsi, 'fallback'), /Only Three Selected Model Families.*chatgpt-0125.*3 Tries.*A–D or Z/isu);
  assert.match(nodeLabel(mmsi, 'score'), /Denominator = Input Rows.*1,000.*Missing Rows Are Not Inserted/isu);
  assert.match(readDetail('MMSIBench').drawio_review_note, /e551ea1d3ca87c72196dd837d5beec545398d06359bfc5d235558904cf95bec7.*id, images, question_type, question, answer, thought, mean_normed_duration_seconds, and difficulty/isu);
  const edges = new Set(mmsi.edges.map(edge => `${edge.from}->${edge.to}:${edge.label ?? ''}`));
  assert.ok(edges.has('generate->regex:Default released route'));
  assert.ok(edges.has('generate->fallback:Manual route · 3 model families'));
  assert.ok(edges.has('parsed->fallback_fail:Default miss · score 0'));
});

test('pins exact reviewed A11o paper and official release revisions', () => {
  const expected = new Map([
    ['MMLongBench', {
      paper_url: 'https://arxiv.org/abs/2505.10610v3',
      homepage: 'https://github.com/EdinburghNLP/MMLongBench/tree/69044ca7d6734b8820d1cbcc2da8bc65d35c88a7',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MMLongBench-Doc', {
      paper_url: 'https://arxiv.org/abs/2407.01523v3',
      homepage: 'https://github.com/mayubo2333/MMLongBench-Doc/tree/88b5f09fd29a7638b7c4d82aa6c8f5989ca5c145',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MMMLU', {
      paper_url: 'https://arxiv.org/abs/2009.03300v3',
      homepage: 'https://huggingface.co/datasets/openai/MMMLU/tree/325a01dc3e173cac1578df94120499aaca2e2504',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MMMLU-non-English', {
      paper_url: 'https://arxiv.org/abs/2412.19437v2',
      homepage: 'https://github.com/deepseek-ai/DeepSeek-V3/tree/4c2fdb8f55e049553b9f4f1a3241f86d739c8cf8',
      openness: 'partly public',
      has_leaderboard: false,
    }],
    ['MMMU', {
      paper_url: 'https://arxiv.org/abs/2311.16502v4',
      homepage: 'https://github.com/MMMU-Benchmark/MMMU/tree/f3e473e1e7af2c65a56ab66d7b3cf09c5dbaf0b9',
      openness: 'public',
      has_leaderboard: true,
    }],
    ['MMSIBench', {
      paper_url: 'https://arxiv.org/abs/2505.23764v3',
      homepage: 'https://github.com/OpenRobotLab/MMSI-Bench/tree/13e58a2b8b30d880d7e8a1e4a6aa1c0feda94cac',
      openness: 'partly public',
      has_leaderboard: true,
    }],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(detail[field], value, `${id}.${field}`);
    }
  }
  assert.match(readDetail('MMLongBench').drawio_review_note, /0c008eb69faccf58c96b03937eb378d234efd9cc/isu);
  assert.match(readDetail('MMLongBench-Doc').drawio_review_note, /88b5f09fd29a7638b7c4d82aa6c8f5989ca5c145/isu);
  assert.match(readDetail('MMMLU').drawio_review_note, /325a01dc3e173cac1578df94120499aaca2e2504.*01c488b07d9c4f93ea5c43b4be71fdb7207ee722.*652c89d0ca9df547706735883097e9537d40dc47/isu);
  assert.match(readDetail('MMMLU-non-English').drawio_review_note, /4c2fdb8f55e049553b9f4f1a3241f86d739c8cf8.*9b4e9788e4a3a731f7567338ed15d3ec549ce03b.*325a01dc3e173cac1578df94120499aaca2e2504/isu);
  assert.match(readDetail('MMMU').drawio_review_note, /f3e473e1e7af2c65a56ab66d7b3cf09c5dbaf0b9.*ff942ca882854a926b6a0e6ee110fd46de71c9a0/isu);
  assert.match(readDetail('MMSIBench').drawio_review_note, /13e58a2b8b30d880d7e8a1e4a6aa1c0feda94cac.*ec7c92bfaf7728fcca1d61e3e224e190af309436/isu);
});

test('keeps every A11o fallback byte-synchronized with source labels, edges, and outcomes', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.flowchart_en, renderFallback(readSpec(id, 'en')), `${id}.en fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(readSpec(id, 'zh')), `${id}.zh fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id}.generic fallback`);
  }
});

test('publishes synchronized formal topology, native fixed-light SVG, and readable PNG pairs for A11o', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal bilingual topology`);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      assert.deepEqual(topology(arch), topology(spec), `${id}.${language} formal topology freshness`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const visibleText = svgVisibleText(svg);
      for (const node of spec.nodes) {
        for (const line of String(node.label).split(/\r?\n/u)) {
          assert.ok(visibleText.includes(line), `${id}.${language}: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces exactly twelve A11o SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11o-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(generatedSvg, `${base}.svg`, `${id}.${language}.svg`);
        execFileSync(drawioDesktop, ['-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`], { stdio: 'pipe' });
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, ['-metric', 'AE', generatedPng, `${base}.png`, 'null:'], { stdio: 'pipe' }),
            `${id}.${language}.png pixel freshness`,
          );
        } else {
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png`);
        }
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all twelve A11o specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11o-'));
  let rebuildCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [drawioCli, `${base}.spec.yaml`, generated, '--validate', '--strict', '--write-sidecars'], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
        assert.equal(readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'), readFileSync(`${base}.arch.json`, 'utf8'), `${id}.${language}.arch`);
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
