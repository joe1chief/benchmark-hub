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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['FOFO', 'FigureQA', 'FinSearchComp', 'Finance_Agent_Benchmark'];
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
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeMap = arch => new Map(arch.edges.map(edge => [
  `${edge.from}->${edge.to}:${edge.type}`,
  edge,
]));

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
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

test('keeps all four A10q packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual node text within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 32]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
        }
      }
    }
  }
});

test('pins FOFO candidate versus final counts and its complete evaluator path', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('FOFO', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2402\.18667v1.*140b1661.*8f4cddcb/isu);
    assert.match(nodes.get('domain_taxonomy')?.label ?? '', /10.*5.*50/isu);
    assert.match(nodes.get('format_candidates')?.label ?? '', /500.*254/isu);
    assert.match(nodes.get('format_review')?.label ?? '', /JSON.*XML.*CSV.*Markdown.*YAML/isu);
    assert.match(nodes.get('instruction_authoring')?.label ?? '', /dummy context|虚拟上下文/isu);
    assert.match(nodes.get('release')?.label ?? '', /494.*248.*2,?908/isu);
    assert.match(nodes.get('prompting')?.label ?? '', /Alpaca.*Vicuna.*Mistral.*Zephyr.*OpenChat/isu);
    assert.match(nodes.get('generation')?.label ?? '', /0\.7.*top.?p.*1.*5,?120/isu);
    assert.match(nodes.get('judge')?.label ?? '', /GPT-4.*1,?024.*0.*missing|GPT-4.*1,?024.*0.*缺少/isu);
    assert.match(nodes.get('parser_metric')?.label ?? '', /json_parser.*format_correctness.*n_correct.*n_total/isu);
    assert.match(nodes.get('human_audit')?.label ?? '', /84.*100.*16.*false positive|84.*100.*16.*假阳性/isu);
  }
});

test('pins FigureQA generation, color split, balance, metric, and missing release contracts', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FigureQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /1710\.07300v2.*1981b72f.*a853b4f0/isu);
    assert.match(nodes.get('source_sampling')?.label ?? '', /linear.*quadratic.*bell|线性.*二次.*钟形/isu);
    assert.match(nodes.get('render')?.label ?? '', /vertical.*horizontal.*line.*dot.?line.*pie|垂直.*水平.*折线.*点线.*饼图/isu);
    assert.match(nodes.get('annotations')?.label ?? '', /modified Bokeh.*bounding box|改造.*Bokeh.*边界框/isu);
    assert.match(nodes.get('question_templates')?.label ?? '', /15.*Yes.*No|15.*是.*否/isu);
    assert.match(nodes.get('balance')?.label ?? '', /question.?ID|问题 ID/isu);
    assert.match(nodes.get('balance')?.label ?? '', /drop.*surplus.*at least one|丢弃.*盈余.*至少/isu);
    assert.match(nodes.get('color_split')?.label ?? '', /color_scheme.*100.*50.*50.*alternat|color_scheme.*100.*50.*50.*交替/isu);
    assert.match(nodes.get('published_release')?.label ?? '', /100k.*1\.3M.*20k.*250k|10万.*130万.*2万.*25万/isu);
    assert.match(nodes.get('task_metric')?.label ?? '', /Yes.*No|是.*否/isu);
    assert.match(nodes.get('task_metric')?.label ?? '', /accuracy.*template|template.*accuracy|准确率.*模板|模板.*准确率/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /config.*train1.*val1.*val2.*no test|配置.*train1.*val1.*val2.*不含.*test/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /no canonical.*prompt.*parser|无.*规范.*提示.*解析器/isu);
    assert.ok(edges.has('evidence->color_split:primary'));
    assert.ok(edges.has('color_split->source_sampling:primary'));
    assert.ok(edges.has('balance->published_release:primary'));
    assert.ok(edges.has('published_release->task_metric:primary'));
    assert.ok(edges.has('evidence->release_boundary:data'));
    assert.ok(!edges.has('balance->color_split:primary'));
    assert.ok(!edges.has('task_metric->release_boundary:primary'));
  }
});

test('separates FinSearchComp paper scoring from the pinned public-harness defects', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FinSearchComp', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2509\.13160v1.*55b6393f.*6437a6da/isu);
    assert.match(nodes.get('task_design')?.label ?? '', /T1.*T2.*T3/isu);
    assert.match(nodes.get('experts')?.label ?? '', /50.*20.*70.*180.*60/isu);
    assert.match(nodes.get('blind_review')?.label ?? '', /1.?2.*blind|1.?2.*盲/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /635.*337.*134.*119.*84.*298.*110.*100.*88/isu);
    assert.match(nodes.get('paper_protocol')?.label ?? '', /dynamic API.*after.*market close|收盘后.*动态 API/isu);
    assert.match(nodes.get('judge_prompt')?.label ?? '', /21\.4%.*exact.*78\.6%.*in.?range|21\.4%.*精确.*78\.6%.*范围/isu);
    assert.match(nodes.get('paper_metric')?.label ?? '', /0.?1.*mean.*accuracy.*95%|0.?1.*平均.*准确率.*95%/isu);
    assert.match(nodes.get('repo_release')?.label ?? '', /635.*594.*2025-10-17|635.*594.*2025-10-17/isu);
    assert.match(nodes.get('parser_audit')?.label ?? '', /scalar.*answer_score.*\[0\]\[0\]|answer_score.*标量.*\[0\]\[0\]/isu);
    assert.match(nodes.get('metric_audit')?.label ?? '', /non_ts.*never.*updated.*accuracy.*0|non_ts.*从未.*更新.*accuracy.*0/isu);
    assert.ok(edges.has('dataset->paper_protocol:primary'));
    assert.ok(edges.has('judge_prompt->paper_metric:primary'));
    assert.ok(edges.has('dataset->repo_release:secondary'));
    assert.ok(edges.has('repo_release->parser_audit:secondary'));
    assert.ok(edges.has('parser_audit->metric_audit:secondary'));
  }
});

