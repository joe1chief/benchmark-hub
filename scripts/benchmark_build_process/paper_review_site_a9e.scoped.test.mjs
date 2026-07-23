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
const benchmarkIds = [
  'Humanity’s_Last_Code_Exam',
  'LiveCodeBench_Pro',
  'MultiPL-E',
  'NL2Repo-Bench',
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

function canReach(arch, start, target) {
  const outgoing = new Map();
  for (const edge of arch.edges) {
    const destinations = outgoing.get(edge.from) ?? [];
    destinations.push(edge.to);
    outgoing.set(edge.from, destinations);
  }
  const pending = [start];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
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

test('keeps all four A9e packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('separates HLCE source pipelines, paper and repository timeouts, code scoring, and self-recognition', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Humanity’s_Last_Code_Exam', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('icpc_source')?.label ?? '', /official PDFs.*official tests|官方 PDF.*官方测试/isu);
    assert.match(nodes.get('icpc_gate')?.label ?? '', /146.*2011.?2023.*corrupt.*interactive|146.*2011.?2023.*损坏.*交互/isu);
    assert.match(nodes.get('ioi_source')?.label ?? '', /Codeforces.*IOI.*official tests|Codeforces.*IOI.*官方测试/isu);
    assert.match(nodes.get('ioi_gate')?.label ?? '', /89.*2010.?2024.*output-only|89.*2010.?2024.*仅输出/isu);
    assert.match(nodes.get('release')?.label ?? '', /235/isu);
    assert.match(nodes.get('generate')?.label ?? '', /5.*OpenRouter.*default|5.*OpenRouter.*默认/isu);
    assert.match(nodes.get('protocol_boundary')?.label ?? '', /paper.*30.*repo.*60|论文.*30.*仓库.*60/isu);
    assert.match(nodes.get('ioi_judge')?.label ?? '', /Codeforces.*100.*partial.*fail|Codeforces.*100.*部分分.*失败/isu);
    assert.match(nodes.get('passk')?.label ?? '', /Pass@1.*Pass@5.*1\s*-\s*C\(n-c,k\)\s*\/\s*C\(n,k\)/isu);
    assert.match(nodes.get('self_recognition')?.label ?? '', /separate.*AUC|独立.*AUC/isu);
    assert.ok(edges.has('icpc_gate->release:primary'));
    assert.ok(edges.has('ioi_gate->release:primary'));
    assert.ok(edges.has('protocol_boundary->icpc_judge:data'));
    assert.ok(edges.has('eval_route->icpc_judge:primary'));
    assert.ok(edges.has('eval_route->ioi_judge:primary'));
    assert.ok(edges.has('generate->self_recognition:data'));
    assert.ok(edges.has('passk->report:primary'));
    assert.ok(edges.has('self_recognition->report:secondary'));
  }
});

test('keeps LiveCodeBench Pro collection, annotation, paper evaluation, repository toolkit, and metrics distinct', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LiveCodeBench_Pro', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('sources')?.label ?? '', /Codeforces.*ICPC.*IOI.*Others|Codeforces.*ICPC.*IOI.*其他/isu);
    assert.match(nodes.get('sources')?.label ?? '', /LeetCode.*excluded|排除.*LeetCode/isu);
    assert.match(nodes.get('capture')?.label ?? '', /before.*solutions.*editorials.*discussions|早于.*解答.*题解.*讨论/isu);
    assert.match(nodes.get('host_gate')?.label ?? '', /coordinator.*2.*expert.*stress|协调员.*2.*专家.*压测/isu);
    assert.match(nodes.get('release')?.label ?? '', /584.*2025-04-25|2025-04-25.*584/isu);
    assert.match(nodes.get('difficulty')?.label ?? '', /Easy.*2000.*Medium.*3000.*Hard|简单.*2000.*中等.*3000.*困难/isu);
    assert.match(nodes.get('annotations')?.label ?? '', /algorithm.*knowledge.*logic.*observation|算法.*知识.*逻辑.*观察/isu);
    assert.match(nodes.get('cross_validate')?.label ?? '', /triple-blind.*independent expert|三盲.*独立专家/isu);
    assert.match(nodes.get('paper_judge')?.label ?? '', /third-party.*online judges.*no tools|第三方.*在线判题.*无工具/isu);
    assert.match(nodes.get('repo_toolkit')?.label ?? '', /LightCPVerifier.*later.*not paper protocol|LightCPVerifier.*后续.*非论文协议/isu);
    assert.match(nodes.get('map_elo')?.label ?? '', /Codeforces subset.*MAP.*1\s*\/\s*\(1\s*\+\s*10\^|Codeforces 子集.*MAP.*1\s*\/\s*\(1\s*\+\s*10\^/isu);
    assert.match(nodes.get('failure_analysis')?.label ?? '', /line-by-line.*125.*125|125.*125.*line-by-line|逐行.*125.*125|125.*125.*逐行/isu);
    assert.ok(edges.has('cross_validate->release:data'));
    assert.ok(edges.has('release->repo_toolkit:data'));
    assert.ok(edges.has('paper_judge->pass1:primary'));
    assert.ok(edges.has('paper_judge->passk:secondary'));
    assert.ok(edges.has('cf_subset->map_elo:secondary'));
    assert.ok(edges.has('failure_sample->failure_analysis:secondary'));
    assert.equal(edges.has('repo_toolkit->paper_judge:primary'), false);
    for (const node of arch.nodes) {
      if (node.id === 'repo_toolkit') continue;
      assert.equal(canReach(arch, node.id, 'report'), true, `${language}.${node.id} reaches report`);
    }
  }
});

