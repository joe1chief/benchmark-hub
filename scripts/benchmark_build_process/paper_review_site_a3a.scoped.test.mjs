import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'AdvancedIF',
  'AetherCode',
  'AfriMed-QA',
  'Agent-SafetyBench',
  'AgentDAM',
  'AgentHarm',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language) {
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

function mermaidEdges(mermaid) {
  return [...mermaid.matchAll(
    /^    ([A-Za-z0-9_-]+) (-->|-\.->) ([A-Za-z0-9_-]+)$/gmu,
  )].map(([, from, arrow, to]) => (
    `${from}->${to}:${arrow === '-->' ? 'primary' : 'secondary'}`
  )).sort();
}

test('keeps all six A3a diagrams bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

test('routes both AdvancedIF multi-turn categories through category-specific dialogue and human review', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AdvancedIF', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('complex')?.label ?? '', /402/u);
    assert.match(nodes.get('carried')?.label ?? '', /736/u);
    assert.match(nodes.get('system')?.label ?? '', /507/u);
    assert.match(nodes.get('carried_dialogue')?.label ?? '', /annotator.*LLM|标注员.*LLM/iu);
    assert.match(nodes.get('system_dialogue')?.label ?? '', /annotator.*LLM|标注员.*LLM/iu);
    assert.match(nodes.get('system_dialogue')?.label ?? '', /507\/507.*(?:at least\s*4|至少\s*4)/iu);
    assert.match(nodes.get('human_review')?.label ?? '', /multiple.*human review|multiple.*review rounds|多轮.*人工.*审核/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /402.*736.*507.*1,?645/su);
    assert.ok(edges.has('carried->carried_dialogue:primary'));
    assert.ok(edges.has('carried_dialogue->failure_gate:primary'));
    assert.ok(edges.has('system->system_dialogue:primary'));
    assert.ok(edges.has('system_dialogue->failure_gate:primary'));
    assert.ok(edges.has('complex->failure_gate:primary'));
    assert.ok(edges.has('rubrics->human_review:primary'));
    assert.ok(edges.has('human_review->dataset:primary'));
    assert.equal(edges.has('complex->carried_dialogue:primary'), false);
    assert.equal(edges.has('complex->system_dialogue:primary'), false);
    assert.equal(edges.has('system->failure_gate:primary'), false);
    assert.equal(edges.has('rubrics->dataset:primary'), false);
  }
});

test('preserves the reviewed AetherCode construction and evaluation evidence', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AetherCode', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('statements')?.label ?? '', /PDF.*Markdown.*LaTeX/isu);
    assert.match(nodes.get('statements')?.label ?? '', /proofread|校对/iu);
    assert.match(nodes.get('solutions')?.label ?? '', /30,?000/u);
    assert.match(nodes.get('automatic')?.label ?? '', /official|官方/iu);
    assert.match(nodes.get('automatic')?.label ?? '', /Generator.Validator/iu);
    assert.match(nodes.get('audit')?.label ?? '', /audit|审计|审核/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /456.*159.*145.*132.*20/su);
    assert.ok(edges.has('competitions->statements:primary'));
    assert.ok(edges.has('statements->solutions:primary'));
    assert.ok(edges.has('solutions->categorize:primary'));
    assert.ok(edges.has('automatic->experts:primary'));
    assert.ok(edges.has('experts->audit:primary'));
  }
});

test('gates AfriMed contributors before collection and samples questions before responses', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AfriMed-QA', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('contributors')?.label ?? '', /recruit.*credential|招募.*资质/isu);
    assert.match(nodes.get('sample_review')?.label ?? '', /sample|样例|样本/iu);
    assert.match(nodes.get('quality_gate')?.label ?? '', /80%/u);
    assert.match(nodes.get('random_questions')?.label ?? '', /3,?000.*question|3,?000.*问题/iu);
    assert.match(nodes.get('human_responses')?.label ?? '', /response|回答|响应/iu);
    assert.doesNotMatch(nodes.get('human')?.label ?? '', /random.*response|随机.*回答/iu);
    for (const edge of [
      'contributors->sample_review:primary',
      'sample_review->quality_gate:primary',
      'quality_gate->authorized:primary',
      'authorized->type:primary',
      'expert->item_qa:primary',
      'trainee->item_qa:primary',
      'consumer->item_qa:primary',
      'item_qa->dataset:primary',
      'dataset->random_questions:data',
      'random_questions->human_responses:primary',
      'human_responses->human:primary',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    assert.equal(edges.has('responses->random_questions:primary'), false);
    assert.equal(edges.has('contributors->type:primary'), false);
  }
});

