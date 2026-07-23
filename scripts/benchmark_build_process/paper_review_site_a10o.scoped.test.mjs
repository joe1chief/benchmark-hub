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
const benchmarkIds = ['EgoTempo', 'EmbSpatial-Bench', 'Encyclo-K', 'Eq-bench'];
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
const readSpec = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
);
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

function edgeSpecBlock(id, language, from, to) {
  const match = readSpec(id, language).match(new RegExp(
    `  - from: ${from}\\n    to: ${to}\\n[\\s\\S]*?(?=\\n  - from:|\\nmodules:)`,
    'u',
  ));
  assert.ok(match, `${id}.${language} edge ${from}->${to}`);
  return match[0];
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

test('keeps all four A10o packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('locks EgoTempo narration windows, multiframe curation gate, paper/release count drift, and evidence controls', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('EgoTempo', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2503\.13646v1.*7022ba7.*v1\.0.*adc9e7d/isu);
    assert.match(nodes.get('source')?.label ?? '', /Ego4D.*(?:timestamped|时间戳).*(?:Nj, tj)/isu);
    assert.match(nodes.get('windows')?.label ?? '', /Tj.*tj.*βi.*2α.*(?:local|局部).*?(?:global|全局)/isu);
    assert.match(nodes.get('clips')?.label ?? '', /120.*(?:narrations|叙述).*120.*(?:seconds|秒).*5/isu);
    assert.match(nodes.get('caption')?.label ?? '', /Gemini 1\.5 Pro.*(?:clip|片段).*Ego4D/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /10.*(?:capabilities|类).*sequence.*count.*event.*future.*object-specific.*spatial.*locat.*action-specific|10.*类.*顺序.*计数.*事件.*未来.*特定物体动作.*空间.*定位.*特定动作物体/isu);
    assert.match(nodes.get('review')?.label ?? '', /(?:multiple frames|multiframe).*logical consistency.*irrelevant.*non-temporal|多帧.*逻辑一致.*无关.*时序/isu);
    assert.match(nodes.get('shortcut')?.label ?? '', /single-frame.*not disclosed.*central frame|单帧.*未披露.*中心帧/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /(?:paper|论文).*500.*(?:50.*10|10.*50).*(?:365.*221|221.*365).*40.*3.*140.*45/isu);
    assert.match(nodes.get('release_audit')?.label ?? '', /v1\.0.*500.*367.*clip_id.*222.*video_uid.*(?:differ|不一致)/isu);
    assert.match(nodes.get('video')?.label ?? '', /uniform.*0\.1.*0\.5.*1 FPS|均匀.*0\.1.*0\.5.*1 FPS/isu);
    assert.match(nodes.get('prediction')?.label ?? '', /Gemini.*1\.5 Flash.*not Pro|Gemini.*1\.5 Flash.*不使用.*Pro/isu);
    assert.match(nodes.get('judge')?.label ?? '', /paper.*Gemini 1\.5 Pro.*correct.*incorrect.*notebook.*Flash|论文.*Gemini 1\.5 Pro.*正确.*错误.*notebook.*Flash/isu);
    assert.match(nodes.get('report')?.label ?? '', /Accuracy\(S\).*single-frame|Accuracy\(S\).*单帧/isu);
    assert.ok(edges.has('evidence->source:data'));
    for (const branch of ['text', 'single', 'video']) {
      assert.ok(edges.has(`inputs->${branch}:primary`));
      assert.ok(edges.has(`${branch}->prediction:primary`));
    }
    assert.ok(edges.has('prediction->judge:primary'));
    assert.ok(edges.has('judge->report:primary'));
    assert.ok(edges.has('benchmark->release_audit:data'));
  }
});

test('locks EmbSpatial source splits, exact relation/filter rules, all human checks, and per-source accounting', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('EmbSpatial-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2406\.05756v1.*75792fc.*e2733ca/isu);
    assert.match(nodes.get('sources')?.label ?? '', /Matterport3D.*test.*ScanNet.*validation.*7.*ALFRED.*93|Matterport3D.*测试.*ScanNet.*验证.*7.*ALFRED.*93/isu);
    assert.match(nodes.get('frames')?.label ?? '', /MP3D.*ScanNet.*random.*PDDL.*subgoal|MP3D.*ScanNet.*随机.*PDDL.*子目标/isu);
    assert.match(nodes.get('project')?.label ?? '', /camera.*3D.*2D.*mean.*depth|相机.*三维.*二维.*平均深度/isu);
    assert.match(nodes.get('relations')?.label ?? '', /non-overlapping.*above.*below.*left.*right.*mean depth.*close.*far.*viewer|不重叠.*上.*下.*左.*右.*平均深度.*近.*远.*观察者/isu);
    assert.match(nodes.get('qa')?.label ?? '', /5.*four direction.*false options.*closest.*farthest|四类方向.*5.*错误选项.*最近.*最远/isu);
    assert.match(nodes.get('filter')?.label ?? '', /50 px.*half.*image axis.*balanc|平衡.*50.*像素.*图像轴.*一半.*平衡/isu);
    assert.match(nodes.get('verify')?.label ?? '', /unique.*clear.*target relation.*negative option.*incorrect|唯一.*清晰.*目标空间关系.*负选项.*错误/isu);
    assert.match(nodes.get('per_source')?.label ?? '', /1,201.*928.*133.*26.*1,239.*683.*95.*93.*1,200.*570.*35.*175/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /3,640.*2,181.*277.*294.*(?:six|6)|3,640.*2,181.*277.*294.*六/isu);
    assert.match(nodes.get('evaluation')?.label ?? '', /zero-shot.*generation.*arg max Pθ.*accuracy|零样本.*生成式.*arg max Pθ.*准确率/isu);
    assert.ok(edges.has('evidence->sources:data'));
    for (const [from, to] of [
      ['sources', 'frames'], ['frames', 'project'], ['project', 'relations'], ['relations', 'qa'],
      ['qa', 'filter'], ['filter', 'verify'], ['verify', 'per_source'], ['per_source', 'dataset'],
      ['dataset', 'evaluation'],
    ]) assert.ok(edges.has(`${from}->${to}:primary`));
  }
});

