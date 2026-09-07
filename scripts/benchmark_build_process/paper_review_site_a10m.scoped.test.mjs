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
const benchmarkIds = ['Cybench', 'CyberGym', 'CyberSecEval', 'DAComp'];
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
].find(candidate => candidate && existsSync(candidate));

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const readSpec = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
);
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

function edgeSpecBlock(id, language, from, to) {
  const spec = readSpec(id, language);
  const marker = `  - from: ${from}\n    to: ${to}\n`;
  const start = spec.indexOf(marker);
  assert.notEqual(start, -1, `${id}.${language} edge ${from}->${to}`);
  const next = spec.indexOf('\n  - from:', start + marker.length);
  return spec.slice(start, next === -1 ? undefined : next);
}

function assertMaxLineLength(node, maxLength, context) {
  assert.ok(node, `${context} node exists`);
  for (const line of node.label.split(/\r?\n/u)) {
    assert.ok(
      [...line].length <= maxLength,
      `${context} line exceeds ${maxLength} characters: ${line}`,
    );
  }
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
  for (const node of arch.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of arch.edges) {
    const arrow = mermaidArrow(edge);
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

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function pngDimensions(file) {
  const buffer = readFileSync(file);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', file);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10m packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }

  for (const benchmarkId of ['CyberGym', 'CyberSecEval', 'DAComp']) {
    for (const node of readArch(benchmarkId, 'en').nodes) {
      assertMaxLineLength(node, 38, `${benchmarkId}.en ${node.id}`);
    }
  }
  assert.ok(
    nodeMap(readArch('CyberGym', 'en')).get('impact_boundary').label.split(/\r?\n/u).length <= 6,
    'CyberGym.en impact_boundary stays inside the document geometry',
  );

  const qualityEntries = new Map([
    ['arch', '0.2'],
    ['impl', '0.4'],
    ['evol', '0.6'],
    ['da_design', '0.8'],
  ]);
  for (const language of ['en', 'zh']) {
    for (const [from, entryY] of qualityEntries) {
      const block = edgeSpecBlock('DAComp', language, from, 'quality');
      assert.match(block, /style:\n      exitX: 1\n      exitY: 0\.5\n      entryX: 0\n/u);
      assert.match(block, new RegExp(`      entryY: ${entryY}(?:\\n|$)`, 'u'));
    }
  }
});

test('locks Cybench v4 task selection, verifiability, two run modes, and three metrics', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Cybench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2408\.08926v4.*9643babc/isu);
    assert.match(nodes.get('competitions')?.label ?? '', /HackTheBox.*17.*SekaiCTF.*12.*Glacier.*9.*HKCert.*2/isu);
    assert.match(nodes.get('selection')?.label ?? '', /2022.*2024.*Crypto.*16.*Web.*8.*Rev.*6.*Forensics.*4.*Misc.*4.*Pwn.*2.*2 min.*24 h 54 min|2022.*2024.*密码.*16.*Web.*8.*逆向.*6.*取证.*4.*杂项.*4.*利用.*2.*2 分钟.*24 小时 54 分钟/isu);
    assert.match(nodes.get('package')?.label ?? '', /description.*local.*remote.*starter.*evaluator|描述.*本地.*远程.*起始文件.*评估器/isu);
    assert.match(nodes.get('subtasks')?.label ?? '', /question.*answer.*sequential.*final.*flag|问题.*答案.*顺序.*最终.*flag/isu);
    assert.match(nodes.get('verify')?.label ?? '', /solution\.sh.*final line.*exact.*CI.*probe.*server.*manual.*Docker cache|solution\.sh.*末行.*(?:精确.*CI|CI.*精确).*探针.*服务.*人工.*Docker 缓存/isu);
    assert.match(nodes.get('artifact')?.label ?? '', /40.*task_list\.txt.*subtask_list\.txt.*11c0bb3/isu);
    assert.match(nodes.get('environment')?.label ?? '', /Kali Linux.*separate Docker.*shared network.*network calls|Kali Linux.*独立 Docker.*共享网络.*网络调用/isu);
    assert.match(nodes.get('interaction')?.label ?? '', /Act.*Execute.*Update.*memory|动作.*执行.*更新.*记忆/isu);
    assert.match(nodes.get('unguided')?.label ?? '', /15.*single.*binary|15.*单次.*二元/isu);
    assert.match(nodes.get('guided')?.label ?? '', /5.*per subtask.*single submission.*memory retained|每个子任务.*5.*单次提交.*保留记忆/isu);
    assert.match(nodes.get('evaluator')?.label ?? '', /submitted answer.*unique flag.*observations.*flags only.*not.*subtask answers|提交答案.*观察.*唯一 flag.*仅.*观察.*flag.*不.*子任务答案/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /unguided.*subtask-guided.*final.*subtask fraction.*macro.*FST.*tokens.*time|无引导.*子任务引导.*最终.*子任务比例.*宏平均.*FST.*Token.*耗时/isu);
    assert.ok(edges.has('mode->unguided:primary'));
    assert.ok(edges.has('mode->guided:primary'));
    assert.ok(edges.has('unguided->evaluator:primary'));
    assert.ok(edges.has('guided->evaluator:primary'));
  }
});

