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
const benchmarkIds = ['CritPt', 'CureBench', 'CursorBench', 'CyScenarioBench'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const svgNormalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_drawio_svg.mjs',
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

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10i packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual labels within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 46], ['zh', 28]]) {
      for (const node of readArch(id, language).nodes) {
        const lines = String(node.label).split('\n');
        assert.ok(lines.length <= 5, `${id}.${language}.${node.id}: ${lines.length} lines`);
        for (const line of lines) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
        }
      }
    }
  }
});

test('keeps CritPt v4 construction, two evaluation paths, grader, and formulas exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('CritPt', language));
    const edges = edgeMap(readArch('CritPt', language));
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /2509\.26574v4.*17c2545.*9b9fc84|2509\.26574v4.*17c2545.*9b9fc84/isu,
    );
    assert.match(nodes.get('experts')?.label ?? '', /50\+.*30\+.*11|50 多.*30 多.*11/isu);
    assert.match(
      nodes.get('author')?.label ?? '',
      /one-hour.*detailed solution.*derivations.*code|1 小时.*详细解答.*推导.*代码/isu,
    );
    assert.match(
      nodes.get('criteria')?.label ?? '',
      /public knowledge.*search-proof.*guess-resistant.*machine-verifiable|公开知识.*不可搜索.*抗猜测.*机器可验证/isu,
    );
    assert.match(
      nodes.get('iterative_review')?.label ?? '',
      /3\+.*up to 10.*LLM responses.*no .*cherry-pick|至少 3.*最多 10.*模型响应.*不按模型挑题/isu,
    );
    assert.match(
      nodes.get('expert_review')?.label ?? '',
      /peer review.*derivations.*science writer.*40\+|同行评审.*推导.*科学写作.*40 多/isu,
    );
    assert.match(nodes.get('checkpoints')?.label ?? '', /2[–-]4.*dependencies|2[—–-]4.*依赖/isu);
    assert.match(nodes.get('release')?.label ?? '', /71.*190.*1.*70/isu);
    assert.equal(nodes.get('eval_level')?.type, 'decision');
    assert.ok(edges.has('eval_level->challenge_run:primary'));
    assert.ok(edges.has('eval_level->checkpoint_run:primary'));
    assert.match(
      nodes.get('challenge_run')?.label ?? '',
      /70.*no intermediate supervision.*five independent runs|70.*无中间监督.*5 次独立运行/isu,
    );
    assert.match(
      nodes.get('checkpoint_run')?.label ?? '',
      /187.*self-carryover.*expert prior answer|187.*自行承接.*前序专家答案/isu,
    );
    assert.ok(edges.has('checkpoint_run->checkpoint_solve:primary'));
    assert.ok(edges.has('checkpoint_solve->checkpoint_grade:primary'));
    assert.ok(edges.has('checkpoint_grade->metrics:primary'));
    assert.ok(!edges.has('checkpoint_run->metrics:primary'));
    assert.match(nodes.get('solve')?.label ?? '', /free-form.*code template|自由形式.*代码模板/isu);
    assert.match(nodes.get('checkpoint_solve')?.label ?? '', /free-form.*code template|自由形式.*代码模板/isu);
    assert.match(nodes.get('batch')?.label ?? '', /complete 70.*10.*24-hour|完整 70.*24 小时.*10/isu);
    assert.match(
      nodes.get('grade')?.label ?? '',
      /numeric.*12 significant.*SymPy.*curated tests.*all components|数值.*12 位有效.*SymPy.*精选用例.*所有分量/isu,
    );
    assert.match(
      nodes.get('metrics')?.label ?? '',
      /average accuracy.*5.*consistent.*4\/5|平均准确率.*5.*稳定解出.*4\/5/isu,
    );
  }
});

