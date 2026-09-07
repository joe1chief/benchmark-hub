import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['ChartQAPro', 'Chatbot_Arena', 'CheXBench', 'CheXGenBench'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const syncReviewedBatch = join(
  root,
  'scripts/benchmark_build_process/sync_reviewed_site_batch.mjs',
);

const semanticNodeIds = {
  ChartQAPro: {
    construction: [
      'sources', 'search', 'vit_filter', 'pool', 'web_select', 'other_sources', 'charts',
      'seed', 'types', 'vlm', 'refine', 'review', 'consensus', 'release',
    ],
    evaluation: ['inference', 'exact', 'numeric', 'text', 'report'],
  },
  Chatbot_Arena: {
    construction: ['user', 'pair', 'battle', 'vote', 'content_filter', 'safety_flag', 'snapshot'],
    evaluation: ['win_matrix', 'bt', 'intervals', 'leaderboard', 'topic_model', 'diversity', 'experts', 'anomaly'],
  },
  CheXBench: {
    construction: ['taxonomy', 'sources', 'engineering', 'split', 'instruct', 'axes', 'perception', 'reasoning', 'generation'],
    evaluation: ['train', 'inputs', 'models', 'metrics', 'report', 'reader', 'reader_report'],
  },
  CheXGenBench: {
    construction: ['models', 'model_route', 'domain_models', 'training', 'data', 'generate'],
    evaluation: ['fidelity', 'privacy', 'classification', 'segmentation', 'rrg', 'scorecard'],
  },
};

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const readArch = (id, language = 'en') => readJson(
  join(publicDir, 'drawio', id, `${id}.${language}.arch.json`),
);
const readDetail = id => readJson(join(publicDir, 'benchmarks_detail', `${id}.json`));
const nodeMap = arch => new Map(arch.nodes.map(node => [node.id, node]));
const edgeMap = arch => new Map(arch.edges.map(edge => [
  `${edge.from}->${edge.to}:${edge.type}`,
  edge,
]));

function mermaidArrow(edge) {
  const label = String(edge.label ?? '').trim();
  const escaped = mermaidLabel(label).replace(/\|/gu, '&#124;');
  return edge.type === 'primary'
    ? (label ? `-->|${escaped}|` : '-->')
    : (label ? `-. ${escaped} .->` : '-.->');
}

function topology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function mermaidLabel(label) {
  return String(label)
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, '<br/>');
}

function renderFallback(arch) {
  const lines = ['flowchart LR'];
  for (const node of arch.nodes) {
    lines.push(`    ${node.id}["${mermaidLabel(node.label)}"]`);
  }
  for (const edge of arch.edges) {
    const arrow = mermaidArrow(edge);
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function svgVisibleText(svg) {
  return svg
    .replace(/<[^>]*>/gu, '\n')
    .replace(/&#x([0-9a-f]+);/giu, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/gu, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function labelsForNodeIds(arch, nodeIds) {
  const labels = nodeMap(arch);
  return nodeIds.map((id) => {
    const node = labels.get(id);
    assert.ok(node, `missing semantic node ${id}`);
    return String(node.label).replace(/\s*\n\s*/gu, ' · ').trim();
  });
}

test('keeps all four A10c packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual A10c text within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 48], ['zh', 30]]) {
      for (const node of readArch(id, language).nodes) {
        for (const line of String(node.label).split('\n')) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
        }
      }
    }
  }
});

