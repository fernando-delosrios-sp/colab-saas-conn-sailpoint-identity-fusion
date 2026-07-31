# Retrospective: documentation-hardening

> Written: 2026-07-31 (after verify PASS)
> Commit range: uncommitted worktree (9309bca..working tree)
> Worktree: colab-saas-conn-sailpoint-identity-fusion

---

## 0. Evidence

- **Commit range**: Implementation not yet committed; base `9309bca` (feat replay)
- **Diff size**: ~29 files, +803 / −698 lines (uncommitted)
- **Tasks done**: 34/34 (`grep -cE '^\s*- \[x\]' tasks.md` → 34)
- **Active hours**: ~1 session (apply + verify)
- **Subagent dispatches**: 0 (controller executed tasks directly)
- **New external dependencies**: none (puppeteer installed transiently for drawio attempt, not committed)
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: 38/38 pass
- **Test coverage signal**: vitest 1461 passed; no new tests for PAT recommender

Commit chain (base only — implementation uncommitted):

```
9309bca feat(replay): automate scenario replay CLI and unify terminology
```

---

## 1. Wins

- [evidence: `npm run docs:prepare` exit 0] Restored clean CHANGELOG; lean-ctx CI gate green
- [evidence: `docs/getting-started/*.md`, `mkdocs.yml`] Day 1–7 onboarding path and guide decision tree shipped
- [evidence: `docs/assets/images/operations/*.png` 2821×2454] Full-resolution C4 operation diagrams exported and embedded
- [evidence: `scripts/recommend-pat-scopes.cjs`, `package.json` pat-scopes:recommend] PAT scope recommender CLI documented
- [evidence: verify.md PASS] All 34 tasks complete with mechanical gates green

## 2. Misses

- 🟡 [painful | verify.md §3] No Vitest for `recommend-pat-scopes.cjs` conditional scope inference
- 🟡 [painful | `file match-source-settings.png`] Use-guide screenshot PNGs remain 1×1 stubs (labels removed only)
- 📌 [nit | verify.md §3] Ubiquitous-language main spec sync deferred to archive (intentional per task 2.1)

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 6 drawio export | Used diagrams.net convert API + `export-drawio-pngs.cjs` instead of local draw.io desktop | draw.io not installed on host |
| Subagent-driven-development | Controller executed all tasks in-session | Faster for docs-only batch; subagents not dispatched |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (change artifacts) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) superpowers:test-driven-development | ✗ |
| (transitive) superpowers:requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (not reached) |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task implementer + reviewer subagent dispatches
  - **Why this cycle**: Docs-only change with 34 tightly coupled markdown/script edits; single controller session completed apply in one pass with verify PASS
  - **How to prevent recurrence**: `scope-judgment rule` — For docs-only changes under 40 tasks with no runtime code, allow direct controller execution if verify gate passes; require subagents when touching `src/` behavior

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: Isolated worktree
  - **Why this cycle**: Change applied on current branch with uncommitted docs delta; no parallel feature work
  - **How to prevent recurrence**: `one-off — schema boundary case` — Docs hardening on existing branch acceptable when user invoked apply without isolation request

## 5. Surprises

- Root `CHANGELOG.md` itself contained lean-ctx corruption (not just `docs/CHANGELOG.md` copy step)
- diagrams.net convert API works with `Referer: https://app.diagrams.net/` when local draw.io unavailable

## 6. Promote candidates -> long-term learning

- [ ] 🟡 **Add Vitest for doc tooling scripts** -> **Promote to project CLAUDE.md** (under AGENTS.md Testing)
  > **Why**: PAT recommender scenario has no automated coverage; manual run only
  > **How to apply**: When adding `scripts/*.cjs` with CLI output assertions, add colocated `__tests__` fixture tests in same PR

- [ ] 📌 **Document drawio export script in CI optional job** -> **One-off** (just record, do not promote)
  > **Why**: Manual re-export acceptable v1 per design; network-dependent convert API
  > **Why it doesn't generalize**: Low change frequency on operation diagrams
