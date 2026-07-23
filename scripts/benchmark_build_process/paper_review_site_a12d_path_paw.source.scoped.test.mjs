import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['PathVQA', 'PawBench'];
const expectedCounts = new Map([
  ['PathVQA', { nodes: 27, edges: 29, secondary: 5 }],
  ['PawBench', { nodes: 27, edges: 28, secondary: 6 }],
]);
const expectedNodeIds = new Map([
  ['PathVQA', [
    'source_evidence', 'clinical_gap', 'textbook_sources', 'pdf_extract', 'caption_match',
    'peir_source', 'peir_crawl', 'clean_pairs', 'corenlp', 'simplify', 'question_transducer',
    'yesno_generation', 'negative_generation', 'open_generation', 'merge_qa', 'manual_review',
    'paper_scope', 'paper_split', 'vqa_models', 'metric_gate', 'binary_metrics', 'open_metrics',
    'report', 'release_boundary', 'mirror_boundary', 'prompt_boundary', 'copyright_boundary',
  ]],
  ['PawBench', [
    'source_evidence', 'coeval_unit', 'reuse_sources', 'normalize_tasks', 'task_contract',
    'taxonomy', 'fixed_release', 'harness_versions', 'model_harness_grid', 'prepare_workspace',
    'execute_agent', 'collect_evidence', 'grading_gate', 'automated_grade', 'llm_grade',
    'hybrid_grade', 'normalize_score', 'aggregate', 'slices', 'diagnose', 'no_paper_boundary',
    'release_boundary', 'prompt_boundary', 'compatibility_boundary', 'judge_boundary',
    'license_boundary', 'baseline_boundary',
  ]],
]);

const readDetail = id => JSON.parse(readFileSync(
  join(publicDir, 'benchmarks_detail', `${id}.json`),
  'utf8',
));
const readSpec = (id, language) => parseYaml(readFileSync(
  join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
  'utf8',
));

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

function edgeKey(from, to, type = 'primary') {
  return `${from}|${to}|${type}`;
}

function assertEdges(graph, expected, context) {
  const actual = new Set(graph.edges.map(edge => edgeKey(edge.from, edge.to, edge.type)));
  for (const [from, to, type = 'primary'] of expected) {
    assert.ok(actual.has(edgeKey(from, to, type)), `${context} missing ${from}->${to} (${type})`);
  }
}

