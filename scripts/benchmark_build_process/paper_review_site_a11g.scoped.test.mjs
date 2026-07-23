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
const benchmarkIds = ['LAB-Bench', 'LAB-Bench_FigQA', 'LABBench2', 'LLM_Creative_Story-Writing_Benchmark', 'LMArena', 'LPFQA'];
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
    lines.push(`    ${edge.from} ${edge.type === 'primary' ? '-->' : '-.->'} ${edge.to}`);
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

test('keeps all six A11g packages bilingual with academic styling and explicit evidence boundaries', () => {
  const boundaryNodes = new Map([
    ['LAB-Bench', ['evidence', 'artifact_boundary']],
    ['LAB-Bench_FigQA', ['evidence', 'artifact_boundary']],
    ['LABBench2', ['evidence', 'artifact_boundary']],
    ['LLM_Creative_Story-Writing_Benchmark', ['candidate_sets', 'bootstrap_publish']],
    ['LMArena', ['paper_input', 'public_artifacts']],
    ['LPFQA', ['evidence_boundary', 'public_boundary']],
  ]);
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      for (const nodeId of boundaryNodes.get(id)) {
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

test('locks LAB-Bench construction branches, exact counts, full-set evaluation, and public boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LAB-Bench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2407\.10362v3.*998a8e0.*5c77cec/isu);
    assert.match(text, /750.*650.*248.*102.*226.*305.*135.*41.*2,?457/isu);
    assert.match(text, /1,?967.*490/isu);
    assert.match(text, /Claude 2.*(?:Three Runs|3 次|运行 3 次)/isu);
    assert.match(text, /Accuracy.*Precision.*Coverage|准确率.*精确率.*覆盖率/isu);
    for (const edge of [
      'scope->programmatic:primary',
      'scope->manual_literature:primary',
      'scope->manual_visual:primary',
      'scope->manual_protocol:primary',
      'scope->manual_cloning:primary',
      'full_set->release_split:primary',
      'full_set->model_protocol:primary',
      'full_set->human_baseline:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks FigQA dual authoring routes, human gates, exact release split, parser, and drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LAB-Bench_FigQA', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2407\.10362v3.*998a8e0.*5c77cec/isu);
    assert.match(text, /LabelBox.*Airtable.*GPT-4 Turbo/isu);
    assert.match(text, /226.*181.*45/isu);
    assert.match(text, /ANSWER.*Claude 2/isu);
    assert.match(text, /Acc.*Prec.*Cov.*(?:3|三).*(?:run|次)/isu);
    assert.match(text, /2024-08-19.*1%/isu);
    for (const edge of [
      'evidence->author_route:primary',
      'evidence->contractor_pool:primary',
      'airtable->gpt_seed:optional',
      'gpt_seed->expert_draft:optional',
      'review->dataset:primary',
      'split->version_drift:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LABBench2 six construction pipelines, exact modes, routed graders, and leaderboard contract', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LABBench2', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2604\.09554v2.*c028ecdc.*27d12d72/isu);
    assert.match(text, /1,?137.*150.*86.*400.*125.*14.*1,?912/isu);
    assert.match(text, /HF all.*15.*train/isu);
    assert.match(text, /(?:Fig|图).*101.*(?:Table|表).*100.*SeqQA2.*400.*200.*(?:Cloning|克隆).*14/isu);
    assert.match(text, /Sonnet 4\.5.*0.*0\.95.*1e-6.*20.*0\.95/isu);
    assert.match(text, /15.*14\/15.*9.*201/isu);
    for (const nodeId of [
      'literature_pipeline', 'sourcequality_pipeline', 'dbqa_pipeline',
      'seqqa_pipeline', 'protocol_pipeline', 'cloning_pipeline',
    ]) assert.ok(edges.has(`${nodeId}->dataset:primary`), `${language} ${nodeId}`);
    for (const nodeId of [
      'semantic_judge', 'dbqa_judge', 'numeric_judge', 'seqqa_verifier', 'cloning_verifier',
    ]) assert.ok(edges.has(`evaluate->${nodeId}:primary`), `${language} ${nodeId}`);
  }
});

test('locks the paperless story benchmark prompt construction, bridge validation, pair aggregation, and uncertainty boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LLM_Creative_Story-Writing_Benchmark', language);
    const text = labels(arch);
    assert.match(text, /400.*(?:Ten|十).*9.?10/isu);
    assert.match(text, /600.*800.*(?:ASCII|英文).*\[story\]/isu);
    assert.match(text, /Sparse|稀疏/isu);
    assert.match(text, /(?:v2\/v3.*(?:Bridge|桥接)|(?:Bridge|桥接).*v2\/v3)/isu);
    assert.match(text, /Winner.*Margin.*Signed|胜者.*差值.*带符号/isu);
    assert.match(text, /Side-A.*Opposite-order|A 侧.*相反.*顺序/isu);
    assert.match(text, /Thurstone.*BT.*300.*12345.*95%/isu);
    assert.equal(arch.edges.length, 11, language);
  }
});

test('locks LMArena paper IPW/BT ranking apart from independent checks and dated live-method changes', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LMArena', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /243,?329.*213,?576.*135,?634/isu);
    assert.match(text, /IPW.*Bradley-Terry.*Sandwich|IPW.*Bradley-Terry.*三明治/isu);
    assert.match(text, /3%.*160.*25.*25/isu);
    assert.match(text, /Style Control|风格控制/isu);
    assert.match(text, /CLT.*Frequency|CLT.*频率/isu);
    assert.match(text, /is_direct_battle.*same_org_indicator/isu);
    assert.ok(edges.has('paper_rank->paper_active:data'), language);
    assert.ok(edges.has('paper_active->paper_pair:data'), language);
    assert.ok(edges.has('paper_battle->paper_unsafe:optional'), language);
    assert.ok(!edges.has('paper_expert->paper_win_matrix:primary'), language);
    assert.ok(!edges.has('paper_anomaly->paper_win_matrix:primary'), language);
  }
});

