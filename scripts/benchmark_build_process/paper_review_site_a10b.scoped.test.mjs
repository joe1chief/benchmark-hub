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
const benchmarkIds = ['CharXiv', 'CharacterEval', 'ChartMimic', 'ChartQA'];
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

function mermaidFromArch(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${String(node.label).replaceAll('\n', '<br/>')}"]`);
  }
  for (const edge of arch.edges) {
    const arrow = edge.type === 'data' ? '-.->' : '-->';
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10b packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual labels within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      for (const node of readArch(id, language).nodes) {
        const lines = String(node.label).split('\n');
        assert.ok(lines.length <= 5, `${id}.${language}.${node.id}: ${lines.length} lines`);
        for (const line of lines) {
          const visualUnits = [...line].reduce(
            (total, character) => total + (/^[\u0000-\u007f]$/u.test(character) ? 1 : 2),
            0,
          );
          assert.ok(
            visualUnits <= 34,
            `${id}.${language}.${node.id} [${visualUnits}]: ${line}`,
          );
        }
      }
    }
  }
});

test('preserves CharXiv selection thresholds, QA authorship, and official judge', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CharXiv', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('render')?.label ?? '', /1024\s*px/iu);
    assert.match(nodes.get('siglip')?.label ?? '', /SigLIP.*0\.65/isu);
    assert.match(nodes.get('quality')?.label ?? '', /0\.95.*2,?323/isu);
    assert.ok(edges.has('quality->descriptive:primary'));
    assert.ok(edges.has('quality->reasoning:primary'));
    assert.match(nodes.get('descriptive')?.label ?? '', /19.*4 per chart|19.*每图 4/isu);
    assert.match(nodes.get('answerability')?.label ?? '', /3 answerable.*1 unanswerable|3 道可答.*1 道不可答/isu);
    assert.match(nodes.get('reasoning')?.label ?? '', /10.*GPT-4V.*choose.*modify.*write|10.*GPT-4V.*选择.*修改.*自写/isu);
    assert.match(
      nodes.get('reasoning_set')?.label ?? '',
      /text.*chart.*general.*number.*chart.*general|图内文本.*通用文本.*图内数值.*通用数值/isu,
    );
    assert.match(nodes.get('release')?.label ?? '', /1,?000.*(?:answers public|public answers).*1,?323.*private|1,?000.*答案公开.*1,?323.*私有/isu);
    assert.match(nodes.get('judge')?.label ?? '', /gpt-4o-2024-05-13.*binary|gpt-4o-2024-05-13.*二元/isu);
    assert.doesNotMatch(nodes.get('judge')?.label ?? '', /98\.5|400/iu);
  }
});

test('keeps CharacterEval construction, paper counts, and evaluator roles exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CharacterEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('principles')?.label ?? '', /fidelity.*diversity.*multi-turn.*human|忠实.*多样.*多轮.*人工/isu);
    assert.match(nodes.get('filter')?.label ?? '', /ABAB.*third.*(?:more than|>)\s*5 turns|ABAB.*第三.*超过 5 轮/isu);
    assert.ok(edges.has('human_qc->profiles:primary'));
    assert.ok(edges.has('profiles->release:primary'));
    assert.equal(edges.has('human_qc->release:primary'), false);
    assert.match(nodes.get('profiles')?.label ?? '', /Baidu Baike|百度百科/iu);
    assert.doesNotMatch(nodes.get('profiles')?.label ?? '', /Personality Database|MBTI/iu);
    assert.match(nodes.get('mbti_labels')?.label ?? '', /Personality Database.*54.*MBTI|Personality Database.*54 个.*MBTI/isu);
    assert.ok(edges.has('mbti_labels->personality:data'));
    assert.equal(edges.has('mbti_labels->release:primary'), false);
    assert.match(nodes.get('release')?.label ?? '', /1,?785.*11,?376.*6,?811.*4,?564/isu);
    assert.match(nodes.get('human_labels')?.label ?? '', /12 annotators.*sparse.*five-point|12 位标注员.*稀疏.*五分/isu);
    assert.match(nodes.get('rm')?.label ?? '', /Baichuan2-13B-base.*12 subjective|Baichuan2-13B-base.*12 项主观/isu);
    assert.match(nodes.get('personality')?.label ?? '', /MBTI.*54|54.*MBTI/isu);
    assert.match(nodes.get('report')?.label ?? '', /12 subjective.*1 MBTI.*13|12 项主观.*1 项 MBTI.*13/isu);
  }
});

