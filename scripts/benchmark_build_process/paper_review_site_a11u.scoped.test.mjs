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
const benchmarkIds = ['MedS-Bench', 'MedSP1000'];
const formalBenchmarkIds = [
  'MedS-Bench',
  'MedSP1000',
  'MedSafetyBench',
  'MedXpertQA',
  'MicroVQA',
  'MiniF2F',
];
const expectedCounts = new Map([
  ['MedS-Bench', { nodes: 17, edges: 16 }],
  ['MedSP1000', { nodes: 18, edges: 17 }],
  ['MedSafetyBench', { nodes: 19, edges: 20 }],
  ['MedXpertQA', { nodes: 20, edges: 20 }],
  ['MicroVQA', { nodes: 21, edges: 24 }],
  ['MiniF2F', { nodes: 21, edges: 25 }],
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
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));
const readArch = (id, language) => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const catalog = new Map(readJson(join(publicDir, 'benchmarks.json')).map(item => [item.id, item]));

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
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
  const escapedName = name.replace(/[.*+?^{}$()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp('(?:^|\\s)' + escapedName + '="([^"]*)"', 'u'))?.[1] ?? '';
}

function topology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type }) => ({ id, type })),
    edges: graph.edges.map(({ from, to, type }) => ({ from, to, type })),
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
      style: readAttribute(tag, 'style'),
    })),
  };
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function assertTemporaryDrawioEdges() {
  assert.ok(existsSync(drawioCli), `Draw.io build CLI is required: ${drawioCli}`);
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11u-xml-'));
  try {
    for (const id of [...benchmarkIds, 'MedSafetyBench', 'MedXpertQA']) {
      for (const language of ['en', 'zh']) {
        const specPath = join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`);
        const generated = join(tempRoot, `${id}.${language}.drawio`);
        execFileSync(process.execPath, [
          drawioCli,
          specPath,
          generated,
          '--validate',
          '--strict',
          '--write-sidecars',
        ], { stdio: 'pipe' });

        const graph = readSpec(id, language);
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.spec.yaml'), 'utf8'),
          readFileSync(specPath, 'utf8'),
          `${id}.${language} strict spec replay`,
        );

        const xml = readFileSync(generated, 'utf8');
        const cells = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
        const childEdgeLabels = cells.filter(tag => (
          readAttribute(tag, 'style').split(';').includes('edgeLabel')
        ));
        const nodes = cells.filter(tag => (
          readAttribute(tag, 'vertex') === '1'
          && !readAttribute(tag, 'style').split(';').includes('edgeLabel')
        ));
        const edges = cells.filter(tag => readAttribute(tag, 'edge') === '1');
        assert.equal(nodes.length, graph.nodes.length, `${id}.${language} XML node count`);
        assert.equal(edges.length, graph.edges.length, `${id}.${language} XML edge count`);
        assert.equal(childEdgeLabels.length, 0, `${id}.${language} must not create child edge labels`);

        const cellIdToNodeId = new Map(
          nodes.map((tag, index) => [readAttribute(tag, 'id'), graph.nodes[index].id]),
        );
        const renderedEdges = new Map(edges.map(tag => [
          `${cellIdToNodeId.get(readAttribute(tag, 'source'))}->${cellIdToNodeId.get(readAttribute(tag, 'target'))}`,
          tag,
        ]));
        assert.equal(renderedEdges.size, graph.edges.length, `${id}.${language} unique XML edges`);
        for (const edge of graph.edges) {
          const context = `${id}.${language} ${edge.from}->${edge.to}`;
          const tag = renderedEdges.get(`${edge.from}->${edge.to}`);
          assert.ok(tag, `${context} XML edge`);
          assert.equal(readAttribute(tag, 'value'), '', `${context} parent edge label`);
          const style = readAttribute(tag, 'style');
          if (edge.type === 'secondary') {
            assert.equal(edge.style?.dashed, true, `${context} source dashed flag`);
            assert.match(style, /(?:^|;)dashed=1(?:;|$)/u, `${context} rendered dash`);
            assert.match(style, /(?:^|;)dashPattern=6 4(?:;|$)/u, `${context} rendered dash pattern`);
          } else {
            assert.doesNotMatch(style, /(?:^|;)dashed=1(?:;|$)/u, `${context} primary edge`);
          }
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const sourcePins = new Map([
  ['MedS-Bench', {
    paper_url: 'https://arxiv.org/abs/2408.12547v2',
    arxiv_pdf_url: 'https://arxiv.org/pdf/2408.12547v2',
    homepage: 'https://henrychur.github.io/MedS-Bench/',
    org: 'Shanghai Jiao Tong University; Shanghai AI Laboratory; China Mobile Communications Group Co., Ltd.; China Mobile Communications Group Shanghai Co., Ltd.',
    has_leaderboard: true,
  }],
  ['MedSP1000', {
    paper_url: 'https://arxiv.org/abs/2606.05112v1',
    arxiv_pdf_url: 'https://arxiv.org/pdf/2606.05112v1',
    homepage: 'https://github.com/MAGIC-AI4Med/MedSP1000/tree/2806984cb331d6fedc2c0555e3c1c4a54171c77a',
    org: 'Shanghai Jiao Tong University; Shanghai Artificial Intelligence Laboratory',
    has_leaderboard: false,
  }],
]);

test('pins exact A11u sources and renders semantic boundary edges as unlabeled dashes', () => {
  for (const [id, expected] of sourcePins) {
    const detail = readDetail(id);
    const summary = catalog.get(id);
    assert.ok(summary, `${id} catalog entry`);
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(detail[field], value, `${id}.${field}`);
      assert.equal(summary[field], value, `${id} catalog ${field}`);
    }
    for (const field of [
      'intro', 'intro_en', 'build_method', 'build_method_en', 'metric', 'metric_en',
      'scale', 'scale_en', 'language', 'language_en', 'openness', 'openness_en',
      'flowchart_en', 'flowchart_zh', 'mermaid_flowchart', 'drawio_review_note',
    ]) {
      assert.equal(summary[field], detail[field], `${id} catalog/detail ${field}`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback/spec sync`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback/spec sync`);
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} positioned topology`);
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u);
    for (const node of zh.nodes) assert.match(String(node.label), /[\u3400-\u9fff]/u);
  }
});

