import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['OpenSkillEval', 'P-MMEval'];
const expectedCounts = new Map([
  ['OpenSkillEval', { nodes: 20, edges: 23, secondary: 5 }],
  ['P-MMEval', { nodes: 19, edges: 20, secondary: 4 }],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const specPath = (id, language) => join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`);
const readSpec = (id, language) => parseYaml(readFileSync(specPath(id, language), 'utf8'));

function nodeLabel(graph, id) {
  const node = graph.nodes.find(candidate => candidate.id === id);
  assert.ok(node, `missing node ${id}`);
  return String(node.label);
}

function positionedTopology(graph) {
  return {
    nodes: graph.nodes.map(({ id, type, size, position }) => ({ id, type, size, position })),
    edges: graph.edges.map(
      ({ from, to, type, style, labelPosition, waypoints }) => (
        { from, to, type, style, labelPosition, waypoints }
      ),
    ),
    modules: graph.modules ?? [],
  };
}

function assertEdgeTriples(graph, expected, context) {
  const actual = new Set(graph.edges.map(edge => [
    edge.from,
    edge.to,
    edge.type,
    String(edge.label ?? ''),
  ].join('|')));
  for (const triple of expected) {
    const key = triple.join('|');
    assert.ok(actual.has(key), `${context} missing edge ${key}`);
  }
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(graph) {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  for (const edge of graph.edges) {
    const label = mermaidLabel(edge.label ?? '').replace(/\|/gu, '&#124;').trim();
    const arrow = edge.type === 'primary'
      ? (label ? `-->|${label}|` : '-->')
      : (label ? `-. ${label} .->` : '-.->');
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

test('keeps the A12c OpenSkillEval and P-MMEval source pair bilingual and style-safe', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    const en = readSpec(id, 'en');
    const zh = readSpec(id, 'zh');
    const expected = expectedCounts.get(id);

    for (const graph of [en, zh]) {
      assert.equal(graph.meta.profile, 'academic-paper', `${id} profile`);
      assert.equal(graph.meta.source, 'generated', `${id} source enum`);
      assert.equal(graph.meta.theme, 'academic-color', `${id} theme`);
      assert.equal(graph.meta.layout, 'horizontal', `${id} layout`);
      assert.equal(graph.meta.routing, 'orthogonal', `${id} routing`);
      assert.equal(graph.nodes.length, expected.nodes, `${id} node count`);
      assert.equal(graph.edges.length, expected.edges, `${id} edge count`);
      assert.equal(
        graph.edges.filter(edge => edge.type === 'secondary').length,
        expected.secondary,
        `${id} secondary edge count`,
      );
      for (const edge of graph.edges.filter(edge => edge.type === 'secondary')) {
        assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
      }
    }
    for (const [language, graph, limit] of [['en', en, 48], ['zh', zh, 38]]) {
      for (const node of graph.nodes) {
        const lines = String(node.label).split(/\r?\n/u);
        assert.ok(lines.length <= 5, `${id}.${language}.${node.id} uses at most five lines`);
        for (const line of lines) {
          assert.ok(
            [...line].length <= limit,
            `${id}.${language}.${node.id} line is too long: ${line}`,
          );
        }
      }
    }
    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.doesNotMatch(
      readFileSync(specPath(id, 'en'), 'utf8'),
      /[\u3400-\u9fff]/u,
      `${id} English spec purity`,
    );
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
    }
    assert.equal(detail.flowchart_en, renderFallback(en), `${id} English fallback`);
    assert.equal(detail.flowchart_zh, renderFallback(zh), `${id} Chinese fallback`);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} canonical fallback`);
    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 2_500, `${id} review evidence`);
  }
});

