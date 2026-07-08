# XHS favorites full visible scan update, 2026-07-07

Source files:

- `/Users/a15574366334/Documents/Codex/2026-06-04/new-chat-2/outputs/xhs_favorites_latest_full_visible_scan.csv`
- `/Users/a15574366334/Documents/Codex/2026-06-04/new-chat-2/outputs/xhs_favorites_latest_full_visible_benchmark_check.md`
- `/Users/a15574366334/Documents/Codex/2026-06-04/new-chat-2/outputs/xhs_benchmark_latest_favorites_delta.csv`

Observed scan facts:

- The XHS page displayed `笔记・311`, while the browser-visible full scroll returned 273 rows.
- Returned indices covered `0` through `272` with no index gap.
- The full-visible scan produced 48 keyword candidates.
- 33 keyword candidates were not already represented in the benchmark table.

Import decision:

- Do not import raw `xhs_favorites_latest_full_visible_scan.csv` rows directly. The raw scan only contains favorites-card fields: `idx`, `noteId`, `title`, `author`, `link`, and `text`.
- Use the verified delta file for benchmark-level decisions.
- The latest verified delta contains four `verified_benchmark` rows that already exist in `client/public/benchmarks.json`:
  - `PACE-Bench`, matched by `paper_url=https://arxiv.org/abs/2607.02032`
  - `PlanBench-XL`, matched by `paper_url=https://arxiv.org/abs/2606.22388`
  - `MedSP1000`, matched by `paper_url=https://arxiv.org/abs/2606.05112`
  - `PawBench`, matched by `homepage=https://github.com/agentscope-ai/PawBench`
- Rows marked `already_in_table`, `not_benchmark`, or `unclear` are intentionally not added.

Website state after review:

- `client/public/benchmarks.json` remains at 608 entries.
- The local validation baseline passed with 0 errors and 0 warnings.
- CI/CD trigger coverage was expanded so changes under `client/public/**` also run validation/build/deploy, covering detail JSON and static assets beyond the summary JSON.
