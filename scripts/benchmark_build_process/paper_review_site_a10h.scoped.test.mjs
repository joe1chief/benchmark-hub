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
const benchmarkIds = ['CountBench', 'CounterFactQA', 'CraftBench', 'CraneMath'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);

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
    lines.push(`    ${edge.from} ${edge.type === 'primary' ? '-->' : '-.->'} ${edge.to}`);
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

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10h packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual A10h labels inside reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 48], ['zh', 30]]) {
      for (const node of readArch(id, language).nodes) {
        const lines = String(node.label).split('\n');
        assert.ok(lines.length <= 5, `${id}.${language}.${node.id}: ${lines.length} lines`);
        for (const line of lines) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('keeps CountBench curation, release, zero-shot inference, and formulas exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CountBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2302\.12066v1.*2c573a8.*540/isu);
    assert.match(nodes.get('laion')?.label ?? '', /LAION-400M/isu);
    assert.match(
      nodes.get('number_filter')?.label ?? '',
      /spelled.*two.*ten.*non-spelled.*higher than ten|英文拼写.*two.*ten.*非拼写.*大于 ten/isu,
    );
    assert.match(
      nodes.get('detector')?.label ?? '',
      /off-the-shelf.*detector.*most prevalent|maximally-detected|现成.*检测器.*数量最多/isu,
    );
    assert.match(
      nodes.get('candidate')?.label ?? '',
      /^(?=[\s\S]*158K)(?=[\s\S]*two)(?=[\s\S]*100)(?=[\s\S]*ten)/iu,
    );
    assert.match(nodes.get('balance')?.label ?? '', /100.*200.*per number|每个数量.*100.*200/isu);
    assert.match(nodes.get('verify')?.label ?? '', /manual.*clearly visible|人工.*清晰可见/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /60.*9.*540.*test.*no overlap|60.*9.*540.*测试.*无重叠/isu);
    assert.match(nodes.get('captions')?.label ?? '', /nine.*one correct.*eight counterfactual|九.*一条正确.*八条反事实/isu);
    assert.match(nodes.get('similarity')?.label ?? '', /CLIP.*BASIC.*similarity.*highest|CLIP.*BASIC.*相似度.*最高/isu);
    assert.match(
      nodes.get('metrics')?.label ?? '',
      /accuracy.*predicted.*true.*mean.*absolute.*predicted.*true|准确率.*预测.*真实.*平均.*绝对.*预测.*真实/isu,
    );
    assert.ok(edges.has('laion->number_filter:primary'));
    assert.ok(edges.has('number_filter->detector:primary'));
    assert.ok(edges.has('detector->candidate:primary'));
    assert.ok(edges.has('balance->verify:primary'));
    assert.ok(edges.has('verify->dataset:primary'));
    assert.ok(edges.has('dataset->captions:primary'));
    assert.ok(edges.has('captions->similarity:primary'));
    assert.ok(edges.has('similarity->metrics:primary'));
  }
});

test('keeps CounterFactQA strictly within the Qwen3 v1 disclosure boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CounterFactQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2505\.09388v1.*Table 22|2505\.09388v1.*表 22/isu);
    assert.match(
      nodes.get('hidden_set')?.label ?? '',
      /in-house.*counterfactual.*non-factual.*hallucinat|内部.*反事实.*非事实.*幻觉/isu,
    );
    assert.match(
      nodes.get('dataset_boundary')?.label ?? '',
      /not released.*source.*count.*split.*prompt|未发布.*来源.*题数.*划分.*提示/isu,
    );
    assert.match(nodes.get('stage2')?.label ?? '', /Stage 2.*Thinking.*50\.4|阶段二.*思考.*50\.4/isu);
    assert.match(nodes.get('stage3')?.label ?? '', /Stage 3.*Thinking.*61\.3.*Non-Thinking.*64\.3|阶段三.*思考.*61\.3.*非思考.*64\.3/isu);
    assert.match(nodes.get('stage4')?.label ?? '', /Stage 4.*Thinking.*68\.1.*Non-Thinking.*66\.4|阶段四.*思考.*68\.1.*非思考.*66\.4/isu);
    assert.match(
      nodes.get('table')?.label ?? '',
      /raw percentage.*not.*accuracy|原始百分数值.*(?:不是|未标注).*准确率/isu,
    );
    assert.match(nodes.get('score_boundary')?.label ?? '', /judge.*rubric.*unit.*formula.*undisclosed|裁判.*量表.*单位.*公式.*未披露/isu);
    assert.ok(edges.has('hidden_set->stage2:data'));
    assert.ok(edges.has('hidden_set->stage3:data'));
    assert.ok(edges.has('hidden_set->stage4:data'));
    assert.ok(edges.has('stage2->table:primary'));
    assert.ok(edges.has('stage3->table:primary'));
    assert.ok(edges.has('stage4->table:primary'));
    assert.equal(edges.has('dataset_boundary->stage2:primary'), false);
    assert.equal(edges.has('score_boundary->table:primary'), false);
  }
});

