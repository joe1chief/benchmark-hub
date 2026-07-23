import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'MMLU-CF',
  'MMLU-ProX',
  'MMLU-Redux',
  'MMLU-Redux_2.0',
  'MMBench-Video',
  'MME',
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

test('keeps all six A11n source packages bilingual, academic, and explicit at every decision', () => {
  const requiredNodes = new Map([
    ['MMLU-CF', ['web_corpus', 'semantic_dedup', 'replace', 'closed_test', 'shot_route', 'metric_boundary']],
    ['MMLU-ProX', ['initial_translate', 'expert_sample', 'expert_gate', 'full_release', 'lite_release', 'version_route', 'shot_route']],
    ['MMLU-Redux', ['source_route', 'confidence', 'valid_answers', 'label_merge', 'experiment_route', 'parse_gate', 'implementation_drift']],
    ['MMLU-Redux_2.0', ['mmlu_source', 'expansion', 'sample_union', 'source_pin', 'agreement_audit', 'weighted_estimate', 'parse_gate']],
    ['MMBench-Video', ['duration_gate', 'temporal_gate', 'release', 'sampling', 'pack_parse', 'score_gate', 'metrics']],
    ['MME', ['coarse', 'fine', 'ocr', 'commonsense', 'cognition_three', 'merge_sources', 'input_gate', 'parse_gate', 'totals']],
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
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length >= 1_000, `${id} review evidence`);
  }
});

