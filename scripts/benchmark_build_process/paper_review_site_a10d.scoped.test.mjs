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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['ChemBench', 'Chinese_SimpleQA', 'CiteBench', 'ClassBench'];
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
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const readSpec = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
);
const readDrawio = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.drawio`),
  'utf8',
);
const readSvg = (id, language = 'en') => readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.svg`),
  'utf8',
);
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

function decodeTagEntities(value) {
  return String(value)
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#95;/gu, '_');
}

function normalizeDrawioContractEntities(id, value) {
  // The DSL rejects tag-like labels and treats ASCII underscores as math, so the
  // canonical specs/sidecars stay entity-safe while checked-in Draw.io renders one decode.
  let normalized = String(value);
  if (id === 'CiteBench') {
    normalized = normalized.replace(
      /&amp;lt;(\/?(?:abs|ctx_[ab]))&amp;gt;/gu,
      '&lt;$1&gt;',
    );
  }
  if (id === 'ClassBench') {
    normalized = normalized.replace(/&amp;#95;/gu, '&#95;');
  }
  return normalized;
}

function drawioNodeCellId(id, language, nodeId) {
  const index = readArch(id, language).nodes.findIndex(node => node.id === nodeId);
  assert.notEqual(index, -1, `${id}.${language} missing node ${nodeId}`);
  return String(index + 2);
}

function drawioNodeGeometry(id, language, nodeId) {
  const cellId = drawioNodeCellId(id, language, nodeId);
  const match = readDrawio(id, language).match(new RegExp(
    `<mxCell id="${cellId}"[^>]* vertex="1"[^>]*><mxGeometry x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"`,
    'u',
  ));
  assert.ok(match, `${id}.${language} missing geometry for ${nodeId}`);
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };
}

function drawioEdgeCell(id, language, from, to) {
  const source = drawioNodeCellId(id, language, from);
  const target = drawioNodeCellId(id, language, to);
  const match = readDrawio(id, language).match(new RegExp(
    `<mxCell id="([^"]+)" value="[^"]*" style="([^"]*)" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">([\\s\\S]*?)</mxGeometry></mxCell>`,
    'u',
  ));
  assert.ok(match, `${id}.${language} missing draw.io edge ${from}->${to}`);
  return {
    id: match[1],
    style: match[2],
    waypoints: [...match[3].matchAll(
      /<mxPoint x="([^"]+)" y="([^"]+)"\/>/gu,
    )].map(([, x, y]) => ({ x: Number(x), y: Number(y) })),
  };
}

function styleNumber(style, name) {
  const match = style.match(new RegExp(`(?:^|;)${name}=([^;]+)`, 'u'));
  assert.ok(match, `missing ${name} in edge style`);
  return Number(match[1]);
}

function svgEdgePolyline(id, language, from, to) {
  const edgeCell = drawioEdgeCell(id, language, from, to);
  const match = readSvg(id, language).match(new RegExp(
    `<g data-cell-id="${edgeCell.id}"><g><path d="([^"]+)" fill="none"`,
    'u',
  ));
  assert.ok(match, `${id}.${language} missing SVG edge path ${from}->${to}`);
  assert.doesNotMatch(match[1], /[CQAS]/u, `${id}.${language} ${from}->${to} needs a clear orthogonal route without line jumps`);
  const points = [...match[1].matchAll(
    /[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gu,
  )].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
  assert.ok(points.length >= 2, `${id}.${language} ${from}->${to} SVG polyline`);
  return points;
}

function svgNodeRect(id, language, nodeId) {
  const marker = `<g data-cell-id="${drawioNodeCellId(id, language, nodeId)}">`;
  const svg = readSvg(id, language);
  const start = svg.indexOf(marker);
  assert.notEqual(start, -1, `${id}.${language} missing SVG node ${nodeId}`);
  const match = svg.slice(start, start + 2000).match(
    /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/u,
  );
  assert.ok(match, `${id}.${language} ${nodeId} must render as a rectangle`);
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };
}