test('keeps PathVQA and PawBench bilingual, topology-locked, and source-stage safe', () => {
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
        `${id} secondary count`,
      );
      assert.ok(graph.nodes.every(node => String(node.label).split('\n').length <= 5), `${id} line count`);
      assert.ok(graph.edges.every(edge => edge.label === undefined), `${id} duplicate-edge-label prevention`);
    }

    assert.deepEqual(positionedTopology(zh), positionedTopology(en), `${id} bilingual topology`);
    assert.deepEqual(en.nodes.map(node => node.id), expectedNodeIds.get(id), `${id} semantic node order`);
    assert.doesNotMatch(JSON.stringify(en), /[\u3400-\u9fff]/u, `${id} English purity`);
    for (const node of en.nodes) {
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 48, `${id}.${node.id} English line width: ${line}`);
      }
    }
    for (const node of zh.nodes) {
      assert.match(String(node.label), /[\u3400-\u9fff]/u, `${id}.${node.id} Chinese semantics`);
      for (const line of String(node.label).split('\n')) {
        assert.ok([...line].length <= 38, `${id}.${node.id} Chinese line width: ${line}`);
      }
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'secondary')) {
      assert.equal(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} renders dashed`);
    }
    for (const edge of [...en.edges, ...zh.edges].filter(edge => edge.type === 'primary')) {
      assert.notEqual(edge.style?.dashed, true, `${id} ${edge.from}->${edge.to} remains primary`);
    }

    assert.match(detail.drawio_review_note, /reviewed_at=2026-07-22/u, `${id} review date`);
    assert.ok(detail.drawio_review_note.length > 4_500, `${id} review evidence`);
  }
});

test('locks PathVQA paper construction and preserves every disclosed release boundary', () => {
  const detail = readDetail('PathVQA');
  const en = readSpec('PathVQA', 'en');

  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2003.10286v1');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2003.10286v1');
  assert.equal(detail.homepage, 'https://pathvqachallenge.grand-challenge.org/Data_Info/');
  assert.equal(
    detail.repository_url,
    'https://github.com/UCSD-AI4H/PathVQA/commit/117e7f4ef88a0e65b0e7f37b98a73d6237a3ceab',
  );
  assert.equal(
    detail.dataset_url,
    'https://huggingface.co/datasets/flaviagiammarino/path-vqa/tree/1685832883334b5bb5beaf4e4b333fdeecaa4ad9',
  );
  assert.equal(detail.conference_paper_url, 'https://aclanthology.org/2021.acl-short.90/');
  assert.match(nodeLabel(en, 'source_evidence'), /2003\.10286v1.*cbfe071a8d80.*ACL.*9760f1711cdb/isu);
  assert.match(nodeLabel(en, 'clinical_gap'), /public pathology images.*pathologists.*time.*textbooks.*digital libraries/isu);
  assert.match(nodeLabel(en, 'textbook_sources'), /Textbook of Pathology.*Basic Pathology.*public PDF/isu);
  assert.match(nodeLabel(en, 'pdf_extract'), /PyPDF2.*XObject.*PDFMiner.*text.*location/isu);
  assert.match(nodeLabel(en, 'caption_match'), /Fig.*Figure.*regular expression.*page location.*order/isu);
  assert.match(nodeLabel(en, 'peir_source'), /Pathology Education Informational Resource.*PEIR/isu);
  assert.match(nodeLabel(en, 'peir_crawl'), /Requests.*Beautiful Soup.*HTML tags.*captions/isu);
  assert.match(nodeLabel(en, 'clean_pairs'), /Remove non-pathology.*flowcharts.*portraits.*mismatches/isu);
  assert.match(nodeLabel(en, 'corenlp'), /sentence split.*tokenization.*POS.*NER.*constituency.*dependencies/isu);
  assert.match(nodeLabel(en, 'simplify'), /subjects.*verbs.*clauses.*syntactic rules/isu);
  assert.match(nodeLabel(en, 'question_transducer'), /Tregex.*main verb.*subject-auxiliary inversion/isu);
  assert.match(nodeLabel(en, 'yesno_generation'), /Yes Questions.*Invert subject.*answer as yes/isu);
  assert.match(nodeLabel(en, 'negative_generation'), /No Questions.*same-POS.*other captions/isu);
  assert.match(nodeLabel(en, 'open_generation'), /What.*where.*when.*whose.*how.*how much.*how many/isu);
  assert.match(nodeLabel(en, 'manual_review'), /Every question.*spelling.*syntax.*semantics.*vague.*articles/isu);
  assert.match(nodeLabel(en, 'paper_scope'), /4,998 images.*32,799 QA.*1,670 textbook.*3,328 PEIR.*16,465 open.*16,334 yes or no/isu);
  assert.match(nodeLabel(en, 'paper_split'), /0\.5.*0\.3.*0\.2.*2,499.*17,325.*1,499.*9,462.*1,000.*6,012/isu);
  assert.match(nodeLabel(en, 'binary_metrics'), /Accuracy/isu);
  assert.match(nodeLabel(en, 'open_metrics'), /Exact Match.*Macro F1.*BLEU-1.*BLEU-2.*BLEU-3/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /arXiv v1.*32,799.*ACL 2021.*32,795.*not interchangeable/isu);
  assert.match(nodeLabel(en, 'mirror_boundary'), /author update.*117e7f4ef88a.*5,004.*32,795.*32,632.*4,289.*community mirror/isu);
  assert.match(nodeLabel(en, 'prompt_boundary'), /No official inference prompt.*disclosed.*parser.*LLM judge.*disclosed/isu);
  assert.match(nodeLabel(en, 'copyright_boundary'), /MIT.*images.*captions.*publishers.*authors.*PEIR/isu);
  assertEdges(en, [
    ['source_evidence', 'clinical_gap', 'secondary'],
    ['clinical_gap', 'textbook_sources'],
    ['clinical_gap', 'peir_source'],
    ['textbook_sources', 'pdf_extract'],
    ['pdf_extract', 'caption_match'],
    ['caption_match', 'clean_pairs'],
    ['peir_source', 'peir_crawl'],
    ['peir_crawl', 'clean_pairs'],
    ['clean_pairs', 'corenlp'],
    ['question_transducer', 'yesno_generation'],
    ['question_transducer', 'open_generation'],
    ['yesno_generation', 'negative_generation'],
    ['negative_generation', 'merge_qa'],
    ['open_generation', 'merge_qa'],
    ['paper_scope', 'paper_split'],
    ['metric_gate', 'binary_metrics'],
    ['metric_gate', 'open_metrics'],
    ['binary_metrics', 'report'],
    ['open_metrics', 'report'],
    ['paper_scope', 'release_boundary', 'secondary'],
    ['release_boundary', 'mirror_boundary', 'secondary'],
    ['vqa_models', 'prompt_boundary', 'secondary'],
    ['clean_pairs', 'copyright_boundary', 'secondary'],
  ], 'PathVQA');
  assert.match(detail.intro_en, /arXiv v1.*32,799.*ACL.*32,795.*pinned mirror.*32,632/isu);
  assert.match(detail.scale_en, /32,799.*32,795.*32,632/isu);
  assert.match(detail.drawio_review_note, /cbfe071a8d806d510e4fe02eb242cc7173c866027d29704ad42b44408dc463e3/u);
  assert.match(detail.drawio_review_note, /9760f1711cdb1cdd1abb0a8d55e809590560852f6ae01791c03915a95ce13bf8/u);
  assert.match(detail.drawio_review_note, /1685832883334b5bb5beaf4e4b333fdeecaa4ad9/u);
  assert.match(detail.drawio_review_note, /16eaf70c5aa4f0a03a92f8872d5c33d0707594c07837be69fabdf6f457bda055/u);
  assert.match(detail.drawio_review_note, /d0bb086b5f87f883652bfe7dff378b72ea9a72aeedcab5b8d5553fdea59fb7c6/u);
  assert.match(detail.drawio_review_note, /official repository is no longer reachable.*historical commit.*not silently replaced/isu);
  assert.match(detail.drawio_review_note, /No official inference prompt, answer parser, LLM judge, generation configuration.*is disclosed/isu);
});

test('locks PawBench fixed-tree construction, runner, grading, and publication semantics', () => {
  const detail = readDetail('PawBench');
  const en = readSpec('PawBench', 'en');

  assert.equal(detail.paper_url, 'https://agentscope-ai.github.io/PawBench/');
  assert.equal(
    detail.homepage,
    'https://github.com/agentscope-ai/PawBench/tree/0f794a8bb6c27aa9ee4091b2691fa30e4ed9cc8f',
  );
  assert.equal(detail.repository_url, detail.homepage);
  assert.equal(detail.dataset_url, `${detail.homepage}/data/pawbench-v1.0`);
  assert.match(nodeLabel(en, 'source_evidence'), /Git 0f794a8bb6c2.*README e8a4267d3800.*task tree b90ac4523b14/isu);
  assert.match(nodeLabel(en, 'coeval_unit'), /Agent Performance.*Model.*Harness.*Task.*same task/isu);
  assert.match(nodeLabel(en, 'reuse_sources'), /ClawEval 52.*QwenClawBench 29.*PinchBench 23.*self-built 21.*SkillsBench 15.*WildClawBench 10/isu);
  assert.match(nodeLabel(en, 'normalize_tasks'), /one Markdown.*YAML front matter.*prompt.*workspace.*grader/isu);
  assert.match(nodeLabel(en, 'task_contract'), /expected behavior.*criteria.*checker.*rubric.*workspace files.*timeout/isu);
  assert.match(nodeLabel(en, 'taxonomy'), /scenario.*capability.*complexity.*modality.*environment/isu);
  assert.match(nodeLabel(en, 'fixed_release'), /150 tasks.*120 hybrid.*15 automated.*15 LLM judge/isu);
  assert.match(nodeLabel(en, 'harness_versions'), /QwenPaw 1\.1\.3.*OpenClaw 2026\.4\.24.*Hermes 2026\.4\.23/isu);
  assert.match(nodeLabel(en, 'model_harness_grid'), /9 models.*3 harnesses.*150 tasks.*4,050/isu);
  assert.match(nodeLabel(en, 'prepare_workspace'), /Docker.*clean workspace.*stage declared files.*output.*sessions/isu);
  assert.match(nodeLabel(en, 'execute_agent'), /task-specific prompt.*task timeout.*transcript/isu);
  assert.match(nodeLabel(en, 'collect_evidence'), /Workspace.*transcript.*usage.*logs.*Optionally.*Docker image/isu);
  assert.match(nodeLabel(en, 'automated_grade'), /embedded Python.*grade.*task-specific.*average/isu);
  assert.match(nodeLabel(en, 'llm_grade'), /task prompt.*expected behavior.*rubric.*transcript summary.*JSON/isu);
  assert.match(nodeLabel(en, 'hybrid_grade'), /task's declared weights.*0\.75.*LLM contribution.*API failure/isu);
  assert.match(nodeLabel(en, 'normalize_score'), /0 to 1.*perfect score.*pass/isu);
  assert.match(nodeLabel(en, 'aggregate'), /model-harness.*per-task.*errors.*missing tasks/isu);
  assert.match(nodeLabel(en, 'slices'), /source.*scenario.*capability.*complexity.*modality.*environment.*grading type/isu);
  assert.match(nodeLabel(en, 'diagnose'), /Fix a model.*compare harnesses.*Fix a harness.*compare models.*traces/isu);
  assert.match(nodeLabel(en, 'no_paper_boundary'), /No standalone paper.*official repository.*project site.*primary methodology/isu);
  assert.match(nodeLabel(en, 'release_boundary'), /No Git tag.*no GitHub release.*commit 0f794a8bb6c2.*Apache-2\.0/isu);
  assert.match(nodeLabel(en, 'prompt_boundary'), /Task prompts.*rubrics.*public.*No single global inference prompt.*parser/isu);
  assert.match(nodeLabel(en, 'compatibility_boundary'), /same task prompt.*workspace.*timeout.*transcript.*result schema.*harness adapters/isu);
  assert.match(nodeLabel(en, 'judge_boundary'), /README baseline.*Claude Opus 4\.6.*code default.*4-5-20251101.*Runtime.*override/isu);
  assert.match(nodeLabel(en, 'baseline_boundary'), /27 submissions.*9 models by 3 harnesses.*May 29 2026.*not construction requirements/isu);
  assertEdges(en, [
    ['source_evidence', 'coeval_unit'],
    ['coeval_unit', 'reuse_sources'],
    ['reuse_sources', 'normalize_tasks'],
    ['normalize_tasks', 'task_contract'],
    ['task_contract', 'taxonomy'],
    ['taxonomy', 'fixed_release'],
    ['fixed_release', 'harness_versions'],
    ['harness_versions', 'model_harness_grid'],
    ['model_harness_grid', 'prepare_workspace'],
    ['prepare_workspace', 'execute_agent'],
    ['execute_agent', 'collect_evidence'],
    ['collect_evidence', 'grading_gate'],
    ['grading_gate', 'automated_grade'],
    ['grading_gate', 'llm_grade'],
    ['grading_gate', 'hybrid_grade'],
    ['automated_grade', 'normalize_score'],
    ['llm_grade', 'normalize_score'],
    ['hybrid_grade', 'normalize_score'],
    ['normalize_score', 'aggregate'],
    ['aggregate', 'slices'],
    ['slices', 'diagnose'],
    ['source_evidence', 'no_paper_boundary', 'secondary'],
    ['fixed_release', 'release_boundary', 'secondary'],
    ['task_contract', 'prompt_boundary', 'secondary'],
    ['harness_versions', 'compatibility_boundary', 'secondary'],
    ['llm_grade', 'judge_boundary', 'secondary'],
    ['diagnose', 'baseline_boundary'],
  ], 'PawBench');
  assert.match(detail.intro_en, /pinned v1\.0 tree.*150 tasks.*9 models.*3 harnesses.*no standalone paper/isu);
  assert.match(detail.scale_en, /150 tasks.*9 models.*3 harnesses.*4,050/isu);
  assert.match(detail.drawio_review_note, /0f794a8bb6c27aa9ee4091b2691fa30e4ed9cc8f/u);
  assert.match(detail.drawio_review_note, /b90ac4523b146d0fdca632bb3dbd16549c817e22a218a898a08a5bb4ae443685/u);
  assert.match(detail.drawio_review_note, /120 hybrid.*15 automated.*15 llm_judge/isu);
  assert.match(detail.drawio_review_note, /QwenPaw uses version 1\.1\.3.*OpenClaw uses version 2026\.4\.24.*Hermes uses version 2026\.4\.23/isu);
  assert.match(detail.drawio_review_note, /DEFAULT_JUDGE_MODEL.*claude-opus-4-5-20251101.*README.*claude opus 4\.6/isu);
  assert.match(detail.drawio_review_note, /No global inference prompt.*answer parser.*hidden judge checkpoint.*was invented/isu);
});
