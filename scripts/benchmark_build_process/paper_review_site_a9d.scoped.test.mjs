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
const benchmarkIds = ['ComputeEval', 'Design2Code', 'FEA-Bench', 'FronTalk'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(root, 'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs');

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A9d packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('pins ComputeEval to the 2026.1 repository snapshot and separates disclosed review from undisclosed assistance provenance', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ComputeEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2026\.1.*19ba74f|19ba74f.*2026\.1/isu);
    assert.match(nodes.get('author')?.label ?? '', /every.*human-reviewed|全部.*人工复核/isu);
    assert.match(nodes.get('provenance_boundary')?.label ?? '', /assistance share.*not disclosed|per-problem provenance.*not disclosed|辅助占比.*未披露|逐题来源.*未披露/isu);
    assert.match(nodes.get('release')?.label ?? '', /566.*7.*499/isu);
    assert.match(nodes.get('generate')?.label ?? '', /tests.*reference.*hidden|隐藏测试.*参考解.*不可见/isu);
    const compileLabel = nodes.get('compile')?.label ?? '';
    const sourceReferenceCheck = compileLabel.indexOf('source_references');
    const buildCommand = compileLabel.indexOf('build_command');
    const testCommand = compileLabel.indexOf('test_command');
    assert.ok(sourceReferenceCheck >= 0, `${language}: source_references check`);
    assert.ok(buildCommand > sourceReferenceCheck, `${language}: build follows source reference check`);
    assert.ok(testCommand > buildCommand, `${language}: test follows build`);
    assert.ok(edges.has('author->provenance_boundary:secondary'));
    assert.ok(edges.has('correctness->performance:primary'));
    assert.ok(edges.has('compile->report:optional'));
    assert.ok(edges.has('correctness->report:optional'));
  }
});

test('shows Design2Code exact filtering, separately sourced HARD data, and human metric validation off the scoring path', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Design2Code', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    const rawLabel = nodes.get('raw')?.label ?? '';
    assert.match(rawLabel, /127\.9k.*CSS[- ](?:Inlined|已内联).*Single-HTML Pages|127\.9k.*CSS 已内联.*单 HTML 页面/isu);
    assert.doesNotMatch(rawLabel, /Self-Contained|自包含/isu);
    assert.match(nodes.get('auto_filter')?.label ?? '', />?100k.*image-only.*text-only.*127\.9k.*14k|>?100k.*仅图像.*仅文本.*127\.9k.*14k/isu);
    assert.match(nodes.get('manual')?.label ?? '', /200.*75%.*7k.*standalone.*safety.*format.*diversity|200.*75%.*7k.*自包含.*安全.*格式.*多样性/isu);
    assert.match(nodes.get('hard_source')?.label ?? '', /GitHub Pages.*80.*final.*selection.*not disclosed|GitHub Pages.*80.*最终.*筛选.*未披露/isu);
    assert.match(nodes.get('human')?.label ?? '', /100.*5.*435.*50.?50.*79\.9|100.*5.*435.*50.?50.*79\.9/isu);
    assert.match(nodes.get('screenshot')?.label ?? '', /screenshot.*source.*not exposed|截图.*不暴露.*源码/isu);
    assert.ok(edges.has('hard_source->sets:data'));
    assert.ok(edges.has('metrics->report:primary'));
    assert.ok(edges.has('metrics->human:secondary'));
    assert.equal(edges.has('metrics->human:primary'), false);
  }
});

test('captures FEA-Bench executable gates, release limits, and the non-verified Lite boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FEA-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('fast')?.label ?? '', /20.*18.*101.*119/isu);
    assert.match(nodes.get('pr')?.label ?? '', /merged.*test-file|已合并.*测试文件/isu);
    assert.match(nodes.get('component')?.label ?? '', /function.*class.*25%|函数.*类.*25%/isu);
    assert.match(nodes.get('size_gate')?.label ?? '', /8,?192/isu);
    assert.match(nodes.get('verify')?.label ?? '', /may pass or fail.*ImportError.*AttributeError.*no FAILED|可通过或失败.*ImportError.*AttributeError.*无 FAILED/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /feature request.*new-component.*hide.*gold.*test|功能请求.*新组件.*隐藏.*金标准.*测试/isu);
    assert.match(nodes.get('edit')?.label ?? '', /single generation.*apply.*hidden unit tests|单次生成.*应用.*隐藏单元测试/isu);
    assert.match(nodes.get('report')?.label ?? '', /resolved.*all unit tests pass|全部单元测试通过.*解决/isu);
    assert.match(nodes.get('lite_gate')?.label ?? '', /rule-filtered.*not professionally.*human-verified.*future.*verified|规则筛选.*非专业人工验证.*未来.*验证/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /full dataset.*not released.*essential attributes.*GitHub|完整数据集.*不发布.*核心字段.*GitHub/isu);
    assert.ok(edges.has('component->intent:primary'));
    assert.ok(edges.has('intent->size_gate:primary'));
    assert.ok(edges.has('dataset->lite_gate:optional'));
    assert.ok(edges.has('dataset->release_boundary:data'));
  }
});

