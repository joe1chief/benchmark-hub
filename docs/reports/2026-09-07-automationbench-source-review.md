# AutomationBench source refresh — 2026-09-07

The existing `AutomationBench` record was updated using the project benchmark Skill. Its ID is retained: the catalog still contains 610 benchmarks. The other 609 catalog and manifest records, including their order, are unchanged.

## Source identity and review

- Official repository: [zapier/AutomationBench at 4a8e1061254004d9dac807054eed33fad7d1ff14](https://github.com/zapier/AutomationBench/tree/4a8e1061254004d9dac807054eed33fad7d1ff14).
- Package version: [1.0.6](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/pyproject.toml#L7); version changes are described in [CHANGELOG.md](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/CHANGELOG.md).
- Construction history: [arXiv:2604.18934v1](https://arxiv.org/html/2604.18934v1), Sections 2–4, Table 2, and Sections 5–7.
- Current runtime and scoring claims follow the pinned repository. Paper-era construction and private-set counts are explicitly attributed to paper v1. Public source inspection cannot establish the current private evaluator or private task count.

Source review consisted of reading the paper and the relevant official code, checking the proposed EN/ZH content against those sources, and statically counting public dataset entries without executing the benchmark. Automated source gates validate generated assets and supplied review metadata; they do not perform or certify this semantic review.

## Content changes

The two language specifications each contain 33 nodes and 41 edges, with identical topology, edge types, order, and module membership: 14 construction nodes and 19 evaluation nodes.

Construction now shows workflow-pattern inspiration, domain selection, synthetic task revision, task/assertion contracts, simulated API worlds, task hardening, hint auditing, sampled review, RLVR feedback into reward design, and versioned fairness revisions. Hint mode is a separate solvability check and does not supply actual parameter values. The graph does not invent a clustering algorithm or claim that all tasks passed human review.

Evaluation now preserves the Agent/tool feedback loop, the scoring denominator rules, the bounded abort-recovery loop, remaining-abort outcomes, and separate public/simple/private reporting paths. In particular:

| Contract | Pinned implementation evidence |
|---|---|
| `domains=all` selects six public business domains; simple requires explicit selection | [domain definitions](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/domains/__init__.py#L21), [CLI domain selection](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/scripts/eval.py#L700) |
| Each selected task receives fresh simulated state | [runner setup](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/runner.py#L199) |
| CLI defaults are API tools and at most 50 model responses; these are not 50 tool calls | [CLI response budget](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/scripts/eval.py#L542), [toolset option](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/scripts/eval.py#L630) |
| API discovery uses BM25 with default `top_k=5` | [API search](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/tools/api/search.py#L124) |
| Explicit exclusions and initially satisfied conditions affect the denominator; broken guard conditions fail; `excluded: false` may force inclusion | [rubric](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/rubric/__init__.py#L43) |
| `partial_credit` is passed/effective assertions, or zero for an empty denominator; strict completion is `partial_credit == 1` | [reward functions](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/rubric/__init__.py#L114) |
| Abort detection checks a trailing assistant tool request and response steps below `cap - 2`; it does not retry every failed task | [abort classifier](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/export.py#L15) |
| Automatic completion requires export, no explicit task slice and zero skip; default maximum is three rerun rounds | [CLI options and completion gate](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/scripts/eval.py#L671) |
| Reruns merge matching task names, keep the existing identity and position, and recompute aggregates; custom `search_top_k` is not forwarded | [completion helper](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/scripts/complete_run.py#L96) |

The main `auto-bench` path does not use the remaining-abort return value as its process exit status. A successful process exit therefore cannot establish that all selected tasks finished. The diagram retains the remaining-abort terminal and the disabled/sliced-run bypass rather than treating bounded recovery as guaranteed success.

## Public task inventory

Counts were obtained by inspecting the `get_*_dataset` Python ASTs. Finance and HR count `task_fns` before the unfiltered `apply_noise(fn())` projection; the other domains count their task lists. No upstream module was imported.

| Domain | Tasks | Loader line in `automationbench/domains/<domain>/tasks.py` | SHA-256 of source file |
|---|---:|---:|---|
| sales | 100 | 32154 | `393d265026fb69b3254bf6f172e298c79e48444f35fba6cd955e605e224f21ee` |
| marketing | 100 | 38253 | `9fc7da71b77f8cb3e4a1dc5cfbd33f85e7d88b954b1fb904e1c51e60a52d9a04` |
| operations | 100 | 30772 | `3c50c69b774a5bee99e1bc4f39dd337302d0ce480906ba8582eb73acd16cb5bc` |
| support | 100 | 56962 | `a9429e87c1c62878b876bc82ab09739fc482c204d7f37803975aad178084cc06` |
| finance | 100 | 19553 | `7ce169cc71ee6be1f22cd0c6239cfc4cb9cfa2faa5496b0acf878ecf4fe6d49a` |
| hr | 100 | 23422 | `c173a36a03f43096bd122577584aa32f9df379d8760aa46c43be04c85d101779` |
| simple | 200 | 10796 | `c5b1470ed22ba892c3a08be4836131e1a9dafe9c97adc4d5f9d1cd4766c2394a` |

This establishes 600 public business-domain tasks plus 200 simple baseline tasks at the pinned commit. The metadata describes 47 simulated SaaS applications; approximately 500 endpoints and 600+ private tasks are identified as paper-v1 claims, not freshly measured private-release facts.

## Skill application and reconstruction

AutomationBench already exists, so this update follows the Skill's existing-ID revision path. Authored metadata, source evidence, and bilingual specifications were prepared and reviewed in staging, then the actual `manage_benchmark.mjs --rebuild AutomationBench --write` path generated the models and fallbacks. Staging used the full 610-record dataset and the real validator, source gate, and HTML audit. The seven reviewed data files were applied as one guarded atomic batch.

Two successive rebuild dry-runs against the resulting checkout both reported `changed_files: []`. Both checked 1,220 graph sources with zero model drift and zero fallback drift. Manifest lineage hashes cover the actual EN/ZH spec and arch bytes.

The published Skill machinery also provides dry-run new-ID ingestion, conflict rejection, atomic writes with rollback, concurrent-write and symlink checks, and deterministic rebuilds. The shared topology layout now supports cyclic graphs, preserves edge labels, and distinguishes optional edges. A synthetic addition fixture and an isolated GAIA restoration exercise validate those generic paths; neither adds an extra real catalog entry.

The Skill's verification instructions distinguish repeat-add checks for new IDs from repeat-rebuild checks for existing-ID revisions, as exercised here.

## Local validation

| Check | Result |
|---|---|
| `npm run test:benchmark-ingestion` | 3 statistics, 11 CLI, and 14 frontend tests passed |
| `npm run test:build-process` | 41 Python, 128 audit, and 103 frontend tests passed |
| `npm run test:html-flowchart` | 15 source/fallback tests and 724 retained HTML regressions passed; 219 optional legacy export tests excluded by the established HTML-only suite |
| `npm run check` | TypeScript passed |
| `npm run check:build-process-source` | 1,220 checked; zero model/fallback drift |
| `npm run build:ghpages` | Successful Pages build with production data |
| `git diff --check` | Passed |

The production build was served locally and inspected in Chrome. Chinese/dark and English/light each loaded all three views: CSS+HTML flowchart, stage cards, and interactive topology. Counts, stage membership, translated descriptions, line breaks and branch labels were checked; CSS and topology screenshots were visually inspected. Both language model requests returned HTTP 200, and the cyclic topology rendered without hanging. This is a functional and visual spot check, not a pixel-diff guarantee across all screens.

No model evaluation, actual SaaS operation, private dataset access, or new model score was performed or claimed. Legacy Draw.io/SVG/PNG files were not regenerated; their obsolete active pointers and export-review claims were removed for this entry. Publication is verified separately through the PR, required checks, deployment lineage, and live assets.