test('preserves final-ACL ChartQAPro collection, annotation, review, and scoring', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ChartQAPro', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('sources')?.label ?? '', /157.*seed.*websites|157.*种子.*网站/isu);
    assert.match(nodes.get('search')?.label ?? '', /Google Images.*chart images.*graphs.*visual data|Google 图片.*图表图像.*图形.*可视化数据/isu);
    assert.match(nodes.get('vit_filter')?.label ?? '', /binary.*ViT.*manual.*non-chart|二分类.*ViT.*人工.*非图表/isu);
    assert.match(nodes.get('pool')?.label ?? '', /41,?000.*chart images|41,?000.*图表图像/isu);
    assert.match(nodes.get('web_select')?.label ?? '', /800.*charts.*200.*infographic|800.*图表.*200.*信息图/isu);
    assert.match(nodes.get('other_sources')?.label ?? '', /Pew.*Tableau.*PPIC.*(?:OWID|Our World in Data)/isu);
    assert.match(nodes.get('charts')?.label ?? '', /1,?341.*99.*URL.*alt text|1,?341.*99.*URL.*替代文本/isu);
    assert.match(nodes.get('seed')?.label ?? '', /9.*5.*reasoning.*4.*other|9.*5.*推理.*4.*其他/isu);
    assert.match(nodes.get('vlm')?.label ?? '', /GPT-4o.*Gemini.*Claude.*each.*(?:5|five).*chart|GPT-4o.*Gemini.*Claude.*每个.*图表.*5/isu);
    assert.match(nodes.get('refine')?.label ?? '', /remove.*simple.*revise.*ambiguous|移除.*简单.*修订.*歧义/isu);
    assert.match(nodes.get('review')?.label ?? '', /7.*5.*factoid.*2.*other|7.*5.*事实.*2.*其他/isu);
    assert.match(nodes.get('consensus')?.label ?? '', /66\.17%.*resolve.*<1%|66\.17%.*解决.*<1%/isu);
    assert.match(nodes.get('release')?.label ?? '', /1,?341.*1,?948/isu);
    assert.match(nodes.get('inference')?.label ?? '', /21.*Direct.*CoT.*PoT|21.*直接.*CoT.*PoT/isu);
    assert.match(nodes.get('exact')?.label ?? '', /multiple-choice.*fact-check.*year|选择题.*事实核验.*年份/isu);
    assert.match(nodes.get('numeric')?.label ?? '', /5%.*relative|5%.*相对/isu);
    assert.match(nodes.get('text')?.label ?? '', /^(?=.*ANLS)(?=.*Levenshtein)/isu);
    assert.ok(edges.has('sources->search:primary'));
    assert.ok(edges.has('search->vit_filter:primary'));
    assert.ok(edges.has('vit_filter->pool:primary'));
    assert.ok(edges.has('pool->web_select:primary'));
    assert.ok(edges.has('web_select->charts:primary'));
    assert.ok(edges.has('other_sources->charts:primary'));
    assert.ok(edges.has('charts->seed:primary'));
    assert.ok(edges.has('seed->vlm:primary'));
    assert.ok(edges.has('review->consensus:primary'));
    assert.ok(edges.has('consensus->release:primary'));
    assert.ok(edges.has('inference->exact:primary'));
    assert.ok(edges.has('inference->numeric:primary'));
    assert.ok(edges.has('inference->text:primary'));
  }
});

test('keeps Chatbot Arena paper-snapshot ranking separate from validity analyses', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('Chatbot_Arena', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('user')?.label ?? '', /^(?:(?=.*terms)(?=.*public)(?=.*release)|(?=.*条款)(?=.*公开发布))/isu);
    assert.match(nodes.get('battle')?.label ?? '', /^(?:(?=.*same)(?=.*multi-turn)|(?=.*相同)(?=.*多轮))/isu);
    assert.match(nodes.get('vote')?.label ?? '', /A.*B.*Tie.*Both.*Bad|A.*B.*平局.*都不好/isu);
    assert.match(nodes.get('content_filter')?.label ?? '', /identity.*keyword.*model.*compan|身份.*关键词.*模型.*公司/isu);
    assert.match(nodes.get('safety_flag')?.label ?? '', /moderation.*flag.*unsafe.*3%.*not.*ranking|审核.*标记.*不安全.*3%.*不.*排名/isu);
    assert.match(nodes.get('snapshot')?.label ?? '', /240K.*90K.*50.*100.*77%|24 万.*9 万.*50.*100.*77%/isu);
    assert.match(nodes.get('topic_model')?.label ?? '', /1,?536.*UMAP.*5.*HDBSCAN.*32/isu);
    assert.match(nodes.get('diversity')?.label ?? '', /600.*10.*GPT-4-Turbo|600.*10.*GPT-4-Turbo/isu);
    assert.match(nodes.get('experts')?.label ?? '', /160.*blind.*72.*83|160.*盲.*72.*83/isu);
    assert.match(nodes.get('anomaly')?.label ?? '', /^(?=.*IP)(?=.*Fisher)(?=.*5)(?=.*25)(?=.*25)(?=.*(?:independent|独立))(?=.*(?:not.*ranking|不.*排名))/isu);
    assert.match(nodes.get('bt')?.label ?? '', /reweighted.*1\s*\/\s*P\(pair\)|重加权.*1\s*\/\s*P\(pair\)/isu);
    assert.match(nodes.get('intervals')?.label ?? '', /sandwich.*approximate rank|sandwich.*近似排名/isu);
    assert.ok(edges.has('vote->content_filter:primary'));
    assert.ok(edges.has('vote->safety_flag:data'));
    assert.ok(edges.has('content_filter->snapshot:primary'));
    assert.equal(edges.has('safety_flag->snapshot:primary'), false);
    assert.equal(edges.has('safety_flag->win_matrix:data'), false);
    assert.ok(edges.has('snapshot->win_matrix:primary'));
    assert.ok(edges.has('snapshot->topic_model:data'));
    assert.ok(edges.has('snapshot->experts:data'));
    assert.ok(edges.has('snapshot->anomaly:data'));
    assert.equal(edges.has('diversity->win_matrix:data'), false);
    assert.equal(edges.has('experts->win_matrix:data'), false);
    assert.equal(edges.has('anomaly->win_matrix:data'), false);
    assert.ok(edges.has('win_matrix->bt:primary'));
    assert.ok(edges.has('bt->intervals:primary'));
    assert.ok(edges.has('intervals->leaderboard:primary'));
  }
  const detail = readDetail('Chatbot_Arena');
  const summary = [detail.intro, detail.build_method, detail.intro_en, detail.build_method_en].join('\n');
  assert.match(summary, /身份.*过滤|identity.*filter/isu);
  assert.match(summary, /安全.*标记|safety.*flag/isu);
  assert.match(summary, /异常.*独立.*分析|anomalous.*independent.*analysis/isu);
  assert.doesNotMatch(summary, /异常用户过滤|anomalous-user filtering/iu);
});

