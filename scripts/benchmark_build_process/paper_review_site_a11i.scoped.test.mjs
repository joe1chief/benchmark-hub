import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  'LifelongAgentBench',
  'LitBench',
  'LitQA2',
  'LiveBench',
  'LiveCodeBench-Base',
  'LiveCodeBench_v6',
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

test('keeps all six A11i packages bilingual with the academic profile and evidence boundaries', () => {
  const requiredNodes = new Map([
    ['LifelongAgentBench', ['sources', 'dataset_release', 'gsc', 'report']],
    ['LitBench', ['evidence', 'release_boundary', 'disclosure_gaps']],
    ['LitQA2', ['source_lock', 'calibration', 'missing_contracts', 'implementation_drift']],
    ['LiveBench', ['release_drift', 'release_boundary', 'evidence_pins']],
    ['LiveCodeBench-Base', ['base_identity', 'unknowns', 'do_not_substitute']],
    ['LiveCodeBench_v6', ['release', 'repair_metric', 'full_boundary']],
  ]);
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      for (const nodeId of requiredNodes.get(id)) {
        assert.ok(spec.nodes.some(node => node.id === nodeId), `${id}.${language} ${nodeId}`);
      }
    }
    assert.ok(String(readDetail(id).drawio_review_note).length > 500, `${id} review evidence`);
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 48], ['zh', 40]]) {
      for (const node of readSpec(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks LifelongAgentBench construction gates, public release audit, sequential replay, and GSC boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LifelongAgentBench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /1,?396.*500.*500.*396/isu);
    assert.match(text, /1,?306/isu);
    assert.match(text, /DB 22|数据库 22/isu);
    assert.match(text, /20 Uses per Skill|每项技能至少出现 20 次/isu);
    assert.match(text, /29.*9.?12.*4.?26.*339.*161/isu);
    assert.match(text, /GrailQA.*2.?8.*50.*9.*46/isu);
    assert.match(text, /10%/isu);
    assert.match(text, /MySQL.*3 Rounds|MySQL.*3 轮/isu);
    assert.match(text, /N.?=.?0.*1.*2.*4.*8.*16.*32.*64/isu);
    assert.match(text, /DB \+ OS Only|仅支持 DB \+ OS/isu);
    for (const edge of [
      'skills->db_sample:primary',
      'skills->os_sample:primary',
      'skills->kg_source:primary',
      'dataset_release->framework:primary',
      'sequence->replay:primary',
      'agent_infer->gsc:optional',
      'gsc->db_eval:primary',
      'gsc->os_eval:primary',
      'success_gate->replay_memory:primary',
      'replay_memory->replay:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('gsc->kg_eval:primary'), `${language} public GSC must not claim KG support`);
  }
});

test('locks LitBench independent curation, training protocols, human study, and release gaps', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LitBench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /5,?000.*2023/isu);
    assert.match(text, /10 Upvotes|赞数至少为 10/isu);
    assert.match(text, /50.*2,?048/isu);
    assert.match(text, /25%.*100-bin|25%.*100 桶/isu);
    assert.match(text, /2,?480.*3,?543.*43,?827.*50,?309/isu);
    assert.match(text, /Batch128.*LR1e-5.*Warmup10%.*bfloat16.*AdamW/isu);
    assert.match(text, /2e-5.*3 Epochs.*8192|2e-5.*3 轮.*8192/isu);
    assert.match(text, /64.*40.*46.*10.?13.*56\.4%.*43\.6%/isu);
    assert.match(text, /43,?736.*91/isu);
    assert.match(text, /2,?381.*99/isu);
    for (const edge of [
      'reddit->test_source:primary',
      'reddit->train_source:primary',
      'test_set->zero_shot:data',
      'train_set->bt_model:primary',
      'train_set->gen_model:primary',
      'bt_model->rm_ranking:dependency',
      'rm_ranking->human_study:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('human_study->report:data'), `${language} human study is a separate follow-up result`);
    const spec = readSpec('LitBench', language);
    const trainToGen = spec.edges.find(edge => edge.from === 'train_set' && edge.to === 'gen_model');
    const btToRanking = spec.edges.find(edge => edge.from === 'bt_model' && edge.to === 'rm_ranking');
    assert.deepEqual(trainToGen.waypoints, [
      { x: 1808, y: 410 },
      { x: 1808, y: 714 },
    ]);
    assert.deepEqual(btToRanking.waypoints, [
      { x: 1776, y: 480 },
      { x: 1776, y: 944 },
      { x: 1628, y: 944 },
    ]);
  }
});