function polylineSegments(points) {
  return points.slice(1).map((point, index) => ({ from: points[index], to: point }));
}

function segmentCrossesRect(segment, rect) {
  const left = rect.x + 1;
  const right = rect.x + rect.width - 1;
  const top = rect.y + 1;
  const bottom = rect.y + rect.height - 1;
  if (segment.from.x === segment.to.x) {
    const low = Math.min(segment.from.y, segment.to.y);
    const high = Math.max(segment.from.y, segment.to.y);
    return segment.from.x > left && segment.from.x < right && low < bottom && high > top;
  }
  if (segment.from.y === segment.to.y) {
    const low = Math.min(segment.from.x, segment.to.x);
    const high = Math.max(segment.from.x, segment.to.x);
    return segment.from.y > top && segment.from.y < bottom && low < right && high > left;
  }
  assert.fail(`non-orthogonal SVG segment ${JSON.stringify(segment)}`);
}

function longestVerticalSegment(points, context) {
  const vertical = polylineSegments(points)
    .filter(segment => segment.from.x === segment.to.x)
    .map(segment => ({
      x: segment.from.x,
      low: Math.min(segment.from.y, segment.to.y),
      high: Math.max(segment.from.y, segment.to.y),
      length: Math.abs(segment.from.y - segment.to.y),
    }))
    .sort((left, right) => right.length - left.length);
  assert.ok(vertical.length > 0, `${context} must contain a vertical corridor`);
  return vertical[0];
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
    const arrow = edge.type === 'primary' ? '-->' : '-.->';
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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10d packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('pins ChemBench curation, Mini selection, separate confidence elicitation, and expert baseline', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ChemBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('manual')?.label ?? '', /1,?039.*exam.*exercise.*textbook|1,?039.*考试.*习题.*教材/isu);
    assert.match(nodes.get('programmatic')?.label ?? '', /1,?749.*chemical.*data|1,?749.*化学.*数据/isu);
    assert.match(nodes.get('review')?.label ?? '', /at least two.*in addition.*original curator.*schema|原整理者之外.*至少两名.*Schema/isu);
    assert.match(nodes.get('labels')?.label ?? '', /topic.*skill.*difficulty|主题.*技能.*难度/isu);
    assert.match(nodes.get('corpus')?.label ?? '', /2,?788.*2,?544.*244/isu);
    assert.match(nodes.get('mini')?.label ?? '', /236.*all advanced.*max(?:imum)? 3.*exclude intuition|236.*全部高级.*最多 3.*排除直觉/isu);
    assert.match(nodes.get('system')?.label ?? '', /any.*text.*tool-augmented|任何.*文本.*工具增强/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /completion.*instruction.*SMILES.*equation.*unit|补全.*指令.*SMILES.*方程.*单位/isu);
    assert.match(nodes.get('inference')?.label ?? '', /greedy.*temperature 0.*separate.*confidence.*1.?5|贪心.*温度 0.*独立.*置信度.*1.?5/isu);
    assert.match(nodes.get('parse')?.label ?? '', /ANSWER.*choice.*scientific notation.*word.*number.*LLM fallback|ANSWER.*选项.*科学计数.*单词.*数字.*LLM.*回退/isu);
    assert.match(nodes.get('human')?.label ?? '', /19.*all 236.*tool.*no-tool.*exclude.*LLM|19.*全部 236.*工具.*无工具.*禁止.*LLM/isu);
    assert.match(nodes.get('report')?.label ?? '', /strict.*correct.*verbalized confidence|严格.*正确.*口头置信度/isu);
    assert.ok(edges.has('manual->schema:primary'));
    assert.ok(edges.has('programmatic->schema:primary'));
    assert.ok(edges.has('corpus->mini:data'));
    assert.ok(edges.has('mini->human:data'));
    assert.ok(edges.has('inference->confidence:data'));
    assert.ok(edges.has('parse->report:primary'));
    assert.ok(edges.has('confidence->report:data'));
    assert.ok(edges.has('human->report:data'));
  }
});

