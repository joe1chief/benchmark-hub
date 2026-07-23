import assert from 'node:assert/strict';
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
const benchmarkIds = [
  'AndroidWorld',
  'ArXivMath',
  'AstaBench',
  'AthenaBench-Mini',
  'AudioMC',
  'AutomationBench',
];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(root, 'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language = 'en') {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function readCatalogRecord(id) {
  return readJson(join(publicDir, 'benchmarks.json')).find(entry => entry.id === id);
}

function nodeMap(arch) {
  return new Map(arch.nodes.map(node => [node.id, node]));
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to, type }) => `${from}->${to}:${type}`));
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

test('keeps all six A4a diagrams bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'en')), topology(readArch(id, 'zh')), id);
  }
});

test('keeps reviewed AstaBench and AthenaBench-Mini catalog fallbacks identical to details', () => {
  for (const id of ['AstaBench', 'AthenaBench-Mini']) {
    assert.deepEqual(readCatalogRecord(id), readDetail(id), id);
  }
});

test('records AndroidWorld construction before the independent seeded evaluation loop', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AndroidWorld', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('fixed_environment')?.label ?? '', /20.*app|20.*应用/isu);
    assert.match(nodes.get('fixed_environment')?.label ?? '', /fixed.*version|固定.*版本/isu);
    assert.match(nodes.get('templates')?.label ?? '', /116.*TaskEval/isu);
    assert.match(nodes.get('execution_annotation')?.label ?? '', /6.*annotator|6.*标注/isu);
    assert.match(nodes.get('execution_annotation')?.label ?? '', /30\+.*bug|30\+.*缺陷|30\+.*错误/isu);
    assert.match(nodes.get('dynamic_release')?.label ?? '', /dynamic|动态/iu);
    assert.match(nodes.get('seed_instance')?.label ?? '', /seed|种子/iu);
    assert.match(nodes.get('observation_action')?.label ?? '', /observation.*action|观察.*动作/isu);
    assert.match(nodes.get('durable_reward')?.label ?? '', /durable.*state|持久.*状态/isu);
    assert.ok(edges.has('fixed_environment->templates:primary'));
    assert.ok(edges.has('templates->execution_annotation:primary'));
    assert.ok(edges.has('execution_annotation->dynamic_release:primary'));
    assert.ok(edges.has('dynamic_release->seed_instance:primary'));
    assert.ok(edges.has('seed_instance->observation_action:primary'));
    assert.ok(edges.has('observation_action->agent_loop:primary'));
    assert.ok(edges.has('agent_loop->durable_reward:primary'));
    assert.ok(edges.has('durable_reward->robustness:primary'));
    assert.equal(edges.has('templates->seed_instance:primary'), false);
  }
});

test('runs ArXivMath parser and judge in parallel and repairs only formatting failures', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ArXivMath', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('candidate_pool')?.label ?? '', /200/u);
    assert.match(nodes.get('release')?.label ?? '', /30/u);
    assert.match(nodes.get('final_review')?.label ?? '', /MathArena team|MathArena 团队/iu);
    assert.match(nodes.get('manual_review')?.label ?? '', /<\s*1%|少于\s*1%/iu);
    assert.ok(edges.has('model_outputs->parser:primary'));
    assert.ok(edges.has('model_outputs->llm_judge:data'));
    assert.ok(edges.has('parser->format_gate:primary'));
    assert.ok(edges.has('format_gate->restate:optional'));
    assert.ok(edges.has('restate->parser_retry:primary'));
    assert.ok(edges.has('llm_judge->agreement_gate:data'));
    assert.ok(edges.has('agreement_gate->manual_review:optional'));
    assert.equal(edges.has('parser->restate:primary'), false);
    assert.equal(edges.has('parser->llm_judge:primary'), false);
  }
});

