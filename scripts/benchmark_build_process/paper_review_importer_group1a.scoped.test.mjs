import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = [
  'ArtifactsBench',
  'BFCL-v4',
  'BIRD-SQL',
  'BigCodeBench',
  'BrowseComp',
  'CF-Div2-Stepfun',
  'CMATH',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readArch(id, language = 'en') {
  return readJson(join(publicDir, 'drawio', id, `${id}.${language}.arch.json`));
}

function readSpec(id, language = 'en') {
  return readFileSync(
    join(publicDir, 'drawio', id, `${id}.${language}.spec.yaml`),
    'utf8',
  );
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

function edgeBlock(spec, from, to) {
  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedTo = to.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return spec.match(new RegExp(
    `^  - from: ${escapedFrom}\\n    to: ${escapedTo}\\n(?: {4,}[^\\n]+\\n)*`,
    'mu',
  ))?.[0] ?? '';
}

test('keeps the reviewed importer diagrams bilingual and topologically identical', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(
      topology(readArch(id, 'en')),
      topology(readArch(id, 'zh')),
      `${id} must keep identical EN/ZH node ids, node types, and typed edges`,
    );
  }
});

test('separates ArtifactsBench construction from post-hoc difficulty calibration', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ArtifactsBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.ok(nodes.has('model_aggregate'));
    assert.ok(nodes.has('difficulty_metadata'));
    assert.match(nodes.get('model_aggregate')?.label ?? '', /30\+|30 多|30多/u);
    assert.match(
      nodes.get('difficulty_metadata')?.label ?? '',
      /post-hoc|E\s*\/\s*M\s*\/\s*H|后验|易.*中.*难/iu,
    );
    assert.ok(edges.has('manual_qa->final:primary'));
    assert.ok(edges.has('final->difficulty_metadata:secondary'));
    assert.ok(edges.has('model_aggregate->difficulty_metadata:data'));
    assert.equal(
      arch.edges.some(({ from, to, type }) => (
        type === 'primary' && (from === 'model_aggregate' || to === 'difficulty_metadata')
      )),
      false,
    );
  }
});

test('keeps BIRD database scope upstream of annotation and review', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BIRD-SQL', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('databases')?.label ?? '', /95/u);
    assert.match(nodes.get('databases')?.label ?? '', /33\.4/u);
    assert.match(nodes.get('scope')?.label ?? '', /37/u);
    assert.match(nodes.get('scope')?.label ?? '', /69.*11.*15/us);
    assert.match(nodes.get('descriptions')?.label ?? '', /ER|关系图/u);
    assert.ok(edges.has('database_sources->databases:primary'));
    assert.ok(edges.has('databases->scope:primary'));
    assert.ok(edges.has('scope->descriptions:primary'));
    assert.ok(edges.has('questions->evidence:primary'));
    assert.ok(edges.has('evidence->sql:primary'));
    assert.ok(edges.has('sql->compare:primary'));
    assert.ok(edges.has('ground_truth->examination:primary'));
    assert.ok(edges.has('examination->final:primary'));
    assert.equal(edges.has('examination->scope:primary'), false);
  }
});

test('keeps the BrowseComp three-part challenge gate readable in native SVG text', () => {
  for (const language of ['en', 'zh']) {
    const label = nodeMap(readArch('BrowseComp', language))
      .get('challenge_checks')?.label ?? '';
    assert.match(label, /3-part|三项/iu);
    assert.ok([...label].length <= 24, `${language} challenge gate label is too long`);
  }
});

test('preserves the complete BrowseComp defect audit before encrypted release', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BrowseComp', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('draft_set')?.label ?? '', /1,?287/u);
    assert.match(nodes.get('zero_pass_audit')?.label ?? '', /118/u);
    assert.match(nodes.get('remove_defects')?.label ?? '', /21/u);
    assert.match(nodes.get('final_set')?.label ?? '', /1,?266/u);
    assert.match(nodes.get('encrypt')?.label ?? '', /encrypt|加密/iu);
    for (const edge of [
      'draft_set->zero_pass_audit:primary',
      'zero_pass_audit->remove_defects:primary',
      'remove_defects->final_set:primary',
      'final_set->encrypt:primary',
      'encrypt->release:primary',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    for (const forbidden of [
      'draft_set->remove_defects:primary',
      'zero_pass_audit->final_set:primary',
      'remove_defects->encrypt:primary',
      'final_set->release:primary',
    ]) {
      assert.equal(edges.has(forbidden), false, `${language} must reject ${forbidden}`);
    }
  }
});