test('keeps Chinese SimpleQA automated ordering, attrition accounting, adjudication, and exact formulas', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Chinese_SimpleQA', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('knowledge')?.label ?? '', /6.*99.*Wikipedia|6.*99.*维基百科/isu);
    assert.match(nodes.get('generate')?.label ?? '', /GPT-4o-0806/iu);
    assert.match(nodes.get('criteria')?.label ?? '', /objective.*unique.*timeless.*2023-12-31|客观.*唯一.*不随时间.*2023-12-31/isu);
    assert.match(nodes.get('rag')?.label ?? '', /LlamaIndex.*Google.*Bing/isu);
    assert.match(nodes.get('difficulty')?.label ?? '', /GPT-4o.*Llama-3-70B.*Qwen2\.5-72B.*GLM-4-Plus.*all four|GPT-4o.*Llama-3-70B.*Qwen2\.5-72B.*GLM-4-Plus.*全部四个/isu);
    assert.match(nodes.get('attrition')?.label ?? '', /10,?000.*6,?310.*2,?840.*3,?470|10,?000.*6,?310.*2,?840.*3,?470/isu);
    assert.match(nodes.get('dual_human')?.label ?? '', /two independent.*either.*discard.*at least 2.*authoritative|两名独立.*任一.*丢弃.*至少 2.*权威/isu);
    assert.match(nodes.get('adjudicate')?.label ?? '', /disagree.*third|不一致.*第三/isu);
    assert.match(nodes.get('agreement')?.label ?? '', /fully match.*generated|(?:完全一致.*生成|生成.*完全一致)/isu);
    assert.match(nodes.get('dataset')?.label ?? '', /3,?000/isu);
    assert.match(nodes.get('grader')?.label ?? '', /Correct.*Not Attempted.*Incorrect|正确.*未尝试.*错误/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /CGA\s*=\s*CO\s*\/\s*\(CO\s*\+\s*IN\).*F\s*=\s*2.*CO.*CGA\s*\/\s*\(CO\s*\+\s*CGA\)/isu);
    assert.ok(edges.has('criteria->rag:primary'));
    assert.ok(edges.has('rag->difficulty:primary'));
    assert.ok(edges.has('difficulty->attrition:primary'));
    assert.ok(edges.has('attrition->dual_human:primary'));
    assert.ok(edges.has('dual_human->adjudicate:primary'));
    assert.ok(edges.has('adjudicate->agreement:primary'));
  }
});

