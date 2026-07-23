import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'ARC_(AI2_Reasoning_Challenge)',
  'ART',
  'ASPERA',
  'AbstentionBench',
  'ActivityNet-QA',
  'AdvBench',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language = 'en') {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function readSpec(id, language = 'en') {
  return readFileSync(
    join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
    'utf8',
  );
}

function nodeMap(arch) {
  return new Map(arch.nodes.map(node => [node.id, node]));
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to, type }) => `${from}->${to}:${type}`));
}

function edgeLabel(arch, from, to) {
  return arch.edges.find(edge => edge.from === from && edge.to === to)?.label ?? '';
}

function assertExactEdges(arch, expected, message) {
  const actual = arch.edges
    .map(({ from, to, type }) => `${from}->${to}:${type}`)
    .sort();
  assert.deepEqual(actual, [...expected].sort(), message);
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function edgeBlock(spec, from, to) {
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedTo = to.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?: {4,}[^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

function decodeXmlText(value) {
  return value
    .replace(/<[^>]+>/gu, '')
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function svgTextLines(svg) {
  return new Set(
    [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gu)]
      .map(match => decodeXmlText(match[1]).trim())
      .filter(Boolean),
  );
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function pngStats(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let header;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    }
    if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }

  assert.ok(header, `${path} must contain IHDR`);
  assert.equal(header.bitDepth, 8, `${path} must use portable 8-bit channels`);
  assert.equal(header.interlace, 0, `${path} must be non-interlaced`);
  const channelsByColorType = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]);
  const channels = channelsByColorType.get(header.colorType);
  assert.ok(channels, `${path} uses unsupported PNG color type ${header.colorType}`);

  const inflated = inflateSync(Buffer.concat(compressed));
  const rowBytes = header.width * channels;
  assert.equal(inflated.length, header.height * (rowBytes + 1), `${path} scanline size`);
  let inputOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  let nonWhitePixels = 0;
  for (let row = 0; row < header.height; row += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const current = Buffer.alloc(rowBytes);
    for (let index = 0; index < rowBytes; index += 1) {
      const raw = inflated[inputOffset + index];
      const left = index >= channels ? current[index - channels] : 0;
      const above = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      else assert.equal(filter, 0, `${path} has unsupported PNG filter ${filter}`);
      current[index] = (raw + predictor) & 0xff;
    }
    inputOffset += rowBytes;

    for (let pixel = 0; pixel < header.width; pixel += 1) {
      const start = pixel * channels;
      const gray = current[start];
      const red = header.colorType === 0 || header.colorType === 4 ? gray : current[start];
      const green = header.colorType === 0 || header.colorType === 4 ? gray : current[start + 1];
      const blue = header.colorType === 0 || header.colorType === 4 ? gray : current[start + 2];
      const alpha = header.colorType === 4
        ? current[start + 1]
        : header.colorType === 6 ? current[start + 3] : 255;
      if (alpha > 0 && (red < 250 || green < 250 || blue < 250)) nonWhitePixels += 1;
    }
    previous = current;
  }
  return { width: header.width, height: header.height, nonWhitePixels };
}

test('keeps all six reviewed diagrams bilingual and topologically identical', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

test('keeps every native-text line within the fixed node width', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const limit = language === 'en' ? 32 : 28;
      for (const node of readArch(id, language).nodes) {
        for (const line of node.label.split('\n')) {
          assert.ok(
            [...line].length <= limit,
            `${id}.${language}.${node.id} line is too long: ${line}`,
          );
        }
      }
    }
  }
});