test('strictly renders A11u semantic boundary edges when the Draw.io build CLI is available', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  assertTemporaryDrawioEdges();
});

test('locks MedS-Bench paper construction, evaluation, and maintained-release drift', () => {
  const detail = readDetail('MedS-Bench');
  const spec = readSpec('MedS-Bench', 'en');
  const specZh = readSpec('MedS-Bench', 'zh');
  assert.equal(spec.nodes.length, 17);
  assert.equal(spec.edges.length, 16);
  assert.match(detail.intro_en, /28 source datasets/iu);
  assert.match(detail.intro_en, /Figure 3.*39 datasets/isu);
  assert.match(detail.intro_en, /52 tasks/iu);
  assert.match(detail.intro_en, /0\.3 million/iu);
  assert.match(detail.scale_en, /Section 2\.1\/Figure 1.*28 source datasets.*Figure 3.*39 datasets/isu);
  assert.match(detail.metric_en, /Accuracy.*Precision.*Recall.*F1.*BLEU-1.*ROUGE-1/isu);
  assert.match(detail.language_en, /Chinese.*English.*French.*Japanese.*Russian.*Spanish/isu);
  assert.match(nodeLabel(spec, 'format'), /Instruction-prompted QA Structure.*Preserve Dataset Semantics/isu);
  assert.match(nodeLabel(spec, 'definitions'), /Write Task Definitions by Hand.*Shared Instruction Contract/isu);
  assert.match(nodeLabel(spec, 'split'), /Existing Train-test Splits.*Randomly Split 9 to 1/isu);
  assert.match(nodeLabel(spec, 'leakage'), /Exclude Test Instances from Examples.*Training Data.*Gold Test Answers Held Out/isu);
  assert.match(nodeLabel(spec, 'sample'), /All Multiple-choice Test Items.*Cost-sample.*1,500/isu);
  assert.match(nodeLabel(spec, 'prompts'), /Section 2\.3.*MCQA Zero-shot.*Supplement A\.1.*All Evaluations Three-shot.*eval\.py Default.*Three-shot/isu);
  assert.match(nodeLabel(spec, 'tasks'), /11 High-level Categories.*52 Distinct Tasks.*0\.3 Million Samples/isu);
  assert.match(nodeLabel(spec, 'count_boundary'), /28 Datasets.*52 Tasks.*Figure 3.*39 Datasets.*53 Task Files.*HF Main.*32/isu);
  assert.match(nodeLabel(spec, 'platform'), /Model or Hugging Face Link.*Result CSV/isu);
  assert.match(nodeLabel(spec, 'rights_boundary'), /Code LICENSE States CC BY-SA.*README Has No License Declaration.*HF Card Has No License Field.*Source Terms Apply/isu);
  assert.match(nodeLabel(specZh, 'rights_boundary'), /代码 LICENSE 声明 CC BY-SA.*README 无许可声明.*HF 基准卡无许可字段.*来源条款仍适用/isu);
  assert.doesNotMatch(nodeLabel(spec, 'rights_boundary'), /Code README States CC BY-SA/iu);
  assert.match(nodeLabel(specZh, 'prompts'), /第 2\.3 节.*多选零样本.*附录 A\.1.*全部评测均为三样本.*eval\.py 默认.*三样本/isu);
  assert.match(nodeLabel(specZh, 'count_boundary'), /28 数据集.*52 任务.*图 3.*39 数据集.*SPLIT 53.*HF main 32/isu);
  assert.match(detail.drawio_review_note, /185cfc04a27023983e48b357a6f2fd525049b9af/iu);
  assert.match(detail.drawio_review_note, /bae9b49bb23ffcd5b1b64345f021d4d5b803b503/iu);
  assert.match(detail.drawio_review_note, /6945b14e0f408082aecb6a77a185b9ebdd5fb413/iu);
  assert.match(detail.drawio_review_note, /NO_CONTEXT_P = 0\.0.*ORI_INS = 1\.0/isu);
  assert.match(detail.drawio_review_note, /code LICENSE states CC BY-SA.*README contains no license declaration.*HF benchmark card has no license field/isu);
  assert.doesNotMatch(detail.drawio_review_note, /code README states CC BY-SA/iu);
});

