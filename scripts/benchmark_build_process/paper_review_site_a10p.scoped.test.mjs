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
const benchmarkIds = ['ExploitBench', 'FACTS_Grounding', 'FIREBENCH', 'FLAMES'];
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
const findEdge = (graph, from, to, type) => graph.edges.find(
  edge => edge.from === from && edge.to === to && edge.type === type,
);

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

test('keeps all four A10p packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('locks ExploitBench editable-source contract, release boundary, asymmetric arms, and headline union', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ExploitBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2605\.14153v1.*eval-v8-v1-beta.*9d0173b/isu);
    assert.match(nodes.get('bugs')?.label ?? '', /41.*V8.*N-day.*2024.*JavaScript.*WebAssembly.*heap sandbox|41.*V8.*N-day.*2024.*JavaScript.*WebAssembly.*heap sandbox/isu);
    assert.match(nodes.get('images')?.label ?? '', /source.*history.*fix.*base image.*apt.*depot_tools.*DEPS.*5.*vulnerable.*4.*fixed|源码.*修复提交.*历史.*基础镜像.*apt.*depot_tools.*DEPS.*5.*漏洞版.*4.*修复版/isu);
    assert.match(nodes.get('task')?.label ?? '', /one-day.*bug ID.*description.*diff.*built-in.*no reference PoC.*editable source.*rebuild.*exec|one-day.*漏洞 ID.*描述.*diff.*内置.*不提供.*PoC.*源码树可编辑.*exec.*重建/isu);
    assert.match(nodes.get('interface')?.label ?? '', /six-tool.*setup.*exec.*list_directory.*read_file.*write_file.*grade.*rlenv\/workspace.*submit.*temp.*ground-truth.*immutable|六工具.*setup.*exec.*list_directory.*read_file.*write_file.*grade.*rlenv\/workspace.*提交.*临时输出.*真值二进制.*不可修改/isu);
    assert.match(nodes.get('arms')?.label ?? '', /nine models.*41.*300 turns|9 个模型.*41.*300 轮/isu);
    assert.match(nodes.get('primary')?.label ?? '', /bare runner.*same prompt.*tool schemas.*no coaching|裸模型 runner.*相同提示.*工具 schema.*无 coaching/isu);
    assert.match(nodes.get('coaching')?.label ?? '', /50.*75%.*voluntary|50.*75%.*自愿/isu);
    assert.match(nodes.get('vendor_cli')?.label ?? '', /GPT-5\.5 only|仅对 GPT-5\.5/isu);
    assert.match(nodes.get('oracles')?.label ?? '', /12.*3 rounds.*2 builds.*2 configs.*all three.*reseed.*monotonic|12.*3 轮.*2 二进制.*2 配置.*3 轮.*重播种.*单调/isu);
    assert.match(nodes.get('ladder')?.label ?? '', /16.*T5.*T4.*T3.*T2.*T1.*pc_control.*prctl.*ACE/isu);
    assert.match(nodes.get('headline')?.label ?? '', /three independent seeds.*best-of-three union.*2,337|3 个独立种子.*三次能力并集.*2,337/isu);
    assert.match(nodes.get('audit')?.label ?? '', /11-check.*manual spot|11 项.*人工抽查/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /v8-v1\.yaml.*9d0173b.*7 models.*5 seeds.*r2 images.*not paper 9 models.*3 seeds.*2,337|v8-v1\.yaml.*9d0173b.*7 个模型.*5 个种子.*r2 镜像.*非论文 9 模型.*3 种子.*2,337/isu);
    for (const arm of ['primary', 'coaching', 'vendor_cli']) {
      assert.ok(edges.has(`arms->${arm}:primary`));
      assert.ok(edges.has(`${arm}->oracles:primary`));
    }
    assert.ok(edges.has('oracles->ladder:primary'));
    assert.ok(edges.has('ladder->headline:primary'));
    assert.ok(edges.has('headline->audit:primary'));
    assert.ok(edges.has('evidence->release_boundary:data'));
    assert.ok(!edges.has('headline->release_boundary:primary'));

    const spec = readSpec('ExploitBench', language);
    const expectedRoutes = [
      ['arms', 'primary', { exitX: 0.25, exitY: 0, entryX: 0, entryY: 0.5 }],
      ['arms', 'coaching', { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 }],
      ['arms', 'vendor_cli', { exitX: 0.75, exitY: 1, entryX: 0, entryY: 0.5 }],
      ['primary', 'oracles', { exitX: 1, exitY: 0.5, entryX: 0.25, entryY: 0 }],
      ['coaching', 'oracles', { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 }],
      ['vendor_cli', 'oracles', { exitX: 1, exitY: 0.5, entryX: 0.75, entryY: 1 }],
    ];
    for (const [from, to, style] of expectedRoutes) {
      const edge = findEdge(spec, from, to, 'primary');
      assert.deepEqual(edge?.style, style, `${language} ${from}->${to} ports`);
      assert.equal(edge?.waypoints, undefined, `${language} ${from}->${to} no shared corridor`);
    }
    const specNodes = new Map(spec.nodes.map(node => [node.id, node]));
    assert.ok(specNodes.get('primary').position.y < specNodes.get('coaching').position.y);
    assert.ok(specNodes.get('coaching').position.y < specNodes.get('vendor_cli').position.y);
  }
});