test('separates CheXbench construction, model context, metrics, and reader study', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CheXBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('taxonomy')?.label ?? '', /^(?=.*35)(?=.*(?:5 categories|五类))(?=.*(?:coarse-grained|粗粒度))(?=.*(?:fine-grained|细粒度))(?=.*(?:text generation|文本生成))(?=.*(?:question answering|问答))(?=.*(?:miscellaneous|其他))/isu);
    assert.match(nodes.get('sources')?.label ?? '', /32.*1,?077,?494|32.*1,?077,?494/isu);
    assert.match(nodes.get('engineering')?.label ?? '', /manual quality.*GPT-4.*restructur|人工质控.*GPT-4.*重构/isu);
    assert.equal(nodes.get('split')?.type, 'process');
    assert.match(nodes.get('split')?.label ?? '', /official or traditional.*train.*validation.*test|官方或传统.*训练.*验证.*测试/isu);
    assert.match(nodes.get('instruct')?.label ?? '', /8,?466,?352.*10.*templates|8,?466,?352.*10.*模板/isu);
    assert.match(nodes.get('perception')?.label ?? '', /View.*600.*Temporal.*62.*Disease.*2,?684|视角.*600.*时序.*62.*疾病.*2,?684/isu);
    assert.match(nodes.get('reasoning')?.label ?? '', /Fine-grained.*380.*VQA.*238.*Grounding.*149|细粒度.*380.*VQA.*238.*定位.*149/isu);
    assert.match(nodes.get('generation')?.label ?? '', /Findings.*2,?451.*Summarization.*1,?394|所见生成.*2,?451.*摘要.*1,?394/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /accuracy.*mIoU.*mAP.*CheXbert.*BERTScore.*RadGraph.*ROUGE-L/isu);
    assert.match(nodes.get('reader')?.label ?? '', /4 residents.*4 attendings.*50.*30|4.*住院.*4.*主治.*50.*30/isu);
    assert.match(nodes.get('reader_report')?.label ?? '', /time.*indication.*editing.*efficiency|时间.*检查指征.*编辑.*效率/isu);
    assert.equal(nodes.has('expert_review'), false);
    assert.ok(edges.has('split->instruct:data'));
    assert.ok(edges.has('split->axes:primary'));
    assert.ok(edges.has('instruct->train:data'));
    assert.ok(edges.has('train->models:data'));
    assert.ok(edges.has('axes->perception:primary'));
    assert.ok(edges.has('axes->reasoning:primary'));
    assert.ok(edges.has('axes->generation:primary'));
    assert.ok(edges.has('metrics->report:primary'));
    assert.ok(edges.has('train->reader:data'));
    assert.ok(edges.has('reader->reader_report:data'));
    assert.equal(edges.has('metrics->reader:primary'), false);
    assert.equal(edges.has('reader_report->report:primary'), false);
  }
  const detail = readDetail('CheXBench');
  assert.match(
    [detail.build_method, detail.build_method_en].join('\n'),
    /粗粒度.*细粒度.*文本生成.*问答.*其他|coarse-grained.*fine-grained.*text generation.*question answering.*miscellaneous/isu,
  );
});

