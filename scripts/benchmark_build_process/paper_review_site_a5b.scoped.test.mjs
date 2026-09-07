import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['BigOBench', 'BioASQ', 'BBQ', 'BeyondAIME', 'BABILong', 'BackendBench'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language) {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readDetail(id) {
  return readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
}

function readSpec(id, language) {
  return readFileSync(join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`), 'utf8');
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

function fallbackText(detail) {
  return [detail.mermaid_flowchart, detail.flowchart_en, detail.flowchart_zh]
    .filter(value => typeof value === 'string')
    .join('\n');
}

function pngDimensions(path) {
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('keeps all six A5b bundles bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'en')), topology(readArch(id, 'zh')), id);
  }
});

test('models BigO(Bench) validation as an audit and all three evaluation tasks in parallel', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BigOBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('source')?.label ?? '', /8[,.]?139.*1[,.]?485[,.]?888/isu);
    assert.match(nodes.get('dataclass')?.label ?? '', /82%/u);
    assert.match(nodes.get('profile')?.label ?? '', /Bubblewrap.*cProfile.*tracemalloc/isu);
    assert.match(nodes.get('fit')?.label ?? '', /non-negative.*least squares|非负.*最小二乘/iu);
    assert.match(nodes.get('dataset')?.label ?? '', /3[,.]?105.*1[,.]?190[,.]?250/isu);
    assert.match(nodes.get('tests')?.label ?? '', /311.*640.*11.*308.*636.*5.*63/isu);
    assert.match(nodes.get('validate')?.label ?? '', /92%.*84%/su);
    for (const edge of [
      'dataset->tests:primary',
      'dataset->validate:data',
      'tests->validate:data',
      'tests->predict:primary',
      'tests->generate:primary',
      'tests->rank:primary',
      'predict->prediction_metric:primary',
      'generate->generation_metric:primary',
      'rank->ranking_metric:primary',
      'prediction_metric->report:primary',
      'generation_metric->report:primary',
      'ranking_metric->report:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.match(nodes.get('predict')?.label ?? '', /20/iu);
    assert.match(nodes.get('prediction_metric')?.label ?? '', /unbiased|无偏/iu);
    assert.match(nodes.get('prediction_metric')?.label ?? '', /20.*Pass@k.*Best@k.*All@k|Pass@k.*Best@k.*All@k.*20/isu);
    assert.match(nodes.get('generation_metric')?.label ?? '', /20.*Pass@k.*Best@k.*All@k/isu);
    assert.match(nodes.get('rank')?.label ?? '', /20.*(?:best correct|最佳正确)|20.*(?:correct coefficient|正确系数)/isu);
    assert.match(nodes.get('ranking_metric')?.label ?? '', /best.*20|20.*(?:best|最佳)/isu);
    assert.match(nodes.get('ranking_metric')?.label ?? '', /no correct.*0|无正确.*0/isu);
    assert.match(nodes.get('ranking_metric')?.label ?? '', /coefficient.*percentile|系数.*百分位/iu);
  }
  const fallback = fallbackText(readDetail('BigOBench'));
  assert.match(fallback, /Task 1.*20.*unbiased.*Pass@k.*Best@k.*All@k|任务一.*20.*无偏.*Pass@k.*Best@k.*All@k/isu);
  assert.match(fallback, /Task 3.*20.*best correct.*(?:none|no correct).*0|任务三.*20.*最佳系数.*无正确.*0/isu);
});

test('separates BioASQ Task 1a and Task 1b Phase A/B information contracts', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BioASQ', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.ok(edges.has('sources->task1a_train:primary'));
    assert.ok(edges.has('sources->task1a_test:primary'));
    assert.ok(!edges.has('task1a_train->task1a_test:primary'));
    assert.match(nodes.get('task1a_test')?.label ?? '', /subsequent MEDLINE|后续 MEDLINE/iu);
    assert.match(nodes.get('task1a_test')?.label ?? '', /3.*6|three.*six/iu);
    assert.match(nodes.get('task1a_submit')?.label ?? '', /21/iu);
    assert.match(nodes.get('phase_a_input')?.label ?? '', /question.*type|问题.*类型/iu);
    assert.match(nodes.get('phase_a_input')?.label ?? '', /(?:gold|official.*(?:evidence|answers)).*hidden|(?:隐藏|不提供).*(?:金标|官方证据|官方答案)/isu);
    assert.ok(edges.has('phase_a_input->phase_a:primary'));
    assert.ok(!edges.has('qa_gold->phase_a:primary'));
    assert.ok(edges.has('qa_gold->phase_b:data'));
    assert.ok(edges.has('phase_a->phase_b:optional'));
    assert.match(nodes.get('phase_a_metrics')?.label ?? '', /MAP.*primary|MAP.*主/iu);
    assert.match(nodes.get('phase_a_metrics')?.label ?? '', /GMAP.*precision.*recall.*F/isu);
    assert.match(nodes.get('exact_metrics')?.label ?? '', /factoid.*MRR.*primary|事实型.*MRR.*主/isu);
    assert.match(nodes.get('exact_metrics')?.label ?? '', /list.*mean F|列表.*平均 F/iu);
    assert.match(nodes.get('exact_metrics')?.label ?? '', /summary.*no exact|摘要.*无精确/iu);
    assert.match(nodes.get('ideal_metrics')?.label ?? '', /four.*1.*5|四项.*1.*5/iu);
    assert.match(nodes.get('ideal_metrics')?.label ?? '', /ROUGE.*explor|ROUGE.*探索/iu);
  }
  const detail = readDetail('BioASQ');
  for (const key of ['mermaid_flowchart', 'flowchart_en', 'flowchart_zh']) {
    assert.match(detail[key], /Phase A|阶段 A|阶段A/u, key);
    assert.match(detail[key], /Phase B|阶段 B|阶段B/u, key);
  }
  for (const language of ['en', 'zh']) {
    assert.match(readSpec('BioASQ', language), /from: experts[\s\S]*?to: phase_a_input[\s\S]*?waypoints:/u);
  }
  assert.doesNotMatch(fallbackText(detail), /Inter-Annotator Agreement|Initial Problem Pool/iu);
});

test('validates every BBQ template with four sampled conditions and a full revision loop', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BBQ', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('templates')?.label ?? '', /nine.*two.*25|九.*两.*25/isu);
    assert.match(nodes.get('conditions')?.label ?? '', /ambiguous.*disambiguated.*negative.*non-negative|歧义.*消歧.*负向.*非负向/isu);
    assert.match(nodes.get('expansion')?.label ?? '', /10.*UNKNOWN|10.*未知/iu);
    assert.match(nodes.get('validation')?.label ?? '', /all.*four.*one|one.*(?:per|each).*condition|四.*(?:题|条件)/isu);
    assert.match(nodes.get('validation')?.label ?? '', /five|5/u);
    assert.match(nodes.get('agreement')?.label ?? '', /4\s*\/\s*5/u);
    for (const edge of [
      'expansion->validation:primary',
      'validation->agreement:primary',
      'agreement->dataset:primary',
      'agreement->revise:optional',
      'revise->conditions:optional',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.match(nodes.get('dataset')?.label ?? '', /58[,.]?492/u);
    assert.match(nodes.get('bias_score')?.label ?? '', /sDIS.*sAMB/isu);
  }
});

test('keeps BeyondAIME to the disclosed two-source gates and 32-response evaluation', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BeyondAIME', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.ok(edges.has('original_design->duplication_gate:primary'));
    assert.ok(edges.has('adaptation->duplication_gate:primary'));
    assert.match(nodes.get('duplication_gate')?.label ?? '', /no direct|无直接/iu);
    assert.match(nodes.get('anti_guess')?.label ?? '', /directly.*simple answer|直接.*简单答案/iu);
    assert.match(nodes.get('difficulty')?.label ?? '', /hardest AIME|最难 AIME/iu);
    assert.match(nodes.get('release')?.label ?? '', /100.*integer.*no.*range|100.*整数.*无.*范围/isu);
    assert.match(nodes.get('model_eval')?.label ?? '', /32/iu);
    assert.doesNotMatch(JSON.stringify(arch), /Parse the Final Integer|解析最终整数|specialist redesign|专家重新设计/iu);
    assert.equal(arch.edges.filter(edge => edge.type === 'optional').length, 0);
  }
});

test('keeps BABILong construction and three independent paper-specified sampling protocols', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BABILong', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(nodes.get('task_suite')?.label ?? '', /QA1.*QA20|QA1.*QA20/isu);
    assert.match(nodes.get('pg19')?.label ?? '', /original order|原(?:始)?顺序/iu);
    assert.match(nodes.get('length_control')?.label ?? '', /GPT-2/u);
    assert.match(nodes.get('release')?.label ?? '', /0K.*10M/isu);
    for (const to of ['direct_eval', 'rag_chunks', 'rag_sentences', 'recurrent_train']) {
      assert.ok([...edges].some(edge => edge.startsWith(`release->${to}:`)), `${language} ${to}`);
    }
    assert.match(nodes.get('rag_chunks')?.label ?? '', /512/u);
    assert.match(nodes.get('recurrent_train')?.label ?? '', /RMT.*ARMT.*Mamba/isu);
    assert.match(nodes.get('recurrent_eval')?.label ?? '', /50M/u);
    assert.match(nodes.get('score')?.label ?? '', /QA1.*QA5.*1[,.]?000.*32K.*100/isu);
    assert.match(nodes.get('rag_score')?.label ?? '', /50.*task.*length.*RAG-C.*RAG-S|每任务.*每长度.*50.*RAG-C.*RAG-S/isu);
    assert.match(nodes.get('recurrent_score')?.label ?? '', /full test.*1M.*100.*10M.*50M|1M.*完整测试.*10M.*100.*50M/isu);
    for (const edge of [
      'direct_eval->score:primary',
      'rag_chunks->rag_score:data',
      'rag_sentences->rag_score:data',
      'recurrent_eval->recurrent_score:data',
      'score->method_compare:primary',
      'rag_score->method_compare:data',
      'recurrent_score->method_compare:data',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.ok(![...edges].some(edge => /^(rag_chunks|rag_sentences|recurrent_eval)->score:/u.test(edge)));
    assert.match(nodes.get('method_compare')?.label ?? '', /do not pool|不合并/iu);
    assert.match(readSpec('BABILong', language), /from: release[\s\S]*?to: recurrent_train[\s\S]*?waypoints:/u);
  }
  const fallback = fallbackText(readDetail('BABILong'));
  assert.match(fallback, /GPT-2/u);
  assert.match(fallback, /RAG-C.*RAG-S.*RMT.*ARMT.*Mamba/isu);
  assert.match(fallback, /direct.*QA1.*QA5.*1[,.]?000.*32K.*100|直接.*QA1.*QA5.*1[,.]?000.*32K.*100/isu);
  assert.match(fallback, /RAG.*50.*task.*length|RAG.*每个任务.*每个长度.*50/isu);
  assert.match(fallback, /recurrent.*full test.*1M.*100.*10M.*50M|循环.*1M.*完整测试.*10M.*100.*50M/isu);
  assert.match(fallback, /without pooling|不合并/iu);
  assert.doesNotMatch(fallback, /Refine & Regenerate|优化并重新生成/iu);
});

test('keeps BackendBench suite choice exclusive and pairs only TorchBench arrays', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BackendBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    assert.match(JSON.stringify(arch), /271.*124.*13.*110/isu);
    assert.match(nodes.get('variants')?.label ?? '', /Functional.*In-Place.*Out|函数式.*原地.*Out/isu);
    assert.match(nodes.get('refine')?.label ?? '', /five|五/iu);
    assert.match(nodes.get('register')?.label ?? '', /torch\.library/iu);
    assert.match(JSON.stringify(arch), /Smoke.*OpInfo.*FACTO.*TorchBench/isu);
    assert.match(nodes.get('suite_selector')?.label ?? '', /one.*--suite|仅一个.*--suite/iu);
    assert.match(nodes.get('correctness')?.label ?? '', /equal_nan.*1e-2/isu);
    assert.match(nodes.get('paired_arrays')?.label ?? '', /correctness\[i\].*performance\[i\].*(?:same|同一).*test.*index|correctness\[i\].*performance\[i\].*同一.*测试索引/isu);
    assert.match(nodes.get('geomean')?.label ?? '', /performance.*failed.*1×|性能.*失败.*1×/isu);
    assert.match(nodes.get('perf_p')?.label ?? '', /correct.*speedup\s*>\s*p|正确.*加速.*>\s*p/isu);
    for (const edge of [
      'suite_selector->smoke:primary',
      'suite_selector->opinfo:primary',
      'suite_selector->facto:primary',
      'suite_selector->torchbench:primary',
      'smoke->smoke_report:primary',
      'opinfo->opinfo_report:primary',
      'facto->facto_report:primary',
      'torchbench->correctness:primary',
      'torchbench->performance:primary',
      'correctness->paired_arrays:primary',
      'performance->paired_arrays:primary',
      'paired_arrays->correctness_rate:primary',
      'paired_arrays->perf_p:primary',
      'paired_arrays->geomean:primary',
    ]) assert.ok(edges.has(edge), `${language} missing ${edge}`);
    assert.ok(![...edges].some(edge => /^smoke->(?:opinfo|facto|torchbench):/u.test(edge)));
    assert.ok(!edges.has('correctness->geomean:primary'));
    assert.match(nodes.get('opinfo_report')?.label ?? '', /no cross-suite|不做跨套件/iu);
    assert.match(nodes.get('facto_report')?.label ?? '', /no cross-suite|不做跨套件/iu);
    assert.match(nodes.get('report')?.label ?? '', /no cross-suite.*merge|不合并跨套件/isu);
  }
  const detail = readDetail('BackendBench');
  assert.match(detail.drawio_review_note, /2a8d7e19e2c13c789ff2dceb44883ea8ea04dab4/u);
  for (const language of ['en', 'zh']) {
    const expected = language === 'en' ? [
      'suite_selector["One --suite per Run<br/>Smoke • OpInfo<br/>FACTO • TorchBench"]',
      'paired_arrays["Pair Suite-Local Arrays<br/>correctness[i] + performance[i]<br/>Same TorchBench Test Index<br/>Compute Metrics in This Run"]',
      'report["Publish Per-Suite Artifacts<br/>Selected --suite Results<br/>Per-Operator CSV + Failures<br/>No Cross-Suite Score Merge"]',
    ] : [
      "suite_selector[\"每次仅一个 --suite<br/>Smoke • OpInfo<br/>FACTO • TorchBench\"]",
      "paired_arrays[\"配对套件内数组<br/>correctness[i] + performance[i]<br/>使用同一 TorchBench 测试索引<br/>在本次运行内计算指标\"]",
      "report[\"发布分套件运行产物<br/>所选 --suite 结果<br/>算子级 CSV + 失败项<br/>不合并跨套件分数\"]"
];
    for (const node of expected) {
      assert.ok(detail[`flowchart_${language}`].split('\n').includes(`    ${node}`),
        `BackendBench.${language} preserves suite choice, paired indices, and suite-local reporting: ${node}`);
    }
  }
});

test('pins primary-source versions and publishes native fixed-light SVG/PNG pairs', () => {
  const sources = {
    BigOBench: ['https://arxiv.org/abs/2503.15242v2', /Fig(?:ure)?\.?\s*1.*§3.*Fig(?:ure)?\.?\s*2.*§4\.1.*§4\.3.*§5\.1.*§5\.3/isu],
    BioASQ: ['https://pmc.ncbi.nlm.nih.gov/articles/PMC4450488/', /BMC Bioinformatics 16:138.*Task 1a.*Task 1b/isu],
    BBQ: ['https://arxiv.org/abs/2110.08193v2', /§3\.1.*§3\.3.*§4.*Fig(?:ure)?\.?\s*1.*§5.*Appendix D/isu],
    BeyondAIME: ['https://arxiv.org/abs/2504.13914v3', /§2\.2.*§6\.1.*Table 2/isu],
    BABILong: ['https://arxiv.org/abs/2406.10149v2', /2406\.10149v2/isu],
    BackendBench: ['', /2a8d7e19e2c13c789ff2dceb44883ea8ea04dab4/isu],
  };
  for (const [id, [paperUrl, note]] of Object.entries(sources)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, paperUrl, `${id} primary source`);
    assert.equal(detail.arxiv_pdf_url, paperUrl.startsWith('https://arxiv.org/') ? paperUrl.replace('/abs/', '/pdf/') : '');
    assert.match(detail.drawio_review_note, note, `${id} source locator`);
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      const { width, height } = pngDimensions(`${base}.png`);
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.match(drawio, /math="0"/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.match(svg, /color-scheme:\s*light/u);
      assert.doesNotMatch(svg, /<foreignObject|data:image|light-dark\(|Text is not SVG/u);
      assert.ok(width >= 800 && height >= 300, `${id}.${language} PNG dimensions`);
      assert.ok(width / height < 4, `${id}.${language} must not be ultra-wide`);
    }
  }
});
