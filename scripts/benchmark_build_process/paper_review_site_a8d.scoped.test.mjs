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
const benchmarkIds = ['AIME-24', 'AIME-25', 'AIRS-Bench', 'AInsteinBench'];
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

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A8d packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual labels within the reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 48], ['zh', 40]]) {
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

test('keeps AIME-24 inside the MAA and pinned dataset disclosure boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIME-24', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('exam_contract')?.label ?? '', /15.*(?:0[–-]999|0.*999)/isu);
    assert.doesNotMatch(nodes.get('exam_contract')?.label ?? '', /000[–-]999/u);
    assert.match(nodes.get('upstream_lineage')?.label ?? '', /AI-MO.*90.*2022.*2024/isu);
    assert.match(nodes.get('snapshot')?.label ?? '', /train.*30|30.*train/isu);
    assert.match(nodes.get('schema')?.label ?? '', /id.*problem.*solution.*answer.*url.*year/isu);
    assert.match(nodes.get('undisclosed')?.label ?? '', /not disclosed|未披露/iu);
    assert.match(nodes.get('undisclosed')?.label ?? '', /selection|筛选/iu);
    assert.match(nodes.get('undisclosed')?.label ?? '', /evaluator|评测/iu);
    assert.ok(edges.has('exam_origin->exam_contract:primary'));
    assert.ok(edges.has('exam_contract->upstream_lineage:primary'));
    assert.ok(edges.has('upstream_lineage->snapshot:primary'));
    assert.ok(edges.has('snapshot->schema:primary'));
    assert.ok(edges.has('schema->undisclosed:optional'));
    assert.doesNotMatch(JSON.stringify(arch), /boxed|Avg@k|Mean@k|方框/iu);
  }
  assert.match(readDetail('AIME-24').metric_en, /not disclosed/iu);
});

test('preserves AIME-25 as two independent source configs without inventing an evaluator', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIME-25', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('exam_contract')?.label ?? '', /15.*(?:0[–-]999|0.*999)/isu);
    assert.doesNotMatch(nodes.get('exam_contract')?.label ?? '', /000[–-]999/u);
    assert.match(nodes.get('dataset_release')?.label ?? '', /opencompass/iu);
    assert.match(nodes.get('config_i')?.label ?? '', /AIME2025-I.*15.*test.*question.*answer/isu);
    assert.match(nodes.get('config_ii')?.label ?? '', /AIME2025-II.*15.*test.*question.*answer/isu);
    assert.match(nodes.get('release_structure')?.label ?? '', /2|two|两/u);
    assert.match(nodes.get('source_boundary')?.label ?? '', /merged|合并/iu);
    assert.match(nodes.get('source_boundary')?.label ?? '', /evaluator|评测/iu);
    assert.ok(edges.has('dataset_release->config_i:primary'));
    assert.ok(edges.has('dataset_release->config_ii:primary'));
    assert.ok(edges.has('config_i->release_structure:primary'));
    assert.ok(edges.has('config_ii->release_structure:primary'));
    assert.ok(edges.has('release_structure->source_boundary:optional'));
    assert.doesNotMatch(JSON.stringify(arch), /boxed|Avg@k|Mean@k|方框/iu);
  }
  assert.match(readDetail('AIME-25').metric_en, /not disclosed/iu);
});

test('preserves AIRS-Bench selection fidelity, task boundary, and three reported metrics', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AIRS-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('source')?.label ?? '', /PapersWithCode.*2020.*2025/isu);
    assert.match(nodes.get('eligibility')?.label ?? '', /train.*test|训练.*测试/isu);
    assert.match(nodes.get('manual_verification')?.label ?? '', /SOTA.*metric.*split|SOTA.*指标.*切分/isu);
    assert.match(nodes.get('candidates')?.label ?? '', /100.*85.*(?:papers.*datasets|论文.*数据集)/isu);
    assert.match(nodes.get('search')?.label ?? '', /12.*10,?000.*(?:anneal|退火).*GA/isu);
    assert.match(nodes.get('final_selection')?.label ?? '', /GA.*4.*7.*5.*4.*4e-3/isu);
    assert.match(nodes.get('validation')?.label ?? '', /0\.02.*95%.*(?:rank|排名)/isu);
    assert.match(nodes.get('task_files')?.label ?? '', /metadata.*project_description.*prepare.*evaluate_prepare.*evaluate/isu);
    assert.match(nodes.get('hidden_environment')?.label ?? '', /no baseline|无基线/iu);
    assert.match(nodes.get('hidden_environment')?.label ?? '', /SOTA.*hidden|隐藏.*SOTA/iu);
    assert.match(nodes.get('normalized')?.label ?? '', /invalid.*0|无效.*0/iu);
    assert.match(nodes.get('rating')?.label ?? '', /per-task|逐任务/iu);
    assert.match(nodes.get('rating')?.label ?? '', /SOTA.*opponent|SOTA.*对手/iu);
    for (const edge of [
      'eligibility->manual_verification:primary',
      'manual_verification->candidates:primary',
      'package->task_files:primary',
      'task_files->hidden_environment:primary',
      'raw_score->vsr:primary',
      'raw_score->normalized:primary',
      'raw_score->rating:primary',
      'vsr->report:primary',
      'normalized->report:primary',
      'rating->report:primary',
    ]) assert.ok(edges.has(edge), `${language}: ${edge}`);
    assert.doesNotMatch(nodes.get('rating')?.label ?? '', /seed-level|种子级/iu);
  }
});

