import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Later A8/A9 contracts own these historical assertions; do not register them.
const superseded = () => {};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'Agent_Red_Teaming_Benchmark',
  'Aider_Polyglot',
  'AlignBench',
  'All-Angles',
  'AlpacaEval',
  'AlpacaEval_2.0',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language) {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readSpec(id, language) {
  return readFileSync(join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`), 'utf8');
}

function readDrawio(id, language) {
  return readFileSync(join(publicDir, 'drawio', id, `${id}.${language}.drawio`), 'utf8');
}

function readSvg(id, language) {
  return readFileSync(join(publicDir, 'drawio', id, `${id}.${language}.svg`), 'utf8');
}

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function nodeMap(arch) {
  return new Map(arch.nodes.map(node => [node.id, node]));
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to, type }) => `${from}->${to}:${type}`));
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function decodeMxValue(value = '') {
  return value
    .replace(/&#(?:10|x0*a);/giu, '\n')
    .replace(/&quot;/gu, '"')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

function parseMxCells(drawio) {
  return [...drawio.matchAll(/<mxCell\b([^>]*)>/gu)].map(([, rawAttributes]) => {
    const attributes = Object.fromEntries(
      [...rawAttributes.matchAll(/([\w:-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, value]),
    );
    return attributes;
  });
}

function drawioNodeCell(id, language, nodeId) {
  const arch = readArch(id, language);
  const label = arch.nodes.find(node => node.id === nodeId)?.label;
  assert.ok(label, `${id}.${language} missing arch node ${nodeId}`);
  const cell = parseMxCells(readDrawio(id, language)).find(candidate => (
    candidate.vertex === '1' && decodeMxValue(candidate.value) === label
  ));
  assert.ok(cell, `${id}.${language} missing drawio node ${nodeId}`);
  return cell;
}

function drawioEdgeCell(id, language, from, to) {
  const drawio = readDrawio(id, language);
  const source = drawioNodeCell(id, language, from);
  const target = drawioNodeCell(id, language, to);
  const edge = parseMxCells(drawio).find(candidate => (
    candidate.edge === '1' && candidate.source === source.id && candidate.target === target.id
  ));
  assert.ok(edge, `${id}.${language} missing drawio edge ${from}->${to}`);
  return edge;
}

function styleNumber(style, key) {
  const match = style.match(new RegExp(`(?:^|;)${key}=([^;]+)(?:;|$)`, 'u'));
  assert.ok(match, `missing ${key} in ${style}`);
  return Number(match[1]);
}

function drawioNodeGeometry(id, language, nodeId) {
  const drawio = readDrawio(id, language);
  const cell = drawioNodeCell(id, language, nodeId);
  const block = drawio.match(new RegExp(`<mxCell\\b[^>]*id="${cell.id}"[^>]*>[\\s\\S]*?<mxGeometry\\b([^>]*)>`, 'u'));
  assert.ok(block, `${id}.${language} missing geometry for ${nodeId}`);
  const attributes = Object.fromEntries(
    [...block[1].matchAll(/([\w:-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, Number(value)]),
  );
  return attributes;
}

function svgCellBlock(id, language, cellId) {
  const svg = readSvg(id, language);
  const match = svg.match(
    new RegExp(`<g data-cell-id="${cellId}">([\\s\\S]*?)(?=<g data-cell-id=|<\\/svg>)`, 'u'),
  );
  assert.ok(match, `${id}.${language} missing SVG cell ${cellId}`);
  return match[1];
}

function svgEdgeSegments(id, language, from, to) {
  const edge = drawioEdgeCell(id, language, from, to);
  const path = svgCellBlock(id, language, edge.id).match(/<path d="([^"]+)"/u)?.[1];
  assert.ok(path, `${id}.${language} missing SVG path for ${from}->${to}`);

  const tokens = path.match(/[MLC]|-?\d+(?:\.\d+)?/gu) ?? [];
  const segments = [];
  let cursor = 0;
  let point;
  while (cursor < tokens.length) {
    const command = tokens[cursor++];
    if (command === 'M' || command === 'L') {
      const next = { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) };
      if (command === 'L' && point && (point.x !== next.x || point.y !== next.y)) {
        segments.push({ from: point, to: next });
      }
      point = next;
      continue;
    }
    if (command === 'C') {
      cursor += 4;
      point = { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) };
      continue;
    }
    assert.fail(`${id}.${language} unsupported SVG path command ${command}`);
  }
  return segments;
}

function svgTranslation(id, language) {
  const anchor = drawioNodeCell(id, language, 'accuracy');
  const geometry = drawioNodeGeometry(id, language, 'accuracy');
  const rect = svgCellBlock(id, language, anchor.id).match(
    /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/u,
  );
  assert.ok(rect, `${id}.${language} missing SVG anchor rectangle`);
  return { x: Number(rect[1]) - geometry.x, y: Number(rect[2]) - geometry.y };
}

function segmentOrientation(segment) {
  if (segment.from.x === segment.to.x) return 'vertical';
  if (segment.from.y === segment.to.y) return 'horizontal';
  return 'diagonal';
}

function intervalOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd))
    - Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd));
}

function segmentIntersectsBoxInterior(segment, box) {
  const orientation = segmentOrientation(segment);
  if (orientation === 'vertical') {
    return segment.from.x > box.x
      && segment.from.x < box.x + box.width
      && intervalOverlap(segment.from.y, segment.to.y, box.y, box.y + box.height) > 0;
  }
  if (orientation === 'horizontal') {
    return segment.from.y > box.y
      && segment.from.y < box.y + box.height
      && intervalOverlap(segment.from.x, segment.to.x, box.x, box.x + box.width) > 0;
  }
  assert.fail(`expected an orthogonal segment, got ${JSON.stringify(segment)}`);
}

function segmentIntersection(first, second) {
  const firstOrientation = segmentOrientation(first);
  const secondOrientation = segmentOrientation(second);
  assert.notEqual(firstOrientation, 'diagonal');
  assert.notEqual(secondOrientation, 'diagonal');

  if (firstOrientation === secondOrientation) {
    const sameLane = firstOrientation === 'vertical'
      ? first.from.x === second.from.x
      : first.from.y === second.from.y;
    if (!sameLane) return undefined;
    const overlap = firstOrientation === 'vertical'
      ? intervalOverlap(first.from.y, first.to.y, second.from.y, second.to.y)
      : intervalOverlap(first.from.x, first.to.x, second.from.x, second.to.x);
    return overlap > 0 ? { kind: 'overlap', length: overlap } : undefined;
  }

  const vertical = firstOrientation === 'vertical' ? first : second;
  const horizontal = firstOrientation === 'horizontal' ? first : second;
  const x = vertical.from.x;
  const y = horizontal.from.y;
  const onVertical = x >= Math.min(horizontal.from.x, horizontal.to.x)
    && x <= Math.max(horizontal.from.x, horizontal.to.x);
  const onHorizontal = y >= Math.min(vertical.from.y, vertical.to.y)
    && y <= Math.max(vertical.from.y, vertical.to.y);
  return onVertical && onHorizontal ? { kind: 'point', x, y } : undefined;
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function fallbackText(id) {
  const detail = readDetail(id);
  return [
    detail.build_method,
    detail.build_method_en,
    detail.mermaid_flowchart,
    detail.flowchart_en,
    detail.flowchart_zh,
  ].filter(value => typeof value === 'string').join('\n');
}

test('keeps all six A3b diagrams bilingual with identical node ids and typed edges', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

superseded('keeps ART on the paper construction path and labels the unreleased private dynamic access model', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Agent_Red_Teaming_Benchmark', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('competition')?.label ?? '', /four waves|四轮/iu);
    assert.match(nodes.get('competition')?.label ?? '', /22/iu);
    assert.match(nodes.get('scenarios')?.label ?? '', /44/iu);
    assert.match(nodes.get('submissions')?.label ?? '', /1\.8 million|180\s*万/iu);
    assert.match(nodes.get('strict_filter')?.label ?? '', /stricter LLM|更严格.*LLM/iu);
    assert.match(nodes.get('query_budgets')?.label ?? '', /k\s*=\s*1.*10.*100/isu);
    assert.match(nodes.get('release_status')?.label ?? '', /private.*dynamic|私有.*动态/isu);
    assert.match(nodes.get('release_status')?.label ?? '', /no.*public|not.*public|未.*公开/isu);
    assert.ok(edges.has('report->release_status:primary'));
  }
  const text = `${fallbackText('Agent_Red_Teaming_Benchmark')}\n${readSpec('Agent_Red_Teaming_Benchmark', 'en')}`;
  assert.doesNotMatch(text, /manual annotation|automatic generation|hybrid approach|consolidate\s*&\s*refine/iu);
});

superseded('preserves the official Aider Polyglot 697 to 225 difficulty-selection contract', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Aider_Polyglot', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('exercism')?.label ?? '', /697/iu);
    assert.match(nodes.get('probe')?.label ?? '', /seven|七/iu);
    assert.match(nodes.get('filter')?.label ?? '', /0\s*[-–]\s*3|0\s*到\s*3|至多\s*3/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /225/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /26.*39.*47.*49.*34.*30/isu);
    assert.match(nodes.get('docker')?.label ?? '', /Docker/iu);
    assert.ok(edges.has('probe->filter:primary'));
    assert.ok(edges.has('edit->docker:primary'));
  }
  assert.doesNotMatch(fallbackText('Aider_Polyglot'), /hybrid data curation|混合数据策展/iu);
});

test('uses the paper category names and a compact layered AlignBench layout', () => {
  const categories = [
    'Fundamental Language Ability',
    'Advanced Chinese Understanding',
    'Open-ended Questions',
    'Writing Ability',
    'Logical Reasoning',
    'Mathematics',
    'Task-oriented Role Play',
    'Professional Knowledge',
  ];
  const en = readArch('AlignBench', 'en');
  const enNodes = nodeMap(en);
  const enEdges = edgeSet(en);
  const taxonomyText = `${enNodes.get('taxonomy')?.label ?? ''}\n${enNodes.get('taxonomy_more')?.label ?? ''}`;
  for (const category of categories) assert.match(taxonomyText, new RegExp(category, 'iu'));
  assert.match(enNodes.get('evidence')?.label ?? '', /web search.*URLs.*quotations/isu);
  assert.match(enNodes.get('difficulty')?.label ?? '', /GPT-3\.5.*ChatGLM.*Sparkdesk/isu);
  assert.match(enNodes.get('dataset')?.label ?? '', /683/iu);
  assert.ok(enEdges.has('human_review->evidence:data'));
  assert.ok(enEdges.has('evidence->verified:data'));
  for (const language of ['en', 'zh']) {
    const { width, height } = pngDimensions(join(publicDir, 'drawio', 'AlignBench', `AlignBench.${language}.png`));
    assert.ok(width / height < 3.5, `AlignBench.${language}.png must be layered instead of ultra-wide`);
  }
});

test('keeps the upgraded All-Angles construction, review, and evaluation contract explicit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('All-Angles', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('source_pools')?.label ?? '', /Ego-Exo4D.*EgoHumans/isu);
    assert.match(nodes.get('select_scenes')?.label ?? '', /83.*7.*90/isu);
    assert.match(nodes.get('view_set')?.label ?? '', /4\s*[-–]\s*5.*796\s*[×x]\s*448/isu);
    assert.match(nodes.get('mllm_questions')?.label ?? '', /GPT-4o.*(?:five|五).*3|GPT-4o.*五.*三/isu);
    assert.match(nodes.get('cross_check')?.label ?? '', /every.*(?:another|other).*group|每条.*另一.*讨论/isu);
    assert.match(nodes.get('random_audit')?.label ?? '', /periodic.*random|定期.*随机/iu);
    assert.match(nodes.get('human_subset')?.label ?? '', /250.*(?:exclude paired|排除配对)/isu);
    assert.ok(edges.has('source_pools->select_scenes:primary'));
    assert.ok(edges.has('select_scenes->view_set:primary'));
    assert.ok(edges.has('task_design->mllm_questions:primary'));
    assert.ok(edges.has('task_design->camera_template:primary'));
    assert.ok(edges.has('first_review->cross_check:primary'));
    assert.ok(edges.has('cross_check->random_audit:primary'));
    assert.ok(edges.has('release->eval_contract:secondary'));
    assert.ok(edges.has('release->human_subset:optional'));
  }
  assert.match(fallbackText('All-Angles'), /GPT-4o.*(?:five|五)|(?:five|五).*GPT-4o/iu);
  assert.match(fallbackText('All-Angles'), /camera.*template|相机.*模板/isu);
});

test('routes All-Angles downstream evaluation edges in independent node-clear corridors', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('All-Angles', language);
    const translation = svgTranslation('All-Angles', language);
    const routes = [
      { from: 'release', to: 'eval_contract' },
      { from: 'release', to: 'human_subset' },
    ].map(route => ({
      ...route,
      segments: svgEdgeSegments('All-Angles', language, route.from, route.to),
    }));

    for (const route of routes) {
      const excluded = new Set([route.from, route.to]);
      for (const node of arch.nodes) {
        if (excluded.has(node.id)) continue;
        const geometry = drawioNodeGeometry('All-Angles', language, node.id);
        const box = {
          x: geometry.x + translation.x,
          y: geometry.y + translation.y,
          width: geometry.width,
          height: geometry.height,
        };
        for (const segment of route.segments) {
          assert.equal(
            segmentIntersectsBoxInterior(segment, box),
            false,
            `${language} ${route.from}->${route.to} crosses ${node.id}: ${JSON.stringify(segment)}`,
          );
        }
      }
    }

    for (const first of routes[0].segments) {
      for (const second of routes[1].segments) {
        const intersection = segmentIntersection(first, second);
        assert.equal(
          intersection,
          undefined,
          `${language} downstream routes must not overlap or cross: ${JSON.stringify(intersection)}`,
        );

        const orientation = segmentOrientation(first);
        if (orientation !== segmentOrientation(second)) continue;
        const projectionOverlap = orientation === 'vertical'
          ? intervalOverlap(first.from.y, first.to.y, second.from.y, second.to.y)
          : intervalOverlap(first.from.x, first.to.x, second.from.x, second.to.x);
        if (projectionOverlap <= 0) continue;
        const laneDistance = orientation === 'vertical'
          ? Math.abs(first.from.x - second.from.x)
          : Math.abs(first.from.y - second.from.y);
        assert.ok(laneDistance >= 30, `${language} parallel downstream lanes need 30px clearance`);
      }
    }
  }
});

test('restores original AlpacaEval without importing the later LC gate', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AlpacaEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('alpaca_farm')?.label ?? '', /AlpacaFarm/iu);
    assert.match(nodes.get('merge_fields')?.label ?? '', /1\s*\/\s*4.*Self-Instruct|四分之一.*Self-Instruct/isu);
    assert.match(nodes.get('reference_regeneration')?.label ?? '', /text-davinci-003/iu);
    assert.match(nodes.get('reference_regeneration')?.label ?? '', /without.*length limit|移除.*长度.*限制|不设.*长度.*上限/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /805/iu);
    assert.match(nodes.get('judge')?.label ?? '', /alpaca_eval_gpt4/iu);
    assert.match(nodes.get('judge')?.label ?? '', /temperature\s*=?\s*0|温度\s*=?\s*0/iu);
    assert.match(nodes.get('preference')?.label ?? '', /tie.*0\.5|平局.*0\.5/iu);
    assert.match(nodes.get('score')?.label ?? '', /mean.*win rate.*standard error|平均.*胜率.*标准误/isu);
    for (const edge of [
      'alpaca_farm->merge_fields:primary',
      'merge_fields->reference_regeneration:primary',
      'reference_regeneration->dataset:primary',
      'candidate->randomize:primary',
      'reference->randomize:primary',
      'randomize->judge:primary',
      'judge->preference:primary',
      'preference->score:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.doesNotMatch(JSON.stringify(arch), /GPT-4-Turbo Baseline|length-controlled|\bGLM\b|LC Win Rate/iu);
  }
  const detail = readDetail('AlpacaEval');
  assert.equal(detail.paper_url, '');
  assert.equal(detail.arxiv_pdf_url, '');
  assert.equal(detail.published, '2023-05');
  assert.equal(detail.year, '2023');
  assert.match(detail.metric_en, /win rate.*standard error/iu);
  assert.equal(detail.l2_en, 'Dialogue Preference Evaluation');
  assert.match(detail.eval_feature, /顺序随机化/iu);
  assert.match(detail.eval_feature, /平局.*0\.5/iu);
  assert.match(detail.eval_feature, /胜率.*标准误/iu);
  assert.doesNotMatch([
    detail.intro,
    detail.metric,
    detail.eval_feature_en,
    detail.intro_en,
    detail.metric_en,
  ].join('\n'), /length[- ]controlled|length debias|长度控制|\bLC\b/iu);
  assert.doesNotMatch(fallbackText('AlpacaEval'), /GPT-4-Turbo Baseline|length-controlled|\bGLM\b|LC胜率/iu);

  for (const language of ['en', 'zh']) {
    const candidateEdge = drawioEdgeCell('AlpacaEval', language, 'dataset', 'candidate');
    const referenceEdge = drawioEdgeCell('AlpacaEval', language, 'reference', 'randomize');
    for (const edge of [candidateEdge, referenceEdge]) {
      assert.equal(styleNumber(edge.style, 'exitY'), 1);
      assert.equal(styleNumber(edge.style, 'entryY'), 0);
    }
    assert.equal(styleNumber(candidateEdge.style, 'entryX'), 0.25);
    assert.equal(styleNumber(referenceEdge.style, 'entryX'), 0.75);
    const candidate = drawioNodeGeometry('AlpacaEval', language, 'candidate');
    const randomize = drawioNodeGeometry('AlpacaEval', language, 'randomize');
    const candidateLane = candidate.x + candidate.width * styleNumber(candidateEdge.style, 'entryX');
    const referenceLane = randomize.x + randomize.width * styleNumber(referenceEdge.style, 'entryX');
    assert.ok(
      Math.abs(candidateLane - referenceLane) >= 30,
      `${language} response branches need at least 30px lane separation`,
    );
  }
});

test('keeps upgraded AlpacaEval 2.0 direction restoration and length control', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AlpacaEval_2.0', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('instructions')?.label ?? '', /805/iu);
    assert.match(nodes.get('baseline')?.label ?? '', /gpt-4-1106-preview/iu);
    assert.match(nodes.get('evaluator')?.label ?? '', /logprob/iu);
    assert.match(nodes.get('restore_direction')?.label ?? '', /3\s*[−-]\s*preference|3\s*[−-]\s*偏好/iu);
    assert.match(nodes.get('preferences')?.label ?? '', /preference\s*[−-]\s*1|偏好.*1/iu);
    assert.match(nodes.get('glm')?.label ?? '', /difficulty|难度/iu);
    assert.doesNotMatch(nodes.get('glm')?.label ?? '', /\bTask\b|任务特征/iu);
    assert.ok(edges.has('evaluator->restore_direction:primary'));
    assert.ok(edges.has('restore_direction->preferences:primary'));
    assert.ok(edges.has('preferences->glm:primary'));
    assert.ok(edges.has('glm->lc_counterfactual:primary'));
  }
  const fallback = fallbackText('AlpacaEval_2.0');
  assert.doesNotMatch(fallback, /LLM Generation|Expert Construction|Final AlpacaEval 2\.0 Dataset|专家构建/iu);
  assert.match(fallback, /logprob|偏好/iu);
});

superseded('pins every A3b primary source version, repository state, and locator', () => {
  const expected = {
    Agent_Red_Teaming_Benchmark: ['https://arxiv.org/abs/2507.20526v1', /§2\.1.*§2\.3.*§3\.2.*Appendix.*private.*dynamic/isu],
    Aider_Polyglot: ['', /2024-12-21.*7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f.*5dc9490bb35f9729ef2c95d00a19ccd30c26339c/isu],
    AlignBench: ['https://arxiv.org/abs/2311.18743v4', /§2\.1.*§2\.2.*§3.*Tables? 2.*3.*7/isu],
    'All-Angles': ['https://arxiv.org/abs/2504.15280v2', /§2\.2.*Figure 3.*§3\.1.*§7\.1.*§7\.3.*§8\.1/isu],
    AlpacaEval: ['', /cd543a149df89434d8a54582c0151c0b945c3d20.*Data Release.*alpaca_eval_gpt4/isu],
    'AlpacaEval_2.0': ['https://arxiv.org/abs/2404.04475v2', /§2[–-]§4.*cd543a149df89434d8a54582c0151c0b945c3d20/isu],
  };
  for (const [id, [paperUrl, notePattern]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paperUrl, `${id} paper version`);
    assert.equal(detail.arxiv_pdf_url, paperUrl ? paperUrl.replace('/abs/', '/pdf/') : '');
    assert.match(detail.drawio_review_note, notePattern, `${id} source and locator`);
  }
});

test('publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const { width, height } = pngDimensions(`${base}.png`);
      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /math="0"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.doesNotMatch(
        drawio,
        /value="[^"]*(?:\r\n|\r|\n)[^"]*"/u,
        `${id}.${language}.drawio mxCell values must encode line breaks portably`,
      );
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\//u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(|color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
      assert.ok(width >= 800 && height >= 200, `${id}.${language}.png dimensions`);
    }
  }
});