test('locks LitQA2 author gates, 248-item chronology, physical versus manifest splits, and paper-v2 evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LitQA2', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /36\s*Months|36\s*个月/isu);
    assert.match(text, /First ~10|最初约\s*10/isu);
    assert.match(text, /47.*100.*147.*101.*248/isu);
    assert.match(text, /One Physical train Split.*199|一个物理 train split.*199/isu);
    assert.match(text, /Train159.*Eval40.*199|199.*训练159.*验证40/isu);
    assert.match(text, /Test49|测试(?:集)?49/isu);
    assert.match(text, /3 Complete Runs.*248|全部248题.*3次/isu);
    assert.match(text, /Accuracy.*Precision.*DOI Recall|准确率.*精确率.*DOI召回率/isu);
    for (const edge of [
      'challenge->calibration:primary',
      'calibration->release_248:primary',
      'calibration->challenge:optional',
      'calibration->reject_item:optional',
      'current_manifest->public_199:primary',
      'current_manifest->gated_49:optional',
      'eval_prep->paper_run:primary',
      'extract_letter->grade_choice:primary',
      'grade_choice->metrics:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LiveBench paper construction, dated refresh contract, branch-specific scoring, and current boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LiveBench', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /18 Tasks.*6 Categories.*1,?000|18 个任务.*6 个类别.*1,?000/isu);
    assert.match(text, /Monthly.*1\/6|每月.*1\/6/isu);
    assert.match(text, /23.*7.*1,?270.*1,?198.*72/isu);
    assert.match(text, /T=0.*0\.7.*1\.0/isu);
    assert.match(text, /Mini-SWE-Agent.*250/isu);
    assert.match(text, /FAIL_TO_PASS.*PASS_TO_PASS/isu);
    assert.match(text, /Paper: 6.*Current Site: 7|论文[:：]?\s*6\s*类.*当前官网\s*7\s*类/isu);
    for (const edge of [
      'construct_tasks->objective_gate:primary',
      'objective_gate->reject_task:optional',
      'version_tags->public_release:primary',
      'version_tags->private_window:primary',
      'eval_route->standard_infer:primary',
      'eval_route->agentic_infer:primary',
      'standard_scorer->score_audit:optional',
      'score_audit->standard_scorer:optional',
      'agentic_scorer->question_score:primary',
      'category_average->overall_average:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('agentic_scorer->score_audit:optional'), `${language} parser QC is standard-only`);
  }
});

