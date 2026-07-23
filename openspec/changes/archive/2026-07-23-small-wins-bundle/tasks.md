## 1. Part A — Jaro Uint8Array match flags

- [x] 1.1 In `src/services/matchingService/stringComparison.ts`, replace `new Array(len).fill(false)` with `new Uint8Array(len)` for `s1Matches` and `s2Matches` in `jaroSimilarity`
- [x] 1.2 Change match assignments from `true` to `1`; confirm truthy checks (`if (s1Matches[i])`, `if (s2Matches[j])`) remain valid
- [x] 1.3 Run existing string comparison tests unchanged: `npm test -- src/services/matchingService/__tests__/stringComparison.test.ts`

## 2. Part B — Full-scan fallback observability

- [x] 2.1 Add `fullScanFallbackCount: number = 0` to `FusionRun` in `src/model/fusionRun.ts`
- [x] 2.2 Add optional `log?: LogService` parameter to `MatchingService.getCandidates` in `src/services/matchingService/matchingService.ts`
- [x] 2.3 When `resultSet === undefined` after the mandatory-attribute loop (all attrs missing), increment `run.fullScanFallbackCount` and emit throttled warnings (first 5, then every 100th) when `log` is provided
- [x] 2.4 Update `matchOutcomeDispatcher.ts` to pass `this.deps.log` into `getCandidates`
- [x] 2.5 Surface total fallback count in terminal summary / report epilogue (`accountListPhases.ts` or `buildTerminalSummary`) when `fullScanFallbackCount > 0`
- [x] 2.6 Add test: managed account with empty mandatory attrs increments `run.fullScanFallbackCount` when trigram index is built

## 3. Part C — Non-copying fusion account iteration

- [x] 3.1 Add `*fusionAccountsIterable(): Iterable<FusionAccount>` to `FusionRun` yielding `_fusionAccountMap.values()`
- [x] 3.2 Update iteration-only callers: `fusionService.ts` (~683), `decisionProcessor.ts` (~55)
- [x] 3.3 Leave spread/array consumers unchanged (`fusionService.ts` 848/870/1026, `matchOutcomeDispatcher.ts`, `accountListPhases.ts`)
- [x] 3.4 Audit `fusionMatches` getter usages — prefer existing `fusionMatchesRaw` only where a read-only hot path is found (no getter change required per design)

## 4. Verification

- [x] 4.1 Run type check: `npx tsc --noEmit`
- [x] 4.2 Run full test suite: `npm test`
- [x] 4.3 Run lint: `npm run lint`

## 5. Documentation

- [x] 5.1 Add JSDoc on `getCandidates` documenting optional `log` and fallback counter behavior
- [x] 5.2 Add JSDoc on `fusionAccountsIterable` noting when to use vs `allFusionAccounts`