test('uses only valid academic font overrides across the A11n source specs', () => {
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

test('locks the paper-backed A11n construction, version, parser, and failure semantics', () => {
  const cf = labels(readSpec('MMLU-CF'));
  assert.match(cf, /200 Billion.*2\.7 Million.*1\.66M.*50K.*20K.*10,000.*10,000/isu);
  assert.match(cf, /50% Random Replacement.*None Other.*c25b89a.*e039f3e.*first_option_postprocess/isu);

  const proX = readSpec('MMLU-ProX');
  const proXText = labels(proX);
  const expertSample = proX.nodes.find(node => node.id === 'expert_sample').label;
  const expertAudit = proX.nodes.find(node => node.id === 'approved').label;
  assert.match(expertSample, /20 × 14 = 280.*15 Languages.*Two Translators.*>30 Experts.*>400 Hours/isu);
  assert.doesNotMatch(expertSample, /29 Languages/iu);
  assert.match(expertAudit, /15-Language Sample-Audit Result.*Other 14 Languages Not Expert-Verified/isu);
  assert.match(proXText, /29 Parallel Languages.*11,829.*658 Items.*588 Test.*0b45cc7/isu);
  assert.match(proXText, /do_sample=false.*Temperature 0.*2048.*Invalid Parse Is Included as Wrong/isu);

  const redux = labels(readSpec('MMLU-Redux'));
  assert.match(redux, /3,000 Rows.*14 Human Experts.*BQC.*BOC.*NCA.*MCA.*WGT/isu);
  assert.match(redux, /arXiv v2.*f237669.*71062db.*57-subject claims belong to 2\.0 \/ v3/isu);
  assert.match(redux, /Positive Class = “not ok”.*Recall.*F1.*F2.*Non-RAG metric code sets OK = 1/isu);

  const reduxTwo = labels(readSpec('MMLU-Redux_2.0'));
  assert.match(reduxTwo, /14,042 Test Rows.*5,700 Total.*57 Subjects × 100 Rows/isu);
  assert.match(reduxTwo, /arXiv v3.*63f54eb.*372ea.*Cohen's Kappa.*0\.6/isu);
  assert.match(reduxTwo, /14,042 Test Rows.*OK 93\.51%.*Five Errors 6\.49%/isu);

  const video = readSpec('MMBench-Video');
  const videoText = labels(video);
  assert.match(videoText, /609 Videos.*1,998 QA Pairs.*26 Leaves/isu);
  assert.match(video.nodes.find(node => node.id === 'score_gate').label, /Unsafe eval\(Response\).*Return an int/isu);
  assert.match(video.nodes.find(node => node.id === 'valid_score').label, /No Enforced 0-to-3 Range.*Abort after Execution/isu);
  assert.match(video.nodes.find(node => node.id === 'metrics').label, /Every Score.*ALL Uses max\(x, 0\).*VALID Keeps x ≥ 0/isu);

  const mme = readSpec('MME');
  const mmeText = labels(mme);
  assert.match(mmeText, /1,187 Images.*2,374 Instruction-answer Pairs.*ACC\+.*2,000.*800/isu);
  assert.match(mme.nodes.find(node => node.id === 'format_results').label, /Two Adjacent Rows per Image.*Fourth Tab Field/isu);
  assert.match(mme.nodes.find(node => node.id === 'abort').label, /Abort Whole Scorer.*Unpack \/ Assertion Failure.*No Row-level Skip/isu);
  assert.match(mme.nodes.find(node => node.id === 'parse').label, /Lowercased Response.*Exact yes \/ no.*First Four Characters.*yes before no/isu);
  assert.match(mme.nodes.find(node => node.id === 'other').label, /Incorrect.*ACC and ACC\+ Denominators.*Exclude from Precision \/ Recall \/ Confusion/isu);
});

test('pins exact reviewed A11n paper and homepage revisions', () => {
  const expected = new Map([
    ['MMLU-CF', {
      paper_url: 'https://arxiv.org/abs/2412.15194v1',
      homepage: 'https://github.com/microsoft/MMLU-CF/tree/fd89eefd0815a5aed7d99e74eb6a086eabbe448e',
      openness: 'partly public',
      has_leaderboard: true,
    }],
    ['MMLU-ProX', {
      paper_url: 'https://arxiv.org/abs/2503.10497v2',
      homepage: 'https://mmluprox.github.io/',
      org: 'The University of Tokyo, Duke-NUS Medical School, Waseda University, Northwestern University, Carnegie Mellon University, Yale University, University College Dublin, Nanyang Technological University, Smartor LLC, University of California Berkeley, University of New South Wales, Singapore Management University, New York University, Polytechnique Montréal, University of Geneva, University of Alberta',
      openness: 'public',
      has_leaderboard: false,
    }],
    ['MMLU-Redux', {
      paper_url: 'https://arxiv.org/abs/2406.04127v2',
      homepage: 'https://huggingface.co/datasets/edinburgh-dawg/mmlu-redux/tree/f2376699ca8a153fb2bd13f0462289d1a93c97ae',
      openness: 'public',
      has_leaderboard: true,
    }],
    ['MMLU-Redux_2.0', {
      paper_url: 'https://arxiv.org/abs/2406.04127v3',
      homepage: 'https://huggingface.co/datasets/edinburgh-dawg/mmlu-redux-2.0/tree/63f54ebd32c36485c679f53b8e2f576d689b9b34',
      openness: 'public',
      has_leaderboard: true,
    }],
    ['MMBench-Video', {
      paper_url: 'https://arxiv.org/abs/2406.14515v3',
      homepage: 'https://mmbench-video.github.io/',
      openness: 'public',
      has_leaderboard: true,
    }],
    ['MME', {
      paper_url: 'https://arxiv.org/abs/2306.13394v1',
      homepage: 'https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/1c1d69e138b57cf8b0400427927bfb8ed4285458',
      openness: 'public',
      has_leaderboard: true,
    }],
  ]);
  for (const [id, fields] of expected) {
    const detail = readDetail(id);
    for (const [field, value] of Object.entries(fields)) {
      assert.equal(detail[field], value, `${id}.${field}`);
    }
  }
  assert.doesNotMatch(
    readDetail('MMLU-ProX').org,
    /RIKEN|Singapore University of Technology and Design|SUTD/iu,
    'MMLU-ProX v2 organizations must not retain v1-only affiliations',
  );
});

test('keeps every A11n fallback byte-synchronized with source labels, edges, and outcomes', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.flowchart_en, renderFallback(readSpec(id, 'en')), `${id}.en fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(readSpec(id, 'zh')), `${id}.zh fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id}.generic fallback`);
  }
});

test('publishes synchronized formal topology, native fixed-light SVG, and readable PNG pairs for A11n', () => {
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

test('reproduces exactly twelve A11n SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11n-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(readFileSync(generatedSvg, 'utf8'), readFileSync(`${base}.svg`, 'utf8'), `${id}.${language}.svg`);
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

test('strictly rebuilds and normalizes all twelve A11n specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11n-'));
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
