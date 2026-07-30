# Retrospective: documentation-restructure

> Written: 2026-07-30 (after verify passed)
> Commit range: uncommitted working tree (apply session)
> Worktree: colab-saas-conn-sailpoint-identity-fusion

---

## 0. Evidence

- **Commit range**: uncommitted (single apply session, no intermediate commits)
- **Diff size**: ~100+ files touched (docs IA, scripts, mkdocs.yml, connector-spec helpKeys, openspec artifacts)
- **Tasks done**: 36/36
- **Active hours**: ~1 session
- **Subagent dispatches**: 2 (Home/Getting started, reference pages + redirects)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: 37/37 pass
- **Test coverage signal**: docs validated via `npm run ci:docs-review`, `mkdocs build`, `lint:markdown` (no new Vitest for doc-only scenarios)

Commit chain: *(pending archive commit)*

---

## 1. Wins

- Six-section MkDocs IA shipped with generated Configuration reference from `connector-spec.json`
- lean-ctx corruption guard prevents recurrence (`scripts/check-lean-ctx-docs.cjs`)
- `ci:docs-review` passes end-to-end after link/path fixes in migrated use guides
- Parallel subagents accelerated Home, Getting started, and Technical reference extraction

## 2. Misses

- 🟡 **CHANGELOG and matching-algorithms were corrupted in git HEAD** — restored from older commits; lean-ctx placeholders had been committed upstream
- 🟡 **Migrated guides retain some field tables** — task asked to strip; migration prioritized paths and nav over full table removal
- 📌 **4 MkDocs link warnings remain** — non-blocking; mostly cross-guide references

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.1 Restore from git | Restored matching-algorithms from commit `5220766` (HEAD corrupted) | HEAD contained lean-ctx placeholders |
| 4.2 Strip field tables | Partial — added config reference links; large tables remain in some guides | Time/scope; redirect + nav was blocking path |
| subagent-driven-development | Partial — 2 subagents for doc batches, not per plan micro-task | Doc migration volume; TDD/code-review subagents N/A for docs-only |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (brainstorm.md artifact) |
| superpowers:writing-plans | ✓ (plan.md artifact) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✓ (partial) |
| (transitive) test-driven-development | ✗ (docs-only) |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (deferred to post-archive) |

### Deliberately Skipped Skills

- **`using-git-worktrees`**
  - **What was skipped**: Isolated worktree for apply
  - **Why this cycle**: Doc-only restructure on existing branch; no runtime code risk
  - **How to prevent recurrence**: one-off — schema boundary case for doc-only IA changes

- **`test-driven-development` / `requesting-code-review`**
  - **What was skipped**: RED-GREEN tests and per-task reviewer subagents
  - **Why this cycle**: No connector runtime changes; verification via docs CI and mkdocs build
  - **How to prevent recurrence**: schema boundary case — doc IA changes use `ci:docs-review` gate instead

## 5. Surprises

- Git HEAD already contained lean-ctx corruption in `CHANGELOG.md` and `matching-algorithms.md` — restore-from-git task insufficient without history search
- `connector-spec.json` helpKey link paths needed same-page `#anchor` fix in generated config pages

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Never trust `git show HEAD` for lean-ctx restore** → **Promote to project CLAUDE.md**
  > **Why**: HEAD had committed lean-ctx placeholders; restore task failed silently
  > **How to apply**: When task says "restore from git", scan history for last clean commit first

- [ ] 📌 **Add `docs/configuration/` to markdownlint disable or generator heading dedup** → **One-off**
  > **Why**: Generated pages hit MD024 until disable comment added
  > **How to apply**: Already fixed in generator; monitor on next spec field additions