test('corrects CiteBench input tags, anchor mapping, evaluation branches, and human-study scope', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CiteBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('sources')?.label ?? '', /ABURAED.*CHEN.*Delve.*S2ORC.*LU.*XING/isu);
    assert.match(nodes.get('task')?.label ?? '', /cited.*documents.*citing.*source.*contexts.*original citation|被引.*文档.*施引.*上下文.*原始引文/isu);
    assert.match(nodes.get('transform')?.label ?? '', /source-specific.*no instance-level filtering|来源专属.*无实例级筛选/isu);
    const schemaLabel = decodeTagEntities(nodes.get('schema')?.label ?? '');
    const schemaSpec = readSpec('CiteBench', language);
    assert.match(schemaSpec, /&lt;abs&gt;…&lt;\/abs&gt;/u);
    assert.match(schemaSpec, /&lt;ctx_b&gt;…&lt;\/ctx_b&gt;/u);
    assert.match(schemaSpec, /&lt;ctx_a&gt;…&lt;\/ctx_a&gt;/u);
    assert.doesNotMatch(schemaSpec, /[＜＞]/u);
    for (const [opening, closing] of [
      ['<abs>', '</abs>'],
      ['<ctx_b>', '</ctx_b>'],
      ['<ctx_a>', '</ctx_a>'],
    ]) {
      assert.ok(
        schemaLabel.split(/\r?\n/u).some(line => line.includes(opening) && line.includes(closing)),
        `${language} must show the complete ${opening}${closing} wrapper`,
      );
    }
    assert.doesNotMatch(schemaLabel, /[＜＞]/u);
    assert.match(schemaLabel, /<abs>.*<\/abs>.*citing.*<ctx_b>.*<\/ctx_b>.*untagged.*cited.*<ctx_a>.*<\/ctx_a>|<abs>.*<\/abs>.*施引.*<ctx_b>.*<\/ctx_b>.*无标签.*被引.*<ctx_a>.*<\/ctx_a>/isu);
    assert.match(nodes.get('anchors')?.label ?? '', /\[0\].*\[1\].*increment.*consistent.*#OTHEREFR|\[0\].*\[1\].*递增.*一致.*#OTHEREFR/isu);
    assert.match(nodes.get('splits')?.label ?? '', /322,?037.*23,?016.*13,?712.*358,?765/isu);
    assert.match(nodes.get('baselines')?.label ?? '', /LEAD.*TextRank.*LexRank.*LED/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /HuggingFace.*ROUGE-1.*ROUGE-2.*ROUGE-L.*no stemming.*BERTScore|HuggingFace.*ROUGE-1.*ROUGE-2.*ROUGE-L.*不词干化.*BERTScore/isu);
    assert.match(nodes.get('transfer')?.label ?? '', /led-base-\[X\].*in-domain.*cross-dataset|led-base-\[X\].*域内.*跨数据集/isu);
    assert.match(nodes.get('discourse')?.label ?? '', /ACL-ARC.*CORWA.*KL divergence|ACL-ARC.*CORWA.*KL 散度/isu);
    assert.match(nodes.get('human')?.label ?? '', /3 annotators.*150.*XING.*CHEN Delve.*5-point.*readability.*consistency|3 名标注者.*150.*XING.*CHEN Delve.*5 分.*可读性.*一致性/isu);
    assert.ok(edges.has('generation->metrics:primary'));
    assert.ok(edges.has('generation->transfer:primary'));
    assert.ok(edges.has('generation->discourse:primary'));
    assert.ok(edges.has('generation->human:primary'));
    assert.ok(edges.has('discourse->report:primary'));
    assert.ok(edges.has('human->report:primary'));
    assert.equal(edges.has('discourse->human:primary'), false);
  }
});

test('treats ClassBench as the released scheduling_2 AWM environment and preserves synthesis dependencies', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ClassBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('seeds')?.label ?? '', /100.*domain.*names|100.*领域.*名称/isu);
    assert.match(nodes.get('filter')?.label ?? '', /CRUD.*cosine.*0\.85.*category cap|CRUD.*余弦.*0\.85.*类别上限/isu);
    const classbenchLabel = nodes.get('classbench')?.label ?? '';
    const decodedClassbenchLabel = decodeTagEntities(classbenchLabel);
    assert.match(decodedClassbenchLabel, /ClassBench.*Music School Scheduling.*scheduling_2.*not.*standalone benchmark|ClassBench.*音乐学校排课.*scheduling_2.*不是.*独立基准/isu);
    assert.doesNotMatch(classbenchLabel, /＿/u);
    assert.match(readSpec('ClassBench', language), /scheduling&#95;2/u);
    assert.match(nodes.get('tasks')?.label ?? '', /10.*API-solvable.*post-authentication.*self-contained|10.*API.*登录后.*自包含/isu);
    assert.match(nodes.get('database')?.label ?? '', /minimal.*SQLite.*sample data.*preconditions.*no authentication|最小.*SQLite.*样例数据.*前提.*不含认证/isu);
    assert.match(nodes.get('interface')?.label ?? '', /specification.*Python.*MCP.*FastAPI|规格.*Python.*MCP.*FastAPI/isu);
    assert.match(nodes.get('verifier')?.label ?? '', /per task.*initial.*final.*database.*structured.*criteria|每个任务.*初始.*最终.*数据库.*结构化.*准则/isu);
    assert.match(nodes.get('quality_gate')?.label ?? '', /isolated.*10%.*0%.*startup|隔离.*10%.*0%.*启动/isu);
    assert.match(nodes.get('repair')?.label ?? '', /error.*summary.*up to 5|错误.*摘要.*最多 5/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,?000.*10,?000.*ClassBench.*10/isu);
    assert.match(nodes.get('score')?.label ?? '', /trajectory.*verification.*Completed.*Partially Completed.*Agent Error.*Environment Error|轨迹.*验证.*完成.*部分完成.*Agent 错误.*环境错误/isu);
    assert.ok(edges.has('filter->classbench:primary'));
    assert.ok(edges.has('classbench->tasks:primary'));
    assert.ok(edges.has('tasks->database:primary'));
    assert.ok(edges.has('tasks->interface:primary'));
    assert.ok(edges.has('database->interface:data'));
    assert.ok(edges.has('tasks->verifier:primary'));
    assert.ok(edges.has('database->verifier:data'));
    assert.ok(edges.has('database->quality_gate:primary'));
    assert.ok(edges.has('interface->quality_gate:primary'));
    assert.ok(edges.has('verifier->quality_gate:primary'));
    assert.ok(edges.has('quality_gate->repair:primary'));
    assert.ok(edges.has('repair->quality_gate:data'));
    assert.ok(edges.has('quality_gate->release:primary'));
  }
});

