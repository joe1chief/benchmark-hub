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
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['HallusionBench', 'HarmBench', 'HealthAdminBench', 'HealthBench-Hallu'];
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
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeSet = arch => new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));

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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10y packages bilingual, horizontal, typed-isomorphic, and paper-styled', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence`);
      assert.ok(
        spec.nodes.some(node => node.id === 'artifact_boundary'),
        `${id}.${language} artifact boundary`,
      );
      assert.ok(spec.nodes.length >= 12, `${id}.${language} paper detail`);
      for (const node of spec.nodes) {
        const lines = String(node.label).split(/\r?\n/u);
        assert.ok(lines.length <= 5, `${id}.${language}.${node.id} line count`);
        for (const line of lines) {
          assert.ok([...line].length <= (language === 'zh' ? 34 : 48), `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks HallusionBench paper taxonomy, paired construction, judging, and diagnostic metrics', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HallusionBench', language));
    const edges = edgeSet(readArch('HallusionBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2310\.14566v5.*744007c.*ca6e0fb/isu);
    assert.match(nodes.get('taxonomy')?.label ?? '', /Visual Dependent.*visual context.*Visual Supplement.*without image|视觉依赖.*视觉上下文.*视觉补充.*无图/isu);
    assert.match(nodes.get('collect')?.label ?? '', /165.*original.*181.*edited.*346|165.*原始.*181.*编辑.*346/isu);
    assert.match(nodes.get('edit')?.label ?? '', /flipping.*order reversal.*masking.*OCR.*object.*color|翻转.*顺序反转.*遮挡.*OCR.*对象.*颜色/isu);
    assert.match(nodes.get('inputs')?.label ?? '', /178.*no-visual.*447.*original.*504.*edited|178.*无图.*447.*原图.*504.*编辑图/isu);
    assert.match(nodes.get('pairs')?.label ?? '', /455.*control pairs.*1,?129.*VD 591.*VS 538|455.*控制题对.*1,?129.*VD 591.*VS 538/isu);
    assert.match(nodes.get('response')?.label ?? '', /Yes.*No.*Uncertain|是.*否.*不确定/isu);
    assert.match(
      nodes.get('judge')?.label ?? '',
      /paper.*text-only GPT-4.*Correct.*Incorrect.*Unclear.*temperature 0.*3 runs.*average|论文.*纯文本 GPT-4.*正确.*错误.*不清楚.*温度 0.*3 次.*平均/isu,
    );
    assert.match(
      nodes.get('harness')?.label ?? '',
      /pinned harness.*one correctness call per row.*no explicit temperature argument.*incorrect.*0.*correct.*1.*other.*2|固定代码.*每行 1 次正确性裁判调用.*未显式传入 temperature 参数.*incorrect.*0.*correct.*1.*其他.*2/isu,
    );
    assert.match(nodes.get('rules')?.label ?? '', /VS no-visual.*Uncertain acceptable.*binary|VS 无图.*不确定.*可接受.*二值/isu);
    assert.match(nodes.get('score')?.label ?? '', /aAcc.*fAcc.*qAcc.*Easy.*Hard|aAcc.*fAcc.*qAcc.*简单.*困难/isu);
    assert.match(nodes.get('diagnose')?.label ?? '', /Yes\/No bias.*consistency.*decision tree|是\/否偏置.*一致性.*决策树/isu);
    assert.match(nodes.get('failure')?.label ?? '', /Language hallucination.*Visual illusion.*Mixed|语言幻觉.*视觉错觉.*混合/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /HallusionBench\.json.*1,?129.*model generation.*user-supplied|HallusionBench\.json.*1,?129.*模型生成.*用户实现/isu);
    for (const edge of [
      'evidence->taxonomy:primary',
      'taxonomy->collect:primary',
      'collect->edit:primary',
      'collect->inputs:primary',
      'edit->inputs:primary',
      'inputs->pairs:primary',
      'pairs->response:primary',
      'response->judge:primary',
      'judge->rules:primary',
      'judge->harness:data',
      'rules->score:primary',
      'rules->diagnose:secondary',
      'diagnose->failure:primary',
      'pairs->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HarmBench behavior curation, official split, standardized generation, and dual classifiers', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('HarmBench', language));
    const edges = edgeSet(readArch('HarmBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2402\.04249v2.*8e1604d.*behavior_datasets/isu);
    assert.match(nodes.get('policies')?.label ?? '', /OpenAI.*Anthropic.*Meta.*Inflection|OpenAI.*Anthropic.*Meta.*Inflection/isu);
    assert.match(nodes.get('distill')?.label ?? '', /GPT-4.*combined policy summary|GPT-4.*合并政策摘要/isu);
    assert.match(nodes.get('manual')?.label ?? '', /authors.*manual.*laws.*norms.*dual-intent.*searchability|作者.*人工.*法律.*规范.*双重意图.*可搜索性/isu);
    assert.match(nodes.get('functional')?.label ?? '', /510.*200 standard.*100 copyright.*100 contextual.*110 multimodal|510.*200 标准.*100 版权.*100 上下文.*110 多模态/isu);
    assert.match(nodes.get('semantic')?.label ?? '', /7 semantic categories|7 个语义类别/isu);
    assert.match(nodes.get('split')?.label ?? '', /100 validation.*410 test.*no tuning on test|100 验证.*410 测试.*不得.*测试集.*调参/isu);
    assert.match(nodes.get('attack')?.label ?? '', /red-team method.*N\s*=\s*512 test cases.*behavior|红队方法.*每个行为.*N\s*=\s*512 个测试样本/isu);
    assert.match(nodes.get('target')?.label ?? '', /target model.*defense.*greedy decoding|目标模型.*防御.*贪心解码/isu);
    assert.doesNotMatch(nodes.get('target')?.label ?? '', /512.*tokens?|512.*token/isu);
    assert.match(nodes.get('llm_classifier')?.label ?? '', /non-copyright.*Llama 2 13B.*yes\/no|非版权.*Llama 2 13B.*yes\/no/isu);
    assert.match(nodes.get('hash_classifier')?.label ?? '', /copyright.*MinHash.*overlapping chunks.*0\.6|版权.*MinHash.*重叠文本块.*0\.6/isu);
    assert.match(nodes.get('score')?.label ?? '', /attack success rate.*successful test cases|攻击成功率.*成功测试样本/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /text CSV.*80\/320.*multimodal.*110.*no separate 20\/90 CSV|文本 CSV.*80\/320.*多模态.*110.*无独立 20\/90 CSV/isu);
    for (const edge of [
      'evidence->policies:primary',
      'policies->distill:primary',
      'distill->manual:primary',
      'manual->functional:primary',
      'manual->semantic:secondary',
      'functional->split:primary',
      'split->attack:primary',
      'attack->target:primary',
      'target->route:primary',
      'route->llm_classifier:primary',
      'route->hash_classifier:secondary',
      'llm_classifier->score:primary',
      'hash_classifier->score:primary',
      'split->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
  }
});

test('locks HealthAdminBench environments, expert task design, verifiers, validation, and strict scoring', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HealthAdminBench', language);
    const nodes = nodeMap(readArch('HealthAdminBench', language));
    const edges = edgeSet(readArch('HealthAdminBench', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2604\.09937v1.*e71a8f4.*benchmark\/v2\/tasks/isu);
    assert.match(nodes.get('shadow')?.label ?? '', /over 100 hours.*administrative staff|超过 100 小时.*行政人员/isu);
    assert.match(nodes.get('envs')?.label ?? '', /EHR.*two payer portals.*fax|EHR.*两个支付方门户.*传真/isu);
    assert.match(nodes.get('synthetic')?.label ?? '', /deterministic.*synthetic patient.*typed schemas.*policy checks|确定性.*合成患者.*类型化模式.*政策校验/isu);
    assert.match(nodes.get('tasks')?.label ?? '', /135.*60 prior authorization.*60 appeals.*15 DME|135.*60 事前授权.*60 申诉.*15 DME/isu);
    assert.match(nodes.get('expert_audit')?.label ?? '', /40-task.*20.*20.*two revenue-cycle experts.*DME iterative|40 任务.*20.*20.*两名收入周期专家.*DME.*迭代/isu);
    assert.match(nodes.get('subtasks')?.label ?? '', /1,?698.*six capability groups|1,?698.*六类能力/isu);
    assert.match(nodes.get('jmes')?.label ?? '', /1,?177.*JMESPath.*portal state|1,?177.*JMESPath.*门户状态/isu);
    assert.match(nodes.get('llm_judge')?.label ?? '', /521.*GPT-5\.4.*free-text.*rubric|521.*GPT-5\.4.*自由文本.*量表/isu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /60 stratified.*four humans.*120 reviews.*93\.3%|60.*分层.*4 名人工.*120.*93\.3%/isu);
    assert.match(nodes.get('binary')?.label ?? '', /binary.*no partial.*all subtasks|二值.*无部分分.*全部子任务/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /subtask fraction.*strict task success.*95%.*bootstrap|子任务通过比例.*严格任务成功率.*95%.*bootstrap/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /135 JSON tasks.*synthetic proxies.*CAPTCHA.*MFA.*session.*abstracted|135 个 JSON 任务.*合成代理.*CAPTCHA.*MFA.*会话.*抽象/isu);
    for (const edge of [
      'evidence->shadow:primary',
      'shadow->envs:primary',
      'envs->synthetic:primary',
      'synthetic->tasks:primary',
      'tasks->expert_audit:secondary',
      'expert_audit->tasks:data',
      'tasks->decompose:primary',
      'decompose->subtasks:primary',
      'subtasks->route:primary',
      'route->jmes:primary',
      'route->llm_judge:secondary',
      'llm_judge->judge_validation:data',
      'jmes->binary:primary',
      'llm_judge->binary:primary',
      'judge_validation->binary:secondary',
      'binary->metrics:primary',
      'evidence->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);

    const specNodes = new Map(spec.nodes.map(node => [node.id, node]));
    const auditDown = spec.edges.find(edge => edge.from === 'tasks' && edge.to === 'expert_audit');
    const auditUp = spec.edges.find(edge => edge.from === 'expert_audit' && edge.to === 'tasks');
    assert.equal(
      specNodes.get('artifact_boundary').position.x,
      specNodes.get('evidence').position.x,
      `${language} artifact boundary stays below evidence instead of crossing the main row`,
    );
    assert.deepEqual(
      [auditDown.style.exitX, auditDown.style.entryX, auditUp.style.exitX, auditUp.style.entryX],
      [0.25, 0.25, 0.75, 0.75],
      `${language} audit feedback uses two separate vertical tracks`,
    );
  }
});

test('keeps HealthBench-Hallu inside the disclosed paper boundary and does not invent a dataset', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('HealthBench-Hallu', language);
    const nodes = nodeMap(readArch('HealthBench-Hallu', language));
    const edges = edgeSet(readArch('HealthBench-Hallu', language));
    assert.match(nodes.get('evidence')?.label ?? '', /2602\.06570v1.*6965d81e.*03a1fd5/isu);
    assert.match(nodes.get('responses')?.label ?? '', /HealthBench task responses.*not independent.*item count not reported|HealthBench 任务回答.*非独立题集.*未报告题数/isu);
    assert.match(nodes.get('failure_types')?.label ?? '', /misapplied medical knowledge.*fabricated.*evidence.*data.*causal|误用医学知识.*捏造.*证据.*数据.*因果/isu);
    assert.match(nodes.get('extract')?.label ?? '', /GPT-5.*high-precision.*claim extraction|GPT-5.*高精度.*声明抽取/isu);
    assert.match(nodes.get('normalize')?.label ?? '', /atomicity.*coreference.*noise.*distractors.*deduplicate.*order|原子性.*指代.*噪声.*干扰项.*去重.*顺序/isu);
    assert.match(nodes.get('search')?.label ?? '', /real-time multi-turn search.*authoritative.*guidelines.*no cache|实时多轮检索.*权威.*指南.*不使用缓存/isu);
    assert.match(nodes.get('verdict')?.label ?? '', /Supported.*Uncertain.*Refuted|支持.*不确定.*驳斥/isu);
    assert.match(nodes.get('supported')?.label ?? '', /0\.0/isu);
    assert.match(nodes.get('uncertain')?.label ?? '', /0\.5/isu);
    assert.match(nodes.get('refuted')?.label ?? '', /1\.0/isu);
    assert.match(nodes.get('weighted')?.label ?? '', /H = sum claim weights.*total claims|H = 声明权重之和.*声明总数/isu);
    assert.match(nodes.get('rates')?.label ?? '', /Refuted Rate.*Uncertain Rate|驳斥率.*不确定率/isu);
    assert.match(nodes.get('artifact_boundary')?.label ?? '', /no public HealthBench-Hallu.*items.*code.*prompt.*search budget.*source allowlist.*run IDs|未公开 HealthBench-Hallu.*样本.*代码.*提示词.*检索预算.*来源白名单.*运行 ID/isu);
    for (const edge of [
      'evidence->responses:primary',
      'responses->failure_types:secondary',
      'responses->extract:primary',
      'failure_types->extract:secondary',
      'extract->normalize:primary',
      'normalize->claims:primary',
      'claims->search:primary',
      'search->verdict:primary',
      'verdict->supported:primary',
      'verdict->uncertain:secondary',
      'verdict->refuted:primary',
      'supported->weighted:primary',
      'uncertain->weighted:primary',
      'refuted->weighted:primary',
      'verdict->rates:data',
      'evidence->artifact_boundary:data',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);

    const specNodes = new Map(spec.nodes.map(node => [node.id, node]));
    assert.equal(
      specNodes.get('rates').position.x,
      specNodes.get('verdict').position.x,
      `${language} separate rates branch vertically below the verdict`,
    );
    assert.ok(
      specNodes.get('rates').position.y > specNodes.get('refuted').position.y + 100,
      `${language} separate rates avoid crossing the verdict-weight branches`,
    );
  }
});

test('pins exact paper and official artifact snapshots in all four A10y details', () => {
  const hallusion = readDetail('HallusionBench');
  assert.match(hallusion.paper_url, /2310\.14566v5/u);
  assert.match(hallusion.arxiv_pdf_url, /2310\.14566v5/u);
  assert.match(hallusion.drawio_review_note, /744007c232c292942c7f80eb61edb2465482da31.*HallusionBench\.json.*ca6e0fb.*165.*181.*455.*1,?129/isu);
  assert.match(hallusion.drawio_review_note, /paper.*temperature 0.*three runs.*average.*pinned.*one.*call per row.*does not pass.*temperature.*incorrect.*0.*correct.*1.*otherwise.*2/isu);
  assert.doesNotMatch(hallusion.drawio_review_note, /released harness.*temperature 0.*three runs/isu);

  const harm = readDetail('HarmBench');
  assert.match(harm.paper_url, /2402\.04249v2/u);
  assert.match(harm.arxiv_pdf_url, /2402\.04249v2/u);
  assert.match(harm.drawio_review_note, /8e1604d1171fe8a48d8febecd22f600e462bdcdd.*400 text.*110 multimodal.*80.*320.*no separate.*20\/90/isu);
  assert.match(harm.drawio_review_note, /N\s*=\s*512.*test cases per behavior.*not.*completion.*greedy.*repository default.*max_new_tokens=256.*Llama 2 13B.*MinHash.*0\.6/isu);
  assert.doesNotMatch(harm.drawio_review_note, /generate(?:s|d)? 512 tokens/isu);

  const admin = readDetail('HealthAdminBench');
  assert.match(admin.paper_url, /2604\.09937v1/u);
  assert.match(admin.arxiv_pdf_url, /2604\.09937v1/u);
  assert.match(admin.drawio_review_note, /e71a8f4d6923037805b7f51fbbf608d12ea56cf5.*benchmark\/v2\/tasks.*135.*1,?698.*1,?177.*521.*93\.3/isu);

  const hallu = readDetail('HealthBench-Hallu');
  assert.match(hallu.paper_url, /2602\.06570v1/u);
  assert.match(hallu.arxiv_pdf_url, /2602\.06570v1/u);
  assert.match(hallu.drawio_review_note, /6965d81e29e0c36ad4dbe516.*03a1fd5e4d5045b175cd850c576b1f92b335261e.*no public.*item.*evaluation code.*count/isu);
  assert.doesNotMatch([hallu.scale, hallu.scale_en, hallu.drawio_review_note].join('\n'), /\b\d+[,.]?\d*\s+(?:items|questions|samples)\b/iu);
});

test('keeps every A10y fallback byte-synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10y', () => {
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
      assert.ok(dimensions.width >= 900 && dimensions.height >= 240, `${id}.${language}`);
    }
  }
});

test('reproduces all eight A10y SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10y-exports-'));
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
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10y specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10y-'));
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
