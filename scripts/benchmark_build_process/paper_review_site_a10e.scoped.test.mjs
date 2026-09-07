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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const benchmarkIds = ['ClawEval', 'ClemBench', 'ClinicBench', 'ClinicalBench'];
const drawioCli = process.env.IMPORTER_DRAWIO_E2E_CLI
  || join(homedir(), '.agents/skills/drawio/scripts/cli.js');
const normalizer = join(
  root,
  'scripts/benchmark_build_process/normalize_importer_build_process_assets.mjs',
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
    lines.push(`    ${edge.from} ${mermaidArrow(edge)} ${edge.to}`);
  }
  return lines.join('\n');
}

function edgeSpecBlock(spec, from, to) {
  const marker = `  - from: ${from}\n    to: ${to}\n`;
  const start = spec.indexOf(marker);
  assert.notEqual(start, -1, `${from}->${to}`);
  const next = spec.indexOf('\n  - from:', start + marker.length);
  return spec.slice(start, next === -1 ? spec.length : next);
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('keeps all four A10e packages bilingual with identical typed topology', () => {
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

test('keeps Claw-Eval provenance, authoring counts, audit evidence, and score exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ClawEval', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /2604\.06132v3.*d3f02d4.*ca978fd|2604\.06132v3.*d3f02d4.*ca978fd/isu,
    );
    assert.match(nodes.get('original')?.label ?? '', /250.*83\.3%|250.*83\.3%/isu);
    assert.match(
      nodes.get('compatibility')?.label ?? '',
      /50.*OfficeQA 10.*PinchBench 14.*FinanceQA 12.*OneMillion 5.*Video-MME 5.*LongVideo 4|50.*OfficeQA 10.*PinchBench 14.*FinanceQA 12.*OneMillion 5.*Video-MME 5.*LongVideo 4/isu,
    );
    assert.match(
      nodes.get('review_pilot')?.label ?? '',
      /second author.*multiple frontier.*revise.*remove|第二位作者.*多个前沿模型.*修订.*移除/isu,
    );
    assert.match(nodes.get('release')?.label ?? '', /300.*9.*2,?159/isu);
    assert.ok(edges.has('setup->execute:primary'));
    assert.ok(edges.has('execute->trace:primary'));
    assert.ok(edges.has('execute->audit_logs:primary'));
    assert.ok(edges.has('execute->snapshot:primary'));
    assert.match(
      nodes.get('score')?.label ?? '',
      /0\.8.*completion.*0\.2.*robustness.*safety.*0\.75.*Pass@3.*Pass³|0\.8.*完成.*0\.2.*鲁棒.*安全.*0\.75.*Pass@3.*Pass³/isu,
    );
  }
  const clawFiles = [
    join(publicDir, 'benchmarks_detail', 'ClawEval.json'),
    ...['en', 'zh'].flatMap(language => {
      const base = join(publicDir, 'drawio', 'ClawEval', `ClawEval.${language}`);
      return [`${base}.spec.yaml`, `${base}.arch.json`, `${base}.drawio`, `${base}.svg`];
    }),
  ];
  for (const path of clawFiles) {
    const text = readFileSync(path, 'utf8');
    assert.match(text, /Pass³/u, path);
    assert.doesNotMatch(text, /Pass\^3|\\[()]/u, path);
  }
});

test('keeps clembench-2024 scoring and translated parser boundary exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ClemBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(
      nodes.get('evidence_boundary')?.label ?? '',
      /2405\.20859v1.*ba687db.*May 2024|2405\.20859v1.*ba687db.*2024 年 5 月/isu,
    );
    assert.match(
      nodes.get('release_drift')?.label ?? '',
      /adff278.*v3\.0.*later|adff278.*v3\.0.*后续/isu,
    );
    assert.ok(edges.has('evidence_boundary->release_drift:data'));
    assert.match(nodes.get('game_spec')?.label ?? '', /templates.*parsing rules.*game flow|模板.*解析规则.*游戏流程/isu);
    assert.match(nodes.get('instances')?.label ?? '', /new instances.*all games.*pool.*manual|所有游戏.*新实例.*池.*人工/isu);
    assert.match(nodes.get('formal')?.label ?? '', /parsing.*violat.*not played|违反.*解析.*未完成/isu);
    assert.match(nodes.get('quality')?.label ?? '', /main metric.*0.*100.*game|游戏.*主指标.*0.*100/isu);
    assert.match(
      nodes.get('clemscore')?.label ?? '',
      /average.*per game.*across games.*% played.*quality.*product|逐游戏.*跨游戏.*平均.*完成率.*质量.*乘积/isu,
    );
    assert.match(nodes.get('human')?.label ?? '', /10.*15.*exclude.*created|10.*15.*排除.*创建/isu);
    assert.match(
      nodes.get('multilingual')?.label ?? '',
      /reference game.*native.*prompts.*target expressions.*parsing rules.*same game logic|指称游戏.*母语者.*提示.*目标表达.*解析规则.*同一游戏逻辑/isu,
    );
    assert.doesNotMatch(nodes.get('multilingual')?.label ?? '', /same parser|同一解析器/iu);
  }
});