test('pins MultiPL-E normalization and paper scope without inflating it with current repository extensions', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('MultiPL-E', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('human_eval')?.label ?? '', /164/isu);
    assert.match(nodes.get('he_normalize')?.label ?? '', /exclude 3.*convert 2.*up to 5|排除 3.*改写 2.*最多 5/isu);
    assert.match(nodes.get('mbpp_normalize')?.label ?? '', /hide.*assertions.*infer.*signature|隐藏.*断言.*推断.*签名/isu);
    assert.match(nodes.get('paper_scope')?.label ?? '', /18.*compilers.*19.*including Python|18.*编译器.*含 Python.*19/isu);
    assert.match(nodes.get('translation')?.label ?? '', /signature.*description.*terminology.*doctest|签名.*描述.*术语.*文档测试/isu);
    assert.match(nodes.get('test_translation')?.label ?? '', /unit tests.*typed values.*type annotations|单元测试.*类型化值.*类型注解/isu);
    assert.match(nodes.get('generation')?.label ?? '', /200.*0\.2.*Pass@1.*0\.8.*Pass@10.*Pass@100/isu);
    assert.match(nodes.get('sandbox')?.label ?? '', /container.*compile.*timeout.*hidden tests|容器.*编译.*超时.*隐藏测试/isu);
    assert.match(nodes.get('passk')?.label ?? '', /1\s*-\s*C\(n-c,k\)\s*\/\s*C\(n,k\)/isu);
    assert.match(nodes.get('repo_extensions')?.label ?? '', /current repo.*additional languages.*outside paper scope|当前仓库.*新增语言.*不扩展论文范围/isu);
    assert.ok(edges.has('he_normalize->canonical:primary'));
    assert.ok(edges.has('mbpp_normalize->canonical:primary'));
    assert.ok(edges.has('paper_scope->repo_extensions:data'));
    assert.ok(edges.has('test_translation->sandbox:data'));
    assert.ok(edges.has('passk->report:primary'));
  }
});

test('models NL2Repo-Bench four-part specs, hidden-test evaluation, and two distinct score definitions', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('NL2Repo-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('selection')?.label ?? '', /300.?120,?000.*10.*pytest.*3 years|300.?120,?000.*10.*pytest.*(?:3 年|三年)/isu);
    assert.match(nodes.get('baseline')?.label ?? '', /native tests.*all pass|原生测试.*全通过/isu);
    assert.match(nodes.get('ast_inventory')?.label ?? '', /classes.*functions.*constants.*signatures.*locations|类.*函数.*常量.*签名.*位置/isu);
    assert.match(nodes.get('specification')?.label ?? '', /Project Description.*Supports.*API Usage Guide.*Implementation Nodes|项目描述.*支撑信息.*API 使用指南.*实现节点/isu);
    assert.match(nodes.get('docker')?.label ?? '', /dedicated Docker.*upstream baseline.*no functional source changes|独立 Docker.*上游基线.*不改功能源码/isu);
    assert.match(nodes.get('qa')?.label ?? '', /expert.*static API.*pilot.*senior|专家.*静态 API.*先导.*高级/isu);
    assert.match(nodes.get('release')?.label ?? '', /104.*9/isu);
    assert.match(nodes.get('agent_input')?.label ?? '', /empty workspace.*only (?:one )?spec.*signatures.*inside (?:the )?spec|空工作区.*仅规格.*签名只在规格内/isu);
    assert.match(nodes.get('agent_input')?.label ?? '', /no separate scaffold.*source.*tests|无额外脚手架.*源码.*测试/isu);
    assert.match(nodes.get('hidden_pytest')?.label ?? '', /original upstream pytest.*continue-on-collection-errors|原始上游 pytest.*continue-on-collection-errors/isu);
    assert.match(nodes.get('avg_score')?.label ?? '', /average test pass rate|平均测试通过率/isu);
    assert.match(nodes.get('full_pass')?.label ?? '', /fully-passed Pass@1 count.*not estimator|完整通过 Pass@1 数量.*不是估计器/isu);
    assert.ok(edges.has('baseline->ast_inventory:primary'));
    assert.ok(edges.has('ast_inventory->behavior_review:primary'));
    assert.ok(edges.has('behavior_review->specification:primary'));
    assert.equal(edges.has('baseline->behavior_review:primary'), false);
    assert.equal(edges.has('ast_inventory->specification:primary'), false);
    assert.ok(edges.has('baseline->docker:data'));
    assert.ok(edges.has('docker->hidden_pytest:data'));
    assert.ok(edges.has('hidden_pytest->avg_score:primary'));
    assert.ok(edges.has('hidden_pytest->full_pass:secondary'));
    assert.equal(edges.has('avg_score->full_pass:primary'), false);
  }
});

test('pins A9e paper versions, sections, repository snapshots, and protocol boundaries in detail records', () => {
  const expected = {
    'Humanity’s_Last_Code_Exam': /2506\.12713v2.*§3\.1.*§3\.3.*Appendix A\.4.*7ff3569.*30.*60/isu,
    LiveCodeBench_Pro: /2506\.11928v1.*§2.*Appendix A\.3.*d614eef.*LightCPVerifier.*not the paper protocol/isu,
    'MultiPL-E': /2208\.08227v4.*§3\.1.*§3\.4.*3025a53.*current repository extensions.*paper.*19 languages/isu,
    'NL2Repo-Bench': /2512\.12730v2.*§3\.1.*Appendix C.*781a1da.*signatures.*inside.*spec/isu,
  };
  for (const [id, note] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.drawio_review_note, note, `${id} locator`);
  }
});

test('keeps every A9e fallback synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A9e', () => {
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

test('reproduces the revised A9e SVG and PNG exports from their checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9e-exports-'));
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

test('strictly rebuilds and normalizes all eight A9e specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9e-'));
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