test('routes CiteBench evaluation branches without node crossings or shared report corridors', () => {
  const branchIds = ['metrics', 'transfer', 'discourse', 'human'];
  for (const language of ['en', 'zh']) {
    const transfer = svgNodeRect('CiteBench', language, 'transfer');
    const discourse = svgNodeRect('CiteBench', language, 'discourse');
    const humanPath = svgEdgePolyline('CiteBench', language, 'generation', 'human');
    for (const segment of polylineSegments(humanPath)) {
      assert.equal(segmentCrossesRect(segment, transfer), false, `${language} human edge crosses transfer`);
      assert.equal(segmentCrossesRect(segment, discourse), false, `${language} human edge crosses discourse`);
    }

    const corridors = [];
    const entries = [];
    for (const branchId of branchIds) {
      const points = svgEdgePolyline('CiteBench', language, branchId, 'report');
      corridors.push(longestVerticalSegment(points, `${language} ${branchId}->report`));
      entries.push(points.at(-1));
    }
    for (let left = 0; left < corridors.length; left += 1) {
      for (let right = left + 1; right < corridors.length; right += 1) {
        if (corridors[left].x === corridors[right].x) {
          assert.ok(
            Math.min(corridors[left].high, corridors[right].high)
              - Math.max(corridors[left].low, corridors[right].low) <= 0,
            `${language} report corridors must not share a collinear segment`,
          );
        }
        assert.ok(
          Math.hypot(entries[left].x - entries[right].x, entries[left].y - entries[right].y) >= 20,
          `${language} report entry spacing`,
        );
      }
    }
  }
});

test('separates ClassBench verifier evidence and repair re-test at the quality gate', () => {
  for (const language of ['en', 'zh']) {
    const verifierEdge = drawioEdgeCell('ClassBench', language, 'verifier', 'quality_gate');
    const repairEdge = drawioEdgeCell('ClassBench', language, 'repair', 'quality_gate');
    const gate = drawioNodeGeometry('ClassBench', language, 'quality_gate');
    const verifierEntry = {
      x: gate.x + gate.width * styleNumber(verifierEdge.style, 'entryX'),
      y: gate.y + gate.height * styleNumber(verifierEdge.style, 'entryY'),
    };
    const repairEntry = {
      x: gate.x + gate.width * styleNumber(repairEdge.style, 'entryX'),
      y: gate.y + gate.height * styleNumber(repairEdge.style, 'entryY'),
    };
    assert.equal(styleNumber(verifierEdge.style, 'entryX'), 0, `${language} verifier left face`);
    assert.equal(styleNumber(repairEdge.style, 'entryX'), 1, `${language} repair right face`);
    assert.ok(
      Math.hypot(verifierEntry.x - repairEntry.x, verifierEntry.y - repairEntry.y) >= gate.width,
      `${language} quality-gate entries must remain geometrically separated`,
    );
  }
});

