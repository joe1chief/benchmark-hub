# Benchmark Build Process Diagrams Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give every benchmark detail page a paper-aligned, editable Draw.io Build Process diagram in English and Chinese, with traceable evidence and end-to-end rendering verification.

**Architecture:** Keep the existing detail-JSON display contract and store each language as an offline Draw.io bundle under `client/public/drawio/<benchmark-id>/`. Add a machine-readable review manifest and a read-only audit command so coverage, source fidelity, bilingual metadata, asset references, strict Draw.io validation, and final SVG rendering can be checked repeatedly. Build diagrams in small evidence-reviewed batches; never infer a missing paper method from the benchmark name or generic benchmark patterns.

**Tech Stack:** React/TypeScript/Vite, JSON, Node.js audit scripts and tests, Draw.io YAML DSL/CLI, SVG, Playwright browser verification.

---

## Non-negotiable contracts

- Scope is the 613 detail JSON files currently under `client/public/benchmarks_detail/`; recount on every run because the catalog can grow.
- Every covered benchmark keeps eight files under `client/public/drawio/<id>/`: English and Chinese `.spec.yaml`, `.drawio`, `.arch.json`, and `.svg`.
- Detail JSON keeps the existing `drawio_flowchart_*`, `drawio_source_*`, `drawio_spec_*`, and `drawio_arch_*` fields. Existing Mermaid fields remain as fallbacks.
- `client/public/benchmarks_build_process_manifest.json` is the evidence ledger. Each entry records `id`, source type, primary source URL, exact section/appendix/repository locator, bilingual evidence summaries, reviewed construction/evaluation steps, reviewer status, and artifact paths.
- Prefer the benchmark paper or official supplementary material. If no paper exists, use an official dataset card/repository/announcement and set `source_type: official_non_paper` plus an explicit reason. Never claim paper alignment for those exceptions.
- `meta.profile` is `academic-paper`; theme is `academic` or `academic-color`; labels must be short; branches, filtering loops, human validation, split construction, and scoring protocols must be preserved when the source makes them material.
- Chinese specs require Chinese title, description, legend, and node labels except proper nouns/standard acronyms. English specs must not contain accidental Chinese prose.
- Run Draw.io CLI with `--validate --strict --write-sidecars`; inspect the exact exported SVG/PNG, not only the spec or XML.

### Task 1: Establish a reproducible audit baseline

**Files:**
- Create: `scripts/benchmark_build_process/audit_build_process_assets.mjs`
- Create: `scripts/benchmark_build_process/audit_build_process_assets.test.mjs`
- Create: `client/public/benchmarks_build_process_manifest.json`
- Modify: `package.json`

**Step 1: Write failing Node tests**

Cover one complete fixture and failures for: missing language asset, broken JSON reference, missing primary source locator, English metadata in a Chinese spec, Chinese prose in an English spec, malformed SVG, missing sidecar, and manifest/detail-ID mismatch.

**Step 2: Run the tests and confirm failure**

Run: `node --test scripts/benchmark_build_process/audit_build_process_assets.test.mjs`

Expected: FAIL because the audit module and manifest contract do not exist.

**Step 3: Implement the read-only auditor**

The command must emit a JSON summary plus a human-readable table with these exact counters: `detail_total`, `manifest_total`, `complete_bilingual_total`, `strict_valid_total`, `visually_reviewed_total`, `missing_ids`, `broken_references`, `language_issues`, `source_issues`, and `svg_issues`. Exit non-zero for broken references/schema; allow `--allow-incomplete` while staged coverage is below 100%.

**Step 4: Seed the manifest from reviewed evidence only**

Seed entries only for benchmarks whose primary source and locator have been rechecked. Existing `drawio_review_note` text is input evidence, not automatic proof.

**Step 5: Add package scripts**

Add:

```json
"audit:build-process": "node scripts/benchmark_build_process/audit_build_process_assets.mjs",
"test:build-process": "node --test scripts/benchmark_build_process/audit_build_process_assets.test.mjs"
```

**Step 6: Run tests and baseline audit**

Run:

```bash
pnpm test:build-process
pnpm audit:build-process -- --allow-incomplete
```

Expected: tests PASS; audit truthfully reports current coverage and all known gaps.

**Step 7: Commit**

```bash
git add package.json scripts/benchmark_build_process client/public/benchmarks_build_process_manifest.json
git commit -m "test: audit benchmark build process assets"
```

### Task 2: Re-review and correct the existing 236 diagram bundles

**Files:**
- Modify: `client/public/benchmarks_detail/*.json` for reviewed IDs only
- Modify: `client/public/drawio/<id>/<id>.en.spec.yaml`
- Modify: `client/public/drawio/<id>/<id>.zh.spec.yaml`
- Regenerate: matching `.drawio`, `.arch.json`, and `.svg`
- Modify: `client/public/benchmarks_build_process_manifest.json`

**Step 1: Build a review queue from audit failures**

Prioritize language contamination, missing paper URLs/locators, generic eight-node templates that omit source branches, and review notes that say “aligned” without section-level evidence.

**Step 2: Re-read the primary source**

For each benchmark, record exact method/evaluation locators and separate confirmed facts from inference. Use official paper HTML/PDF, official supplement, and official repository in that order. Mark paperless benchmarks explicitly.

**Step 3: Correct the English spec**

Keep one reader question per diagram. Preserve the construction source, selection/filtering, annotation/validation, final dataset/splits, inference protocol, and scoring stage when stated by the source.