test('separates FronTalk simulator validation, final-turn instruction scoring, forgetting, usability, and human checks', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('FronTalk', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('refine')?.label ?? '', /66.*2,?783.*224.*90\.1%.*94\.7%/isu);
    assert.match(nodes.get('curation_boundary')?.label ?? '', /refiner.*number.*qualifications.*not disclosed|精炼人员.*数量.*资质.*未披露/isu);
    assert.match(nodes.get('simulator')?.label ?? '', /current code.*original intent.*ambiguity.*redundancy|当前代码.*原始意图.*歧义.*冗余/isu);
    assert.match(nodes.get('sim_validation')?.label ?? '', /114.*411.*98%.*96%.*76%.*97%/isu);
    assert.match(nodes.get('instruction')?.label ?? '', /final.*all intents.*tests|最终.*全部意图.*测试/isu);
    const forgettingLabel = nodes.get('forgetting')?.label ?? '';
    assert.match(forgettingLabel, /(?:Eq\. 2|式 2).*T-1.*t\s*<\s*T/isu);
    assert.match(forgettingLabel, /FR\s*=\s*1\s*-\s*Σ\(t<T\)\s*PC\(o_T\|i_t\)/isu);
    assert.match(forgettingLabel, /\/\s*Σ\(t<T\)\s*PC\(o_t\|i_t\)/isu);
    assert.ok(
      forgettingLabel.indexOf('PC(o_T|i_t)') < forgettingLabel.indexOf('PC(o_t|i_t)'),
      `${language}: final-output numerator precedes prior-turn denominator`,
    );
    assert.match(nodes.get('usability')?.label ?? '', /first-time.*reference.*pairwise.*win|首次.*参考.*成对.*胜率/isu);
    assert.match(nodes.get('eval_validation')?.label ?? '', /218.*82\.0%.*62\.7.*50.*84\.0%.*66\.7/isu);
    assert.ok(edges.has('refine->curation_boundary:secondary'));
    assert.ok(edges.has('simulator->sim_validation:secondary'));
    assert.ok(edges.has('render->instruction:primary'));
    assert.ok(edges.has('render->usability:primary'));
    assert.ok(edges.has('instruction->forgetting:secondary'));
    assert.equal(edges.has('instruction->forgetting:primary'), false);
    assert.ok(edges.has('instruction->report:primary'));
    assert.ok(edges.has('usability->report:primary'));
  }
});

test('pins the A9d paper, section, repository snapshot, and disclosure boundaries in detail records', () => {
  const expected = {
    ComputeEval: [/developer\.nvidia\.com\/blog\/announcing-computeeval/u, /2026\.1.*19ba74f.*assistance share.*not disclosed/isu],
    Design2Code: [/2403\.03163/u, /2403\.03163v3.*§2\.1.*§4\.5.*Appendix B.*7a575e4.*final HARD selection.*not disclosed/isu],
    'FEA-Bench': [/2503\.06680/u, /2503\.06680v2.*§3\.1.*Appendix A\.3.*fb3c112.*full dataset.*not released/isu],
    FronTalk: [/2601\.04203/u, /2601\.04203v2.*§2\.1.*§3\.2.*Appendix I.*4486cf0.*refiner.*not disclosed/isu],
  };
  for (const [id, [paper, note]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    assert.match(detail.drawio_review_note, note, `${id} locator`);
  }
});

test('keeps every A9d fallback synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const fallback = detail[`flowchart_${language}`];
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

test('publishes native fixed-light SVG and readable PNG pairs for A9d', () => {
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
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('strictly rebuilds and normalizes all eight A9d specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9d-'));
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