test('locks FACTS Grounding curation, independent calibration sets, unanimity gate, and final averaging', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FACTS_Grounding', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2501\.03200v1.*11b6961.*1\.0/isu);
    assert.match(nodes.get('documents')?.label ?? '', /medical.*legal.*internet.*technology.*financial.*retail.*2\.5k.*32k|医疗.*法律.*互联网.*技术.*金融.*零售.*2\.5k.*32k/isu);
    assert.match(nodes.get('authoring')?.label ?? '', /third-party.*Q&A.*summarization.*rewriting.*system instruction.*external knowledge|第三方.*问答.*摘要.*文档改写.*系统指令.*外部知识/isu);
    assert.match(nodes.get('quality')?.label ?? '', /every example.*creative.*expert.*math.*logic.*meta-analysis.*OCR|每一个样本.*创意.*专家.*数学.*逻辑.*元分析.*OCR/isu);
    assert.match(nodes.get('splits')?.label ?? '', /balanced random.*860.*859.*1,719|平衡随机.*860.*859.*1,719/isu);
    assert.match(nodes.get('eligibility_setup')?.label ?? '', /N=450.*request only.*request \+ context.*Macro-F1|N=450.*仅请求.*请求 \+ 上下文.*Macro-F1/isu);
    assert.match(nodes.get('eligibility')?.label ?? '', /Gemini 1\.5 Pro.*GPT-4o.*Claude 3\.5 Sonnet.*all three|Gemini 1\.5 Pro.*GPT-4o.*Claude 3\.5 Sonnet.*三者一致/isu);
    assert.match(nodes.get('factuality_setup')?.label ?? '', /N=402.*87:13.*seven.*Macro-F1|N=402.*87:13.*7.*Macro-F1/isu);
    assert.match(nodes.get('factuality')?.label ?? '', /every.*informative claim.*one unsupported claim|每个信息性断言.*一个无依据断言/isu);
    assert.match(nodes.get('combine')?.label ?? '', /ineligible.*inaccurate.*each factuality judge|不合格.*不准确.*每个事实性评委/isu);
    assert.match(nodes.get('score')?.label ?? '', /average.*three judges.*Open.*Blind|平均.*三个评委.*Open.*Blind/isu);
    assert.ok(edges.has('responses->eligibility:primary'));
    assert.ok(edges.has('responses->factuality:primary'));
    assert.ok(edges.has('eligibility_setup->eligibility:data'));
    assert.ok(edges.has('factuality_setup->factuality:data'));
    assert.ok(edges.has('eligibility->combine:primary'));
    assert.ok(edges.has('factuality->combine:primary'));

    const spec = readSpec('FACTS_Grounding', language);
    assert.deepEqual(findEdge(spec, 'responses', 'eligibility', 'primary')?.style, {
      exitX: 1, exitY: 0.25, entryX: 0, entryY: 0.65,
    });
    assert.deepEqual(findEdge(spec, 'eligibility_setup', 'eligibility', 'data')?.style, {
      exitX: 1, exitY: 0.5, entryX: 0.5, entryY: 0,
    });
    assert.deepEqual(findEdge(spec, 'responses', 'factuality', 'primary')?.style, {
      exitX: 1, exitY: 0.75, entryX: 0, entryY: 0.35,
    });
    assert.deepEqual(findEdge(spec, 'factuality_setup', 'factuality', 'data')?.style, {
      exitX: 1, exitY: 0.5, entryX: 0.5, entryY: 1,
    });
  }
});