test('models ARC question difficulty and the optional corpus as independent lanes', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ARC_(AI2_Reasoning_Challenge)', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('question_sources')?.label ?? '', /3.?9|3.?9 年级/u);
    assert.match(nodes.get('normalize')?.label ?? '', /7,?787/u);
    assert.match(nodes.get('ir')?.label ?? '', /Waterloo/iu);
    assert.match(nodes.get('pmi')?.label ?? '', /PMI/u);
    assert.match(nodes.get('challenge')?.label ?? '', /2,?590/u);
    assert.match(
      nodes.get('corpus_queries')?.label ?? '',
      language === 'en' ? /100 templates for 80 topics/iu : /100 个模板.*覆盖 80 个主题/su,
    );
    assert.doesNotMatch(nodes.get('corpus_queries')?.label ?? '', /×/u);
    assert.match(nodes.get('corpus_filter')?.label ?? '', /deduplicate|去重/iu);
    assert.doesNotMatch(nodes.get('corpus_filter')?.label ?? '', /science filter|科学内容过滤/iu);
    assert.match(nodes.get('text_extract')?.label ?? '', /extract(?: document)? text|提取文本/iu);
    assert.match(nodes.get('sentence_split')?.label ?? '', /split(?: text)? into sentences|切分为句子/iu);
    assert.match(nodes.get('corpus_merge')?.label ?? '', /AristoMini/u);
    assert.match(nodes.get('corpus')?.label ?? '', /14M|1400 万/iu);
    assertExactEdges(arch, [
      'question_sources->normalize:primary',
      'normalize->ir:primary',
      'normalize->pmi:primary',
      'ir->challenge_gate:primary',
      'pmi->challenge_gate:primary',
      'challenge_gate->challenge:primary',
      'challenge_gate->easy:primary',
      'challenge->question_release:primary',
      'easy->question_release:primary',
      'corpus_queries->web_documents:primary',
      'web_documents->corpus_filter:primary',
      'corpus_filter->text_extract:primary',
      'text_extract->sentence_split:primary',
      'sentence_split->corpus_merge:primary',
      'aristomini->corpus_merge:data',
      'corpus_merge->corpus:primary',
      'question_release->publish:primary',
      'corpus->publish:optional',
    ], `${language} ARC exact construction edges`);
    assert.equal(
      edgeLabel(arch, 'challenge_gate', 'challenge'),
      language === 'en' ? 'Both wrong' : '两者均答错',
    );
    assert.equal(
      edgeLabel(arch, 'challenge_gate', 'easy'),
      language === 'en' ? 'Otherwise' : '其他情况',
    );
    for (const forbidden of [
      'ir->pmi:primary',
      'pmi->ir:primary',
      'corpus_filter->corpus_merge:primary',
      'question_release->corpus:primary',
      'question_release->corpus_queries:primary',
      'question_release->web_documents:primary',
    ]) {
      assert.equal(edges.has(forbidden), false, `${language} must reject ${forbidden}`);
    }
  }
});

test('validates ART before inclusion and locks the reviewed release order', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ART', language);
    const artNodes = nodeMap(arch);
    const automaticAudit = artNodes.get('automatic_audit')?.label ?? '';
    assert.match(automaticAudit, /validate.*before inclusion|纳入前.*验证/iu);
    assert.doesNotMatch(automaticAudit, /reject|discard|剔除|丢弃/iu);
    assertExactEdges(arch, [
      'failures->ehr:primary',
      'ehr->mode:primary',
      'mode->retrieval:primary',
      'mode->aggregation:primary',
      'mode->conditional:primary',
      'retrieval->generate:primary',
      'aggregation->generate:primary',
      'conditional->generate:primary',
      'generate->automatic_audit:primary',
      'automatic_audit->clinical_audit:primary',
      'clinical_audit->dataset:primary',
      'dataset->environment:primary',
      'environment->agents:primary',
      'agents->score:primary',
      'score->report:primary',
    ], `${language} ART exact construction and evaluation edges`);
  }
});

test('locks ASPERA per-program prompting, developer edits, and final confirmation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ASPERA', language);
    const asperaNodes = nodeMap(arch);
    assert.match(
      asperaNodes.get('session')?.label ?? '',
      /query history|查询历史/iu,
    );
    assert.match(
      asperaNodes.get('prompt')?.label ?? '',
      /5 ICEs for each type|每种程序.*5 个 ICE/iu,
    );
    assert.match(
      asperaNodes.get('aep')?.label ?? '',
      /post-generation filter|生成后筛选/iu,
    );
    for (const stage of ['aep', 'sip', 'ep']) {
      assert.match(
        asperaNodes.get(stage)?.label ?? '',
        /developer executes.*edits|开发者执行.*编辑/iu,
        `${language} ${stage} developer execute/edit`,
      );
    }
    assert.match(
      asperaNodes.get('lead_author')?.label ?? '',
      /lead-author.*execute.*correct|首席作者.*执行.*修正/isu,
    );
    assert.match(
      asperaNodes.get('confirm')?.label ?? '',
      /two annotators.*confirm|两位标注员.*确认/isu,
    );
    assertExactEdges(arch, [
      'library->session:primary',
      'session->prompt:primary',
      'prompt->aep:primary',
      'aep->sip:primary',
      'sip->ep:primary',
      'ep->lead_author:primary',
      'lead_author->confirm:primary',
      'confirm->release:primary',
      'release->setting:primary',
      'setting->candidate:primary',
      'candidate->initialize:primary',
      'initialize->execute:primary',
      'execute->assertions:primary',
      'assertions->metric:primary',
      'metric->report:primary',
    ], `${language} ASPERA exact construction and evaluation edges`);
  }
});