test('models AInsteinBench conditional API supplementation and one shared expert gate', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AInsteinBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('project_selection')?.label ?? '', /acceptance|认可/iu);
    assert.match(nodes.get('project_selection')?.label ?? '', /maintenance|维护/iu);
    assert.match(nodes.get('crawl_all_prs')?.label ?? '', /all.*pull requests|全部.*PR/iu);
    assert.match(nodes.get('pr_filter')?.label ?? '', /scientific.*bugs|科学.*缺陷/iu);
    assert.match(nodes.get('pr_filter')?.label ?? '', /exclude.*(?:docs|refactor|large feature)|排除.*(?:文档|重构|大型功能)/iu);
    assert.match(nodes.get('f2p')?.label ?? '', /base.*pass.*test patch.*fail.*fix patch.*pass|基础.*通过.*测试补丁.*失败.*修复补丁.*通过/isu);
    assert.match(nodes.get('minimal_api')?.label ?? '', /conditional|条件/iu);
    assert.match(nodes.get('minimal_api')?.label ?? '', /test-used|测试使用/iu);
    assert.ok(edges.has('f2p->repo_candidate:primary'));
    assert.ok(edges.has('f2p->minimal_api:optional'));
    assert.ok(edges.has('minimal_api->repo_candidate:optional'));
    assert.match(nodes.get('et_modules')?.label ?? '', /Einstein Toolkit/iu);
    assert.match(nodes.get('et_modules')?.label ?? '', /other repos.*not disclosed|其他仓库.*未披露/iu);
    assert.match(nodes.get('simulation_tests')?.label ?? '', /any passing implementation|任意通过测试的实现/iu);
    assert.ok(edges.has('repo_candidate->issue_review:primary'));
    assert.ok(edges.has('synthetic_candidate->issue_review:primary'));
    assert.match(nodes.get('difficulty')?.label ?? '', /10.*PhD.*1.*5/isu);
    assert.match(nodes.get('test_audit')?.label ?? '', /under-coverage|覆盖不足/iu);
    assert.match(nodes.get('test_audit')?.label ?? '', /over-coverage|过度覆盖/iu);
    assert.match(nodes.get('release')?.label ?? '', /244.*6/isu);
    assert.match(nodes.get('analyses')?.label ?? '', /domain|领域/iu);
    assert.match(nodes.get('analyses')?.label ?? '', /localization|定位/iu);
    assert.match(nodes.get('analyses')?.label ?? '', /efficiency|效率/iu);
    assert.equal([...arch.nodes].some(node => /historical_expert|synthetic_expert/u.test(node.id)), false);
  }
});

test('pins every A8d review note to its primary-source boundary and exact revision', () => {
  const expected = {
    'AIME-24': [
      /^$/u,
      /MAA.*AIME/isu,
      /HuggingFaceH4\/aime_2024@2fe88a2f1091d5048c0f36abc874fb997b3dd99a/iu,
      /not disclosed/iu,
    ],
    'AIME-25': [
      /^$/u,
      /MAA.*AIME/isu,
      /opencompass\/AIME2025@a6ad95f611d72cf628a80b58bd0432ef6638f958/iu,
      /not disclosed/iu,
    ],
    'AIRS-Bench': [
      /2602\.06855v3/u,
      /§4.*§5.*Appendix A/isu,
      /facebookresearch\/airs-bench@18e4f1d501069cf7d7e2740d81c2ca748c56a6a1/iu,
    ],
    AInsteinBench: [
      /2512\.21373v1/u,
      /§3\.1.*§3\.5.*§4\.1.*Appendix A/isu,
      /ByteDance-Seed\/AInsteinBench@d9b1383e86c2ae43dcb3ddbcaf34c21ceb786cca/iu,
    ],
  };
  for (const [id, [paper, ...notes]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const note of notes) assert.match(detail.drawio_review_note, note, `${id} note`);
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A8d', () => {
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

test('strictly rebuilds and normalizes all eight A8d specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a8d-'));
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
        assert.ok(existsSync(join(tempRoot, `${id}.${language}.arch.json`)));
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