test('keeps ClinicBench six new datasets, prompt selection, and blinded review exact', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ClinicBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence_boundary')?.label ?? '', /2405\.00716v4.*57138be|2405\.00716v4.*57138be/isu);
    assert.match(nodes.get('existing')?.label ?? '', /11 datasets.*5 tasks|11 个数据集.*5 类任务/isu);
    assert.match(nodes.get('decision_data')?.label ?? '', /1,?057.*GPT-4.*expert.*796.*ChatDoctor|1,?057.*GPT-4.*专家.*796.*ChatDoctor/isu);
    assert.match(nodes.get('generation_data')?.label ?? '', /382.*MIMIC-IV.*181.*MIMIC-III|382.*MIMIC-IV.*181.*MIMIC-III/isu);
    assert.match(
      nodes.get('pharmacology_data')?.label ?? '',
      /213.*DrugBank.*Oct.*2023.*Apr.*2024.*GPT-4.*expert|213.*DrugBank.*2023.*10.*2024.*4.*GPT-4.*专家/isu,
    );
    assert.doesNotMatch(nodes.get('pharmacology_data')?.label ?? '', /Drugs\.com|Moderna/iu);
    assert.match(
      nodes.get('interaction_data')?.label ?? '',
      /Moderna.*Drugs\.com.*100.*100|Moderna.*Drugs\.com.*100.*100/isu,
    );
    assert.doesNotMatch(nodes.get('interaction_data')?.label ?? '', /DrugBank|GPT-4|expert|专家/iu);
    assert.match(nodes.get('release')?.label ?? '', /3 scenarios.*11 tasks.*17 datasets.*20,?000|3 个场景.*11 类任务.*17 个数据集.*20,?000/isu);
    assert.match(
      nodes.get('release_drift')?.label ?? '',
      /five.*files.*Referral QA.*absent.*3,?621.*181|5 个.*文件.*Referral QA.*缺失.*3,?621.*181/isu,
    );
    assert.ok(edges.has('release->release_drift:data'));
    assert.match(
      nodes.get('prompt_select')?.label ?? '',
      /three prompts.*100 samples.*LLaMA-2 7B.*13B.*70B.*best|3 套提示.*100 个样本.*LLaMA-2 7B.*13B.*70B.*最佳/isu,
    );
    assert.match(nodes.get('settings')?.label ?? '', /zero-shot.*1.*3.*5-shot.*22.*11.*11|零样本.*1.*3.*5 样本.*22.*11.*11/isu);
    assert.match(nodes.get('human_samples')?.label ?? '', /100 each.*hospitalization.*patient education|住院总结.*患者教育.*各 100/isu);
    assert.match(
      nodes.get('human_review')?.label ?? '',
      /three.*experts.*blind.*GPT-4.*factuality.*completeness.*preference.*safety.*win.*tie|3 位.*专家.*盲评.*GPT-4.*事实.*完整.*偏好.*安全.*胜.*平/isu,
    );
  }
});

test('routes all ClinicBench source branches on side faces without crossing sibling nodes', () => {
  const targets = [
    'existing',
    'decision_data',
    'generation_data',
    'pharmacology_data',
    'interaction_data',
  ];
  for (const language of ['en', 'zh']) {
    const spec = readFileSync(
      join(publicDir, 'drawio', 'ClinicBench', `ClinicBench.${language}.spec.yaml`),
      'utf8',
    );
    const slots = targets.map(target => {
      const block = edgeSpecBlock(spec, 'evidence_boundary', target);
      assert.match(
        block,
        /style:\n\s+exitX: 1\n\s+exitY: (?:0\.25|0\.33|0\.5|0\.66|0\.75)\n\s+entryX: 0\n\s+entryY: 0\.5/u,
        `${language}.${target}`,
      );
      return block.match(/exitY: ([0-9.]+)/u)?.[1];
    });
    assert.equal(new Set(slots).size, targets.length, `${language} shared exit slots`);
  }
});