test('uses CheXGenBench v4 branches and all three utility tasks without v1 release drift', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('CheXGenBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('models')?.label ?? '', /11.*T2I|11.*T2I/isu);
    assert.match(nodes.get('data')?.label ?? '', /237,?388.*5,?034.*LLaVA-Rad/isu);
    assert.match(nodes.get('domain_models')?.label ?? '', /RadEdit.*LLM-CXR.*out-of-the-box|RadEdit.*LLM-CXR.*开箱/isu);
    assert.match(nodes.get('training')?.label ?? '', /^(?=.*20(?: epochs| 轮))(?=.*<1B)(?=.*(?:full|全量))(?=.*>1B)(?=.*LoRA)(?=.*32)(?=.*QKV)/isu);
    assert.match(nodes.get('fidelity')?.label ?? '', /^(?=.*RadDino)(?=.*FID)(?=.*KID)(?=.*BioViL-T)(?=.*PRDC)(?=.*(?:patholog|病理))/isu);
    assert.match(nodes.get('privacy')?.label ?? '', /pixel.*RadDino.*Siamese.*Re-ID|像素.*RadDino.*Siamese.*重识别/isu);
    assert.match(nodes.get('classification')?.label ?? '', /20K.*20K.*ResNet-50.*20 epochs.*5,?034|20K.*20K.*ResNet-50.*20 轮.*5,?034/isu);
    assert.match(nodes.get('segmentation')?.label ?? '', /^(?=.*3,?000.*3,?000)(?=.*(?:clavicle|锁骨))(?=.*159)(?=.*U-Net)(?=.*DICE)/isu);
    assert.match(nodes.get('rrg')?.label ?? '', /^(?=.*50K)(?=.*20K)(?=.*LLaVA-Rad)(?=.*(?:from scratch|从头))(?=.*GREEN)(?=.*RaTE)/isu);
    assert.match(nodes.get('scorecard')?.label ?? '', /20\+.*fidelity.*privacy.*utility|20\+.*保真.*隐私.*效用/isu);
    const allLabels = [...nodes.values()].map(node => node.label).join('\n');
    assert.doesNotMatch(allLabels, /SynthCheX|75K|HealthGPT/iu);
    assert.ok(edges.has('model_route->domain_models:primary'));
    assert.ok(edges.has('model_route->training:primary'));
    assert.ok(edges.has('domain_models->generate:primary'));
    assert.ok(edges.has('training->generate:primary'));
    assert.ok(edges.has('generate->fidelity:primary'));
    assert.ok(edges.has('generate->privacy:primary'));
    assert.ok(edges.has('generate->classification:primary'));
    assert.ok(edges.has('generate->segmentation:primary'));
    assert.ok(edges.has('generate->rrg:primary'));
    assert.ok(edges.has('classification->scorecard:primary'));
    assert.ok(edges.has('segmentation->scorecard:primary'));
    assert.ok(edges.has('rrg->scorecard:primary'));
  }
  const detail = readDetail('CheXGenBench');
  assert.equal(detail.paper_url, 'https://arxiv.org/abs/2505.10496v4');
  assert.equal(detail.arxiv_pdf_url, 'https://arxiv.org/pdf/2505.10496v4');
  assert.equal(detail.pdf_cdn_url, 'https://arxiv.org/pdf/2505.10496v4');
  assert.match([detail.build_method, detail.build_method_en].join('\n'), /9.*RadEdit.*LLM-CXR.*开箱|9.*RadEdit.*LLM-CXR.*out-of-the-box/isu);
  assert.match([detail.scale, detail.scale_en].join('\n'), /237,?388.*5,?034.*9.*2/isu);
  assert.match([detail.metric, detail.metric_en].join('\n'), /DICE.*GREENScore.*RaTEScore/isu);
  assert.doesNotMatch(JSON.stringify(detail), /SynthCheX|HealthGPT|75K/iu);
  const spec = readFileSync(join(publicDir, 'drawio', 'CheXGenBench', 'CheXGenBench.en.spec.yaml'), 'utf8');
  assert.match(spec, /from: generate\n\s+to: rrg\n\s+type: primary\n\s+style:\n\s+exitX: 0\.5\n\s+exitY: 1\n\s+entryX: 0\n\s+entryY: 0\.5/mu);
  assert.doesNotMatch(spec, /from: generate\n\s+to: rrg[\s\S]*?waypoints:/u);
});