test('pins peer-reviewed papers and official repository or dataset snapshots in detail records', () => {
  const expected = {
    ChemBench: /Nature Chemistry.*2025.*Methods.*Curation workflow.*Model evaluation workflow.*45f8bad.*paper-defined 2,788|Nature Chemistry.*2025.*45f8bad.*2,788/isu,
    Chinese_SimpleQA: /2411\.07140v2.*§§2\.2.*2\.5.*Appendix A.*8b1aa9e.*paper does not name.*grader|2411\.07140v2.*8b1aa9e.*grader/isu,
    CiteBench: /EMNLP 2023.*2023\.emnlp-main\.455.*§§3\.1.*5\.3.*Appendix A\.1.*e0cc3b8/isu,
    ClassBench: /2602\.10090v3.*Figure 2.*§§3\.1.*3\.3.*Table 15.*85e322f.*dde80a0.*scheduling_2/isu,
  };
  for (const [id, pattern] of Object.entries(expected)) {
    assert.match(readDetail(id).drawio_review_note, pattern, id);
  }

  const expectedLocators = {
    ChemBench: [
      'src/chembench/constant.py',
      'src/chembench/extractor.py',
      'reports/confidence_estimates/run_confidence_estimates.py',
    ],
    Chinese_SimpleQA: [
      'chinese_simpleqa_eval.py',
      'judge/chinese_simpleqa_easy.py',
      'data/chinese_simpleqa.jsonl',
    ],
    CiteBench: [
      'DATASET.md',
      'src/data_processing/related_work_benchmark_construction.py',
      'src/rel_work/evaluation.py',
    ],
    ClassBench: [
      'awm/core/pipeline.py',
      'awm/core/verifier.py',
      'gen_scenario.jsonl',
      'gen_tasks.jsonl',
      'gen_db.jsonl',
      'gen_spec.jsonl',
      'gen_envs.jsonl',
      'gen_verifier.jsonl',
    ],
  };
  for (const [id, locators] of Object.entries(expectedLocators)) {
    const note = readDetail(id).drawio_review_note;
    for (const locator of locators) {
      assert.ok(note.includes(locator), `${id} missing source locator ${locator}`);
    }
  }
});

test('keeps every A10d fallback synchronized with the reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10d', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.doesNotMatch(drawio, /\\\(|\\\)/u);
      if (id === 'CiteBench') {
        assert.match(drawio, /&lt;abs&gt;…&lt;\/abs&gt;/u);
        assert.doesNotMatch(drawio, /&amp;lt;\/?(?:abs|ctx_[ab])&amp;gt;/u);
      }
      if (id === 'ClassBench') {
        assert.match(drawio, /scheduling&#95;2/u);
        assert.doesNotMatch(drawio, /scheduling(?:&amp;#95;|＿)2/u);
      }
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const visibleText = svgVisibleText(svg);
      for (const node of readArch(id, language).nodes) {
        for (const line of node.label.split(/\r?\n/u)) {
          assert.ok(visibleText.includes(decodeTagEntities(line)), `${id}.${language} SVG label: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces A10d SVG and PNG exports from their checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10d-exports-'));
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
        if (imageCompare) {
          assert.doesNotThrow(
            () => execFileSync(imageCompare, [
              '-metric', 'AE', generatedPng, `${base}.png`, 'null:',
            ], { stdio: 'pipe' }),
            `${id}.${language}.png pixel freshness`,
          );
        } else {
          assert.equal(sha256(generatedPng), sha256(`${base}.png`), `${id}.${language}.png export freshness`);
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10d specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10d-'));
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
        const generatedDrawio = readFileSync(generated, 'utf8');
        assert.equal(
          normalizeDrawioContractEntities(id, generatedDrawio),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}`,
        );
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
