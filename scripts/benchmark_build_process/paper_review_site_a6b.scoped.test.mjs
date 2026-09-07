import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'Blueprint-Bench',
  'BoolQ',
  'CC-OCR',
  'CCBench',
  'CEdit-Bench',
  'CFEval',
];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(root, 'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs');

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language = 'en') {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
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

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

test('keeps all six A6b diagrams bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'en')), topology(readArch(id, 'zh')), id);
  }
});

test('passes Blueprint submissions directly to extraction without invented repair or normalization', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Blueprint-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    const submission = nodes.get('submission')?.label ?? '';
    assert.match(submission, /nine.*rules|九项.*规则/isu);
    assert.match(submission, /unscorable|not scored as intended|无法评分|无法按.*意图.*评分/iu);
    assert.doesNotMatch(JSON.stringify(arch), /normali[sz]e.*submi|enforce.*scorable|repair.*submi|规范化提交|强制.*可评分|修复提交/iu);
    for (const path of ['image_model', 'llm', 'agent']) {
      assert.ok(edges.has(`${path}->submission:primary`), `${language} ${path}`);
    }
    assert.ok(edges.has('submission->extract:primary'));
    assert.match(nodes.get('components')?.label ?? '', /Jaccard.*degree.*density.*room.*door|Jaccard.*度.*密度.*房间.*门/isu);
    assert.match(nodes.get('score')?.label ?? '', /50%.*20%.*10%.*10%.*5%.*5%/su);
  }
});

test('keeps BoolQ construction separate from released-split evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BoolQ', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('quality')?.label ?? '', /before.*page|看页面前/iu);
    assert.match(nodes.get('passage')?.label ?? '', /passage.*unanswerable|段落.*不可回答/isu);
    assert.match(nodes.get('release')?.label ?? '', /9,?427.*3,?270.*3,?245|9,?427.*3,?270.*3,?245/su);
    assert.match(nodes.get('evaluation_input')?.label ?? '', /question.*passage|问题.*段落/isu);
    assert.ok(edges.has('split->release:primary'));
    assert.ok(edges.has('release->evaluation_input:primary'));
    assert.ok(edges.has('evaluation_input->model:primary'));
    assert.doesNotMatch(JSON.stringify(arch), /MultiNLI|pre-train BERT|预训练 BERT/iu);
  }
});

test('applies the CC-OCR annotation pipeline only to new or relabeled data', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CC-OCR', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('qualified_sources')?.label ?? '', /reuse|复用/iu);
    assert.match(nodes.get('annotation')?.label ?? '', /new.*re-annot|new.*relabel|新采.*重新标注|重新标注.*新采/isu);
    assert.ok(edges.has('reannotated_sources->annotation:primary'));
    assert.ok(edges.has('new_sources->annotation:primary'));
    assert.ok(edges.has('annotation->annotated_pool:primary'));
    assert.ok(edges.has('qualified_sources->source_pool:data'));
    assert.ok(edges.has('annotated_pool->source_pool:primary'));
    assert.equal([...edges].some(edge => edge.startsWith('qualified_sources->annotation:')), false);
    assert.match(nodes.get('release')?.label ?? '', /7,?058.*four.*39|7,?058.*四.*39/isu);
  }
});

test('preserves the official CCBench repository workflow at snapshot da3895a', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CCBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('select')?.label ?? '', /10,?000|10,?000/u);
    assert.match(nodes.get('instruction')?.label ?? '', /stage|阶段/iu);
    assert.match(nodes.get('harbor')?.label ?? '', /Harbor/u);
    assert.match(nodes.get('tests')?.label ?? '', /staff|员工/iu);
    assert.match(nodes.get('oracle')?.label ?? '', /reference.*solution.*oracle|参考解.*Oracle/isu);
    assert.match(nodes.get('release')?.label ?? '', /187/u);
    assert.match(nodes.get('verify')?.label ?? '', /1.*0|1.*0/su);
    assert.match(nodes.get('report')?.label ?? '', /success rate|成功率/iu);
    assert.ok(edges.has('harbor->tests:primary'));
    assert.ok(edges.has('harbor->oracle:primary'));
    assert.ok(edges.has('verify->report:primary'));
  }
  assert.match(readDetail('CCBench').drawio_review_note, /da3895ae2f5f072ac6152c32349546344802f722/u);
});