test('pins A10c primary papers and official snapshot boundaries in detail notes', () => {
  const expected = {
    ChartQAPro: /Findings of ACL 2025.*Appendix A\.1.*157.*seed.*Google Images.*binary.*ViT.*41,?000.*800.*200.*99.*1,?341/isu,
    Chatbot_Arena: /2403\.04132v1.*identity.*filter.*moderation.*flag.*independent.*anomalous-IP.*25.*25.*not.*ranking/isu,
    CheXBench: /2401\.12208v2.*Building CheXbench.*e4f31e6.*97fc510.*no separate.*expert-review/isu,
    CheXGenBench: /2505\.10496v4.*TMLR.*§§2\.1.?2\.4.*cc7e91e.*9.*RadEdit.*LLM-CXR.*5,?034.*DICE.*GREENScore.*RaTEScore/isu,
  };
  for (const [id, pattern] of Object.entries(expected)) {
    assert.match(readDetail(id).drawio_review_note, pattern, id);
  }
  assert.doesNotMatch(readDetail('ChartQAPro').drawio_review_note, /v1.*(?:error|incorrect|corrects)|旧版.*错误/iu);
});

test('keeps every A10c detail fallback synchronized with the reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(readArch(id, language)),
        `${id}.${language} canonical fallback`,
      );
    }
  }
});