test('keeps CF-Div2 parallel case generation, grader merge, and dual replay groups', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CF-Div2-Stepfun', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('small_tests')?.label ?? '', /small|小规模/iu);
    assert.match(nodes.get('random_large')?.label ?? '', /random.*large|随机.*大/iu);
    assert.match(nodes.get('handmade_edges')?.label ?? '', /handcraft|人工/iu);
    assert.match(nodes.get('stress_cases')?.label ?? '', /stress|压力/iu);
    assert.match(nodes.get('offline_grader')?.label ?? '', /offline.*grader|离线.*判题/iu);
    assert.match(nodes.get('accepted_runs')?.label ?? '', /correct.*replay|正确.*回放/iu);
    assert.match(nodes.get('failed_runs')?.label ?? '', /failed.*replay|失败.*回放/iu);
    assert.match(nodes.get('reliability_gate')?.label ?? '', /100%.*92\.45%/u);
    for (const edge of [
      'small_tests->random_large:primary',
      'random_large->handmade_edges:primary',
      'random_large->stress_cases:primary',
      'handmade_edges->offline_grader:primary',
      'stress_cases->offline_grader:primary',
      'offline_grader->accepted_runs:primary',
      'offline_grader->failed_runs:primary',
      'accepted_runs->reliability_gate:primary',
      'failed_runs->reliability_gate:primary',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    for (const forbidden of [
      'small_tests->handmade_edges:primary',
      'small_tests->stress_cases:primary',
      'random_large->offline_grader:primary',
      'handmade_edges->stress_cases:primary',
      'stress_cases->handmade_edges:primary',
      'handmade_edges->accepted_runs:primary',
      'stress_cases->failed_runs:primary',
      'offline_grader->reliability_gate:primary',
      'accepted_runs->failed_runs:primary',
      'failed_runs->accepted_runs:primary',
    ]) {
      assert.equal(edges.has(forbidden), false, `${language} must reject ${forbidden}`);
    }
  }
});

test('localizes BFCL format configuration and CMATH source-format labels', () => {
  const bfclNodes = nodeMap(readArch('BFCL-v4', 'zh'));
  const cmathNodes = nodeMap(readArch('CMATH', 'zh'));

  assert.match(bfclNodes.get('format_process')?.label ?? '', /\p{Script=Han}/u);
  assert.match(cmathNodes.get('formats')?.label ?? '', /\p{Script=Han}/u);
});

test('models BigCodeBench assignments and human curation without claiming unique tasks', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('BigCodeBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);

    assert.match(nodes.get('pool')?.label ?? '', /4,?718/u);
    assert.match(nodes.get('assignments')?.label ?? '', /13\s*[×x]\s*100/u);
    assert.doesNotMatch(nodes.get('assignments')?.label ?? '', /unique|唯一/iu);
    assert.match(nodes.get('refactor')?.label ?? '', /human|人工/iu);
    assert.match(nodes.get('refactor')?.label ?? '', /GPT-4/iu);
    assert.match(nodes.get('tests')?.label ?? '', /≥\s*5|5\+/u);
    assert.match(nodes.get('crosscheck')?.label ?? '', /7.*cross-check|7.*交叉复核/iu);
    assert.match(nodes.get('ghcr_validation')?.label ?? '', /GHCR.*validation|GHCR.*校验/iu);
    for (const edge of [
      'pool->assignments:primary',
      'assignments->refactor:primary',
      'refactor->tests:primary',
      'tests->analysis:primary',
      'analysis->valid:primary',
      'valid->examination:primary',
      'examination->preeval:primary',
      'preeval->crosscheck:primary',
      'crosscheck->ghcr_validation:primary',
      'ghcr_validation->final:primary',
    ]) {
      assert.ok(edges.has(edge), `${language} missing ${edge}`);
    }
    assert.equal(edges.has('crosscheck->final:primary'), false);
  }
});