test('pins CountBench and CounterFactQA paper and official-source boundaries', () => {
  const count = readDetail('CountBench');
  assert.match(count.paper_url, /2302\.12066v1/u);
  assert.match(count.arxiv_pdf_url, /2302\.12066v1/u);
  assert.match(
    count.drawio_review_note,
    /§4.*§5\.1.*2c573a8d8fa0b6c2ea5cfdd3f914a6b0ed5dd88a.*CountBench\.json.*540.*no.*dedup/isu,
  );

  const counter = readDetail('CounterFactQA');
  assert.match(counter.paper_url, /2505\.09388v1/u);
  assert.match(counter.arxiv_pdf_url, /2505\.09388v1/u);
  assert.match(
    counter.drawio_review_note,
    /Table 22.*7a2f61ffc7a20d47efcd2bf97f6f2bf52729042e.*no public dataset.*50\.4.*61\.3.*64\.3.*68\.1.*66\.4.*no.*formula/isu,
  );
  assert.doesNotMatch(
    [counter.metric, counter.metric_en, counter.drawio_review_note].join('\n'),
    /CounterFactQA Accuracy|CounterFactQA 准确率/iu,
  );
});

test('keeps CraftBench as a released AWM scenario, not a standalone benchmark', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CraftBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(
      nodes.get('evidence')?.label ?? '',
      /2602\.10090v3.*85e322f.*dde80a0/isu,
    );
    assert.match(nodes.get('seeds')?.label ?? '', /100.*domain|100.*域名/isu);
    assert.match(
      nodes.get('scenario_filter')?.label ?? '',
      /CRUD.*embedding.*0\.85.*cap|CRUD.*嵌入.*0\.85.*上限/isu,
    );
    assert.match(nodes.get('collection')?.label ?? '', /1,000.*scenario|1,000.*场景/isu);
    assert.match(
      nodes.get('craft_record')?.label ?? '',
      /CraftBench.*Custom Manufacturing Job Tracker.*manufacturing.*execution.*system.*1|CraftBench.*定制制造作业跟踪器.*manufacturing.*execution.*system.*1/isu,
    );
    assert.match(nodes.get('tasks')?.label ?? '', /10.*API.*post-auth.*10,000|10.*API.*登录后.*10,000/isu);
    assert.match(nodes.get('sqlite')?.label ?? '', /SQLite.*18.*table.*114.*insert|SQLite.*18.*表.*114.*插入/isu);
    assert.match(
      nodes.get('interface')?.label ?? '',
      /SQLAlchemy.*Pydantic.*FastAPI.*MCP.*50.*endpoint|SQLAlchemy.*Pydantic.*FastAPI.*MCP.*50.*端点/isu,
    );
    assert.match(nodes.get('verifier')?.label ?? '', /before.*after.*database.*criteria|前后.*数据库.*标准/isu);
    assert.match(nodes.get('self_correct')?.label ?? '', /traceback.*200.*500.*5|traceback.*200.*500.*5/isu);
    assert.match(nodes.get('tolerance')?.label ?? '', /schema.*data.*10%.*startup.*0%|模式.*数据.*10%.*启动.*0%/isu);
    assert.match(
      nodes.get('boundary')?.label ?? '',
      /no standalone.*split.*prompt.*harness.*metric|无独立.*划分.*提示.*评测程序.*指标/isu,
    );
    assert.match(
      nodes.get('awm_reward')?.label ?? '',
      /AWM.*Completed.*1\.0.*Partial.*0\.1.*Otherwise.*0\.0.*Format.*−?1.*Stop|AWM.*完成.*1\.0.*部分.*0\.1.*其他.*0\.0.*格式.*−?1.*终止/isu,
    );
    assert.ok(edges.has('seeds->scenario_filter:primary'));
    assert.ok(edges.has('scenario_filter->collection:primary'));
    assert.ok(edges.has('collection->craft_record:primary'));
    assert.ok(edges.has('craft_record->tasks:primary'));
    assert.ok(edges.has('tasks->sqlite:primary'));
    assert.ok(edges.has('sqlite->interface:primary'));
    assert.ok(edges.has('interface->verifier:primary'));
    assert.ok(edges.has('verifier->self_correct:primary'));
    assert.ok(edges.has('self_correct->tolerance:primary'));
    assert.ok(edges.has('tolerance->boundary:primary'));
    assert.ok(edges.has('verifier->awm_reward:data'));
  }

  const detail = readDetail('CraftBench');
  assert.match(detail.paper_url, /2602\.10090v3/u);
  assert.match(detail.arxiv_pdf_url, /2602\.10090v3/u);
  assert.match(
    detail.drawio_review_note,
    /§3\.1.*§3\.2.*§3\.3.*Table 15.*85e322f69279e3b3325b7377ec3bab788514e9cb.*dde80a0283fe781bdc51656bce57063dc5650213.*10 tasks.*18 tables.*114.*50 endpoints.*no standalone.*metric/isu,
  );
});