test('registration replaces legacy summaries with A10c reviewed semantic arrays', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10c-registration-'));
  try {
    const tempPublic = join(tempRoot, 'client/public');
    mkdirSync(join(tempRoot, 'scripts/benchmark_build_process'), { recursive: true });
    mkdirSync(join(tempPublic, 'benchmarks_detail'), { recursive: true });
    mkdirSync(join(tempPublic, 'drawio'), { recursive: true });
    cpSync(syncReviewedBatch, join(tempRoot, 'scripts/benchmark_build_process/sync_reviewed_site_batch.mjs'));

    const catalog = [];
    const manifest = [];
    for (const id of benchmarkIds) {
      const detail = readDetail(id);
      catalog.push(detail);
      manifest.push({
        id,
        source_type: 'paper',
        source_url: detail.paper_url,
        construction_steps_en: ['LEGACY CONSTRUCTION'],
        construction_steps_zh: ['旧构建语义'],
        evaluation_steps_en: ['LEGACY EVALUATION'],
        evaluation_steps_zh: ['旧评测语义'],
      });
      cpSync(
        join(publicDir, 'benchmarks_detail', `${id}.json`),
        join(tempPublic, 'benchmarks_detail', `${id}.json`),
      );
      cpSync(join(publicDir, 'drawio', id), join(tempPublic, 'drawio', id), { recursive: true });
    }
    writeFileSync(join(tempPublic, 'benchmarks.json'), `${JSON.stringify(catalog, null, 2)}\n`);
    writeFileSync(join(tempPublic, 'benchmarks_build_process_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    execFileSync(process.execPath, [
      join(tempRoot, 'scripts/benchmark_build_process/sync_reviewed_site_batch.mjs'),
      '--batch', 'paper-review-site-a10c-scoped',
      '--reviewed-at', '2026-07-18',
      '--ids', benchmarkIds.join(','),
    ], { cwd: tempRoot, stdio: 'pipe' });
    execFileSync(process.execPath, [
      join(tempRoot, 'scripts/benchmark_build_process/sync_reviewed_site_batch.mjs'),
      '--batch', 'paper-review-site-a10c-scoped',
      '--reviewed-at', '2026-07-18',
      '--ids', benchmarkIds.join(','),
    ], { cwd: tempRoot, stdio: 'pipe' });

    const registered = new Map(readJson(
      join(tempPublic, 'benchmarks_build_process_manifest.json'),
    ).map(record => [record.id, record]));
    const registeredCatalog = new Map(readJson(
      join(tempPublic, 'benchmarks.json'),
    ).map(record => [record.id, record]));
    for (const id of benchmarkIds) {
      const record = registered.get(id);
      const detail = readJson(join(tempPublic, 'benchmarks_detail', `${id}.json`));
      assert.ok(record, id);
      assert.equal(record.review_batch, 'paper-review-site-a10c-scoped');
      assert.equal(record.spec_authority, 'checked_in');
      assert.match(
        detail.drawio_review_note,
        /Formal publication evidence \[paper-review-site-a10c-scoped\]:.*Final PNG dimensions are \d+×\d+ \(English\) and \d+×\d+ \(Chinese\); SVG viewBoxes are \d+×\d+ and \d+×\d+\./u,
        `${id} formal publication evidence`,
      );
      assert.equal(
        detail.drawio_review_note.match(/Formal publication evidence/gu)?.length,
        1,
        `${id} idempotent formal publication evidence`,
      );
      assert.equal(record.source_locator, detail.drawio_review_note, `${id} manifest locator`);
      assert.equal(
        registeredCatalog.get(id)?.drawio_review_note,
        detail.drawio_review_note,
        `${id} catalog review note`,
      );
      for (const language of ['en', 'zh']) {
        const arch = readArch(id, language);
        const assignedIds = [
          ...semanticNodeIds[id].construction,
          ...semanticNodeIds[id].evaluation,
        ];
        assert.equal(assignedIds.length, arch.nodes.length, `${id}.${language} node count`);
        assert.deepEqual(
          new Set(assignedIds),
          new Set(arch.nodes.map(node => node.id)),
          `${id}.${language} full node coverage`,
        );
        assert.deepEqual(
          record[`construction_steps_${language}`],
          labelsForNodeIds(arch, semanticNodeIds[id].construction),
          `${id}.${language} construction semantics`,
        );
        assert.deepEqual(
          record[`evaluation_steps_${language}`],
          labelsForNodeIds(arch, semanticNodeIds[id].evaluation),
          `${id}.${language} evaluation semantics`,
        );
      }
    }
    const registeredText = JSON.stringify([...registered.values()]);
    assert.doesNotMatch(registeredText, /LEGACY|旧构建语义|旧评测语义/u);
    assert.doesNotMatch(registeredText, /异常用户过滤|anomalous-user filtering|SynthCheX|HealthGPT|75K/iu);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10c', () => {
  for (const id of benchmarkIds) {
    for (const language of ['en', 'zh']) {
      const base = join(publicDir, 'drawio', id, `${id}.${language}`);
      const drawio = readFileSync(`${base}.drawio`, 'utf8');
      const svg = readFileSync(`${base}.svg`, 'utf8');
      assert.match(drawio, /html=0/u);
      assert.match(drawio, /convertToSvg=1/u);
      assert.doesNotMatch(drawio, /html=1|math="1"/u);
      assert.match(svg, /<text\b/u);
      assert.doesNotMatch(svg, /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u);
      const visibleText = svgVisibleText(svg);
      for (const node of readArch(id, language).nodes) {
        for (const line of node.label.split(/\r?\n/u)) {
          assert.ok(visibleText.includes(line), `${id}.${language} SVG label: ${line}`);
        }
      }
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('strictly rebuilds and normalizes all eight A10c specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10c-'));
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
        assert.equal(
          readFileSync(generated, 'utf8'),
          readFileSync(`${base}.drawio`, 'utf8'),
          `${id}.${language}`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps A10c registered semantic arrays synchronized with every source node', () => {
  const entries = new Map(readJson(join(publicDir, 'benchmarks_build_process_manifest.json')).map(record => [record.id, record]));
  for (const id of benchmarkIds) {
    const record = entries.get(id);
    assert.ok(record, id);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const assigned = [...semanticNodeIds[id].construction, ...semanticNodeIds[id].evaluation];
      assert.equal(assigned.length, arch.nodes.length);
      assert.deepEqual(new Set(assigned), new Set(arch.nodes.map(node => node.id)));
      assert.deepEqual(record[`construction_steps_${language}`], labelsForNodeIds(arch, semanticNodeIds[id].construction));
      assert.deepEqual(record[`evaluation_steps_${language}`], labelsForNodeIds(arch, semanticNodeIds[id].evaluation));
    }
  }
});
