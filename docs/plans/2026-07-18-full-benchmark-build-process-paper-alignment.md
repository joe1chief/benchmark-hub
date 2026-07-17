# Full Benchmark Build Process Paper Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a paper-aligned, visually reviewed, bilingual Draw.io Build Process for every benchmark published by `llm-benchmark-costco`, then deploy and verify all pages online.

**Architecture:** Treat the validated IDs in `client/public/benchmarks.json` and `client/public/benchmarks_detail/*.json` as the release scope, not the smaller `benchmark_importer` catalog. Reconcile the current `main` with the 612-bundle local asset branch, remove any source-less phantom entry proven not to be a real benchmark, preserve the 57 published importer packages without treating publication as paper-review approval, and use the manifest audit as a hard release gate. Review evidence and rendering benchmark by benchmark; structural completeness never substitutes for paper alignment.

**Tech Stack:** React, TypeScript, Vite, Node.js tests and audit scripts, JSON manifests, Draw.io YAML DSL, draw.io Desktop, SVG/PNG, Playwright, GitHub Actions and GitHub Pages.

---

## Release contracts

- Scope is recomputed from `client/public/benchmarks.json` and matching detail JSON files on every audit. The pre-merge catalog has 615 rows, including a source-less `WildEval` candidate already removed as phantom on the asset branch; no command may hard-code the final count.
- Every benchmark needs Chinese and English `.spec.yaml`, `.drawio`, `.arch.json`, `.svg`, and `.png` assets under `client/public/drawio/<id>/`.
- Each detail JSON must point Chinese pages to the Chinese SVG/source/spec/arch files and English pages to the English files.
- `client/public/benchmarks_build_process_manifest.json` is the evidence ledger. A benchmark is complete only when strict validation, visual review, and `paper_alignment_review.status=passed` all hold.
- Paper alignment requires an exact paper or official-source URL and locator plus benchmark-specific evidence. Generic templates, README paraphrases, or old Mermaid diagrams are not proof.
- The diagram shows the benchmark construction process. Inference and scoring steps appear only when the source makes them part of the benchmark protocol and they remain visually distinct from dataset construction.
- Use `meta.profile: academic-paper`, `academic` or `academic-color`, short labels, conventional shapes, grid alignment, orthogonal routing, and non-color semantic cues.
- Final claims require the exact exported SVG/PNG to be visually inspected and the deployed Chinese and English pages to be read back.

### Task 1: Establish the isolated integration baseline

**Files:**
- Create: `docs/plans/2026-07-18-full-benchmark-build-process-paper-alignment.md`
- Merge from: branch `codex/benchmark-build-process-diagrams`
- Reconcile: `client/public/benchmarks.json`
- Preserve from current branch for the 57 published importer IDs: `client/public/benchmarks_detail/<id>.json`
- Preserve from current branch for the 57 published importer IDs: `client/public/drawio/<id>/*`

**Step 1: Record the two authoritative baselines**

Run:

```bash
git rev-list --left-right --count origin/main...codex/benchmark-build-process-diagrams
python3 scripts/validate_benchmarks.py
```

Expected: current `main` validates its pre-merge 615 entries; the local asset branch remains divergent rather than silently replacing `main`.

**Step 2: Merge without committing**

Run:

```bash
git merge --no-commit --no-ff codex/benchmark-build-process-diagrams
```

Expected: conflicts are limited to catalog, manifest, detail, and Draw.io assets that both branches changed.

**Step 3: Resolve by evidence precedence**

- Keep the 57 published importer asset/detail versions from current `main` when they conflict; do not infer formal paper-review approval from publication.
- Keep feature-branch assets for non-overlapping IDs as an explicitly unapproved review baseline.
- Keep every valid current catalog entry, remove only independently verified phantom/duplicate entries, and add no duplicate IDs.
- Never bulk-change `paper_alignment_review.status` while resolving the merge.

**Step 4: Run the merged structural baseline**

Run:

```bash
python3 scripts/validate_benchmarks.py
npm run test:build-process
npm run audit:build-process -- --json --allow-incomplete
npm run check
npm run build:ghpages
git diff --check
```

