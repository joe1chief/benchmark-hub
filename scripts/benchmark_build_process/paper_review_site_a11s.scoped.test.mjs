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
  'Med-HALT',
  'MedAgentBench',
  'MedAgentsBench',
  'MedAlign',
  'MedBench',
  'MedBullets',
];
const expectedCounts = new Map([
  ['Med-HALT', { nodes: 30, edges: 36 }],
  ['MedAgentBench', { nodes: 29, edges: 35 }],
  ['MedAgentsBench', { nodes: 21, edges: 22 }],
  ['MedAlign', { nodes: 27, edges: 29 }],
  ['MedBench', { nodes: 28, edges: 32 }],
  ['MedBullets', { nodes: 27, edges: 30 }],
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

test('keeps all six A11s source packages bilingual, geometric, language-pure, and explicit', () => {
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

test('uses only valid academic font overrides across the A11s source specs', () => {
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

test('locks Med-HALT released counts, construction gaps, parser, and denominator drift', () => {
  const graph = readSpec('Med-HALT');
  assert.match(nodeLabel(graph, 'exam_pool'), /18,866 Base Questions.*Build Script and Seed Not Released/isu);
  assert.match(nodeLabel(graph, 'fct_build'), /18,866 Rows.*18,865 Index Mismatches.*18,858 Answer-text Mismatches/isu);
  assert.match(nodeLabel(graph, 'nota_build'), /18,866 Rows.*Gold Always NOTA.*222 Rows/isu);
  assert.match(nodeLabel(graph, 'fake_build'), /1,858 Rows, Not 18,866.*Undisclosed/isu);
  assert.match(nodeLabel(graph, 'rht_release'), /39,590 Released Rows.*Paper Prose Says 18,866 per RHT/isu);
  assert.match(nodeLabel(graph, 'mht_release'), /19,664 Released Rows.*1,989 Fake Titles Target Unknown/isu);
  assert.match(nodeLabel(graph, 'release'), /59,254 Total Rows.*No Dataset-construction Code/isu);
  assert.match(nodeLabel(graph, 'prompt'), /Two-shot.*Python Shot Sampling Is Unseeded/isu);
  assert.match(nodeLabel(graph, 'generation'), /Temperature 0\.6.*Top-p 0\.95.*128 Tokens.*Seed 42/isu);
  assert.match(nodeLabel(graph, 'parse'), /First Line.*ast\.literal_eval.*Regex Key-value Fallback/isu);
  assert.match(nodeLabel(graph, 'repro_gap'), /Converter Writes Flat Fields.*eval_full Expects Nested Legacy Fields.*No Adapter/isu);
  assert.match(nodeLabel(graph, 'counting'), /exception_count.*total = correct \+ wrong/isu);
  assert.match(nodeLabel(graph, 'accuracy'), /Exceptions Are Excluded.*Not Counted as Wrong/isu);
  assert.match(nodeLabel(graph, 'pointwise'), /\/ 100.*Paper Eq\. 1 Instead Says Divide by N/isu);
});

test('locks MedAgentBench EHR construction, unpinned setup, raw FINISH handling, and pass@1', () => {
  const graph = readSpec('MedAgentBench');
  assert.match(nodeLabel(graph, 'task_authors'), /Two Internal-medicine Physicians.*300 Clinical Tasks/isu);
  assert.match(nodeLabel(graph, 'taxonomy'), /10 Specific.*7 Broad Categories/isu);
  assert.match(nodeLabel(graph, 'cohort'), /100 Inpatients.*Morning Sodium.*2023-11-13/isu);
  assert.match(nodeLabel(graph, 'extract'), /Five-year EHR Window.*2018-11-13/isu);
  assert.match(nodeLabel(graph, 'fhir_resources'), /785,207 Total Records/isu);
  assert.match(nodeLabel(graph, 'environment'), /Easy-Setup.*Unpinned latest.*No Dockerfile or Digest/isu);
  assert.doesNotMatch(nodeLabel(graph, 'environment'), /Reproducible/iu);
  assert.match(nodeLabel(graph, 'benchmark_release'), /300 Tasks.*100 Patient Profiles.*Nine FHIR Functions/isu);
  assert.match(nodeLabel(graph, 'prompt'), /GET, POST, or FINISH.*Maximum Eight Rounds/isu);
  assert.match(nodeLabel(graph, 'post_json'), /JSON-loadable/isu);
  assert.match(nodeLabel(graph, 'post_accept'), /Do Not Mutate FHIR Server/isu);
  assert.match(nodeLabel(graph, 'finish_record'), /startswith.*Strip the FINISH.*Raw Inner Text.*Full Interaction History/isu);
  assert.doesNotMatch(nodeLabel(graph, 'finish_record'), /Parse.*Result List/iu);
  assert.match(nodeLabel(graph, 'action_grade'), /Rule-based POST-payload Checks.*Exception → False/isu);
  assert.match(nodeLabel(graph, 'report'), /pass@1.*All 300 Results.*Overall Only/isu);
});

test('locks MedicalAgentsBench hard-set verification, release drift, emitted-row scoring, and time adjustment', () => {
  const graph = readSpec('MedAgentsBench');
  assert.match(nodeLabel(graph, 'sources'), /Eight Medical QA Sources.*MedXpertQA Splits into R and U/isu);
  assert.match(nodeLabel(graph, 'hard_gate'), /Strictly below 50%/isu);
  assert.match(nodeLabel(graph, 'sample'), /Maximum 100 from Each Subset.*Nine Evaluation Subsets/isu);
  assert.match(nodeLabel(graph, 'depth'), /Four Clinical-year Medical Students.*Five Levels/isu);
  assert.match(nodeLabel(graph, 'excluded'), /Twenty-one.*5 Wrong.*5 Context.*11 Relevance/isu);
  assert.match(nodeLabel(graph, 'release'), /862 Questions.*MedBullets 89.*MMLU 73/isu);
  assert.match(nodeLabel(graph, 'release_drift'), /AfriMedQA 32.*894, Not 862/isu);
  assert.match(nodeLabel(graph, 'missing_boundary'), /Does Not Restore Missing IDs.*No Fixed-862 Denominator/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Deduplicate First by realidx.*Mean over Retained Rows.*Macro-average/isu);
  assert.match(nodeLabel(graph, 'cost_time'), /Full-cycle Wall Clock.*DeepSeek-V3.*Raw Mean \/ 10/isu);
});

test('locks MedAlign collection, retrieval, content-filter denominators, and evaluator boundary', () => {
  const graph = readSpec('MedAlign');
  assert.match(nodeLabel(graph, 'collect'), /1,314 Questions or Commands/isu);
  assert.match(nodeLabel(graph, 'dedup_gate'), /ROUGE-L Similarity above 0\.7/isu);
  assert.match(nodeLabel(graph, 'catalog'), /983 Deduplicated.*407 Marked Applicable/isu);
  assert.match(nodeLabel(graph, 'ehr_pool'), /77,200-patient/isu);
  assert.match(nodeLabel(graph, 'retrieve'), /BM25 Returns Top Five.*Stop at First Relevant/isu);
  assert.match(nodeLabel(graph, 'release'), /983 Instructions.*303 References.*276 Distinct EHRs.*74%.*38%/isu);
  assert.match(nodeLabel(graph, 'direct_context'), /Truncate from the Record Beginning.*Most Recent/isu);
  assert.match(nodeLabel(graph, 'mr_context'), /30k-token Chunks.*Earliest to Latest/isu);
  assert.match(nodeLabel(graph, 'filter_error'), /44 Questions.*Failure = Incorrect.*Supplemental Set · Exclude → 259.*Rank Handling Undisclosed/isu);
  assert.match(nodeLabel(graph, 'correctness'), /Main Denominator: 303/isu);
  assert.match(nodeLabel(graph, 'no_harness'), /Samples, Not Evaluator.*No Answer Parser.*Metric Code Versions Are Not Released/isu);
});

test('locks MedBench paper-v1 curation, rotating choices, metric routing, and live-service drift', () => {
  const graph = readSpec('MedBench');
  assert.match(nodeLabel(graph, 'scope'), /Five Dimensions.*MLU.*MLG.*MKQA.*CMR.*HSE/isu);
  assert.match(nodeLabel(graph, 'public_sources'), /Eight Public Datasets/isu);
  assert.match(nodeLabel(graph, 'constructed_sources'), /Build 12/isu);
  assert.match(nodeLabel(graph, 'corpus'), /300,901 Chinese Questions.*20 Datasets.*43 Specialties/isu);
  assert.match(nodeLabel(graph, 'refresh_sample'), /8,913.*Refresh Every Three Months/isu);
  assert.match(nodeLabel(graph, 'version_drift'), /MedBench v5.*36 LLM Datasets.*Not a Reproducible Paper-v1 Revision/isu);
  assert.match(nodeLabel(graph, 'shuffle'), /Circular Shuffling.*Every Circular Rotation.*Required/isu);
  assert.match(nodeLabel(graph, 'prompt_match'), /Random Prompt Matching.*K = 3/isu);
  assert.match(nodeLabel(graph, 'accuracy'), /Accuracy.*0-100/isu);
  assert.match(nodeLabel(graph, 'text_metrics'), /BLEU.*ROUGE-L.*0-100/isu);
  assert.match(nodeLabel(graph, 'implementation_boundary'), /No Paper-v1 Evaluator Repository.*Invalid-output Handling Absent.*Denominators Absent/isu);
  assert.match(nodeLabel(graph, 'aggregate'), /Average Datasets within Each Dimension.*Average the Five Dimensions/isu);
});

test('locks MedBullets releases, Medbullets-5 diagnostics, model settings, and explanation metrics', () => {
  const graph = readSpec('MedBullets');
  assert.match(nodeLabel(graph, 'source'), /April 2022 to December 2023/isu);
  assert.match(nodeLabel(graph, 'companion'), /1,524 Cases.*JAMA Access License Required.*No Raw Release or Medbullets Merge/isu);
  assert.match(nodeLabel(graph, 'strip_images'), /116 Questions Say “Figure”.*Unresolved/isu);
  assert.match(nodeLabel(graph, 'structure'), /Case.*Question.*Five Choices.*Correct Answer/isu);
  assert.match(nodeLabel(graph, 'release5'), /308 English Step 2\/3 Questions/isu);
  assert.match(nodeLabel(graph, 'variant4'), /Drop One Incorrect Option.*244\/308/isu);
  assert.match(nodeLabel(graph, 'robustness'), /Medbullets-5.*Choice-order/isu);
  assert.match(nodeLabel(graph, 'contamination'), /Medbullets-5.*TS-Guessing.*At Most 10%/isu);
  assert.match(nodeLabel(graph, 'models'), /Seven Named LLMs.*gpt-4-0613.*meerkat-7b-v1\.0/isu);
  assert.match(nodeLabel(graph, 'strategy_gate'), /Which Paper Prompting.*Strategy/isu);
  assert.match(nodeLabel(graph, 'direct'), /X to Y.*Zero-, Two-, or Five-shot/isu);
  assert.match(nodeLabel(graph, 'cot'), /Two-stage.*X to R to Y/isu);
  assert.match(nodeLabel(graph, 'rationale'), /XY\* to R.*Correct Answer/isu);
  assert.match(nodeLabel(graph, 'automatic_metrics'), /BARTScore\+\/\+\+.*CTC Three Axes.*GPT-4o G-Eval.*5 Runs/isu);
  assert.match(nodeLabel(graph, 'human_study'), /Completeness: Per-choice Checklist.*Correctness\/Relevance: 1-5 Likert/isu);
  assert.match(nodeLabel(graph, 'explanation_report'), /Completeness.*Correctness.*Relevance.*Bennett S: \.60 Correct.*\.65 Relevant/isu);
  assert.match(nodeLabel(graph, 'report'), /No Composite Benchmark Score/isu);
});

test('pins exact A11s paper, repository, dataset, and release evidence', () => {
  const expected = new Map([
    ['Med-HALT', { paper_url: 'https://aclanthology.org/2023.conll-1.21/', arxiv_pdf_url: 'https://arxiv.org/pdf/2307.15343v2', homepage: 'https://medhalt.github.io/', openness: 'partly public', has_leaderboard: false }],
    ['MedAgentBench', { paper_url: 'https://arxiv.org/abs/2501.14654v2', arxiv_pdf_url: 'https://arxiv.org/pdf/2501.14654v2', homepage: 'https://github.com/stanfordmlgroup/MedAgentBench', openness: 'public', has_leaderboard: false }],
    ['MedAgentsBench', { paper_url: 'https://arxiv.org/abs/2503.07459v3', arxiv_pdf_url: 'https://arxiv.org/pdf/2503.07459v3', homepage: 'https://github.com/gersteinlab/MedicalAgentsBench/tree/e4f3f868a8ee6d5b4d4282701a7ba7b1d66e4da6', openness: 'public', has_leaderboard: false }],
    ['MedAlign', { paper_url: 'https://arxiv.org/abs/2308.14089v2', arxiv_pdf_url: 'https://arxiv.org/pdf/2308.14089v2', homepage: 'https://github.com/som-shahlab/medalign/tree/4a88e4744ea31b1fdea8b191fdc9e4dc05cf624e', openness: 'partly public', has_leaderboard: false }],
    ['MedBench', { paper_url: 'https://arxiv.org/abs/2407.10990v1', arxiv_pdf_url: 'https://arxiv.org/pdf/2407.10990v1', homepage: 'https://medbench.opencompass.org.cn', has_leaderboard: true }],
    ['MedBullets', { paper_url: 'https://arxiv.org/abs/2402.18060v6', arxiv_pdf_url: 'https://arxiv.org/pdf/2402.18060v6', homepage: 'https://github.com/HanjieChen/ChallengeClinicalQA', has_leaderboard: false }],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(detail[field], value, id + '.' + field);
    }
    assert.ok(detail.drawio_review_note.length >= 1_000, id + ' detailed review note');
  }
  assert.match(readDetail('Med-HALT').drawio_review_note, /2fed21ed696a1949b1fd6dfdbd7a08d792e0e05f.*d1e8d04295742df7abc485062344fe328e141395/isu);
  assert.match(readDetail('MedAgentBench').drawio_review_note, /99260117137b09f04837a8c18d18a1107efa55ae/isu);
  assert.match(readDetail('MedAgentsBench').drawio_review_note, /e4f3f868a8ee6d5b4d4282701a7ba7b1d66e4da6.*87e99bf48306788076dced215926e29c835fa892/isu);
  assert.match(readDetail('MedAlign').drawio_review_note, /4a88e4744ea31b1fdea8b191fdc9e4dc05cf624e.*48nr-frxd97exb/isu);
  assert.match(readDetail('MedBench').drawio_review_note, /2b29885d3088f8470ef813b658549e7ce65bff6f4f5e40cd5c0345212eef90b6/isu);
  assert.match(readDetail('MedBullets').drawio_review_note, /013b9447f2a2426155c0de02a42e03d4540a3501.*d20bfca3cff061460fc216e85899a86e52da4934/isu);
});

test('keeps every A11s fallback byte-synchronized with each exact source and formal arch', () => {
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

test('reproduces exactly all twelve A11s SVG and PNG exports from checked-in Draw.io', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11s-exports-'));
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

test('strictly rebuilds and parent-normalizes all twelve A11s specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11s-builds-'));
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
