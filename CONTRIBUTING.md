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
python3 scripts/validate_benchmarks.py
```

This script checks for:
- Valid JSON format
- Unique `name`
- Correct `l1` category values
- Valid `related_benchmarks` references
- Correct `year` format

Our CI (`.github/workflows/ci.yml`) will automatically run this validation on your PR.

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

The checked-in `.spec.yaml` files are the canonical graph source. Generate `.arch.json` with the pinned Draw.io toolchain; direct sidecar edits are rejected by CI. The HTML views use explicit module membership when available. Nodes without a declared construction/evaluation stage appear in a neutral pipeline, with no inference from labels, language, or array position.

Every pull request and push to `main` runs data validation, TypeScript, frontend regression tests, and the source consistency gate. Only after those pass do the eight macOS export-fidelity shards run. The Pages build requires all shards to pass. A successful `main` push CI triggers deployment of that exact checked commit; pull-request CI cannot deploy. The existing manual deployment entry also runs the source consistency gate.

For local source validation, install the same pinned toolchain used by `scripts/ci/install_drawio_toolchain*.sh` and set `IMPORTER_DRAWIO_E2E_CLI` to its `skills/drawio/scripts/cli.js`:

```bash
pnpm check:build-process-source
node --test scripts/benchmark_build_process/check_arch_sources.test.mjs
pnpm test:build-process
pnpm test:drawio-fidelity
pnpm build:ghpages
```

The source gate checks both languages for every catalog entry, including missing artifacts, node/edge/module metadata, and Mermaid fallbacks in both the detail and catalog records. It is read-only by default and fails if the generator is unavailable. To repair sidecar drift, run `node scripts/benchmark_build_process/check_arch_sources.mjs --write`, then synchronize affected fallbacks with `node scripts/benchmark_build_process/sync_detail_fallbacks_from_arch.mjs --ids ExampleA,ExampleB`. A changed spec also requires rebuilding its Draw.io/SVG/PNG assets through the existing export workflow. Fallback synchronization updates only fallback fields in the catalog, preserving its other metadata.

Local fidelity tests skip desktop exports when Draw.io Desktop is unavailable; that result does not replace the macOS CI gate or a paper-level semantic review.

## Code of Conduct

Please be respectful and constructive. We welcome contributions from researchers, engineers, and students at all levels.
