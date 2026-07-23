import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'MATH500',
  'MATHQA',
  'MCP-Atlas',
  'MCP-Universe',
  'MCPMark',
  'MEDIQA-QA',
];
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

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function edgeSet(arch) {
  return new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
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
    .replace(/\\\((.*?)\\\)/gu, '$1')
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

test('keeps all six A11k packages bilingual with the academic profile and reviewed evidence boundary nodes', () => {
  const requiredNodes = new Map([
    ['MATH500', ['b1', 'r3', 'r5', 'e1', 'e2', 'm2']],
    ['MATHQA', ['c1', 'c10', 'c12', 'r2', 'r5', 'r6', 'e5', 'm2']],
    ['MCP-Atlas', ['evidence', 'qa', 'public_release', 'release_gap', 'primary_judge', 'live_boundary']],
    ['MCP-Universe', ['b1', 'b4', 'b6', 'r3', 'e2', 'd1', 'e6', 's4', 's5']],
    ['MCPMark', ['c1', 'q1', 'r3', 'r4', 'e7', 'm4']],
    ['MEDIQA-QA', ['b1', 'b5', 'r3', 'r4', 'm2', 'g1']],
  ]);
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      for (const nodeId of requiredNodes.get(id) || []) {
        assert.ok(spec.nodes.some(node => node.id === nodeId), `${id}.${language} ${nodeId}`);
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length > 500, `${id} review evidence`);
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 52], ['zh', 44]]) {
      for (const node of readSpec(id, language).nodes) {
        const nodeLimit = node.type === 'formula' ? 90 : maxLineLength;
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= nodeLimit, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks MATH500 parent split, pinned release audit, conservative grader, and fixed-sample Best-of-N evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MATH500', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /12,?500.*7,?500.*5,?000/isu);
    assert.match(text, /(?:7 Subjects.*Difficulty 1–5|7 个学科.*难度 1–5)/isu);
    assert.match(text, /4,?500.*(?:Original Test|原测试).*(?:PRM800K|奖励模型)/isu);
    assert.match(text, /(?:Random|随机).*500.*(?:Hold Out|留作评测)/isu);
    assert.match(text, /7ecc7947.*35dc4108/isu);
    assert.match(text, /12,?000.*500.*(?:No Train.*Test ID Overlap|训练.*测试 ID 无重叠)/isu);
    assert.match(text, /12,?000.*11,?999.*(?:One ID|一个 ID).*(?:Two|两).*answer/isu);
    assert.match(text, /grade_answer\(given_answer, ground_truth\)/u);
    assert.match(text, /(?:Both Inputs Must Already Be Strings|两个输入必须已是字符串)/isu);
    assert.match(text, /(?:Hendrycks-normalize|Hendrycks 归一化).*PRM/isu);
    assert.match(text, /(?:SymPy|SymPy).*(?:Reference|参考).*−.*(?:Candidate|候选)/isu);
    assert.match(text, /1,?860.*1,?024.*2\.159 GB/isu);
    assert.match(text, /400.*(?:Trials|试验).*(?:Unseeded|未设随机种子)/isu);
    assert.match(text, /PRM.*78\.2.*ORM.*72\.4/isu);
    assert.match(text, /(?:Majority|多数投票).*69\.6.*eval\.py/isu);
    for (const edge of [
      'b1->b2:primary',
      'b2->b3:primary',
      'b3->b4:primary',
      'b4->b5:primary',
      'b5->r1:primary',
      'r1->r2:primary',
      'r2->r3:primary',
      'r3->r4:primary',
      'r4->r5:optional',
      'r5->e1:primary',
      'e1->g1:primary',
      'g1->g2:primary',
      'g2->g3:primary',
      'g3->g4:primary',
      'g4->e2:data',
      'e2->e3:primary',
      'e3->e4:primary',
      'e4->e5:primary',
      'e5->m1:primary',
      'm1->m2:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MATHQA paper inventory, pinned-release drift, public-gold boundary, and answer-accuracy evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MATHQA', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /(?:100K\+|超过 10 万).*GRE.*GMAT/isu);
    assert.match(text, /(?:High-order Polynomials|高阶多项式).*(?:Nonnumeric|非数值)/isu);
    assert.match(text, /58.*(?:Operations|运算).*(?:Geometry|几何).*(?:Physics|物理).*(?:Probability|概率)/isu);
    assert.match(text, /(?:Undisclosed Accuracy Threshold|未公开的准确率阈值)/isu);
    assert.match(text, /(?:2 of 3 Votes|至少两票通过).*94\.64%/isu);
    assert.match(text, /(?:Levenshtein).*(?:Four Words|四个词)/isu);
    assert.match(text, /37,?259.*5\.3.*58.*80\s*\/\s*12\s*\/\s*8/isu);
    assert.match(text, /500.*92%.*87%.*(?:Filtering Use Not Reported|未说明是否用于发布筛选)/isu);
    assert.match(text, /(?:Rationale-derived Programs Excluded|基于解题说明自动生成的程序被排除).*61%/isu);
    assert.match(text, /4f958013.*29,?837.*4,?475.*2,?985.*37,?297.*604/isu);
    assert.match(text, /37,?259.*37,?297.*58.*78.*53/isu);
    assert.match(text, /c4f1cc7.*(?:URL Is Not Version-pinned|URL 未固定版本)/isu);
    assert.match(text, /(?:All Test Gold Public|不存在隐藏的官方测试标签)/isu);
    assert.match(text, /(?:Static Board|仓库静态榜单).*(?:No Submission UI|无提交界面)/isu);
    assert.match(text, /OpenNMT.*(?:Two-layer LSTM|两层 LSTM).*100.*0\.001/isu);
    assert.match(text, /(?:Beam|束).*100/isu);
    assert.match(text, /(?:Unspecified Threshold|未公开阈值).*(?:Minimum Distance|最小距离)/isu);
    assert.match(text, /51\.9%.*54\.2%/isu);
    for (const edge of [
      'c1->c2:primary',
      'c4->c5:primary',
      'c6->c7:primary',
      'c7->c8:primary',
      'c8->c9:primary',
      'c9->c10:primary',
      'c10->c11:optional',
      'c11->c12:optional',
      'c10->r1:primary',
      'r1->r2:primary',
      'r2->r3:primary',
      'r2->r4:optional',
      'r3->r5:optional',
      'r3->r6:primary',
      'r6->e1:primary',
      'e1->e2:primary',
      'e2->e3:primary',
      'e3->e4:primary',
      'e4->e5:primary',
      'e5->m1:primary',
      'm1->m2:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MCP-Atlas v3 construction, public-release boundary, answer-only claim judge, and layered retry drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MCP-Atlas', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /2602\.00933v3.*b6edd44.*b5bcde2/isu);
    assert.match(text, /36.*(?:Servers|服务器).*220.*(?:Tools|工具)/isu);
    assert.match(text, /1,?000.*4\.6.*(?:Expert-hours|专家工时)/isu);
    assert.match(text, /6–37.*15\.2.*2–8.*4\.1.*11\.1/isu);
    assert.match(text, /4\.7.*1–23.*(?:Tool Outputs|工具输出)/isu);
    assert.match(text, /(?:Five QA Layers|五层质量检查).*1.*2.*3.*4.*5/isu);
    assert.match(text, /(?:Public|公开).*500.*(?:Private|私有).*500/isu);
    assert.match(text, /b5bcde2.*500.*Parquet/isu);
    assert.match(text, /b6edd44.*1\.2\.7.*sha256:24e6ed/isu);
    assert.match(text, /run_eval.*(?:Passes Tag|传标签).*run_all.*(?:Local latest|本地 latest).*(?:Does Not Validate Digest|不校验镜像摘要)/isu);
    assert.match(text, /(?:3 Attempts.*2 Retries|3 次尝试.*2 次).*(?:LiteLLM).*5/isu);
    assert.match(text, /Gemini 3\.1 Pro Preview.*(?:Claim \+ Final Answer Only|仅输入声明与最终答案)/isu);
    assert.match(text, /(?:Coverage|覆盖率).*0\.75/isu);
    for (const edge of [
      'evidence->ecosystem:primary',
      'qa->split:primary',
      'split->public_release:data',
      'evidence->repo_release:data',
      'repo_release->release_gap:data',
      'split->eval_input:primary',
      'agent_loop->primary_judge:primary',
      'primary_judge->coverage:primary',
      'primary_judge->judge_sensitivity:data',
      'coverage->diagnostics:data',
      'paper_report->live_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MCP-Universe paper and stable pins, audited task surface, ReAct/YAML drift, cleanup, and SR/AE/AS', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MCP-Universe', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.equal(arch.nodes.find(node => node.id === 'b4')?.type, 'process');
    assert.equal(arch.nodes.find(node => node.id === 's4')?.type, 'formula');
    assert.match(text, /2508\.14704v1.*7a804f8/isu);
    assert.match(text, /v1\.1\.3.*63fb05c/isu);
    assert.match(text, /45.*33.*40.*19.*39.*55.*231.*232.*(?:Extra Unreferenced|额外未引用)/isu);
    assert.match(text, /767.*1–16.*169.*62/isu);
    assert.match(text, /231.*385.*(?:Zero Entries Specify Individual Tools|0 条指定单个工具)/isu);
    assert.match(text, /(?:All Listed LLMs Use ReAct|所列 LLM 均使用 ReAct).*GPT-OSS.*Agent SDK.*1\.0.*(?:No AS|不报告 AS)/isu);
    assert.match(text, /7a804f8.*(?:Explore-and-Exploit|探索并利用).*v1\.1\.3.*(?:Function Call|原生函数调用).*Harmony ReAct/isu);
    assert.match(text, /(?:Run Configured Cleanups in Reverse|逆序执行已配置清理)/isu);
    assert.match(text, /SR\s*=.*AE\s*=.*AS\s*=/isu);
    for (const edge of [
      'b1->b2:primary',
      'b5->b6:primary',
      'b6->r1:primary',
      'r1->r2:primary',
      'r2->r3:primary',
      'r5->r6:primary',
      'e1->e2:primary',
      'e2->e3:primary',
      'e3->d1:secondary',
      'e3->e4:primary',
      'e5->e6:primary',
      'e6->s1:primary',
      's4->s5:primary',
      's5->s6:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
  assert.match(readDetail('MCP-Universe').drawio_review_note, /exceptions are logged and execution continues.*best-effort/isu);
});

test('locks MCPMark v1 inventory, reconstruction and Verified pins, run cardinality, pass metrics, and cross-model usage', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MCPMark', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /127.*38.*(?:Initial States|初始状态)/isu);
    assert.match(text, /(?:FS|Filesystem).*30.*Notion.*28.*Playwright.*25.*GitHub.*23.*PostgreSQL.*21/isu);
    assert.match(text, /2509\.24002v1.*(?:One Revision|仅一个版本)/isu);
    assert.match(text, /bc5f838.*(?:Not Claimed Exact|不宣称完全对应)/isu);
    assert.match(text, /84faaca.*127.*50.*46.*55/isu);
    assert.match(text, /(?:Default: Four Independent Runs per Task|默认每题四次独立运行).*(?:Single-run Models: One Run|单跑模型每题一次)/isu);
    assert.match(text, /127\s*×\s*4.*127\s*×\s*1/isu);
    assert.match(text, /pass@1.*pass@4.*pass⁴.*(?:Undefined for Single-run|单跑模型不计算)/isu);
    assert.match(text, /52\.56.*1\.29.*68\.50.*33\.86.*16\.2.*17\.4/isu);
    for (const edge of [
      'c1->c2:primary',
      'c2->c3:primary',
      'c5->c6:primary',
      'c7->q1:primary',
      'q1->r1:primary',
      'r1->r2:primary',
      'r2->r3:secondary',
      'r3->r4:secondary',
      'r2->e1:primary',
      'e4->e5:primary',
      'e6->e7:primary',
      'e7->m1:primary',
      'm1->m2:primary',
      'm3->m4:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks MEDIQA-QA W19-5039 splits, hidden-to-public labels, README/code ranking drift, non-NaN Spearman, and reproduction gap', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MEDIQA-QA', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /LiveQA.*104.*Alexa.*104.*(?:Validation|验证).*25.*(?:Test|测试).*150/isu);
    assert.match(text, /839.*862.*234.*1,?107/isu);
    assert.match(text, /3\s*\/\s*4.*(?:Label|标签)\s*1.*1\s*\/\s*2.*(?:Label|标签)\s*0/isu);
    assert.match(text, /cefa5a1.*32311a1/isu);
    assert.match(text, /(?:2019 Test Input|2019 测试输入).*1,?107.*(?:No Rank \/ Score Attributes|不含排序 \/ 分数属性)/isu);
    assert.match(text, /(?:Current Labeled Test|当前带标签测试集).*572.*535/isu);
    assert.match(text, /README.*(?:Label-0|标签 0).*(?:Code Counts Every Row|代码仍将每一行计入名次)/isu);
    assert.match(text, /MRR.*(?:First Correct-positive Row|首个正确正例所在行).*(?:Prior Label-0|前置标签 0).*(?:False-positive|假正例)/isu);
    assert.match(text, /Spearman.*(?:Excludes NaN|排除 NaN)/isu);
    assert.match(text, /header=None/isu);
    assert.match(text, /(?:Test Gold Has Header|测试标准有表头).*(?:Demo Paths Are Absent|示例路径不存在)/isu);
    for (const edge of [
      'b1->b2:primary',
      'b2->b3:primary',
      'b3->b4:primary',
      'b4->b5:primary',
      'b5->r1:primary',
      'r1->r2:primary',
      'r2->r3:primary',
      'r3->r4:primary',
      'r4->r5:primary',
      'r5->e1:primary',
      'e1->e2:primary',
      'e2->e3:primary',
      'e3->e4:primary',
      'e4->m1:primary',
      'e4->m2:primary',
      'm1->e5:primary',
      'm2->e5:primary',
      'e5->g1:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact primary-source and official-artifact revisions for stable A11k records', () => {
  const math500 = readDetail('MATH500');
  assert.match(math500.paper_url, /2305\.20050v1/u);
  assert.match(math500.homepage, /7ecc794703b2877f63226f2477a49b34f9b25163/u);
  assert.equal(math500.openness, 'public');
  assert.equal(math500.has_leaderboard, false);
  assert.match(math500.drawio_review_note, /2103\.03874v2/isu);
  assert.match(math500.drawio_review_note, /35dc41080a3680858b27fa7e0533d2d547825316fc5dafe5d316f4ccc5a06132/isu);

  const mathqa = readDetail('MATHQA');
  assert.match(mathqa.paper_url, /aclanthology\.org\/N19-1245/u);
  assert.equal(mathqa.openness, 'public');
  assert.equal(mathqa.has_leaderboard, true);
  assert.match(mathqa.drawio_review_note, /4f958013c164a40745a5b771dfb005df308deb4a/isu);
  assert.match(mathqa.drawio_review_note, /c4f1cc784c04c4957b50c97858f23893b633eea6/isu);
  assert.match(mathqa.drawio_review_note, /unversioned project URL/isu);

  const atlas = readDetail('MCP-Atlas');
  assert.match(atlas.paper_url, /2602\.00933v3/u);
  assert.match(atlas.homepage, /b6edd44b69892894ffa282f356e2dba41b41e298/u);
  assert.equal(atlas.openness, 'partly public');
  assert.equal(atlas.has_leaderboard, true);
  assert.match(atlas.drawio_review_note, /b5bcde2236c0b8772020e13dea4e481241e78677/isu);
  assert.match(atlas.drawio_review_note, /24e6ed3534916afe2c6825382da159a30e23516ef612be5d074fd96a74f9184c/isu);
  assert.match(atlas.drawio_review_note, /evidentiary registry snapshot, not a runner-enforced pin/isu);

  const universe = readDetail('MCP-Universe');
  assert.match(universe.paper_url, /2508\.14704v1/u);
  assert.equal(universe.openness, 'public');
  assert.equal(universe.has_leaderboard, true);
  assert.match(universe.drawio_review_note, /7a804f820b844859d771b44a6d1ff7d9ff7bd884/isu);
  assert.match(universe.drawio_review_note, /63fb05cee17538eb2ca7ac886a8fe74b5f9e0b4b/isu);
  assert.match(universe.drawio_review_note, /231 unique task JSONs.*232 JSONs.*385 mcp_servers entries/isu);

  const mcpmark = readDetail('MCPMark');
  assert.match(mcpmark.paper_url, /2509\.24002v1/u);
  assert.equal(mcpmark.openness, 'public');
  assert.equal(mcpmark.has_leaderboard, true);
  assert.match(mcpmark.drawio_review_note, /bc5f8382081eb88d95bb28ffcad9536d681d0426/isu);
  assert.match(mcpmark.drawio_review_note, /84faaca88f418032c038f0f2e4ce1ed17b2f72b5/isu);
  assert.match(mcpmark.drawio_review_note, /nearest preprint-era reconstruction pin, not an asserted exact paper snapshot/isu);

  const mediqa = readDetail('MEDIQA-QA');
  assert.match(mediqa.paper_url, /W19-5039/u);
  assert.match(mediqa.homepage, /cefa5a1b89e8263aeea0dbe59da52990963cdd1d/u);
  assert.equal(mediqa.openness, 'public');
  assert.equal(mediqa.has_leaderboard, true);
  assert.match(mediqa.drawio_review_note, /342b4860892eedcd0494365e897b4e76e8ea5377eee5e8703f2202da5a40fc18/isu);
  assert.match(mediqa.drawio_review_note, /df9bca894d252279f200ee78e85d871b57a94b224d75467b7fa38a4a0952cc1d/isu);
});

test('keeps every A11k fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11k', () => {
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

test('reproduces exactly twelve A11k SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11k-exports-'));
  let exportCount = 0;
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, ['-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(readFileSync(generatedSvg, 'utf8'), readFileSync(`${base}.svg`, 'utf8'), `${id}.${language}.svg`);
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
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all twelve A11k specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11k-'));
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
    assert.equal(rebuildCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