test('locks MedSP1000 curation, interaction, aggregation, and release drift', () => {
  const detail = readDetail('MedSP1000');
  const spec = readSpec('MedSP1000', 'en');
  const specZh = readSpec('MedSP1000', 'zh');
  assert.equal(spec.nodes.length, 18);
  assert.equal(spec.edges.length, 17);
  assert.match(nodeLabel(spec, 'source'), /1,073 Articles.*22,244 Attachments/isu);
  assert.match(nodeLabel(spec, 'filter'), /931.*142.*86.*56.*1,017/isu);
  assert.match(nodeLabel(spec, 'markdown'), /MarkItDown.*MinerU2.*OCR.*7,147/isu);
  assert.match(nodeLabel(spec, 'simulatability'), /Keep 613 of 1,017 Articles/isu);
  assert.match(nodeLabel(spec, 'scenarios'), /17 Clinical Specialties.*1,638 Executable Cases/isu);
  assert.match(nodeLabel(spec, 'packets'), /Four Role Packets.*Copy Then Delete Privileged Passages/isu);
  assert.match(nodeLabel(spec, 'rubrics'), /Copy Every Scoring Point Verbatim.*24,602 Items.*Six ACGME/isu);
  assert.match(nodeLabel(spec, 'validate'), /12 Clinicians.*100 Sampled Cases.*Two Ratings Each.*100-case Verified Subset/isu);
  assert.match(nodeLabel(spec, 'interface'), /speak.*actions.*eos/isu);
  assert.match(nodeLabel(spec, 'simulation'), /Unsupported Results.*Never Invent/isu);
  assert.match(nodeLabel(spec, 'evaluator'), /Binary Completed or Not per Item.*100 Runs.*Two Ratings Each/isu);
  assert.match(detail.metric_en, /case-macro.*specialty case-macro.*competency definition conflict.*item-micro.*case-macro/isu);
  assert.match(nodeLabel(spec, 'protocol_boundary'), /No Turn Cap.*Temperature 0.*12 Turns.*Leaves\s+Temperature Unset/isu);
  assert.match(nodeLabel(spec, 'release_boundary'), /1,639 Paths.*1,638 Rubric Files.*Four Empty.*1,634 Parseable/isu);
  assert.match(nodeLabel(spec, 'metric_boundary'), /§2\.1\.3.*Micro.*§4\.3 Eq\. 3.*Macro.*Does Not Reconcile/isu);
  assert.match(nodeLabel(spec, 'rights_boundary'), /CC BY-NC-SA.*CC BY-SA.*MIT.*MedEdPORTAL/isu);
  assert.match(nodeLabel(specZh, 'evaluator'), /100 次运行每次双人评分/isu);
  assert.match(nodeLabel(specZh, 'metric_boundary'), /第 2\.1\.3 节.*微平均.*第 4\.3 节公式 3.*宏平均.*没有调和/isu);
  assert.match(detail.drawio_review_note, /2806984cb331d6fedc2c0555e3c1c4a54171c77a/iu);
  assert.match(detail.drawio_review_note, /55e3e55efd08c73baab912ba0c5b42637114fbc8/iu);
  assert.match(detail.drawio_review_note, /CC BY-NC-SA.*MIT/isu);
});

