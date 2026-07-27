# Retrospective: omit-null-isc-account-attributes

> Written: 2026-07-27 (after verify passed)
> Commit range: `3e2f858`
> Worktree: `map-define-match` branch

---

## 0. Evidence

- **Commit range**: `3e2f858` (1 commit)
- **Diff size**: +468 / −9 lines across 13 files
- **Tasks done**: 8/8
- **Active hours**: ~1h (propose → apply → verify → archive)
- **Subagent dispatches**: 0 (direct apply in session)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none (1162/1162 vitest pass at archive)
- **OpenSpec validate state at archive**: pass (all items valid)
- **Test coverage signal**: 4 new `getFusionAttributeSubset` tests; full suite green

Commit chain:

```
3e2f858 Omit nullish keys from ISC account attribute output.
```

---

## 1. Wins

- In-loop null omission in `getFusionAttributeSubset` — zero extra pass, negligible CPU cost
- Spec scenarios covered by unit tests including absent-key case
- Discovered and fixed authorized-decision correlation regression (`CorrelationManager`) while verifying — 3 failing tests restored

## 2. Misses

- 🟡 Verify initially flagged pre-existing `fusionService` failures as unrelated; root cause was real production gap in correlation gating
- 📌 Retrospective written at archive time rather than immediately post-verify (process slip, not functional)

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Scope | Added `correlationManager.ts` fix | Authorized merge decisions stopped PATCH-correlating after assemble cleared missing-accounts |
| Spec sync | Manual merge before archive | Fixed verify warning early; archive sync is idempotent |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (synthesized into brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) test-driven-development | ✓ (tests before implementation) |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (pending post-archive) |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task subagent dispatch with code-review subagents
  - **Why this cycle**: User invoked `/opsx:apply` directly; single focused change completed in one session with TDD manually
  - **How to prevent recurrence**: For superpowers-bridge changes, invoke apply via subagent-driven-development when scope exceeds one file or >30 min

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: Isolated worktree
  - **Why this cycle**: Small change on existing feature branch `map-define-match`
  - **How to prevent recurrence**: one-off — schema boundary case for small deltas on active branch

## 5. Surprises

- `applyPerSourceCorrelationIfNeeded` early-return on empty missing-accounts masked authorized-decision PATCH correlation — unrelated to null omission but surfaced during verify warning fixes

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Check correlation after assembleAccount clears missing-accounts** → **Promote to memory**
  > **Why**: Authorized link-to-existing decisions failed silently when missing set emptied before correlate ran
  > **How to apply**: When changing decisionProcessor ↔ correlationManager ordering, run `processFusionIdentityDecision sourceType` tests

- [ ] 📌 **Null omission is output-only** → **One-off**
  > **Why**: Internal bags retain nulls for mapping; only platform subset changes
  > **How to apply**: Document in schema-service spec (done)