test('keeps CraneMath as a train-only rewrite corpus with separate pool and ablation statistics', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CraneMath', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(
      nodes.get('evidence')?.label ?? '',
      /2512\.13961v2.*1a9daced.*091589c/isu,
    );
    assert.match(
      nodes.get('source')?.label ?? '',
      /FineMath4\+.*6,699,493.*train|FineMath4\+.*6,699,493.*训练/isu,
    );
    assert.match(nodes.get('rewrite')?.label ?? '', /SwallowMath.*Qwen3-32B.*one rewrite|SwallowMath.*Qwen3-32B.*一次重写/isu);
    assert.match(
      nodes.get('corpus')?.label ?? '',
      /generation failures.*6,553,181.*5\.625B.*train-only|生成失败.*6,553,181.*5\.625B.*仅训练/isu,
    );
    assert.match(
      nodes.get('construction_boundary')?.label ?? '',
      /no dedicated.*manual.*dedup.*split.*verifier|无专属.*人工.*去重.*划分.*验证器/isu,
    );
    assert.match(
      nodes.get('pool')?.label ?? '',
      /^(?=[\s\S]*5\.62B)(?=[\s\S]*6\.55M)(?=[\s\S]*(?:pool|源池))/iu,
    );
    assert.match(nodes.get('mix')?.label ?? '', /100B.*5\.62B.*5\.63%.*7\.24M|100B.*5\.62B.*5\.63%.*7\.24M/isu);
    assert.match(nodes.get('anneal')?.label ?? '', /6T.*50%.*50%|6T.*50%.*50%/isu);
    assert.match(
      nodes.get('compare')?.label ?? '',
      /baseline.*FineMath4\+.*SwallowMath.*CraneMath.*2×.*original|基线.*FineMath4\+.*SwallowMath.*CraneMath.*2×.*原始.*文档/isu,
    );
    assert.match(nodes.get('raw_lift')?.label ?? '', /MATH.*18\.5.*GSM8K.*27\.4/isu);
    assert.match(
      nodes.get('normalized')?.label ?? '',
      /anneal.*pre-anneal.*target tokens.*4\.34B.*4\.26.*6\.32|退火.*退火前.*目标 tokens.*4\.34B.*4\.26.*6\.32/isu,
    );
    assert.match(
      nodes.get('boundary')?.label ?? '',
      /training data.*not.*benchmark.*accuracy|训练数据.*不是.*基准.*准确率/isu,
    );
    assert.ok(edges.has('source->rewrite:primary'));
    assert.ok(edges.has('rewrite->corpus:primary'));
    assert.ok(edges.has('corpus->construction_boundary:data'));
    assert.ok(edges.has('corpus->pool:primary'));
    assert.ok(edges.has('pool->mix:primary'));
    assert.ok(edges.has('pool->anneal:primary'));
    assert.ok(edges.has('anneal->compare:primary'));
    assert.ok(edges.has('compare->raw_lift:primary'));
    assert.ok(edges.has('raw_lift->normalized:data'));
    assert.ok(edges.has('normalized->boundary:primary'));
  }

  const detail = readDetail('CraneMath');
  assert.match(detail.paper_url, /2512\.13961v2/u);
  assert.match(detail.arxiv_pdf_url, /2512\.13961v2/u);
  assert.match(
    detail.drawio_review_note,
    /§3\.5.*§A\.3\.1.*1a9daced81670e0fa768e47fbed32af6694a1865.*091589c58ab6acc180d71017ecea8201776f05b2.*6,699,493.*6,553,181.*5\.625B.*no.*dedup.*18\.5.*27\.4.*4\.26.*6\.32.*not.*accuracy/isu,
  );
});

test('keeps every A10h fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10h', () => {
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

test('strictly rebuilds and normalizes all eight A10h specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10h-'));
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