test('serializes Agent-SafetyBench scorer training before trajectory classification', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Agent-SafetyBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.equal(nodes.has('case_audit'), false);
    assert.match(nodes.get('interaction_qc')?.label ?? '', /4,?000/su);
    assert.match(nodes.get('interaction_qc')?.label ?? '', /revis.*cases.*environments|修订.*案例.*环境/isu);
    assert.match(nodes.get('cross_validation')?.label ?? '', /200.*98%/su);
    assert.match(nodes.get('cross_validation')?.label ?? '', /200.*97\.5%/su);
    assert.match(nodes.get('trained_scorer')?.label ?? '', /91\.5%/u);
    assert.match(nodes.get('agent_eval')?.label ?? '', /16/u);
    assert.match(nodes.get('trajectories')?.label ?? '', /complete|完整/iu);
    assert.match(nodes.get('safety_label')?.label ?? '', /safe.*unsafe|安全.*不安全/iu);
    for (const edge of [
      'automatic_checks->interaction_qc:primary',
      'interaction_qc->cross_validation:primary',
      'cross_validation->benchmark:primary',
      'cross_validation->scorer_train:data',
      'scorer_train->trained_scorer:primary',
      'benchmark->agent_eval:primary',
      'agent_eval->trajectories:primary',
      'trajectories->score_trajectories:primary',
      'trained_scorer->score_trajectories:data',
      'score_trajectories->safety_label:primary',
      'safety_label->report:primary',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    assert.equal(edges.has('benchmark->interaction_qc:data'), false);
    assert.equal(edges.has('benchmark->interaction_qc:primary'), false);
    assert.equal(edges.has('scorer_train->report:data'), false);
    assert.equal(edges.has('agent_eval->report:primary'), false);
  }
});

test('records AgentDAM synthesis selection and the disclosed GPT-4o judge validation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AgentDAM', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('synthesize')?.label ?? '', /Llama-3\.3-70B/u);
    assert.match(nodes.get('elbow_select')?.label ?? '', /elbow|肘部/iu);
    assert.match(nodes.get('elbow_select')?.label ?? '', /2.*seed|每.*种子.*2/iu);
    assert.match(nodes.get('privacy')?.label ?? '', /GPT-4o/iu);
    assert.doesNotMatch(nodes.get('privacy')?.label ?? '', /human annotation|人工隐私标注/iu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /four|4|四/iu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /GPT-4o.*(?:AXTree|accessibility)|GPT-4o.*(?:无障碍树|可访问性树)/isu);
    assert.match(nodes.get('judge_validation')?.label ?? '', /98%/u);
    assert.ok(edges.has('human_seeds->synthesize:primary'));
    assert.ok(edges.has('synthesize->elbow_select:primary'));
    assert.ok(edges.has('elbow_select->dataset:primary'));
    assert.ok(edges.has('privacy->metrics:primary'));
    assert.ok(edges.has('privacy->judge_validation:data'));
    assert.equal(edges.has('judge_validation->metrics:primary'), false);
  }
});

