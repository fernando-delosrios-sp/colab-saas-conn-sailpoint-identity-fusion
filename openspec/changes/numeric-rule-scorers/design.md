## Context

`compareFusionAccounts` has a fast path when `captureBreakdown` is false: `evaluateCombinedScorePass` then recurses with `captureBreakdown: true` on pass. Fast path still allocates transient `ScoreReport` via `dispatchRuleScore`. Record/report runs set `captureBreakdown: true`, forcing full path on every identity comparison including non-matches whose breakdowns are discarded.

Drift check: `git rev-parse --short HEAD` → `25acd10` at package authoring time.

## Goals / Non-Goals

**Goals:**
- Numeric scorers for all algorithms on identity fast path.
- Reconstruct stored `FusionMatch.scores` from numeric tuples without second scoring pass.
- Remove `captureBreakdown`, `configureScoring`, `ScoringOptions`.
- Each configured scorer invoked at most once per passing identity comparison (test via spy).
- Non-matches allocate no per-rule `ScoreReport`.

**Non-Goals:**
- Changing combined score math or mandatory/skip semantics.
- Lazy capture of non-match breakdowns for reports (never stored today).
- Trigram or name-matcher cache work (other changes).

## Decisions

### D1: Numeric result type

```typescript
type RuleScoreNumeric = {
    score: number
    isMatch: boolean
    skipped: boolean
    skipReason?: 'missing' | 'lig3-bound' | 'below-threshold'
}
```

Map `skipReason` to existing comment strings when materializing reports.

### D2: Reconstruction safety

A stored match requires `combinedPasses` with `!hasFailedMandatory`. Fast-path breaks imply failure (mandatory fail or max-achievable below threshold). Therefore every rule index was evaluated exactly once before pass — reconstruction does not need `appendSkippedRemainingRules` rows.

### D3: Path selection

```typescript
// scoreFusionAccount — after change (illustrative)
const useFullBreakdown = candidateType !== MatchCandidateType.Identity
```

Remove `captureBreakdown` parameter from `compareFusionAccounts`.

### D4: Remove configureScoring

Delete from `MatchingService`, `types.ts`, and:

```1327:1327:src/services/fusionService/fusionService.ts
        this.matchingService.configureScoring({ captureBreakdown: this.shouldCaptureManagedAccountReportData() })
```

Keep `shouldCaptureManagedAccountReportData()` for report builder / recorder only.

## Current state (excerpts)

Fast path re-score on pass:

```456:461:src/services/matchingService/matchingService.ts
        if (!captureBreakdown) {
            if (!this.evaluateCombinedScorePass(fusionAccount, fusionIdentity)) {
                return
            }
            this.compareFusionAccounts(fusionAccount, fusionIdentity, candidateType, true)
            return
        }
```

Still allocates reports in fast path:

```714:727:src/services/matchingService/matchingService.ts
    private evaluateRuleTotals(...): RuleScoreTotals {
        const scoreReport = this.dispatchRuleScore(...)
```

## In scope

- `matchingService.ts`, `scoringHelpers.ts`, `types.ts`
- `fusionService.ts` (remove configureScoring call only)
- Tests listed in tasks.md
- Spec deltas: `matching-service`, `fusion-service`

## Out of scope

- `FusionRun` name-matcher caches
- Trigram index guard
- Operator docs (no config change)

## STOP conditions

- Reconstructed `scores` deep-inequal to pre-change full path for any fixture — stop.
- Report/dry-run/record slices lose per-rule rows on **stored** matches.
- Any remaining `configureScoring` call site or exported `ScoringOptions`.
- `shouldCaptureManagedAccountReportData` behavior for report slices changes.

## Verification commands

```bash
npx vitest run src/services/matchingService/__tests__/matchService.test.ts src/services/matchingService/__tests__/helpers.test.ts src/services/fusionService/__tests__/fusionService.report.test.ts
npm run test:scenario
npm run lint
npx tsc --noEmit
```

## Git workflow

Recommended after `cache-name-matcher-tokens`. Feature branch; verify before archive.

## Risks / Trade-offs

[MED] Reconstruction must preserve comment strings and row order for forms/reports → golden fixtures for pass cases with skips.

[LOW] Removing captureBreakdown simplifies mental model; record mode still captures match slices from stored `FusionMatch.scores`.
