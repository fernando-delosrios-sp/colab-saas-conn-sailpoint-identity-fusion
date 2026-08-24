## 1. Characterization tests (behavior lock)

- [x] 1.1 Run existing record-unique and matching pre-score tests (must be green before edits): `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- [x] 1.2 In `recordUniqueRegistration.test.ts`, add **`registerUniqueValuesFromRecordManagedAccounts registers 25 distinct values with batch size 12`**: 25 accounts, distinct `emp_id` values, call the plural method, expect all 25 in `getUniqueValues('employeeId')`. This test SHOULD pass on the serial implementation (behavior lock).
- [x] 1.3 In the match-outcome dispatcher (or pre-score) tests, add **`skip-linked does not call log.info`**: correlated + linked account, spy `log.info`, expect skip-linked / claim, `expect(log.info).not.toHaveBeenCalled()`. This test **fails** until INFO is removed (red is expected). If `log.info` is also used for `[deferred-diag]` in the same run, assert `log.info` was not called with a string matching `/already linked|Dropping managed account/i` instead of zero calls.

**Verify**: 1.1–1.2 exit 0. 1.3 fails on the INFO assertion — not because of fixture errors.

## 2. Parallel record unique registration (green)

- [x] 2.1 Replace the `for` loop in `registerUniqueValuesFromRecordManagedAccounts` with `promiseAllBatched(accounts, (account) => this.registerUniqueValuesFromRecordManagedAccount(...), getFusionParallelBatchSize(this.config), onBatchComplete)`.
- [x] 2.2 Wire `onProgress(done, total)` from `onBatchComplete` or per-account increment that stays monotonic. Remove the extra `yieldToEventLoop` every 50 if `promiseAllBatched` already yields between batches.
- [x] 2.3 Import `promiseAllBatched` and `getFusionParallelBatchSize` from `../fusionService/collections`. If lint/knip forbids that import, write a local batch loop with the same yield-between-batches contract — do not move `collections.ts`.
- [x] 2.4 Do not change `registerUniqueAttributes` lock keys or `registerUniqueValuesFromRecordManagedAccount` (single-account Map + register).
- [x] 2.5 Re-run `recordUniqueRegistration.test.ts`. Add a test that two accounts sharing unique attribute name `employeeId` both end up in the set (distinct values) when registered via the plural method.

**Verify**: `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts` exit 0.

## 3. Correlated pre-score INFO (green)

- [x] 3.1 In `preScoreGate.ts`, remove `log.info` for skip-linked and correlated-orphan. Optional: `log.debug` the same messages only when debug is enabled (`log.getLogLevel?.() === 'debug'` or equivalent already used in this repo). Do not emit per-account `log.detail`.
- [x] 3.2 In `runCorrelatedAccountSweep` (`fusionService.ts`), after `batchProcess`, `log.detail` with `action: 'correlated account sweep complete'`, `droppedLinked` (skip-linked count), and `remaining: map.size`. Count skip-linked without changing `runMatchSweep([account], 1)` per account.
- [x] 3.3 Make 1.3 green. Add a correlated-orphan case: `log.info` not matching `/not linked to Fusion|treating as non-match/i`.
- [x] 3.4 Keep a test that `processManagedAccount` / correlated sweep still calls `runMatchSweep` with a one-element array per correlated account (`match-outcome-dispatch` scenario). Extend `fusionService.aggregation.test.ts` only if an existing correlated-sweep test already spies the dispatcher.

**Verify**: `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts src/services/matchingService/__tests__/preScoreGate.test.ts` (omit the preScoreGate path if the file does not exist). Then `npx vitest run src/services/fusionService/__tests__/fusionService.aggregation.test.ts` if 3.2/3.4 touched it.

## 4. Verification

- [x] 4.1 `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts src/services/fusionService/__tests__/fusionService.aggregation.test.ts src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts`
- [x] 4.2 `npm run typecheck`
- [x] 4.3 `npm run lint` (do not pipe to `tail`)
- [x] 4.4 `git diff --stat` must **not** include `src/services/mappingService/`, `src/services/definitionService/formatting.ts`, Unique generation (`generateUniqueAttributeValue` / `refreshUniqueAttributes` control flow), `src/services/logService/operationHeartbeat.ts`, or `connector-spec.json`

Expected: typecheck and lint exit 0.

## 5. Documentation

- [x] 5.1 Update `docs/operations/account-list.md` only if it documents per-account “dropping linked” / correlated-orphan INFO. Otherwise no operations doc change. Do not rewrite Fetch/API tuning guides.
- [x] 5.2 Invoke **changelog-generator**. PATCH-class improvement: Process-phase record unique registration overlaps work in the fusion parallel cap; correlated skip-linked no longer logs INFO per account. Merge into today’s `CHANGELOG.md` date section. No Unreleased heading. No new config key.

**Verify**: `npm run lint:markdown` only if a `docs/**/*.md` file changed; `CHANGELOG.md` has a dated Improvements (or equivalent) bullet.

## 6. Suggested executor toolkit

- Use **tdd**: 1.3 red, then section 2 green, then section 3 green.
- Use **changelog-generator** in section 5.
- Do not invoke **apply-code-changes** from inside itself; this `tasks.md` is the apply input.