Expected: data, tests, TypeScript and build pass; the audit truthfully lists every paper-alignment gap.

**Step 5: Commit the reproducible merge**

```bash
git add docs/plans client/public scripts package.json
git commit -m "chore: reconcile full build process review baseline"
```

### Task 2: Turn the audit into a full-scope release gate

**Files:**
- Modify: `scripts/benchmark_build_process/audit_build_process_assets.mjs`
- Modify: `scripts/benchmark_build_process/audit_build_process_assets.test.mjs`
- Modify: `package.json`
- Create: `docs/reports/2026-07-18-build-process-paper-alignment-queue.json`
- Create: `docs/reports/2026-07-18-build-process-paper-alignment-queue.md`

**Step 1: Write a failing full-scope test**

The test must prove that catalog IDs, detail IDs, manifest IDs, and complete bilingual asset IDs are the same set. It must separately fail for missing strict validation, visual review, and paper-alignment approval.

**Step 2: Verify the test fails on an incomplete fixture**

Run:

```bash
node --test scripts/benchmark_build_process/audit_build_process_assets.test.mjs
```

Expected: FAIL with the precise missing gate represented by the fixture.

**Step 3: Implement the minimal gate and queue export**

The JSON summary must retain `detail_total`, `manifest_total`, `complete_bilingual_total`, `strict_valid_total`, `visually_reviewed_total`, and expose `paper_aligned_total` plus stable issue arrays. Queue rows include ID, source type/URL/locator, review state, asset state, and the exact next action.

**Step 4: Verify tests and write the queue**

Run:

```bash
npm run test:build-process
npm run audit:build-process -- --json --allow-incomplete
```

Expected: tests pass; the queue count equals the unresolved paper-alignment count.

**Step 5: Commit**

```bash
git add scripts/benchmark_build_process package.json docs/reports
git commit -m "test: enforce full build process paper review gate"
```

### Task 3: Review benchmarks in evidence-first batches

**Files per benchmark:**
- Modify: `client/public/benchmarks_detail/<id>.json`
- Modify: `client/public/drawio/<id>/<id>.en.spec.yaml`
- Modify: `client/public/drawio/<id>/<id>.zh.spec.yaml`
- Regenerate: matching `.drawio`, `.arch.json`, `.svg`, and `.png`
- Modify: `client/public/benchmarks_build_process_manifest.json`
- Update: `docs/reports/2026-07-18-build-process-paper-alignment-queue.json`

**Step 1: Assign a disjoint evidence batch**

Assign 6-12 IDs to one researcher. Researchers return exact URLs, section/page/repository locators, confirmed construction steps, disclosed counts/splits, unknowns, and diagram corrections. They do not edit the shared manifest.

**Step 2: Read primary evidence**

Use the paper and official supplement/repository. Record each supported claim and mark undisclosed components as `null` or explicit notes rather than inferring them.

**Step 3: Compare the current diagram with the evidence card**

Check source acquisition, filtering/deduplication, annotation or generation, quality control, split construction, benchmark execution, judge/parser behavior, and score formula. Remove downstream logic that is not part of the source-defined Build Process.

**Step 4: Edit the English and Chinese YAML specs**

Keep labels to one or two short lines. Preserve material branch/loop semantics. Translate the Chinese diagram independently while retaining proper nouns, counts, and formulas exactly.

**Step 5: Strictly generate all sidecars and exports**

Run for each language:

```bash
node /Users/a15574366334/.agents/skills/drawio/scripts/cli.js \
  client/public/drawio/<id>/<id>.<lang>.spec.yaml \
  client/public/drawio/<id>/<id>.<lang>.drawio \
  --validate --strict --write-sidecars
node /Users/a15574366334/.agents/skills/drawio/scripts/cli.js \
  client/public/drawio/<id>/<id>.<lang>.spec.yaml \
  client/public/drawio/<id>/<id>.<lang>.svg \
  --validate --strict --write-sidecars --use-desktop
node /Users/a15574366334/.agents/skills/drawio/scripts/cli.js \
  client/public/drawio/<id>/<id>.<lang>.spec.yaml \
  client/public/drawio/<id>/<id>.<lang>.png \
  --validate --strict --write-sidecars --use-desktop
```

