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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['DARE-bench', 'DBQA', 'DLC-Bench', 'DPG-Bench'];
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
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

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
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of arch.edges) {
    const arrow = mermaidArrow(edge);
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
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

test('keeps all four A10n packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('locks DARE-bench variant-specific curation, ground-truth routes, and release boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DARE-bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2602\.24288v1.*0144714/isu);
    assert.match(nodes.get('sources')?.label ?? '', /Kaggle.*official API.*tabular.*open license.*web.*description.*column preview|Kaggle.*官方 API.*表格.*开放许可.*网页.*描述.*列预览/isu);
    assert.match(nodes.get('feasibility')?.label ?? '', /target.*feature.*type.*frequency.*well-posed|目标.*特征.*类型.*频率.*可行/isu);
    assert.match(nodes.get('families')?.label ?? '', /Classification.*IF.*MM.*Regression.*IF.*MM.*Time-series.*XF.*CF|分类.*IF.*MM.*回归.*IF.*MM.*时间序列.*XF.*CF/isu);
    assert.match(nodes.get('if_post')?.label ?? '', /random.*split.*noise.*20%.*training.*test.*clean|随机.*划分.*20%.*训练.*噪声.*测试.*干净/isu);
    assert.match(nodes.get('mm_post')?.label ?? '', /random.*split.*mask.*target|随机.*划分.*遮蔽.*目标/isu);
    assert.match(nodes.get('ts_post')?.label ?? '', /chronological.*entity.*leakage.*resampl.*XF.*exogenous.*CF.*timestamp|时间.*划分.*实体.*泄漏.*重采样.*XF.*外生.*CF.*时间戳/isu);
    assert.match(nodes.get('if_ground_truth')?.label ?? '', /sandbox.*reference code.*fixed seed.*reproducib|沙箱.*参考代码.*固定随机种子.*复现/isu);
    assert.match(nodes.get('label_ground_truth')?.label ?? '', /original masked labels.*no reference-code sandbox|原始遮蔽标签.*无需.*参考代码.*沙箱/isu);
    assert.match(nodes.get('paper_release')?.label ?? '', /6,?300.*5,?948.*352.*most recently updated.*2,?468.*1,?888.*1,?944|6,?300.*5,?948.*352.*最近更新.*2,?468.*1,?888.*1,?944/isu);
    assert.match(nodes.get('public_release')?.label ?? '', /license-filtered.*0144714.*4,?274.*324.*2,?137.*162|许可筛选.*0144714.*4,?274.*324.*2,?137.*162/isu);
    assert.match(nodes.get('agent')?.label ?? '', /5 turns.*200 s.*prediction\.csv|5 轮.*200 秒.*prediction\.csv/isu);
    assert.match(nodes.get('verifier')?.label ?? '', /IF.*exact.*Classification-MM.*Macro-F1.*Regression-MM.*XF.*CF.*clipped R.*\[0, ?1\].*average.*targets.*no judge|IF.*精确.*分类-MM.*Macro-F1.*回归-MM.*XF.*CF.*截断 R.*\[0, ?1\].*目标.*平均.*无裁判/isu);
    for (const branch of ['if_post', 'mm_post', 'ts_post']) assert.ok(edges.has(`route->${branch}:primary`));
    assert.ok(edges.has('if_post->if_ground_truth:primary'));
    assert.ok(edges.has('mm_post->label_ground_truth:primary'));
    assert.ok(edges.has('ts_post->label_ground_truth:primary'));
    assert.ok(edges.has('paper_release->public_release:data'));
    assert.ok(edges.has('paper_release->task_input:primary'));
  }
});