test('keeps ClinicalBench paper cohort and current-repository drift separate', () => {
  for (const language of ['en', 'zh']) {
    const arch = readArch('ClinicalBench', language);
    const nodes = nodeMap(arch);
    const edges = edgeMap(arch);
    assert.match(nodes.get('evidence_boundary')?.label ?? '', /2411\.06469v2.*e7828b1|2411\.06469v2.*e7828b1/isu);
    assert.match(nodes.get('data')?.label ?? '', /MIMIC-III v1\.4.*MIMIC-IV v2\.2|MIMIC-III v1\.4.*MIMIC-IV v2\.2/isu);
    assert.match(nodes.get('release_drift')?.label ?? '', /README.*MIMIC-IV 3\.0.*paper.*2\.2|README.*MIMIC-IV 3\.0.*论文.*2\.2/isu);
    assert.ok(edges.has('evidence_boundary->release_drift:data'));
    assert.notEqual(nodes.get('balance')?.type, 'decision');
    assert.match(nodes.get('balance')?.label ?? '', /under-sampl.*training.*validation.*test unchanged|欠采样.*训练.*验证.*测试.*不变/isu);
    assert.match(nodes.get('llms')?.label ?? '', /22.*open-source.*14.*8.*data-use policy|22.*开源.*14.*8.*数据政策/isu);
    assert.match(nodes.get('prompt')?.label ?? '', /chain-of-thought.*self-reflection.*role-playing.*in-context|思维链.*自我反思.*角色扮演.*上下文/isu);
    assert.match(nodes.get('finetune')?.label ?? '', /LoRA Full.*Last Layer.*20 epochs.*validation|LoRA Full.*Last Layer.*20.*验证/isu);
    assert.match(nodes.get('metrics')?.label ?? '', /length.*Macro F1.*AUROC.*mortality.*readmission.*F1.*AUROC|住院时长.*Macro F1.*AUROC.*死亡.*再入院.*F1.*AUROC/isu);
    assert.match(nodes.get('report')?.label ?? '', /five runs.*95%.*confusion.*loss|五次运行.*95%.*混淆.*损失/isu);
  }
});

test('pins A10e paper and official-source revisions in detail records', () => {
  const expected = {
    ClawEval: [
      /2604\.06132v3/u,
      /§§3\.1.*3\.3.*Appendices B.*E/isu,
      /d3f02d4938ab0832377d90535013def2b1a2fdc0/u,
      /ca978fd82edb77d52f26f4ccf3f9684a8df84341/u,
    ],
    ClemBench: [
      /2405\.20859v1/u,
      /§§2[–-]7/u,
      /ba687db8479b01d67c6c48116b810c72685154f4/u,
      /adff278de1cf1cbc30a93f3000347b102cdfc0c5.*v3\.0.*later|v3\.0.*later.*adff278de1cf1cbc30a93f3000347b102cdfc0c5/isu,
    ],
    ClinicBench: [
      /2405\.00716v4/u,
      /Table 1.*§§3.*4\.5/isu,
      /57138be8a73f09bef8980f849789baf57570c5cf/u,
      /Referral QA.*absent.*3,?621.*181|Referral QA.*缺失.*3,?621.*181/isu,
    ],
    ClinicalBench: [
      /2411\.06469v2/u,
      /§2.*§§3.*5.*Appendices A.*D/isu,
      /e7828b15dbee1275518547db698abfff35e79f7a/u,
      /MIMIC-IV v2\.2.*README.*3\.0|MIMIC-IV v2\.2.*README.*3\.0/isu,
    ],
  };
  for (const [id, [paper, ...notes]] of Object.entries(expected)) {
    const detail = readDetail(id);
    assert.match(detail.paper_url, paper, `${id} paper`);
    for (const pattern of notes) {
      assert.match(detail.drawio_review_note, pattern, `${id} locator`);
    }
  }

  const clinic = readDetail('ClinicBench');
  assert.doesNotMatch(clinic.build_method_en, /six new datasets.*GPT-4.*expert/iu);
  assert.doesNotMatch(clinic.build_method, /6 个.*专家复核/u);
  assert.match(
    clinic.build_method_en,
    /Referral QA.*Pharmacology QA.*GPT-4.*expert.*Treatment.*ChatDoctor.*Hospitalization.*Patient Education.*MIMIC.*Drug Interaction.*Drugs\.com.*Moderna/isu,
  );
  assert.match(
    clinic.drawio_review_note,
    /Referral QA.*MIMIC-IV.*GPT-4.*expert.*Treatment.*ChatDoctor.*Hospitalization.*MIMIC-IV.*Patient Education.*MIMIC-III.*Pharmacology QA.*DrugBank.*GPT-4.*expert.*Drug Interaction.*Moderna.*Drugs\.com/isu,
  );

  const clinical = readDetail('ClinicalBench');
  const effectivePdfUrl = clinical.pdf_cdn_url || clinical.arxiv_pdf_url;
  assert.match(effectivePdfUrl, /\/2411\.06469v2(?:\.pdf)?$/u);
});

test('keeps every A10e detail fallback synchronized with reviewed architecture', () => {
  for (const id of benchmarkIds) {
    const detail = readDetail(id);
    assert.equal(detail.mermaid_flowchart, detail.flowchart_en, `${id} generic fallback`);
    for (const language of ['en', 'zh']) {
      const arch = readArch(id, language);
      const fallback = detail[`flowchart_${language}`];
      assert.equal(fallback, renderFallback(arch), `${id}.${language} full fallback`);
    }
  }
});

test('publishes native fixed-light SVG and readable PNG pairs for A10e', () => {
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

test('strictly rebuilds and normalizes all eight A10e specs without byte drift', {
  skip: existsSync(drawioCli) ? false : 'Draw.io build CLI is not installed',
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'paper-review-site-a10e-'));
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