Expected: no strict warnings; the source trio and both exports remain synchronized.

**Step 6: Inspect final SVG and PNG**

Verify no edge crosses a node/label, no clipping or unreadable text, no duplicate edge labels, no fallback SVG text, intentional background, adequate contrast, and readable grayscale semantics.

**Step 7: Update evidence and review status**

Set `paper_alignment_review.status=passed` only after the paper comparison. Set strict and visual flags only after the corresponding checks. Keep source URL and locator identical across review and manifest fields.

**Step 8: Test and commit a small batch**

Run:

```bash
npm run test:build-process
npm run audit:build-process -- --json --allow-incomplete
python3 scripts/validate_benchmarks.py
git diff --check
```

Commit 6-12 reviewed benchmarks with a benchmark-scoped message. Repeat until the unresolved queue is empty.

### Task 4: Verify bilingual display behavior

**Files:**
- Modify only if needed: `client/src/components/BenchmarkDrawer.tsx`
- Modify only if needed: `client/src/types/benchmark.ts`
- Create or modify: `scripts/benchmark_build_process/verify_build_process_pages.mjs`
- Create or modify: corresponding browser tests

**Step 1: Write a failing language-routing test**

Assert that Chinese UI loads `<id>.zh.svg`, English UI loads `<id>.en.svg`, image dimensions are non-zero, and an existing Draw.io asset never silently falls back to Mermaid.

**Step 2: Run the targeted test**

Run the existing Vitest/Playwright command discovered in `package.json`; expect the new assertion to fail before any required frontend fix.

**Step 3: Implement only confirmed display fixes**

Do not change styling or fallback behavior unless the test reproduces a real defect.

**Step 4: Verify the built GitHub Pages artifact**

Run:

```bash
npm run check
npm run build:ghpages
python3 -m http.server 4173 --directory dist-ghpages
curl --noproxy '*' -I http://127.0.0.1:4173/llm-benchmark-costco/
```

Run browser verification against the same base path and inspect representative simple, branching, loop, multimodal, agent/tool, medical, code, and math diagrams in both languages.

### Task 5: Run the final full-catalog completion audit

**Files:**
- Modify: `client/public/benchmarks_build_process_manifest.json`
- Create: `docs/reports/2026-07-18-build-process-paper-alignment-final.md`

**Step 1: Run the strict audit without an incomplete override**

```bash
npm run audit:build-process -- --json
```

Expected: catalog/detail/manifest/complete/strict/visual/paper-aligned totals are identical; every issue array is empty.

**Step 2: Run all repository checks**

```bash
npm run test:build-process
npm run check
npm run build:ghpages
python3 scripts/validate_benchmarks.py
node scripts/benchmark_build_process/verify_build_process_pages.mjs
git diff --check
```

Expected: every command exits zero.

**Step 3: Write the final evidence report**

Record exact totals, commands, commit IDs, exceptions resolved, representative screenshots, and remaining risks. Do not call the goal complete if any benchmark lacks source-backed approval.

### Task 6: Review, commit, push, deploy, and verify production

**Files:**
- All files changed by Tasks 1-5

**Step 1: Run an independent code/content review**

Review the full diff for correctness, provenance, accidental catalog loss, secrets, generated-file consistency, and paper-review overclaims. Resolve every high-confidence issue.

**Step 2: Create the release commit**

```bash
git add client scripts docs package.json
git commit -m "feat: publish paper-aligned bilingual build processes"
```

**Step 3: Push the reviewed commit to `main`**

Use a non-force push only after confirming the remote head is the expected ancestor.

**Step 4: Wait for deployment**

Wait for both CI and `Deploy to GitHub Pages` runs to complete successfully, then verify the resulting `gh-pages` commit references the pushed `main` commit.

**Step 5: Read production back**

Verify the catalog count, a deterministic URL sample from every benchmark family, all exceptional diagrams, and both languages. Check SVG/PNG HTTP status, image dimensions, page language selection, and absence of Mermaid fallback.

**Step 6: Complete the goal only from evidence**

Mark the goal complete only when the final strict audit, deployment runs, and online read-back all prove the full release contract.
