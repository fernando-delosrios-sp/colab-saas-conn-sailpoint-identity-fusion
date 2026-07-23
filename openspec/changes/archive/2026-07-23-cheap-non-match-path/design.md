## Context

`MatchingService.compareFusionAccounts` scores a managed account against one identity candidate across all configured matching rules. It builds a `ScoreReport[]`, computes a weighted combined score, and calls `fusionAccount.addFusionMatch` only when `combinedPasses` is true. The scores array and per-rule objects are allocated unconditionally — including for comparisons that fail mandatory rules, hit max-achievable early exit, or fall below the combined threshold.

Downstream consumers of full breakdowns:
- Stored `FusionMatch.scores` (review forms, exact-match detection)
- Report capture when `shouldCaptureReportData` is true
- Deferred-candidate comparisons (`MatchCandidateType.Deferred`)

Normal identity-sweep non-matches do not persist score breakdowns. Report capture for non-matches uses account-level metadata via `ManagedAccountAnalysisRecorder`, not per-rule `ScoreReport` arrays from failed comparisons.

Constraints from advisor plan 002: do not modify scoring helpers, types, or `MatchOutcomeDispatcher`.

## Goals / Non-Goals

**Goals:**
- Avoid `ScoreReport[]` and per-rule report allocation on identity-sweep comparisons that fail the combined threshold
- Preserve identical match outcomes, stored match breakdowns, and report/deferred behavior
- Wire run-level `captureBreakdown` from `FusionService.initializeManagedAccountProcessing`
- Add regression test for non-match behavior with fast path enabled

**Non-Goals:**
- Changing scoring algorithms or thresholds
- Optimizing match-path allocation beyond necessary re-run for breakdown
- Worker threads or parallel scoring changes
- Memory profiling benchmarks in CI
- Modifying `MatchOutcomeDispatcher`, `scoringHelpers.ts`, or `types.ts`

## Decisions

### D1: Fast path vs always-full scoring

- **Choice:** Two-mode `compareFusionAccounts` with `captureBreakdown` parameter
- **Reason:** Fast path eliminates allocation on dominant non-match path; full path preserves existing contract for matches and report/deferred paths
- **Considered alternatives:** Object pooling — rejected (complexity, still allocates); store combined score only — rejected (breaks forms/reports)

### D2: Re-run scoring on threshold pass

- **Choice:** When fast path finds `combinedPasses`, re-invoke comparison logic with `captureBreakdown = true` to build `FusionMatch.scores`
- **Reason:** Keeps scoring logic single-source; matches are rare so double work is net positive
- **Considered alternatives:** Incrementally build breakdown only after pass detected mid-loop — rejected (mandatory-fail early exits complicate partial arrays)

### D3: When to force full breakdown

- **Choice:** `captureBreakdown = _captureBreakdown || candidateType !== MatchCandidateType.Identity`
- **Reason:** Deferred candidates always need scores; report sessions set `_captureBreakdown` via FusionService
- **Considered alternatives:** Always fast path for identity sweep — rejected if report capture ever needed per-rule non-match data (escape hatch: gate on `shouldCaptureReportData`)

### D4: Configuration surface

- **Choice:** `MatchingService.setCaptureBreakdown(value: boolean)` called from `FusionService.initializeManagedAccountProcessing`
- **Reason:** FusionService owns run mode (aggregation vs dry-run report capture); avoids threading flag through dispatcher
- **Considered alternatives:** Constructor parameter — rejected (MatchingService lifetime spans runs); per-call on `scoreFusionAccount` — rejected (call-site churn)

### D5: Fast-path loop structure

- **Choice:** Duplicate loop bodies guarded by `if (captureBreakdown)` — fast branch updates totals only; full branch retains current `scores.push` logic including skipped-report padding for structural completeness
- **Reason:** Clear separation; mandatory-fail and max-achievable early exits share identical control flow in both branches
- **Considered alternatives:** Extract shared "score one rule" returning minimal struct — rejected (scope creep into helpers)

## Risks / Trade-offs

- [Risk] Subtle behavioral drift if fast path computes combined score differently → Mitigation: share threshold/early-exit conditions; existing test suite must pass unchanged
- [Risk] Report capture needs non-match breakdowns → Mitigation: `_captureBreakdown` true when `shouldCaptureReportData`; optimization no-op for those sessions
- [Trade-off] Double-scoring on matches → Accepted: matches ≪ non-matches
- [Trade-off] `_captureBreakdown` as session state on MatchingService → Accepted: set once per run at init; documented as run-scoped configuration

## Migration Plan

N/A — internal performance optimization with no config or API changes. Deploy via normal connector bundle update.

**Rollout:** Ship after full test suite passes. Monitor aggregation memory in environments that previously saw GC pressure.

**Rollback:** Revert code; behavior returns to always-full breakdown allocation.

## Open Questions

- None blocking. Optional post-ship memory profiling to quantify GC reduction.
