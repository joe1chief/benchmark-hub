import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSvgFidelity } from './assert_svg_fidelity.mjs';
import { assertPngFidelity } from './assert_png_fidelity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['DeepSeek_LeetCode', 'DefenderBench', 'Disco-X', 'DreamBench++'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const drawioDesktop = process.env.DRAWIO_DESKTOP_CLI
  || '/Applications/draw.io.app/Contents/MacOS/draw.io';
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
);
const svgNormalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_drawio_svg.mjs',
);

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
    lines.push(`    ${edge.from} ${edge.type === 'primary' ? '-->' : '-.->'} ${edge.to}`);
  }
  return lines.join('\n');
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10k packages bilingual with identical typed topology', () => {
  for (const id of benchmarkIds) {
    assert.deepEqual(topology(readArch(id, 'zh')), topology(readArch(id, 'en')), id);
  }
});

test('keeps bilingual labels within reviewed native-text boxes', () => {
  for (const id of benchmarkIds) {
    for (const [language, maxLineLength] of [['en', 46], ['zh', 28]]) {
      for (const node of readArch(id, language).nodes) {
        const lines = String(node.label).split('\n');
        assert.ok(lines.length <= 5, `${id}.${language}.${node.id}: ${lines.length} lines`);
        for (const line of lines) {
          assert.ok(
            [...line].length <= maxLineLength,
            `${id}.${language}.${node.id}: ${line}`,
          );
        }
      }
    }
  }
});

test('keeps DeepSeek LeetCode collection, two inference modes, execution, and Pass@1 exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('DeepSeek_LeetCode', language));
    const edges = edgeMap(readArch('DeepSeek_LeetCode', language));
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /2401\.14196v2.*§4\.1.*Table 5.*2f9fd859.*b96d7574.*no standalone|2401\.14196v2.*§4\.1.*表 5.*2f9fd859.*b96d7574.*无独立/isu,
    );
    assert.match(nodes.get('contests')?.label ?? '', /July 2023.*January 2024.*reduce.*not eliminate|2023 年 7 月.*2024 年 1 月.*降低.*不能排除/isu);
    assert.match(
      nodes.get('benchmark')?.label ?? '',
      /(?=.*180)(?=.*45)(?=.*91)(?=.*44)(?=.*public)(?=.*no train)|(?=.*180)(?=.*45)(?=.*91)(?=.*44)(?=.*公开)(?=.*无训练)/isu,
    );
    assert.match(
      nodes.get('tests')?.label ?? '',
      /(?=.*100)(?=.*public)(?=.*assert)|(?=.*100)(?=.*公开)(?=.*断言)/isu,
    );
    assert.equal(nodes.get('mode')?.type, 'decision');
    assert.ok(edges.has('mode->direct_prompt:primary'));
    assert.ok(edges.has('mode->cot_prompt:primary'));
    assert.match(nodes.get('cot_prompt')?.label ?? '', /step-by-step outline.*code|分步大纲.*代码/isu);
    assert.match(
      nodes.get('inference')?.label ?? '',
      /(?=.*temperature 0)(?=.*1,?024)(?=.*one output)|(?=.*温度 0)(?=.*1,?024)(?=.*单输出)/isu,
    );
    assert.match(nodes.get('extract')?.label ?? '', /first fenced Python.*fallback.*def.*class.*if.*#.*print|首个 Python 代码块.*回退.*def.*class.*if.*#.*print/isu);
    assert.match(nodes.get('execute')?.label ?? '', /HumanEval.*10 s.*all 100|HumanEval.*10 秒.*全部 100/isu);
    assert.match(nodes.get('score')?.label ?? '', /Pass@1.*mean.*overall.*difficulty.*contamination|Pass@1.*均值.*总体.*难度.*污染/isu);
    assert.doesNotMatch([...nodes.values()].map(node => node.label).join('\n'), /hidden tests|隐藏测试/iu);
  }
});