test('keeps all six A11u formal packages synchronized with bilingual sources and fallbacks', () => {
  for (const id of formalBenchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual geometry`);
    assert.equal(en.nodes.length, expectedCounts.get(id).nodes, `${id}.en nodes`);
    assert.equal(en.edges.length, expectedCounts.get(id).edges, `${id}.en edges`);
    assert.doesNotMatch(en.nodes.map(node => node.label).join('\n'), /[\u3400-\u9fff]/u, `${id}.en language`);
    assert.ok(zh.nodes.every(node => /[\u3400-\u9fff]/u.test(String(node.label))), `${id}.zh semantics`);
    for (const [language, spec] of [['en', en], ['zh', zh]]) {
      const arch = readArch(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.deepEqual(canonicalGraph(arch), canonicalGraph(spec), `${id}.${language} exact arch`);
      assert.deepEqual(arch.counts, {
        ...expectedCounts.get(id),
        modules: (spec.modules ?? []).length,
      }, `${id}.${language} arch counts`);
      assert.equal(detail[`flowchart_${language}`], renderFallback(spec), `${id}.${language} source fallback`);
      assert.equal(detail[`flowchart_${language}`], renderFallback(arch), `${id}.${language} arch fallback`);
    }
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
  }
});

test('publishes all six A11u packages as parent-labeled Draw.io, fixed-light SVG, and PNG', () => {
  for (const id of formalBenchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} formal topology`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const formal = formalGraph(drawio, arch, `${id}.${language}`);
      assert.deepEqual(
        formal.edges.map(({ from, to, label }) => ({ from, to, label })),
        arch.edges.map(edge => ({
          from: edge.from,
          to: edge.to,
          label: normalizedLabel(edge.label ?? ''),
        })),
        `${id}.${language} Draw.io edges`,
      );
      assert.equal(formal.cells.childEdgeLabels.length, 0, `${id}.${language} child edge labels`);
      for (const [index, edge] of arch.edges.entries()) {
        const style = formal.edges[index].style;
        if (edge.type === 'secondary') {
          assert.match(style, /(?:^|;)dashed=1(?:;|$)/u, `${id}.${language} dashed boundary`);
        } else {
          assert.doesNotMatch(style, /(?:^|;)dashed=1(?:;|$)/u, `${id}.${language} primary edge`);
        }
      }
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

test('reproduces all twelve A11u SVG and PNG exports byte-for-byte', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11u-exports-'));
  let exportCount = 0;
  try {
    for (const id of formalBenchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const svg = join(tempRoot, `${id}.${language}.svg`);
        const png = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x',
          '-f',
          'svg',
          '--svg-theme',
          'light',
          '-o',
          svg,
          `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, svg], { stdio: 'pipe' });
        assert.equal(readFileSync(svg, 'utf8'), readFileSync(`${base}.svg`, 'utf8'), `${id}.${language}.svg bytes`);
        execFileSync(
          drawioDesktop,
          ['-x', '-f', 'png', '-o', png, `${base}.drawio`],
          { stdio: 'pipe' },
        );
        assert.deepEqual(readFileSync(png), readFileSync(`${base}.png`), `${id}.${language}.png bytes`);
        exportCount += 1;
      }
    }
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and parent-normalizes all twelve A11u specs without drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11u-builds-'));
  let rebuildCount = 0;
  try {
    for (const id of formalBenchmarkIds) {
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