test('locks Encyclo-K scoped hierarchy counts, exact QC, six false patterns, dynamic assembly, and parser fallback', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Encyclo-K', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2512\.24867v2.*5549c73.*0f81da9/isu);
    assert.match(nodes.get('books')?.label ?? '', /62.*11.*43.*(?:source subfields|来源子领域)/isu);
    assert.match(nodes.get('screenshots')?.label ?? '', /(?:screenshots|教材页面).*mosaic|教材页面.*马赛克/isu);
    assert.match(nodes.get('extract')?.label ?? '', /doubao-1\.5-vision-pro-32k.*independence.*completeness.*clarity.*conciseness|doubao-1\.5-vision-pro-32k.*独立.*完整.*清晰.*简洁/isu);
    assert.match(nodes.get('correct_filter')?.label ?? '', /3,269.*642.*127.*21,525/isu);
    assert.match(nodes.get('correct_review')?.label ?? '', /(?:three|3) annotators.*21,525.*no significant.*format.*no domain-expert|3.*标注员.*21,525.*重大问题.*格式.*领域专家/isu);
    assert.match(nodes.get('false_generate')?.label ?? '', /DeepSeek-R1.*concept substitution.*causal inversion.*detail falsification.*temporal dislocation.*logical paradox.*scope modification|DeepSeek-R1.*概念替换.*因果倒置.*细节篡改.*时间错置.*逻辑悖论.*范围修改/isu);
    assert.match(nodes.get('false_review')?.label ?? '', /21,494.*200.*5.*(?:remain false|仍为错误).*(?:no additional|未再)/isu);
    assert.match(nodes.get('pool')?.label ?? '', /(?=.*21,525)(?=.*21,494)(?=.*43,019)(?=.*28,045)(?=.*14,974)(?=.*44)(?=.*62)/isu);
    assert.match(nodes.get('assemble')?.label ?? '', /8.*10.*4.*8.*2.*4.*(?:omits builder code.*seed|未提供构建代码.*随机种子)/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /5,038.*3,286.*1,752.*(?:discipline|学科).*i.*ii.*A.*B/isu);
    assert.match(nodes.get('evaluate')?.label ?? '', /three regex.*last line.*full response.*option-content.*miss.*incorrect|三组正则.*最后一行.*完整响应.*选项正文.*未解析.*错误/isu);
    assert.ok(edges.has('evidence->books:data'));
    for (const [from, to] of [
      ['books', 'screenshots'], ['screenshots', 'extract'], ['extract', 'correct_filter'],
      ['correct_filter', 'correct_review'], ['correct_review', 'false_generate'],
      ['false_generate', 'false_review'], ['false_review', 'pool'], ['pool', 'assemble'],
      ['assemble', 'dataset'], ['dataset', 'evaluate'],
    ]) assert.ok(edges.has(`${from}->${to}:primary`));
  }
});

