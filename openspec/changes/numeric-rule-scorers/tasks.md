## 1. Remove captureBreakdown API (TDD)

- [x] 1.1 Delete `ScoringOptions`, `configureScoring`, and `scoringOptions` from `types.ts` and `matchingService.ts`.
- [x] 1.2 Remove `configureScoring` call from `fusionService.ts` `initializeManagedAccountProcessing`.
- [x] 1.3 Update `fusionService.report.test.ts`: replace "captureBreakdown wiring" tests with assertion that init does not call `configureScoring`; report-slice tests for stored match scores still pass.

## 2. Numeric scorers (TDD)

- [x] 2.1 Add numeric scorer functions in `scoringHelpers.ts` for lig3, name-matcher, jaro-winkler, dice, double-metaphone, binary, custom-velocity (no `makeScoreReport`).
- [x] 2.2 Refactor `evaluateRuleTotals` / `evaluateCombinedScorePass` to use numeric scorers only.
- [x] 2.3 Add `materializeScoreReportsFromNumeric(ruleResults, matchingConfigs, …)` (or equivalent) producing identical rows to full path including `weightedScore` backfill and combined row.
- [x] 2.4 Replace fast-path recurse (`compareFusionAccounts(..., true)`) with reconstruction on pass.
- [x] 2.5 Branch `compareFusionAccounts` / `scoreFusionAccount`: full `ScoreReport[]` path only when `candidateType === Deferred`.

## 3. Tests

- [x] 3.1 Rewrite `matchService.test.ts` cheap-path cases without `configureScoring`; delete "skips fast path when captureBreakdown is true".
- [x] 3.2 Assert non-match: spy on report factory / `makeScoreReport` — zero calls for failed identity comparison.
- [x] 3.3 Assert pass: each scorer spy called exactly once; `scores` deep-equals golden fixture with missing-value skip, below-threshold skip, and LIG3 upper-bound skip cases.
- [x] 3.4 Keep deferred always-breakdown test without captureBreakdown flag.

## 4. Verification

- [x] 4.1 Run `npx vitest run src/services/matchingService/__tests__/matchService.test.ts src/services/matchingService/__tests__/helpers.test.ts src/services/fusionService/__tests__/fusionService.report.test.ts`
- [x] 4.2 Run `npm run test:scenario`
- [x] 4.3 Run `npm run lint` and `npx tsc --noEmit`

## 5. Documentation

- [x] 5.1 Remove references to `configureScoring({ captureBreakdown })` from internal docs if any (grep repo); no connector-spec change.

## 6. Changelog

- [x] 6.1 Changelog via changelog-generator: numeric identity fast path, remove captureBreakdown, perf + spec alignment.