test('uses the published ChartMimic v2 construction instead of the superseded v1 scale', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ChartMimic', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('general_filter')?.label ?? '', /174,?100.*Matplotlib.*15,?800/isu);
    assert.match(nodes.get('experts')?.label ?? '', /15,?800.*1,?295.*3\/5.*279/isu);
    assert.match(nodes.get('prototypes')?.label ?? '', /600 prototype|600 张原型/iu);
    assert.match(nodes.get('annotators')?.label ?? '', /6\+ years.*Python 3\.9\.0.*matplotlib 3\.8\.4|6 年以上.*Python 3\.9\.0.*matplotlib 3\.8\.4/isu);
    assert.ok(edges.has('annotators->direct:primary'));
    assert.ok(edges.has('annotators->customized:primary'));
    assert.match(nodes.get('direct')?.label ?? '', /600.*(?:seed|种子)/isu);
    assert.match(nodes.get('customized')?.label ?? '', /600.*(?:seed|种子)/isu);
    assert.match(nodes.get('augmentation')?.label ?? '', /3 additional.*4,?800|额外.*3.*4,?800/isu);
    assert.match(nodes.get('release')?.label ?? '', /2,?400.*2,?400.*201.*3,?600.*1,?200/isu);
    assert.match(nodes.get('low_level')?.label ?? '', /code tracer.*F1.*text.*layout.*type.*color|代码追踪.*F1.*文本.*布局.*类型.*颜色/isu);
    assert.match(nodes.get('overall')?.label ?? '', /average.*high.*low.*execution fail.*zero|高层.*低层.*平均.*执行失败.*零/isu);
    assert.match(
      nodes.get('validation')?.label ?? '',
      /300.*Direct.*4 prompting methods.*1,?200 outputs.*3 evaluators.*Pearson|300.*Direct.*4 种提示方法.*1,?200.*每图 3 人.*Pearson/isu,
    );
    assert.doesNotMatch(nodes.get('validation')?.label ?? '', /1,?200.*Direct (?:charts|图)/iu);
    assert.doesNotMatch(nodes.get('release')?.label ?? '', /1,?000|191/iu);
  }
});

test('distinguishes ChartQA source artifacts, AMT verification, and one hybrid metric', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ChartQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('artifacts')?.label ?? '', /Pew.*image only.*other 3.*table.*SVG|Pew.*仅图像.*其余 3.*表格.*SVG/isu);
    assert.match(nodes.get('human_author')?.label ?? '', /95%.*5,?000.*pretest|95%.*5,?000.*预试/isu);
    assert.match(nodes.get('human_author')?.label ?? '', /2 prior.*2 new|2 个既有.*2 个新/isu);
    assert.match(
      nodes.get('human_verify')?.label ?? '',
      /independent.*exact match.*61\.04%.*mismatch.*manual|独立.*精确匹配.*61\.04%.*分歧.*人工/isu,
    );
    assert.match(nodes.get('human_audit')?.label ?? '', /audit.*500.*78\.55%|审计.*500.*78\.55%/isu);
    assert.ok(edges.has('human_verify->human_set:primary'));
    assert.ok(edges.has('human_verify->human_audit:data'));
    assert.equal(edges.has('human_audit->human_set:primary'), false);
    assert.match(nodes.get('human_set')?.label ?? '', /9,?608.*7,?398.*960.*1,?250/isu);
    assert.match(nodes.get('t5')?.label ?? '', /two SQuAD.*T5|两个.*SQuAD.*T5/isu);
    assert.match(nodes.get('machine_filter')?.label ?? '', /answer.*table.*1,?250.*86\.64%|答案.*表.*1,?250.*86\.64%/isu);
    assert.match(nodes.get('machine_set')?.label ?? '', /23,?111.*20,?901.*960.*1,?250/isu);
    assert.ok(edges.has('answer->numeric:primary'));
    assert.ok(edges.has('answer->text:primary'));
    assert.match(nodes.get('numeric')?.label ?? '', /within 5%|5%.*以内/iu);
    assert.match(nodes.get('text')?.label ?? '', /exact match|精确匹配/iu);
    assert.match(nodes.get('report')?.label ?? '', /single.*relaxed accuracy|单一.*宽松准确率/isu);
    assert.doesNotMatch(nodes.get('report')?.label ?? '', /accuracy and relaxed accuracy|准确率与宽松准确率/iu);
  }
});

test('pins paper versions and official repository snapshots in detail records', () => {
  const expected = {
    CharXiv: [
      /2406\.18521v1/u,
      /§§3\.1.*3\.3/isu,
      /7ebe88f78dee387691551f071abcb2b9e1a8025b/u,
      /98\.5.*not.*paper|论文.*不.*98\.5/isu,
    ],
    CharacterEval: [
      /2024\.acl-long\.638/u,
      /§§4.*6\.2/isu,
      /c3d44a6fc1790cc8c4b2fd7c01f0c72930655e0c/u,
      /11,376.*6,811.*4,564|11,376.*6,811.*4,564/isu,
      /23,020/isu,
    ],
    ChartMimic: [
      /2406\.09961v2/u,
      /§§2\.2.*2\.4.*Appendix B\.2/isu,
      /92ba5b97b908c607f630c3ffbb5043de9de62b76/u,
      /v1.*1,000.*191.*superseded|v1.*1,000.*191.*已取代/isu,
    ],
    ChartQA: [
      /2203\.10244v1/u,
      /§§3\.1.*3\.2.*5\.1/isu,
      /044eabfc306abfe9340c5741f0093aefc5973d06/u,
      /Pew.*image-only.*manual.*annotations|Pew.*仅图像.*人工.*标注/isu,
    ],
  };
  for (const [id, [paper, ...notes]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const pattern of notes) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }
});

test('keeps every A10b detail fallback synchronized with reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const fallback = detail[`flowchart_${language}`];
      assert.equal(fallback, mermaidFromArch(arch), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10b', () => {
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

test('strictly rebuilds and normalizes all eight A10b specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10b-'));
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
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