test('keeps CURE-Bench high-level generation claims separate from undisclosed competition data', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('CureBench', language));
    const edges = edgeMap(readArch('CureBench', language));
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /OpenReview.*rD9YGynuT8.*5eada4b.*679b08d.*2503\.10970v1|OpenReview.*rD9YGynuT8.*5eada4b.*679b08d.*2503\.10970v1/isu,
    );
    assert.match(
      nodes.get('taxonomy_boundary')?.label ?? '',
      /12 .*families.*evaluation text says 13.*unreconciled|12 个具名任务族.*评估段写 13.*未协调/isu,
    );
    assert.ok(edges.has('scope->taxonomy_boundary:primary'));
    assert.ok(edges.has('questiongen->tracegen:primary'));
    assert.ok(edges.has('toolgen->tracegen:primary'));
    assert.ok(!edges.has('tracegen->toolgen:primary'));
    assert.match(
      nodes.get('questiongen')?.label ?? '',
      /grounding.*solvability.*reasonableness.*validated|知识依据.*可解性.*合理性.*验证/isu,
    );
    assert.match(
      nodes.get('toolgen')?.label ?? '',
      /ToolGen.*ToolUniverse.*API.*checker.*human|ToolGen.*ToolUniverse.*API.*检查.*人工/isu,
    );
    assert.match(
      nodes.get('tracegen')?.label ?? '',
      /validated question.*ToolUniverse.*answer.*calls.*trace|已验证问题.*ToolUniverse.*答案.*调用.*轨迹/isu,
    );
    assert.match(
      nodes.get('dataset_boundary')?.label ?? '',
      /thousands.*exact count.*prompts.*filters.*not disclosed|数千.*精确数量.*提示.*筛选.*未公开/isu,
    );
    assert.match(
      nodes.get('phase')?.label ?? '',
      /Phase 1.*validation.*test.*Phase 2.*private|第一阶段.*验证.*测试.*第二阶段.*私有/isu,
    );
    assert.equal(nodes.get('track')?.type, 'decision');
    assert.match(nodes.get('internal')?.label ?? '', /internal parameters.*no external|内部参数.*禁止外部/isu);
    assert.match(nodes.get('agentic')?.label ?? '', /biomedical tools.*ToolUniverse.*tool log|生物医学工具.*ToolUniverse.*工具日志/isu);
    assert.match(
      nodes.get('submission')?.label ?? '',
      /multiple.choice.*open-ended.*prediction.*reasoning.*metadata|选择题.*开放式.*预测.*推理.*元数据/isu,
    );
    assert.match(
      nodes.get('metrics')?.label ?? '',
      /direct.*accumulated.*open-ended.*rephras.*option order.*token.*tool|直接.*累积.*开放式.*改写.*选项顺序.*Token.*工具/isu,
    );
    assert.match(nodes.get('judge')?.label ?? '', /factuality.*clinical relevance|事实性.*临床相关性/isu);
    assert.match(nodes.get('experts')?.label ?? '', /top 5[–-]10.*metric hacking|前 5[—–-]10.*指标投机/isu);
    assert.match(nodes.get('ranking')?.label ?? '', /weighted sum.*exact weights.*not public|加权总分.*具体权重.*未公开/isu);
  }
});