test('locks CyberGym v3 sourcing, filtering prompts, audited release, levels, and dual-version oracle', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CyberGym', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2506\.02548v3.*cd123ad.*bde190d.*9cea452/isu);
    assert.match(nodes.get('source')?.label ?? '', /OSS-Fuzz.*ARVO.*memory safety.*C\/C\+\+.*sanitizer|OSS-Fuzz.*ARVO.*内存安全.*C\/C\+\+.*sanitizer/isu);
    assert.match(nodes.get('patch')?.label ?? '', /daily.*last pre-fix day.*binary search.*first.*no longer.*crash|每日.*修复前最后一天.*二分.*首个.*不再.*崩溃/isu);
    assert.match(nodes.get('elements')?.label ?? '', /pre-patch.*post-patch.*ground-truth PoC.*patch.*sanitizer|补丁前.*补丁后.*标准 PoC.*补丁.*sanitizer/isu);
    const filterPrompt = nodes.get('filter_prompt')?.label ?? '';
    assert.match(filterPrompt, /GPT-4\.1.*(?:at least|≥)\s*1.*complete sentence.*vulnerability.*fix.*(?:or|OR).*vulnerability location|GPT-4\.1.*至少\s*1.*完整句子.*漏洞.*修复.*或.*漏洞位置/isu);
    assert.match(filterPrompt, /reject.*multi-issue.*few-shot|拒绝.*多问题.*少样本/isu);
    assert.doesNotMatch(filterPrompt, /(?:require|required|must).*location.*root cause|必须.*位置.*根因/isu);
    assert.match(nodes.get('rephrase_prompt')?.label ?? '', /preserve.*function.*file.*remove.*cross-reference.*patch instructions.*no speculation.*present tense|保留.*函数.*文件.*移除.*交叉引用.*修补说明.*不(?:得)?推测.*现在时/isu);
    assert.match(nodes.get('qa')?.label ?? '', /re-run.*both versions.*same patch.*crash-stack.*300.*150.*150.*96 projects.*0\.82.*96%|双版本.*重跑.*同一补丁.*崩溃栈.*300.*150.*150.*96.*0\.82.*96%/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /1,?368.*139.*1,?507.*188.*2017-01-01.*2025-04-21/isu);
    assert.match(nodes.get('level0')?.label ?? '', /Level 0.*pre-patch code.*no.*description|Level 0.*补丁前代码.*无.*描述/isu);
    assert.match(nodes.get('level1')?.label ?? '', /Level 1.*primary.*description|Level 1.*主任务.*描述/isu);
    assert.match(nodes.get('level2')?.label ?? '', /Level 2.*ground-truth crash stack|Level 2.*标准崩溃栈/isu);
    assert.match(nodes.get('level3')?.label ?? '', /Level 3.*patch diff.*post-patch code|Level 3.*补丁差异.*补丁后代码/isu);
    assert.match(nodes.get('agent')?.label ?? '', /submit\.sh.*exit code.*output.*iterative|submit\.sh.*退出码.*输出.*迭代/isu);
    assert.match(nodes.get('oracle')?.label ?? '', /pre-patch.*sanitizer crash.*post-patch.*no sanitizer crash|补丁前.*sanitizer 崩溃.*补丁后.*无 sanitizer 崩溃/isu);
    assert.match(nodes.get('impact_boundary')?.label ?? '', /v3.*abstract.*34.*18.*body.*17.*10.*25.*35.*not.*benchmark metric|v3.*摘要.*34.*18.*正文.*17.*10.*25.*35.*不.*基准指标/isu);
    for (const level of ['level0', 'level1', 'level2', 'level3']) {
      assert.ok(edges.has(`levels->${level}:primary`));
      assert.ok(edges.has(`${level}->agent:primary`));
    }
    assert.ok(edges.has('oracle->metric:primary'));
    assert.ok(edges.has('metric->impact_boundary:data'));
  }
});

