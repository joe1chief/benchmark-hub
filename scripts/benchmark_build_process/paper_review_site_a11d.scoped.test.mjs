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
const benchmarkIds = ['InterCode', 'InterCode-CTF', 'InteractiveBench', 'JailBench'];
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

test('keeps all four A11d packages bilingual with academic styling and evidence boundaries', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
    for (const language of ['en', 'zh']) {
      const spec = readSpec(id, language);
      assert.equal(spec.meta.profile, 'academic-paper', `${id}.${language} profile`);
      assert.equal(spec.meta.theme, 'academic-color', `${id}.${language} theme`);
      assert.equal(spec.meta.layout, 'horizontal', `${id}.${language} layout`);
      assert.equal(spec.meta.routing, 'orthogonal', `${id}.${language} routing`);
      assert.ok(spec.nodes.some(node => node.id === 'evidence'), `${id}.${language} evidence`);
      assert.ok(spec.nodes.some(node => node.id === 'artifact_boundary'), `${id}.${language} boundary`);
    }
  }
});

test('keeps reviewed bilingual node lines inside native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 44], ['zh', 30]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok([...line].length <= maxLineLength, `${id}.${language}.${node.id}: ${line}`);
        }
      }
    }
  }
});

test('locks InterCode paper suites, environment rewards, evaluation scope, and repository drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('InterCode', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2306\.14898v3.*377bf97/isu);
    assert.match(text, /POMDP.*Dockerfile.*dataset.*reward|POMDP.*Dockerfile.*数据.*奖励/isu);
    assert.match(text, /NL2Bash.*1,?000.*200.*60.*53.*60.*27/isu);
    assert.match(text, /Spider.*1,?034.*20.*MySQL/isu);
    assert.match(text, /Jaccard.*Kendall|Jaccard.*Kendall/isu);
    assert.match(text, /MBPP.*117.*proportion|MBPP.*117.*比例/isu);
    assert.match(text, /Bash.*SQL.*single.*10.*ReAct|Bash.*SQL.*单轮.*10.*ReAct/isu);
    assert.match(text, /paper.*117.*Git.*974.*CTF.*SWE|论文.*117.*Git.*974.*CTF.*SWE/isu);
    for (const edge of [
      'contract->bash_source:primary',
      'contract->sql_source:primary',
      'contract->python_source:primary',
      'bash_reward->docker:primary',
      'sql_reward->docker:primary',
      'python_reward->docker:primary',
      'bash_reward->validate:primary',
      'sql_reward->validate:primary',
    ]) assert.ok(edges.has(edge), `${language} ${edge}`);
    assert.ok(!edges.has('python_reward->validate:primary'), `${language} excludes Python validation`);
  }
});

test('locks InterCode-CTF manual gates, shared sandbox, access boundary, and paper baseline', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('InterCode-CTF', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /KOZwk7BFc3.*c2f8b82/isu);
    assert.match(text, /picoCTF.*manual.*solve|picoCTF.*人工.*解/isu);
    assert.match(text, /shared.*image.*\/ctf.*solution|共享.*镜像.*\/ctf.*solution/isu);
    assert.match(text, /100.*33.*27.*19.*15.*4.*2/isu);
    assert.match(text, /query.*agent.*gold.*evaluator|query.*智能体.*gold.*评测/isu);
    assert.match(text, /submit ANSWER.*(?:case-insensitive|忽略大小写)/isu);
    assert.match(text, /10.*not.*environment|10.*非.*环境/isu);
    assert.match(text, /40.*100.*3\.9/isu);
    assert.match(text, /paper.*10.*current.*15|论文.*10.*当前.*15/isu);
    assert.match(text, /no browser.*2 Web.*19.*remote.*difficulty|无浏览器.*2.*19.*远程.*难度/isu);
    assert.ok(edges.has('grade->loop:optional'), `${language} wrong-submit continuation`);
  }
});

test('locks InteractiveBench v4 five-testbed protocols and partial release boundary', () => {
  for (const language of ['en', 'zh']) {
    const text = labels(readArch('InteractiveBench', language));
    assert.match(text, /2603\.04737v4.*caaf091/isu);
    assert.match(text, /46.*20.*Yes.*No.*Both.*Irrelevant|46.*20.*是.*否.*(?:混合|两者皆有).*无关/isu);
    assert.match(text, /50.*UI2Code-Real.*20.*Full HTML|50.*UI2Code-Real.*20.*完整 HTML/isu);
    assert.match(text, /(?:final.*qwen-vl-max|qwen-vl-max.*final)|(?:最终.*qwen-vl-max|qwen-vl-max.*最终)/isu);
    assert.match(text, /52.*HLE.*player.*token.*(?:judge|评审)/isu);
    assert.match(text, /10.*500.*10(?:k|,?000).*50\s*\/\s*100|10.*500.*1 万.*50\s*\/\s*100/isu);
    assert.match(text, /δ.*R.*(?:unreported|not disclosed|未披露)|继续.*δ.*R.*未披露/isu);
    assert.match(text, /separate.*five.*no.*(?:unified|aggregate)|五.*分别.*无.*统一/isu);
    assert.match(text, /(?:repo|git).*four.*UI2Html.*not.*released|Git.*四.*UI2Html.*未发布/isu);
  }
});

