# Brainstorm: Cheap non-match path in `compareFusionAccounts`

## Background

Advisor plan 002 identifies a GC hotspot in `MatchingService.compareFusionAccounts` (`matchingService.ts:381-534`). Every account–identity comparison allocates a full `ScoreReport[]` array plus individual `makeScoreReport` / `makeSkippedReport` objects, then discards them when `combinedPasses` is false. At aggregation scale this is O(accounts × candidates × rules) short-lived objects. Only comparisons that pass the combined threshold produce stored `FusionMatch` records; the vast majority of comparisons are non-matches.

Related context: cap-scoring-concurrency (plan 001) reduces concurrent scoring contexts; this change reduces per-comparison allocation on the dominant non-match path.

## Decision chain

### Q1: What is the optimization target?

**Decision:** Eliminate `ScoreReport[]` allocation on comparisons that do not pass the combined score threshold, while preserving identical match outcomes and full score breakdowns wherever they are consumed (stored matches, review forms, report capture).

### Q2: How should we avoid allocating breakdown objects?

**Decision:** Split `compareFusionAccounts` into two modes controlled by `captureBreakdown`:

1. **Fast path** (`captureBreakdown = false`): Track only `weightedSum`, `weightTotal`, and `hasFailedMandatory`. Reuse existing early-exit logic (mandatory fail, max-achievable combined score). No `ScoreReport` objects until threshold passes.
2. **Full path** (`captureBreakdown = true`): Current behavior — build complete `scores[]` for reports and forms.

When fast path finds `combinedPasses`, re-run scoring with `captureBreakdown = true` to produce the breakdown for the stored `FusionMatch`. Matches are typically <5% of comparisons, so double-scoring on matches is acceptable.

**Alternatives considered:**
- **Lazy ScoreReport pool / object reuse** — Rejected: adds complexity; does not eliminate allocation volume on non-matches.
- **Always skip breakdown, store only combined score** — Rejected: breaks review forms, exact-match detection, and report rendering.
- **Move breakdown to FusionMatch factory** — Rejected: duplicates scoring logic; harder to keep in sync.

### Q3: When must breakdown be captured?

**Decision:** Enable full breakdown when any of:
- `MatchingService._captureBreakdown` is true (set from `FusionService.shouldCaptureReportData` at run init)
- `candidateType !== MatchCandidateType.Identity` (deferred candidates always need full scores)

**Escape hatch:** If non-match report analysis (`analyzedNonMatchReportData`) requires per-rule breakdowns, gate `_captureBreakdown` on `shouldCaptureReportData()` — when report capture is off, optimization applies fully; when on, behavior matches today.

### Q4: Where does configuration live?

**Decision:** Add `setCaptureBreakdown(boolean)` on `MatchingService`, called from `FusionService.initializeManagedAccountProcessing` with `this.shouldCaptureReportData`. Keeps report-mode knowledge in FusionService; MatchingService stays focused on scoring mechanics.

**Alternative:** Pass `captureBreakdown` through every `scoreFusionAccount` call — Rejected: more call-site churn; only one run-level flag needed.

### Q5: Scope boundaries

**Decision:** Touch only `matchingService.ts` and `fusionService.ts`. Do not modify scoring helpers, types, or `MatchOutcomeDispatcher`.

## Design trade-offs

| Trade-off | Choice | Rationale |
|-----------|--------|-----------|
| Double-scoring on matches | Accept | Matches are rare; non-match savings dominate |
| Session flag on MatchingService | Accept | Set once per run; aligns with existing init pattern |
| Report capture sessions | No-op optimization | When breakdown always needed, behavior unchanged — safe |
| weightedScore pass (lines 497-503) | Full path only | Only needed when scores array exists |

## Agreed approach

Implement fast-path combined-score-only comparison in `compareFusionAccounts`, wire `captureBreakdown` from FusionService, add test asserting non-match behavior unchanged with `captureBreakdown = false`, verify typecheck/lint/test pass.

## Open questions (non-blocking)

- Post-ship: optional memory profiling to quantify GC reduction (not required for merge).
- Confirm deferred-candidate path always receives full breakdown via `candidateType !== Identity` guard.