test('assembles AstaBench before running tasks and tools through Inspect', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AstaBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('suite')?.label ?? '', /11.*2,?404/su);
    assert.match(nodes.get('adapt_filter')?.label ?? '', /adapt|filter|改造|过滤/iu);
    assert.match(nodes.get('runtime')?.label ?? '', /Inspect/iu);
    assert.match(nodes.get('runtime')?.label ?? '', /listed tool binding|逐任务工具绑定/iu);
    assert.match(nodes.get('corpus')?.label ?? '', /4.*PaperFinding.*LitQA2-Search.*ScholarQA-CS2.*LitQA2-FullText/isu);
    assert.match(nodes.get('snippet')?.label ?? '', /1.*ArxivDIGESTables-Clean.*(?:paper IDs|论文 ID)/isu);
    assert.match(nodes.get('notebook')?.label ?? '', /6.*SUPER.*CORE.*DS-1000.*Discovery.*E2E.*E2E-Hard/isu);
    assert.match(nodes.get('agent_panel')?.label ?? '', /tool configs|工具配置/iu);
    assert.match(nodes.get('agent_panel')?.label ?? '', /supported categories|支持的任务类别/iu);
    assert.match(nodes.get('execution')?.label ?? '', /applicable combinations|适用的.*组合/iu);
    assert.doesNotMatch(nodes.get('execution')?.label ?? '', /every agent-task|每个 Agent-任务/iu);
    assert.doesNotMatch(nodes.get('runtime')?.label ?? '', /corpus \+ notebook|语料库与笔记本/iu);
    assert.ok(edges.has('product_requests->adapt_filter:primary'));
    assert.ok(edges.has('existing_evals->adapt_filter:data'));
    assert.ok(edges.has('new_evals->adapt_filter:data'));
    assert.ok(edges.has('adapt_filter->suite:primary'));
    assert.ok(edges.has('suite->corpus:primary'));
    assert.ok(edges.has('suite->snippet:primary'));
    assert.ok(edges.has('suite->notebook:primary'));
    assert.ok(edges.has('corpus->runtime:data'));
    assert.ok(edges.has('snippet->runtime:data'));
    assert.ok(edges.has('notebook->runtime:data'));
    assert.equal(edges.has('suite->runtime:primary'), false);
    assert.ok(edges.has('runtime->agent_panel:primary'));
    assert.ok(edges.has('agent_panel->execution:primary'));
    assert.ok(edges.has('execution->scores_cost:primary'));
    assert.ok(edges.has('scores_cost->pareto:primary'));
  }
});

test('scopes AthenaBench quality controls to their disclosed task families', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AthenaBench-Mini', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('ckt')?.label ?? '', /GPT-5.*Gemini.*human|GPT-5.*Gemini.*人工/isu);
    assert.match(nodes.get('rcm_vsp')?.label ?? '', /deduplicat.*only|仅.*去重/iu);
    assert.match(nodes.get('taa')?.label ?? '', /leak.*only|仅.*泄漏/iu);
    assert.match(nodes.get('seed_candidates')?.label ?? '', /per-task.*rates.*quotas|各任务.*抽样率.*配额/iu);
    assert.match(nodes.get('seed_candidates')?.label ?? '', /10.*random seed|10.*随机种子/iu);
    assert.match(nodes.get('select_seed')?.label ?? '', /closest.*full|最接近.*完整/iu);
    assert.match(nodes.get('select_seed')?.label ?? '', /prescribed task counts|论文规定的任务数量/iu);
    assert.doesNotMatch(nodes.get('select_seed')?.label ?? '', /not stratified|非分层/iu);
    assert.match(nodes.get('mini_release')?.label ?? '', /300.*100.*200.*100.*200.*50/su);
    assert.ok(edges.has('ckt->full_benchmark:primary'));
    assert.ok(edges.has('rcm_vsp->full_benchmark:primary'));
    assert.ok(edges.has('taa->full_benchmark:primary'));
    assert.equal(edges.has('ckt->rcm_vsp:primary'), false);
    assert.equal(edges.has('rcm_vsp->taa:primary'), false);
  }
});

