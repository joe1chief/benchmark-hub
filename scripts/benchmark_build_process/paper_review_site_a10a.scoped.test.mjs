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
const benchmarkIds = ['BLINK', 'BRIGHT-Pro', 'CValues', 'CWEval'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const blinkSpecMeta = {
  en: [
    'meta:',
    '  profile: academic-paper',
    '  source: generated',
    '  theme: academic-color',
    '  layout: horizontal',
    '  routing: orthogonal',
    '  title: BLINK Build Process',
    '  description: Paper-aligned construction and evaluation with the pinned HF release separated from a README count discrepancy.',
    '  legend: >-',
    '    Solid arrows show dataset construction and model scoring; dashed arrows identify human, caption-only, and visual',
    '    prompt diagnostic branches.',
  ].join('\n'),
  zh: [
    'meta:',
    '  profile: academic-paper',
    '  source: generated',
    '  theme: academic-color',
    '  layout: horizontal',
    '  routing: orthogonal',
    '  title: BLINK 构建流程',
    '  description: 展示论文对齐构建与评测，并把固定 HF 发布与 README 计数不一致分开。',
    '  legend: 实线表示数据构建与模型评分；虚线表示人类、纯描述和视觉提示诊断分支。',
  ].join('\n'),
};
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
    const arrow = edge.type === 'primary' ? '-->' : '-.->';
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function readSpecMeta(spec) {
  const nodesIndex = spec.indexOf('\nnodes:');
  assert.notEqual(nodesIndex, -1, 'spec must contain a nodes section');
  return spec.slice(0, nodesIndex);
}

function readSpecEdgeWaypoints(spec, from, to) {
  const match = spec.match(new RegExp(
    `(?:^|\\n)  - from: ${from}\\n    to: ${to}\\n([\\s\\S]*?)(?=\\n  - from: |\\nmodules:)`,
    'u',
  ));
  assert.ok(match, `missing edge ${from}->${to}`);
  return [...match[1].matchAll(
    /\n      - x: (-?\d+(?:\.\d+)?)\n        'y': (-?\d+(?:\.\d+)?)/gu,
  )].map(point => ({ x: Number(point[1]), y: Number(point[2]) }));
}

function decodeXmlAttribute(value) {
  return value
    .replace(/&#xa;/gu, '\n')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

function readDrawioNodeBox(drawio, label) {
  for (const match of drawio.matchAll(
    /<mxCell id="([^"]+)" value="([^"]*)"[^>]* vertex="1"[^>]*><mxGeometry x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)" width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)" as="geometry"\/><\/mxCell>/gu,
  )) {
    if (decodeXmlAttribute(match[2]) === label) {
      return {
        id: match[1],
        x: Number(match[3]),
        y: Number(match[4]),
        width: Number(match[5]),
        height: Number(match[6]),
      };
    }
  }
  assert.fail(`missing drawio node ${label}`);
}

function readDrawioEdge(drawio, sourceId, targetId) {
  const match = drawio.match(new RegExp(
    `<mxCell ([^>]*edge="1"[^>]*source="${sourceId}"[^>]*target="${targetId}"[^>]*)>([\\s\\S]*?)<\\/mxCell>`,
    'u',
  ));
  assert.ok(match, `missing drawio edge ${sourceId}->${targetId}`);
  return {
    attributes: match[1],
    waypoints: [...match[2].matchAll(
      /<mxPoint x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)"\/>/gu,
    )].map(point => ({ x: Number(point[1]), y: Number(point[2]) })),
  };
}

function segmentIntersectsBox(start, end, box) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const boundaries = [
    [-deltaX, start.x - box.x],
    [deltaX, box.x + box.width - start.x],
    [-deltaY, start.y - box.y],
    [deltaY, box.y + box.height - start.y],
  ];
  let lower = 0;
  let upper = 1;
  for (const [direction, distance] of boundaries) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) lower = Math.max(lower, ratio);
    else upper = Math.min(upper, ratio);
    if (lower > upper) return false;
  }
  return true;
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10a packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual native-text labels within reviewed boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 46], ['zh', 28]]) {
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

test('keeps BLINK canonical paper and HF counts separate from README drift', () => {
  const routes = new Map();
  for (const language of ['en', 'zh']) {
    const arch = readArch('BLINK', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    const spec = readSpec('BLINK', language);
    assert.equal(readSpecMeta(spec), blinkSpecMeta[language], `${language} complete spec meta`);
    assert.doesNotMatch(readSpecMeta(spec), /count typo|计数笔误/iu);
    assert.match(
      nodes.get('canonical_release')?.label ?? '',
      /paper.*HF.*3,?807.*1,?901.*1,?906.*a3666eb|论文.*HF.*3,?807.*1,?901.*1,?906.*a3666eb/isu,
    );
    assert.match(
      nodes.get('readme_drift')?.label ?? '',
      /README.*1,?907.*(?:paper.*HF|论文.*HF).*1,?906/isu,
    );
    assert.doesNotMatch(nodes.get('readme_drift')?.label ?? '', /typo|笔误/iu);
    assert.ok(edges.has('canonical_release->readme_drift:data'));
    assert.ok(edges.has('canonical_release->model_setup:primary'));
    assert.match(
      spec,
      /from: answer_parse\s+to: report\s+type: primary\s+waypoints:\s+- x: 2320\s+'y': 560\s+- x: 2320\s+'y': 900\s+- x: 1584\s+'y': 900/isu,
      `${language} answer-to-report route must stay outside the long diagnostic corridor`,
    );
    const waypoints = readSpecEdgeWaypoints(spec, 'human_reference', 'report');
    assert.deepEqual(waypoints, [
      { x: 1120, y: 900 },
      { x: 1400, y: 900 },
      { x: 1400, y: 1010 },
    ], `${language} human-reference route`);
    routes.set(language, waypoints);
    const drawio = readDrawio('BLINK', language);
    const source = readDrawioNodeBox(drawio, nodes.get('human_reference').label);
    const obstacle = readDrawioNodeBox(drawio, nodes.get('caption_analysis').label);
    const target = readDrawioNodeBox(drawio, nodes.get('report').label);
    const renderedEdge = readDrawioEdge(drawio, source.id, target.id);
    assert.deepEqual(renderedEdge.waypoints, waypoints, `${language} rendered waypoints`);
    assert.doesNotMatch(renderedEdge.attributes, /(?:entry|exit)[XY]=/u);
    const route = [
      { x: source.x + source.width / 2, y: source.y + source.height / 2 },
      ...renderedEdge.waypoints,
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    ];
    for (let index = 1; index < route.length; index += 1) {
      assert.equal(
        segmentIntersectsBox(route[index - 1], route[index], obstacle),
        false,
        `${language} human_reference->report segment ${index} crosses caption_analysis`,
      );
    }
    assert.match(nodes.get('model_setup')?.label ?? '', /temperature 0.*retry.*10.*no resiz|温度 0.*重试.*10.*不缩放/isu);
    assert.match(nodes.get('answer_parse')?.label ?? '', /predefined.*GPT-3\.5.*fallback|预定义.*GPT-3\.5.*回退/isu);
  }
  assert.deepEqual(routes.get('zh'), routes.get('en'), 'BLINK bilingual route geometry');
});

test('keeps BRIGHT-Pro paper annotations and pinned release semantics distinct', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BRIGHT-Pro', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('weights')?.label ?? '', /paper.*Likert 1.*5.*normalize|论文.*Likert 1.*5.*归一/isu);
    assert.match(
      nodes.get('release_boundary')?.label ?? '',
      /HF.*2,?763.*\{1, ?2, ?3\}.*dbdc22b|HF.*2,?763.*\{1, ?2, ?3\}.*dbdc22b/isu,
    );
    assert.ok(edges.has('release->release_boundary:primary'));
    assert.ok(edges.has('release_boundary->static_eval:primary'));
    assert.ok(edges.has('release_boundary->agentic_sample:primary'));
    assert.match(nodes.get('agentic_sample')?.label ?? '', /175.*25.*seed.?42|175.*25.*种子.?42/isu);
    assert.match(nodes.get('agent_loop')?.label ?? '', /GPT-5-mini.*Qwen3\.5.*top.?5.*R.*1.*2.*3.*adaptive|GPT-5-mini.*Qwen3\.5.*Top.?5.*R.*1.*2.*3.*自适应/isu);
    assert.match(nodes.get('judge')?.label ?? '', /GPT-5.*0.*0\.5.*1.*overall.*1.*5|GPT-5.*0.*0\.5.*1.*总体.*1.*5/isu);
  }
});

