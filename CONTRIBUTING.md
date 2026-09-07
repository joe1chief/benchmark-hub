# Contributing to LLM Benchmark Costco

Thank you for your interest in contributing! There are two main ways to contribute:

1. **Submit a new benchmark** (no coding required)
2. **Improve the frontend code**

---

## Option 1: Submit a New Benchmark (No Coding Required)

The easiest way to contribute is to open a GitHub Issue using the **[Submit New Benchmark](https://github.com/joe1chief/llm-benchmark-costco/issues/new?template=submit_benchmark.yml)** template. Fill in the form fields and a maintainer will add it to the database.

---

## Option 2: Add or Update a Benchmark via Pull Request

Use the repository's [update-benchmarks skill](skills/update-benchmarks/SKILL.md) to review the exact primary source and prepare a `benchmark-package/v1` package. See the [package reference](skills/update-benchmarks/references/package.md) for field and update semantics. The [starter](skills/update-benchmarks/assets/benchmark-package.example.json) intentionally has a pending review and placeholders; it cannot be imported as reviewed evidence.

Choose one mode, initially without `--write`:

```bash
pnpm benchmark:add --input /path/to/reviewed-package.json
pnpm benchmark:update --update /path/to/reviewed-package.json
pnpm benchmark:rebuild --rebuild BENCHMARK_ID
```

These are mutually exclusive alternatives. Add accepts new IDs or an exact repeated package as a no-op. Update requires an already registered ID with matching catalog/manifest/detail identity; it cannot create or rename an ID. Update metadata is a patch: omitted canonical fields retain their respective catalog/detail values; only fields entirely absent from detail inherit the catalog baseline. Permitted empty strings, arrays and false values explicitly clear or disable fields. Changing either side of a bilingual description pair requires explicitly supplying both sides. Evidence and both language specs are complete replacements backed by an actual source review, not patches. Category and publication-year defaults follow the [update contract](skills/update-benchmarks/references/package.md#更新已有-benchmark).

Review the dry-run file plan, validation and `preserved_fields`, then repeat the chosen command with `--write` within your authorized scope. After add/update, repeat the same package command without `--write`, then run rebuild without `--write`; both must report an empty `changed_files` list. Rebuild alone refreshes derived files from checked-in specs and should also become a no-op after applying its plan.

The tool validates a complete proposed data snapshot before atomically applying metadata, evidence, bilingual sources, graph projections, fallbacks and README statistics. Targeted JSON writes preserve non-target records' original bytes, positions and escaping. Update removes all old `drawio_*` fields from catalog/detail before injecting new spec/arch pointers; an existing `drawio_review_note` is replaced with the new source locator. Unknown non-`drawio_*` catalog/detail extensions are preserved. Known manifest source, diagram and export-review fields are replaced by the new manifest; unknown manifest fields are preserved. `preserved_fields` reports the retained extension names separately for catalog, detail and manifest; review them because they are not automatically brought into agreement with new sources. See the [field replacement rules](skills/update-benchmarks/references/package.md#更新已有-benchmark). The tool does not perform paper review or authorize Git publication. Shared HTML views render new entries; optional SVG/PNG/.drawio exports and one-off intake scripts are unnecessary.

### Isolated data and frontend validation

CLI `--root` may target a data-only copy; validators come from the code checkout running the CLI. Bare `pnpm` tests/builds still target their own checkout and do not inherit that root. Report data validation separately; prefer a complete isolated checkout containing the target data for full frontend acceptance. An isolated preview can combine already-built `dist/public` (or Pages `dist-ghpages`) static code with the target root's `client/public` data, respecting the build base path; label it as a preview of that specific code/data combination.

Even dry-run writes staging under `os.tmpdir()`. `--root` does not constrain temporary writes: when the user limits writable paths, create tmp inside an authorized directory and set `TMPDIR` for each CLI process, as shown in the [isolation reference](skills/update-benchmarks/references/package.md#隔离目录与临时写入). No dependency copying is needed. Complete the website checks below against the intended checkout/data before claiming frontend acceptance.

### Catalog field conventions

The canonical fields are `id`, `name`, `intro` / `intro_en`, `org`, `homepage`, `published` (`YYYY` or `YYYY-MM`) and `year` (`YYYY`). `l1` uses the Chinese keys below. Display translations live in `l1_en`; the newer `default_l1` taxonomy is separate. Openness uses `public`, `partly public`, `in-house`, or an empty string for unknown. Related benchmarks resolve to existing IDs or unique display names. Do not use the old `description`, `institution`, or `homepage_url` aliases.

| Canonical `l1` | Display category |
|---|---|
| `通用语言能力` | General Language |
| `Agent能力` | Agent Capability |
| `多模态理解` | Multimodal |
| `代码能力` | Code |
| `科学推理` | Science & Reasoning |
| `安全对齐` | Safety & Alignment |
| `数学推理` | Math |
| `长文本理解` | Long Context |
| `医疗健康` | Medical & Health |
| `视频理解` | Video Understanding |
| `图表与文档理解` | Chart & Document |
| `空间与3D理解` | Spatial & 3D |

### PR Checklist

Before submitting a PR, please run the local validation script:

```bash
python3 scripts/validate_benchmarks.py --html
```

This script checks for:
- Valid JSON format
- Unique `id` and `name`
- Correct `l1` category values
- Valid `related_benchmarks` references
- Correct `year` format

Our CI (`.github/workflows/ci.yml`) will automatically run this HTML-profile validation on your PR. The `--html` profile validates website data without requiring optional Draw.io/SVG exports referenced by legacy fields; the default validator retains legacy export checks.

---

## Option 3: Frontend Code Contributions

The frontend is built with **React 19 + TypeScript + Tailwind CSS 4 + Vite 7**.

```bash
# Setup
pnpm install
pnpm dev        # Start dev server at http://localhost:5173

# Before submitting a PR
pnpm exec tsc --noEmit  # Check for TypeScript errors
pnpm build:ghpages      # Ensure GitHub Pages build works
```

Our CI (`.github/workflows/ci.yml`) will automatically run `tsc` and `build:ghpages` on your PR to catch any issues.

Key files:

| File | Purpose |
|------|---------|
| `client/src/types/benchmark.ts` | TypeScript type definitions |
| `client/src/hooks/useBenchmarks.ts` | Data loading and filtering logic |
| `client/src/components/BenchmarkCard.tsx` | Card component |
| `client/src/components/BenchmarkDrawer.tsx` | Detail drawer (PDF, flowchart, tabs) |
| `client/src/components/HtmlBuildProcessView.tsx` | Dual-track build process view (Construction & Evaluation) |
| `client/src/components/PureHtmlFlowchart.tsx` | Pure CSS+HTML native flowchart rendering engine |
| `client/src/components/FilterBar.tsx` | Filter controls |
| `client/src/contexts/LangContext.tsx` | i18n translations (EN/ZH) |
| `client/public/drawio/<id>/<id>.{en,zh}.arch.json` | Paper-grounded bilingual pipeline topologies |

---

## Build-process sources and automated deployment

The website's canonical Build Process presentation is HTML. The checked-in bilingual `.spec.yaml` files define the graph semantics; the standalone source generator produces the `.arch.json` metadata consumed by the HTML views. Direct sidecar edits are rejected by the source consistency gate. HTML views use explicit module membership when available. Nodes without a declared construction/evaluation stage appear in a neutral pipeline, with no inference from labels, language, or array position. Keep source-backed decisions, repair loops and retry edges; fix incompatible layout behavior instead of deleting edges. Legacy specs may omit edge IDs, which are generated as `edge-1`, etc. from array order; preserve that order during restoration/rebuild and prefer explicit stable IDs for new packages.

Every pull request and push to `main` runs three website gates on Ubuntu: benchmark data validation, TypeScript and the existing core regression tests, and **HTML Flowchart Validation**. The HTML gate explicitly runs full-catalog canonical source consistency (`pnpm check:build-process-source`) and HTML asset auditing (`pnpm audit:build-process`, using `--html`), then runs HTML structural tests and data/graph semantic regressions without an external Draw.io toolchain, Draw.io Desktop, or macOS. The Pages build depends on all three gates succeeding. These are workflow dependencies; changing the workflow does not update repository branch-protection settings.

A successful `main` push CI from this repository triggers deployment of that exact checked commit. Pull-request CI cannot deploy. Manual deployment checks out the selected event SHA and independently runs data validation, standalone source consistency, full-catalog HTML asset auditing, HTML flowchart tests, TypeScript, and the core regression tests before building and publishing. It also requires no external diagram toolchain.

After installing the locked project dependencies, run the website checks locally:

```bash
pnpm install --frozen-lockfile
python3 scripts/validate_benchmarks.py --html
pnpm check:build-process-source
pnpm audit:build-process
pnpm test:html-flowchart
pnpm test:benchmark-ingestion
pnpm exec tsc --noEmit
pnpm test:build-process
pnpm build:ghpages
```

The source gate checks both languages for every catalog entry, including missing artifacts, node/edge/module metadata, and Mermaid fallbacks in both detail and catalog records. It is read-only by default and fails on inconsistency. For reviewed metadata/source changes use `pnpm benchmark:update --update /path/to/reviewed-package.json`, inspect the plan and then add `--write`. To repair only a benchmark's derived files together, run `pnpm benchmark:rebuild --rebuild ExampleA --write`. This preserves its authored specs, paper review, catalog-specific metadata and detail-specific metadata. New intake records also carry spec/graph hashes, checked by the asset audit and refreshed by this rebuild command. The lower-level `pnpm generate:flowchart-data` and fallback synchronizer remain available for legacy batch maintenance. Rerun the source and HTML gates after generation; passing structural checks does not replace paper-level semantic review.

### Optional legacy Draw.io exports

Draw.io, SVG, and PNG exports remain optional legacy artifacts, separate from the website's HTML validation and deployment. When updating or reviewing those exports, use the existing pinned export toolchain and run **Optional Draw.io Export Fidelity** (`.github/workflows/drawio-export.yml`) manually from GitHub Actions on the desired ref. This workflow retains the full original scoped fidelity suite across eight `macos-26` shards, the pinned Draw.io toolchain, an explicit legacy asset audit (`node scripts/benchmark_build_process/audit_build_process_assets.mjs`, without `--html`), representative PNG diagnostics, and an aggregate check that fails unless every shard succeeds. It does not trigger or gate website deployment.

For local legacy fidelity checks, install the pinned toolchain documented in `scripts/ci/install_drawio_toolchain*.sh`, configure its exported tool paths, and run `pnpm test:drawio-fidelity`. Local tests may skip desktop exports when the required tools are unavailable; those skips do not establish export fidelity. The optional workflow is the separate validation path for those artifacts, and no branch-protection setting is changed by this split.

## Code of Conduct

Please be respectful and constructive. We welcome contributions from researchers, engineers, and students at all levels.