test('keeps AudioMC synthetic and direct-human seed paths plus both failure gates', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AudioMC', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('synthetic_gate')?.label ?? '', /failure.*max.*turn|失败.*最大.*轮/iu);
    assert.match(nodes.get('direct_human_seed')?.label ?? '', /direct.*human|直接.*人工/iu);
    assert.match(nodes.get('human_recording')?.label ?? '', /65%/u);
    assert.match(nodes.get('human_gate')?.label ?? '', /failure|失败/iu);
    assert.match(nodes.get('rubrics')?.label ?? '', /final failure turn|最终失败轮/iu);
    assert.match(nodes.get('release')?.label ?? '', /452.*47.*14\.99.*1,?712/su);
    assert.ok(edges.has('synthetic_gate->planner:optional'));
    assert.ok(edges.has('synthetic_gate->discard:optional'));
    assert.ok(edges.has('synthetic_gate->blueprint:primary'));
    assert.ok(edges.has('blueprint->human_recording:primary'));
    assert.ok(edges.has('direct_human_seed->human_recording:data'));
    assert.ok(edges.has('human_recording->human_gate:primary'));
    assert.ok(edges.has('human_gate->rubrics:primary'));
    assert.ok(edges.has('human_gate->discard:optional'));
    assert.equal(edges.has('human_recording->rubrics:primary'), false);
  }
});

test('assigns clustered AutomationBench workflow shapes to six fixed domains', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AutomationBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('cluster_shapes')?.label ?? '', /cluster.*workflow.*shape|聚类.*工作流.*形态/iu);
    assert.match(nodes.get('assign_domains')?.label ?? '', /six predefined|六个预定义/iu);
    assert.match(nodes.get('release')?.label ?? '', /600.*600\+/su);
    assert.match(nodes.get('api_world')?.label ?? '', /500.*47/su);
    assert.match(nodes.get('official_score')?.label ?? '', /all-or-nothing|全有或全无/iu);
    assert.match(nodes.get('partial_note')?.label ?? '', /training.*diagnostic only|仅.*训练.*诊断/iu);
    assert.ok(edges.has('workflow_patterns->cluster_shapes:primary'));
    assert.ok(edges.has('cluster_shapes->assign_domains:primary'));
    assert.ok(edges.has('assign_domains->task_generation:primary'));
    assert.ok(edges.has('end_state->official_score:primary'));
    assert.ok(edges.has('official_score->partial_note:optional'));
    assert.ok(edges.has('official_score->report:primary'));
    assert.equal(edges.has('partial_note->report:primary'), false);
  }
});

test('keeps each detail fallback synchronized with every reviewed node and edge', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const fallback = detail[`flowchart_${language}`];
      assert.match(fallback, /^flowchart LR$/mu, `${id}.${language}`);
      for (const node of readArch(id, language).nodes) {
        assert.match(fallback, new RegExp(`^    ${escapeRegex(node.id)}\\[`, 'mu'));
      }
      for (const edge of readArch(id, language).edges) {
        assert.match(
          fallback,
          new RegExp(`^    ${escapeRegex(edge.from)} (?:-->|-\\.->) ${escapeRegex(edge.to)}$`, 'mu'),
          `${id}.${language}.${edge.from}->${edge.to}`,
        );
      }
    }
  }
});

test('pins primary-source locators and review verdicts', () => {
  const expected = {
    AndroidWorld: /REDRAW.*Sections 3\.2-3\.5.*Appendix D.*3e508/isu,
    ArXivMath: /REDRAW.*Appendix A\.1.*A\.2.*A\.6\.1.*A\.6\.2/isu,
    AstaBench: /REDRAW.*Table 2.*Appendices E.*F.*36c9/isu,
    'AthenaBench-Mini': /REDRAW.*Sections 3\.1-3\.6.*Tables 1-2/isu,
    AudioMC: /REDRAW.*Figure 3.*Appendices A\.4.*A\.6.*90ea/isu,
    AutomationBench: /REDRAW.*Sections 2-4.*Tables 1-2.*Section 6.*a321/isu,
  };
  for (const [id, pattern] of Object.entries(expected)) {
    assert.match(readDetail(id).drawio_review_note, pattern, id);
  }
});

test('publishes native fixed-light SVG and visible PNG for every language', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /math="0"/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\//u);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u);
      assert.doesNotMatch(svg, /light-dark\s*\(|color-scheme:\s*light\s+dark/u);
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 800 && dimensions.height >= 200, `${id}.${language}`);
    }
  }
});

test('strictly rebuilds and normalizes all 12 specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a4a-'));
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
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [normalizer, generated], { stdio: 'pipe' });
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
