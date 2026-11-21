## 1. Clear Stale Step Progress on Step Boundaries

- [x] 1.1 Clear `this.runContext.progress = undefined` in `LogService.stepStart()` and `LogService.stepEnd()` in `src/services/logService/logService.ts`
- [x] 1.2 Add unit test in `src/services/logService/__tests__/logService.test.ts` verifying `stepStart` / `stepEnd` clears prior step progress

## 2. Chunked Progress Window in `MatchOutcomeDispatcher.runMatchSweep`

- [x] 2.1 Add optional `progressOffset` and `progressTotal` to `MatchSweepOptions` and `runMatchSweep()` in `src/services/matchingService/matchOutcomeDispatcher.ts`, initializing `log.setProgress(progressOffset, progressTotal, 'analyzed')` at sweep start and offsetting `updateProgress()`
- [x] 2.2 Add unit test in `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` verifying chunked `runMatchSweep` reports `progressOffset + processed` against `progressTotal`

## 3. Stream `processUncorrelatedManagedAccounts` in Bounded Chunks

- [x] 3.1 Update `FusionService.processUncorrelatedManagedAccounts()` in `src/services/fusionService/fusionService.ts` to stream `run.managedAccountsById.values()` in bounded chunks (`4_096` accounts per chunk) into `runMatchSweep()` with `{ progressOffset, progressTotal }`, releasing `linkedAccountKeyIndex` and managed-account processing state after the final chunk
- [x] 3.2 Add unit test in `src/services/fusionService/__tests__/fusionService.aggregation.test.ts` verifying multi-chunk uncorrelated sweep dispatches chunks in order and aggregates `processed` count

## 4. Verification

- [x] 4.1 Confirm canonical test and check commands pass: `npm test`, `npm run build`, and `npm run lint`
- [x] 4.2 Verify all delta spec scenarios in `specs/fusion-service/spec.md`, `specs/matching-service/spec.md`, and `specs/log-service/spec.md` are covered by named automated tests

## 5. Documentation

- [x] 5.1 Confirm no user-facing README or MkDocs configuration/CLI contract changes are required (internal sweep streaming and progress fix only); update JSDoc comments on `MatchSweepOptions`, `processUncorrelatedManagedAccounts`, and `LogService.stepStart`

## 6. Changelog

- [x] 6.1 Create or update the `CHANGELOG.md` entry for this change under the current `package.json` version (`2.2.0`) using `changelog-generator`
- [x] 6.2 Confirm the changelog entry summarizes the uncorrelated sweep OOM fix and progress reporting accuracy