test('shows the CMATH core and public repository subsets as different scopes', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CMATH', language);
    const nodes = nodeMap(arch);
    const edges = edgeSet(arch);
    const maxDigitsLabel = nodes.get('answer_digits')?.label ?? '';

    assert.match(arch.title, /core|核心/iu);
    assert.match(nodes.get('remove_graphical')?.label ?? '', /graph|图形|含图/iu);
    assert.match(nodes.get('reasoning_steps')?.label ?? '', /manual|人工/iu);
    assert.equal(
      maxDigitsLabel,
      language === 'en' ? 'Programmatic max-digit count' : '程序计算最大数字位数',
    );
    assert.doesNotMatch(maxDigitsLabel, /answer.*digit|答案.*位数/iu);
    assert.match(
      readSpec('CMATH', language),
      language === 'en' ? /problem-text numbers.*answer/iu : /题面数值.*答案/u,
    );
    assert.match(nodes.get('core_final')?.label ?? '', /1,?689/u);
    assert.match(nodes.get('repo_dev')?.label ?? '', /600/u);
    assert.match(nodes.get('repo_distractor')?.label ?? '', /360/u);
    assert.ok(edges.has('labels1->reasoning_steps:primary'));
    assert.ok(edges.has('labels1->answer_digits:primary'));
    assert.ok(edges.has('reasoning_steps->core_final:primary'));
    assert.ok(edges.has('answer_digits->core_final:primary'));
    assert.equal(edges.has('reasoning_steps->answer_digits:primary'), false);
    assert.ok(edges.has('core_final->repo_dev:secondary'));
    assert.ok(edges.has('core_final->sample_60:secondary'));
    assert.match(edgeBlock(readSpec('CMATH', language), 'core_final', 'repo_dev'), /dashed: true/u);
    assert.match(edgeBlock(readSpec('CMATH', language), 'core_final', 'sample_60'), /dashed: true/u);
    assert.ok(edges.has('sample_60->distractor_variants:primary'));
    assert.ok(edges.has('distractor_variants->repo_distractor:primary'));
  }

  const reviewNote = readDetail('CMATH').drawio_review_note;
  assert.match(reviewNote, /N\s*∪\s*\{a\}/u);
  assert.match(reviewNote, /problem-text numbers.*answer/iu);
  assert.doesNotMatch(reviewNote, /answer-only|answer-digit count/iu);
});

test('pins every reviewed paper and official snapshot without inventing unknown archives', () => {
  const expected = {
    ArtifactsBench: {
      paper: 'https://arxiv.org/abs/2507.04952v2',
      note: /88c968b87e150e63de7660937e6dcfb8e7d643cf/u,
    },
    'BFCL-v4': {
      paper: 'https://openreview.net/forum?id=2GmDdhBdDk',
      note: /6ea57973c7a6097fd7c5915698c54c17c5b1b6c8/u,
    },
    'BIRD-SQL': {
      paper: 'https://arxiv.org/abs/2305.03111v3',
      note: /dec31ae335d7a5168ee17d5cc40c105e0da66d4e/u,
    },
    BigCodeBench: {
      paper: 'https://arxiv.org/abs/2406.15877v4',
      note: /9059fb84d1188c02edeac4995361656a2fdecbef.*a23c98f5552d1c44ced1400bfd16e6e15ff9b962/su,
    },
    BrowseComp: {
      paper: 'https://arxiv.org/abs/2504.12516v1',
      note: /652c89d0ca9df547706735883097e9537d40dc47/u,
    },
    'CF-Div2-Stepfun': {
      paper: 'https://arxiv.org/abs/2602.10604v2',
      note: /f281a50536b9a6cd77f4c02c683dfe491342ac05/u,
    },
    CMATH: {
      paper: 'https://arxiv.org/abs/2306.16636v1',
      note: /9fa13ef0b2d03f5a18c1ace7001248d3981d65ea/u,
    },
  };

  for (const [id, contract] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.equal(detail.paper_url, contract.paper, `${id} paper pin`);
    assert.match(detail.drawio_review_note, contract.note, `${id} source pin`);
  }
  assert.match(readDetail('BIRD-SQL').drawio_review_note, /archive.*unknown|archive.*未.*锁定/iu);
});

test('publishes native-text fixed-light Draw.io Desktop exports', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');

      assert.doesNotMatch(drawio, /html=1|math="1"/u, `${id}.${language}.drawio`);
      assert.match(drawio, /html=0/u, `${id}.${language}.drawio`);
      assert.match(drawio, /convertToSvg=1/u, `${id}.${language}.drawio`);
      assert.match(svg, /<text\b/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /<foreignObject\b/iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /data:image\//iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /fallback/iu, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /Text is not SVG - cannot display/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /light-dark\s*\(/u, `${id}.${language}.svg`);
      assert.doesNotMatch(svg, /color-scheme:\s*light\s+dark/u, `${id}.${language}.svg`);
    }
  }
});