test('locks LPFQA validity and quality gates, format split, v2 counts, judge contract, and artifact drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LPFQA', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /50.*2,?000.*7.*2025/isu);
    assert.match(text, /is_valid.*has_answer.*(?:Accuracy.*Completeness.*Professionalism.*Timelessness|准确性.*完整性.*专业性.*时效稳健性)/isu);
    assert.match(text, /5.?7.*(?:Exactly 1|恰.*1).*4.?6.*1.?5/isu);
    assert.match(text, /1,?000.*6.?8.*137.*133.*160/isu);
    assert.match(text, /430.*249.*181/isu);
    assert.match(text, /11.*Temperature.*1.*top_p.*1/isu);
    assert.match(text, /No Question|不提供问题/isu);
    assert.match(text, /100.*answer_score.*100.*430/isu);
    assert.match(text, /502.*505.*430.*8bf9f2ee/isu);
    for (const edge of [
      'validity_gate->discard_invalid:optional',
      'quality_gate->discard_quality:optional',
      'format_route->mcq:primary',
      'format_route->short_answer:primary',
      'expert_gate->discard_expert:optional',
      'trivial_gate->discard_trivial:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact primary-source and official-artifact revisions in every A11g detail record', () => {
  const lab = readDetail('LAB-Bench');
  assert.match(lab.paper_url, /2407\.10362v3/u);
  assert.match(lab.homepage, /998a8e0a40cf116c80e1b0e7a805ebb5fb9fa838/u);
  assert.equal(lab.openness, 'partly public');
  assert.match(lab.drawio_review_note, /5c77cec648430f30611808808861eb86f81d5eaa.*2,?457.*1,?967.*490/isu);

  const fig = readDetail('LAB-Bench_FigQA');
  assert.match(fig.paper_url, /2407\.10362v3/u);
  assert.equal(fig.openness, 'partly public');
  assert.match(fig.drawio_review_note, /998a8e0a40cf116c80e1b0e7a805ebb5fb9fa838.*5c77cec648430f30611808808861eb86f81d5eaa.*181.*45/isu);

  const lab2 = readDetail('LABBench2');
  assert.match(lab2.paper_url, /2604\.09554v2/u);
  assert.match(lab2.homepage, /c028ecdcf144b55ffcd92b68be45081df5628c20/u);
  assert.equal(lab2.dataset_revision, '27d12d72af24e3f70db8a99df63e567366cbdb80');
  assert.equal(lab2.has_leaderboard, true);

  const story = readDetail('LLM_Creative_Story-Writing_Benchmark');
  assert.equal(story.paper_url, '');
  assert.equal(story.pdf_filename, '');
  assert.match(story.homepage, /aaa0c11a8b4416fecbd6d215820d0792d4f03dbd/u);
  assert.equal(story.openness, 'partly public');
  assert.match(story.drawio_review_note, /6ac3820205c8b0a45b74634be5e4ebf97c84ce8a.*0286ecfcac37fbb3e19be4465662264de1e3ea98/isu);

  const arena = readDetail('LMArena');
  assert.match(arena.paper_url, /2403\.04132v1/u);
  assert.equal(arena.openness, 'partly public');
  assert.equal(arena.has_leaderboard, true);
  assert.match(arena.intro, /243,?329.*213,?576.*135,?634/isu);
  assert.match(arena.drawio_review_note, /Style Control.*Battles in Direct/isu);

  const lpfqa = readDetail('LPFQA');
  assert.match(lpfqa.paper_url, /2511\.06346v2/u);
  assert.match(lpfqa.homepage, /m-a-p\/LPFQA/u);
  assert.equal(lpfqa.openness, 'partly public');
  assert.equal(lpfqa.has_leaderboard, false);
  assert.match(lpfqa.drawio_review_note, /8bf9f2ee879396909f940b512c9239be121a2505.*502.*505.*430.*withdrawn/isu);
});

test('keeps every A11g fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11g', () => {
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

test('reproduces exactly twelve A11g SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11g-exports-'));
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

test('strictly rebuilds and normalizes all twelve A11g specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11g-'));
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