test('locks DbQA identity, ten programmatic subtasks, 80/20 split, paper prompt, parser, and metrics', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DBQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /LAB-Bench.*DbQA.*2407\.10362v3.*998a8e0/isu);
    assert.match(nodes.get('source_versions')?.label ?? '', /DisGeNet.*OMIM.*Ensembl.*110.*MSigDB.*2023\.2.*miRDB.*6\.0.*GTRD.*ClinVar.*ProteinGym.*P-HIPSter|DisGeNet.*OMIM.*Ensembl.*110.*MSigDB.*2023\.2.*miRDB.*6\.0.*GTRD.*ClinVar.*ProteinGym.*P-HIPSter/isu);
    assert.match(nodes.get('subtasks')?.label ?? '', /10.*disease.*location.*miRNA.*tumor.*oncogenic.*TFBS.*variant.*two.*vaccine.*viral PPI|10.*疾病.*位置.*miRNA.*肿瘤.*致癌.*TFBS.*变异.*两类.*疫苗.*病毒 PPI/isu);
    assert.match(nodes.get('distractors')?.label ?? '', /set difference.*protein-coding.*same chromosome.*opposite ClinVar|集合差.*蛋白编码.*同一染色体.*ClinVar.*相反/isu);
    assert.match(nodes.get('full')?.label ?? '', /full paper.*650.*10|论文完整.*650.*10/isu);
    assert.match(nodes.get('split')?.label ?? '', /520 public.*130 private.*80%.*20%.*35%.*human coverage.*not.*public|520.*公开.*130.*私留.*80%.*20%.*35%.*人类覆盖.*不是.*公开/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /random.*choice.*Insufficient information.*zero-shot.*chain-of-thought.*\[ANSWER\].*no tools|随机.*选项.*信息不足.*零样本.*思维链.*\[ANSWER\].*无工具/isu);
    assert.match(nodes.get('parse')?.label ?? '', /paper.*regex.*Claude 2.*fallback|论文.*正则.*回退.*Claude 2/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /accuracy.*correct.*total.*precision.*correct.*attempted.*coverage.*attempted.*total|准确率.*正确.*总题数.*精确率.*正确.*作答.*覆盖率.*作答.*总题数/isu);
    assert.ok(edges.has('source_versions->subtasks:primary'));
    assert.ok(edges.has('subtasks->generate:primary'));
    assert.ok(edges.has('full->split:primary'));
    assert.ok(edges.has('split->prompt:primary'));
    assert.ok(edges.has('baseline->parse:primary'));
  }
});

test('locks DLC-Bench benchmark curation apart from DLC-SDP and preserves the recognition-gated scorer', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DLC-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2504\.16072v1.*153ad3d.*2336d95.*DLC-SDP.*not.*benchmark|2504\.16072v1.*153ad3d.*2336d95.*DLC-SDP.*不属于.*基准/isu);
    assert.match(nodes.get('source')?.label ?? '', /Objects365 v2.*validation.*human.*segmentation mask|Objects365 v2.*验证.*人工.*分割掩码/isu);
    assert.match(nodes.get('allocation')?.label ?? '', /100.*GPT-4o.*34.*Gemini 1\.5 Pro.*35.*Claude 3\.5 Sonnet.*31/isu);
    assert.match(nodes.get('positive')?.label ?? '', /object.*part.*color.*shape.*texture.*material.*size.*manual.*add.*revise.*remove|对象.*部件.*颜色.*形状.*纹理.*材料.*大小.*人工.*补充.*修正.*移除/isu);
    assert.match(nodes.get('negative')?.label ?? '', /mislocalization.*outside.*mask.*hallucination.*typical.*absent.*occluded|错位.*掩码外.*幻觉.*常见.*缺失.*遮挡/isu);
    assert.match(nodes.get('curate')?.label ?? '', /manual.*inspect.*ambiguous.*unclear.*mutually exclusive.*deduplicat.*training|人工.*检查.*歧义.*不清.*互斥.*(?:去重.*训练|训练.*去重)/isu);
    assert.match(nodes.get('artifact')?.label ?? '', /2336d95.*100.*77.*892.*392 positive.*500 negative|2336d95.*100.*77.*892.*392.*正向.*500.*负向/isu);
    assert.match(nodes.get('judge')?.label ?? '', /Meta-Llama-3\.1-8B-Instruct.*text-only.*temperature 0.*300.*one choice|Meta-Llama-3\.1-8B-Instruct.*纯文本.*温度 0.*300.*一个选项/isu);
    assert.match(nodes.get('recognition')?.label ?? '', /recognition.*prepended.*wrong.*cap.*≤ ?0|识别.*前置.*错误.*上限.*≤ ?0/isu);
    assert.match(nodes.get('score')?.label ?? '', /positive.*1.*0\.5.*0.*-1.*negative.*omit.*1.*hallucination.*-1|正向.*1.*0\.5.*0.*-1.*负向.*省略.*1.*幻觉.*-1/isu);
    assert.match(nodes.get('report')?.label ?? '', /mean per instance.*positive.*negative.*average of.*positive and negative|逐实例.*平均.*正向.*负向.*两者平均/isu);
    assert.ok(edges.has('question_route->positive:primary'));
    assert.ok(edges.has('question_route->negative:primary'));
    assert.ok(edges.has('positive->curate:primary'));
    assert.ok(edges.has('negative->curate:primary'));
    assert.ok(edges.has('judge->recognition:primary'));
    assert.ok(edges.has('recognition->score:primary'));
  }
});