test('locks EQ-Bench paper V1, retry divergence, negative score range, and aggregation divergence', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Eq-bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2312\.06281v2.*V1.*337df8a.*9c52ae2/isu);
    assert.match(nodes.get('seeds')?.label ?? '', /location.*author style.*conflict.*positive.*negative|地点.*作者风格.*正面.*负面.*冲突/isu);
    assert.match(nodes.get('dialogues')?.label ?? '', /GPT-4.*conflict.*tension.*paper.*not state.*pool|GPT-4.*冲突.*紧张.*论文.*未说明.*候选池/isu);
    assert.match(nodes.get('selection')?.label ?? '', /README.*200.*60.*coherent.*challenging.*not disclosed|README.*200.*连贯.*挑战.*60.*未披露/isu);
    assert.match(nodes.get('references')?.label ?? '', /Authors.*every question.*(?:four|4).*0.*10.*normalized.*10|作者.*每道问题.*四.*0.*10.*总和 10.*归一化/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /V1.*60.*English.*no GPT-4 judge.*9c52ae2|V1.*60.*英文.*不使用 GPT-4 评审.*9c52ae2/isu);
    assert.match(nodes.get('version_gate')?.label ?? '', /defaults.*V2.*171.*-v1.*-revise.*not comparable|默认.*V2.*171.*-v1.*-revise.*不可.*比较/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /zero-shot.*first-pass.*0.*10.*critique.*revised|零样本.*首轮.*0.*10.*批评.*修订/isu);
    assert.match(nodes.get('runner')?.label ?? '', /(?:paper|论文).*3\.10.*0\.01.*0\.15.*(?:attempts exceed|尝试次数超过).*5/isu);
    assert.match(nodes.get('repo_runner')?.label ?? '', /(?:pinned runner|固定运行器).*(?:3 attempts|3 次).*0\.01.*0\.15.*(?:four|4|四).*(?:integer|整数)/isu);
    assert.match(nodes.get('normalize')?.label ?? '', /sum 10.*zero-total.*mismatched.*already[- ]normalized|总和 10.*总和为零.*名称不匹配.*已归一化/isu);
    assert.match(nodes.get('question_score')?.label ?? '', /q = 10.*Σ.*parseable.*(?:no lower clamp|negative)|q = 10.*Σ.*可解析.*(?:不设下限|为负)/isu);
    assert.match(nodes.get('paper_aggregate')?.label ?? '', /average.*first.*revised.*better whole run.*(?:multiply|×).*10.*50\/60|平均.*首轮.*修订.*整轮.*乘 10.*50\/60/isu);
    assert.match(nodes.get('repo_aggregate')?.label ?? '', /revised.*score.*first.*95%.*first.*83\.33%|修订.*得分.*首轮.*95%.*首轮.*83\.33%/isu);
    assert.match(nodes.get('report')?.label ?? '', /negative.*random.*0.*ceiling.*100|允许为负.*随机.*0.*上限.*100/isu);
    assert.ok(edges.has('evidence->seeds:data'));
    assert.ok(edges.has('prompt->repo_runner:data'));
    assert.ok(edges.has('repo_runner->normalize:data'));
    const promptToRepo = edgeSpecBlock('Eq-bench', language, 'prompt', 'repo_runner');
    assert.match(
      promptToRepo,
      /type: data\n    style:\n      exitX: 0\.5\n      exitY: 0\n      entryX: 0\n      entryY: 0\.5/u,
    );
    assert.doesNotMatch(promptToRepo, /waypoints:/u);
    const repoToNormalize = edgeSpecBlock('Eq-bench', language, 'repo_runner', 'normalize');
    assert.match(
      repoToNormalize,
      /type: data\n    style:\n      exitX: 1\n      exitY: 0\.5\n      entryX: 0\.5\n      entryY: 0/u,
    );
    assert.doesNotMatch(repoToNormalize, /waypoints:/u);
    assert.ok(edges.has('aggregate->paper_aggregate:primary'));
    assert.ok(edges.has('aggregate->repo_aggregate:data'));
    assert.ok(edges.has('paper_aggregate->report:primary'));
    assert.ok(edges.has('repo_aggregate->report:data'));
  }
});

test('pins paper, official repository, and dataset revisions plus disclosed gaps in A10o details', () => {
  const ego = readDetail('EgoTempo');
  assert.match(ego.paper_url, /2503\.13646v1/u);
  assert.match(ego.drawio_review_note, /7022ba77.*adc9e7d5.*paper reports.*500 QA.*365 clips.*221 videos.*pinned v1\.0 JSON.*500 rows.*367 unique clip_id.*222 unique video_uid.*release-count drift.*does not disclose.*curation shortcut gate.*notebook.*gemini-1\.5-flash.*paper.*Pro/isu);
  assert.match(ego.scale_en, /Paper.*365 clips.*221 source videos.*pinned v1\.0 JSON.*367 unique clip_id.*222 unique video_uid/isu);

  const emb = readDetail('EmbSpatial-Bench');
  assert.match(emb.paper_url, /2406\.05756v1/u);
  assert.match(emb.drawio_review_note, /75792fc5.*e2733cac.*f9427218.*50 px.*half-axis.*negative options.*EmbSpatial-SFT.*excluded/isu);

  const encyclo = readDetail('Encyclo-K');
  assert.match(encyclo.paper_url, /2512\.24867v2/u);
  assert.match(encyclo.drawio_review_note, /5549c738.*0f81da96.*2165d589.*3,269.*642.*127.*200-item.*five rationale.*no.*question-builder code.*seed/isu);

  const eq = readDetail('Eq-bench');
  assert.match(eq.paper_url, /2312\.06281v2/u);
  assert.match(eq.drawio_review_note, /337df8ab.*9c52ae21.*negative scores.*random-response baseline.*Section 3\.10.*0\.01.*0\.15.*attempts exceeds 5.*200-generated.*60-selected.*-v1 -revise.*three attempts.*95%/isu);
  assert.match(eq.metric_en, /V1.*negative possible.*random baseline 0.*ceiling 100/iu);
  assert.match(eq.scale_en, /V1.*60.*200/iu);
});

test('keeps every A10o fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10o', () => {
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

test('reproduces A10o SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10o-exports-'));
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

test('strictly rebuilds and normalizes all eight A10o specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10o-'));
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