test('pins Finance Agent construction, paper protocol, public subset, and gated judge boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Finance_Agent_Benchmark', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2508\.00828v1.*82337852.*901e8cff/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /7.*9/isu);
    assert.match(nodes.get('questions')?.label ?? '', /537.*2024/isu);
    assert.match(nodes.get('peer_review')?.label ?? '', /different expert.*correct.*remove|异人.*纠正.*移除/isu);
    assert.match(nodes.get('rubric_generation')?.label ?? '', /GPT-4o.*JSON array.*manual|GPT-4o.*JSON 数组.*人工/isu);
    assert.match(nodes.get('splits')?.label ?? '', /50.*150.*337/isu);
    assert.match(nodes.get('paper_prompt')?.label ?? '', /no system prompt.*FINAL ANSWER.*0.*16,?384|无系统提示.*FINAL ANSWER.*0.*16,?384/isu);
    assert.match(nodes.get('tools')?.label ?? '', /Google.*EDGAR.*ParseHTML.*RetrieveInformation/isu);
    assert.match(nodes.get('judge')?.label ?? '', /all correctness.*no contradiction|全部正确性.*无矛盾/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /equal.*mean.*9.*naive|9.*等权.*平均.*朴素/isu);
    assert.match(nodes.get('public_release')?.label ?? '', /50.*200.*50.*private.*gated|50.*200.*50.*私有.*受限/isu);
    assert.match(nodes.get('repo_protocol')?.label ?? '', /April 07, 2025.*submit_final_result.*32,?000.*50 turns|2025-04-07.*submit_final_result.*32,?000.*50 轮/isu);
    assert.match(nodes.get('repo_protocol')?.label ?? '', /judge.*parser.*absent|评分.*解析器.*缺失/isu);
    assert.ok(edges.has('splits->paper_prompt:primary'));
    assert.ok(edges.has('judge->metrics:primary'));
    assert.ok(edges.has('splits->public_release:secondary'));
    assert.ok(edges.has('public_release->repo_protocol:secondary'));
  }
});

test('pins paper versions, official commits, hashes, and explicit missing boundaries in detail records', () => {
  const expected = {
    FOFO: [
      /2402\.18667v1/u,
      /140b1661355672cce9ba84dbf8c9060980126581/u,
      /8f4cddcb5667dc320a5d444a05d3d24657cf7b5f5a3aea2146ba92c4540c8f3b/u,
      /18cd1a0bcf89113b56b6a4f300e6bc62abb7c5f4d5724c32f973a9e05fcafc0/u,
    ],
    FigureQA: [
      /1710\.07300v2/u,
      /1981b72f7ca48526fd8ca594b3713407d2857e4f/u,
      /a853b4f02f5ae3a1d800e7987de88480dde6f3a02d87f9b843ed8477592e46a2/u,
      /does not generate the test sets|不生成测试集/iu,
      /no canonical model prompt or answer parser|无规范模型提示或答案解析器/iu,
    ],
    FinSearchComp: [
      /2509\.13160v1/u,
      /55b6393fcf3c8f749ba5a69a70b20d4ef6f67caf/u,
      /6437a6dae907ec81002bd817dafc26c3e46e6b6edfde700f22645b1e2aa208c4/u,
      /parser.*answer_score.*\[0\]\[0\].*scalar|解析器.*answer_score.*\[0\]\[0\].*标量/isu,
      /non_ts.*never.*updated|non_ts.*从未.*更新/isu,
    ],
    Finance_Agent_Benchmark: [
      /2508\.00828v1/u,
      /82337852884d19017154f21bf8d7a4ae09e9896b/u,
      /901e8cff562819007d43ff0c10b43b2e386481eb40f2157ba18da8fbbe05bff5/u,
      /public repository.*50.*private.*gated|公开仓库.*50.*私有.*受限/isu,
      /judge implementation.*parser.*not public|评分实现.*解析器.*未公开/isu,
    ],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, patterns[0], `${id} paper`);
    for (const pattern of patterns.slice(1)) {
      assert.match(detail.drawio_review_note, pattern, `${id} review boundary`);
    }
  }
});

test('keeps every A10q detail fallback synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const fallback = detail[`flowchart_${language}`];
      for (const node of arch.nodes) {
        assert.ok(fallback.includes(node.label.split('\n')[0]), `${id}.${language}.${node.id}`);
      }
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10q', () => {
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

test('reproduces all eight A10q fixed-light SVG and PNG exports', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10q-exports-'));
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
        assert.equal(
          readFileSync(generatedSvg, 'utf8'),
          readFileSync(`${base}.svg`, 'utf8'),
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
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png export freshness`);
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10q specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10q-'));
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
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}`,
        );
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
