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
const benchmarkIds = ['CloningScenarios', 'ClothoAQA', 'CodeElo', 'CodeForces'];
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

test('keeps all four A10f packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps CloningScenarios construction, release boundary, and paper evaluation exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CloningScenarios', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2407\.10362v3.*998a8e0.*5c77cec/isu);
    assert.match(nodes.get('scenario_design')?.label ?? '', /workflow.*plasmid.*fragment.*enzyme|流程.*质粒.*片段.*酶/isu);
    assert.match(nodes.get('question_design')?.label ?? '', /41.*human-hard.*independently answerable|41.*人类高难.*独立作答/isu);
    assert.match(nodes.get('quality')?.label ?? '', /plausible distractor.*insufficient[- ]information|可信干扰项.*信息不足/isu);
    assert.match(nodes.get('release')?.label ?? '', /33 public.*8 private.*canary|33.*公开.*8.*私有.*金丝雀/isu);
    assert.match(nodes.get('model_protocol')?.label ?? '', /zero-shot CoT.*no tools.*(?:3|three).*runs|零样本 CoT.*禁用工具.*3 次/isu);
    assert.match(nodes.get('answer_parse')?.label ?? '', /\[ANSWER\].*letter.*regex.*unsure|\[ANSWER\].*字母.*正则.*不确定/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /accuracy.*correct.*41.*precision.*attempted.*coverage|准确率.*正确.*41.*精确率.*作答.*覆盖率/isu);
    assert.match(nodes.get('human')?.label ?? '', /PhD.*tools allowed.*no AI.*41|博士.*可用工具.*禁用 AI.*41/isu);
    assert.match(nodes.get('open_answer')?.label ?? '', /10 modified.*Claude 3\.5.*GPT-4o.*2\/10|10.*改写.*Claude 3\.5.*GPT-4o.*2\/10/isu);
    assert.ok(edges.has('quality->release:primary'));
    assert.ok(edges.has('release->model_protocol:primary'));
    assert.ok(edges.has('release->human:data'));
    assert.ok(edges.has('release->open_answer:data'));
  }
});

test('keeps ClothoAQA two-stage annotation, split search, and task-specific baselines exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ClothoAQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2204\.09634v2.*Zenodo 6473207/isu);
    assert.match(nodes.get('audio')?.label ?? '', /1,?991.*15.*30/isu);
    assert.match(nodes.get('question_workers')?.label ?? '', /3,?000.*95%.*English.*qualification|3,?000.*95%.*英语.*资格/isu);
    assert.match(nodes.get('set_a')?.label ?? '', /one yes.*one no.*one other|一是.*一否.*一其他/isu);
    assert.match(nodes.get('set_b')?.label ?? '', /distinct.*one yes.*one no.*one other|不重复.*一是.*一否.*一其他/isu);
    assert.match(nodes.get('screen')?.label ?? '', /type.*speech.*answer leak.*direct address|类型.*语音.*答案泄露.*直接称呼/isu);
    assert.match(nodes.get('answers')?.label ?? '', /separate.*workers.*(?:3|three) answers.*yes.*no.*maybe|独立.*工人.*3 个答案.*是.*否.*不确定/isu);
    assert.match(nodes.get('rare_answers')?.label ?? '', /typo.*semantic.*1,?889.*830|拼写.*语义.*1,?889.*830/isu);
    assert.match(nodes.get('split_search')?.label ?? '', /2,?000.*60\/40.*top 50.*20\/20|2,?000.*60\/40.*前 50.*20\/20/isu);
    assert.match(nodes.get('release')?.label ?? '', /train.*val.*test.*1,?174.*344.*473.*11,?946.*35,?838|训练.*验证.*测试.*1,?174.*344.*473.*11,?946.*35,?838/isu);
    assert.match(nodes.get('binary')?.label ?? '', /yes.*no.*12.*per audio|是.*否.*每段.*12|每段.*12.*是.*否/isu);
    assert.match(nodes.get('binary_variants')?.label ?? '', /unfiltered.*unanimous.*majority|未过滤.*全体一致.*多数/isu);
    assert.match(nodes.get('multiclass')?.label ?? '', /6.*per audio.*828.*class|每段.*6.*828 类/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /binary accuracy.*top-1.*top-5.*top-10|二分类准确率.*Top-1.*Top-5.*Top-10/isu);
    assert.ok(edges.has('binary->binary_variants:primary'));
    assert.equal(edges.has('multiclass->binary_variants:primary'), false);
    assert.ok(edges.has('multiclass->modalities:primary'));
  }
});

