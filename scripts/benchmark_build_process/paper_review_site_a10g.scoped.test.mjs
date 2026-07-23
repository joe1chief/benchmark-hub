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
const benchmarkIds = ['CommonEval', 'ComplexFuncBench', 'ComplexFuncBench_Audio', 'Context_Arena'];
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

test('keeps all four A10g packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps CommonEval human-speech construction and official three-sample judge exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CommonEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2410\.17196v3.*d9c570e.*b02edce.*3a02af9/isu);
    assert.match(nodes.get('commonvoice')?.label ?? '', /Common Voice.*diverse speakers.*personal devices|Common Voice.*多样.*说话人.*个人设备/isu);
    assert.match(nodes.get('collect')?.label ?? '', /manual.*information-seeking|人工.*信息寻求/isu);
    assert.match(nodes.get('release')?.label ?? '', /test.*200.*human-recorded.*8\.06.*4\.83.*not synthetic|test.*200.*真人录音.*8\.06.*4\.83.*非合成/isu);
    assert.match(nodes.get('text_input')?.label ?? '', /ground-truth text instruction|标准文本指令/isu);
    assert.match(nodes.get('speech_input')?.label ?? '', /original human audio|原始真人音频/isu);
    assert.match(nodes.get('judge')?.label ?? '', /gpt-4o-mini-2024-07-18.*1.*5.*n.?=.?3.*temperature.?0\.5.*top_p.?0\.95|gpt-4o-mini-2024-07-18.*1.*5.*3 次.*温度.?0\.5.*top_p.?0\.95/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /mean.*3.*200|3.*均值.*200/isu);
    assert.match(nodes.get('report')?.label ?? '', /text.*speech.*processing gap.*content only|文本.*语音.*处理差距.*仅.*内容/isu);
    assert.ok(edges.has('release->text_input:primary'));
    assert.ok(edges.has('release->speech_input:primary'));
    assert.ok(edges.has('text_input->assistant:primary'));
    assert.ok(edges.has('speech_input->assistant:primary'));
  }
});

test('keeps the CommonEval release label inside its node and routes both branches on separate lanes', () => {
  const arch = readArch('CommonEval', 'en');
  const release = nodeMap(arch).get('release');
  const releaseLines = release?.label.split(/\r?\n/u) ?? [];
  assert.ok(releaseLines.length >= 4, 'release label must be deliberately wrapped');
  assert.ok(
    releaseLines.every(line => [...line].length <= 32),
    `release label line exceeds 32 characters: ${releaseLines.join(' | ')}`,
  );

  const spec = readFileSync(
    join(publicDir, 'drawio/CommonEval/CommonEval.en.spec.yaml'),
    'utf8',
  );
  assert.match(
    spec,
    /from: release\n\s+to: text_input\n\s+type: primary\n\s+style:\n\s+exitX: 1\n\s+exitY: 0\.25\n\s+entryX: 0\n\s+entryY: 0\.5/mu,
  );
  assert.match(
    spec,
    /from: release\n\s+to: speech_input\n\s+type: primary\n\s+style:\n\s+exitX: 1\n\s+exitY: 0\.75\n\s+entryX: 0\n\s+entryY: 0\.5/mu,
  );
});

