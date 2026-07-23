# LLM Benchmark Costco 🛒

[![Stars](https://img.shields.io/github/stars/joe1chief/llm-benchmark-costco?style=flat-square&logo=github&color=yellow)](https://github.com/joe1chief/llm-benchmark-costco/stargazers)
[![Forks](https://img.shields.io/github/forks/joe1chief/llm-benchmark-costco?style=flat-square&logo=github&color=blue)](https://github.com/joe1chief/llm-benchmark-costco/network/members)
[![License](https://img.shields.io/github/license/joe1chief/llm-benchmark-costco?style=flat-square&color=green)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/joe1chief/llm-benchmark-costco?style=flat-square&color=orange)](https://github.com/joe1chief/llm-benchmark-costco/commits/main)
[![Benchmarks](https://img.shields.io/badge/Benchmarks-610-purple?style=flat-square)](https://joe1chief.github.io/llm-benchmark-costco/)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=flat-square&logo=github)](https://joe1chief.github.io/llm-benchmark-costco/)

> A curated, searchable database of **610 LLM evaluation benchmarks** across 16 capability dimensions — with inline PDF reading, bilingual Draw.io build-process review baselines, bilingual UI, dark mode, **neon glow effects**, and **automated CI/CD**.

**[🌐 Live Demo](https://joe1chief.github.io/llm-benchmark-costco/)** · **[📊 Browse Benchmarks](https://joe1chief.github.io/llm-benchmark-costco/)** · **[🤝 Contribute](CONTRIBUTING.md)**

---

![LLM Benchmark Costco Demo](demo.gif)

---

## Why LLM Benchmark Costco?

| Feature | Costco | PapersWithCode | HuggingFace Datasets | arXiv Search |
|---------|--------|---------------|---------------------|-------------|
| Curated LLM benchmarks only | ✅ | ❌ (all ML) | ❌ (all datasets) | ❌ |
| Inline PDF reading | ✅ | ❌ | ❌ | ❌ |
| Build process flowcharts | ✅ | ❌ | ❌ | ❌ |
| Multi-dim filtering (year/difficulty/openness) | ✅ | Partial | Partial | ❌ |
| Bilingual (EN/ZH) | ✅ | ❌ | ❌ | ❌ |
| Related benchmarks & family lineage | ✅ | ❌ | ❌ | ❌ |
| Dark mode with neon glow effects | ✅ | ❌ | ❌ | ❌ |
| Automated CI/CD deployment | ✅ | ❌ | ❌ | ❌ |

## Features

- **610 Benchmarks** across 16 capability dimensions — Agent Capability (96), General Language (76), Multimodal (132), Code (63), Science & Reasoning (39), Safety & Alignment (44), Medical & Health (85), and more.
- **Neon Glow & Shimmer Effects** — Interactive neon glow effect on card hover and a subtle shimmer animation on the logo in dark mode.
- **Inline PDF Reading** — Click any card to open the details drawer and read the full paper without leaving the page. Most entries embed the original arXiv PDF directly.
- **Build Process Flowcharts** — All 614 catalog entries include bilingual Draw.io review-baseline diagrams and editable sources, with formal paper-alignment status tracked separately in the manifest and **fullscreen mode** for complex flows.
- **Powerful Filtering** — Filter by L1 capability category, year (including 2025/2026 latest), difficulty level (Basic → Frontier), and data openness (Public / Partly / In-house).
- **Family & Lineage** — Explore benchmark families (e.g., MMLU, GAIA, SWE-bench) and related benchmarks to understand the evaluation landscape.
- **Bilingual UI** — Full English and Chinese interface with bilingual data fields.
- **Automated CI/CD** — GitHub Actions automatically validate and deploy updates to GitHub Pages when benchmark data or public assets change.

## Quick Start

```bash
# Install dependencies
pnpm install

# Local development
pnpm dev

# Build for GitHub Pages
pnpm build:ghpages
```

## Deployment

This project uses **GitHub Actions** for automated deployment. Any push to the `main` branch that includes changes under `client/public/**` will trigger validation, a GitHub Pages build, and deployment to the `gh-pages` branch.

A daily cron job also runs to sync recent public benchmark data and asset changes.

### Manual Deployment

If you need to deploy manually:

1. Fork or clone this repository
2. Go to **Settings → Pages**
3. Set Source to **Deploy from a branch** → `gh-pages`
4. Run `pnpm build:ghpages && npx gh-pages -d dist-ghpages` to deploy

Access at: `https://<username>.github.io/llm-benchmark-costco/`

> **Sub-path configuration**: If deploying under a sub-path, set `base: 
'/your-repo-name/
'` in `vite.ghpages.config.ts`.

## Updating Benchmark Data

The data lives in `client/public/benchmarks.json`. Before updating, read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the complete workflow covering data schema, validation, and CI process.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Build | Vite 7 |
| Routing | Wouter |
| CI/CD | GitHub Actions |
| Icons | Lucide React |
| Diagrams | Draw.io (SVG + editable sources) |
| Deployment | GitHub Pages |

## Project Structure

```
llm-benchmark-costco/
├── .github/workflows/              # GitHub Actions CI/CD
│   ├── ci.yml                      # PR validation
│   ├── deploy.yml                  # Deploy on data change
│   └── sync-and-deploy.yml         # Daily sync
├── client/
│   ├── public/
│   │   └── benchmarks.json          # 610 benchmark entries
│   └── src/
│       ├── components/
│       │   ├── BenchmarkCard.tsx     # Card component with neon glow
│       │   ├── BenchmarkDrawer.tsx   # Detail drawer + PDF + flowchart
│       │   ├── FilterBar.tsx         # Filter controls
│       │   └── Navbar.tsx            # Top navigation with logo shimmer
│       ├── contexts/
│       │   └── LangContext.tsx       # i18n (EN/ZH)
│       ├── hooks/
│       │   └── useBenchmarks.ts      # Data loading & filtering
│       └── types/
│           └── benchmark.ts          # TypeScript types
├── scripts/
│   └── validate_benchmarks.py      # Data validation script
├── vite.ghpages.config.ts            # GitHub Pages build config
└── README.md
```

## Contributing

We welcome contributions! The easiest way to contribute is to submit a new benchmark via [GitHub Issues](https://github.com/joe1chief/llm-benchmark-costco/issues/new/choose) using the **Submit New Benchmark** template — no coding required.

For code contributions, please read [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributors

[![Contributors](https://contrib.rocks/image?repo=joe1chief/llm-benchmark-costco)](https://github.com/joe1chief/llm-benchmark-costco/graphs/contributors)

## License

MIT