test('separates CodeElo paper evaluation from the larger pinned public release', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CodeElo', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2501\.01257v2.*0bffc84.*45a2cbb/isu);
    assert.match(nodes.get('paper_set')?.label ?? '', /exclude Div\. 1.*54.*387.*original HTML|排除 Div\. 1.*54.*387.*原始 HTML/isu);
    assert.match(nodes.get('hf_release')?.label ?? '', /57.*408.*21 Div\. 1.*Markdown|57.*408.*21.*Div\. 1.*Markdown/isu);
    assert.ok(edges.has('collection->paper_set:primary'));
    assert.ok(edges.has('collection->hf_release:data'));
    assert.equal(edges.has('hf_release->paper_prompt:primary'), false);
    assert.match(nodes.get('paper_prompt')?.label ?? '', /CoT.*C\+\+.*tags hidden|CoT.*C\+\+.*隐藏标签/isu);
    assert.match(nodes.get('open_source')?.label ?? '', /temperature 0\.7.*top_p 0\.8.*top_k 20.*repetition penalty 1\.1.*4,?096|温度 0\.7.*top_p 0\.8.*top_k 20.*重复惩罚 1\.1.*4,?096/isu);
    assert.match(nodes.get('proprietary')?.label ?? '', /API defaults|API 默认/isu);
    assert.match(nodes.get('runner_parse')?.label ?? '', /first fenced code block.*0bffc84|首个围栏代码块.*0bffc84/isu);
    assert.match(
      nodes.get('attempt_execution')?.label ?? '',
      /up to 8 attempts.*generate.*submit all parsed candidates.*no early stop.*AC|最多 8 次.*生成并提交全部可解析候选.*AC.*不提前停止/isu,
    );
    assert.ok(edges.has('runner_parse->attempt_execution:primary'));
    assert.ok(edges.has('attempt_execution->official_judge:primary'));
    assert.equal(edges.has('runner_parse->official_judge:primary'), false);
    assert.match(nodes.get('official_judge')?.label ?? '', /hidden tests.*special.*interactive.*time.*memory|隐藏测试.*特殊.*交互.*时间.*内存/isu);
    assert.match(nodes.get('contest_score')?.label ?? '', /failed attempts.*penalty.*no submission-time penalty|失败尝试.*罚分.*(?:无|不计)提交时间罚时/isu);
    assert.match(nodes.get('contest_score')?.label ?? '', /score at first acceptance|首次通过时计分/isu);
    assert.doesNotMatch(
      [...nodes.values()].map(node => node.label).join('\n'),
      /runner stops? at (?:the )?first AC|stop at first acceptance|首个 AC 后停止|首次通过后停止/isu,
    );
    assert.match(nodes.get('elo')?.label ?? '', /human ranks.*binary-search.*average 54|人类排名.*二分搜索.*平均 54/isu);
    assert.match(nodes.get('report')?.label ?? '', /Elo.*(?:percentile|百分位).*Pass@1.*2.*4.*8/isu);
  }
});

test('keeps CodeForces evidence-bounded and requires report-defined protocol choices', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CodeForces', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /no standalone paper.*no fixed dataset.*official API.*20762|无独立论文.*无固定数据集.*官方 API.*20762/isu);
    assert.match(nodes.get('objects')?.label ?? '', /Problem.*Contest.*Submission.*RanklistRow|Problem.*Contest.*Submission.*RanklistRow/isu);
    assert.match(nodes.get('identity')?.label ?? '', /not one fixed benchmark|不是固定基准/isu);
    assert.match(nodes.get('selection')?.label ?? '', /window.*subset.*contamination.*eligibility|时间窗.*子集.*污染.*资格/isu);
    assert.match(nodes.get('protocol')?.label ?? '', /prompt.*language.*attempt.*tools|提示.*语言.*尝试.*工具/isu);
    assert.ok(edges.has('judge_route->online:primary'));
    assert.ok(edges.has('judge_route->offline:primary'));
    assert.match(nodes.get('online')?.label ?? '', /official.*submissions.*hidden tests.*platform limits|官方.*提交.*隐藏测试.*平台限制/isu);
    assert.match(nodes.get('offline')?.label ?? '', /report-owned tests.*sandbox.*not canonical|报告自有测试.*沙箱.*非标准/isu);
    assert.match(nodes.get('outcome')?.label ?? '', /verdict.*testset.*passedTestCount.*time.*memory|判定.*testset.*passedTestCount.*时间.*内存/isu);
    assert.match(nodes.get('fixed_metric')?.label ?? '', /accuracy.*Pass@k.*only if defined|准确率.*Pass@k.*仅在.*定义后/isu);
    assert.match(nodes.get('contest_metric')?.label ?? '', /points.*penalty.*rank.*rating.*only if defined|得分.*罚时.*排名.*等级分.*仅在.*定义后/isu);
    assert.match(nodes.get('report')?.label ?? '', /same frozen protocol|相同冻结协议/isu);
  }
});

test('pins paper, repository, and release evidence in A10f details', () => {
  const cloning = readDetail('CloningScenarios');
  assert.match(cloning.paper_url, /2407\.10362v3/u);
  assert.match(cloning.drawio_review_note, /§§2\.1.*2\.4.*§§3\.1.*3\.4.*998a8e0.*5c77cec.*33.*8/isu);

  const clotho = readDetail('ClothoAQA');
  assert.match(clotho.paper_url, /2204\.09634v2/u);
  assert.match(clotho.drawio_review_note, /§§II-A.*II-B.*III.*Zenodo.*6473207.*41b8f6d.*508513b.*6fd0e75/isu);
  assert.match(clotho.drawio_review_note, /binary.*unfiltered.*unanimous.*majority.*multi-class.*top-10/isu);

  const codeElo = readDetail('CodeElo');
  assert.match(codeElo.paper_url, /2501\.01257v2/u);
  assert.match(codeElo.drawio_review_note, /§§3\.1.*3\.3.*§4\.1.*0bffc84.*45a2cbb/isu);
  assert.match(codeElo.drawio_review_note, /387.*54.*408.*57.*21 Div\. 1.*Markdown/isu);
  assert.match(
    codeElo.drawio_review_note,
    /repetition penalty 1\.1.*up to eight parseable attempts.*does not stop early.*first accepted attempt/isu,
  );

  const codeForces = readDetail('CodeForces');
  assert.equal(codeForces.paper_url, '');
  assert.match(codeForces.drawio_review_note, /official Codeforces API.*blog\/entry\/20762.*no standalone paper.*no fixed dataset/isu);
});

test('keeps every A10f fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10f', () => {
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

test('reproduces A10f SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10f-exports-'));
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
        assertSvgFidelity(
          generatedSvg,
          `${base}.svg`,
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

test('strictly rebuilds and normalizes all eight A10f specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10f-'));
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