test('keeps DefenderBench five task types, implementation drift, eight metrics, and paper aggregation exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('DefenderBench', language));
    const edges = edgeMap(readArch('DefenderBench', language));
    assert.match(nodes.get('evidence_boundary')?.label ?? '', /2506\.00739v4.*e431098e.*13118970|2506\.00739v4.*e431098e.*13118970/isu);
    assert.match(nodes.get('sources')?.label ?? '', /no frozen consolidated.*upstream.*drift|无冻结整包.*上游.*漂移/isu);
    assert.equal(nodes.get('suite')?.type, 'decision');
    for (const id of ['intrusion', 'malicious', 'cti', 'vuln_detect', 'fixing']) {
      assert.ok(edges.has(`suite->${id}:primary`), `${language}.${id}`);
    }
    assert.match(nodes.get('intrusion')?.label ?? '', /Chain10.*ToyCTF6.*3 actions|Chain10.*ToyCTF6.*3 个动作/isu);
    assert.match(nodes.get('malicious')?.label ?? '', /20,?137.*15,?612.*500.*10.*bug.*positive|20,?137.*15,?612.*500.*10.*缺陷.*正类/isu);
    assert.match(nodes.get('cti')?.label ?? '', /2,?500.*2,?338.*500.*20.*http|2,?500.*2,?338.*500.*20.*http/isu);
    assert.match(nodes.get('vuln_detect')?.label ?? '', /two report columns.*same.*2,?732.*same 500|两个报告列.*同一.*2,?732.*同一 500/isu);
    assert.match(nodes.get('fixing')?.label ?? '', /12,?107.*4,?249.*8.*30.*240|12,?107.*4,?249.*8.*30.*240/isu);
    assert.match(
      nodes.get('intrusion_episode')?.label ?? '',
      /(?=.*100)(?=.*action)(?=.*observation)|(?=.*100)(?=.*动作)(?=.*观察)/isu,
    );
    assert.match(
      nodes.get('static_episode')?.label ?? '',
      /5.*total attempts.*first answer.*attempt 1.*format feedback|5.*总尝试.*首答.*第 1 次.*格式.*反馈/isu,
    );
    assert.doesNotMatch(nodes.get('static_episode')?.label ?? '', /5 correction steps|5 次纠正/iu);
    assert.match(nodes.get('intrusion_metrics')?.label ?? '', /nodes taken.*total nodes.*not binary|占领节点.*总节点.*非二元/isu);
    assert.match(nodes.get('task_metrics')?.label ?? '', /five Macro-F1.*CodeBLEU.*0\.1.*0\.1.*0\.4.*0\.4|5 个 Macro-F1.*CodeBLEU.*0\.1.*0\.1.*0\.4.*0\.4/isu);
    assert.match(nodes.get('aggregate')?.label ?? '', /paper-table.*sum.*8.*runner.*not|论文表格.*求和.*8.*runner.*未/isu);
    assert.match(nodes.get('repeat')?.label ?? '', /five independent runs.*mean|5 次独立运行.*均值/isu);
  }
});

