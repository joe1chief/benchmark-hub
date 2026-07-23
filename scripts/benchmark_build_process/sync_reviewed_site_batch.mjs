#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'client/public');
const manifestPath = join(publicDir, 'benchmarks_build_process_manifest.json');
const catalogPath = join(publicDir, 'benchmarks.json');

const specialRecords = {
  ChartQAPro: {
    construction_node_ids: [
      'sources', 'search', 'vit_filter', 'pool', 'web_select', 'other_sources', 'charts',
      'seed', 'types', 'vlm', 'refine', 'review', 'consensus', 'release',
    ],
    evaluation_node_ids: ['inference', 'exact', 'numeric', 'text', 'report'],
  },
  'Chatbot_Arena': {
    construction_node_ids: [
      'user', 'pair', 'battle', 'vote', 'content_filter', 'safety_flag', 'snapshot',
    ],
    evaluation_node_ids: [
      'win_matrix', 'bt', 'intervals', 'leaderboard',
      'topic_model', 'diversity', 'experts', 'anomaly',
    ],
  },
  CheXBench: {
    construction_node_ids: [
      'taxonomy', 'sources', 'engineering', 'split', 'instruct',
      'axes', 'perception', 'reasoning', 'generation',
    ],
    evaluation_node_ids: [
      'train', 'inputs', 'models', 'metrics', 'report', 'reader', 'reader_report',
    ],
  },
  CheXGenBench: {
    construction_node_ids: [
      'models', 'model_route', 'domain_models', 'training', 'data', 'generate',
    ],
    evaluation_node_ids: [
      'fidelity', 'privacy', 'classification', 'segmentation', 'rrg', 'scorecard',
    ],
  },
  BBEH: {
    source_type: 'paper_and_official_repository',
    construction_node_ids: [
      'bbh_audit',
      'skill_map',
      'harder_tasks',
      'candidates',
      'ref_models',
      'difficulty_gate',
      'harden',
      'full_set',
      'mini',
    ],
    evaluation_node_ids: [
      'prompt',
      'extract',
      'task_accuracy',
      'harmonic',
      'micro',
      'report',
    ],
  },
  'BIG-Bench_Hard': {
    source_type: 'paper_and_official_repository',
    construction_node_ids: [
      'bigbench',
      'structure_filter',
      'baseline_filter',
      'hardness_filter',
      'dataset',
      'examples',
      'human_cot',
    ],
    evaluation_node_ids: [
      'answer_only',
      'cot_prompt',
      'decode',
      'extract',
      'score',
      'report',
    ],
  },
  BigOBench: {
    evaluation_steps_en: [
      'Task 1 draws 20 outputs and reports class accuracy plus unbiased Pass@k, Best@k, and All@k estimators',
      'Task 2 runs 20 constrained code-generation attempts',
      'Task 3 runs 20 attempts, selects the best coefficient among correct target-class solutions, assigns zero when none is correct, and compares the human percentile',
    ],
    evaluation_steps_zh: [
      '任务 1 采样 20 个输出，报告类别准确率及无偏 Pass@k、Best@k、All@k 估计',
      '任务 2 运行 20 次受约束代码生成',
      '任务 3 运行 20 次；在正确且属于目标复杂度类别的解中取最佳系数，无正确解时记 0，并比较人工百分位',
    ],
  },
  BackendBench: {
    evaluation_steps_en: [
      'Choose exactly one --suite and run only its local correctness or performance records',
      'For TorchBench, pair suite-local correctness and performance entries by the same test index',
      'Report the all-tests correctness rate, an ungated geometric-mean speedup with failed implementations set to 1x, and correctness-gated Perf@p without cross-suite aggregation',
    ],
    evaluation_steps_zh: [
      '每次仅选择一个 --suite，并只运行该 suite 的局部正确性或性能记录',
      '在 TorchBench 内按同一测试索引配对 suite 局部 correctness 与 performance 记录',
      '报告全测试正确率、失败实现按 1x 计的非正确性门控几何平均加速，以及仅 Perf@p 使用的正确性门控；不跨 suite 聚合',
    ],
  },
  CIMemories: {
    construction_steps_en: [
      'Generate synthetic identities, life events, memory attributes, and statements',
      'Pair profiles with 49 goal-recipient contexts and sample GPT-5 labels under Westin privacy personas',
      'Mix persona distributions with priors, retain zero-entropy labels, and drop contexts missing either necessary or inappropriate examples',
      'Keep the pinned 71,883-row public prompt artifact as a separate raw-provenance branch because its labels are blank or null',
    ],
    construction_steps_zh: [
      '生成合成身份、生活事件、记忆属性与陈述',
      '将画像与 49 个目标—接收者情境配对，并在 Westin 隐私人格下采样 GPT-5 标签',
      '把人格分布与先验混合，仅保留零熵标签，并删除缺少必要或不当样本任一类型的情境',
      '将固定版本的 71,883 行公开提示资产保留为独立原始来源分支，因为其标签为空白或 null',
    ],
  },
  OCRBench: {
    construction_node_ids: [
      'study_sources',
      'artifact_gate',
      'semantic_controls',
      'broad_filter',
      'broad_study',
      'compact_contract',
      'component_gate',
      'recognition',
      'scene_vqa',
      'doc_vqa',
      'kie',
      'hmer',
      'prompting',
      'verify',
      'release',
    ],
    evaluation_node_ids: ['infer', 'normalize', 'containment', 'score', 'source_boundary'],
  },
  OCRBench_v2: {
    construction_node_ids: [
      'scope',
      'collect',
      'taxonomy',
      'guidelines',
      'release_gate',
      'annotate',
      'review',
      'public',
      'private_collect',
      'private_annotate',
    ],
    evaluation_node_ids: [
      'evaluate',
      'metric_gate',
      'structured_metrics',
      'spatial_reading_metrics',
      'count_vqa_metrics',
      'task_means',
      'language_gate',
      'en_macro',
      'cn_macro',
      'report',
      'source_boundary',
    ],
  },
  ODVBench: {
    construction_node_ids: [
      'scope', 'source_sets', 'video_select', 'annotation_gate', 'direct_convert',
      'coarse_generate', 'human_verify', 'verified_meta', 'taxonomy', 'tasks',
      'templates', 'options', 'option_handling', 'qa_review', 'sample', 'paper_release', 'released_data',
    ],
    evaluation_node_ids: ['stream_contract', 'decode', 'code_score', 'paper_report', 'source_boundary'],
  },
  OIBench: {
    construction_node_ids: [
      'scope', 'coaches', 'originality', 'difficulty', 'tests', 'canonical',
      'review', 'translation', 'search_audit', 'paper_release',
    ],
    evaluation_node_ids: [
      'prompt', 'decode', 'runtime', 'judge', 'ac_score', 'efficiency',
      'report', 'separate_tracks', 'source_boundary',
    ],
  },
  'OK-VQA': {
    construction_node_ids: [
      'coco', 'question_round', 'answer_round', 'candidate_pool', 'manual_review',
      'knowledge_gate', 'reject_quality', 'bias_filter', 'bias_gate', 'reject_bias',
      'agreement_gate', 'reject_disagreement', 'final_split', 'category_annotation', 'release',
    ],
    evaluation_node_ids: ['model_answer', 'paper_normalization', 'vqa_score', 'report', 'source_boundary'],
  },
  OPQA: {
    construction_node_ids: [
      'internal_bottlenecks', 'criterion', 'tasks', 'container', 'undisclosed_construction',
    ],
    evaluation_node_ids: [
      'diagnose', 'solution', 'grade', 'report', 'undisclosed_grading', 'source_boundary',
    ],
  },
  'OR-Bench': {
    construction_node_ids: [
      'evidence', 'categories', 'seeds', 'dedupe', 'rewrite', 'moderate', 'vote',
      'flagged_response', 'response_moderate', 'recovery_gate', 'benign_pool',
      'toxic_pool', 'hard_select', 'moderator_validation', 'expert_audit', 'public_snapshot',
    ],
    evaluation_node_ids: ['eval_models', 'judge', 'report', 'source_boundary'],
  },
  OSWorld: {
    construction_node_ids: [
      'evidence', 'sources', 'select', 'cross_check', 'annotation', 'setup',
      'evaluator', 'self_test', 'quality_control', 'release', 'effort',
    ],
    evaluation_node_ids: [
      'initialize', 'observe', 'interact', 'execute_eval', 'report',
      'maintenance_boundary', 'source_boundary',
    ],
  },
  'OSWorld-G': {
    construction_node_ids: [
      'evidence', 'failures', 'screenshots', 'expert', 'boxes', 'real_test',
      'verify', 'enrich', 'release',
    ],
    evaluation_node_ids: [
      'variant_gate', 'original', 'refined', 'predict', 'normalize', 'target_gate',
      'spatial', 'refusal', 'report', 'snapshot_boundary', 'source_boundary',
    ],
  },
  'OSWorld-Verified': {
    construction_node_ids: [
      'evidence', 'baseline', 'feedback', 'validate', 'policy', 'issue_gate',
      'web', 'instructions', 'evaluators', 'stability', 'fixed_suite', 'release',
    ],
    evaluation_node_ids: [
      'aws', 'platform', 'calibrate', 'execute', 'report', 'version_boundary',
      'source_boundary',
    ],
  },
  OVBench: {
    construction_node_ids: [
      'evidence', 'contexts', 'taxonomy', 'source_count', 'val_test', 'existing_labels',
      'qa_templates', 'options', 'manual_qc', 'trim_sampling', 'hf_release', 'repo_embedded',
    ],
    evaluation_node_ids: [
      'eval_gate', 'sliding', 'streaming', 'predict', 'paper_scoring', 'repo_harness',
      'artifact_boundary', 'drift',
    ],
  },
  OVOBench: {
    construction_node_ids: [
      'evidence', 'taxonomy', 'task_split', 'sources', 'source_map', 'meta_gate',
      'existing_meta', 'semi_auto', 'human_meta', 'refine', 'qa_generation', 'options',
      'manual_qc', 'paper_release', 'current_release', 'license_boundary',
    ],
    evaluation_node_ids: [
      'eval_gate', 'bt_rt', 'forward_dense', 'paper_metric', 'paper_report',
      'current_scorer', 'current_report', 'drift',
    ],
  },
  OfficeQA: {
    review_note_replacements: [{
      from: 'Sections 2.1–2.4, Appendix A, and Appendix E',
      to: 'Sections 2.1–2.4, Appendix B, and Appendix E',
    }],
    construction_node_ids: [
      'scope', 'corpus', 'prepare', 'criteria', 'seed', 'scale', 'topical',
      'reproduce', 'reproduce_gate', 'adjudicate', 'qa_rounds', 'parametric_filter',
      'retained', 'difficulty_gate', 'easy', 'pro', 'release',
    ],
    evaluation_node_ids: [
      'eval_input', 'eval_setting', 'answer_contract', 'paper_score', 'fixed_reward',
      'report', 'source_boundary',
    ],
  },
  OfficeQA_Pro: {
    review_note_replacements: [
      {
        from: 'Sections 2.1–2.4, Appendix A, and Appendix E',
        to: 'Sections 2.1–2.4, Appendix B, and Appendix E',
      },
      {
        from: 'Appendix E reports that 11% require three or more bulletins, 22% require the web, 3% are visual, and 62% require analysis beyond basic arithmetic.',
        to: 'Section 2.2 reports that 11% require three or more bulletins, 22% require the web, 3% are visual, and 62% require analysis beyond basic arithmetic.',
      },
    ],
    construction_node_ids: [
      'scope', 'corpus', 'prepare', 'criteria', 'seed', 'scale', 'topical',
      'reproduce', 'reproduce_gate', 'adjudicate', 'qa_rounds', 'parametric_filter',
      'retained', 'difficulty_gate', 'easy', 'pro', 'release',
    ],
    evaluation_node_ids: [
      'eval_input', 'eval_setting', 'answer_contract', 'paper_score', 'fixed_reward',
      'report', 'source_boundary',
    ],
  },
  OlmoBaseEval: {
    construction_node_ids: [
      'evidence', 'objective', 'candidate_tasks', 'score_pool', 'rank_similarity', 'task_clusters',
      'scaling', 'base_easy', 'base_main', 'snr', 'refine', 'new_benchmarks',
      'heldout', 'release_count',
    ],
    evaluation_node_ids: ['paper_eval', 'repo_drift', 'report'],
  },
  OlympiadBench: {
    construction_node_ids: [
      'evidence', 'scope', 'sources', 'source_select', 'ocr', 'verify', 'structure',
      'dedupe', 'annotate', 'progressive', 'answer_types', 'release',
    ],
    evaluation_node_ids: [
      'prompt', 'eval_gate', 'open_eval', 'proof_eval', 'extract', 'score',
      'denominator', 'report', 'source_boundary',
    ],
  },
  OlympicArena: {
    construction_node_ids: [
      'evidence', 'scope', 'collect', 'convert', 'extract', 'checks', 'review',
      'dedupe', 'difficulty', 'abilities', 'split_gate', 'ot', 'val', 'test', 'release',
    ],
    evaluation_node_ids: [
      'paper_settings', 'prompt', 'eval_gate', 'rule_eval', 'code_eval', 'model_eval',
      'process_eval', 'report', 'source_boundary',
    ],
  },
  OmniBench: {
    construction_node_ids: [
      'evidence', 'scope', 'taxonomy', 'sources', 'team', 'author', 'constraints',
      'rationales', 'human_qc', 'model_qc', 'gate', 'revise', 'discard', 'release',
      'publication',
    ],
    evaluation_node_ids: [
      'eval_gate', 'full', 'ablation', 'textual', 'human', 'prompt', 'parser',
      'report', 'code_boundary', 'license_boundary',
    ],
  },
  OmniDocBench: {
    construction_node_ids: [
      'evidence', 'paper_scope', 'sources', 'cluster', 'candidates', 'attributes',
      'balance', 'preannotate', 'layout', 'relations', 'content', 'human', 'qc',
      'paper_release', 'published_snapshot',
    ],
    evaluation_node_ids: [
      'normalize', 'extract', 'match', 'ignore', 'task_gate', 'recognition_metrics',
      'formula_order_metrics', 'detection_metrics', 'report', 'drift_boundary',
      'license_boundary',
    ],
  },
  OmniMedVQA: {
    construction_node_ids: [
      'evidence', 'scope', 'inventory', 'coverage', 'templates', 'balance', 'types',
      'rewrite', 'options', 'qc', 'paper_release', 'hf_package',
    ],
    evaluation_node_ids: [
      'eval_scope', 'prompt', 'score_gate', 'qa_score', 'prefix_score',
      'ground_truth', 'report', 'access_boundary', 'snapshot_boundary', 'code_boundary',
    ],
  },
  'OneIG-Bench': {
    construction_node_ids: [
      'evidence', 'scope', 'sources', 'cluster', 'dedupe', 'rewrite', 'review',
      'bilingual', 'release',
    ],
    evaluation_node_ids: [
      'code_boundary', 'generate', 'alignment', 'text', 'reasoning', 'style',
      'diversity', 'report', 'license_boundary',
    ],
  },
  'OneMillion-Bench': {
    construction_node_ids: [
      'evidence', 'scope', 'task', 'adversarial', 'peer', 'consensus', 'third',
      'difficulty', 'rubrics', 'release', 'release_boundary',
    ],
    evaluation_node_ids: [
      'systems', 'judge', 'expert_score', 'pass_rate', 'aggregate', 'economic', 'drift',
    ],
  },
  OpenMathReasoning: {
    construction_node_ids: [
      'evidence', 'source', 'extract', 'classify', 'filter', 'transform', 'decontam',
      'paper_scope', 'release_scope', 'cot_generate', 'cot_filter', 'cot_release',
      'tir_seed', 'tir_iterate', 'genselect', 'release',
    ],
    evaluation_node_ids: [
      'train_models', 'eval_suite', 'sample64', 'aggregate', 'report',
      'count_boundary', 'license_boundary', 'role_boundary',
    ],
  },
  OpenRCA: {
    construction_node_ids: [
      'evidence', 'raw', 'select', 'records', 'balance', 'standardize', 'calibrate',
      'filter', 'dataset', 'goals', 'spec', 'synthesize', 'verify',
    ],
    evaluation_node_ids: [
      'query', 'run_gate', 'balanced', 'oracle', 'agent', 'parse', 'element_score',
      'strict', 'report', 'version_boundary', 'access_boundary', 'license_boundary',
      'implementation_boundary',
    ],
  },
  'OpenAI-Proof_Q&A': {
    construction_node_ids: [
      'source_evidence', 'scope', 'threshold', 'curate', 'construction_boundary',
    ],
    evaluation_node_ids: [
      'container', 'run', 'diagnose', 'answer', 'grade', 'report',
      'grading_boundary', 'openness_boundary',
    ],
  },
  OpenAudioBench: {
    construction_node_ids: [
      'source_evidence', 'goal', 'reasoning', 'llama', 'web', 'trivia', 'alpaca',
      'speech', 'release', 'release_boundary', 'openness_boundary',
    ],
    evaluation_node_ids: [
      'st', 'ss', 'normalize', 'judge_ref', 'judge_open', 'report', 'drift_boundary',
    ],
  },
  OpenSkillEval: {
    construction_node_ids: [
      'source_evidence', 'families', 'sources', 'snapshot', 'generate', 'task_spec',
      'instruction', 'verify', 'cases', 'skill_sources', 'skill_filter', 'variants',
      'release_boundary',
    ],
    evaluation_node_ids: [
      'runner', 'outputs', 'trajectory_eval', 'artifact_eval', 'human_validation',
      'report', 'runtime_boundary',
    ],
  },
  'P-MMEval': {
    construction_node_ids: [
      'source_evidence', 'language_scope', 'fundamental', 'specialized',
      'fundamental_sampling', 'specialized_sampling', 'translate', 'review', 'align',
      'release', 'family_boundary', 'release_boundary',
    ],
    evaluation_node_ids: [
      'prompt_sources', 'prompt_settings', 'answer_policy', 'metrics', 'cacr', 'report',
      'inference_boundary',
    ],
  },
  'PACE-Bench': {
    construction_node_ids: [
      'evidence', 'targets', 'sources', 'matrices', 'protocol_gate', 'loocv',
      'global_basis', 'code_boundary', 'signals', 'selection_gate', 'local', 'global',
      'union', 'embeddings', 'bootstrap', 'fit_all', 'hf_release', 'release_boundary',
      'content_boundary', 'license_boundary',
    ],
    evaluation_node_ids: [
      'goal_gate', 'absolute', 'pairwise', 'ensemble', 'report',
    ],
  },
  PHYBench: {
    construction_node_ids: [
      'evidence', 'scope', 'contributors', 'formulation', 'constraints',
      'question_bank', 'expert_review', 'llm_aids', 'reviewer_library', 'human_review',
      'retain', 'dataset', 'data_boundary', 'code_boundary',
    ],
    evaluation_node_ids: [
      'prompt', 'boxed', 'normalize', 'metric_gate', 'accuracy', 'eed_tree',
      'eed_distance', 'eed_score', 'report', 'human_baseline',
    ],
  },
  'PIRA-Bench': {
    construction_node_ids: [
      'source_evidence', 'collect', 'preserve', 'noise', 'profiles', 'scenario_scope',
      'direct', 'profile_dependent', 'pure_noise', 'annotate', 'consensus', 'release',
      'wording_boundary', 'release_boundary', 'openness_boundary',
    ],
    evaluation_node_ids: [
      'predict', 'judge', 'positive_score', 'negative_score', 'final_score',
      'evaluation_boundary',
    ],
  },
  'PMC-VQA': {
    construction_node_ids: [
      'source_evidence', 'pmc_oa', 'subset', 'generate', 'clean', 'cross_half',
      'text_only', 'language_filter', 'manual_labels', 'classifier', 'final_dataset',
      'initial_test', 'verified_test', 'release_snapshot', 'release_drift',
      'license_boundary',
    ],
    evaluation_node_ids: [
      'choice', 'blanking', 'acc_parser', 'bleu', 'report', 'metric_boundary',
    ],
  },
  PRDBench: {
    construction_node_ids: [
      'source_evidence', 'seed_sources', 'eligibility', 'domain_sampling',
      'prd_initialization', 'aaa_outline', 'scaffold', 'criteria_scheme',
      'human_inspection', 'repair_loop', 'inclusion_gate', 'remove_scaffold',
      'benchmark_release', 'judge_candidates', 'human_labels', 'exact_match_filter',
      'tool_filter', 'finetune_prdjudge', 'count_boundary', 'code_boundary',
      'model_boundary',
    ],
    evaluation_node_ids: [
      'development_round', 'judge_inputs', 'test_type_gate', 'unit_test',
      'shell_interaction', 'file_comparison', 'metric_report', 'debug_round',
      'final_score',
    ],
  },
  PaperBench: {
    construction_node_ids: [
      'source_evidence', 'icml_pool', 'automated_filters', 'dependency_filters',
      'author_outreach', 'engineer_draft', 'rubric_tree', 'leaf_design',
      'author_verification', 'addenda', 'task_release', 'candidate_boundary',
      'release_boundary', 'release_fix_boundary',
    ],
    evaluation_node_ids: [
      'agent_rollout', 'submission', 'clean_reproduction', 'executed_submission',
      'requirement_gate', 'code_development', 'execution', 'result_match',
      'simplejudge', 'binary_leaf', 'weighted_rollup', 'final_metric',
      'judgeeval_examples', 'evaluate_judges', 'judgeeval_result',
      'code_dev_boundary',
    ],
  },
  PaperQA: {
    construction_node_ids: [
      'source_evidence', 'coverage_gap', 'paper_sources', 'author_questions',
      'independent_review', 'agreement', 'consensus', 'metadata', 'paper_scope',
      'fixed_release', 'split_policy', 'release_boundary', 'license_boundary',
    ],
    evaluation_node_ids: [
      'response_generation', 'extraction_gate', 'direct_extract', 'llm_extract',
      'normalize', 'report', 'extractor_boundary',
    ],
  },
  'Pare-Bench': {
    construction_node_ids: [
      'source_evidence', 'extend_are', 'app_scope', 'fsm_model', 'asymmetry',
      'scenario_schema', 'generation_agent', 'description', 'uniqueness',
      'app_state', 'event_flow', 'validation', 'oracle_run', 'human_review',
      'retry_router', 'release', 'generator_boundary', 'app_boundary',
      'release_boundary',
    ],
    evaluation_node_ids: [
      'eval_config', 'user_sim', 'observe', 'interaction_gate', 'execute',
      'final_oracle', 'robustness', 'metrics', 'metric_boundary',
    ],
  },
  PathVQA: {
    construction_node_ids: [
      'source_evidence', 'clinical_gap', 'textbook_sources', 'pdf_extract',
      'caption_match', 'peir_source', 'peir_crawl', 'clean_pairs', 'corenlp',
      'simplify', 'question_transducer', 'yesno_generation', 'negative_generation',
      'open_generation', 'merge_qa', 'manual_review', 'paper_scope', 'paper_split',
      'release_boundary', 'mirror_boundary', 'copyright_boundary',
    ],
    evaluation_node_ids: [
      'vqa_models', 'metric_gate', 'binary_metrics', 'open_metrics', 'report',
      'prompt_boundary',
    ],
  },
  PawBench: {
    construction_node_ids: [
      'source_evidence', 'coeval_unit', 'reuse_sources', 'normalize_tasks',
      'task_contract', 'taxonomy', 'fixed_release', 'harness_versions',
      'no_paper_boundary', 'release_boundary', 'license_boundary',
      'baseline_boundary',
    ],
    evaluation_node_ids: [
      'model_harness_grid', 'prepare_workspace', 'execute_agent',
      'collect_evidence', 'grading_gate', 'automated_grade', 'llm_grade',
      'hybrid_grade', 'normalize_score', 'aggregate', 'slices', 'diagnose',
      'prompt_boundary', 'compatibility_boundary', 'judge_boundary',
    ],
  },
  PersonQA: {
    construction_node_ids: [
      'source_evidence', 'disclosure_scope', 'task_definition', 'category_scope',
      'internal_set', 'construction_boundary', 'release_boundary',
    ],
    evaluation_node_ids: [
      'model_snapshot', 'model_response', 'attempted_scope', 'accuracy',
      'hallucination', 'report', 'freshness_audit', 'claim_tradeoff',
      'evaluation_boundary',
    ],
  },
  PopQA: {
    construction_node_ids: [
      'source_evidence', 'factual_scope', 'relations', 'weighted_sampling',
      'relation_cap', 'template_authoring', 'question_instantiation',
      'answer_closure', 'pageviews', 'fixed_release', 'release_boundary',
    ],
    evaluation_node_ids: [
      'prompt_config', 'memory_gate', 'vanilla', 'retrieval', 'generate',
      'code_scorer', 'report', 'adaptive_split', 'threshold', 'adaptive_gate',
      'adaptive_report', 'prompt_boundary', 'scorer_boundary',
      'adaptive_boundary',
    ],
  },
  PreScience: {
    construction_node_ids: [
      'source_evidence', 'paper_scope', 'target_window', 'companion_graph',
      'reference_filter', 'author_resolution', 'temporal_metadata', 'topic_labeling',
      'paper_dataset', 'rebuild_boundary', 'release_drift', 'license_boundary',
    ],
    evaluation_node_ids: [
      'task_families', 'contribution_task', 'ranking_tasks', 'citation_task',
      'topic_tasks', 'task_metrics', 'corpus_rollout', 'rollout_eval', 'findings',
      'code_drift', 'prompt_parser_boundary',
    ],
  },
  PreciseWikiQA: {
    construction_node_ids: [
      'source_evidence', 'benchmark_scope', 'goodwiki_release', 'wikirank_join',
      'difficulty_bins', 'page_sampling', 'section_sampling', 'question_generation',
      'answer_generation', 'quality_gate', 'dynamic_set', 'gold_audit',
      'data_boundary', 'regeneration_drift', 'license_boundary',
    ],
    evaluation_node_ids: [
      'inference_config', 'model_response', 'abstention_judge',
      'correctness_judge', 'score_metrics', 'runner_boundary',
      'judge_parser_drift',
    ],
  },
  ProcBench: {
    construction_node_ids: [
      'source_evidence', 'design_goal', 'task_criteria', 'task_families',
      'fixed_templates', 'step_schedule', 'task_generator', 'length_gate',
      'ground_truth', 'benchmark_release', 'length_splits', 'release_boundary',
      'review_boundary',
    ],
    evaluation_node_ids: [
      'model_prompt', 'raw_response', 'extraction_schema', 'gpt4o_parser',
      'parse_outcome', 'exact_comparison', 'prefix_match_length',
      'prefix_accuracy', 'sequential_match', 'final_match', 'aggregate_report',
      'parser_boundary',
    ],
  },
  ProgramBench: {
    construction_node_ids: [
      'source_evidence', 'candidate_repositories', 'collection_agent', 'gold_build',
      'behavior_sources', 'generate_tests', 'coverage_loop', 'assertion_linter',
      'validation_gate', 'sanitize_documentation', 'cleanroom_image',
      'paper_release', 'release_drift_boundary', 'license_boundary',
      'construction_boundary',
    ],
    evaluation_node_ids: [
      'candidate_inputs', 'policy_prompt', 'agent_run', 'submission',
      'clean_eval_image', 'compile_submission', 'branch_selection',
      'hidden_pytest', 'junit_parser', 'ignored_test_filter', 'instance_score',
      'cheating_review', 'headline_metrics', 'prompt_boundary', 'cheating_boundary',
    ],
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const args = { batch: '', reviewedAt: '', ids: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === '--batch' && value) {
      args.batch = value;
      index += 1;
    } else if (option === '--reviewed-at' && value) {
      args.reviewedAt = value;
      index += 1;
    } else if (option === '--ids' && value) {
      args.ids = value.split(',').map(id => id.trim()).filter(Boolean);
      index += 1;
    } else {
      throw new Error(`Unexpected or incomplete argument: ${option}`);
    }
  }
  if (!args.batch) throw new Error('--batch is required');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(args.reviewedAt)) {
    throw new Error('--reviewed-at must use YYYY-MM-DD');
  }
  if (args.ids.length === 0 || new Set(args.ids).size !== args.ids.length) {
    throw new Error('--ids must contain a non-empty unique comma-separated list');
  }
  return args;
}