test('locks FIREBENCH parallel pools, paper arithmetic, category graders, and public-harness boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FIREBENCH', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2603\.04857v1.*dad399d/isu);
    assert.match(nodes.get('format')?.label ?? '', /1,300.*25.*(?:four|4) sources.*21.*1,000.*MHPP.*100.*JSON.*XML.*Markdown.*300|1,300.*4 个来源.*25.*21.*1,000.*MHPP.*100.*JSON.*XML.*Markdown.*300/isu);
    assert.match(nodes.get('ordered')?.label ?? '', /200.*dual-role.*10–15.*~70.*one question.*5–10|200.*双角色.*70.*10–15.*每轮一问.*5–10/isu);
    assert.match(nodes.get('ranking')?.label ?? '', /200.*20.*ascending.*descending.*top-N.*verbatim|200.*20.*升序.*降序.*原样.*Top-N/isu);
    assert.match(nodes.get('confidence')?.label ?? '', /370.*300.*GPQA.*HLE.*SimpleQA.*normal.*uncertainty.*~70|370.*300.*GPQA.*HLE.*SimpleQA.*标准.*不确定性.*70/isu);
    assert.match(nodes.get('positive')?.label ?? '', /200.*Arena Hard Auto 2\.0.*GPT-5.*mandatory.*rubrics|200.*Arena Hard Auto 2\.0.*GPT-5.*必须.*准则/isu);
    assert.match(nodes.get('negative')?.label ?? '', /200.*same Arena Hard Auto 2\.0.*GPT-5.*prohibited.*rubrics|200.*同一批 Arena Hard Auto 2\.0.*GPT-5.*禁止.*准则/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /2,470.*1,300.*200.*200.*370.*200.*200.*independent|2,470.*1,300.*200.*200.*370.*200.*200.*独立/isu);
    assert.match(nodes.get('deterministic')?.label ?? '', /programmatic.*format.*ordered.*ranking|程序化.*格式.*顺序.*排序/isu);
    assert.match(nodes.get('abstention')?.label ?? '', /correct.*do not decline.*wrong.*decline.*insufficient.*refusal|答对.*不拒答.*答错.*拒答.*信息不足.*拒答/isu);
    assert.match(nodes.get('judge')?.label ?? '', /GPT-4\.1.*GPT-5.*every required.*every forbidden|GPT-4\.1.*GPT-5.*全部必需.*全部禁止/isu);
    assert.match(nodes.get('score')?.label ?? '', /six categories.*unweighted mean.*11|六类.*无权平均.*11/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /dad399d.*12\/source.*48.*21.*1,008.*seven test-set.*tested model.*judge_model|dad399d.*每来源 12.*48.*21.*1,008.*7 个测试集.*被测模型.*judge_model/isu);
    assert.equal(nodes.get('confidence')?.label.split(/\r?\n/u).length, 4, `${language} confidence cylinder`);
    for (const pool of ['format', 'ordered', 'ranking', 'confidence', 'positive', 'negative']) {
      assert.ok(edges.has(`capabilities->${pool}:primary`));
      assert.ok(edges.has(`${pool}->benchmark:primary`));
    }
    for (const grader of ['deterministic', 'abstention', 'judge']) {
      assert.ok(edges.has(`grading->${grader}:primary`));
      assert.ok(edges.has(`${grader}->score:primary`));
    }
    assert.ok(edges.has('score->release_boundary:data'));

    const specNodes = new Map(readSpec('FIREBENCH', language).nodes.map(node => [node.id, node]));
    assert.equal(specNodes.get('evidence')?.position.y, specNodes.get('capabilities')?.position.y);
    assert.ok(specNodes.get('evidence')?.position.x < specNodes.get('capabilities')?.position.x);
    assert.ok(specNodes.get('capabilities')?.position.x < specNodes.get('format')?.position.x);
  }
});