test('keeps CyberSecEval 3 eight risks as distinct paper protocols and limits guardrail mappings', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CyberSecEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2408\.01605v2.*3d01c613.*251.*1,?916.*1,?916.*500.*1,?000.*856/isu);
    assert.match(nodes.get('phishing')?.label ?? '', /victim profile.*LLM victim.*250.*1–5|受害者画像.*LLM 受害者.*250.*1–5/isu);
    assert.match(nodes.get('phishing')?.label ?? '', /4.*10.*r ?= ?0\.89/isu);
    assert.match(nodes.get('manual_uplift')?.label ?? '', /62.*half.*expert.*half.*novice.*two.*one-hour.*Hack The Box.*phases.*time|62.*一半.*专家.*一半.*新手.*两.*1 小时.*Hack The Box.*阶段.*时间/isu);
    assert.match(nodes.get('autonomous')?.label ?? '', /Kali Linux.*Windows Server.*85.*reconnaissance.*identification.*exploit.*post.*three judge|Kali Linux.*Windows Server.*85.*侦察.*识别.*利用.*后渗透.*3.*评判/isu);
    assert.match(nodes.get('exploit')?.label ?? '', /toy CTF.*C.*Python.*JavaScript.*SQLite.*C\+\+.*zero-shot|玩具 CTF.*C.*Python.*JavaScript.*SQLite.*C\+\+.*零样本/isu);
    assert.match(nodes.get('injection')?.label ?? '', /251.*logic.*security.*system.*user.*judge.*ASR|251.*逻辑.*安全.*系统.*用户.*评判.*ASR/isu);
    assert.match(nodes.get('insecure_code')?.label ?? '', /1,?916.*1,?916.*autocomplete.*instruct.*8 languages.*ICD|1,?916.*1,?916.*补全.*指令.*8 种语言.*ICD/isu);
    assert.match(nodes.get('interpreter')?.label ?? '', /500.*privilege escalation.*container escape.*compliance|500.*权限提升.*容器逃逸.*遵从/isu);
    assert.match(nodes.get('helpfulness')?.label ?? '', /1,?000.*MITRE ATT&CK.*response expansion.*judge.*compliance|1,?000.*MITRE ATT&CK.*响应扩展.*评判.*遵从/isu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /manual uplift.*human study.*not.*prompt corpus.*automated.*public|人工增益.*人类研究.*不.*提示语料.*自动化.*公开/isu);
    assert.match(nodes.get('guardrails')?.label ?? '', /PromptGuard.*injection.*CodeShield.*insecure.*Llama Guard 3.*interpreter.*helpfulness.*not.*all eight|PromptGuard.*注入.*CodeShield.*不安全.*Llama Guard 3.*解释器.*助攻.*并非.*八项/isu);
    for (const id of ['phishing', 'manual_uplift', 'autonomous', 'exploit']) {
      assert.ok(edges.has(`third_party->${id}:primary`));
      assert.ok(edges.has(`${id}->suite:primary`));
    }
    for (const id of ['injection', 'insecure_code', 'interpreter', 'helpfulness']) {
      assert.ok(edges.has(`application->${id}:primary`));
      assert.ok(edges.has(`${id}->suite:primary`));
    }
  }
});

