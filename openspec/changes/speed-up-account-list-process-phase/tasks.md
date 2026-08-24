## 1. Characterization tests (behavior lock)

- [x] 1.1 Run existing record-unique, unique-generation, and matching pre-score tests (must be green before edits): `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts src/services/definitionService/__tests__/defineService.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- [x] 1.2 In `recordUniqueRegistration.test.ts`, add **`registerUniqueValuesFromRecordManagedAccounts registers 25 distinct values with batch size 12`**: 25 accounts, distinct `emp_id` values, call the plural method, expect all 25 in `getUniqueValues('employeeId')`. This test SHOULD pass on the serial implementation (behavior lock).
- [x] 1.3 In the match-outcome dispatcher (or pre-score) tests, add **`skip-linked does not call log.info`**: correlated + linked account, spy `log.info`, expect skip-linked / claim. Assert `log.info` was not called with a string matching `/already linked|Dropping managed account/i`. This test **fails** until INFO is removed (red is expected).
- [x] 1.4 In `defineService.test.ts`, add **`refreshUniqueAttributes does not hold unique:${name} during evaluateAttributeTemplate`**: mock `locks.withLock` so the callback is deferred; spy or instrument evaluation so it runs before the lock callback is invoked. This test **fails** until generation is restructured (red is expected). Keep existing preservation/collision tests as characterization (they SHOULD stay green after the lock shrink).

**Verify**: 1.1–1.2 exit 0. 1.3 and 1.4 fail on the new assertions — not because of fixture errors.

## 2. Parallel record unique registration (green)

- [x] 2.1 Replace the `for` loop in `registerUniqueValuesFromRecordManagedAccounts` with `promiseAllBatched(accounts, (account) => this.registerUniqueValuesFromRecordManagedAccount(...), getFusionParallelBatchSize(this.config), onBatchComplete)`.
- [x] 2.2 Wire `onProgress(done, total)` so `done` stays monotonic. Remove the extra `yieldToEventLoop` every 50 if `promiseAllBatched` already yields between batches.
- [x] 2.3 Import `promiseAllBatched` and `getFusionParallelBatchSize` from `../fusionService/collections`. If lint/knip forbids that import, write a local batch loop with the same yield-between-batches contract — do not move `collections.ts`.
- [x] 2.4 Do not change `registerUniqueAttributes` lock keys or `registerUniqueValuesFromRecordManagedAccount` (single-account Map + register).
- [x] 2.5 Re-run `recordUniqueRegistration.test.ts`. Add a test that two accounts sharing unique attribute name `employeeId` both end up in the set (distinct values) when registered via the plural method.

**Verify**: `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts` exit 0.

## 3. Unique generation lock shrink (green)

- [x] 3.1 Restructure `generateUniqueAttributeValue` so `evaluateAttributeTemplate` (and UUID inject) run outside `withLock('unique:${definition.name}')`. The lock body only checks/adds `getUniqueValues(name)` (or returns collision).
- [x] 3.2 Keep collision-strategy `$counter` empty on the first attempt, then padded increment on retries, up to `maxAttempts`. Keep incremental `counterFn()` on the existing counter lock; do not hold `unique:${name}` across `await counterFn()` plus Velocity.
- [x] 3.3 Gate Unique generate/collision `log.debug` strings that interpolate values on debug log level (same pattern as Map/Define). Keep `log.error` on exhausted attempts.
- [x] 3.4 Do not call `refreshUniqueAttributes` from Process. Do not change `processOutputBatch` control flow (still refresh then `getISCAccount` inside `Promise.all`).
- [x] 3.5 Make 1.4 green. Add **`two concurrent refreshUniqueAttributes calls for the same unique attribute store distinct values`**: `Promise.all` two accounts with colliding first render; expect two distinct attributes and both in the registry. Existing preservation tests must stay green.

**Verify**: `npx vitest run src/services/definitionService/__tests__/defineService.test.ts` exit 0.

## 4. Correlated pre-score INFO (green)

- [x] 4.1 In `preScoreGate.ts`, remove `log.info` for skip-linked and correlated-orphan. Optional: `log.debug` only when debug is enabled. Do not emit per-account `log.detail`.
- [x] 4.2 In `runCorrelatedAccountSweep` (`fusionService.ts`), after `batchProcess`, `log.detail` with `action: 'correlated account sweep complete'`, `droppedLinked` (skip-linked count), and `remaining: map.size`. Do not change `runMatchSweep([account], 1)` per account.
- [x] 4.3 Make 1.3 green. Add a correlated-orphan case: `log.info` not matching `/not linked to Fusion|treating as non-match/i`.
- [x] 4.4 Keep a test that correlated sweep still calls `runMatchSweep` with a one-element array per correlated account. Extend `fusionService.aggregation.test.ts` only if an existing correlated-sweep test already spies the dispatcher.

**Verify**: `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` (plus `preScoreGate.test.ts` if it exists). Then `npx vitest run src/services/fusionService/__tests__/fusionService.aggregation.test.ts` if 4.2/4.4 touched it.

## 5. Verification

- [x] 5.1 `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts src/services/definitionService/__tests__/defineService.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts src/services/fusionService/__tests__/fusionService.aggregation.test.ts src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts`
- [ ] 5.2 `npm run typecheck`
- [x] 5.3 `npm run lint` (do not pipe to `tail`)
- [x] 5.4 `git diff --stat` must **not** include `src/services/mappingService/`, `src/services/definitionService/formatting.ts`, `src/services/logService/operationHeartbeat.ts`, or `connector-spec.json`. Unique generation changes are **expected** in `definitionService.ts` / `defineService.test.ts`.

Expected: typecheck and lint exit 0.

## 6. Documentation

- [x] 6.1 Update `docs/operations/account-list.md` only if it documents per-account “dropping linked” INFO or Unique generation during Process. Otherwise no operations doc change. Do not rewrite Fetch/API tuning guides.
- [x] 6.2 Invoke **changelog-generator**. PATCH-class improvement: Process record unique registration overlaps in the fusion parallel cap; correlated skip-linked no longer logs INFO per account; Output Unique generation evaluates Velocity outside the unique registry lock so Output batches can overlap. Merge into today’s `CHANGELOG.md` date section. No Unreleased heading. No new config key.

**Verify**: `npm run lint:markdown` only if a `docs/**/*.md` file changed; `CHANGELOG.md` has a dated Improvements (or equivalent) bullet.

## 7. Suggested executor toolkit

- Use **tdd**: 1.3 and 1.4 red, then section 2 green, section 3 green, section 4 green.
- Use **changelog-generator** in section 6.
- Do not invoke **apply-code-changes** from inside itself; this `tasks.md` is the apply input.