test('locks FLAMES filtering, dual-plus-expert labels, random public sample, metrics, and parallel scorer track', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FLAMES', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2311\.06899v6.*234bcb7.*CaasiHUANG\/flames-scorer.*cdb1528/isu);
    assert.match(nodes.get('framework')?.label ?? '', /fairness 590.*safety 779.*morality 522.*legality 118.*data protection 242.*Chinese values|公平 590.*安全 779.*道德 522.*合法 118.*数据保护 242.*中国价值观/isu);
    assert.match(nodes.get('authoring')?.label ?? '', /concrete scenario.*disguise.*reverse induction.*unsafe inquiry|具体场景.*伪装.*反向诱导.*不安全询问/isu);
    assert.match(nodes.get('filtering')?.label ?? '', /two review.*target value.*explicit scenario.*attack method.*at least one.*modify or discard|两轮审核.*目标价值.*明确场景.*攻击方法.*至少.*一个.*修改或丢弃/isu);
    assert.match(nodes.get('prompt_set')?.label ?? '', /2,251.*85\.92.*53\.09%/isu);
    assert.match(nodes.get('responses')?.label ?? '', /17.*scoring rules.*harmful purpose.*scorer training|17.*评分规则.*有害目的.*评分器训练/isu);
    assert.match(nodes.get('annotation')?.label ?? '', /two graduate.*3 \/ 2 \/ 1.*3 \/ 1.*expert.*disagreement|两名研究生.*3 \/ 2 \/ 1.*3 \/ 1.*专家.*分歧/isu);
    assert.match(nodes.get('corpus')?.label ?? '', /22\.9K.*prompt-response-label|22\.9K.*提示-回答-标签/isu);
    assert.match(nodes.get('release')?.label ?? '', /prompt-only.*1,000.*random.*249.*429.*201.*46.*75.*rest held|纯提示.*1,000.*随机.*249.*429.*201.*46.*75.*其余/isu);
    assert.match(nodes.get('human_metrics')?.label ?? '', /harmless rate.*labeled 3.*mean label.*3.*100.*macro-average.*five|无害率.*标签 3.*平均标签.*3.*100.*五个维度.*宏平均|无害率.*标签 3.*无害分.*五个维度.*等权宏平均/isu);
    assert.match(nodes.get('scorer_split')?.label ?? '', /Input prompt.*Output response.*MOSS.*GPT-4.*InternLM-Chat-7B.*20B|输入提示.*输出回答.*MOSS.*GPT-4.*InternLM-Chat-7B.*20B/isu);
    assert.match(nodes.get('scorer')?.label ?? '', /separate classifier.*multitask.*RoBERTa-Large.*InternLM-Chat-7B.*79\.5%|每维独立分类.*多任务.*RoBERTa-Large.*InternLM-Chat-7B.*79\.5%/isu);
    assert.match(nodes.get('report')?.label ?? '', /human harmless rate.*paper results.*Flames-1k-Chinese.*OOD.*undisclosed|论文结果.*人工无害率.*Flames-1k-Chinese.*OOD.*未验证/isu);
    assert.ok(edges.has('prompt_set->release:primary'));
    assert.ok(edges.has('corpus->human_metrics:primary'));
    assert.ok(edges.has('corpus->scorer_split:primary'));
    assert.ok(edges.has('scorer_split->scorer:primary'));
    assert.ok(edges.has('release->report:data'));
    assert.ok(!edges.has('corpus->release:primary'));
    assert.ok(!edges.has('release->human_metrics:primary'));
    assert.ok(!edges.has('release->scorer_split:primary'));
  }
});