function readMetaDescription(specPath) {
  const source = readFileSync(specPath, 'utf8');
  if (/^\s*\{/u.test(source)) {
    const description = JSON.parse(source)?.meta?.description;
    if (typeof description !== 'string' || !description.trim()) {
      throw new Error(`${specPath}: missing meta.description`);
    }
    return description.replace(/\s+/gu, ' ').trim();
  }

  const lines = source.split(/\r?\n/u);
  const index = lines.findIndex(line => line.startsWith('  description:'));
  if (index < 0) throw new Error(`${specPath}: missing meta.description`);
  const inline = lines[index].slice('  description:'.length).trim();
  if (!/^[>|][-+]?$/u.test(inline)) return inline.replace(/^['"]|['"]$/gu, '');
  const parts = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line && !/^\s{4,}/u.test(line)) break;
    parts.push(line.trim());
  }
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  if (buffer.subarray(1, 4).toString('ascii') !== 'PNG') {
    throw new Error(`${path}: invalid PNG signature`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function svgDimensions(path) {
  const svg = readFileSync(path, 'utf8');
  const viewBox = svg.match(/\bviewBox="([^"]+)"/u)?.[1]
    ?.trim().split(/\s+/u).map(Number);
  if (viewBox?.length !== 4 || !viewBox.every(Number.isFinite)) {
    throw new Error(`${path}: invalid SVG viewBox`);
  }
  if (!/<text\b/u.test(svg) || /<foreignObject\b|data:image\/|light-dark\s*\(|prefers-color-scheme/u.test(svg)) {
    throw new Error(`${path}: SVG is not native-text fixed-light output`);
  }
  return { width: viewBox[2], height: viewBox[3] };
}

function assetPaths(id) {
  return {
    drawio_flowchart_en: `drawio/${id}/${id}.en.svg`,
    drawio_flowchart_zh: `drawio/${id}/${id}.zh.svg`,
    drawio_source_en: `drawio/${id}/${id}.en.drawio`,
    drawio_source_zh: `drawio/${id}/${id}.zh.drawio`,
    drawio_spec_en: `drawio/${id}/${id}.en.spec.yaml`,
    drawio_spec_zh: `drawio/${id}/${id}.zh.spec.yaml`,
    drawio_arch_en: `drawio/${id}/${id}.en.arch.json`,
    drawio_arch_zh: `drawio/${id}/${id}.zh.arch.json`,
  };
}

function normalizedTopology(arch) {
  return {
    nodes: arch.nodes.map(({ id, type }) => ({ id, type })),
    edges: arch.edges.map(({ from, to, type }) => ({ from, to, type })),
  };
}

function assertBundle(id) {
  const baseDir = join(publicDir, 'drawio', id);
  const dimensions = { png: {}, svg: {} };
  const arches = {};
  for (const language of ['en', 'zh']) {
    const base = join(baseDir, `${id}.${language}`);
    for (const extension of ['spec.yaml', 'arch.json', 'drawio', 'svg', 'png']) {
      if (!existsSync(`${base}.${extension}`)) {
        throw new Error(`${id}.${language}: missing ${extension}`);
      }
    }
    const drawio = readFileSync(`${base}.drawio`, 'utf8');
    if (!/html=0/u.test(drawio) || !/convertToSvg=1/u.test(drawio) || /html=1|math="1"/u.test(drawio)) {
      throw new Error(`${id}.${language}: Draw.io source is not native-text fixed-light output`);
    }
    arches[language] = readJson(`${base}.arch.json`);
    dimensions.png[language] = pngDimensions(`${base}.png`);
    dimensions.svg[language] = svgDimensions(`${base}.svg`);
  }
  if (JSON.stringify(normalizedTopology(arches.en)) !== JSON.stringify(normalizedTopology(arches.zh))) {
    throw new Error(`${id}: English and Chinese topology differ`);
  }
  return { dimensions, arches };
}

function withFormalPublicationEvidence(note, batch, dimensions) {
  const marker = 'Formal publication evidence';
  const generatedEvidence = /\s+Formal publication evidence \[[^\]]+\]: normalized Draw\.io and architecture sidecars plus native fixed-light SVG\/PNG pairs were regenerated from the checked-in bilingual specs\. Final PNG dimensions are \d+×\d+ \(English\) and \d+×\d+ \(Chinese\); SVG viewBoxes are \d+×\d+ and \d+×\d+\. The final exports were inspected without clipping, node overlap, connector-node crossing, fallback text, or adaptive colors\.$/u;
  const prior = String(note || '')
    .replace(generatedEvidence, '')
    .trim();
  const png = dimensions.png;
  const svg = dimensions.svg;
  const evidence = `${marker} [${batch}]: normalized Draw.io and architecture sidecars plus native fixed-light SVG/PNG pairs were regenerated from the checked-in bilingual specs. Final PNG dimensions are ${png.en.width}×${png.en.height} (English) and ${png.zh.width}×${png.zh.height} (Chinese); SVG viewBoxes are ${svg.en.width}×${svg.en.height} and ${svg.zh.width}×${svg.zh.height}. The final exports were inspected without clipping, node overlap, connector-node crossing, fallback text, or adaptive colors.`;
  return prior ? `${prior} ${evidence}` : evidence;
}

function applyReviewNoteReplacements(note, id) {
  let updated = String(note || '');
  for (const replacement of specialRecords[id]?.review_note_replacements ?? []) {
    if (updated.includes(replacement.to)) continue;
    if (!updated.includes(replacement.from)) {
      throw new Error(`${id}: reviewed source locator is missing expected text: ${replacement.from}`);
    }
    updated = updated.replaceAll(replacement.from, replacement.to);
  }
  return updated;
}

function pinnedSourceUrl(detail, existing) {
  if (!detail.paper_url) return existing?.source_url || detail.homepage || '';
  if (detail.paper_url.includes('arxiv.org')) {
    const version = detail.drawio_review_note.match(/arXiv:([0-9.]+v\d+)/iu)?.[1];
    if (version) return `https://arxiv.org/abs/${version}`;
  }
  return detail.paper_url;
}

function labelsForNodeIds(arch, nodeIds) {
  const labels = new Map(arch.nodes.map(node => [
    node.id,
    String(node.label).replace(/\s*\n\s*/gu, ' · ').trim(),
  ]));
  return nodeIds.map((id) => {
    const label = labels.get(id);
    if (!label) throw new Error(`Missing reviewed node ${id}`);
    return label;
  });
}

function applySemanticOverrides(record, id, arches) {
  const special = specialRecords[id];
  if (!special) return record;
  const updated = { ...record };
  if (special.construction_node_ids) {
    updated.construction_steps_en = labelsForNodeIds(arches.en, special.construction_node_ids);
    updated.construction_steps_zh = labelsForNodeIds(arches.zh, special.construction_node_ids);
  }
  if (special.evaluation_node_ids) {
    updated.evaluation_steps_en = labelsForNodeIds(arches.en, special.evaluation_node_ids);
    updated.evaluation_steps_zh = labelsForNodeIds(arches.zh, special.evaluation_node_ids);
  }
  for (const field of [
    'construction_steps_en',
    'construction_steps_zh',
    'evaluation_steps_en',
    'evaluation_steps_zh',
  ]) {
    if (special[field]) updated[field] = special[field];
  }
  return updated;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readJson(manifestPath);
  const catalog = readJson(catalogPath);
  const manifestById = new Map(manifest.map((record, index) => [record.id, { record, index }]));
  const catalogById = new Map(catalog.map((record, index) => [record.id, { record, index }]));
  const detailUpdates = [];

  for (const id of args.ids) {
    const detailPath = join(publicDir, 'benchmarks_detail', `${id}.json`);
    if (!existsSync(detailPath)) throw new Error(`${id}: missing detail record`);
    const detail = readJson(detailPath);
    if (detail.id !== id) throw new Error(`${id}: detail identity mismatch`);
    if (!String(detail.drawio_review_note || '').trim()) {
      throw new Error(`${id}: missing reviewed source locator`);
    }

    const bundle = assertBundle(id);
    detail.drawio_review_note = withFormalPublicationEvidence(
      applyReviewNoteReplacements(detail.drawio_review_note, id),
      args.batch,
      bundle.dimensions,
    );
    detailUpdates.push({ detailPath, detail });
    const current = manifestById.get(id)?.record;
    const sourceUrl = pinnedSourceUrl(detail, current);
    if (!sourceUrl) throw new Error(`${id}: missing primary source URL`);
    const sourceLocator = detail.drawio_review_note.trim();
    const special = specialRecords[id] || {};
    let updated = {
      ...(current || {}),
      id,
      source_type: special.source_type || current?.source_type || 'paper',
      source_url: sourceUrl,
      source_locator: sourceLocator,
      evidence_summary_en: sourceLocator,
      evidence_summary_zh: readMetaDescription(join(publicDir, 'drawio', id, `${id}.zh.spec.yaml`)),
      strict_validation: { en: 'passed', zh: 'passed' },
      svg_foreign_object_reviewed: { en: false, zh: false },
      review_status: 'visually_reviewed',
      visual_review: {
        reviewed_at: args.reviewedAt,
        artifact: 'Draw.io Desktop 30.0.2 PNG and native SVG exports, bilingual specs, and architecture sidecars',
        result: 'Bilingual native-text fixed-light exports were inspected at the recorded dimensions; no clipping, node overlap, edge-through-node routing, fallback text, or adaptive colors were found.',
        dimensions: bundle.dimensions,
      },
      paper_alignment_review: {
        status: 'passed',
        source_url: sourceUrl,
        source_locator: sourceLocator,
        reviewed_at: args.reviewedAt,
      },
      assets: assetPaths(id),
      review_batch: args.batch,
      spec_authority: 'checked_in',
    };
    updated = applySemanticOverrides(updated, id, bundle.arches);

    const manifestSlot = manifestById.get(id);
    if (manifestSlot) {
      manifest[manifestSlot.index] = updated;
    } else {
      const predecessor = manifest.findIndex(record => record.id === 'BIG-Bench_Hard');
      const insertAt = predecessor >= 0 ? predecessor + 1 : manifest.length;
      manifest.splice(insertAt, 0, updated);
      manifestById.clear();
      manifest.forEach((record, index) => manifestById.set(record.id, { record, index }));
    }

    const catalogSlot = catalogById.get(id);
    if (!catalogSlot) throw new Error(`${id}: missing catalog record`);
    catalog[catalogSlot.index] = detail;
  }

  for (const { detailPath, detail } of detailUpdates) {
    writeFileSync(detailPath, `${JSON.stringify(detail, null, 2)}\n`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Recorded ${args.ids.length} reviewed Build Process bundles for ${args.batch}.`);
}

main();