test('locks JailBench taxonomy, AJPE feedback loop, metrics, and public subset boundary', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('JailBench', language);
    const text = labels(arch);
    const edges = new Set(arch.edges.map(edge => `${edge.from}->${edge.to}:${edge.type}`));
    assert.match(text, /2502\.18935v1.*5f47407/isu);
    assert.match(text, /(?:Ganguli|Anthropic).*AdvBench.*SafetyBench.*Flames/isu);
    assert.match(text, /5.*40.*10,?000/isu);
    assert.match(text, /template.*seed.*target.*LLM.*harm|模板.*(?:种子|Seed).*目标.*模型.*有害/isu);
    assert.match(text, /safe.*discard|安全.*丢弃/isu);
    assert.match(text, /harmful.*(?:I\/O|input-output).*ChatGPT.*log-prob|有害.*输入输出.*ChatGPT.*对数概率/isu);
    assert.match(text, /20.*10,?800/isu);
    assert.match(text, /540.*10,?800/isu);
    assert.match(text, /13.*(?:LLM|模型)/isu);
    assert.match(text, /ASR.*5.*Overall.*AE|ASR.*5.*Overall.*AE/isu);
    assert.match(text, /108.*2,?160.*27/isu);
    assert.match(text, /40.*(?:application|申请)/isu);
    assert.ok(edges.has('prompt_pool->prior_templates:data'), `${language} feedback edge`);
  }
});

test('pins exact paper and official artifact revisions in every A11d detail record', () => {
  const intercode = readDetail('InterCode');
  assert.match(intercode.paper_url, /2306\.14898v3/u);
  assert.match(intercode.arxiv_pdf_url, /2306\.14898v3/u);
  assert.match(intercode.homepage, /377bf97b39f51797dfde0d6a163013fdc6222fff/u);
  assert.equal(intercode.has_leaderboard, true);
  assert.match(intercode.drawio_review_note, /117.*974.*Bash.*SQL.*CTF.*SWE/isu);
  assert.match(intercode.drawio_contract_note, /Dockerfile.*query\/gold.*only when needed.*independent external inputs/isu);
  assert.match(intercode.drawio_reward_drift_note, /0\.01.*0\.33.*raw Kendall.*adjusted/isu);

  const ctf = readDetail('InterCode-CTF');
  assert.match(ctf.paper_url, /KOZwk7BFc3/u);
  assert.match(ctf.homepage, /c2f8b82c0ad94d30844d58490b7d7b3b13a50789/u);
  assert.equal(ctf.has_leaderboard, true);
  assert.equal(ctf.difficulty, '');
  assert.match(ctf.drawio_review_note, /shared.*image.*paper.*10.*current.*15/isu);
  assert.match(ctf.drawio_scope_note, /no browser.*two Web.*difficulty/isu);
  assert.match(ctf.drawio_scope_note, /nineteen.*remote/isu);
  assert.match(ctf.drawio_runtime_drift_note, /incorrect submission.*continue.*done.*15/isu);

  const interactive = readDetail('InteractiveBench');
  assert.match(interactive.paper_url, /2603\.04737v4/u);
  assert.match(interactive.arxiv_pdf_url, /2603\.04737v4/u);
  assert.match(interactive.homepage, /caaf091f06192b471434a69daebb955db095b9ed/u);
  assert.equal(interactive.published, '2026-03');
  assert.equal(interactive.openness, 'partly public');
  assert.equal(interactive.has_leaderboard, true);
  assert.match(interactive.drawio_review_note, /no unified aggregate.*UI2Html.*not.*released|UI2Html.*not.*released.*no unified aggregate/isu);
  assert.match(interactive.drawio_implementation_drift_note, /21st.*4,590.*Trust.*paper/isu);

  const jail = readDetail('JailBench');
  assert.match(jail.paper_url, /2502\.18935v1/u);
  assert.match(jail.arxiv_pdf_url, /2502\.18935v1/u);
  assert.match(jail.homepage, /5f474072db5212602448c16558b6d449efbecd30/u);
  assert.equal(jail.openness, 'partly public');
  assert.match(jail.drawio_review_note, /13.*108.*2,?160.*27.*40/isu);
  assert.match(jail.drawio_review_note, /MDJudge.*14|14.*MDJudge/isu);
});

test('keeps every A11d fallback byte-synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(detail[`flowchart_${language}`], renderFallback(readArch(id, language)), `${id}.${language}`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A11d', () => {
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

test('reproduces exactly eight A11d SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11d-exports-'));
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
    assert.equal(exportCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A11d specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a11d-'));
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
    assert.equal(rebuildCount, 8);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