**Step 4: Correct the Chinese spec independently**

Translate semantics, title, description, legend, and labels; do not copy the English metadata block into the Chinese file.

**Step 5: Regenerate both bundles with strict validation**

Run per language:

```bash
node /Users/a15574366334/.agents/skills/drawio/scripts/cli.js \
  client/public/drawio/<id>/<id>.<lang>.spec.yaml \
  client/public/drawio/<id>/<id>.<lang>.drawio \
  --validate --strict --write-sidecars
node /Users/a15574366334/.agents/skills/drawio/scripts/cli.js \
  client/public/drawio/<id>/<id>.<lang>.spec.yaml \
  client/public/drawio/<id>/<id>.<lang>.svg \
  --validate --strict --write-sidecars --use-desktop
```

**Step 6: Inspect the final export**

Check no edge crosses a node/label, no text clips, font remains readable at page scale, background is intentional, no fallback text appears, and Chinese/English pages reference their own language asset.

**Step 7: Update detail JSON and manifest**

Keep existing Mermaid fallbacks; update the review note only with source-supported claims. Set manifest `review_status: visually_reviewed` only after exact exported asset inspection.

**Step 8: Audit and commit in small batches**

Run `pnpm test:build-process && pnpm audit:build-process -- --allow-incomplete`. Commit 8-15 related benchmarks per batch with a scope-specific message.

### Task 3: Add the remaining 377 benchmark bundles

**Files:**
- Modify: `client/public/benchmarks_detail/<id>.json`
- Create: `client/public/drawio/<id>/<id>.en.spec.yaml`
- Create: `client/public/drawio/<id>/<id>.zh.spec.yaml`
- Generate: matching `.drawio`, `.arch.json`, and `.svg`
- Modify: `client/public/benchmarks_build_process_manifest.json`

**Step 1: Recompute the missing list**

Run `pnpm audit:build-process -- --allow-incomplete` and use its `missing_ids`; do not rely on the initial 377 count after catalog changes.

**Step 2: Route each benchmark by source availability**

Use local official material under `/Users/a15574366334/antcode/benchmark_importer/benchmarks/<benchmark>/source_project/` when available; otherwise follow `paper_url`/`arxiv_pdf_url`; otherwise verify the official homepage/repository. Record any unresolved source as blocked rather than inventing a flow.

**Step 3: Extract a paper evidence card**

For every ID record: raw data/source, creation/collection, filtering/deduplication, annotation/generation, quality control/human review, dataset size/splits, inference protocol, judge/parser, metrics/formula, and the exact source locator. Use `null` for components not stated by the source.

**Step 4: Draft the semantic flow before rendering**

Use 5-12 short nodes for simple pipelines. Use explicit decision nodes and separated branches for multi-path construction/evaluation. Move long numbers, paths, and caveats into the manifest or page prose.

**Step 5: Generate and validate English and Chinese bundles**

Apply the same strict CLI and final-export inspection from Task 2.

**Step 6: Wire the detail page contract**

Add all eight asset-reference fields plus a source-specific review note; preserve Mermaid fallback fields.

**Step 7: Audit and commit in small batches**

Process 8-15 related benchmarks per commit. Never batch-approve source evidence or visual review status.

### Task 4: Verify the display layer and GitHub Pages paths

**Files:**
- Modify only if a defect is found: `client/src/components/BenchmarkDrawer.tsx`
- Modify only if a type gap is found: `client/src/types/benchmark.ts`
- Create: `scripts/benchmark_build_process/verify_build_process_pages.mjs`

**Step 1: Write a browser verification script**

Open a deterministic sample from every benchmark family plus every exceptional layout. For each sample, open the detail drawer, switch English/Chinese, select Build Process, and assert the image `src` points to the correct `.en.svg`/`.zh.svg`, has non-zero natural dimensions, and did not fall back to Mermaid.

**Step 2: Run static checks and build**

Run:

```bash
pnpm check
pnpm build:ghpages
```

Expected: both PASS.

**Step 3: Serve the exact built output without proxy interference**

Run a local static server, verify with `curl --noproxy '*'`, then run the browser verifier against the GitHub Pages base path.

**Step 4: Visually inspect representative and complex diagrams**

Capture English and Chinese screenshots for the review report. Include simple linear, branching, feedback-loop, multimodal, agent/tool, medical, code, and math benchmarks.

### Task 5: Final release gate

**Files:**
- Create: `docs/reports/2026-07-10-benchmark-build-process-review.md`
- Modify: `client/public/benchmarks_build_process_manifest.json`

**Step 1: Run the strict full audit**

Run `pnpm audit:build-process` without `--allow-incomplete`.

Expected: 100% detail/manifest/bilingual asset coverage, zero broken references, zero language/source/SVG issues, and every entry `visually_reviewed` or explicitly documented as a source-blocked exception.

**Step 2: Run all project checks**

Run:

```bash
pnpm test:build-process
pnpm check
pnpm build:ghpages
node scripts/benchmark_build_process/verify_build_process_pages.mjs
git diff --check
```

**Step 3: Write the review report**

Report exact counts, source exceptions, corrected paper-detail mismatches, strict validation results, browser samples, and remaining risks. Do not call the goal complete if any benchmark lacks a source-backed bilingual diagram or the actual page was not opened.

**Step 4: Final commit**

```bash
git add client/public client/src scripts docs package.json
git commit -m "feat: complete paper-aligned benchmark build process diagrams"
```