test('keeps Disco-X curation, release variants, zero gate, exact Metric-S deductions, and validation exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('Disco-X', language));
    const edges = edgeMap(readArch('Disco-X', language));
    assert.match(nodes.get('evidence_boundary')?.label ?? '', /2511\.10984v2.*OTCfZ6h8Pe.*fab17983.*f6d3d51d|2511\.10984v2.*OTCfZ6h8Pe.*fab17983.*f6d3d51d/isu);
    assert.match(nodes.get('source_team')?.label ?? '', /115.*18.*1,?330.*1,?500|115.*18.*1,?330.*1,?500/isu);
    assert.match(nodes.get('annotate')?.label ?? '', /grammar.*topic.*terminology.*culture.*9\.38|语法.*主题.*术语.*文化.*9\.38/isu);
    assert.match(nodes.get('review_gate')?.label ?? '', /linguistic.*both.*SOTA.*fail.*8|语言专家.*两个.*SOTA.*失败.*8/isu);
    assert.match(nodes.get('benchmark')?.label ?? '', /200.*100.*100.*121.*79.*7|200.*100.*100.*121.*79.*7/isu);
    assert.equal(nodes.get('protocol')?.type, 'decision');
    assert.ok(edges.has('protocol->main_setting:primary'));
    assert.ok(edges.has('protocol->detailed_setting:primary'));
    assert.match(nodes.get('main_setting')?.label ?? '', /simple.*Gemini-2\.5-Pro|简单.*Gemini-2\.5-Pro/isu);
    assert.match(nodes.get('detailed_setting')?.label ?? '', /Dec 2025.*detailed.*Gemini-3-Pro.*not.*same|2025 年 12 月.*详细.*Gemini-3-Pro.*不可.*同/isu);
    assert.match(nodes.get('instruction')?.label ?? '', /translation.*continuation.*summary.*zero|翻译.*续写.*摘要.*零/isu);
    assert.match(
      nodes.get('dedup')?.label ?? '',
      /extremely critical Accuracy first.*expert checkpoint \/ rubric next.*remaining overlaps.*causal root|极严重准确性错误最高优先.*专家 checkpoint \/ 评分点次之.*其余重叠.*因果根因/isu,
    );
    assert.match(
      nodes.get('score')?.label ?? '',
      /Acc\s*=\s*max\(0,\s*60.*Flu\s*=\s*max\(0,\s*20.*App\s*=\s*max\(0,\s*20/isu,
    );
    assert.match(nodes.get('validation')?.label ?? '', /50.*70\.3%.*3 trials.*stability|50.*70\.3%.*3 次.*稳定性/isu);
  }
});

test('keeps DreamBench++ curation, GPT-4o prompt generation, judging, scaling, and agreement exact', () => {
  for (const language of ['en', 'zh']) {
    const nodes = nodeMap(readArch('DreamBench++', language));
    const edges = edgeMap(readArch('DreamBench++', language));
    assert.match(nodes.get('evidence_boundary')?.label ?? '', /2406\.16855v2.*66ca27e5.*459b0649.*d5b0c8a2|2406\.16855v2.*66ca27e5.*459b0649.*d5b0c8a2/isu);
    assert.match(
      nodes.get('keywords')?.label ?? '',
      /(?=.*GPT-4o)(?=.*200)(?=.*Unsplash)(?=.*7)(?=.*300)/isu,
    );
    assert.match(nodes.get('sources')?.label ?? '', /Unsplash.*Rawpixel.*Google.*authorized|Unsplash.*Rawpixel.*Google.*授权/isu);
    assert.match(
      nodes.get('sam')?.label ?? '',
      /(?=.*SAM)(?=.*small)(?=.*subject)|(?=.*SAM)(?=.*过小)(?=.*主体)/isu,
    );
    assert.match(
      nodes.get('human_qc')?.label ?? '',
      /(?=.*(?:7|seven))(?=.*noisy)(?=.*crop)(?=.*center)(?=.*two)(?=.*NSFW)|(?=.*7)(?=.*噪声)(?=.*裁剪)(?=.*居中)(?=.*两)(?=.*NSFW)/isu,
    );
    assert.match(nodes.get('release')?.label ?? '', /150.*45.*20.*65.*20.*120.*30|150.*45.*20.*65.*20.*120.*30/isu);
    assert.match(
      nodes.get('prompts')?.label ?? '',
      /(?=.*GPT-4o)(?=.*PartiPrompts)(?=.*4)(?=.*3)(?=.*2)(?=.*1,?350)(?=.*human)|(?=.*GPT-4o)(?=.*PartiPrompts)(?=.*4)(?=.*3)(?=.*2)(?=.*1,?350)(?=.*人工)/isu,
    );
    assert.match(nodes.get('methods')?.label ?? '', /TI.*DB.*DB-LoRA.*BLIP.*Emu2.*IP-Adapter|TI.*DB.*DB-LoRA.*BLIP.*Emu2.*IP-Adapter/isu);
    assert.match(nodes.get('generation')?.label ?? '', /1,?350.*7.*9,?450.*100.*7\.5.*50.*3.*0\.6|1,?350.*7.*9,?450.*100.*7\.5.*50.*3.*0\.6/isu);
    assert.match(
      nodes.get('meta')?.label ?? '',
      /(?=.*GPT-4o-2024-05-13)(?=.*temperature 1)(?=.*0)(?=.*4)|(?=.*GPT-4o-2024-05-13)(?=.*温度 1)(?=.*0)(?=.*4)/isu,
    );
    assert.match(nodes.get('prefill')?.label ?? '', /stored.*assistant prefill.*one.*call.*not dynamic two|静态.*assistant prefill.*一次.*调用.*非动态两/isu);
    assert.equal(nodes.get('dimensions')?.type, 'decision');
    assert.ok(edges.has('dimensions->concept:primary'));
    assert.ok(edges.has('dimensions->following:primary'));
    assert.ok(edges.has('generation->human:optional'));
    assert.ok(!edges.has('gpt_score->human:primary'));
    assert.match(nodes.get('gpt_score')?.label ?? '', /0.*4.*mean.*4.*0.*1.*full.*full2.*full3.*mean.*std|0.*4.*均值.*4.*0.*1.*full.*full2.*full3.*均值.*标准差/isu);
    assert.match(nodes.get('human')?.label ?? '', /7.*same rubric.*isolated.*2|7.*同一量表.*隔离.*2/isu);
    assert.match(nodes.get('agreement')?.label ?? '', /interval.*Krippendorff.*H.H.*G.H.*Pearson.*separate|区间.*Krippendorff.*H.H.*G.H.*Pearson.*分开/isu);
    assert.match(
      nodes.get('release_boundary')?.label ?? '',
      /(?=.*no train)(?=.*split)(?=.*Drive)(?=.*unversioned)|(?=.*无训练)(?=.*划分)(?=.*Drive)(?=.*未版本化)/isu,
    );
  }
});

test('pins all A10k paper, repository, dataset, and protocol boundaries in detail records', () => {
  const deepseek = readDetail('DeepSeek_LeetCode');
  assert.equal(deepseek.paper_url, 'https://arxiv.org/abs/2401.14196v2');
  assert.equal(deepseek.arxiv_pdf_url, 'https://arxiv.org/pdf/2401.14196v2');
  assert.match(deepseek.drawio_review_note, /no standalone.*§4\.1.*Table 5.*2f9fd85927c669dae3c0fbb2d607274023af243e.*b96d75740ab2b9c681a34b0fb39595e6710104ec.*public tests.*10-second/isu);
  assert.doesNotMatch([deepseek.eval_feature, deepseek.eval_feature_en].join('\n'), /hidden|隐藏/iu);

  const defender = readDetail('DefenderBench');
  assert.equal(defender.paper_url, 'https://arxiv.org/abs/2506.00739v4');
  assert.equal(defender.arxiv_pdf_url, 'https://arxiv.org/pdf/2506.00739v4');
  assert.match(defender.drawio_review_note, /e431098e217ee6778f572df202785f1a705df167.*854d6966.*55caf9af.*9237e163.*69bd48c0.*c8cbfeec.*10\.5281\/zenodo\.13118970.*4586a358/isu);
  assert.match(
    defender.drawio_review_note,
    /(?=.*same 500-row)(?=.*web few-shot.*bug)(?=.*URL contains.*http)(?=.*five total answer attempts)(?=.*first answer counts as attempt one)(?=.*paper-table)/isu,
  );

  const disco = readDetail('Disco-X');
  assert.equal(disco.arxiv_pdf_url, 'https://arxiv.org/pdf/2511.10984v2');
  assert.match(disco.drawio_review_note, /2511\.10984v2.*OTCfZ6h8Pe.*fab17983fceb169f561b5bcce422e1a62cc24196.*f6d3d51d0c37ed9052ff65e78bf6cd55b815c2aa/isu);
  assert.match(
    disco.drawio_review_note,
    /Extremely Critical Accuracy.*highest priority.*checkpoint\/rubric.*second.*individually floored at zero.*Gemini-2\.5-Pro.*Gemini-3-Pro.*not directly comparable.*70\.3%/isu,
  );

  const dream = readDetail('DreamBench++');
  assert.equal(dream.paper_url, 'https://arxiv.org/abs/2406.16855v2');
  assert.equal(dream.arxiv_pdf_url, 'https://arxiv.org/pdf/2406.16855v2');
  assert.match(dream.drawio_review_note, /66ca27e52b5e7daa350bdb92ac8c60d4a9339c5e.*459b06499fad3dac842c4b1f7a053fb3328d91c7.*d5b0c8a2a87fdae6ecf63fb18119a2e1dc67a38c/isu);
  assert.match(dream.metric_en, /reported 0.*1.*raw 0.*4.*Krippendorff.*alignment/isu);
  assert.match(dream.drawio_review_note, /one API call.*assistant prefill.*not.*dynamic two-call.*unversioned Google Drive/isu);
});

test('keeps every A10k detail fallback synchronized with reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      assert.equal(
        detail[`flowchart_${language}`],
        renderFallback(readArch(id, language)),
        `${id}.${language} full fallback`,
      );
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10k', () => {
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
      const dimensions = pngDimensions(`${base}.png`);
      assert.ok(dimensions.width >= 700 && dimensions.height >= 180, `${id}.${language}`);
    }
  }
});

