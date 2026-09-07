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
  'All-Angles',
  'AlpacaEval_2.0',
  'Arena-Hard',
  'Arena-Hard-Auto',
];
const arenaIds = ['Arena-Hard', 'Arena-Hard-Auto'];
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

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

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
    const arrow = mermaidArrow(edge);
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

test('keeps all four A9b packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps the two Arena pages on one paper-v2 construction plus pinned-v0.1 evaluator topology', () => {
  const expected = topology(readArch('Arena-Hard', 'en'));
  for (const id of arenaIds) {
    for (const language of ['en', 'zh']) {
      assert.deepEqual(topology(readArch(id, language)), expected, `${id}.${language}`);
    }
  }
});

test('keeps bilingual A9b labels inside reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 54], ['zh', 40]]) {
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

test('models All-Angles construction QC before separate model and human evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('All-Angles', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('select_scenes')?.label ?? '', /83.*7.*90/su);
    assert.match(nodes.get('view_set')?.label ?? '', /4[–-]5.*796\s*[×x]\s*448/isu);
    assert.match(nodes.get('task_design')?.label ?? '', /(?:six|六).*count|计数.*属性.*距离.*方向.*操作.*姿态/isu);
    assert.match(nodes.get('mllm_questions')?.label ?? '', /GPT-4o.*(?:five|五).*3|GPT-4o.*五.*三/isu);
    assert.match(nodes.get('camera_template')?.label ?? '', /camera.*template.*one|相机.*模板.*一/isu);
    assert.match(nodes.get('view_policy')?.label ?? '', /all.*count.*camera.*two.*random|计数.*姿态.*全部.*随机.*两/isu);
    assert.match(nodes.get('first_review')?.label ?? '', /8.*STEM.*PhD|8.*STEM.*博士/isu);
    assert.match(nodes.get('cross_check')?.label ?? '', /every.*(?:another|other).*group|每条.*另一.*讨论/isu);
    assert.match(nodes.get('random_audit')?.label ?? '', /periodic.*random|定期.*随机/iu);
    assert.match(nodes.get('mcq_contract')?.label ?? '', /three.*one correct|三.*(?:唯一|一个正确)/isu);
    assert.match(nodes.get('paired')?.label ?? '', /rephrase.*orientation.*views|改写.*方向.*视角/isu);
    assert.match(nodes.get('final_qc')?.label ?? '', /85\.3%.*excluding counting|85\.3%.*不含计数/isu);
    assert.match(nodes.get('release')?.label ?? '', /2,?132.*90/isu);
    assert.match(nodes.get('eval_contract')?.label ?? '', /VLMEvalKit.*(?:greedy|贪心).*(?:temperature|温度).*0/isu);
    assert.match(nodes.get('answer_parser')?.label ?? '', /Qwen2\.5-32B.*(?:option|选项)/isu);
    assert.match(nodes.get('accuracy')?.label ?? '', /accuracy|准确率/iu);
    assert.match(nodes.get('consistency')?.label ?? '', /CC.*WW.*IC/su);
    assert.match(nodes.get('human_subset')?.label ?? '', /250.*(?:exclude paired|排除配对)/isu);
    for (const edge of [
      'source_pools->select_scenes:primary',
      'select_scenes->view_set:primary',
      'task_design->mllm_questions:primary',
      'task_design->camera_template:primary',
      'first_review->cross_check:primary',
      'cross_check->random_audit:primary',
      'random_audit->mcq_contract:primary',
      'final_qc->release:primary',
      'release->eval_contract:secondary',
      'eval_contract->answer_parser:secondary',
      'answer_parser->accuracy:secondary',
      'answer_parser->consistency:secondary',
      'release->human_subset:optional',
    ]) assert.ok(edges.has(edge), `${language}: ${edge}`);
  }
});