test('keeps CValues paper scope distinct from the smaller public release', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CValues', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('paper_release')?.label ?? '', /paper.*2,?100.*4,?312.*2,?600.*1,?712|论文.*2,?100.*4,?312.*2,?600.*1,?712/isu);
    assert.match(
      nodes.get('public_release')?.label ?? '',
      /GitHub.*664.*1,?712.*safety.*withheld.*3018d388|GitHub.*664.*1,?712.*安全.*未公开.*3018d388/isu,
    );
    assert.ok(edges.has('paper_release->public_release:data'));
    assert.notEqual(nodes.get('human_split')?.type, 'decision');
    assert.match(nodes.get('safety_human')?.label ?? '', /three.*annotator.*majority.*safe.*ratio|三.*标注.*多数.*安全.*占比/isu);
    assert.match(nodes.get('resp_human')?.label ?? '', /ChatPLUG-13B.*three.*top-k.*expert.*1.*10|ChatPLUG-13B.*三.*top-k.*专家.*1.*10/isu);
    assert.match(nodes.get('auto_score')?.label ?? '', /accuracy.*excluding refus|准确率.*排除拒答/isu);
  }
});

test('keeps CWEval dual-oracle construction and Docker execution explicit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CWEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence_boundary')?.label ?? '', /paper.*III.*V.*repo.*8112fb4|论文.*III.*V.*仓库.*8112fb4/isu);
    assert.notEqual(nodes.get('requirements')?.type, 'decision');
    assert.match(nodes.get('references')?.label ?? '', /secure.*both.*insecure.*functional.*fail.*security|安全.*两类.*不安全.*功能.*安全.*失败/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /119.*31.*5.*11.*C.*memory|119.*31.*5.*11.*C.*内存/isu);
    assert.match(nodes.get('generate')?.label ?? '', /cweval\/generate\.py.*gen.*n samples|cweval\/generate\.py.*gen.*n 个样本/isu);
    assert.match(nodes.get('execute')?.label ?? '', /Docker.*evaluate\.py pipeline.*both oracle|Docker.*evaluate\.py pipeline.*两类判定/isu);
    assert.ok(edges.has('evidence_boundary->design:primary'));
    assert.ok(edges.has('requirements->functional:primary'));
    assert.ok(edges.has('requirements->security:primary'));
    assert.ok(edges.has('functional->references:primary'));
    assert.ok(edges.has('security->references:primary'));
    assert.match(
      nodes.get('metrics')?.label ?? '',
      /func@k.*func-sec@k.*(?:unbiased|无偏).*E_tasks\[1\s*-\s*C\(n\s*-\s*c,\s*k\)\s*\/\s*C\(n,\s*k\)\].*c_func.*functional|func@k.*func-sec@k.*(?:unbiased|无偏).*E_tasks\[1\s*-.*C\(n\s*-\s*c,\s*k\)\s*\/\s*C\(n,\s*k\)\].*c_func.*功能/isu,
    );
    assert.match(nodes.get('metrics')?.label ?? '', /c_func-sec.*functional.*security|c_func-sec.*功能.*安全/isu);
  }
});

