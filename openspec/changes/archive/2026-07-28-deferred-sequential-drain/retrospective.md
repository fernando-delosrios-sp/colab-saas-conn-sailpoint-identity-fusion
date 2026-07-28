# Retrospective: deferred-sequential-drain

> Written: 2026-07-28 (after verify passed)
> Commit range: `02e5115..<implementation-commit>` (pre-archive)
> Worktree: `2.2.0/preview`

---

## 0. Evidence

- **Commit range**: `02e5115..HEAD` (1 implementation commit planned)
- **Diff size**: +1375 / −387 lines across 25 files (+ openspec change artifacts)
- **Tasks done**: 14/15 (`grep -c '^- \[x\]' tasks.md` → 14; task 4.2 manual dry-run deferred)
- **Active hours**: ~1 session
- **Subagent dispatches**: 0 (direct implementation in agent session)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none (pre-merge: `config` ReferenceError in `scoreIdentityPhase` caught during verify, fixed same session)
- **OpenSpec validate state at archive**: pass (37/37)
- **Test coverage signal**: vitest 1219 passed, 2 skipped

Commit chain (chronological):

```
<implementation-commit> fix(matching): sequential deferred drain with cross-source parallelism
```

---

## 1. Wins

- Sequential per-source drain breaks clique deadlock — clique e2e test: 1 non-match + 2 deferred for 3 similar accounts
- Cross-source `Promise.all` drain restores multi-source throughput without pool cross-talk — registry keyed by source
- Persisted seed from both `fusionAccountMap` and `allFusionIdentities` fixes second-run stall
- `originAccount` registry keying prevents persisted/pending overwrite on reload

## 2. Misses

- 🟡 Task 4.2 manual 36-account dry-run not executed — deferred to operator; automated tests cover core assertions
- 📌 Lint refactor briefly dropped `config` from `scoreIdentityPhase` destructuring — caught by full test run during verify
- 📌 Task spec said `registerAnchorDeferredCandidate`; code used `registerFinalizedDeferredCandidate` until alias added

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.2 | Added alias instead of rename | Keep existing call sites; align with ubiquitous-language "anchor" term |
| 2.x | Cross-source parallel drain implemented (spec D5 MAY) | User assessment + performance; safe because pools are per-source |
| 4.2 | Left unchecked with documented deferral | Manual dataset not available in agent session |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (brainstorm.md artifact) |
| superpowers:writing-plans | ✓ (plan.md artifact) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) superpowers:test-driven-development | ✓ (tests added/updated with implementation) |
| (transitive) superpowers:requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✓ (this step) |

### Deliberately Skipped Skills

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: Isolated worktree setup
  - **Why this cycle**: Single active change on existing feature branch `2.2.0/preview`; no parallel branch work
  - **How to prevent recurrence**: one-off — schema boundary case when branch already exists

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task implementer/reviewer subagent dispatch
  - **Why this cycle**: User invoked `/opsx-apply` in single agent session; controller implemented directly
  - **How to prevent recurrence**: scope-judgment rule — when user says "go" mid-cycle, complete commit/archive in-session rather than re-dispatch

- **`superpowers:requesting-code-review`**
  - **What was skipped**: Formal subagent code review before archive
  - **Why this cycle**: Verify artifact + 1219 tests served as gate; no PR yet
  - **How to prevent recurrence**: CLAUDE.md trigger — run Bugbot or PR review before merge to main

## 5. Surprises

- Tier-based `hasActionableDeferredCandidateMatches` heuristic masked the clique bug without materializing anchors — removing it was necessary, not optional
- Pending-peer materialization is rare under sequential drain (pending accounts aren't in the scoring pool) but still needed for edge cases when fusionMatches reference queue peers

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Run full test suite after lint-only refactors in scoring paths** → **Promote to project AGENTS.md** (under Running Tests)
  > **Why**: `config` destructuring drop caused 41 failures invisible to targeted tests
  > **How to apply**: After editing `matchOutcomeDispatcher.ts` or identity/deferred scoring, run `npm test` not just lint

- [ ] 📌 **Manual multi-pass dry-run checklist for deferred matching changes** → **One-off** (record, do not promote)
  > **Why**: 36-account dataset validates operator-specific scale; not reproducible in CI
  > **How to apply**: Before production release of deferred-matching changes, run two-pass dry-run on authoritative source