test('restores AlpacaEval candidate direction before computing weighted and length-controlled win rates', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AlpacaEval_2.0', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('instructions')?.label ?? '', /805/iu);
    assert.match(nodes.get('baseline')?.label ?? '', /gpt-4-1106-preview/iu);
    assert.match(nodes.get('evaluator')?.label ?? '', /weighted_alpaca_eval_gpt4_turbo.*(?:random.*only.*before.*judg|仅.*送审前.*随机).*single.*logprob|weighted_alpaca_eval_gpt4_turbo.*仅.*送审前.*随机.*单.*logprob/isu);
    assert.match(nodes.get('restore_direction')?.label ?? '', /restore.*candidate.*baseline.*3\s*[−-]\s*preference.*undo.*output_1.*output_2|恢复.*候选.*基线.*3\s*[−-]\s*偏好.*撤销.*output_1.*output_2/isu);
    assert.match(nodes.get('preferences')?.label ?? '', /baseline.*output_1.*candidate.*output_2.*candidate.*win.*preference\s*[−-]\s*1|基线.*output_1.*候选.*output_2.*候选.*胜.*偏好.*1/isu);
    assert.match(nodes.get('raw_weighted')?.label ?? '', /weighted.*win rate.*mean.*preference\s*[−-]\s*1.*candidate|加权.*胜率.*均值.*偏好.*1.*候选/isu);
    assert.match(nodes.get('glm')?.label ?? '', /antisymmetric|反对称/iu);
    assert.match(nodes.get('glm')?.label ?? '', /identity.*length.*difficulty|身份.*长度.*难度/isu);
    assert.match(nodes.get('paper_l2')?.label ?? '', /paper v2.*5-fold.*L2|论文 v2.*五折.*L2/isu);
    assert.match(nodes.get('official_l1')?.label ?? '', /0\.6\.6.*cd543a149df89434.*L1.*liblinear/isu);
    assert.match(nodes.get('official_l1')?.label ?? '', /5-fold|五折/iu);
    assert.match(nodes.get('lc_counterfactual')?.label ?? '', /length.*(?:zero|0)|长度.*(?:置零|0)/iu);
    assert.match(nodes.get('semantics')?.label ?? '', /candidate.*50%.*swap.*restor|候选.*50%.*恢复.*交换/isu);
    assert.match(nodes.get('validation')?.label ?? '', /25%.*10%.*\.94.*\.98/su);
    assert.ok(edges.has('evaluator->restore_direction:primary'));
    assert.ok(edges.has('restore_direction->preferences:primary'));
    assert.ok(edges.has('preferences->raw_weighted:primary'));
    assert.ok(edges.has('preferences->glm:primary'));
    assert.ok(edges.has('glm->paper_l2:optional'));
    assert.ok(edges.has('glm->official_l1:optional'));
    assert.ok(edges.has('glm->lc_counterfactual:primary'));
    assert.equal(edges.has('evaluator->preferences:primary'), false);
    assert.equal(edges.has('paper_l2->official_l1:primary'), false);
    assert.doesNotMatch(
      arch.nodes.map(node => node.label).join('\n'),
      /preserve randomized A\/B order|保留随机 A\/B 顺序/iu,
    );
  }
  const detail = readDetail('AlpacaEval_2.0');
  assert.match(detail.metric_en, /Weighted Win Rate.*LC Win Rate/iu);
  assert.match(detail.build_method_en, /random.*only.*before.*judg.*3\s*[−-]\s*preference.*undo.*column/isu);
  for (const fallback of [detail.mermaid_flowchart, detail.flowchart_en]) {
    assert.match(fallback, /random.*before.*judg.*restore.*3\s*[−-]\s*preference.*candidate.*preference\s*[−-]\s*1/isu);
    assert.doesNotMatch(fallback, /preserve randomized A\/B order/iu);
  }
  assert.match(detail.flowchart_zh, /送审前.*随机.*恢复.*3\s*[−-]\s*偏好.*候选.*偏好.*1/isu);
  assert.equal(/Chain-of-Thought|思维链/iu.test(`${detail.eval_feature_en} ${detail.eval_feature}`), false);
  assert.equal(detail.language_en, 'English');
});