test('locks OpenSkillEval paper construction, official releases, runtime, and evaluation branches', () => {
  const detail = readDetail('OpenSkillEval');
  const en = readSpec('OpenSkillEval', 'en');
  const zh = readSpec('OpenSkillEval', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2605.23657v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2605.23657v2');
  assert.equal(
    detail.repository_url,
    'https://github.com/ALEX-nlp/OpenSkillEval/tree/d0e109283eee79216284cdf09ee59bf63239fb13',
  );
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/jhying/OpenSkillEval/tree/b48e00fc4094fe01c3ef1ee058f0d18c55714f96',
  );
  assert.equal(detail.has_leaderboard, true);
  assert.match(nodeLabel(en, 'source_evidence'), /2605\.23657v2.*15909b00291f.*d0e109283eee.*b48e00fc4094/isu);
  assert.match(nodeLabel(en, 'families'), /Data Visualization.*Poster.*Presentation.*Report.*Web Design/isu);
  assert.match(nodeLabel(en, 'snapshot'), /Snapshot.*source_brief\.md.*Data Files/isu);
  assert.match(nodeLabel(en, 'generate'), /Claude.*4\.6.*Opus.*GPT-5\.2.*Task-specific Schema/isu);
  assert.match(nodeLabel(en, 'task_spec'), /task_input\.json.*Goals.*Constraints.*Expected Output/isu);
  assert.match(nodeLabel(en, 'instruction'), /Natural-language.*instruction\.md.*Structured Specification/isu);
  assert.match(nodeLabel(en, 'verify'), /Completeness.*Grounding.*Consistency.*Filter/isu);
  assert.match(nodeLabel(en, 'cases'), /677.*150.*119.*82.*195.*131/isu);
  assert.match(nodeLabel(en, 'skill_sources'), /ClawHub.*skills\.sh.*OpenSkills.*SkillsMP/isu);
  assert.match(nodeLabel(en, 'skill_filter'), /Adoption.*Download.*30.*6.*4.*6.*6.*8/isu);
  assert.match(nodeLabel(en, 'variants'), /No-skill.*Force-use.*Same Case.*Same Judge.*Same Model/isu);
  assert.match(nodeLabel(en, 'runner'), /Harbor.*Docker.*ubuntu:24\.04.*9000.*4500/isu);
  assert.match(nodeLabel(en, 'trajectory_eval'), /ATIF.*Agent-as-judge.*Read.*Follow.*Skip.*Contradict/isu);
  assert.match(nodeLabel(en, 'artifact_eval'), /Task-specific.*VLM.*Playwright.*Code/isu);
  assert.match(nodeLabel(en, 'human_validation'), /100.*Four Senior.*2\.98.*98\.8.*2\.86.*75\.0.*0\.855.*0\.821/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /Apache-2\.0.*CC-BY-NC-4\.0.*Case Generator.*Case Verifier.*Not Released.*Vendored.*30 Skill Variants.*35 SKILL\.md/isu);
  assert.match(nodeLabel(en, 'runtime_boundary'), /download_cases\.py.*No Revision.*Moving HEAD.*External APIs/isu);
  assert.match(nodeLabel(zh, 'cases'), /677.*150.*119.*82.*195.*131/su);
  assert.match(nodeLabel(zh, 'runner'), /Harbor.*Docker.*ubuntu:24\.04.*9000.*4500/isu);
  assert.match(nodeLabel(zh, 'release_boundary'), /Apache-2\.0.*CC-BY-NC-4\.0.*生成器.*验证器.*未发布.*已随库提供.*30个技能变体.*35个 SKILL\.md/isu);
  assert.match(nodeLabel(zh, 'runtime_boundary'), /download_cases\.py.*未传入版本号.*HEAD.*外部 API/isu);
  assertEdgeTriples(en, [
    ['source_evidence', 'families', 'secondary', ''],
    ['families', 'sources', 'primary', ''],
    ['families', 'skill_sources', 'primary', ''],
    ['generate', 'task_spec', 'primary', ''],
    ['generate', 'instruction', 'primary', ''],
    ['task_spec', 'verify', 'primary', ''],
    ['instruction', 'verify', 'primary', ''],
    ['cases', 'variants', 'primary', ''],
    ['skill_filter', 'variants', 'primary', ''],
    ['outputs', 'trajectory_eval', 'primary', ''],
    ['outputs', 'artifact_eval', 'primary', ''],
    ['human_validation', 'trajectory_eval', 'secondary', ''],
    ['human_validation', 'artifact_eval', 'secondary', ''],
    ['cases', 'release_boundary', 'secondary', ''],
    ['runner', 'runtime_boundary', 'secondary', ''],
  ], 'OpenSkillEval');
  assert.match(detail.scale_en, /677 cases.*150.*119.*82.*195.*131.*30 skills/isu);
  assert.match(detail.drawio_review_note, /15909b00291f602602b8eaddd41769534a60d591f90c06c49e18154be52b7109/u);
  assert.match(detail.drawio_review_note, /d0e109283eee79216284cdf09ee59bf63239fb13/u);
  assert.match(detail.drawio_review_note, /b48e00fc4094fe01c3ef1ee058f0d18c55714f96/u);
  assert.match(detail.drawio_review_note, /d7e7b0ce22f89d1bdd4489aaa59d150df56ab24b01f1c9b03a182dda265423e6/u);
  assert.match(detail.drawio_review_note, /50f0b85fb2fab29cda9e970376a12f393969800cecaac8cd24ab17c6cc4fa121/u);
  assert.match(detail.drawio_review_note, /dbf192fd90a641e987d2d359e3a2c7437fd5fdf968de6e30abf8785b40bac0f6/u);
  assert.match(detail.drawio_review_note, /30 non-no-skills variant directories.*35 tracked environment\/skills\/\*\*\/SKILL\.md files/isu);
  assert.match(detail.drawio_review_note, /does not contain.*case-generator.*case-verifier implementation/isu);
  assert.doesNotMatch(detail.drawio_review_note, /case-generation or verifier implementation/iu);
  assert.match(detail.drawio_review_note, /download_cases\.py.*does not pass.*revision/isu);
});

