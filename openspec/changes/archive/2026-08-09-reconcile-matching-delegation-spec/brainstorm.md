# Brainstorm: Reconcile Matching Delegation Spec

## Context

Spec drift audit (2026-08-08) flagged **matching delegation** and **match sweep orchestration** as high-severity gaps. Investigation shows the code implements a coherent three-layer model that matches `match-outcome-dispatch/spec.md`, while `fusion-service/spec.md` still describes the incomplete July 2026 `extract-map-define-match-services` target (FusionService → MatchingService.processUncorrelatedManagedAccounts, ManagedAccountMatchingRunner).

Current runtime architecture:

```
FusionService (pipeline phases)
  ├─ initializeManagedAccountProcessing → MatchingService.buildTrigramIndex / configureScoring
  ├─ processCorrelatedManagedAccounts → per-account MatchOutcomeDispatcher.runMatchSweep
  ├─ processRecordUniqueRegistration
  └─ processUncorrelatedManagedAccounts → batch MatchOutcomeDispatcher.runMatchSweep
       └─ MatchOutcomeDispatcher → MatchingService (scoring)
```

`MatchOutcomeDispatcher` lives under `matchingService/` but is wired on `FusionService` via `ServiceRegistry`. `ManagedAccountMatchingRunner` does not exist in code.

## Decision Chain

### Q1: Reconcile by changing code or specs?

**Options:**
- A — Spec-only: document the three-layer model (FusionService → MatchOutcomeDispatcher → MatchingService)
- B — Move dispatcher ownership into MatchingService (medium refactor)
- C — Full original vision: MatchingService owns all matching (large refactor)

**Decision:** **A (spec-only).** Code matches `match-outcome-dispatch` spec and is well-bounded. No behavioral change needed.

### Q2: Where does correlated account sweep live?

**Options:**
- Keep on FusionService (pipeline/correlation domain)
- Move to MatchingService

**Decision:** **Keep on FusionService.** UL already defines "Correlated account sweep" as a pre-pass before main matching sweeps. It uses linked-account index and filters `uncorrelated === false`. Match dispatch still goes through `MatchOutcomeDispatcher` per account.

### Q3: Should init calls (`buildTrigramIndex`, `configureScoring`) move behind a facade?

**Options:**
- Keep direct calls; narrow spec language to allow "scoring-prep" methods
- Add `matchingService.prepareForSweep()` facade (Option B territory)

**Decision:** **Keep direct calls.** `initializeManagedAccountProcessing` mixes FusionRun setup, reviewer validation, linked-account index (FusionService) with scoring prep (MatchingService). Spec will allow scoring-prep entry points explicitly; sweep orchestration restricted to `MatchOutcomeDispatcher.runMatchSweep()`.

### Q4: What happens to `ManagedAccountMatchingRunner` in ubiquitous language?

**Decision:** **Retire it.** Canonical implementation is `MatchOutcomeDispatcher`. Add to retired-terms table; update UL example that cites `ManagedAccountMatchingRunner`.

### Q5: `setCaptureBreakdown` vs `configureScoring`?

**Decision:** Align spec to **`configureScoring({ captureBreakdown })`** — matches code.

## Trade-offs

| Choice | Upside | Downside |
|---|---|---|
| Spec-only (A) | Zero behavioral risk; closes drift quickly | FusionService still holds dispatcher reference (documented) |
| Code refactor (B/C) | Literal match to old fusion-service spec | High churn, no user-visible benefit |

## Success Criteria

- `fusion-service/spec.md` no longer requires `MatchingService.processUncorrelatedManagedAccounts`
- Living specs consistently describe FusionService → MatchOutcomeDispatcher → MatchingService
- `ManagedAccountMatchingRunner` retired from UL; `MatchOutcomeDispatcher` canonical
- `openspec validate --all` passes after merge
- No production code changes required (spec/docs only)

## User Approval

User confirmed Option A and all three thread decisions via `/opsx-propose go with your recommendations`.
