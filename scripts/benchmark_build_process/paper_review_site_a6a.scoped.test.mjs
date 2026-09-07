import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'BioPipelineBench_Verified',
  'BrowseComp-Plus',
  'C-Eval',
  'C3-Benchmark',
  'CG-Bench',
  'CIMemories',
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

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function readArch(id, language) {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
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

test('publishes six bilingual, topology-identical native Draw.io packages', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), `${id} topology`);
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const { width, height } = pngDimensions(`${base}.png`);
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /math="0"/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.match(svg, /color-scheme:\s*light/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|Text is not SVG/u);
      assert.ok(width >= 800 && height >= 300, `${id}.${language} PNG dimensions`);
      assert.ok(width / height < 4.5, `${id}.${language} PNG aspect ratio`);
    }
  }
});

test('limits BioPipelineBench Verified to the disclosed internal evaluation protocol', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BioPipelineBench_Verified', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('reviewer_validation')?.label ?? '', /external.*review|外部.*评审/iu);
    assert.match(nodes.get('runtime_protocol')?.label ?? '', /Bash/iu);
    assert.match(nodes.get('runtime_protocol')?.label ?? '', /package manager|包管理/iu);
    assert.match(nodes.get('runtime_protocol')?.label ?? '', /without extended thinking|不使用扩展思考/iu);
    assert.ok(edges.has('domains->reviewer_validation:primary'));
    assert.ok(edges.has('reviewer_validation->verified_slice:primary'));
    assert.ok(edges.has('verified_slice->runtime_protocol:primary'));
    assert.doesNotMatch(JSON.stringify(arch), /install needed|resolve.*dependencies|collect workflow outputs|submission schema|安装所需|解析.*依赖|收集工作流输出|提交格式/iu);
    for (const fabricatedId of ['task_package', 'install', 'execute', 'outputs']) {
      assert.equal(nodes.has(fabricatedId), false, `${language} fabricated ${fabricatedId}`);
    }
  }
});

test('preserves the exact BrowseComp-Plus 1,266 to 830 funnel and separates evaluation contracts', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BrowseComp-Plus', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('original')?.label ?? '', /1,?266/u);
    assert.match(nodes.get('o3_gate')?.label ?? '', /124/u);
    assert.match(nodes.get('after_o3')?.label ?? '', /1,?142/u);
    assert.match(nodes.get('scrape')?.label ?? '', /Selenium.*Trafilatura/isu);
    assert.match(nodes.get('scrape_gate')?.label ?? '', /137/u);
    assert.match(nodes.get('after_scrape')?.label ?? '', /1,?005/u);
    assert.match(nodes.get('verified')?.label ?? '', /830/u);
    for (const edge of [
      'original->o3_gate:primary',
      'o3_gate->after_o3:primary',
      'after_o3->scrape:primary',
      'scrape->scrape_gate:primary',
      'scrape_gate->after_scrape:primary',
      'after_scrape->human_verify:primary',
      'human_verify->verified:primary',
      'verified->decompose:primary',
      'decompose->hard_negatives:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.equal([...arch.edges].some(edge => edge.to === 'decompose' && edge.from !== 'verified'), false);
    assert.match(nodes.get('end_to_end')?.label ?? '', /GPT-4\.1/iu);
    assert.match(nodes.get('retrieval_score')?.label ?? '', /Recall@5.*100.*1000.*nDCG@10/isu);
    assert.ok(edges.has('agent->end_to_end:primary'));
    assert.ok(edges.has('retrievers->retrieval_score:data'));
  }
});

test('keeps C-Eval dev explanation authoring, three official prompt modes, and release boundary explicit', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('C-Eval', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('gpt4_explanations')?.label ?? '', /GPT-4/iu);
    assert.match(nodes.get('human_revision')?.label ?? '', /manual.*revis|人工.*修订/iu);
    assert.ok(edges.has('dev->gpt4_explanations:primary'));
    assert.ok(edges.has('gpt4_explanations->human_revision:primary'));
    assert.match(nodes.get('zero_answer')?.label ?? '', /zero-shot.*answer-only|零样本.*仅答案/iu);
    assert.match(nodes.get('five_answer')?.label ?? '', /five-shot.*answer-only|五样本.*仅答案/iu);
    assert.match(nodes.get('five_cot')?.label ?? '', /five-shot.*(?:CoT|chain-of-thought)|五样本.*思维链/iu);
    assert.match(nodes.get('release_boundary')?.label ?? '', /2025-07-27/u);
    assert.match(nodes.get('release_boundary')?.label ?? '', /public|公开/iu);
  }
});