test('locks P-MMEval final-paper construction and keeps fixed-release drift outside the primary flow', () => {
  const detail = readDetail('P-MMEval');
  const en = readSpec('P-MMEval', 'en');
  const zh = readSpec('P-MMEval', 'zh');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2411.09116v2');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2411.09116v2');
  assert.equal(
    detail.homepage,
    'https://huggingface.co/datasets/Qwen/P-MMEval/tree/47bb647f35fdd6f5374826b3f5d4f84eb5b5afce',
  );
  assert.equal(detail.has_leaderboard, false);
  assert.doesNotMatch(
    `${detail.intro_en}\n${detail.build_method_en}\n${readFileSync(specPath('P-MMEval', 'en'), 'utf8')}`,
    /11 candidate|eleven-dataset|model-size screening|paired-sample|t-test|p below 0\.01/iu,
  );
  assert.match(nodeLabel(en, 'source_evidence'), /2411\.09116v2.*00f32884b4d5.*EMNLP 2025.*17f87baa7ede.*47bb647f35fd/isu);
  assert.match(nodeLabel(en, 'language_scope'), /English.*Chinese.*Arabic.*Spanish.*Japanese.*Korean.*Thai.*French.*Portuguese.*Vietnamese.*Seven Families/isu);
  assert.match(nodeLabel(en, 'fundamental'), /XNLI.*MHellaSwag.*Understanding.*FLORES-200.*Generation/isu);
  assert.match(nodeLabel(en, 'specialized'), /HumanEval-XL.*MGSM.*MLogiQA.*MMMLU.*MIFEval/isu);
  assert.match(nodeLabel(en, 'fundamental_sampling'), /FLORES.*Complete.*1012.*XNLI.*First N.*120.*MHellaSwag.*First N.*120/isu);
  assert.match(nodeLabel(en, 'specialized_sampling'), /HumanEval-XL 80.*MGSM 250.*MLogiQA 80.*MMMLU.*200 Easy.*200 Hard.*MIFEval.*110.*14.*96/isu);
  assert.match(nodeLabel(en, 'translate'), /Missing Languages.*gpt-4o-2024-05-13.*Parallel/isu);
  assert.match(nodeLabel(en, 'review'), /Exhaustive.*Professional.*Correct.*Localize.*Remove.*82\.50/isu);
  assert.match(nodeLabel(en, 'release'), /Eight Components.*Seven Tasks.*1012.*120.*120.*80 × 12.*250.*80.*400.*96/isu);
  assert.match(nodeLabel(en, 'prompt_sources'), /OpenCompass.*LM Evaluation Harness.*simple-evals.*Fixed Answer Format/isu);
  assert.match(nodeLabel(en, 'prompt_settings'), /EN.*Native.*EN-Few-Shot.*Validation.*GPT-4o/isu);
  assert.match(nodeLabel(en, 'answer_policy'), /MGSM.*Chain-of-thought.*Other Tasks.*Direct.*Below 7B/isu);
  assert.match(nodeLabel(en, 'metrics'), /Accuracy.*BLEU.*Pass@1.*Python.*JavaScript.*Java.*COMET.*Appendix/isu);
  assert.match(nodeLabel(en, 'cacr'), /CACR.*Jointly Correct.*English-correct.*Parallel/isu);
  assert.match(nodeLabel(en, 'report'), /Fundamental and Specialized Averages/isu);
  assert.match(nodeLabel(en, 'family_boundary'), /Paper.*Seven.*Hugging Face Card.*Eight/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /FLORES.*9,108.*MHellaSwag.*1,181.*HumanEval-XL.*26 × 12.*Paper Scope.*Ten/isu);
  assert.match(nodeLabel(en, 'inference_boundary'), /Decoding Parameters.*Seeds.*Few-shot k.*Not Disclosed/isu);
  assert.match(nodeLabel(zh, 'fundamental'), /三个基础.*XNLI.*MHellaSwag.*FLORES-200/su);
  assert.match(nodeLabel(zh, 'specialized'), /五个专项.*HumanEval-XL.*MGSM.*MLogiQA.*MMMLU.*MIFEval/su);
  assert.match(nodeLabel(zh, 'release'), /八个组成部分.*七类任务.*1012.*120.*120.*80×12.*250.*80.*400.*96/su);
  assert.match(nodeLabel(zh, 'metrics'), /准确率.*BLEU.*Pass@1.*Python.*JavaScript.*Java.*COMET/su);
  assert.match(nodeLabel(zh, 'report'), /基础与专项任务均值/su);
  assert.match(nodeLabel(zh, 'family_boundary'), /论文.*七个.*数据卡.*八个/su);
  assert.match(nodeLabel(zh, 'release_boundary'), /9 个文件.*9,108.*1,181.*1,200.*26 × 12.*十种语言/su);
  assertEdgeTriples(en, [
    ['source_evidence', 'language_scope', 'secondary', ''],
    ['language_scope', 'fundamental', 'primary', ''],
    ['language_scope', 'specialized', 'primary', ''],
    ['fundamental', 'fundamental_sampling', 'primary', ''],
    ['specialized', 'specialized_sampling', 'primary', ''],
    ['fundamental_sampling', 'translate', 'primary', ''],
    ['specialized_sampling', 'translate', 'primary', ''],
    ['metrics', 'report', 'primary', ''],
    ['metrics', 'cacr', 'primary', ''],
    ['cacr', 'report', 'primary', ''],
    ['language_scope', 'family_boundary', 'secondary', ''],
    ['release', 'release_boundary', 'secondary', ''],
    ['prompt_settings', 'inference_boundary', 'secondary', ''],
  ], 'P-MMEval');
  assert.match(detail.scale_en, /21,580 natural-language.*30,380.*12-program/isu);
  assert.match(detail.drawio_review_note, /00f32884b4d5f08b5ecd601d7be71099f8b2559cc2f927c5d8b3adf0d1bf3a7d/u);
  assert.match(detail.drawio_review_note, /17f87baa7ede625651e2d5bd6687a1193922269f7ca3ea846f57b79ddac8fdd4/u);
  assert.match(detail.drawio_review_note, /47bb647f35fdd6f5374826b3f5d4f84eb5b5afce/u);
  assert.match(detail.drawio_review_note, /36c20135369fe3df20e86ef7afbcec202021c1cdb28e27b36bfbbb621eb04390/u);
  assert.match(detail.drawio_review_note, /Table 1.*120 × 10.*fixed release.*1,181/isu);
  assert.match(detail.drawio_review_note, /FLORES.*9 files.*9,108.*HumanEval-XL.*26 natural-language.*12 programming-language/isu);
});