test('pins paper and official artifact revisions plus disclosed protocol boundaries in A10p details', () => {
  const exploit = readDetail('ExploitBench');
  assert.match(exploit.paper_url, /2605\.14153v1/u);
  assert.match(exploit.drawio_review_note, /eval-v8-v1-beta.*9d0173b.*five vulnerable.*four fixed.*source tree.*editable.*rebuilt through exec.*rlenv\/workspace.*submissions.*temporary output.*ground-truth binaries.*cannot be modified.*six MCP.*GPT-5\.5-only.*12 d8.*2,337.*seven models.*five seeds.*not claimed/isu);

  const facts = readDetail('FACTS_Grounding');
  assert.match(facts.paper_url, /2501\.03200v1/u);
  assert.match(facts.drawio_review_note, /11b6961370aa0ac73c91d58e35317e724b2ac765.*860.*859.*N=450.*N=402.*87:13.*one unsupported claim/isu);

  const fire = readDetail('FIREBENCH');
  assert.match(fire.paper_url, /2603\.04857v1/u);
  assert.match(fire.drawio_review_note, /dad399d938385ab798952b76f2690522d6cd59c6.*2,470.*100 times 21 is 2,100.*12 examples each.*1,008.*seven test-set.*tested model instead of judge_model/isu);

  const flames = readDetail('FLAMES');
  assert.match(flames.paper_url, /2311\.06899v6/u);
  assert.match(flames.drawio_review_note, /234bcb7a4a9da44c4177d2c2005e3bf8a582a5fc.*CaasiHUANG\/flames-scorer.*cdb15280415b335bc8ee1b03bd461dd03bcc10b1.*https:\/\/huggingface\.co\/CaasiHUANG\/flames-scorer\/tree\/cdb15280415b335bc8ee1b03bd461dd03bcc10b1.*prompt-only.*1,000.*Human metrics.*annotated response corpus.*79\.5%.*outside FLAMES prompts/isu);
});

test('keeps every A10p fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light assets with bounded xl label geometry for A10p', () => {
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
      const arch = readArch(id, language);
      const fixedXlGeometries = drawio.match(/<mxGeometry[^>]*width="200" height="100"[^>]*\/>/gu) ?? [];
      assert.equal(fixedXlGeometries.length, arch.nodes.length, `${id}.${language} fixed xl geometry`);
      for (const node of arch.nodes) {
        assert.equal(node.size, 'xl', `${id}.${language}.${node.id} size`);
        const lines = node.label.split(/\r?\n/u);
        assert.ok(lines.length <= 6, `${id}.${language}.${node.id} line count`);
        if (node.type === 'database') {
          assert.ok(lines.length <= 5, `${id}.${language}.${node.id} database line count`);
        }
        for (const line of lines) {
          if (language === 'en') {
            assert.ok([...line].length <= 38, `${id}.${language}.${node.id} line length: ${line}`);
          }
          assert.ok(visibleText.includes(line), `${id}.${language} SVG label: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces A10p SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10p-exports-'));
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

test('strictly rebuilds and normalizes all eight A10p specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10p-'));
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