test('locks DPG-Bench source branches, DSG construction, four-image protocol, dependency pruning, and aggregation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DPG-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2403\.05135v1.*3c228f1.*68f5076/isu);
    assert.match(nodes.get('sources')?.label ?? '', /COCO.*PartiPrompts.*DSG-1k.*Object365/isu);
    assert.match(nodes.get('short')?.label ?? '', /first three.*short.*long,? dense|前三个.*短提示.*长.*密集/isu);
    assert.match(nodes.get('object365')?.label ?? '', /1.?4 objects.*main.*subcategory|1.?4.*对象.*主类别.*子类别/isu);
    assert.match(nodes.get('expand')?.label ?? '', /GPT-4.*scene.*attribute.*relationship|GPT-4.*场景.*属性.*关系/isu);
    assert.match(nodes.get('verify')?.label ?? '', /human.*verif|人工.*核验/isu);
    assert.match(nodes.get('dsg')?.label ?? '', /second GPT-4.*DSG.*tuple.*question.*dependency graph|第二次 GPT-4.*DSG.*元组.*问题.*依赖图/isu);
    assert.match(nodes.get('artifact')?.label ?? '', /68f5076.*1,?065.*83\.91.*4,?286.*5.*13/isu);
    assert.match(nodes.get('generate')?.label ?? '', /4 images.*2.?2 grid.*filename.*prompt|4.*图.*2.?2.*文件名.*提示/isu);
    assert.match(nodes.get('vqa')?.label ?? '', /damo\/mplug_visual-question-\s*answering_coco_large_en.*yes.*no.*four tiles|damo\/mplug_visual-question-\s*answering_coco_large_en.*yes.*no.*四.*图/isu);
    assert.match(nodes.get('dependency')?.label ?? '', /yes.*1.*no.*0.*any parent.*no.*child.*0|yes.*1.*no.*0.*任一父问题.*no.*子问题.*0/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /image.*mean.*question.*prompt.*mean.*4.*benchmark.*mean.*prompts|单图.*问题.*平均.*提示.*4.*平均.*基准.*提示.*平均/isu);
    assert.match(nodes.get('report')?.label ?? '', /dependency-aware.*Global.*Entity.*Attribute.*Relation.*Other.*13.*raw yes.*no|依赖感知.*Global.*Entity.*Attribute.*Relation.*Other.*13.*原始 yes.*no/isu);
    assert.ok(edges.has('route->short:primary'));
    assert.ok(edges.has('route->object365:primary'));
    assert.ok(edges.has('short->expand:primary'));
    assert.ok(edges.has('object365->expand:primary'));
    assert.ok(edges.has('vqa->dependency:primary'));
    assert.ok(edges.has('dependency->aggregate:primary'));
  }
});

test('pins paper and official artifact revisions plus scale boundaries in A10n details', () => {
  const dare = readDetail('DARE-bench');
  assert.match(dare.paper_url, /2602\.24288v1/u);
  assert.match(dare.drawio_review_note, /0144714.*6,?300.*5,?948.*352.*4,?274.*324.*2,?137.*162.*variant-specific.*20%.*five turns.*200/isu);

  const dbqa = readDetail('DBQA');
  assert.match(dbqa.paper_url, /2407\.10362v3/u);
  assert.match(dbqa.scale, /650.*520.*公开.*130.*私留.*35%.*人类.*覆盖/u);
  assert.match(dbqa.scale_en, /650.*520.*public.*130.*private.*35%.*human.*coverage/iu);
  assert.match(dbqa.drawio_review_note, /DbQA.*998a8e0.*10.*520.*130.*35%.*human coverage.*not.*public.*regex.*Claude 2/isu);

  const dlc = readDetail('DLC-Bench');
  assert.match(dlc.paper_url, /2504\.16072v1/u);
  assert.match(dlc.drawio_review_note, /153ad3d.*2336d95.*77.*100.*892.*392.*500.*recognition.*temperature 0.*300/isu);
  assert.doesNotMatch(dlc.mermaid_flowchart, /Semi-supervised Learning|Pseudo-Labels/iu);

  const dpg = readDetail('DPG-Bench');
  assert.match(dpg.paper_url, /2403\.05135v1/u);
  assert.match(dpg.drawio_review_note, /3c228f1.*68f5076.*1,?065.*14,?392.*damo\/mplug_visual-question-answering_coco_large_en.*parent.*zero.*four.*raw/isu);
});

test('keeps every A10n fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10n', () => {
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

test('reproduces A10n SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10n-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(
          generatedSvg,
          `${base}.svg`,
          `${id}.${language}.svg export freshness`,
        );

        execFileSync(drawioDesktop, ['-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`], { stdio: 'pipe' });
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, [
              '-metric', 'AE', generatedPng, `${base}.png`, 'null:',
            ], { stdio: 'pipe' }),
            `${id}.${language}.png pixel freshness`,
          );
        } else {
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png export freshness`);
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10n specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10n-'));
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
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