test('keeps AbstentionBench construction parallel and correctness judging conditional', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AbstentionBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('general_datasets')?.label ?? '', /16/u);
    assert.match(nodes.get('abstain_variants')?.label ?? '', /3/u);
    assert.match(nodes.get('umwp')?.label ?? '', /UMWP/u);
    assert.match(nodes.get('release')?.label ?? '', /20.*35,?000|20.*3\.5 万/su);
    assert.match(nodes.get('reference_gate')?.label ?? '', /reference|参考答案/iu);
    for (const edge of [
      'general_datasets->release:primary',
      'abstain_variants->release:primary',
      'umwp->release:primary',
      'inference->abstention_judge:primary',
      'abstention_judge->reference_gate:primary',
      'reference_gate->correctness_judge:primary',
      'correctness_judge->metrics:primary',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    assert.equal(edges.has('abstention_judge->correctness_judge:primary'), false);
  }
});

test('routes long conditional branches around unrelated nodes', () => {
  for (const language of ['en', 'zh']) {
    assert.match(
      edgeBlock(readSpec('AbstentionBench', language), 'abstention_judge', 'metrics'),
      /waypoints:/u,
      `${language} abstention branch must bypass the reference gate`,
    );
    assert.match(
      edgeBlock(readSpec('AdvBench', language), 'success_gate', 'behavior_score'),
      /waypoints:/u,
      `${language} behavior branch must bypass string scoring`,
    );
  }
});

test('records the disclosed ActivityNet-QA annotation controls and explicit unknowns', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ActivityNet-QA', language);
    const nodes = nodeMap(arch);
    assert.match(nodes.get('videos')?.label ?? '', /class-balanced|类别均衡/iu);
    assert.match(nodes.get('length_gate')?.label ?? '', /20.*5/su);
    assert.match(nodes.get('yes_no_balance')?.label ?? '', /1\s*:\s*1|one|接近 1/iu);
    assert.match(
      nodes.get('random_audit')?.label ?? '',
      /sampled portion.*not disclosed|抽样部分.*未披露/isu,
    );
    assertExactEdges(arch, [
      'videos->author:primary',
      'author->types:primary',
      'types->length_gate:primary',
      'length_gate->yes_no_balance:primary',
      'yes_no_balance->quality:primary',
      'quality->translate:primary',
      'quality->random_audit:optional',
      'random_audit->translate:optional',
      'translate->release:primary',
      'release->prediction:primary',
      'prediction->exact:primary',
      'prediction->wups:primary',
      'exact->aggregate:primary',
      'wups->aggregate:primary',
      'aggregate->report:primary',
    ], `${language} ActivityNet-QA exact construction and optional audit branch`);
    assert.equal(
      edgeLabel(arch, 'quality', 'random_audit'),
      language === 'en' ? 'Sampled portion' : '抽样部分',
    );
  }
});