test('reproduces all eight A10k SVG and PNG exports from checked-in Draw.io sources', {
  skip: existsSync(drawioDesktop) ? false : 'Draw.io desktop exporter is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10k-exports-'));
  try {
    for (const id of benchmarkIds) {
      for (const language of ['en', 'zh']) {
        const base = join(publicDir, 'drawio', id, `${id}.${language}`);
        const generatedSvg = join(tempRoot, `${id}.${language}.svg`);
        const generatedPng = join(tempRoot, `${id}.${language}.png`);
        execFileSync(drawioDesktop, [
          '-x', '-f', 'svg', '--svg-theme', 'light', '-o', generatedSvg, `${base}.drawio`,
        ], { stdio: 'pipe' });
        execFileSync(process.execPath, [svgNormalizer, generatedSvg], { stdio: 'pipe' });
        assertSvgFidelity(
          generatedSvg,
          `${base}.svg`,
          `${id}.${language}.svg export freshness`,
        );

        execFileSync(drawioDesktop, [
          '-x', '-f', 'png', '-o', generatedPng, `${base}.drawio`,
        ], { stdio: 'pipe' });
        assertPngFidelity(
          generatedPng,
          `${base}.png`,
          `${id}.${language}.png export freshness`,
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('strictly rebuilds and normalizes all eight A10k specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10k-'));
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