test('keeps ComplexFuncBench collection, feedback loop, and formulas exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ComplexFuncBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2501\.10132v1.*c37b284.*5dc7739.*be1e0f5/isu);
    assert.match(nodes.get('apis')?.label ?? '', /Booking\.com.*RapidAPI.*43.*5 domains.*manually correct|Booking\.com.*RapidAPI.*5 个领域.*43.*人工修正/isu);
    assert.match(nodes.get('coarse')?.label ?? '', /GPT-4o.*1,?000.*preliminary.*function-calling interface|GPT-4o.*1,?000.*函数调用接口.*初步/isu);
    assert.match(nodes.get('select')?.label ?? '', /100.*relatively complete.*diverse|100.*相对完整.*多样/isu);
    assert.match(nodes.get('correct')?.label ?? '', /rewrite.*add.*remove.*reorder.*shortest complete.*type.*value.*hallucinat.*missing|重写.*补充.*删除.*重排.*最短完整.*类型.*取值.*幻觉.*缺失/isu);
    assert.match(nodes.get('disambiguate')?.label ?? '', /overlapping functions.*ambiguous API responses|重叠函数.*歧义 API 响应/isu);
    assert.match(nodes.get('quality')?.label ?? '', /all 100.*until no errors|全部 100.*直至无错误/isu);
    assert.match(nodes.get('generalize')?.label ?? '', /ten.*GPT-4o.*9 new.*original.*junior|10.*GPT-4o.*9 条新.*原始.*初级/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /1,?000.*600.*400.*150.*hotel.*flight.*car.*attraction.*taxi.*cross|1,?000.*600.*400.*酒店.*航班.*租车.*景点.*150.*出租车.*跨域/isu);
    assert.match(nodes.get('format')?.label ?? '', /function.*required parameters.*types.*error.*self-correction|函数.*必需参数.*类型.*错误.*自我纠正/isu);
    assert.match(nodes.get('mapping')?.label ?? '', /bge-large-en-v1\.5.*cosine.*Hungarian|bge-large-en-v1\.5.*余弦.*匈牙利/isu);
    assert.match(nodes.get('matching')?.label ?? '', /exact.*same API response.*GPT-4o.*semantic|精确.*相同 API 响应.*GPT-4o.*语义/isu);
    assert.match(nodes.get('feedback')?.label ?? '', /matched.*annotated.*response.*remove.*add next.*unmatched.*error|匹配.*标注响应.*移除.*加入下一步.*未匹配.*错误/isu);
    assert.match(nodes.get('call_metrics')?.label ?? '', /Success Rate.*successful samples.*1,?000.*Call Acc.*(?:sum|Σ).*correct calls.*(?:sum|Σ).*total calls|成功率.*成功样本.*1,?000.*调用准确率.*正确调用总数.*调用总数/isu);
    assert.match(nodes.get('response_judge')?.label ?? '', /GPT-4o.*completeness.*correctness.*0.*1.*2.*mean|GPT-4o.*完整性.*正确性.*0.*1.*2.*均值/isu);
    assert.ok(edges.has('feedback->model:data'));
    assert.ok(edges.has('output_kind->format:primary'));
    assert.ok(edges.has('output_kind->response_judge:primary'));
  }
});

test('treats ComplexFuncBench Audio as a documented derived evaluation, not a copied dataset build', () => {
  const baseTopology = topology(readArch('ComplexFuncBench', 'en'));
  for (const language of ['en', 'zh']) {
    const arch = readArch('ComplexFuncBench_Audio', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.notDeepEqual(topology(arch), baseTopology);
    assert.equal(nodes.get('derived')?.type, 'process');
    assert.match(nodes.get('evidence')?.label ?? '', /March 2026.*95d1144.*c37b284.*5dc7739|2026 年 3 月.*95d1144.*c37b284.*5dc7739/isu);
    assert.match(nodes.get('base_release')?.label ?? '', /reuse.*1,?000.*text prompts.*reuse published.*scorer.*no new audio dataset|复用.*1,?000.*文本提示.*复用.*既有.*评分器.*无新音频数据集/isu);
    assert.match(nodes.get('audio_synth')?.label ?? '', /synthesi[sz]e audio for each.*TTS model.*voice.*settings.*not disclosed|逐条.*合成音频.*TTS 模型.*音色.*参数.*未披露/isu);
    assert.match(nodes.get('protocol')?.label ?? '', /static[- ]context.*multi-turn.*interdependent.*travel-booking|静态上下文.*多轮.*相互依赖.*旅行预订/isu);
    assert.match(nodes.get('live_run')?.label ?? '', /Gemini Live API.*realtime|Gemini Live API.*实时/isu);
    assert.match(nodes.get('scorer')?.label ?? '', /published.*original benchmark.*function-calling accuracy|公开.*原始基准.*函数调用准确率/isu);
    assert.match(nodes.get('report')?.label ?? '', /90\.8%.*71\.5%.*66\.0%|90\.8%.*71\.5%.*66\.0%/isu);
    assert.ok(edges.has('base_release->derived:primary'));
    assert.ok(edges.has('derived->audio_synth:primary'));
    assert.equal([...nodes.values()].some(node => /Completeness.*Correctness|完整性.*正确性/isu.test(node.label)), false);
  }
});

test('keeps current Context Arena on GDM MRCRv2 independent scoring and isolates OpenAI history', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Context_Arena', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2409\.12640v2.*67b7fd2.*contextarena\.ai.*2026-07-18|2409\.12640v2.*67b7fd2.*contextarena\.ai.*2026-07-18/isu);
    assert.match(nodes.get('history')?.label ?? '', /historical.*OpenAI MRCR.*f4c69fa.*2025-12-05.*not current|历史.*OpenAI MRCR.*f4c69fa.*2025-12-05.*非当前/isu);
    assert.match(nodes.get('construct')?.label ?? '', /format.*topic.*style.*distinct.*interleave.*distractors|格式.*主题.*风格.*不同.*干扰.*交错/isu);
    assert.match(nodes.get('current_release')?.label ?? '', /GDM MRCRv2.*2.*4.*8.*8M.*12-character|GDM MRCRv2.*2.*4.*8.*8M.*12 字符/isu);
    assert.match(nodes.get('arena_slice')?.label ?? '', /Full.*8-needle.*eight bins.*8K.*1M.*not fixed.*100|Full.*8-needle.*8K.*1M.*8 个桶.*非固定.*100/isu);
    assert.match(nodes.get('independent_run')?.label ?? '', /independently.*no head-to-head.*no LLM judge.*tool access|独立.*无两两对战.*无 LLM 裁判.*工具权限/isu);
    assert.match(nodes.get('hash')?.label ?? '', /last occurrence.*12-character|12 字符.*最后一次/isu);
    assert.match(nodes.get('zero')?.label ?? '', /missing.*score.*0|缺失.*0 分/isu);
    assert.match(nodes.get('compare')?.label ?? '', /after the last hash.*SequenceMatcher.*0.*1|最后一次哈希之后.*SequenceMatcher.*0.*1/isu);
    assert.match(nodes.get('bin_mean')?.label ?? '', /mean.*per bin|每桶.*均值/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /Pointwise.*Cum AVG.*unweighted.*AUC.*trapezoid.*linear.*missing bins.*0|Pointwise.*Cum AVG.*不加权.*AUC.*线性.*梯形.*缺失桶.*0/isu);
    assert.ok(edges.has('evidence->history:data'));
    assert.equal([...edges.keys()].some(key => key.startsWith('history->') && key.endsWith(':primary')), false);
    assert.ok(edges.has('current_release->arena_slice:primary'));
    assert.ok(edges.has('independent_run->hash:primary'));
  }
});

