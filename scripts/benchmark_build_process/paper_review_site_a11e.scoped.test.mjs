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
const benchmarkIds = ['JailJudge', 'JointAVBench', 'K-QA', 'KORBench'];
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

test('keeps all four A11e packages bilingual with academic styling and evidence boundaries', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence`);
      assert.ok(spec.nodes.some(node => node.id === 'artifact_boundary'), `${id}.${language} boundary`);
    }
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 44], ['zh', 30]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks JailJudge test construction, Dempster-Shafer labeling, Guard training, and thresholds', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('JailJudge', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2410\.12855v2.*8743c13/isu);
    assert.match(text, /4,?500.*6,?300.*10.*(?:languages|语言)/isu);
    assert.match(text, /3.*(?:judging|评判).*3.*(?:voting|投票).*1.*(?:inference|推断)/isu);
    assert.match(text, /1.*10.*(?:BPA|基本概率).*0\.1.*Dempster/isu);
    assert.match(text, /35K|35,?000/isu);
    assert.match(text, /LoRA.*Llama.?2.?7B|LoRA.*Llama.?2.*7B/isu);
    assert.match(text, /(?:score|评分).*>\s*2/isu);
    assert.match(text, /Accuracy.*Precision.*Recall.*F1|准确率.*精确率.*召回率.*F1/isu);
    assert.ok(edges.has('judging->bpa:primary'), `${language} judging to BPA`);
    assert.ok(edges.has('bpa->voting:primary'), `${language} BPA to voting`);
    assert.ok(edges.has('voting->inference:primary'), `${language} voting to inference`);
  }
});

test('locks JointAVBench multimodal construction, two-stage quality control, evaluation, and release boundary', () => {
  for (const language of ['en', 'zh']) {
    const text = labels(readArch('JointAVBench', language));
    assert.match(text, /2512\.12772v2.*dbd84e1.*ae27ad8/isu);
    assert.match(text, /1,?072.*1,?046/isu);
    assert.match(text, /PySceneDetect.*Qwen2\.5-VL.*1.*fps/isu);
    assert.match(text, /Whisper.*Qwen2\.5-Omni.*(?:vocal|人声).*(?:sound|声音).*(?:music|音乐)/isu);
    assert.match(text, /15.*5.*4.*3/isu);
    assert.match(text, /9,?109.*3,?974.*2,?853.*71\.8/isu);
    assert.match(text, /(?:modality|模态).*(?:format|格式).*(?:content|内容).*(?:speculation|臆测)/isu);
    assert.match(text, /(?:sequence|顺序).*(?:ambiguity|歧义).*(?:audio.*signal|音频.*信号)/isu);
    assert.match(text, /random.*option.*32.*frame.*A.?D|随机.*选项.*32.*帧.*A.?D/isu);
    assert.match(text, /gated.*low-resolution.*YouTube|受限.*低清.*YouTube/isu);
    assert.match(text, /56\.2.*65\.3/isu);
  }
});

test('locks K-QA clinical curation, physician references, NLI formulas, and optional validation branch', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('K-QA', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2401\.14493v1.*ef403d/isu);
    assert.match(text, /26K/isu);
    assert.match(text, /1,?212.*1,?055.*172/isu);
    assert.doesNotMatch(text, /Privacy Leaks|隐私泄漏人工|人工复核隐私/isu);
    assert.match(text, /(?:6|Six|六).*?(?:physicians|doctors|医生).*UpToDate.*PubMed.*(?:400|四百)/isu);
    assert.match(text, /201.*6\.86.*1,?589.*892.*697/isu);
    assert.match(text, /GPT-4.*(?:few-shot|少样本)/isu);
    assert.match(text, /(?:temperature|温度).*(?:0|零)/isu);
    assert.match(text, /Comp.*(?:entailed|蕴含).*Must|Comp.*必需.*蕴含/isu);
    assert.match(text, /Hall.*(?:contradictions|矛盾).*201/isu);
    assert.match(text, /50.*402.*(?:3|Three|三).*0\.70/isu);
    assert.match(text, /raw.*not.*released|原始.*(?:不公开|未发布)/isu);
    assert.ok(edges.has('nli->validate:data'), `${language} optional NLI validation`);
  }
});

test('locks KOR-Bench core rule pipeline, model-specific prompts, parser, metrics, and optional complex analysis', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('KORBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2410\.06526v3.*bb8194d/isu);
    assert.match(text, /(?:puzzles|谜题).*(?:books|书籍).*(?:virtual[- ]world(?:s)?|虚拟世界)/isu);
    assert.match(text, /5.*25/isu);
    assert.match(text, /10.*1,?250.*125/isu);
    assert.match(text, /Chat.*zero-shot.*Base.*3.*generic|Chat.*零样本.*Base.*3.*通用/isu);
    assert.match(text, /boxed.*(?:SymPy|LaTex)|boxed.*(?:SymPy|LaTex)/isu);
    assert.match(text, /Counterfactual.*real-life.*lower|反事实.*真实生活.*越低/isu);
    assert.match(text, /Multi-Q.*Multi-R.*Multi-RQ.*(?:all-subproblem|全部子问题通过|子题全对)/isu);
    assert.ok(edges.has('dataset->optional_tasks:data'), `${language} optional complex branch`);
  }
});

test('pins exact paper and official artifact revisions in every A11e detail record', () => {
  const jailJudge = readDetail('JailJudge');
  assert.match(jailJudge.paper_url, /2410\.12855v2/u);
  assert.match(jailJudge.homepage, /8743c1364bd9fde2bd680109c70d18942c1f4394/u);
  assert.equal(jailJudge.openness, 'partly public');
  assert.match(jailJudge.drawio_review_note, /4,?500.*6,?300.*35K.*0\.1.*>\s*2/isu);

  const joint = readDetail('JointAVBench');
  assert.match(joint.paper_url, /2512\.12772v2/u);
  assert.match(joint.homepage, /dbd84e1d80114c86631c95bd3d749c42c0a67fe8/u);
  assert.equal(joint.openness, 'partly public');
  assert.match(joint.drawio_review_note, /1,?072.*1,?046.*9,?109.*3,?974.*2,?853.*56\.2.*65\.3/isu);

  const kqa = readDetail('K-QA');
  assert.match(kqa.paper_url, /2401\.14493v1/u);
  assert.match(kqa.homepage, /ef403d012e199fcfa0d8c02b38a96ff95164f4d0/u);
  assert.equal(kqa.openness, 'partly public');
  assert.match(kqa.drawio_review_note, /1,?212.*201.*1,?589.*Hall.*201/isu);

  const kor = readDetail('KORBench');
  assert.match(kor.paper_url, /SVRRQ8goQo|2410\.06526v3/u);
  assert.match(kor.homepage, /bb8194dff8e51e2e2247cf62aa9932c3d57d53d7/u);
  assert.equal(kor.has_leaderboard, true);
  assert.match(kor.drawio_review_note, /125.*1,?250.*Counterfactual.*Multi-Q/isu);
});

test('keeps every A11e fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11e', () => {
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

test('reproduces exactly eight A11e SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11e-exports-'));
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
    assert.equal(exportCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A11e specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11e-'));
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
    assert.equal(rebuildCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