test('builds C3 tool schemas before generation and confines dependencies and hidden information to evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('C3-Benchmark', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('api_tools')?.label ?? '', /400/u);
    assert.match(nodes.get('categories')?.label ?? '', /50/u);
    assert.match(nodes.get('tool_functions')?.label ?? '', /1,?600/u);
    assert.match(nodes.get('description_revision')?.label ?? '', /LLM|HunYuan|混元/iu);
    assert.match(nodes.get('parameter_expansion')?.label ?? '', /enum.*array.*object|枚举.*数组.*对象/isu);
    assert.match(nodes.get('tool_review')?.label ?? '', /five.*expert|五.*专家/iu);
    for (const edge of [
      'api_tools->categories:primary',
      'categories->tool_functions:primary',
      'tool_functions->description_revision:primary',
      'description_revision->parameter_expansion:primary',
      'parameter_expansion->tool_review:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.doesNotMatch(JSON.stringify(arch), /15 role subtypes|fifteen role subtypes|15 个角色子类型|十五个角色子类型/iu);
    assert.match(nodes.get('challenge1')?.label ?? '', /tool.*depend|工具.*依赖/iu);
    assert.match(nodes.get('challenge2')?.label ?? '', /hidden information|隐藏信息/iu);
    assert.equal([...arch.edges].some(edge => edge.to === 'challenge1' && edge.from !== 'release'), false);
    assert.equal([...arch.edges].some(edge => edge.to === 'challenge2' && edge.from !== 'release'), false);
  }
});

test('requires every CG-Bench quality check and loops any failure back to revision', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CG-Bench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('manual_qc')?.label ?? '', /manual.*rational|人工.*合理/iu);
    assert.match(nodes.get('text_qc')?.label ?? '', /GPT-4/iu);
    assert.match(nodes.get('visual_qc')?.label ?? '', /MLLM/iu);
    assert.match(nodes.get('distribution_qc')?.label ?? '', /duration.*position|时长.*位置/iu);
    assert.match(nodes.get('all_gate')?.label ?? '', /all four.*pass|四项.*全部.*通过/iu);
    for (const edge of [
      'options->manual_qc:primary',
      'manual_qc->text_qc:primary',
      'text_qc->visual_qc:primary',
      'visual_qc->distribution_qc:primary',
      'distribution_qc->all_gate:primary',
      'all_gate->release:primary',
      'all_gate->revise:optional',
      'revise->qac:optional',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
  }
});

test('separates the CIMemories paper evaluation set from the 71,883-row raw Hub artifact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CIMemories', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('paper_eval')?.label ?? '', /filtered.*labeled|筛选.*标注/iu);
    assert.match(nodes.get('hf_raw')?.label ?? '', /71,?883/u);
    assert.match(nodes.get('hf_raw')?.label ?? '', /blank|null|空白|空值/iu);
    assert.match(nodes.get('hf_raw')?.label ?? '', /raw|原始/iu);
    assert.ok(edges.has('balance->paper_eval:primary'));
    assert.ok(edges.has('paper_eval->runs:primary'));
    assert.equal([...arch.edges].some(edge => edge.from === 'hf_raw' && edge.to === 'runs'), false);
    assert.doesNotMatch(nodes.get('hf_raw')?.label ?? '', /(?:contains|includes|with) gold labels|含金标/iu);
  }
  const detail = readDetail('CIMemories');
  assert.match(`${detail.scale} ${detail.scale_en}`, /71,?883/u);
  assert.match(`${detail.scale} ${detail.scale_en}`, /blank|null|空白|空值/iu);
  assert.match(`${detail.scale} ${detail.scale_en}`, /filtered.*labeled|筛选.*标注/iu);
});

test('pins paper and repository versions and records reviewed source locators', () => {
  const expected = {
    BioPipelineBench_Verified: {
      paper: 'https://www-cdn.anthropic.com/0b4915911bb0d19eca5b5ee635c80fef830a37ea.pdf',
      note: /REDRAW.*Claude Opus 4\.8 System Card.*§8\.16/isu,
    },
    'BrowseComp-Plus': {
      paper: 'https://arxiv.org/abs/2508.06600v1',
      note: /REDRAW.*§2.*§3.*046949032b0328319cc9a02663a759ec601d9402/isu,
    },
    'C-Eval': {
      paper: 'https://arxiv.org/abs/2305.08322v3',
      note: /REDRAW.*§2.*§3.*cba65ae93bcf189149ced9f66ae0c958201faed9/isu,
    },
    'C3-Benchmark': {
      paper: 'https://arxiv.org/abs/2505.18746v4',
      note: /REDRAW.*Appendix A\.1\.1.*1aab165c435ac93e24cbf5bcea0e5bda29fbbf09/isu,
    },
    'CG-Bench': {
      paper: 'https://arxiv.org/abs/2412.12075v1',
      note: /REDRAW.*§3\.1.*f826608752443a13b21f214c2d9c4156c526f030/isu,
    },
    CIMemories: {
      paper: 'https://arxiv.org/abs/2511.14937v1',
      note: /REDRAW.*cd96d5756e35b3549b5ec6ecbd316fc0349c8669/isu,
    },
  };
  for (const [id, { paper, note }] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paper, `${id} paper URL`);
    assert.equal(detail.arxiv_pdf_url, paper.startsWith('https://arxiv.org/') ? paper.replace('/abs/', '/pdf/') : '');
    assert.match(detail.drawio_review_note, note, `${id} review note`);
  }
});

test('keeps each detail fallback synchronized with every reviewed node and edge', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const fallback = detail[`flowchart_${language}`];
      assert.match(fallback, /^flowchart LR$/mu, `${id}.${language}`);
      for (const node of readArch(id, language).nodes) {
        assert.match(fallback, new RegExp(`^    ${escapeRegex(node.id)}\\[`, 'mu'), `${id}.${language}.${node.id}`);
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

test('strictly rebuilds and normalizes all 12 specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a6a-'));
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
