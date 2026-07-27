## 1. OperationRunContext and LogService helpers

- [x] 1.1 Add `CorrelationActivityCounters` type with link/merge triggers and accounts, correlated-action, and skip buckets
- [x] 1.2 Implement interval + phase cumulative counter layers; reset phase counters in `phaseStart`; `flushPhaseCorrelationSummary()` snapshot
- [x] 1.3 Add `LogService` helpers: `recordCorrelationActivity`, `recordCorrelatedActionGranted`, `recordCorrelationSkipped`
- [x] 1.4 Wire legacy `recordEvent('correlation')` through new link counter path (or migrate call sites)
- [x] 1.5 Unit tests in `src/services/logService/__tests__/operationRunContext.test.ts`

## 2. Heartbeat and phase formatting

- [x] 2.1 Extend `formatEventSummaryLines` for `correlations link=… merge=… correlated-action=… skipped=…` format
- [x] 2.2 Add Refresh-phase correlation segment to STATUS formatter when cumulative link/merge > 0
- [x] 2.3 Add `formatCorrelationSummarySegment()` helper for PHASE END detail suffix
- [x] 2.4 Unit tests in `src/services/logService/__tests__/operationHeartbeat.test.ts`

## 3. Instrumentation call sites

- [x] 3.1 `IdentityService.correlateAccounts` — accept `kind: 'link' | 'merge'`; call `recordCorrelationActivity`; skip → `recordCorrelationSkipped('noIscAccountId')`
- [x] 3.2 `CorrelationManager.correlatePerSource` — aggregate skip reasons; pass `kind: 'link'`; pass `kind: 'merge'` when invoked from merge decisions
- [x] 3.3 `FusionAccount.updateCorrelationStatus()` — optional callback; fire on transition when correlated action newly granted
- [x] 3.4 `FusionService.processFusionAccount` — wire correlated-action callback to LogService
- [x] 3.5 `DecisionProcessor.processFusionIdentityDecision` — pass `kind: 'merge'` to correlation path for authorized decisions
- [x] 3.6 Update `correlationManager.test.ts`, `fusionService.test.ts`, `identityService.test.ts` as needed

## 4. Account-list phase wiring

- [x] 4.1 `accountList.ts` — pass flushed correlation summary to `phaseEnd` for Refresh and Process (and other phases when non-zero)
- [x] 4.2 `accountListPhases.ts` — extend Process completion DETAIL with correlation segment
- [x] 4.3 Update `accountListPhaseInstrumentation.test.ts` for PHASE END correlation detail

## 5. Documentation and changelog

- [x] 5.1 Update `docs/guides/advanced-connection-settings.md` with new EVENT_SUMMARY / PHASE END correlation format and grep examples
- [x] 5.2 Add CHANGELOG entry describing link/merge/correlated-action logging and format migration from `correlations triggered=`

## 6. Verification

- [x] 6.1 Run `npm test` on touched test files and full suite
- [x] 6.2 Run `npm run lint`
