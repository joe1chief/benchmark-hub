# Importer 57 Build Process Evidence Review

## Scope

This ledger covers exactly the 57 bilingual Build Process bundles first published from `benchmark_importer`:

`ArtifactsBench`, `BFCL-v4`, `BIRD-SQL`, `BigCodeBench`, `BrowseComp`, `BrowseComp-ZH`, `CF-Div2-Stepfun`, `CFBench`, `CMATH`, `CURIE`, `ChartEditBench`, `CiteEval`, `CodeSimpleQA`, `CruxEval`, `DeepPlanning`, `DeepResearchEval`, `DeepSearchQA`, `DiagnosisArena`, `EHRSQL`, `FRAMES`, `GAIA`, `GSM8K`, `GaRAGe`, `HELMET`, `HalluLens`, `HealthBench`, `HumanEval`, `IFBench`, `IFEval`, `InfiniteBench`, `Inverse_IFEval`, `LiveCodeBench`, `LiveDRBench`, `LiveMathBench`, `LongBench_v2`, `LongDocURL`, `MARS-Bench`, `MBPP`, `MCP-Bench`, `MRCR`, `MaXIFE`, `MathBench`, `MedCalc-Bench`, `MedMT-Bench`, `MemoryAgentBench`, `MulDimIF`, `Multi-IF`, `MultiChallenge`, `OctoBench`, `Oolong`, `PolyMATH`, `RepoQA`, `Spider_2.0`, `SysBench`, `TAU-Bench`, `Toolathlon`, and `WorldTravel`.

Every manifest record is tagged with `review_batch: 2026-07-18-importer57`; the regression test asserts that this tag resolves to this exact 57-ID set and no other record.

The independent source fixture is `scripts/benchmark_build_process/fixtures/importer57_review.json`. It fixes the expected 57 IDs, primary URL, source type, complete source locator, locator facts, and the seven diagrams whose checked architecture contains a distinct downstream-evaluation lane. The test does not derive those source expectations from the detail JSON, spec, or architecture sidecar it is validating.

## Evidence recorded

- `source_url` uses an immutable reviewed paper/release location. Previously moving arXiv links are now fixed to `LiveMathBench v5`, `LongBench v2 v2`, `LongDocURL v3`, `Inverse IFEval v1`, `MulDimIF v2`, `Multi-IF v2`, `MultiChallenge v2`, `Oolong v1`, and `Toolathlon v2`.
- MathBench uses the final ACL paper `2024.findings-acl.411` as its primary source, cross-checked against arXiv v1, repository commit `535db13490d50d39c9ea2de094d02c837f3a836b`, release-tag commit `5302f883d99102ad89dbb4403b69a2ab598091ce`, ZIP SHA-256 `15d5097aee95aae0ac692bf90df7a00558f730319d00e63c288f5365a0c7f8db`, and DOI `10.18653/v1/2024.findings-acl.411`.
- CiteEval uses the final ACL 2025 paper `2025.acl-long.1574` as its primary source. Its locator retains arXiv `2506.01829v1` section/appendix anchors and official repository commit `88f567d244a73607fe1feebdb821f17d96acf796` as the reproducible evidence boundary.
- `source_type` distinguishes paper-only evidence from paper-plus-official repository, dataset, release, project, methodology, or supplement evidence.
- `source_locator` records paper sections, figures, tables, appendices, and pinned official code/data revisions available in the final detail or reviewed specification.
- `paper_alignment_review` repeats the exact manifest URL and locator and records `status: passed` and `reviewed_at: 2026-07-18`.
- Every record declares `spec_authority: checked_in`. Stale generator graphs/labels/types were removed; the checked `.spec.yaml` and `.arch.json` files are authoritative.
- `construction_steps_*` and `evaluation_steps_*` jointly cover every final architecture node exactly once. Distinct evaluation lanes are recorded for `ArtifactsBench`, `MCP-Bench`, `MedMT-Bench`, `MulDimIF`, `RepoQA`, `Toolathlon`, and `WorldTravel`; evaluation no longer masquerades as dataset construction.
- `strict_validation.en/zh` are `passed`; `review_status` is `visually_reviewed`.
- `visual_review.dimensions` stores the actual PNG IHDR and SVG viewBox dimensions for both languages. The review evidence is limited to the checked-in Draw.io Desktop PNG/SVG, spec, and architecture artifacts and does not claim a DOM/page check.
- `svg_foreign_object_reviewed.en/zh` are `false`: all 114 SVGs use native text and contain no `foreignObject`, fallback-text marker, or adaptive `light-dark()` color.
- The catalog/detail fallback fields are synchronized for only these 57 records. Review notes now contain one normalized source locator, do not duplicate the evidence summary, and contain no accidental `..` suffix.

## Generator protection

`generate_build_process_specs.mjs` now treats `spec_authority: checked_in` as a preservation contract:

- Every `--sync-data` or `--sync-data-only` entry that can publish a passed review note requires an explicit `paper_alignment_review.status: passed`, a real `YYYY-MM-DD` review date, and non-empty reviewed URL/locator values that exactly match the manifest `source_url` and `source_locator` before syncing catalog/detail data; this applies equally to generated and checked-in specs.
- The public root, Draw.io parent, and every existing checked-in asset are canonicalized with `realpath`; both lexical traversal and symlink-based escape from the canonical Draw.io/public roots are rejected. Assets must also be non-empty regular files.
- SVG and Draw.io sources must pass `fast-xml-parser` well-formedness validation with the expected `svg` or `mxfile` root, specifications must parse through the repository-installed `yaml` safe schema as a mapping with `meta.title`, object-sequence `nodes`, and object-sequence `edges`, and architecture JSON must expose node/edge arrays. Data-only sync never renders or overwrites a checked-in spec.
- Ordinary generation and `--sync-data` reject checked-in entries with an explicit instruction to use `--sync-data-only`.
- Generated-manifest entries retain the existing topology validation behavior, including during data-only sync.
- Review-note normalization can claim “passed” only after the paper-review gate succeeds, then uses its date and the exact locator once, avoiding repeated text and duplicate periods.

## Language exemptions

The audit exemptions are restricted to exact node IDs whose visible Chinese labels are benchmark names, model names, dataset/split identifiers, or immutable release identifiers. No ordinary English prose is exempted.

- `CruxEval`: `code_generator`, `input_task`, `output_task`
- `LiveDRBench`: `build_scifacts`, `build_novelds`, `release`
- `LiveMathBench`: `cnmo`, `ccee`, `amc`, `wlpmc`, `full`
- `MBPP`: `full_split`, `sanitized_split`, `release`
- `MRCR`: `release`
- `MedCalc-Bench`: `open_patients`, `pinned_release`
- `OctoBench`: `reference_rollouts`
- `Oolong`: `synth_split`, `synth_final`, `crd3`, `stats_source`, `dnd`, `toy`
- `Spider_2.0`: `query_sources`, `retained`, `agentic_release`, `lite_release`, `snow_release`

No MathBench label is exempted. Its `CE-0/1/2`, `CE-3/4`, theory-release, and application-release labels instead provide Chinese semantics around the technical identifiers.

## Verification

The target-filtered audit on 2026-07-18 returned zero issues for every audited array:

| Target audit field | Issues |
| --- | ---: |
| `id_set_issues` | 0 |
| `png_issues` | 0 |
| `broken_references` | 0 |
| `language_issues` | 0 |
| `source_issues` | 0 |
| `svg_issues` | 0 |
| `aggregate_issues` | 0 |
| `data_consistency_issues` | 0 |
| `topology_issues` | 0 |
| `strict_issues` | 0 |
| `visual_issues` | 0 |
| `paper_alignment_issues` | 0 |
| `review_issues` | 0 |

The target unresolved queue is `0 / 57`. The full-site queue remained non-zero as required; it was 506 at this concurrent-work snapshot and is intentionally not treated as completion evidence for the other benchmarks.

Regression results:

- Evidence-ledger test: 10 passed, 0 failed.
- Generator test: 31 passed, 0 failed, including ordinary and checked-in paper-review provenance equality, realpath/symlink containment, checked-in refusal and preservation, parser-backed malformed XML/YAML rejection, missing/directory/empty/malformed assets, and normalized-note cases.
- Importer scoped suites plus the ledger/generator/ChartEditBench route suites: 112 tests, 110 passed, 2 optional Draw.io CLI rebuild tests skipped, 0 failed.
- Python validator unit tests: 10 passed. The live concurrent tree loaded 609 catalog records and 610 detail records with 0 errors. It reported 20 pre-existing openness vocabulary warnings; none belongs to the importer57 ID set.
- Target-filtered asset audit: all 13 issue arrays are zero and target unresolved is `0 / 57`; `git diff --check` passes for the shared worktree.

## Known source-boundary exceptions

- `MRCR` is the OpenAI expansion, not the unreleased Michelangelo paper data. The manifest pins OpenAI Hugging Face commit `f4c69fae7cf81f7ca26b9fee34b392a50f6b8a1d`; Michelangelo arXiv v2 is context only and explicitly not a per-record source.
- `MedMT-Bench` uses arXiv `2603.23519v1` as the primary paper. The withdrawn OpenReview v2 submission `aKyBCsPOHB` is retained only as the supplement channel; the extracted JSONL is pinned by SHA-256 `66f9b73675cd85ed8e9affa1a8acd8d9b31d25c2a4eb4bd78ffc80e926d7aa71`. There is no official repository, release tag, dataset revision, or DOI, and the 22 versus 22.8625 turns plus 24/9 versus 32/10 category statistics remain explicit version differences.
- `WorldTravel` previously pointed to `https://ccbench.org`, an unrelated coding-benchmark site. Both the detail record and catalog fallback leave `homepage` empty; the reviewed primary source is arXiv:2602.08367v1. Author-linked static pages are pinned to `dopej9/World-Travel@5fcdda1bbb05c4d777797b43aeae10f47351e3cd`, but that 184-HTML snapshot is not an official task/evaluator release and has no published mapping to the paper's 2,003 pages.
- `ChartEditBench` now records the reviewed reroute from `initial_rendered` to `vqa_generation`; both PNGs are `1889 × 769` and both SVG viewBoxes are `1897 × 778`.