test('reports CEdit GPT-4o metric views without inventing a rubric or score formula', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CEdit-Bench', language);
    const nodes = nodeMap(arch);
    assert.match(nodes.get('release')?.label ?? '', /1,?464.*15/isu);
    assert.match(nodes.get('judge')?.label ?? '', /GPT-4o/u);
    assert.match(nodes.get('judge')?.label ?? '', /rubric.*not disclosed|评分细则.*未披露|提示.*未披露/iu);
    assert.match(nodes.get('semantic')?.label ?? '', /G_SC/u);
    assert.match(nodes.get('perceptual')?.label ?? '', /G_PQ/u);
    assert.match(nodes.get('overall')?.label ?? '', /G_O/u);
    assert.doesNotMatch(JSON.stringify(arch), /preserve unedited|assess realism|combine editing success|保留未编辑|评价真实感|综合编辑成功/iu);
  }
});

test('limits CFEval protocol claims to the disclosed 32,768-token maximum', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CFEval', language);
    const nodes = nodeMap(arch);
    const protocol = nodes.get('protocol')?.label ?? '';
    assert.match(protocol, /max(?:imum)? output length.*32,?768|最大输出长度.*32,?768/isu);
    assert.match(protocol, /runtime.*tools.*other sampling.*not disclosed|运行环境.*工具.*其他采样.*未披露/isu);
    assert.doesNotMatch(JSON.stringify(arch), /temperature\s*=|top-p\s*=|top-k\s*=|presence penalty/iu);
    assert.match(nodes.get('task_corpus')?.label ?? '', /not disclosed|未披露/iu);
    assert.match(nodes.get('evaluator')?.label ?? '', /not disclosed|未披露/iu);
    assert.match(nodes.get('score')?.label ?? '', /formula.*not.*defined|公式.*未.*定义/iu);
  }
});

test('pins paper and repository versions in each detail review', () => {
  const expected = {
    'Blueprint-Bench': ['https://arxiv.org/abs/2509.25229v1', /6e9b9a62eeb5dc0a43718045a2b1e79b41725eaa/iu],
    BoolQ: ['https://arxiv.org/abs/1905.10044v1', /90af34107399cc7a446b373dc4ee35b8001da7c2/iu],
    'CC-OCR': ['https://arxiv.org/abs/2412.02210v3', /fb6187ebe5374d5682ac0bc05f31e3639ab6fb15.*c64517e92179991d509776064174776700cdd5a2/isu],
    CCBench: ['', /da3895ae2f5f072ac6152c32349546344802f722/iu],
    'CEdit-Bench': ['https://arxiv.org/abs/2512.07584v1', /f0e4c43c5ef74b011ff71570fbfc2bdffbc9ab06.*d92a2d680a50bd66a5509699c193999b1cac03aa/isu],
    CFEval: ['https://arxiv.org/abs/2511.21631v2', /96588727e44c78b25ba03ea03b8e12f7e64fd0da/iu],
  };
  for (const [id, [paperUrl, reviewPattern]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paperUrl, `${id} paper version`);
    assert.equal(detail.arxiv_pdf_url, paperUrl ? paperUrl.replace('/abs/', '/pdf/') : '');
    assert.match(detail.drawio_review_note, reviewPattern, `${id} source snapshot`);
  }
});

test('keeps each Mermaid fallback synchronized with every reviewed node and edge', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const fallback = detail[`flowchart_${language}`];
      assert.match(fallback, /^flowchart LR$/mu, `${id}.${language}`);
      for (const node of readArch(id, language).nodes) {
        assert.match(fallback, new RegExp(`^    ${escapeRegex(node.id)}\\[`, 'mu'));
      }
      for (const edge of readArch(id, language).edges) {
        assert.match(
          fallback,
          new RegExp(`^    ${escapeRegex(edge.from)} ${escapeRegex(mermaidArrow(edge))} ${escapeRegex(edge.to)}$`, 'mu'),
          `${id}.${language}.${edge.from}->${edge.to}`,
        );
      }
    }
  }
});

test('publishes native fixed-light XML/SVG and readable PNG pairs', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const spec = readFileSync(`${base}.spec.yaml`, 'utf8');
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(spec, /^meta:/mu);
      assert.match(spec, /^nodes:/mu);
      assert.match(spec, /^edges:/mu);
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /math="0"/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.match(svg, /color-scheme:\s*light/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const { width, height } = pngDimensions(`${base}.png`);
      assert.ok(width >= 800 && height >= 300, `${id}.${language} PNG dimensions`);
      assert.ok(width / height < 4.5, `${id}.${language} readable aspect ratio`);
    }
  }
});

test('strictly rebuilds and normalizes all 12 specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a6b-'));
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
        assert.equal(readFileSync(generated, 'utf8'), readFileSync(`${base}.drawio`, 'utf8'), `${id}.${language}`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