test('locks the private LiveCodeBench-Base report adapter without substituting a public release', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LiveCodeBench-Base', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /0801.?1101/isu);
    assert.match(text, /DeepSeek-V2.*Qwen2\.5-72B.*LLaMA-3\.1-405B.*DeepSeek-V3/isu);
    assert.match(text, /3-shot/isu);
    assert.match(text, /11\.6.*12\.9.*15\.5.*19\.4/isu);
    assert.match(text, /Exact Task IDs|精确任务\s*ID/isu);
    assert.match(text, /Not an Official LCB Leaderboard Release|不是\s*LCB\s*官方榜单发布/isu);
    for (const edge of [
      'codegen_instances->base_identity:primary',
      'base_identity->window:primary',
      'models->three_shot:primary',
      'internal_eval->pass1:primary',
      'internal_eval->unknowns:optional',
      'window->do_not_substitute:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks LiveCodeBench v6 construction, current runner, official metrics, self-repair, and full-loader boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('LiveCodeBench_v6', language);
    const text = labels(arch);
    const edges = edgeSet(arch);
    assert.match(text, /1,?055.*May 2023.*Apr 2025|1,?055.*(?:2023-05.*2025-04|2023年5月.*2025年4月)/isu);
    assert.match(text, /n=10.*(?:Temperature|温度)=0\.2.*top_p=0\.95.*2,?000/isu);
    assert.match(text, /APPS Checker|APPS\s*检查器/isu);
    assert.match(text, /Pass@1.*Pass@5/isu);
    assert.match(text, /Self-repair Combined Pass@1|自修复(?:组合|合并)\s*Pass@1/isu);
    assert.match(text, /--not_fast.*code_generation/isu);
    assert.match(text, /Ignores release_version|忽略\s*release_version/isu);
    for (const edge of [
      'format->release:primary',
      'release->select:primary',
      'sample->parse:primary',
      'parse->checker:primary',
      'checker->metrics:primary',
      'checker->repair_seed:data',
      'repair_feedback->repair_check:primary',
      'repair_check->repair_metric:primary',
      'select->full_boundary:optional',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('pins exact primary-source and official-artifact revisions in every A11i detail record', () => {
  const lifelong = readDetail('LifelongAgentBench');
  assert.match(lifelong.paper_url, /2505\.11942/u);
  assert.equal(lifelong.openness, 'partly public');
  assert.equal(lifelong.has_leaderboard, false);
  assert.match(lifelong.drawio_review_note, /d6f19b42eb358d9150379f0c68c2985c5a867520/isu);
  assert.match(lifelong.drawio_review_note, /75054b60177d4dcddb93b984413ff799b0a1fdbc/isu);

  const lit = readDetail('LitBench');
  assert.match(lit.paper_url, /2026\.eacl-long\.362/u);
  assert.equal(lit.openness, 'partly public');
  assert.equal(lit.has_leaderboard, false);
  assert.match(lit.drawio_review_note, /c1017dbe91eff178b3e318d775f600a89774089c/isu);
  assert.match(lit.drawio_review_note, /079a36dd2d56185f76cf466a08a05dda146795dd/isu);
  assert.match(lit.drawio_review_note, /21e2739a2bce58bf0bc9317be412e8f33ed8f370/isu);
  assert.match(lit.drawio_review_note, /7c5e04513eba76f8399dec2dd7927eb614a5475d/isu);

  const litqa = readDetail('LitQA2');
  assert.match(litqa.paper_url, /2409\.13740v2/u);
  assert.equal(litqa.openness, 'partly public');
  assert.equal(litqa.has_leaderboard, false);
  assert.match(litqa.drawio_review_note, /d7675d7b7eddeb3535e8c260399c5bbeeb818c50/isu);
  assert.match(litqa.drawio_review_note, /1c061dbc37febccf9f94d8e8308a0ddebb5dae3c/isu);
  assert.match(litqa.drawio_review_note, /5c77cec648430f30611808808861eb86f81d5eaa/isu);
  assert.match(litqa.drawio_review_note, /e9ee5486ac60f06f9e7f217ca167e2a83874ded4/isu);

  const live = readDetail('LiveBench');
  assert.match(live.paper_url, /2406\.19314v2/u);
  assert.equal(live.openness, 'partly public');
  assert.equal(live.has_leaderboard, true);
  assert.match(live.drawio_review_note, /4bf3d6f4cb37fa8dc3967dd1b124fef5d4099635/isu);
  assert.match(live.drawio_review_note, /f2e0b4bcffae54c84461d96fc8e668c4b57a0627/isu);

  const base = readDetail('LiveCodeBench-Base');
  assert.match(base.paper_url, /2412\.19437v2/u);
  assert.equal(base.dataset_revision, '0fe84c3912ea0c4d4a78037083943e8f0c4dd505');
  assert.equal(base.openness, 'partly public');
  assert.equal(base.has_leaderboard, false);
  assert.match(base.drawio_review_note, /28fef95ea8c9f7a547c8329f2cd3d32b92c1fa24/isu);

  const v6 = readDetail('LiveCodeBench_v6');
  assert.match(v6.paper_url, /2403\.07974v2/u);
  assert.equal(v6.dataset_revision, '0fe84c3912ea0c4d4a78037083943e8f0c4dd505');
  assert.equal(v6.openness, 'public');
  assert.equal(v6.has_leaderboard, true);
  assert.match(v6.drawio_review_note, /f186ab5041d6b768733b8ae8145151c867942134/isu);
  assert.match(v6.drawio_review_note, /6ca212e9c2039373f6e5069d37ffa9db66e23736/isu);
});

test('keeps every A11i fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11i', () => {
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

test('reproduces exactly twelve A11i SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11i-exports-'));
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
    assert.equal(exportCount, 12);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all twelve A11i specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11i-'));
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
