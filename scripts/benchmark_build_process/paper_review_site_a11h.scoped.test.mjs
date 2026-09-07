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
const benchmarkIds = ['Legal_Agent_Benchmark', 'LifeBench', 'LVBench', 'LingoQA', 'LinuxArena', 'LinuxBench'];
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
const labels = arch => arch.nodes.map(node => node.label).join('\n');
const readDrawio = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.drawio`),
  'utf8',
);
const readSvg = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.svg`),
  'utf8',
);

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of arch.edges) {
    lines.push(`    ${edge.from} ${mermaidArrow(edge)} ${edge.to}`);
  }
  return lines.join('\n');
}

function svgVisibleText(svg) {
  return svg
    .replace(/<[^>]*>/gu, '\n')
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

function drawioNodeCellId(id, language, nodeId) {
  const index = readArch(id, language).nodes.findIndex(node => node.id === nodeId);
  assert.notEqual(index, -1, `${id}.${language} missing node ${nodeId}`);
  const moduleCount = readSpec(id, language).modules?.length ?? 0;
  return String(index + moduleCount + 2);
}

function drawioEdgeCell(id, language, from, to) {
  const source = drawioNodeCellId(id, language, from);
  const target = drawioNodeCellId(id, language, to);
  const match = readDrawio(id, language).match(new RegExp(
    `<mxCell id="([^"]+)" value="[^"]*" style="[^"]*" edge="1" parent="1" source="${source}" target="${target}">`,
    'u',
  ));
  assert.ok(match, `${id}.${language} missing draw.io edge ${from}->${to}`);
  return match[1];
}

function svgEdgePolyline(id, language, from, to) {
  const edgeCellId = drawioEdgeCell(id, language, from, to);
  const match = readSvg(id, language).match(new RegExp(
    `<g data-cell-id="${edgeCellId}"><g><path d="([^"]+)" fill="none"`,
    'u',
  ));
  assert.ok(match, `${id}.${language} missing SVG edge path ${from}->${to}`);
  assert.doesNotMatch(match[1], /[CQAS]/u, `${id}.${language} ${from}->${to} must remain orthogonal`);
  const points = [...match[1].matchAll(
    /[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gu,
  )].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
  assert.ok(points.length >= 2, `${id}.${language} ${from}->${to} SVG polyline`);
  return points;
}

function polylineSegments(points) {
  return points.slice(1).map((point, index) => ({ from: points[index], to: point }));
}

function segmentsProperlyCross(left, right) {
  const leftVertical = left.from.x === left.to.x;
  const leftHorizontal = left.from.y === left.to.y;
  const rightVertical = right.from.x === right.to.x;
  const rightHorizontal = right.from.y === right.to.y;
  assert.ok(leftVertical || leftHorizontal, `non-orthogonal segment ${JSON.stringify(left)}`);
  assert.ok(rightVertical || rightHorizontal, `non-orthogonal segment ${JSON.stringify(right)}`);
  if ((leftVertical && rightVertical) || (leftHorizontal && rightHorizontal)) return false;
  const vertical = leftVertical ? left : right;
  const horizontal = leftHorizontal ? left : right;
  const x = vertical.from.x;
  const y = horizontal.from.y;
  const verticalLow = Math.min(vertical.from.y, vertical.to.y);
  const verticalHigh = Math.max(vertical.from.y, vertical.to.y);
  const horizontalLow = Math.min(horizontal.from.x, horizontal.to.x);
  const horizontalHigh = Math.max(horizontal.from.x, horizontal.to.x);
  return x > horizontalLow && x < horizontalHigh && y > verticalLow && y < verticalHigh;
}

test('keeps all six A11h packages bilingual with academic styling and explicit evidence boundaries', () => {
  const requiredNodes = new Map([
    ['Legal_Agent_Benchmark', ['boundary', 'private_holdout']],
    ['LifeBench', ['quality', 'release']],
    ['LVBench', ['evidence', 'artifact_boundary']],
    ['LingoQA', ['missing_contracts', 'release_boundary']],
    ['LinuxArena', ['c1', 'a1', 'e10', 'l3']],
    ['LinuxBench', ['construction_gap', 'private_status']],
  ]);
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      for (const nodeId of requiredNodes.get(id)) {
        assert.ok(spec.nodes.some(node => node.id === nodeId), `${id}.${language} ${nodeId}`);
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length > 100, `${id} review evidence`);
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 38]]) {
      for (const node of readArch(id, language).nodes) {
        const nodeLimit = node.type === 'formula' ? 90 : maxLineLength;
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= nodeLimit, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks the public legal-task construction, strict rubric scoring, sandbox, and separate private holdout', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Legal_Agent_Benchmark', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /1,?671.*24.*Contracting|1,?671.*24.*合同/isu);
    assert.match(text, /50.*Closed-universe|50.*封闭/isu);
    assert.match(text, /Binary.*Equal Weight.*No Gold|二元.*等权.*(?:不设标准答案|无标准输出)/isu);
    assert.match(text, /network=none.*cap-drop=ALL|禁用网络.*(?:capabilities|能力)/isu);
    assert.match(text, /Sonnet 4\.6.*Temperature 0|Sonnet 4\.6.*温度 0/isu);
    assert.match(text, /All-pass|全通过/isu);
    assert.match(text, /120.*24.*LAB-AA/isu);
    for (const edge of [
      'source->task:primary',
      'documents->rubric:primary',
      'load->sandbox:primary',
      'parse->judge:primary',
      'judge->score:primary',
      'boundary->private_holdout:secondary',
      'private_holdout->lab_aa:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LifeBench persona-to-artifact construction, exact release scale, and LoCoMo-style evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LifeBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /20.?30.*AMap|20.?30.*高德/isu);
    assert.match(text, /50.*7.*10/isu);
    assert.match(text, /7-day|7 天/isu);
    assert.match(text, /5,?149.*8,?046.*2,?003.*517.*1,?486/isu);
    assert.match(text, /GPT-5\.1-Mini.*text-embedding-3-small/isu);
    assert.match(text, /IE.*MR.*TKU.*ND.*UA/isu);
    for (const edge of [
      'priors->persona:primary',
      'outline->atomic:primary',
      'subjective->objective:primary',
      'artifacts->qa:primary',
      'qa->quality:primary',
      'release->evaluate:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LVBench screening, three-stage annotation, leakage filtering, model routes, and release drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LVBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /(?:2406\.08035v3|arXiv v3).*518df472.*0caedb92/isu);
    assert.match(text, /500.*30.*720p/isu);
    assert.match(text, /103.*117.*4,?101/isu);
    assert.match(text, /GLM-4.*GPT-4/isu);
    assert.match(text, /1,?549/isu);
    assert.match(text, /32.*96.*(?:One Frame per Second|每秒.*1 帧)/isu);
    assert.match(text, /Regex.*LLM|正则.*LLM/isu);
    assert.match(text, /115\.532.*4,?038.*16.*720p/isu);
    for (const edge of [
      'candidates->screen:primary',
      'stage1->stage2:primary',
      'stage2->taxonomy:primary',
      'editorial_qc->leakage_filter:primary',
      'release->non_native_input:primary',
      'release->native_input:primary',
      'release->release_drift:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LingoQA parallel construction, held-out double labeling, judge training, formula, and count conflicts', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LingoQA', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /4 s.*1 Hz.*5 Frames|4 秒.*1 Hz.*5 帧/isu);
    assert.match(text, /24,?577.*Action|24,?577.*动作/isu);
    assert.match(text, /(?:28K.*419\.9K|2\.8 万.*41\.99 万).*420\.3K.*413,?829.*27,?999/isu);
    assert.match(text, /100.*500.*1,?000/isu);
    assert.match(text, /Double-labeling|双标/isu);
    assert.match(text, /DeBERTa-V3.*LoRA/isu);
    assert.match(text, /zᵢ = maxⱼ f\(qᵢ, rᵢⱼ, aᵢ\).*zᵢ > 0/isu);
    assert.match(text, /95\.0%.*17.*15.*2.*\.950.*\.993/isu);
    for (const edge of [
      'clips->train_branch:primary',
      'train_branch->action_seed:primary',
      'train_branch->scenery_seed:primary',
      'qc_gate->eval_release:primary',
      'qc_gate->relabel:primary',
      'predictions_csv->judge_prompt:data',
      'judge_release->judge_logits:dependency',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LinuxArena construction gates, independent evaluation branches, pre-action monitoring, and safety formulas', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LinuxArena', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /20.*1,?667.*185.*10.*906.*92.*10.*761.*93/isu);
    assert.match(text, /LLM-assisted.*human-reviewed.*Human-authored|LLM 辅助.*人工复核.*人工编写/isu);
    assert.match(text, /UNLIKELY.*MAYBE.*LIKELY|不可能.*可能.*很可能/isu);
    assert.match(text, /0\.9%.*noise floor|0\.9%.*噪声底/isu);
    assert.match(text, /400.*20.*185/isu);
    assert.match(text, /99th percentile.*1%|第 99 百分位.*1%/isu);
    assert.match(text, /Pydantic.*0.?10.*retry|Pydantic.*0.?10.*重试/isu);
    assert.match(text, /P\(¬D ∧ A\).*P\(¬D \| A\).*P\(D\)\/\[P\(D\)\+P\(¬D ∧ A\)\]/isu);
    assert.match(text, /LaStraj v3.*76/isu);
    for (const edge of [
      'c3->c5:primary',
      'c4->c5:primary',
      'c6->c7:primary',
      'd1->c8:primary',
      'd2->x1:primary',
      'd2->c9:primary',
      'c9->c7:data',
      'e1->e2h:primary',
      'e1->e2o:primary',
      'e1->e3:primary',
      'e3->e4:primary',
      'e4->d3:primary',
      'd3->e5:primary',
      'e5->e7:primary',
      'e7->e6:primary',
      'e6->e4:data',
      'd3->e4:data',
      'd3->e8:data',
      'e8->e9:primary',
      'e9->e10:primary',
      'l1->l2:primary',
      'l2->l3:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('e2h->e2o:primary'), `${language} honest and obvious are independent`);
    assert.ok(!edges.has('e2o->e3:primary'), `${language} obvious and subtle are independent`);
  }
});

test('routes LinuxArena evaluation branches and monitor loop without interior edge crossings', () => {
  const routedEdges = [
    ['e2h', 'e10'],
    ['e2c', 'e6'],
    ['e2o', 'e10'],
    ['e3', 'e4'],
    ['e4', 'd3'],
    ['d3', 'e5'],
    ['e5', 'e7'],
    ['e7', 'e6'],
    ['e6', 'e4'],
    ['d3', 'e4'],
    ['d3', 'e8'],
    ['e4', 'e8'],
    ['e8', 'e9'],
    ['e9', 'e10'],
  ];
  for (const language of ['en', 'zh']) {
    const polylines = routedEdges.map(([from, to]) => ({
      key: `${from}->${to}`,
      segments: polylineSegments(svgEdgePolyline('LinuxArena', language, from, to)),
    }));
    for (let left = 0; left < polylines.length; left += 1) {
      for (let right = left + 1; right < polylines.length; right += 1) {
        for (const leftSegment of polylines[left].segments) {
          for (const rightSegment of polylines[right].segments) {
            assert.equal(
              segmentsProperlyCross(leftSegment, rightSegment),
              false,
              `${language} ${polylines[left].key} crosses ${polylines[right].key}`,
            );
          }
        }
      }
    }
  }
});

test('keeps private LinuxBench facts separate from Minimal-LinuxBench and LinuxArena lineage', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LinuxBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /Redwood Research.*AI-control|Redwood Research.*AI 控制/isu);
    assert.match(text, /Main Tasks.*Side Tasks|主任务.*副任务/isu);
    assert.match(text, /Construction.*Undisclosed|(?:构建|构造).*未公开/isu);
    assert.match(text, /Scale.*Split.*QC.*Unknown|规模.*(?:划分|切分).*质控.*未知/isu);
    assert.match(text, /1,?948.*200.*170/isu);
    assert.match(text, /LinuxArena.*(?:unproven|未证)/isu);
    for (const edge of [
      'known_unit->construction_gap:primary',
      'construction_gap->qc_gap:primary',
      'qc_gap->eval_gap:primary',
      'private_arena->minimal_boundary:data',
      'private_arena->lineage_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact primary-source and official-artifact revisions in every A11h detail record', () => {
  const legal = readDetail('Legal_Agent_Benchmark');
  assert.equal(legal.paper_url, '');
  assert.match(legal.homepage, /845a08840869b21a5c11958aae58bf5f00a7b775/u);
  assert.equal(legal.openness, 'public');
  assert.equal(legal.has_leaderboard, true);
  assert.match(legal.drawio_review_note, /1,?671.*1,?660.*101,?000.*120/isu);

  const life = readDetail('LifeBench');
  assert.match(life.paper_url, /2603\.03781/u);
  assert.equal(life.openness, 'public');
  assert.equal(life.has_leaderboard, false);
  assert.match(life.drawio_review_note, /5,?149.*8,?046.*2,?003.*517.*1,?486/isu);

  const lv = readDetail('LVBench');
  assert.match(lv.paper_url, /2406\.08035v3/u);
  assert.match(lv.homepage, /518df47219862534dad39fa1373b4e7c862a4cd5/u);
  assert.equal(lv.dataset_revision, '0caedb92002cc268bad486449e551c76f0485670');
  assert.equal(lv.openness, 'partly public');
  assert.equal(lv.has_leaderboard, true);
  assert.match(lv.drawio_review_note, /07fdecb16a828ff6c4d8d0e68c2e49ca20b2890d.*67b3b779bf7b5323ef517f3f49c150fb31486916/isu);

  const lingo = readDetail('LingoQA');
  assert.match(lingo.paper_url, /2312\.14115v4/u);
  assert.match(lingo.homepage, /39d86b14b681cbb766aaa32cbb2d4a8f5a0ed636/u);
  assert.equal(lingo.openness, 'partly public');
  assert.equal(lingo.has_leaderboard, false);
  assert.match(lingo.drawio_review_note, /a1a6e2194fd1aedaba02bde82316a6b73753d1d5.*413,?829.*27,?999/isu);

  const linuxArena = readDetail('LinuxArena');
  assert.match(linuxArena.paper_url, /2604\.15384v2/u);
  assert.equal(linuxArena.homepage, 'https://www.linuxarena.ai/');
  assert.equal(linuxArena.openness, 'partly public');
  assert.equal(linuxArena.has_leaderboard, false);
  assert.match(linuxArena.drawio_review_note, /4c5aa72e6c6af314bc247c8313e11e78e2c7a946/isu);
  assert.match(linuxArena.drawio_review_note, /48218189eb6d7f69da3666794f4e4d1eeaeb0aa1/isu);
  assert.match(linuxArena.drawio_review_note, /LaStraj.*version=3.*76/isu);
  assert.match(linuxArena.drawio_review_note, /10\/907\/92.*10\/919\/93/isu);

  const linuxBench = readDetail('LinuxBench');
  assert.match(linuxBench.paper_url, /08ab9158070959f88f296514c21b7facce6f52bc/u);
  assert.equal(linuxBench.openness, 'in-house');
  assert.equal(linuxBench.has_leaderboard, false);
  assert.match(linuxBench.drawio_review_note, /1,?948.*200.*170.*LinuxArena/isu);
});

test('keeps every A11h fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11h', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const visibleText = svgVisibleText(svg);
      for (const node of readArch(id, language).nodes) {
        for (const line of node.label.split(/\r?\n/u)) {
          assert.ok(visibleText.includes(line), `${id}.${language}: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces exactly twelve A11h SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11h-exports-'));
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

test('strictly rebuilds and normalizes all twelve A11h specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11h-'));
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
