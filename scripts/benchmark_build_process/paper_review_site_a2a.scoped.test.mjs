import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

// Later A8/A9 contracts own these historical assertions; do not register them.
const superseded = () => {};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'ALERT',
  'AMEGA-LLM',
  'AMO-Bench',
  'ARC-AGI',
  'ARC-AGI-1',
  'ARC-AGI-2',
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

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function nodeMap(arch) {
  return new Map(arch.nodes.map(node => [node.id, node]));
}

function edgeSet(arch) {
  return new Set(arch.edges.map(({ from, to, type }) => `${from}->${to}:${type}`));
}

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`, 'u'))?.[1] ?? '';
}

function decodeXml(value) {
  return value
    .replace(/&#xa;/giu, '\n')
    .replace(/&#10;/gu, '\n')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

function normalizedLabel(value) {
  return decodeXml(String(value)).replace(/\s+/gu, ' ').trim();
}

function searchableLabel(value) {
  return normalizedLabel(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function drawioCells(xml) {
  const tags = [...xml.matchAll(/<mxCell\b[^>]*>/gu)].map(match => match[0]);
  const nodes = tags.filter(tag => (
    readAttribute(tag, 'vertex') === '1'
    && !readAttribute(tag, 'style').split(';').includes('edgeLabel')
  ));
  const edges = tags.filter(tag => readAttribute(tag, 'edge') === '1');
  const edgeLabels = edges.filter(tag => normalizedLabel(readAttribute(tag, 'value')));
  return { nodes, edges, edgeLabels };
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
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?:    [^\\n]+\\n|      [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
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

function pngNonWhitePixels(path) {
  const { png, width, height } = pngDimensions(path);
  assert.equal(png[24], 8, `${path} must be 8-bit PNG`);
  const colorType = png[25];
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  assert.ok(channels, `${path} must be RGB or RGBA PNG`);
  assert.equal(png[28], 0, `${path} must be non-interlaced PNG`);

  const idatChunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idatChunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  assert.equal(raw.length, height * (stride + 1), `${path} scanline bytes`);

  let cursor = 0;
  let previous = Buffer.alloc(stride);
  let nonWhitePixels = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const current = Buffer.allocUnsafe(stride);
    for (let index = 0; index < stride; index += 1) {
      const encoded = raw[cursor + index];
      const left = index >= channels ? current[index - channels] : 0;
      const above = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      else assert.equal(filter, 0, `${path} PNG filter`);
      current[index] = (encoded + predictor) & 0xff;
    }
    cursor += stride;
    for (let index = 0; index < stride; index += channels) {
      if (current[index] < 250 || current[index + 1] < 250 || current[index + 2] < 250) {
        nonWhitePixels += 1;
      }
    }
    previous = current;
  }
  return { bytes: png.length, height, nonWhitePixels, width };
}

test('keeps all six A2a diagrams bilingual with identical node ids and typed edges', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

test('orders ALERT as divide criteria, select evaluator, then aggregate votes', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ALERT', language);
    const edges = edgeSet(arch);
    assert.ok(edges.has('pair->divide:primary'));
    assert.ok(edges.has('divide->route:primary'));
    assert.ok(edges.has('route->gen:primary'));
    assert.ok(edges.has('route->disc:primary'));
    assert.ok(edges.has('gen->vote:primary'));
    assert.ok(edges.has('disc->vote:primary'));
    assert.ok(edges.has('vote->result:primary'));
    assert.equal(edges.has('pair->route:primary'), false);
    assert.equal(edges.has('gen->divide:primary'), false);
    assert.equal(edges.has('disc->divide:primary'), false);
  }
});

test('keeps ALERT interruption and expert-correlation meta experiments parallel', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ALERT', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('interruption_test')?.label ?? '', /§?4\.2|controlled.*interrupt|受控.*干扰/isu);
    assert.match(nodes.get('expert_correlation')?.label ?? '', /§?4\.3/iu);
    assert.match(nodes.get('expert_correlation')?.label ?? '', /88.*3|3.*88/isu);
    assert.match(nodes.get('no_tie_accuracy')?.label ?? '', /ALERT-Gen.*0\.667/isu);
    assert.match(nodes.get('no_tie_accuracy')?.label ?? '', /ALERT-Disc.*0\.711/isu);
    assert.ok(edges.has('meta_suite->interruption_test:secondary'));
    assert.ok(edges.has('meta_suite->expert_correlation:secondary'));
    assert.ok(edges.has('expert_correlation->no_tie_accuracy:secondary'));
    assert.equal(edges.has('interruption_test->expert_correlation:secondary'), false);
    assert.equal(edges.has('interruption_test->no_tie_accuracy:secondary'), false);
    assert.deepEqual(
      arch.edges.filter(edge => edge.to === 'no_tie_accuracy').map(edge => edge.from),
      ['expert_correlation'],
    );
  }
});

superseded('orders AMEGA valid-attempt voting before unmet-criteria Reask decisions', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AMEGA-LLM', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    const spec = readSpec('AMEGA-LLM', language);
    assert.match(nodes.get('failure_gate')?.label ?? '', />\s*50%|超过\s*50%/iu);
    assert.match(nodes.get('split_criteria')?.label ?? '', /halves|两半/iu);
    assert.ok(edges.has('evaluator->failure_gate:primary'));
    assert.ok(edges.has('failure_gate->split_criteria:optional'));
    assert.ok(edges.has('split_criteria->evaluator:optional'));
    assert.ok(edges.has('failure_gate->voting:primary'));
    assert.ok(edges.has('voting->gate:primary'));
    assert.ok(edges.has('gate->reask:optional'));
    assert.ok(edges.has('gate->score:primary'));
    assert.equal(edges.has('failure_gate->gate:primary'), false);
    assert.equal(edges.has('gate->voting:primary'), false);
    assert.equal(edges.has('voting->score:primary'), false);
    assert.match(edgeBlock(spec, 'failure_gate', 'split_criteria'), /label:.*(?:Yes|是)/iu);
    assert.match(edgeBlock(spec, 'failure_gate', 'voting'), /label:.*(?:≤\s*50|No|否)/iu);
    assert.match(edgeBlock(spec, 'gate', 'reask'), /label:.*(?:Yes|是).*Reask/iu);
    assert.match(edgeBlock(spec, 'gate', 'score'), /label:.*(?:No|否)/iu);
  }
});

superseded('preserves the reviewed AMO, ARC umbrella, and ARC-AGI-2 topologies', () => {
  const expected = {
    'AMO-Bench': {
      nodes: ['experts', 'create', 'quality', 'originality', 'difficulty', 'release', 'sample', 'route', 'parser', 'llm_judge', 'correctness', 'report', 'validate'],
      edges: ['experts->create:primary', 'create->quality:primary', 'quality->originality:primary', 'originality->difficulty:primary', 'difficulty->release:primary', 'release->sample:primary', 'sample->route:primary', 'route->parser:primary', 'route->llm_judge:primary', 'parser->correctness:primary', 'llm_judge->correctness:primary', 'correctness->report:primary', 'correctness->validate:primary'],
    },
    'ARC-AGI': {
      nodes: ['principle', 'format', 'version', 'competition', 'submissions', 'results', 'method_gate', 'evolutionary', 'weights', 'application', 'synthesis', 'coverage', 'arc3', 'publish'],
      edges: ['principle->format:primary', 'format->version:primary', 'version->competition:primary', 'competition->submissions:primary', 'submissions->results:primary', 'results->method_gate:primary', 'method_gate->evolutionary:primary', 'method_gate->weights:primary', 'method_gate->application:primary', 'evolutionary->synthesis:primary', 'weights->synthesis:primary', 'application->synthesis:primary', 'synthesis->coverage:primary', 'coverage->arc3:primary', 'arc3->publish:primary'],
    },
    'ARC-AGI-2': {
      nodes: ['sources', 'design', 'humans', 'gate', 'calibrate', 'dedupe', 'partition', 'public_training', 'eval_sets', 'remove', 'validate', 'format', 'competition', 'predict', 'score', 'report'],
      edges: ['sources->design:primary', 'sources->public_training:primary', 'design->humans:primary', 'humans->gate:primary', 'gate->calibrate:primary', 'gate->remove:optional', 'calibrate->dedupe:primary', 'dedupe->partition:primary', 'dedupe->remove:optional', 'partition->eval_sets:primary', 'eval_sets->validate:primary', 'validate->format:primary', 'format->competition:primary', 'competition->predict:primary', 'predict->score:primary', 'score->report:primary'],
    },
  };
  for (const [id, contract] of Object.entries(expected)) {
    const arch = readArch(id, 'en');
    assert.deepEqual(arch.nodes.map(node => node.id), contract.nodes, `${id} nodes`);
    assert.deepEqual([...edgeSet(arch)], contract.edges, `${id} edges`);
  }
});

superseded('separates the original ARC corpus from the later competition split', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ARC-AGI-1', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('public_sets')?.label ?? '', /400.*400/isu);
    assert.match(nodes.get('proposal_private')?.label ?? '', /200/isu);
    assert.match(nodes.get('proposal_private')?.label ?? '', /2019|proposal|论文|提案/iu);
    assert.match(nodes.get('prize_private')?.label ?? '', /100/isu);
    assert.match(nodes.get('prize_private')?.label ?? '', /private|私有/iu);
    assert.match(nodes.get('semi_private')?.label ?? '', /mid.?2024|2024.*mid|2024.*年中/iu);
    assert.match(nodes.get('semi_private')?.label ?? '', /100/isu);
    assert.match(nodes.get('semi_private')?.label ?? '', /semi.?private|半私有/iu);
    assert.ok(edges.has('public_sets->proposal_private:primary'));
    assert.ok(edges.has('proposal_private->prize_private:primary'));
    assert.ok(edges.has('prize_private->semi_private:primary'));
    assert.equal(edges.has('public_sets->semi_private:primary'), false);
  }
});

superseded('pins every A2a primary source version, repository state, and locator', () => {
  const expected = {
    ALERT: ['https://aclanthology.org/2025.naacl-long.137/', /§§3\.1[–-]3\.2.*§§4\.2[–-]4\.4.*Appendix A.*B\.2.*404/isu],
    'AMEGA-LLM': ['https://www.nature.com/articles/s41746-024-01356-6', /Benchmark structure.*Reask process.*Self-consistency.*16fd048a15818cc1e6f513647beec2f94f6a5ff7/isu],
    'AMO-Bench': ['https://arxiv.org/abs/2510.26768v1', /§3.*§4.*meituan-longcat\/AMO-Bench@52e1f378e4bcb0c593e860be38f9251b1a192571.*v1.*originality.*Problem 35.*Problem 26.*(?:38.*39|38\s*\/\s*39)/isu],
    'ARC-AGI': ['https://arxiv.org/abs/2601.10904v1', /§1.*§4\.3/isu],
    'ARC-AGI-1': ['https://arxiv.org/abs/1911.01547v2', /Part III.*399030444e0ab0cc8b4e199870fb20b863846f34.*arcprize\.org\/arc-agi\/1.*arc-prize-2024-technical-report\.pdf/isu],
    'ARC-AGI-2': ['https://arxiv.org/abs/2505.11831v2', /§4\.1.*§4\.4.*§5.*f3283f727488ad98fe575ea6a5ac981e4a188e49/isu],
  };
  for (const [id, [paperUrl, notePattern]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paperUrl, `${id} paper version`);
    if (paperUrl.includes('arxiv.org')) {
      assert.equal(detail.arxiv_pdf_url, paperUrl.replace('/abs/', '/pdf/'));
    }
    assert.match(detail.drawio_review_note, notePattern, `${id} source and locator`);
  }

  for (const language of ['en', 'zh']) {
    const amoLegend = readSpec('AMO-Bench', language);
    assert.match(amoLegend, /v1.*originality|v1.*原创性/isu);
    assert.match(amoLegend, /Problem\s+35/iu);
    assert.match(amoLegend, /Problem\s+26/iu);
    assert.match(amoLegend, /38.*39|38\s*\/\s*39/isu);
  }
});

test('keeps Draw.io and SVG labels synchronized with architecture counts', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const arch = readArch(id, language);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const cells = drawioCells(drawio);
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
      assert.equal(cells.nodes.length, arch.nodes.length, `${id}.${language} Draw.io node count`);
      assert.equal(cells.edges.length, arch.edges.length, `${id}.${language} Draw.io edge count`);
      assert.deepEqual(
        cells.nodes.map(tag => normalizedLabel(readAttribute(tag, 'value'))).sort(),
        arch.nodes.map(node => normalizedLabel(node.label)).sort(),
        `${id}.${language} Draw.io node labels`,
      );
      assert.deepEqual(
        cells.edgeLabels.map(tag => normalizedLabel(readAttribute(tag, 'value'))).sort(),
        arch.edges.map(edge => normalizedLabel(edge.label ?? '')).filter(Boolean).sort(),
        `${id}.${language} Draw.io edge labels`,
      );
      const svgSearchable = searchableLabel(svg.replace(/<[^>]+>/gu, ' '));
      for (const label of [
        ...arch.nodes.map(node => node.label),
        ...arch.edges.map(edge => edge.label ?? ''),
      ]) {
        for (const line of String(label).split(/\r?\n/gu).filter(Boolean)) {
          const needle = searchableLabel(line);
          assert.ok(
            needle.length < 3 || svgSearchable.includes(needle),
            `${id}.${language}.svg missing visible label line: ${line}`,
          );
        }
      }
    }
  }
});

test('publishes non-empty Draw.io Desktop PNG renders', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const path = join(publicDir, 'drawio', id, `${id}.${language}.png`);
      const { bytes, height, nonWhitePixels, width } = pngNonWhitePixels(path);
      assert.ok(width >= 800 && height >= 200, `${id}.${language}.png dimensions`);
      assert.ok(bytes >= 10_000, `${id}.${language}.png byte size`);
      assert.ok(nonWhitePixels >= 1_000, `${id}.${language}.png must contain rendered content`);
    }
  }
});
