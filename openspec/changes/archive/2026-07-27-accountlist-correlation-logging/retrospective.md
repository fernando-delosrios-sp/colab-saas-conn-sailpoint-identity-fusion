# Retrospective: accountlist-correlation-logging

> Written: 2026-07-27 (after verify passed with warnings)
> Commit range: uncommitted (working tree at archive time)
> Worktree: `/Users/fernando.delosrios/Documents/Development/ISC/connectors/colab-saas-conn-sailpoint-identity-fusion`

---

## 0. Evidence

- **Commit range**: uncommitted at archive time (11 modified source files + new change dir)
- **Diff size**: ~+350 / -30 lines across 14 files (implementation + tests + docs + change artifacts)
- **Tasks done**: 20/20
- **Active hours**: ~1 session
- **Subagent dispatches**: 2 (explore during propose)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass (`openspec validate accountlist-correlation-logging`)
- **Test coverage signal**: 138 tests passed in targeted suites (39 operationHeartbeat after gap-fill)

Commit chain: pending first commit at archive time.

---

## 1. Wins

- Gating `recordCorrelatedActionGranted` at aggregation call sites cleanly separates entitlement grants from optimistic output state (`fusionService.ts`, `decisionProcessor.ts`).
- Run-scoped correlation counters make Process enqueue totals visible during Output/Epilogue drain segments.
- Production log confusion (225ms Output + 1853 queued) is directly addressable via `completed=` / `pending=` without changing correlation behavior.

## 2. Misses

- 🟡 [painful | verify.md] Implementation remained uncommitted through verify/archive — audit trail depends on working tree until first commit.
- 📌 [nit] Initial verify flagged Epilogue drain and `countCorrelationQueuePending` tests as gaps; fixed in follow-up before archive.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.3 format flag for aggregation | Gated at call sites instead of formatter option | Simpler; counter never increments during accountList |
| 2.2 pending display | Added Process negative test + label counter test post-verify | Closed verify gaps |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (decision log in brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) test-driven-development | ✓ (tests added alongside implementation) |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (deferred — no commit/PR yet) |

### Deliberately Skipped Skills

- **superpowers:subagent-driven-development**
  - **What was skipped**: Per-task subagent dispatch from plan.md
  - **Why this cycle**: Single-session logging fix with clear spec; parent agent implemented directly after `/opsx:apply`
  - **How to prevent recurrence**: scope-judgment rule — use subagent-driven-development when plan has 5+ independent task groups or multi-file service refactors

## 5. Surprises

- `correlated-action=2000` in PHASE 5 Output was in-memory status recompute, not PATCH completion — operators read it as entitlement grants.
- First run after reset enqueues bulk link PATCHes in Process (not Refresh); queue drain continues after handler returns by design.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Correlation logs must distinguish enqueue vs drain vs entitlement** → **Promote to memory** (type: feedback)
  > **Why**: Production accountList logs conflated three metrics and looked contradictory.
  > **How to apply**: When adding observability for async/optimistic operations, always log enqueued, completed, and pending separately.

- [ ] 📌 **Commit before verify/archive when possible** → **One-off**
  > **Why**: Verify evidence referenced working tree; reproducibility improves with committed SHAs.
  > **How to apply**: Commit implementation before `/opsx:verify` on future changes.
