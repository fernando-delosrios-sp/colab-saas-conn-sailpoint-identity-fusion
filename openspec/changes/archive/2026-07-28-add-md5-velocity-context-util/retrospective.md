# Retrospective: add-md5-velocity-context-util

> Written: 2026-07-28 (after verify passed with warnings)
> Commit range: uncommitted at archive time
> Worktree: `/Users/fernando.delosrios/Documents/Development/ISC/connectors/colab-saas-conn-sailpoint-identity-fusion`

---

## 0. Evidence

- **Commit range**: uncommitted at archive time (0 commits for this change)
- **Diff size**: ~+120 / -5 lines across 7 files (implementation + connector-spec + docs + tests + change artifacts)
- **Tasks done**: 6/6
- **Active hours**: ~1
- **Subagent dispatches**: n/a (manual apply in single session)
- **New external dependencies**: none (native `crypto.createHash('md5')`)
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass (37/37)
- **Test coverage signal**: 144 passed (md5.test.ts + formatting.test.ts MD5 block)

Commit chain (chronological):

```
(none — implementation pending commit)
```

---

## 1. Wins

- [evidence: `md5.ts`, `index.ts`] Small, focused helper following existing `contextHelpers` pattern; `$MD5(text)` direct call matches user preference over `$MD5.hash(text)`.
- [evidence: `md5.test.ts`, `formatting.test.ts`] Dual-layer coverage — unit tests for edge cases plus Velocity integration tests for render-context wiring.
- [evidence: `connector-spec.json`, `docs/guides/define.md`] UI help and operator docs updated in same cycle as code.
- [evidence: `openspec validate --all`] All 37 validation items passed including change delta spec.

## 2. Misses

- 📌 [nit | evidence: verify.md §5] Implementation left uncommitted at verify/archive time alongside unrelated dirty worktree files.
- 📌 [nit | evidence: `npm run lint`] Pre-existing knip unused-export failure in `fusionService/helpers.ts` unrelated to this change.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| API shape | `$MD5.hash()` → `$MD5()` | User requested direct callable syntax mid-cycle |
| Tests | Added dedicated `md5.test.ts` | User follow-up request after initial formatting.test.ts coverage |
| Docs | Added `connector-spec.json` updates | User follow-up — not in original tasks.md |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓    |
| superpowers:writing-plans                        | ✓    |
| superpowers:using-git-worktrees                  | ✗    |
| superpowers:subagent-driven-development          | ✗    |
| (transitive) superpowers:test-driven-development | ✓    |
| (transitive) superpowers:requesting-code-review  | ✗    |
| superpowers:finishing-a-development-branch       | ✗    |

### Deliberately Skipped Skills

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: Isolated worktree setup
  - **Why this cycle**: Single-file additive helper on existing branch with unrelated dirty files; scope did not warrant worktree overhead
  - **How to prevent recurrence**: scope-judgment rule — use worktrees when change touches 5+ files across services or when worktree already has unrelated WIP

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task subagent dispatch with code-review gates
  - **Why this cycle**: Platform executed apply manually in one session; change was ~7 files / ~120 lines
  - **How to prevent recurrence**: one-off — schema boundary case for small additive helpers completed in single agent turn

- **`superpowers:requesting-code-review`**
  - **What was skipped**: Post-task reviewer subagent
  - **Why this cycle**: Skipped because subagent-driven-development was not invoked
  - **How to prevent recurrence**: schema graph fix — manual apply path should still trigger review before archive for non-trivial changes

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: Branch completion / PR workflow
  - **Why this cycle**: Archive requested before commit/PR; user has not asked for PR yet
  - **How to prevent recurrence**: CLAUDE.md trigger — run finishing-a-development-branch immediately after archive when implementation is committed

## 5. Surprises

- Velocity accepts a bare function in context (`$MD5($email)`) without wrapper object — confirmed with runtime probe before implementation.

## 6. Promote candidates → long-term learning

- [ ] 📌 **Update connector-spec.json whenever adding Velocity context helpers** → **Promote to memory** (type: feedback)
  > **Why**: Operators discover helpers via ISC UI help text; code-only + define.md updates leave the config UI stale.
  > **How to apply**: When adding a `contextHelpers/*` export, grep `connector-spec.json` for other helper names and update all help strings in the same PR.

- [ ] 📌 **Commit before archive** → **Promote to project CLAUDE.md** (opsx apply section)
  > **Why**: verify.md flagged uncommitted implementation as warning; archive without commits loses audit trail in §0 Evidence.
  > **How to apply**: Block `/opsx:archive` until MD5-related files are staged/committed unless user explicitly opts out.
