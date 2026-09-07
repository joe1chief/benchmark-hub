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
const benchmarkIds = ['KernelBench', 'KodCode', 'KontextBench', 'L-V-Eval'];
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

test('keeps all four A11f packages bilingual with academic styling and evidence boundaries', () => {
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

test('locks KernelBench parallel paper partitions, execution environment, exact timing, and artifact drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('KernelBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2502\.10517v1.*yeoN1iQT1x/isu);
    assert.match(text, /100.*100.*50.*250/isu);
    assert.match(text, /evaluation-only.*no gold|仅.*评测.*不提供.*金标准/isu);
    assert.match(text, /no split.*dedup.*contamination|未报告.*划分.*去重.*污染/isu);
    assert.match(text, /L40S.*Ada.*48.*300.*Python 3\.10.*PyTorch 2\.5\.0\+cu124.*CUDA 12\.4/isu);
    assert.match(text, /5.*random.*Model.*ModelNew|5.*随机.*Model.*ModelNew/isu);
    assert.match(text, /3.*(?:warm|预热).*100.*CUDA/isu);
    assert.match(text, /mean\(T_Eager\).*mean\(T_New\).*fast_p.*correct_i.*s_i\s*>\s*p/isu);
    assert.match(text, /L4.*outside.*250|L4.*不属于.*250/isu);
    for (const edge of [
      'format->level1:primary',
      'format->level2:primary',
      'format->level3:primary',
      'level1->release:primary',
      'level2->release:primary',
      'level3->release:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('level1->level2:primary'), `${language} not serial`);
    assert.ok(!edges.has('level2->level3:primary'), `${language} not serial`);
  }
});

test('locks KodCode paper construction, self-verification, later artifacts, and experiment-only branches', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('KodCode', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2503\.02951v2.*Findings.*3a98720.*35bcc3d/isu);
    assert.match(text, /(?:12|十二).*(?:subsets|子集).*all-mpnet-base-v2.*FAISS/isu);
    assert.match(text, /(?:Maximum 10|最多十).*100%.*(?:Must Not Decrease|不得下降)/isu);
    assert.match(text, /(?:above|高于) 2\/3.*1\/3.*2\/3.*(?:below|低于) 1\/3/isu);
    assert.match(text, /279K.*168K.*447K/isu);
    assert.match(text, /DeepSeek-R1.*(?:Three|三个|三次).*reject|DeepSeek-R1.*(?:Three|三个|三次).*拒绝/isu);
    assert.match(text, /484,?097.*3,?335.*268,?211.*210,?787.*4,?439/isu);
    assert.match(text, /9\.5K.*0\.5K.*GRPO.*(?:Not All|并非全部).*447K/isu);
    assert.match(text, /0\.95.*94/isu);
    assert.match(text, /Exclude.*Evaluation.*Not Training|仅从评测.*不从训练/isu);
    assert.ok(edges.has('paper_v1->rl_experiment:data'), `${language} RL experiment branch`);
    assert.ok(edges.has('paper_v1->contamination:data'), `${language} contamination branch`);
    assert.ok(edges.has('contamination->benchmark:data'), `${language} evaluation-only exclusion`);
  }
});

