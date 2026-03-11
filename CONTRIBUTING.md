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
| `client/src/components/FilterBar.tsx` | Filter controls |
| `client/src/contexts/LangContext.tsx` | i18n translations (EN/ZH) |

---

## Code of Conduct

Please be respectful and constructive. We welcome contributions from researchers, engineers, and students at all levels.
