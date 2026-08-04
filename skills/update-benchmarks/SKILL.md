---
name: update-benchmarks
description: Use when updating benchmark catalog data, detail records, Build Process assets, CI, GitHub Pages, branches, worktrees, or dependency PRs in joe1chief/llm-benchmark-costco.
---

# Update LLM Benchmark Costco

## Overview

Treat local changes, a remote branch, a merged PR, successful `main` CI, and a live Pages deployment as five independent states. Never infer a later state from an earlier one.

## Preflight

Read the live repository contract before changing anything:

```bash
git status -sb
git diff --stat
git ls-files --others --exclude-standard
git worktree list --porcelain
git branch -vv
git fetch origin --prune
gh pr list --state open
git remote get-url origin
```

- Use `client/public/benchmarks.json` as the catalog source of truth. Do not create an untracked root copy.
- Read `package.json`, `.github/workflows/ci.yml`, and `.github/workflows/deploy.yml`; commands, job dependencies, warning policy, and historical counts can change.
- If the current checkout contains unrelated changes, create a clean `codex/*` branch/worktree from `origin/main`. Never use `git add .` in a mixed worktree.
- If another process creates or changes files in a worktree, stop. Do not stash, remove, prune, or force-delete an actively written worktree.

## Update Contract

1. Confirm the source, expected record count, allowed additions/deletions, and generated-vs-authored ownership.
2. Update only the required catalog, `benchmarks_detail`, Draw.io/spec/manifest, type, or README-stat files. Preserve ordering and unrelated records.
3. Review the semantic diff: unique IDs/names, required fields, resolvable related benchmarks, nullable values, asset paths, and bilingual Build Process consistency.
4. Do not invent enum values, URLs, prompts, evidence, or missing metadata. Fix the source mapping or record an explicit unknown boundary.

Validation warnings are not errors, but they are not invisible. Require exit code 0 and zero errors; review and disclose every warning. Warning and passed/skipped/failed test counts must come from the current exact-SHA run; never reuse historical counts.

## Local Gates

Run the fastest gate first, then mirror CI:

```bash
python3 scripts/validate_benchmarks.py
python3 scripts/update_readme_stats.py
pnpm exec tsc --noEmit
pnpm test:build-process
pnpm build:ghpages
test -f dist-ghpages/index.html
test -f dist-ghpages/benchmarks.json
git diff --check
```

Review the final diff after the README updater. If Build Process assets changed, also run the relevant scoped tests and `pnpm audit:build-process`.

CI runs data validation and TypeScript/regression checks alongside eight macOS Draw.io fidelity shards. The final Pages build depends on all upstream jobs. Therefore:

- `Build Check (GitHub Pages): skipped` means an upstream gate did not succeed; it is not a pass.
- A test case skipped by an explicit platform/superseded contract is not a failed job, but must not be counted as passed.
- Every required macOS shard must succeed when Draw.io fidelity is part of the workflow.
- CodeQL is blocking only when repository rules mark it required; report neutral/not-configured separately.

## Publish and Deploy

Push the current topic branch, verify its remote SHA, and open a PR to `main`. Do not push directly to `main` and do not run `npx gh-pages` in the normal path.

```bash
test -n "$(git branch --show-current)"
test "$(git branch --show-current)" != main
test "$(git branch --show-current)" != master
git merge-base --is-ancestor origin/main HEAD
git add -- <intended-paths>
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "<scoped message>"
git push -u origin HEAD
test "$(git rev-parse HEAD)" = "$(git ls-remote --heads origin "$(git branch --show-current)" | cut -f1)"
gh pr create --base main --head "$(git branch --show-current)"
```

Before merge, use `gh pr view` and `gh pr checks --watch` to verify the PR head SHA and every required check. If `main` advances or the PR becomes `BEHIND`, update it and rerun checks; never rely on an older green run. Never use admin merge, weaken branch protection, or remove required checks to bypass a gate.

Treat each Dependabot PR independently. A benchmark update does **not** authorize dependency changes: unless the user explicitly requests Dependabot merging, report status only. When authorized, refresh live merge state, sync a behind branch, wait for checks on the new head SHA, and merge only if still clean.

After merge, verify the PR is `MERGED` and its commit is reachable from remote `main`. Then use `gh run list --workflow "CI — Validate & Build Check" --commit <main-sha>` and `gh run view <run-id>` on that exact SHA. A successful `main` CI triggers `Deploy to GitHub Pages`, which publishes the verified source SHA to `gh-pages`. Confirm the deployment run records that `main` source SHA; the resulting `gh-pages` commit has a different SHA. Finally verify the live URL and representative updated records.

| Claim | Required evidence |
|---|---|
| Uploaded | Remote topic-branch SHA equals the local commit |
| Merged | PR is `MERGED`; merge/squash SHA is in remote `main` |
| CI healthy | Final PR SHA and resulting `main` SHA have all required checks successful |
| Deployed | Pages run succeeded for that `main` SHA and the live site serves the update |

## Recoverable Cleanup

Clean only when explicitly requested and only after publication evidence exists.

1. Inventory every branch/worktree and inspect unique commits and open PR references.
2. Preserve mixed work with `git stash push -u`; note that ignored files are excluded. If material ignored files exist, leave the worktree in place until the user chooses a separate secret-safe backup.
3. Put backups outside every worktree, then anchor and verify them:

   ```bash
   git update-ref refs/backup/cleanup-<timestamp>/<label> "$(git rev-parse refs/stash)"
   git bundle create <external-backup-directory>/<repository>.bundle --all
   git bundle verify <external-backup-directory>/<repository>.bundle
   shasum -a 256 <external-backup-directory>/<repository>.bundle
   ```

4. Immediately recheck status, Git locks, worktree registration, and active writers. If inactivity is uncertain, leave it. Otherwise remove only clean, unlocked worktrees without `--force`; then delete only bundled/merged branches not referenced by open PRs and run `git worktree prune`.
5. If a removed worktree reappears or new files arrive during cleanup, stop: a concurrent task owns it.

## Red Flags

- `git add .` with unrelated changes
- `git push origin main` while working on another branch
- direct `gh-pages` publishing during the Actions-managed path
- declaring CI healthy when a required job is skipped, neutral, stale, or tied to another SHA
- deleting a dirty/reappearing worktree or a branch referenced by an open PR
- claiming deployment from build success without checking the Pages run and live site