test('locks DAComp construction, four task contracts, and task-specific evaluation boundaries', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('DAComp', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('evidence')?.label ?? '', /2512\.04324v1.*8c4a189.*11f04f0.*2cc2214.*30e915f.*no paper-pinned code|2512\.04324v1.*8c4a189.*11f04f0.*2cc2214.*30e915f.*论文未固定代码/isu);
    assert.match(nodes.get('assets')?.label ?? '', /8 experts.*Apache-2\.0.*MIT|8 位专家.*Apache-2\.0.*MIT/isu);
    assert.match(nodes.get('de_assets')?.label ?? '', /73.*SaaS.*400 columns.*relationally consistent.*synthetic|73.*SaaS.*400 列.*关系一致.*合成/isu);
    assert.match(nodes.get('de_baseline')?.label ?? '', /open-source dbt.*error-free.*pure SQL.*expand.*macro.*freeze.*dependencies.*senior.*audit|开源 dbt.*无错误.*纯 SQL.*展开.*宏.*冻结.*依赖.*资深.*审计/isu);
    assert.match(nodes.get('arch')?.label ?? '', /30.*5 candidate.*selects? 1.*high-level requirement.*initial repo.*specification|30.*5 个候选.*选 1.*高层需求.*初始仓库.*规范/isu);
    assert.match(nodes.get('impl')?.label ?? '', /30.*reverse-engineer.*data_contract\.yaml.*full DAG.*empty repository|30.*逆向.*data_contract\.yaml.*完整 DAG.*空仓库/isu);
    assert.match(nodes.get('evol')?.label ?? '', /50.*practicing data engineers.*change.*existing.*repository|50.*在职数据工程师.*变更.*现有.*仓库/isu);
    assert.match(nodes.get('da_assets')?.label ?? '', /100.*Web databases.*semantic layers|100.*Web 数据库.*语义层/isu);
    assert.match(nodes.get('da_design')?.label ?? '', /100.*8.*questions.*five.*vote.*top 2|100.*8.*问题.*5.*投票.*前 2/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /210.*30.*30.*50.*100.*DAComp-zh.*identical|210.*30.*30.*50.*100.*DAComp-zh.*相同/isu);
    assert.match(nodes.get('de_arch_eval')?.label ?? '', /standard.*non-hierarchical.*no GSB.*business.*technical.*design|标准.*非层次.*无 GSB.*业务.*技术.*设计/isu);
    assert.match(nodes.get('de_exec_eval')?.label ?? '', /DuckDB.*schema.*data.*CS.*perfect upstream.*CFS.*predicted upstream.*SR.*(?:all|every component).*DE-Evol.*CFS.*≥ ?80|DuckDB.*模式.*数据.*CS.*标准上游.*CFS.*预测上游.*SR.*全部.*DE-Evol.*CFS.*≥ ?80/isu);
    assert.match(nodes.get('da_eval')?.label ?? '', /(?:at least|≥) ?3.*alignment.*paths.*anchor.*five diverse LLM.*Completeness.*Accuracy.*Insightfulness.*Readability.*Depth.*Visualization.*five baseline.*GSB.*Gemini-2\.5-Flash.*0\.6|至少 3.*对齐.*路径.*锚点.*5 个多样 LLM.*完整性.*准确性.*洞察力.*GSB.*可读性.*深度.*可视化.*5 份基线.*Gemini-2\.5-Flash.*0\.6/isu);
    assert.ok(edges.has('split->de_assets:primary'));
    assert.ok(edges.has('split->da_assets:primary'));
    for (const id of ['arch', 'impl', 'evol']) assert.ok(edges.has(`de_route->${id}:primary`));
    for (const id of ['de_arch_eval', 'de_exec_eval', 'da_eval']) assert.ok(edges.has(`eval_route->${id}:primary`));
  }
});

test('pins paper and released-artifact revisions plus count and metric boundaries in A10m details', () => {
  const cybench = readDetail('Cybench');
  assert.match(cybench.paper_url, /2408\.08926v4/u);
  assert.match(cybench.drawio_review_note, /9643babc.*40.*17.*12.*9.*2.*16.*8.*6.*4.*4.*2.*11c0bb3/isu);

  const gym = readDetail('CyberGym');
  assert.match(gym.paper_url, /2506\.02548v3/u);
  assert.match(gym.drawio_review_note, /cd123ad.*bde190d.*9cea452.*1,?368.*139.*1,?507.*188.*300.*0\.82.*96%/isu);
  assert.match(gym.build_method, /至少.*完整句子.*漏洞.*修复.*或.*漏洞位置.*多问题/isu);
  assert.match(gym.build_method_en, /at least.*complete sentence.*vulnerability.*fix.*or.*vulnerability location.*multi-issue/isu);
  assert.match(gym.drawio_review_note, /either.*complete sentence.*vulnerability.*fix.*or.*vulnerability location.*multi-issue/isu);
  assert.doesNotMatch(`${gym.build_method_en} ${gym.drawio_review_note}`, /location.*root cause/isu);
  assert.match(gym.drawio_review_note, /abstract.*34.*18.*body.*17.*10.*25.*35.*not.*metric/isu);

  const cse = readDetail('CyberSecEval');
  assert.match(cse.paper_url, /2408\.01605v2/u);
  assert.match(cse.drawio_review_note, /3d01c613.*251.*1,?916.*1,?916.*500.*1,?000.*856/isu);
  assert.match(cse.drawio_review_note, /manual.*human.*not.*automated prompt corpus/isu);

  const dacomp = readDetail('DAComp');
  assert.match(dacomp.paper_url, /2512\.04324v1/u);
  assert.match(dacomp.drawio_review_note, /8c4a189.*11f04f0.*2cc2214.*30e915f.*no paper-pinned public code revision/isu);
  assert.match(dacomp.metric_en, /CS.*CFS.*SR.*CFS.*80.*hierarchical.*GSB.*0\.6/isu);
});

test('keeps every A10m fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10m', () => {
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

test('reproduces A10m SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10m-exports-'));
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
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10m specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10m-'));
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
