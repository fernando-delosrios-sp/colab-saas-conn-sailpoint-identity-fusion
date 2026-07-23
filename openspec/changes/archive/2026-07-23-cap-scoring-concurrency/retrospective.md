# Retrospective: cap-scoring-concurrency

> Written: 2026-07-23 (after verify passed)
> Commit range: uncommitted (working tree)
> Worktree: colab-saas-conn-sailpoint-identity-fusion

---

## 0. Evidence

- **Commit range**: uncommitted (session implementation, not yet committed)
- **Diff size**: ~12 files touched (config, collections, matchOutcomeDispatcher, tests, connector-spec, main spec)
- **Tasks done**: 15/15
- **Active hours**: ~1 session
- **Subagent dispatches**: n/a (direct implementation)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass (38/38, deltaCount: 3)
- **Test coverage signal**: vitest 982 passed (+4 concurrency tests)

---

## 1. Wins

- Reused existing `promiseAllBatched` — minimal diff, aligned with fusion phases
- Default effective concurrency dropped from 100 → 12 without changing batch grouping
- Concurrency tests use in-flight tracking — validates spec scenarios directly

## 2. Misses

- 🟡 Nested delta spec path (`matching-service/match-outcome-dispatch/`) caused `deltaCount: 0` until flattened to `match-outcome-dispatch/`
- 📌 Initial verify flagged uncommitted worktree — expected until user commits

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Delta spec path | Flat `specs/match-outcome-dispatch/` | OpenSpec parser requires single-level capability folders |
| Main spec sync | Manual merge before archive | Faster verify fix; archive uses `--skip-specs` or idempotent sync |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) test-driven-development | partial |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task subagent dispatch with code review gates
  - **Why this cycle**: Single focused change (~12 files); user drove `/opsx:apply` directly in one session
  - **How to prevent recurrence**: scope-judgment rule — use subagents when change touches 3+ independent subsystems or exceeds 20 tasks

## 5. Surprises

- Uncapped `Promise.all` was the only scoring outlier; fusion phases already capped at 12
- Deferred matching doubles scoring calls — concurrency tests must disable deferred or track phase separately

## 6. Promote candidates → long-term learning

- [ ] 🟡 **OpenSpec delta paths must be flat capability folders** → **Promote to memory**
  > **Why**: Nested `specs/matching-service/match-outcome-dispatch/` parsed as zero deltas
  > **How to apply**: When writing change delta specs, use `specs/<capability>/spec.md` matching openspec list output

- [ ] 📌 **Separate scoringMaxConcurrency from managedAccountsBatchSize** → **One-off** (documented in connector-spec helpKey)
  > **Why**: Operators may expect batch size alone to control throughput
  > **How to apply**: Already in developer settings description