test('keeps CursorBench report snapshot, live 3.2 drift, and proprietary boundary explicit', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('CursorBench', language));
    const edges = edgeMap(readArch('CursorBench', language));
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /2603\.24477v2.*no public repo.*2026-07-18|2603\.24477v2.*无公开仓库.*2026-07-18/isu,
    );
    assert.match(nodes.get('blame')?.label ?? '', /committed code.*agent request|提交代码.*智能体请求/isu);
    assert.match(nodes.get('pairs')?.label ?? '', /developer query.*ground-truth solution|开发者请求.*标准解决方案/isu);
    assert.match(nodes.get('curate')?.label ?? '', /internal.*controlled.*few months|内部.*受控.*数月/isu);
    assert.match(
      nodes.get('versions')?.label ?? '',
      /3\.0.*edit.*refactor.*bugfix.*3\.1.*understand.*plan.*review.*3\.2.*instruction.*tool use|3\.0.*编辑.*重构.*修复.*3\.1.*理解.*规划.*审查.*3\.2.*指令遵循.*工具使用/isu,
    );
    assert.match(nodes.get('suite')?.label ?? '', /3\.2.*Jul.*8.*2026|3\.2.*2026.*7.*8/isu);
    assert.match(nodes.get('run')?.label ?? '', /initialize.*codebase.*prompt.*production|初始化.*代码库.*提示.*生产/isu);
    assert.match(nodes.get('graders')?.label ?? '', /agentic graders.*underspecified|智能体裁判.*欠指定/isu);
    assert.doesNotMatch(nodes.get('graders')?.label ?? '', /accept.*multiple valid|接受.*多种有效/iu);
    assert.match(nodes.get('axes')?.label ?? '', /correctness.*quality.*efficiency.*interaction|正确性.*质量.*效率.*交互/isu);
    assert.match(nodes.get('leaderboard')?.label ?? '', /score.*cost.*tokens.*steps|得分.*成本.*Token.*步数/isu);
    assert.match(
      nodes.get('cost')?.label ?? '',
      /input.*cache[- ]read.*cache[- ]write.*output.*same task weights|输入.*缓存读取.*缓存写入.*输出.*同一任务权重/isu,
    );
    assert.match(nodes.get('version_rule')?.label ?? '', /within one eval version.*variance|同一评测版本.*方差/isu);
    assert.match(
      nodes.get('snapshot')?.label ?? '',
      /CursorBench-3.*181.*390.*not.*3\.2|CursorBench-3.*181.*390.*不是.*3\.2/isu,
    );
    assert.match(
      nodes.get('boundary')?.label ?? '',
      /task count.*items.*grader prompts.*harness.*score weights.*not public|任务数.*题目.*裁判提示.*执行框架.*得分权重.*未公开/isu,
    );
    assert.match(
      nodes.get('contamination')?.label ?? '',
      /Grok 4\.5.*older Cursor snapshot.*impact unclear.*removed|Grok 4\.5.*旧 Cursor 快照.*影响不明.*已移除/isu,
    );
    assert.match(
      nodes.get('online')?.label ?? '',
      /cross-check.*separate.*suite construction|交叉核对.*套件构建流程分离/isu,
    );
    assert.doesNotMatch(nodes.get('online')?.label ?? '', /feed regressions|回归反馈/iu);
    assert.ok(edges.has('axes->online:optional'));
    assert.ok(!edges.has('online->curate:optional'));
  }
});

test('keeps CyScenarioBench working-draft methodology and non-formula measures exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('CyScenarioBench', language));
    const edges = edgeMap(readArch('CyScenarioBench', language));
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /working draft.*2025-12-05.*2026-07-16.*no independent paper|工作稿.*2025-12-05.*2026-07-16.*无独立论文/isu,
    );
    assert.match(nodes.get('extract')?.label ?? '', /decisions.*constraints.*environmental conditions|决策.*约束.*环境条件/isu);
    assert.match(nodes.get('tree')?.label ?? '', /preconditions.*dependencies.*capability requirements|前置条件.*依赖.*能力要求/isu);
    assert.match(
      nodes.get('environment')?.label ?? '',
      /container.*operating systems.*applications.*controls.*voice.*personas.*websites|容器.*操作系统.*应用.*防御.*语音.*人物.*网站/isu,
    );
    assert.match(nodes.get('novelty')?.label ?? '', /built from scratch.*not (?:from )?published CTF.*private|从零构建.*不使用公开 CTF.*私有/isu);
    assert.equal(nodes.get('levels')?.type, 'decision');
    assert.ok(edges.has('levels->task:primary'));
    assert.ok(edges.has('levels->path:primary'));
    assert.ok(edges.has('levels->campaign:primary'));
    assert.match(nodes.get('task')?.label ?? '', /atomic capability.*no sequencing|原子能力.*不含序列/isu);
    assert.match(nodes.get('path')?.label ?? '', /attack-tree branch.*planning.*long context|攻击树分支.*规划.*长上下文/isu);
    assert.match(nodes.get('campaign')?.label ?? '', /full simulation.*friction.*adaptation.*recovery|完整仿真.*阻力.*适应.*恢复/isu);
    assert.match(
      nodes.get('metrics')?.label ?? '',
      /branch.*constraint.*context drift.*dead end.*impossible state|分支.*约束.*上下文漂移.*死路.*不可能状态/isu,
    );
    assert.match(
      nodes.get('boundary')?.label ?? '',
      /no task count.*split.*scoring formula.*harness|无题量.*划分.*评分公式.*执行框架/isu,
    );
    assert.match(
      nodes.get('example_config')?.label ?? '',
      /GPT-5\.6 Sol.*11.*7\/11.*28%.*not canonical|GPT-5\.6 Sol.*11.*7\/11.*28%.*非标准/isu,
    );
  }
});

