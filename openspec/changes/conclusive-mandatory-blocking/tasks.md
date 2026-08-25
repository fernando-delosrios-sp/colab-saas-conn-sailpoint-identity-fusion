## 1. Index guard (TDD)

- [x] 1.1 Filter `buildTrigramIndex` to mandatory rules with `(fusionScore ?? 0) > 0` only.
- [x] 1.2 Add regression test: mandatory rule with fusionScore 0 is not in `indexedMandatoryAttributes`; identity without that attribute remains in candidate set when another rule matches.

## 2. Empty candidate set (TDD)

- [x] 2.1 When index built and account missing all indexed mandatory values (via `missing()`), return empty `Set` instead of `undefined`.
- [x] 2.2 Do not increment `fullScanFallbackCount` for this path; increment `mandatoryMissingBlockCount` on FusionRun.
- [x] 2.3 Throttled warning log with message distinct from full-scan fallback (first 5, every 100th).
- [x] 2.4 Rework `matchService.test.ts` `getCandidates full-scan fallback` block: empty set + zero comparisons; unbuilt index still `undefined`.

## 3. Dispatcher and epilogue

- [x] 3.1 Add `matchOutcomeDispatcher.test.ts` case: empty candidate set does not score `allFusionIdentities`.
- [x] 3.2 Add `mandatoryMissingBlockCount = 0` default in `fusionRun.ts` and `fusionRun.test.ts`.
- [x] 3.3 Wire `accountListPhases.ts` epilogue when `mandatoryMissingBlockCount > 0` (alongside existing `fullScanFallbackCount` message).

## 4. Verification

- [x] 4.1 Run `npx vitest run src/services/matchingService/__tests__/matchService.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts src/model/__tests__/fusionRun.test.ts`
- [x] 4.2 Run `npm run test:scenario`
- [x] 4.3 Run `npm run lint`

## 5. Documentation

- [x] 5.1 Update `docs/reference/observability.md`: describe `mandatoryMissingBlockCount` vs `fullScanFallbackCount`.
- [x] 5.2 Update match-flow / account-list docs if they describe full-scan fallback for missing mandatory attrs.

## 6. Changelog

- [x] 6.1 Changelog via changelog-generator: trigram index guard, mandatory-missing empty pool, new counter (correctness + perf).