test('carries paper-v2 Arena construction through post-sampling safety cleanup and the pinned-v0.1 evaluator', () => {
  for (const id of arenaIds) {
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const nodes = nodeMap(arch);
      const edges = edgeMap(arch);
      assert.match(nodes.get('source')?.label ?? '', /200,?000|20\s*万/iu);
      assert.match(nodes.get('cleanup')?.label ?? '', /dedup.*single-turn.*English|去重.*单轮.*英文/isu);
      assert.match(nodes.get('topics')?.label ?? '', /text-embedding-3-small.*UMAP.*HDBSCAN.*4,?000.*distinct topics.*summar.*nam.*LLM|text-embedding-3-small.*UMAP.*HDBSCAN.*4,?000.*不同主题.*LLM.*总结.*命名/isu);
      assert.doesNotMatch(nodes.get('topics')?.label ?? '', /\bover\b|超过|GPT-4-Turbo/iu);
      assert.match(nodes.get('quality')?.label ?? '', /GPT-4-Turbo.*(?:seven|七).*0[–-]7/isu);
      assert.doesNotMatch(nodes.get('quality')?.label ?? '', /GPT-3\.5/iu);
      assert.match(nodes.get('v2_gate')?.label ?? '', /prompt.*(?:score)?.*[≥>=]\s*6.*cluster.*(?:mean)?.*[≥>=]\s*5|提示.*[≥>=]\s*6.*(?:簇|主题).*均.*[≥>=]\s*5/isu);
      assert.match(nodes.get('cluster_pool')?.label ?? '', /more than 500 clusters|超过\s*500\s*个?簇/iu);
      assert.match(nodes.get('sample')?.label ?? '', /random.*250.*cluster.*2.*500|随机.*250.*簇.*2.*500/isu);
      assert.match(nodes.get('safety_cleanup')?.label ?? '', /PII.*offensive.*after|采样后.*PII.*冒犯/isu);
      assert.match(nodes.get('release')?.label ?? '', /Arena-Hard-Auto-v0\.1.*500/isu);
      assert.match(nodes.get('responses')?.label ?? '', /gpt-4-0314/iu);
      assert.match(nodes.get('two_games')?.label ?? '', /swap.*A\/B.*1,?000|交换.*A\/B.*1,?000/isu);
      assert.match(nodes.get('judge_prompt')?.label ?? '', /gpt-4-1106-preview.*T\s*=\s*0.*4,?096/isu);
      assert.match(nodes.get('judge_prompt')?.label ?? '', /own answer|自己的答案/iu);
      assert.match(nodes.get('raw_judgment')?.label ?? '', /A>>B.*A>B.*A=B.*B>A.*B>>A/su);
      assert.match(nodes.get('parser')?.label ?? '', /no label.*continu.*2|无标签.*continu.*2/isu);
      assert.match(nodes.get('parser')?.label ?? '', /single.*repeated same.*accept|单一.*重复同标签.*接受/isu);
      assert.match(nodes.get('parser')?.label ?? '', /conflicting.*invalid.*no retry|冲突.*无效.*不重试/isu);
      assert.match(nodes.get('normalized_battles')?.label ?? '', /strong.*3.*slight.*1.*tie|明显.*3.*轻微.*1.*平局/isu);
      assert.match(nodes.get('normalized_battles')?.label ?? '', /second.*position|第二局.*位置/iu);
      assert.match(nodes.get('bt_elo')?.label ?? '', /Bradley-Terry.*Elo.*logistic|Bradley-Terry.*Elo.*逻辑/isu);
      assert.match(nodes.get('bt_elo')?.label ?? '', /gpt-4-0314.*1,?000/iu);
      assert.match(nodes.get('baseline_winrate')?.label ?? '', /win rate.*gpt-4-0314|相对.*(?:胜率.*gpt-4-0314|gpt-4-0314.*胜率)/isu);
      assert.match(nodes.get('bootstrap')?.label ?? '', /100.*2\.5.*97\.5.*95%/su);
      for (const edge of [
        'source->cleanup:primary',
        'cleanup->topics:primary',
        'topics->quality:primary',
        'quality->v2_gate:primary',
        'v2_gate->cluster_pool:primary',
        'cluster_pool->sample:primary',
        'sample->safety_cleanup:primary',
        'safety_cleanup->release:primary',
        'release->responses:primary',
        'responses->two_games:primary',
        'two_games->judge_prompt:primary',
        'judge_prompt->raw_judgment:primary',
        'raw_judgment->parser:primary',
        'parser->normalized_battles:primary',
        'normalized_battles->bt_elo:primary',
        'bt_elo->baseline_winrate:primary',
        'baseline_winrate->bootstrap:primary',
        'bootstrap->report:primary',
        'v2_gate->version_boundary:optional',
      ]) assert.ok(edges.has(edge), `${id}.${language}: ${edge}`);
      assert.equal(edges.has('sample->release:primary'), false, `${id}.${language}: safety cleanup must follow sampling`);
      const versionBoundary = nodes.get('version_boundary')?.label ?? '';
      assert.match(versionBoundary, /April blog.*(?:mean|均分).*6/isu);
      assert.match(versionBoundary, /(?:v1|repo|仓库).*GPT-3\.5/isu);
      assert.match(versionBoundary, /gpt-4o-mini/iu);
      assert.match(versionBoundary, /not.*paper-v2.*main|非.*论文 v2.*主链/isu);
      const labels = arch.nodes
        .filter(node => node.id !== 'version_boundary')
        .map(node => node.label)
        .join('\n');
      assert.doesNotMatch(labels, /85\.6%|GPT-3\.5|cluster mean\s*[≥>=]\s*6|(?:簇|主题)均分\s*[≥>=]\s*6|GPT-4\.1|Gemini-2\.5|style control|风格控制/iu);
    }
    const detail = readDetail(id);
    assert.match(detail.build_method_en, /4,?000 distinct topics.*summar.*named.*LLM/isu);
    assert.doesNotMatch(detail.build_method_en, /\bover\s+4,?000\b/iu);
    for (const fallback of [detail.mermaid_flowchart, detail.flowchart_en]) {
      assert.match(fallback, /4,?000 distinct topics.*summar.*named.*LLM/isu);
      assert.doesNotMatch(fallback, /\bover\s+4,?000\b|4,?000[^\n]*GPT-4-Turbo/iu);
      assert.match(fallback, /no label.*continu.*2.*single.*repeated same.*accept.*conflicting.*invalid.*no retry/isu);
    }
    assert.match(detail.flowchart_zh, /4,?000.*不同主题.*LLM.*总结.*命名/isu);
    assert.match(detail.flowchart_zh, /无标签.*continu.*2.*单一.*重复同标签.*接受.*冲突.*无效.*不重试/isu);
    assert.match(detail.drawio_review_note, /gpt-4o-mini.*version evidence|gpt-4o-mini.*版本证据/isu);
    assert.match(detail.drawio_review_note, /no label.*continu.*2.*repeated same.*accept.*conflicting.*invalid.*no retry/isu);
  }
  for (const language of ['en', 'zh']) {
    assert.match(nodeMap(readArch('Arena-Hard', language)).get('release')?.label ?? '', /same.*release.*no separate|同一.*发布.*并非独立/isu);
  }
});