test('pins papers, repositories, datasets, checksums, and version drift in A10g details', () => {
  const common = readDetail('CommonEval');
  assert.match(common.paper_url, /2410\.17196v3/u);
  assert.match(common.drawio_review_note, /§§3\.1.*3\.2.*d9c570e.*b02edce.*3a02af9.*200.*n=3.*temperature=0\.5.*top_p=0\.95/isu);

  const complex = readDetail('ComplexFuncBench');
  assert.match(complex.paper_url, /2501\.10132v1/u);
  assert.match(complex.drawio_review_note, /§§2\.1.*2\.2.*§§3\.1.*3\.2.*c37b284.*5dc7739.*be1e0f5/isu);
  assert.match(complex.drawio_review_note, /nine new.*1000.*600.*400.*Call Acc.*sum.*correct.*sum.*total/isu);

  const audio = readDetail('ComplexFuncBench_Audio');
  assert.match(audio.paper_url, /deepmind\.google\/models\/gemini-audio\/live-dialogue/u);
  assert.match(audio.drawio_review_note, /95d1144.*March 2026.*c37b284.*5dc7739.*not disclosed.*function-calling accuracy.*Google.*ran/isu);
  assert.match(audio.metric_en, /Function-calling accuracy/u);

  const context = readDetail('Context_Arena');
  assert.match(context.paper_url, /2409\.12640v2/u);
  assert.match(context.drawio_review_note, /67b7fd2.*GDM MRCRv2.*2026-07-18.*Full.*8-needle.*f4c69fa.*historical/isu);
  assert.match(context.drawio_review_note, /no head-to-head.*no LLM judge.*last.*12-character.*SequenceMatcher.*Cum AVG.*AUC/isu);
  assert.doesNotMatch(context.scale_en, /100 tests per bin/iu);
});

test('keeps every A10g fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10g', () => {
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

test('reproduces A10g SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10g-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x',
          '-f', 'svg',
          '--svg-theme', 'light',
          '-o', generatedSvg,
          `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generatedSvg, 'utf8'),
          readFileSync(`${base}.svg`, 'utf8'),
          `${id}.${language}.svg export freshness`,
        );

        execFileSync(drawioDesktop, [
          '-x',
          '-f', 'png',
          '-o', generatedPng,
          `${base}.drawio`,
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

test('strictly rebuilds and normalizes all eight A10g specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10g-'));
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
