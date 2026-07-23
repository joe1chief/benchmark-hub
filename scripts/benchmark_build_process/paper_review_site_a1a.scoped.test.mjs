import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeImporterDrawioContent } from './normalize_importer_build_process_assets.mjs';

const superseded = (name, fn) => test(name, {
  skip: 'Superseded by the later A8/A9 paper-review contract.',
}, fn);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  '2WikiMultihopQA',
  'AA-LCR',
  'AA-Omniscience',
  'ACPBench_Hard',
  'ADR-Bench',
  'AGIEval',
];
const normalizerPath = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const multilineDrawioFixture = `<mxfile>
  <diagram>
    <mxGraphModel math="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="label" value="First line
Second line
Third line" style="rounded=1;html=1;" vertex="1" parent="1" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

function readSpec(id, language) {
  return readFileSync(
    join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
    'utf8',
  );
}

function readDetail(id) {
  return JSON.parse(readFileSync(
    join(publicDir, 'benchmarks_detail', `${id}.json`),
    'utf8',
  ));
}

function nodeBlock(spec, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - id: ${escapedId}\\n(?:    [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

function edgeBlock(spec, from, to) {
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedTo = to.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?:    [^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

function extractTopology(spec) {
  const nodeSection = spec.match(/^nodes:\n([\s\S]*?)^edges:\n/mu)?.[1] ?? '';
  const edgeSection = spec.match(/^edges:\n([\s\S]*?)^modules:/mu)?.[1] ?? '';
  const nodes = [...nodeSection.matchAll(/^  - id: ([^\n]+)$/gmu)]
    .map(match => match[1]);
  const edges = [...edgeSection.matchAll(
    /^  - from: ([^\n]+)\n    to: ([^\n]+)\n    type: ([^\n]+)/gmu,
  )].map(([, from, to, type]) => `${from}->${to}:${type}`);
  return { nodes, edges };
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('keeps the six A1a diagrams bilingual with identical node ids and typed edges', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      extractTopology(readSpec(id, 'en')),
      extractTopology(readSpec(id, 'zh')),
      `${id} must keep identical EN/ZH node ids and typed edges`,
    );
  }
});

test('serializes 2WikiMultihopQA type gates, post-processing, and distractor retrieval', () => {
  const expectedPaths = [
    ['templates', 'comparison'],
    ['templates', 'bridge_comparison'],
    ['templates', 'inference'],
    ['templates', 'compositional'],
    ['logical_rules', 'inference'],
    ['comparison', 'comparison_gate'],
    ['bridge_comparison', 'bridge_gate'],
    ['inference', 'two_hop_gate'],
    ['compositional', 'two_hop_gate'],
    ['qa_records', 'postprocess'],
    ['postprocess', 'distractors'],
    ['distractors', 'dataset'],
  ];
  for (const language of ['en', 'zh']) {
    const spec = readSpec('2WikiMultihopQA', language);
    for (const [from, to] of expectedPaths) {
      assert.match(edgeBlock(spec, from, to), /^    type: primary$/mu, `${language} ${from}->${to}`);
    }
    assert.match(nodeBlock(spec, 'templates'), /context-dependent|依赖上下文/iu);
    assert.match(nodeBlock(spec, 'comparison_gate'), /answer spans|答案跨度/iu);
    assert.match(nodeBlock(spec, 'bridge_gate'), /mention.*non-mention|提及.*不提及/iu);
    assert.match(nodeBlock(spec, 'two_hop_gate'), /two-hop|两跳/iu);
    assert.match(edgeBlock(spec, 'templates', 'compositional'), /waypoints:/u);
    assert.equal(edgeBlock(spec, 'logical_rules', 'compositional'), '');
    assert.equal(edgeBlock(spec, 'qa_records', 'distractors'), '');
    assert.equal(edgeBlock(spec, 'postprocess', 'dataset'), '');
  }
});

superseded('constructs AA-LCR prompts in explicit data_source_filenames list order', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('AA-LCR', language);
    assert.match(nodeBlock(spec, 'prompt'), /data_source_filenames/u);
    assert.match(nodeBlock(spec, 'prompt'), /list order|列表给定顺序/iu);
    assert.doesNotMatch(nodeBlock(spec, 'prompt'), /ordered by filename|按文件名排序|lexicographic/iu);
  }
});

test('uses GPT-5 for AA-Omniscience construction and evaluates the full 6,000 set', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('AA-Omniscience', language);
    for (const id of ['generate', 'filter', 'revise']) {
      assert.match(nodeBlock(spec, id), /GPT-5/u, `${language} ${id}`);
    }
    assert.match(edgeBlock(spec, 'manual_validation', 'full_release'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'full_release', 'public_sampling'), /^    type: secondary$/mu);
    assert.match(edgeBlock(spec, 'public_sampling', 'public_release'), /^    type: secondary$/mu);
    assert.match(edgeBlock(spec, 'full_release', 'prompt'), /^    type: primary$/mu);
    assert.equal(edgeBlock(spec, 'public_release', 'prompt'), '');
    assert.match(nodeBlock(spec, 'public_sampling'), /distribution[\s\S]*performance|分布[\s\S]*性能/iu);
  }
});

superseded('adds the paper-backed ACPBench task-family routes and token exceptions', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('ACPBench_Hard', language);
    assert.match(edgeBlock(spec, 'route', 'stored'), /Applicability|适用性/u);
    assert.match(edgeBlock(spec, 'route', 'stored'), /Validation|验证/u);
    assert.match(nodeBlock(spec, 'solve'), /Reachability|可达性/u);
    assert.match(nodeBlock(spec, 'solve'), /Next action|下一动作/iu);
    if (language === 'en') {
      assert.match(edgeBlock(spec, 'route', 'solve'), /Solve • 4 checks/u);
      assert.doesNotMatch(edgeBlock(spec, 'route', 'solve'), /Action Reachability|Next Action/u);
    } else {
      assert.match(edgeBlock(spec, 'route', 'solve'), /可达性/u);
      assert.match(edgeBlock(spec, 'route', 'solve'), /下一动作/u);
    }
    assert.match(nodeBlock(spec, 'inference'), /1,000/u);
    assert.match(nodeBlock(spec, 'inference'), /GPT-OSS[\s\S]*20B[\s\S]*120B[\s\S]*4,000/iu);
    assert.match(nodeBlock(spec, 'release'), /320/u);
    assert.match(nodeBlock(spec, 'release'), /data card|数据卡/iu);
  }
});

superseded('keeps ADR-Bench general and professional construction/evaluation lanes separate', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('ADR-Bench', language);
    assert.match(edgeBlock(spec, 'real_scenarios', 'general_screen'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'general_screen', 'general_70'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'professional_experts', 'co_design'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'co_design', 'cross_validate'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'cross_validate', 'professional_40'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'general_70', 'suite'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'professional_40', 'suite'), /^    type: primary$/mu);
    assert.match(nodeBlock(spec, 'general_eval'), /five|5|五/iu);
    assert.match(nodeBlock(spec, 'general_eval'), /four|4|四/iu);
    assert.match(nodeBlock(spec, 'professional_eval'), /fatal negative|致命负向/iu);
    assert.match(nodeBlock(spec, 'professional_eval'), /(?:score 0|得分 0)/iu);
  }
});

superseded('separates AGIEval acquisition and serializes the exact source-specific 5-shot pools and splits', () => {
  for (const language of ['en', 'zh']) {
    const spec = readSpec('AGIEval', language);
    assert.match(nodeBlock(spec, 'direct_sources'), /Gaokao.*SAT|高考.*SAT/iu);
    assert.match(nodeBlock(spec, 'reused_sources'), /LSAT.*LogiQA.*MATH.*AQuA.*JEC/isu);
    assert.match(edgeBlock(spec, 'direct_select', 'objective_filter'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'reused_downsample', 'objective_filter'), /^    type: primary$/mu);
    assert.match(edgeBlock(spec, 'dataset', 'five_shot_route'), /^    type: data$/mu);
    for (const rule of ['pool_examples', 'exam_original_pool', 'jec_remainder', 'math_appendix']) {
      assert.match(edgeBlock(spec, 'five_shot_route', rule), /^    type: data$/mu, `${language} ${rule}`);
      assert.match(edgeBlock(spec, rule, 'five_shot_bundle'), /^    type: data$/mu, `${language} ${rule}->bundle`);
    }
    assert.match(edgeBlock(spec, 'five_shot_bundle', 'prompts'), /^    type: data$/mu);
    assert.match(nodeBlock(spec, 'pool_examples'), /AQuA[\s\S]*LogiQA[\s\S]*LSAT/iu);
    assert.match(nodeBlock(spec, 'pool_examples'), /train|训练集/iu);
    assert.match(nodeBlock(spec, 'pool_examples'), /random|随机/iu);
    assert.match(nodeBlock(spec, 'pool_examples'), /medium-length|中等长度/iu);
    assert.match(nodeBlock(spec, 'exam_original_pool'), /Gaokao[\s\S]*SAT|高考[\s\S]*SAT/iu);
    assert.match(nodeBlock(spec, 'exam_original_pool'), /original collected set|原始收集集/iu);
    assert.match(nodeBlock(spec, 'exam_original_pool'), /medium-length|中等长度/iu);
    assert.match(nodeBlock(spec, 'exam_original_pool'), /remove[\s\S]*test|从[\s\S]*test[\s\S]*移除/iu);
    assert.doesNotMatch(nodeBlock(spec, 'exam_original_pool'), /target question|当前目标题/iu);
    assert.match(nodeBlock(spec, 'jec_remainder'), /JEC[\s\S]*(?:first 1,000|前 1,000)/iu);
    assert.match(nodeBlock(spec, 'jec_remainder'), /train[\s\S]*test|训练集[\s\S]*测试集/iu);
    assert.match(nodeBlock(spec, 'jec_remainder'), /(?:remainder|剩余)[\s\S]*(?:5|五)/iu);
    assert.match(nodeBlock(spec, 'jec_remainder'), /medium sentence length|中等句长/iu);
    assert.match(nodeBlock(spec, 'math_appendix'), /MATH[\s\S]*Lewkowycz[\s\S]*(?:appendix|附录)/iu);
    assert.match(nodeBlock(spec, 'math_appendix'), /do not sample|不采样/iu);
    assert.match(edgeBlock(spec, 'format', 'mcq'), /MCQ|选择题/u);
    assert.match(edgeBlock(spec, 'format', 'fill'), /Fill-in|填空题/iu);
  }
  const reviewNote = readDetail('AGIEval').drawio_review_note;
  assert.match(reviewNote, /random[\s\S]*training[\s\S]*medium-length/iu);
  assert.match(reviewNote, /original collected[\s\S]*remove[\s\S]*test/iu);
  assert.match(reviewNote, /first 1,000[\s\S]*test[\s\S]*remainder/iu);
  assert.match(reviewNote, /JEC[\s\S]*medium-sentence-length/iu);
  assert.doesNotMatch(reviewNote, /target-excluding/iu);
});

superseded('pins every A1a primary source and locator in benchmark details', () => {
  const expected = {
    '2WikiMultihopQA': ['https://arxiv.org/abs/2011.01060v2', '13800e5be57df1b4040b9b1588c6c811779e69e9'],
    'AA-LCR': ['', 'bdae010bbce259820c0e34c1d7cce210d966fb75'],
    'AA-Omniscience': ['https://arxiv.org/abs/2511.13029v1', '4a8ffc87c4650054825fb767fe0da4a4fc97ff32'],
    ACPBench_Hard: ['https://arxiv.org/abs/2503.24378v2', '2ed9c925962d57b275bf8c4e7b5d6f564aac9d6d'],
    'ADR-Bench': ['https://arxiv.org/abs/2512.20491v4', '8f6798f750fba58910a85d5c340b4e0ea4b168b4'],
    AGIEval: ['https://arxiv.org/abs/2304.06364v2', '84ab72d94318290aad2e4ec820d535a95a1f7552'],
  };
  for (const [id, [paperUrl, sourceRevision]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paperUrl, `${id} paper version`);
    if (paperUrl) assert.equal(detail.arxiv_pdf_url, paperUrl.replace('/abs/', '/pdf/'));
    assert.match(detail.drawio_review_note, new RegExp(sourceRevision, 'u'), `${id} source revision`);
    assert.match(detail.drawio_review_note, /(?:Section|Appendix|Data card|§|节|附录)/iu, `${id} locator`);
  }
});

test('publishes native-text fixed-light Draw.io, SVG, and PNG assets', () => {
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

test('normalizes literal mxCell.value line breaks into stable XML entities', () => {
  const normalized = normalizeImporterDrawioContent(multilineDrawioFixture);
  assert.match(normalized, /value="First line&#xa;Second line&#xa;Third line"/u);
  assert.doesNotMatch(normalized, /value="[^"]*(?:\r\n|\r|\n)[^"]*"/u);
  assert.equal(normalizeImporterDrawioContent(normalized), normalized);
});

test('runs the importer asset normalizer portably through the repo-local Node CLI', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'importer-drawio-normalizer-'));
  const fixturePath = join(tempDir, 'multiline.drawio');
  try {
    writeFileSync(fixturePath, multilineDrawioFixture);
    execFileSync(process.execPath, [normalizerPath, fixturePath], { encoding: 'utf8' });
    const once = readFileSync(fixturePath, 'utf8');
    assert.match(once, /value="First line&#xa;Second line&#xa;Third line"/u);

    execFileSync(process.execPath, [normalizerPath, fixturePath], { encoding: 'utf8' });
    assert.equal(readFileSync(fixturePath, 'utf8'), once);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