test('locks KontextBench dual inputs, pinned input-only artifact, three evaluations, and separate multi-turn study', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('KontextBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2506\.15742v2.*57ce405.*fb9b2cb/isu);
    assert.match(text, /108.*1,?026/isu);
    assert.match(text, /416.*262.*92.*63.*193/isu);
    assert.match(text, /108.*JPEG.*metadata\.jsonl.*file_name.*instruction.*category.*image_idx.*prompt_idx/isu);
    assert.match(text, /inputs only.*no target.*no eval.*votes.*baseline|仅.*输入.*无目标.*无评测.*投票.*基线/isu);
    assert.match(text, /MIT.*research|MIT.*科研/isu);
    assert.match(text, /ELO.*AuraFace.*Median.*1024.*Median.*Latency|ELO.*AuraFace.*中位数.*1024.*时延中位数/isu);
    assert.match(text, /Multi-turn.*AuraFace.*Cosine.*Input.*Edit k|多轮.*AuraFace.*余弦.*输入.*第 k 轮/isu);
    for (const edge of [
      'use_cases->pairs:primary',
      'images->pairs:primary',
      'generate->human:primary',
      'generate->auraface:primary',
      'generate->latency:primary',
      'generate->multi_turn:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LV-Eval unique-QA arithmetic, conditional augmentations, paper metrics, and repository drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('L-V-Eval', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2402\.05136v3.*63e7ae9.*86a3b0e/isu);
    assert.match(text, /11.*7.*4.*6.*5/isu);
    assert.match(text, /1,?329.*2.*1,?331/isu);
    assert.match(text, /16K.*32K.*64K.*128K.*256K.*1,?729.*8,?645/isu);
    assert.match(text, /PG-19.*Journey to the West|PG-19.*西游记/isu);
    assert.match(text, /CFI.*6.*557.*2.*(?:remove conflicts|消除冲突)/isu);
    assert.match(text, /KPR.*6.*1,?924.*232.*786.*476.*424.*3.*3/isu);
    assert.match(text, /AK.*9.*955/isu);
    assert.match(text, /zero-shot.*greedy.*64.*16.*head.*tail|零样本.*贪心.*64.*16.*头部.*尾部/isu);
    assert.match(text, /R_AK.*0\.2.*0\.4.*blacklist.*F1|R_AK.*0\.2.*0\.4.*黑名单.*F1/isu);
    assert.match(text, /CMRC.*F1.*DuReader.*ROUGE-L/isu);
    assert.match(text, /EN 0\.2.*ZH 0\.4|英.*0\.2.*中.*0\.4/isu);
    assert.ok(!edges.has('cfi->kpr:primary'), `${language} CFI and KPR are not serial for all datasets`);
  }
});

test('pins exact paper and official artifact revisions in every A11f detail record', () => {
  const kernel = readDetail('KernelBench');
  assert.match(kernel.paper_url, /2502\.10517v1/u);
  assert.match(kernel.homepage, /423217d9fda91e0c2d67e4a43bf62f96f6d104f1/u);
  assert.match(kernel.drawio_review_note, /100.*100.*50.*L40S.*fast_p.*(?:L4|Level 4)/isu);

  const kod = readDetail('KodCode');
  assert.match(kod.paper_url, /2503\.02951v2/u);
  assert.match(kod.homepage, /3a98720dfd24ba366a433a962c2df7d8f37b9d61/u);
  assert.equal(kod.venue, 'Findings of ACL 2025');
  assert.match(kod.drawio_review_note, /279K.*168K.*447K.*9\.5K.*0\.5K.*94.*484,?097/isu);

  const kontext = readDetail('KontextBench');
  assert.match(kontext.paper_url, /2506\.15742v2/u);
  assert.match(kontext.homepage, /fb9b2cb88bb41632b81a02c4f98fa33b00941f92/u);
  assert.equal(kontext.openness, 'partly public');
  assert.equal(kontext.has_leaderboard, false);
  assert.match(kontext.drawio_review_note, /1,?026.*416.*262.*92.*63.*193.*inputs only.*ELO/isu);

  const lv = readDetail('L-V-Eval');
  assert.equal(lv.name, 'LV-Eval');
  assert.match(lv.paper_url, /2402\.05136v3/u);
  assert.match(lv.homepage, /63e7ae939bd347c76b2cdb1cebfb216faca26897/u);
  assert.equal(lv.has_leaderboard, true);
  assert.match(lv.drawio_review_note, /1,?331.*1,?729.*8,?645.*0\.2.*0\.4.*blacklist/isu);
});

test('keeps every A11f fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11f', () => {
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

test('reproduces exactly eight A11f SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11f-exports-'));
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

test('strictly rebuilds and normalizes all eight A11f specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11f-'));
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