test('reviews AgentHarm final variants before tools, rubrics, and packaging', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('AgentHarm', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('base_behaviors')?.label ?? '', /110/u);
    assert.match(nodes.get('augmentation')?.label ?? '', /four|4|四/iu);
    assert.match(nodes.get('benign')?.label ?? '', /counterpart|对应/iu);
    assert.match(nodes.get('final_review')?.label ?? '', /every final task|每个最终任务/iu);
    assert.match(nodes.get('final_review')?.label ?? '', /non-author|非作者/iu);
    assert.match(nodes.get('package')?.label ?? '', /44.*264.*132/su);
    for (const edge of [
      'base_behaviors->augmentation:primary',
      'augmentation->benign:data',
      'augmentation->final_review:primary',
      'benign->final_review:data',
      'final_review->tools:primary',
      'final_review->rubrics:data',
      'tools->package:primary',
      'rubrics->package:data',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    assert.equal(edges.has('base_behaviors->final_review:primary'), false);
    assert.equal(edges.has('final_review->augmentation:primary'), false);
  }
});

test('keeps each Mermaid fallback synchronized with the reviewed Draw.io topology', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const mermaid = detail[`flowchart_${language}`];
      const arch = readArch(id, language);
      assert.match(mermaid, /^flowchart LR$/mu, `${id}.${language} Mermaid header`);
      for (const node of arch.nodes) {
        assert.match(
          mermaid,
          new RegExp(`^    ${escapeRegex(node.id)}\\[`, 'mu'),
          `${id}.${language} Mermaid node ${node.id}`,
        );
      }
      for (const edge of arch.edges) {
        const arrow = edge.type === 'primary' ? '-->' : '-.->';
        assert.match(
          mermaid,
          new RegExp(`^    ${escapeRegex(edge.from)} ${escapeRegex(arrow)} ${escapeRegex(edge.to)}$`, 'mu'),
          `${id}.${language} Mermaid ${edge.type} edge ${edge.from}->${edge.to}`,
        );
      }
      assert.deepEqual(
        mermaidEdges(mermaid),
        arch.edges.map(({ from, to, type }) => (
          `${from}->${to}:${type === 'primary' ? 'primary' : 'secondary'}`
        )).sort(),
        `${id}.${language} Mermaid must preserve every edge and its primary/secondary style`,
      );
    }
  }
});

test('pins paper versions, verdicts, and exact source locators', () => {
  const expected = {
    AdvancedIF: ['https://arxiv.org/abs/2511.10507v2', /WORDING.*§§3\.1[–-]3\.2.*Table 1/isu],
    AetherCode: ['https://arxiv.org/abs/2508.16402v1', /PASS.*§§2\.1[–-]2\.4.*§3/isu],
    'AfriMed-QA': ['https://arxiv.org/abs/2411.15640v4', /REDRAW.*§§3\.1[–-]4\.3.*Table 2.*Appendix A/isu],
    'Agent-SafetyBench': ['https://arxiv.org/abs/2412.14470v2', /REDRAW.*§3\.2\.2[–-]§3\.3.*§4\.1.*Appendices F.*G/isu],
    AgentDAM: ['https://arxiv.org/abs/2503.09780v3', /WORDING.*§§3\.1[–-]3\.4.*Appendix B\.2/isu],
    AgentHarm: ['https://arxiv.org/abs/2410.09024v3', /REDRAW.*§§3\.1[–-]3\.2.*§4\.1/isu],
  };
  for (const [id, [paperUrl, notePattern]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paperUrl, `${id} paper version`);
    assert.equal(detail.arxiv_pdf_url, paperUrl.replace('/abs/', '/pdf/'));
    assert.match(detail.drawio_review_note, notePattern, `${id} verdict and locator`);
  }
});

test('publishes fixed-light native-text Draw.io Desktop SVG and PNG pairs', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const { width, height } = pngDimensions(`${base}.png`);
      const expectedNodeLines = readArch(id, language).nodes.reduce(
        (sum, node) => sum + node.label.split('\n').length,
        0,
      );
      const svgTspanCount = svg.match(/<tspan>/gu)?.length ?? 0;

      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /math="0"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.doesNotMatch(
        drawio,
        /value="[^"]*(?:\r\n|\r|\n)[^"]*"/u,
        `${id}.${language}.drawio must encode multiline labels portably`,
      );
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.ok(svgTspanCount >= expectedNodeLines, `${id}.${language}.svg native text lines`);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\//u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(|color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
      assert.ok(width >= 800 && height >= 200, `${id}.${language}.png dimensions`);
    }
  }
});