test('pins every A9b detail record to the reviewed paper and implementation boundary', () => {
  const expected = {
    'All-Angles': [
      /2504\.15280v2/u,
      /§7\.3.*cross-check.*random|§7\.3.*交叉复核.*随机/isu,
      /VLMEvalKit.*Qwen2\.5-32B/isu,
      /danielchyeh\.github\.io\/All-Angles-Bench/iu,
    ],
    'AlpacaEval_2.0': [
      /2404\.04475v2/u,
      /alpaca_eval.*0\.6\.6/isu,
      /cd543a149df89434d8a54582c0151c0b945c3d20/u,
      /paper.*L2.*official.*L1|论文.*L2.*官方.*L1/isu,
      /glm_winrate\.py.*liblinear/isu,
      /RandomSwitchTwoColumnsProcessor.*3\s*[−-]\s*preference.*undo.*candidate/isu,
    ],
    'Arena-Hard': [
      /2406\.11939v2/u,
      /paper v2.*prompt.*6.*cluster mean.*5.*PII.*offensive|论文 v2.*提示.*6.*簇均分.*5.*PII.*冒犯/isu,
      /April blog.*cluster mean.*6.*version.*(?:evidence|boundary)|April blog.*簇均分.*6.*版本.*(?:证据|边界)/isu,
      /GPT-3\.5.*(?:v1|repo).*(?:history|evidence)|GPT-3\.5.*(?:v1|仓库).*(?:历史|证据)/isu,
      /4,?000 distinct topics.*LLM.*gpt-4o-mini.*version evidence/isu,
      /no label.*continu.*2.*repeated same.*accept.*conflicting.*no retry/isu,
      /b4cbc3e31bc9b2557f277f7d40177a7b5a011fc2/u,
      /same.*Arena-Hard-Auto-v0\.1.*no separate|同一.*Arena-Hard-Auto-v0\.1.*并非独立/isu,
    ],
    'Arena-Hard-Auto': [
      /2406\.11939v2/u,
      /paper v2.*prompt.*6.*cluster mean.*5.*PII.*offensive|论文 v2.*提示.*6.*簇均分.*5.*PII.*冒犯/isu,
      /April blog.*cluster mean.*6.*version.*(?:evidence|boundary)|April blog.*簇均分.*6.*版本.*(?:证据|边界)/isu,
      /GPT-3\.5.*(?:v1|repo).*(?:history|evidence)|GPT-3\.5.*(?:v1|仓库).*(?:历史|证据)/isu,
      /4,?000 distinct topics.*LLM.*gpt-4o-mini.*version evidence/isu,
      /no label.*continu.*2.*repeated same.*accept.*conflicting.*no retry/isu,
      /b4cbc3e31bc9b2557f277f7d40177a7b5a011fc2/u,
      /v0\.1.*v2\.0.*not mixed|v0\.1.*v2\.0.*不混/isu,
    ],
  };
  for (const [id, [paper, ...notes]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const pattern of notes) assert.match(detail.drawio_review_note, pattern, `${id} note`);
  }
});

test('keeps every A9b fallback synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A9b', () => {
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

test('strictly rebuilds and normalizes all eight A9b specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a9b-'));
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
