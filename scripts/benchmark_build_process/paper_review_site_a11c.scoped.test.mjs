import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['IQTest', 'ImgEdit-Bench', 'IndicGenBench', 'InfographicVQA'];
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
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

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

test('keeps all four A11c packages bilingual with identical typed topology and academic styling', () => {
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

test('locks IQTest construction, MathVista extraction, exact split, and pinned release boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('IQTest', language));
    const edges = edgeSet(readArch('IQTest', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2310\.02255v3.*53d5258.*2b6ad69/isu);
    assert.match(nodes.get('gap')?.label ?? '', /induction.*abstraction.*pattern.*calculation|归纳.*抽象.*模式.*计算/isu);
    assert.match(nodes.get('source')?.label ?? '', /online learning.*228|在线学习.*228/isu);
    assert.match(nodes.get('annotate')?.label ?? '', /graduate.*STEM|STEM.*研究生/isu);
    assert.match(nodes.get('triple')?.label ?? '', /three reviewers|三.*评审|三人.*复核/isu);
    assert.match(nodes.get('consensus')?.label ?? '', /99\.2%.*736.*6.*full team|736.*99\.2%.*6.*全体团队/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /228.*English.*elementary.*logical.*arithmetic|228.*英文.*小学.*逻辑.*算术/isu);
    assert.match(nodes.get('split')?.label ?? '', /37.*testmini.*191.*test/isu);
    assert.match(nodes.get('extract')?.label ?? '', /direct.*GPT-4.*99\.5%.*200|直接.*GPT-4.*200.*99\.5%/isu);
    assert.match(nodes.get('normalize')?.label ?? '', /option.*integer.*float.*list|选项.*整数.*浮点.*列表/isu);
    assert.match(nodes.get('metric')?.label ?? '', /deterministic.*exact.*hidden.*online|确定性.*严格.*隐藏.*在线/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /53d5258.*2b6ad69.*37.*191.*GPT-4.*extractor.*not.*judge|53d5258.*2b6ad69.*37.*191.*GPT-4.*抽取器.*不是.*裁判/isu);
    for (const edge of [
      'evidence->gap:data',
      'gap->source:primary',
      'consensus->dataset:primary',
      'dataset->split:primary',
      'extract->normalize:primary',
      'metric->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks ImgEdit-Bench paper suites, scoring branches, and current-repository drift', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('ImgEdit-Bench', language));
    const edges = edgeSet(readArch('ImgEdit-Bench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2505\.20275v1.*b798481.*f8de753/isu);
    assert.match(nodes.get('design')?.label ?? '', /Basic.*UGE.*Multi-turn|基础.*UGE.*多轮/isu);
    assert.match(nodes.get('basic_source')?.label ?? '', /Internet.*6.*10|网络.*六.*十/isu);
    assert.match(nodes.get('basic_prompts')?.label ?? '', /nine.*GPT-4o.*manual|九.*GPT-4o.*人工/isu);
    assert.match(nodes.get('basic_set')?.label ?? '', /734/isu);
    assert.match(nodes.get('uge_source')?.label ?? '', /47.*occlusion.*repeated.*camouflage.*uncommon|47.*遮挡.*多实例.*伪装.*不常见/isu);
    assert.match(nodes.get('uge_prompts')?.label ?? '', /spatial.*multi-object.*compound.*fine-grained.*large-scale|空间.*多对象.*复合.*细粒度.*大范围/isu);
    assert.match(nodes.get('multi_source')?.label ?? '', /memory.*understanding.*backtracking.*10|记忆.*理解.*回退.*十/isu);
    assert.match(nodes.get('multi_set')?.label ?? '', /30.*(?:3|三)/isu);
    assert.match(nodes.get('single_run')?.label ?? '', /native.*repeat 3|原生.*重复三/isu);
    assert.match(nodes.get('gpt_score')?.label ?? '', /GPT-4o.*1.?5.*adherence.*quality.*preservation|GPT-4o.*1.?5.*遵循.*质量.*保留/isu);
    assert.match(nodes.get('cap')?.label ?? '', /cannot exceed.*adherence|不得高于.*遵循/isu);
    assert.match(nodes.get('fake')?.label ?? '', /FakeShield.*recall|FakeShield.*召回/isu);
    assert.match(nodes.get('human')?.label ?? '', /Human.*Yes.*No|人工.*是.*否/isu);
    assert.match(nodes.get('judge_train')?.label ?? '', /200k|20 万/isu);
    assert.match(nodes.get('judge_train')?.label ?? '', /60.*(?:almost|近|接近).*70%/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /811.*734.*47.*30.*737.*47.*f8de753/isu);
    for (const edge of [
      'evidence->design:data',
      'design->basic_source:primary',
      'design->uge_source:primary',
      'design->multi_source:primary',
      'single_run->fake:optional',
      'gpt_score->judge_train:optional',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks IndicGenBench five tracks, paper split counts, task metrics, and four-component release', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('IndicGenBench', language));
    const edges = edgeSet(readArch('IndicGenBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2404\.16816v2.*ACL 2024.*c96a10d/isu);
    assert.match(nodes.get('sources')?.label ?? '', /CrossSum.*FLORES-200.*XQuAD.*SQuAD.*XOR-TyDi/isu);
    assert.match(nodes.get('select')?.label ?? '', /English.*reuse.*existing|英文.*复用.*已有/isu);
    assert.match(nodes.get('translate')?.label ?? '', /professional.*29.*9.*7.*13|专业.*29.*9.*7.*13/isu);
    assert.match(nodes.get('parallel')?.label ?? '', /13.*(?:4|四)/isu);
    assert.match(nodes.get('crosssum')?.label ?? '', /29.*100.*100.*500.*20\.3k|29.*100.*100.*500.*20\.3k/isu);
    assert.match(nodes.get('flores')?.label ?? '', /22.*7.*997.*1,?012.*58\.2k/isu);
    assert.match(nodes.get('xquad')?.label ?? '', /12.*20.*100.*240.*1,?190.*16\.6k/isu);
    assert.match(nodes.get('xorqa')?.label ?? '', /two-stage.*28.*100.*500.*539.*32k|两阶段.*28.*100.*500.*539.*32k/isu);
    assert.match(nodes.get('release')?.label ?? '', /license.*canary|许可.*Canary/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /one-shot.*0.?5.*fine-tun|One-shot.*0.?5.*微调/isu);
    assert.match(nodes.get('metric')?.label ?? '', /ChrF.*both.*SQuAD.*Token-F1.*three|ChrF.*双向.*SQuAD.*Token-F1.*三/isu);
    assert.match(nodes.get('analysis')?.label ?? '', /high.*medium.*low|高.*中.*低/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /four.*components.*five.*tracks.*XorQA.*EN.*XX|四.*组件.*五.*轨.*XorQA.*EN.*XX/isu);
    for (const edge of [
      'evidence->sources:data',
      'sources->select:primary',
      'parallel->crosssum:primary',
      'parallel->xorqa:primary',
      'release->prompt:primary',
      'metric->analysis:primary',
      'analysis->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks InfographicVQA collection, two-stage QA, final splits, ANLS, and release boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('InfographicVQA', language));
    const edges = edgeSet(readArch('InfographicVQA', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2104\.12756v2.*WACV 2022.*DocVQA/isu);
    assert.match(nodes.get('search')?.label ?? '', /Google.*Bing.*10,?000|Google.*Bing.*10,?000/isu);
    assert.match(nodes.get('phash')?.label ?? '', /perceptual.*2,?000|感知.*2,?000/isu);
    assert.match(nodes.get('ocr_dedupe')?.label ?? '', /Textract.*Jaccard/isu);
    assert.match(nodes.get('pool')?.label ?? '', /7,?000/isu);
    assert.match(nodes.get('workers')?.label ?? '', /40%.*90.*quiz.*13|40%.*90.*测验.*13/isu);
    assert.match(nodes.get('stage1')?.label ?? '', /reject.*30k|拒绝.*3 万/isu);
    assert.match(nodes.get('split')?.label ?? '', /image-disjoint.*80%.*10%.*10%|图片.*互斥.*80%.*10%.*10%/isu);
    assert.match(nodes.get('stage2')?.label ?? '', /validation.*test.*different.*(?:without|cannot see).*first.*cannot answer|验证.*测试.*不同.*不查?看.*首个.*无法回答/isu);
    assert.match(nodes.get('types')?.label ?? '', /4.*5.*counting.*sorting.*arithmetic|四.*五.*计数.*排序.*算术/isu);
    assert.match(nodes.get('filter')?.label ?? '', /1\.9%.*lowercase.*multi-span.*permutation|1\.9%.*小写.*多片段.*排列/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /30,?035.*5,?485.*2,?594.*23,?946.*2,?801.*3,?288.*4,?406.*500.*579/isu);
    assert.match(nodes.get('metric')?.label ?? '', /ANLS.*exact.*lowercase.*best.*0\.5|ANLS.*严格.*小写.*最佳.*0\.5/isu);
    assert.match(nodes.get('human')?.label ?? '', /0\.980.*95\.70/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /DocVQA.*RRC.*Textract.*no generative judge|DocVQA.*RRC.*Textract.*无生成式裁判/isu);
    for (const edge of [
      'evidence->search:data',
      'search->phash:primary',
      'split->stage2:primary',
      'filter->dataset:primary',
      'dataset->human:optional',
      'metric->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact paper and official artifact revisions in every A11c detail record', () => {
  const iq = readDetail('IQTest');
  assert.match(iq.paper_url, /2310\.02255v3/u);
  assert.match(iq.arxiv_pdf_url, /2310\.02255v3/u);
  assert.match(iq.homepage, /53d525874bdde205128e6b160b7357a88277d479/u);
  assert.match(iq.drawio_review_note, /2b6ad69445fbb5695c9b165475e8decdbeb97747/isu);
  assert.match(iq.drawio_review_note, /37.*testmini.*191.*test.*extractor.*not.*judge/isu);

  const img = readDetail('ImgEdit-Bench');
  assert.match(img.paper_url, /2505\.20275v1/u);
  assert.match(img.arxiv_pdf_url, /2505\.20275v1/u);
  assert.match(img.homepage, /b79848168744c8db8389086d01fe3def1758aa45/u);
  assert.match(img.drawio_review_note, /f8de753484a2b6bd37f135fd20d308b66b09a523/isu);
  assert.match(img.drawio_review_note, /paper.*734.*current.*737.*UGE.*47/isu);

  const indic = readDetail('IndicGenBench');
  assert.match(indic.paper_url, /2404\.16816v2/u);
  assert.match(indic.arxiv_pdf_url, /2404\.16816v2/u);
  assert.match(indic.homepage, /c96a10d90ed9b38cc2108cac6f515a1b8bfdc230/u);
  assert.match(indic.drawio_review_note, /four released components.*five paper tracks/isu);
  assert.match(indic.drawio_review_note, /CrossSum.*100\/100\/500.*FLORES.*997\/1,?012.*XQuAD.*20 passages.*100 QA.*20.*100.*240.*1,?190/isu);

  const info = readDetail('InfographicVQA');
  assert.match(info.paper_url, /2104\.12756v2/u);
  assert.match(info.arxiv_pdf_url, /2104\.12756v2/u);
  assert.match(info.homepage, /docvqa\.org.*infographicvqa/isu);
  assert.match(info.drawio_review_note, /WACV 2022.*DocVQA.*RRC/isu);
  assert.match(info.drawio_review_note, /0\.980.*95\.70.*no generative judge/isu);
});

test('keeps every A11c fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(readArch(id, language)),
        `${id}.${language} canonical fallback`,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11c', () => {
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
          assert.ok(visibleText.includes(line), `${id}.${language} SVG label: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces exactly eight A11c SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11c-exports-'));
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

test('strictly rebuilds and normalizes all eight A11c specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11c-'));
  let rebuildCount = 0;
  try {
    for (const id of benchmarkIds) {
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
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
        assert.equal(
          readFileSync(generated.replace(/\.drawio$/u, '.arch.json'), 'utf8'),
          readFileSync(`${base}.arch.json`, 'utf8'),
          `${id}.${language}.arch`,
        );
        rebuildCount += 1;
      }
    }
    assert.equal(rebuildCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