test('pins paper, repository, and release evidence in A10a details', () => {
  const blink = readDetail('BLINK');
  assert.match(blink.homepage, /zeyofu\.github\.io\/blink/iu);
  assert.match(blink.drawio_review_note, /2404\.12390v4.*§3\.2.*§4\.1.*Appendix A/isu);
  assert.match(blink.drawio_review_note, /529b0ba.*a3666eb.*README.*eval\/query_model\.py.*eval\/evaluate\.py/isu);
  assert.match(blink.drawio_review_note, /1,?906.*README.*1,?907.*do not explain the difference/isu);
  assert.doesNotMatch(blink.drawio_review_note, /typo/iu);

  const bright = readDetail('BRIGHT-Pro');
  assert.match(bright.homepage, /github\.com\/yale-nlp\/Bright-Pro/iu);
  assert.match(bright.drawio_review_note, /2605\.04018v1.*§§3\.1.*3\.4.*§§4\.1.*4\.3.*Appendices D.*F/isu);
  assert.match(bright.drawio_review_note, /5df9e9b.*dbdc22b.*agentic_sample_ids\.json.*retrieval\/metrics\.py.*judge\.py/isu);
  assert.match(bright.drawio_review_note, /Likert 1.*5.*2,?763.*\{1, ?2, ?3\}/isu);

  const cvalues = readDetail('CValues');
  assert.equal(cvalues.openness, 'partly public');
  assert.equal(cvalues.openness_en, 'Partly Public');
  assert.match(cvalues.homepage, /github\.com\/X-PLUG\/CValues/iu);
  assert.match(cvalues.drawio_review_note, /2307\.09705v1.*§§2\.1.*2\.3.*Figure 3/isu);
  assert.match(cvalues.drawio_review_note, /3018d388.*README.*cvalues_responsibility_prompts\.jsonl.*cvalues_responsibility_mc\.jsonl/isu);
  assert.match(cvalues.drawio_review_note, /1,?300.*2,?600.*withheld.*664.*1,?712|1,?300.*2,?600.*未公开.*664.*1,?712/isu);

  const cweval = readDetail('CWEval');
  assert.match(cweval.homepage, /github\.com\/Co1lin\/CWEval/iu);
  assert.match(cweval.drawio_review_note, /2501\.08200v1.*Sections III.*V/isu);
  assert.match(cweval.drawio_review_note, /8112fb4.*benchmark\/.*cweval\/generate\.py.*cweval\/evaluate\.py.*cweval\/run_tests\.py/isu);
  assert.match(cweval.metric_en, /1\s*-\s*C\(n-c,k\)\/C\(n,k\).*c_func.*c_func-sec/isu);
  assert.match(cweval.drawio_review_note, /1\s*-\s*C\(n-c,k\)\/C\(n,k\).*c_func.*c_func-sec/isu);
});

test('keeps every A10a detail fallback synchronized with reviewed architecture', () => {
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

test('publishes native fixed-light SVG and readable PNG pairs for A10a', () => {
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

test('strictly rebuilds and normalizes all eight A10a specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10a-'));
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