test('constructs AdvBench from disclosed seeds before selecting the GCG protocol', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AdvBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('seed_strings')?.label ?? '', /100/u);
    assert.match(nodes.get('seed_behaviors')?.label ?? '', /50/u);
    assert.match(nodes.get('five_shot')?.label ?? '', /5-shot|5 个示例/iu);
    assert.match(nodes.get('generator')?.label ?? '', /Wizard-Vicuna-30B-Uncensored/u);
    assert.match(nodes.get('generator')?.label ?? '', /10.*round|每轮.*10/iu);
    assert.match(nodes.get('release')?.label ?? '', /500.*500/su);
    assert.match(nodes.get('filter_unknown')?.label ?? '', /not disclosed|未披露/iu);
    assertExactEdges(arch, [
      'seed_strings->five_shot:primary',
      'seed_behaviors->five_shot:primary',
      'five_shot->generator:primary',
      'generator->release:primary',
      'release->protocol:primary',
      'protocol->aggregate_loss:primary',
      'aggregate_loss->gcg:primary',
      'gcg->run:primary',
      'run->success_gate:primary',
      'success_gate->string_score:primary',
      'success_gate->behavior_score:primary',
      'string_score->asr:primary',
      'behavior_score->asr:primary',
      'asr->report:primary',
    ], `${language} AdvBench exact construction and GCG evaluation edges`);
    assert.equal(
      arch.edges.some(edge => edge.from === 'filter_unknown' || edge.to === 'filter_unknown'),
      false,
      `${language} undisclosed filtering must remain an unconnected annotation`,
    );
    assert.equal(
      edgeLabel(arch, 'success_gate', 'string_score'),
      language === 'en' ? 'String' : '字符串',
    );
    assert.equal(
      edgeLabel(arch, 'success_gate', 'behavior_score'),
      language === 'en' ? 'Behavior' : '行为',
    );
    assert.equal(edges.has('gcg->protocol:primary'), false);
  }
});

test('pins paper versions, official snapshots, source locators, and review verdicts', () => {
  const expected = {
    'ARC_(AI2_Reasoning_Challenge)': {
      paper: 'https://arxiv.org/abs/1803.05457v1',
      note: /REDRAW.*Dataset.*Identifying Challenge.*Corpus/isu,
    },
    ART: {
      paper: 'https://arxiv.org/abs/2601.08988v1',
      note: /PASS.*Sections 2 and 3\.1-3\.4/isu,
    },
    ASPERA: {
      paper: 'https://arxiv.org/abs/2507.15501v1',
      note: /PASS.*6807429bc757471d9c240ab51f97d62251886798/isu,
    },
    AbstentionBench: {
      paper: 'https://arxiv.org/abs/2506.09038v1',
      note: /REDRAW.*e29184174c69bc95139b8c33dcca09aacab9442a/isu,
    },
    'ActivityNet-QA': {
      paper: 'https://arxiv.org/abs/1906.02467v1',
      note: /WORDING.*2cf80aeb4e45955e53404e1716d3b9c0b1cbd72f/isu,
    },
    AdvBench: {
      paper: 'https://arxiv.org/abs/2307.15043v2',
      note: /REDRAW.*098262edf85f807224e70ecd87b9d83716bf6b73/isu,
    },
  };

  for (const [id, { paper, note }] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paper, `${id} paper version`);
    assert.equal(detail.arxiv_pdf_url, paper.replace('/abs/', '/pdf/'));
    assert.match(detail.drawio_review_note, note, `${id} source locator and verdict`);
  }
});

test('publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const expectedNodeLines = readArch(id, language).nodes.reduce(
        (sum, node) => sum + node.label.split('\n').length,
        0,
      );
      const svgTspanCount = svg.match(/<tspan>/gu)?.length ?? 0;
      const renderedLines = svgTextLines(svg);
      const arch = readArch(id, language);
      const expectedLabelLines = [
        ...arch.nodes.flatMap(node => node.label.split('\n')),
        ...arch.edges.flatMap(edge => edge.label?.split('\n') ?? []),
      ];
      const { width, height, nonWhitePixels } = pngStats(`${base}.png`);
      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /math="0"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.doesNotMatch(
        drawio,
        /\bvalue="[^"]*\n[^"]*"/u,
        `${id}.${language}.drawio must encode multiline labels for native SVG text`,
      );
      assert.match(drawio, /&#xa;/u, `${id}.${language}.drawio multiline labels`);
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.ok(
        svgTspanCount >= expectedNodeLines,
        `${id}.${language}.svg must preserve every native-text label line`,
      );
      for (const line of expectedLabelLines) {
        assert.ok(
          renderedLines.has(line),
          `${id}.${language}.svg must render architecture label line: ${line}`,
        );
      }
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\//u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(|color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
      assert.ok(width >= 800 && height >= 200, `${id}.${language}.png dimensions`);
      assert.ok(
        nonWhitePixels >= Math.max(1000, width * height * 0.001),
        `${id}.${language}.png must contain visible non-white diagram pixels`,
      );
    }
  }
});
