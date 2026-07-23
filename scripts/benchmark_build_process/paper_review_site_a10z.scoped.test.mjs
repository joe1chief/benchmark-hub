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
const benchmarkIds = [
  'HealthBench_Hard',
  'HealthBench_Professional',
  'HealthSearchQA',
  'HellaSwag',
];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
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
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of arch.edges) {
    const arrow = edge.type === 'primary' ? '-->' : '-.->';
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

test('keeps all four A10z packages bilingual with identical typed topology and academic styling', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence`);
      assert.ok(
        spec.nodes.some(node => node.id === 'artifact_boundary'),
        `${id}.${language} artifact boundary`,
      );
    }
  }
});

test('keeps bilingual labels inside reviewed native-text limits', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 46], ['zh', 30]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split(/\r?\n/u)) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
        }
      }
    }
  }
});

test('locks HealthBench Hard selection, signed rubric score, release, and runner boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HealthBench_Hard', language));
    const edges = edgeSet(readArch('HealthBench_Hard', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2505\.08775v1.*40ee1968.*652c89d0/isu);
    assert.match(nodes.get('full')?.label ?? '', /5,?000.*48,?562.*(?:−10|-10).*10/isu);
    assert.match(nodes.get('models')?.label ?? '', /o3.*Grok 3.*Gemini 2\.5 Pro.*Claude 3\.7.*Llama 4 Maverick/isu);
    assert.match(nodes.get('all_zero')?.label ?? '', /Drop no-positive-score cases.*no model.*positive.*1\.5%|删除无正分样本.*无模型.*正分.*1\.5%/isu);
    assert.doesNotMatch(nodes.get('all_zero')?.label ?? '', /all-zero|全零/isu);
    assert.match(nodes.get('average')?.label ?? '', /average.*providers.*lowest 1,?000|提供商.*平均.*最低 1,?000/isu);
    assert.match(nodes.get('hard_set')?.label ?? '', /2025-05-08-21-00-10.*b0320430.*1,?000/isu);
    assert.match(nodes.get('inference')?.label ?? '', /full conversation.*final user|完整对话.*最后用户/isu);
    assert.match(nodes.get('grade')?.label ?? '', /GPT-4\.1-2025-04-14.*criterion.*JSON|GPT-4\.1-2025-04-14.*准则.*JSON/isu);
    assert.match(nodes.get('example_score')?.label ?? '', /sum met.*positive maximum.*negative|命中.*正分上限.*负分/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /mean.*clip.*0.*1|均值.*截断.*0.*1/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /selection score matrix.*not.*rows.*private.*held-out.*optional.*later|筛选分数矩阵.*不在.*行.*私有.*留出.*可选.*后加/isu);
    for (const edge of [
      'full->models:primary',
      'models->score_candidates:primary',
      'score_candidates->all_zero:primary',
      'all_zero->average:primary',
      'average->hard_set:primary',
      'hard_set->inference:primary',
      'inference->grade:primary',
      'grade->example_score:primary',
      'example_score->aggregate:primary',
      'aggregate->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HealthBench Professional construction, scoring, and public/internal boundary', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HealthBench_Professional', language));
    const edges = edgeSet(readArch('HealthBench_Professional', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2604\.27470v1.*349962fd.*652c89d0/isu);
    assert.match(nodes.get('cohort')?.label ?? '', /190.*50.*26.*52/isu);
    assert.match(nodes.get('good_faith')?.label ?? '', /routine clinical.*academic.*administrative.*research|日常临床.*学术.*行政.*研究/isu);
    assert.match(nodes.get('red_team')?.label ?? '', /structured.*adversarial.*GPT-5\.4.*GPT-5\.2 Instant|结构化.*对抗.*GPT-5\.4.*GPT-5\.2 Instant/isu);
    assert.match(nodes.get('authorship')?.label ?? '', /conversation.*rubric.*Likert 1.7|对话.*量表.*Likert 1.7/isu);
    assert.match(nodes.get('review')?.label ?? '', /one or more.*difficult.*two.*independent.*meaningful.*realistic|一名或多名.*困难.*两名.*独立.*有效.*真实/isu);
    assert.match(nodes.get('adjudication')?.label ?? '', /ambiguities.*rubric.*fact-check|歧义.*量表.*事实核查/isu);
    assert.match(nodes.get('tag')?.label ?? '', /GPT-5\.2.*use case.*specialty.*language.*turn|GPT-5\.2.*用例.*专科.*语言.*轮次/isu);
    assert.match(nodes.get('sample')?.label ?? '', /15,?079.*525.*3\.5.*8/isu);
    assert.match(nodes.get('release')?.label ?? '', /consult 236.*writing 142.*research 147|会诊 236.*写作 142.*研究 147/isu);
    assert.match(nodes.get('physician_baseline')?.label ?? '', /all 525.*specialist.*web.*no AI.*not self-authored|全部 525.*专科.*联网.*无 AI.*非本人出题/isu);
    assert.match(nodes.get('model_response')?.label ?? '', /highest reasoning.*default verbosity.*8 samples|最高推理.*默认详略.*8 次采样/isu);
    assert.match(nodes.get('grader')?.label ?? '', /GPT-5\.4.*low reasoning.*criterion|GPT-5\.4.*低推理.*准则/isu);
    assert.match(nodes.get('raw_score')?.label ?? '', /signed.*positive maximum.*negative|带符号.*正分上限.*负分/isu);
    assert.match(nodes.get('length')?.label ?? '', /2\.94.*10.*5.*2,?000.*0\.0147.*500/isu);
    assert.match(nodes.get('report')?.label ?? '', /mean.*clip.*0.*1.*100|均值.*截断.*0.*1.*100/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /525 public.*private.*held-out.*internal.*not released.*unofficial.*caller|525.*公开.*私有.*留出.*内部.*未发布.*非官方.*调用方/isu);
    for (const edge of [
      'cohort->good_faith:primary',
      'cohort->red_team:secondary',
      'good_faith->authorship:primary',
      'red_team->authorship:secondary',
      'authorship->review:primary',
      'review->adjudication:primary',
      'adjudication->tag:primary',
      'tag->sample:primary',
      'sample->release:primary',
      'release->physician_baseline:secondary',
      'release->model_response:primary',
      'physician_baseline->grader:secondary',
      'model_response->grader:primary',
      'grader->raw_score:primary',
      'raw_score->length:primary',
      'length->report:primary',
      'report->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HealthSearchQA preprint-to-Nature revision and sampled human evaluation', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HealthSearchQA', language));
    const edges = edgeSet(readArch('HealthSearchQA', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2212\.13138v1.*s41586-023-06291-2.*a89f6639/isu);
    assert.match(nodes.get('seeds')?.label ?? '', /medical conditions.*symptoms|医学病症.*症状/isu);
    assert.match(nodes.get('retrieve')?.label ?? '', /public.*search-engine.*all users.*seed terms|公开.*搜索引擎.*所有用户.*种子词/isu);
    assert.match(nodes.get('preprint')?.label ?? '', /3,?375.*100 bootstrap|3,?375.*100 次 bootstrap/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /Nature.*3,?173.*1,?000 bootstrap|Nature.*3,?173.*1,?000 次 bootstrap/isu);
    assert.match(nodes.get('release')?.label ?? '', /ESM.*3,?173.*140.*question-only.*no answers|ESM.*3,?173.*140.*仅问题.*无答案/isu);
    assert.match(nodes.get('sample')?.label ?? '', /100 HealthSearchQA.*20 LiveQA.*20 MedicationQA.*disjoint|100 HealthSearchQA.*20 LiveQA.*20 MedicationQA.*不重叠/isu);
    assert.match(nodes.get('answers')?.label ?? '', /clinician.*Flan-PaLM.*Med-PaLM|医生.*Flan-PaLM.*Med-PaLM/isu);
    assert.match(nodes.get('blind')?.label ?? '', /source hidden.*one of nine clinicians.*answer|来源隐藏.*9 名医生之一.*答案/isu);
    assert.match(nodes.get('clinician_axes')?.label ?? '', /12 axes.*consensus.*harm.*comprehension.*bias|12 轴.*共识.*伤害.*理解.*偏差/isu);
    assert.match(nodes.get('lay_axes')?.label ?? '', /five non-medical.*intent.*helpful|5 名非医学.*意图.*帮助/isu);
    assert.match(nodes.get('bootstrap')?.label ?? '', /1,?000.*95%.*percentile|1,?000.*95%.*百分位/isu);
    for (const edge of [
      'seeds->retrieve:primary',
      'retrieve->preprint:primary',
      'preprint->artifact_boundary:data',
      'artifact_boundary->release:primary',
      'release->sample:primary',
      'sample->answers:primary',
      'answers->blind:primary',
      'blind->clinician_axes:primary',
      'blind->lay_axes:secondary',
      'clinician_axes->bootstrap:primary',
      'lay_axes->bootstrap:secondary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HellaSwag generation, AF, validation, paper totals, and release drift', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HellaSwag', language));
    const edges = edgeSet(readArch('HellaSwag', language));
    assert.match(nodes.get('evidence')?.label ?? '', /1905\.07830v1.*a29ff8e9/isu);
    assert.match(nodes.get('activity')?.label ?? '', /ActivityNet.*temporal captions.*activity labels|ActivityNet.*时序描述.*活动标签/isu);
    assert.match(nodes.get('wikihow')?.label ?? '', /80K.*context.*follow-up.*at most three|80K.*上下文.*后续.*最多三/isu);
    assert.match(nodes.get('candidates')?.label ?? '', /GPT.*5 epochs.*2 epochs.*random.*p=0\.98.*two-sentence|GPT.*5 轮.*2 轮.*随机.*p=0\.98.*两句/isu);
    assert.match(nodes.get('af')?.label ?? '', /BERT-Large.*reinitialize.*80\/20.*four-way.*3 negatives.*converge|BERT-Large.*重置.*80\/20.*四选一.*3 个负例.*收敛/isu);
    assert.match(nodes.get('human')?.label ?? '', /six choices.*one true.*five AF.*replace.*25K.*45K|六选一.*1 真.*5 个 AF.*替换.*25K.*45K/isu);
    assert.match(nodes.get('paper_release')?.label ?? '', /70K.*50K.*10K.*10K.*5K in-domain.*5K zero-shot|70K.*50K.*10K.*10K.*5K 域内.*5K 零样本/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /a29ff8e9.*39,?905.*10,?042.*10,?003.*test unlabeled.*raw.*absent|a29ff8e9.*39,?905.*10,?042.*10,?003.*test 无标签.*原始.*缺失/isu);
    assert.match(nodes.get('model')?.label ?? '', /ctx.*ctx_a.*ctx_b.*four endings.*label.*test probabilities|ctx.*ctx_a.*ctx_b.*4 个结尾.*label.*test 概率/isu);
    assert.match(nodes.get('score')?.label ?? '', /accuracy.*overall.*in-domain.*zero-shot.*source.*test submission|准确率.*总体.*域内.*零样本.*来源.*test 提交/isu);
    for (const edge of [
      'activity->candidates:primary',
      'wikihow->candidates:primary',
      'candidates->af:primary',
      'af->human:primary',
      'human->paper_release:primary',
      'paper_release->artifact_boundary:data',
      'artifact_boundary->model:primary',
      'model->score:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact paper and official artifact revisions in every A10z detail', () => {
  const hard = readDetail('HealthBench_Hard');
  assert.match(hard.paper_url, /2505\.08775v1/u);
  assert.match(hard.repository_url, /652c89d0ca9df547706735883097e9537d40dc47/u);
  assert.match(hard.dataset_url, /40ee1968852fc57f625934251ac22be47077a8fb/u);
  assert.match(hard.drawio_review_note, /Appendix C.*40ee1968.*hard_2025-05-08-21-00-10.*b0320430.*652c89d0.*selection score matrix.*not.*public rows/isu);

  const professional = readDetail('HealthBench_Professional');
  assert.match(professional.paper_url, /2604\.27470v1/u);
  assert.match(professional.repository_url, /652c89d0ca9df547706735883097e9537d40dc47/u);
  assert.match(professional.dataset_url, /349962fd46dd02343a0d8a606491baf59154ea1a/u);
  assert.match(professional.drawio_review_note, /525.*private held-out.*internal.*not release.*unofficial.*2,?000.*0\.0147/isu);

  const search = readDetail('HealthSearchQA');
  assert.match(search.paper_url, /2212\.13138v1/u);
  assert.match(search.dataset_url, /41586_2023_6291_MOESM6_ESM\.xlsx/u);
  assert.match(search.drawio_review_note, /3,?375.*100 bootstrap.*Nature.*3,?173.*1,?000 bootstrap.*a89f6639/isu);

  const hella = readDetail('HellaSwag');
  assert.match(hella.paper_url, /1905\.07830v1/u);
  assert.match(hella.repository_url, /a29ff8e9a04bba4bd6588223785ce105328adc57/u);
  assert.match(hella.dataset_url, /a29ff8e9a04bba4bd6588223785ce105328adc57.*data/u);
  assert.match(hella.drawio_review_note, /70K.*59,?950.*39,?905.*10,?042.*10,?003.*unlabeled.*raw WikiHow.*not.*included/isu);
});

test('keeps every A10z fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10z', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.ok(!drawio.includes('value="\\('), `${id}.${language} native text`);
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

test('reproduces all eight A10z fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10z-exports-'));
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
        execFileSync(drawioDesktop, [
          '-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`,
        ], { stdio: 'pipe' });
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, [
              '-metric', 'AE', generatedPng, `${base}.png`, 'null:',
            ], { stdio: 'pipe' }),
            `${id}.${language}.png pixel freshness`,
          );
        } else {
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png`);
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10z specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10z-'));
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