test('pins A10i paper, repository, website, and non-paper boundaries in detail records', () => {
  const critpt = readDetail('CritPt');
  assert.equal(critpt.paper_url, 'https://arxiv.org/abs/2509.26574v4');
  assert.equal(critpt.arxiv_pdf_url, 'https://arxiv.org/pdf/2509.26574v4');
  assert.match(critpt.drawio_review_note, /§§2\.2[–-]4\.3.*17c2545c302762d2f2d644d923ea4c301605cb08.*9b9fc8498596ec08ab5437a72f4aa18beef2b876/isu);
  assert.match(critpt.metric_en, /average accuracy.*5.*70.*consistently solved.*4\/5/isu);

  const cure = readDetail('CureBench');
  assert.equal(cure.paper_url, 'https://openreview.net/forum?id=rD9YGynuT8');
  assert.equal(cure.arxiv_pdf_url, '');
  assert.equal(cure.pdf_filename, '');
  assert.match(cure.drawio_review_note, /no standalone.*OpenReview.*rD9YGynuT8.*5eada4b2c7357ad694a7bf265f546e3e80c067cc.*679b08d07d8d1e34197859422b44af5554462b1b/isu);
  assert.match(cure.drawio_review_note, /12 named.*13.*unreconciled.*no public dataset revision/isu);

  const cursor = readDetail('CursorBench');
  assert.equal(cursor.paper_url, 'https://arxiv.org/abs/2603.24477v2');
  assert.equal(cursor.arxiv_pdf_url, 'https://arxiv.org/pdf/2603.24477v2');
  assert.equal(cursor.pdf_filename, '');
  assert.match(cursor.drawio_review_note, /no CursorBench-only standalone paper.*2603\.24477v2.*933e9f2720966b6d744b8295af0fe2c2fb4c3d9efc3d23a4d27b4b0b08c0d068/isu);
  assert.match(cursor.drawio_review_note, /no public repository.*no public dataset/isu);
  assert.match(cursor.drawio_review_note, /3\.0.*3\.1.*3\.2.*July 8, 2026/isu);
  assert.match(cursor.drawio_review_note, /retrieved 2026-07-18/isu);
  assert.match(cursor.metric_en, /CursorBench 3\.2.*same task weights.*weights.*undisclosed/isu);

  const cy = readDetail('CyScenarioBench');
  assert.equal(cy.paper_url, '');
  assert.equal(cy.arxiv_pdf_url, '');
  assert.equal(cy.pdf_filename, '');
  assert.match(cy.drawio_review_note, /working draft.*2025-12-05.*last-modified 2026-07-16.*retrieved 2026-07-18/isu);
  assert.match(cy.drawio_review_note, /no independent paper.*no public repository.*no public dataset.*no scoring formula/isu);
});

test('keeps every A10i detail fallback synchronized with reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(arch),
        `${id}.${language} full fallback`,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10i', () => {
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

test('reproduces all eight A10i SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10i-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x',
          '-f', 'svg',
          '--svg-theme', 'light',
          '-o', generatedSvg,
          `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assert.equal(
          readFileSync(generatedSvg, 'utf8'),
          readFileSync(`${base}.svg`, 'utf8'),
          `${id}.${language}.svg export freshness`,
        );

        execFileSync(drawioDesktop, [
          '-x',
          '-f', 'png',
          '-o', generatedPng,
          `${base}.drawio`,
        ], { stdio: 'pipe' });
        assert.deepEqual(
          readFileSync(generatedPng),
          readFileSync(`${base}.png`),
          `${id}.${language}.png export freshness`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10i specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10i-'));
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
