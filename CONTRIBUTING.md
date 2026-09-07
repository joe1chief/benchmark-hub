# Contributing to LLM Benchmark Costco

Thank you for your interest in contributing! There are two main ways to contribute:

1. **Submit a new benchmark** (no coding required)
2. **Improve the frontend code**

---

## Option 1: Submit a New Benchmark (No Coding Required)

The easiest way to contribute is to open a GitHub Issue using the **[Submit New Benchmark](https://github.com/joe1chief/llm-benchmark-costco/issues/new?template=submit_benchmark.yml)** template. Fill in the form fields and a maintainer will add it to the database.

---

## Option 2: Add a Benchmark via Pull Request

If you're comfortable with JSON, you can directly add a benchmark to `client/public/benchmarks.json`.

### Data Schema

Each benchmark entry follows this structure:

```jsonc
{
  "name": "MyBench",                          // Required: Official name
  "name_zh": "我的基准",                       // Optional: Chinese name
  "description": "MyBench evaluates...",      // Required: English description (2-4 sentences)
  "description_zh": "MyBench 是一个...",       // Optional: Chinese description
  "l1": "Agent Capability",                   // Required: Primary category (see L1 values below)
  "l2": "Code Agent",                         // Optional: Subcategory
  "default_l1": "Agent Capability",           // Required: Same as l1 (for taxonomy)
  "default_l2": "Code Agent",                 // Optional: Same as l2
  "year": "2025-06",                          // Required: "YYYY-MM" or "YYYY"
  "institution": "Stanford University",       // Required: Publishing organization
  "paper_url": "https://arxiv.org/abs/...",   // Required: Paper link
  "homepage_url": "https://...",              // Optional: Project homepage
  "leaderboard_url": "https://...",           // Optional: Leaderboard link
  "pdf_cdn_url": "https://arxiv.org/pdf/...", // Optional: Direct PDF link for inline reading
  "arxiv_pdf_url": "https://arxiv.org/pdf/...", // Optional: arXiv PDF URL
  "openness": "Public",                       // Required: "Public" | "Partly" | "In-house"
  "difficulty": "Expert",                     // Optional: "Frontier" | "Expert" | "Advanced" | "Basic"
  "modality": "Text",                         // Optional: "Text" | "Image" | "Video" | "Audio" | "Code" | etc.
  "widely_tested": false,                     // Optional: true if used in major model evals
  "mermaid_flowchart": "flowchart LR\n...",   // Optional: Mermaid diagram code (or null)
  "related_benchmarks": ["MMLU", "ARC"],      // Optional: Names of related benchmarks (must exist in DB)
  "family": "MMLU"                            // Optional: Benchmark family name
}
```

### Valid L1 Category Values

| Value | Description |
|-------|-------------|
| `General Language` | General NLP, instruction following, QA |
| `Agent Capability` | Agentic tasks, tool use, planning |
| `Multimodal` | Vision-language, image/video understanding |
| `Code` | Code generation, debugging, software engineering |
| `Science & Reasoning` | Scientific QA, logical reasoning |
| `Safety & Alignment` | Harmlessness, robustness, red-teaming |
| `Math` | Mathematical reasoning, olympiad problems |
| `Long Context` | Long document understanding, retrieval |
| `Medical & Health` | Clinical QA, biomedical NLP |
| `Video Understanding` | Video QA, temporal reasoning |
| `Chart & Document` | Chart QA, document understanding |
| `Spatial & 3D` | Spatial reasoning, 3D understanding |

### PR Checklist

Before submitting a PR, please run the local validation script:

```bash
python3 scripts/validate_benchmarks.py --html
```

This script checks for:
- Valid JSON format
- Unique `name`
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

The website's canonical Build Process presentation is HTML. The checked-in bilingual `.spec.yaml` files define the graph semantics; the standalone source generator produces the `.arch.json` metadata consumed by the HTML views. Direct sidecar edits are rejected by the source consistency gate. HTML views use explicit module membership when available. Nodes without a declared construction/evaluation stage appear in a neutral pipeline, with no inference from labels, language, or array position.

Every pull request and push to `main` runs three website gates on Ubuntu: benchmark data validation, TypeScript and the existing core regression tests, and **HTML Flowchart Validation**. The HTML gate explicitly runs full-catalog canonical source consistency (`pnpm check:build-process-source`) and HTML asset auditing (`pnpm audit:build-process`, using `--html`), then runs HTML structural tests and data/graph semantic regressions without an external Draw.io toolchain, Draw.io Desktop, or macOS. The Pages build depends on all three gates succeeding. These are workflow dependencies; changing the workflow does not update repository branch-protection settings.

A successful `main` push CI from this repository triggers deployment of that exact checked commit. Pull-request CI cannot deploy. Manual deployment checks out the selected event SHA and independently runs data validation, standalone source consistency, full-catalog HTML asset auditing, HTML flowchart tests, TypeScript, and the core regression tests before building and publishing. It also requires no external diagram toolchain.

After installing the locked project dependencies, run the website checks locally:

```bash
pnpm install --frozen-lockfile
python3 scripts/validate_benchmarks.py --html
pnpm check:build-process-source
pnpm audit:build-process
pnpm test:html-flowchart
pnpm exec tsc --noEmit
pnpm test:build-process
pnpm build:ghpages
```

The source gate checks both languages for every catalog entry, including missing artifacts, node/edge/module metadata, and Mermaid fallbacks in both detail and catalog records. It is read-only by default and fails on inconsistency. To repair sidecar drift, run `pnpm generate:flowchart-data`, then synchronize affected fallbacks with `node scripts/benchmark_build_process/sync_detail_fallbacks_from_arch.mjs --ids ExampleA,ExampleB`. Fallback synchronization updates only fallback fields in the catalog, preserving its other metadata. Rerun the source and HTML gates after generation; passing structural checks does not replace paper-level semantic review.

### Optional legacy Draw.io exports

Draw.io, SVG, and PNG exports remain optional legacy artifacts, separate from the website's HTML validation and deployment. When updating or reviewing those exports, use the existing pinned export toolchain and run **Optional Draw.io Export Fidelity** (`.github/workflows/drawio-export.yml`) manually from GitHub Actions on the desired ref. This workflow retains the full original scoped fidelity suite across eight `macos-26` shards, the pinned Draw.io toolchain, an explicit legacy asset audit (`node scripts/benchmark_build_process/audit_build_process_assets.mjs`, without `--html`), representative PNG diagnostics, and an aggregate check that fails unless every shard succeeds. It does not trigger or gate website deployment.

For local legacy fidelity checks, install the pinned toolchain documented in `scripts/ci/install_drawio_toolchain*.sh`, configure its exported tool paths, and run `pnpm test:drawio-fidelity`. Local tests may skip desktop exports when the required tools are unavailable; those skips do not establish export fidelity. The optional workflow is the separate validation path for those artifacts, and no branch-protection setting is changed by this split.

## Code of Conduct

Please be respectful and constructive. We welcome contributions from researchers, engineers, and students at all levels.
