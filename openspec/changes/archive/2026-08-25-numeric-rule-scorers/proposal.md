## Why

Identity-sweep scoring still allocates a `ScoreReport` per rule on every comparison and re-runs all scorers when a pair passes the review threshold. The living matching-service spec already requires non-match comparisons to avoid per-rule report allocation; implementation drifted after `cheap-non-match-path` scoped out `scoringHelpers.ts`. Separately, `captureBreakdown: true` forces full breakdown work on every non-match during record/report/dry-run runs, but only threshold-passing pairs store `FusionMatch.scores` — the flag has no observable output effect.

## What Changes

**Numeric rule scorers on identity fast path**
- From: `evaluateRuleTotals` → `dispatchRuleScore` → `makeScoreReport` for every rule; pass re-enters full path.
- To: Numeric APIs return `{ score, isMatch, skipped, skipReason? }`; scratch array reused per comparison; on pass, materialize `ScoreReport[]` once without re-scoring.
- Reason: Dominant `account × identity × rule` allocation and double CPU on matches.
- Impact: `scoringHelpers.ts`, `matchingService.ts`, tests.

**Remove captureBreakdown / configureScoring**
- From: `FusionService.initializeManagedAccountProcessing` calls `configureScoring({ captureBreakdown })`; identity sweep branches on flag.
- To: No `ScoringOptions`, no `configureScoring`; identity sweep always numeric fast path; deferred always full path by type.
- Reason: Flag only added wasted non-match work; stored match breakdowns identical after reconstruction.
- Impact: `types.ts`, `fusionService.ts`, `fusion-service` and `matching-service` spec deltas, report init tests.

**Unchanged**
- Deferred candidate comparisons always build full breakdown.
- `shouldCaptureManagedAccountReportData()` for report *slice* capture (not scoring mode).
- Combined score formula, mandatory rules, skip-on-missing/threshold semantics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `matching-service`: Identity sweep numeric path; remove captureBreakdown requirement; per-rule reports only on pass reconstruction; each scorer at most once per passing pair.
- `fusion-service`: Scoring prep is `buildTrigramIndex` only during init (no configureScoring).

## Impact

- `src/services/matchingService/matchingService.ts`
- `src/services/matchingService/scoringHelpers.ts`
- `src/services/matchingService/types.ts`
- `src/services/fusionService/fusionService.ts`
- Tests: `matchService.test.ts`, `helpers.test.ts`, `fusionService.report.test.ts`
- Scenario suite for outcome equivalence

## Apply status

- **Status**: TODO
- **Depends on**: cache-name-matcher-tokens (recommended apply order — both touch name-matcher scoring path; not a hard blocker if executor merges carefully)
- **Issue**:
