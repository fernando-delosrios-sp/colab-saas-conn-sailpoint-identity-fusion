## 1. OperationRunContext and LogService helpers

- [x] 1.1 Add `linkCompleted` and `mergeCompleted` to `CorrelationActivityCounters` and empty factory
- [x] 1.2 Implement `recordCorrelationCompleted({ kind: 'link' | 'merge', count?: number })` on OperationRunContext and LogService
- [x] 1.3 Extend `formatCorrelationSummaryValue` with `completed=` segment (cumulative and interval delta); exclude `correlated-action=` when aggregation mode flag passed or counters zero
- [x] 1.4 Update `hasCorrelationActivity` to include completed counts
- [x] 1.5 Unit tests in `src/services/logService/__tests__/operationRunContext.test.ts`

## 2. Heartbeat formatting and snapshot

- [x] 2.1 Add `correlationQueuePending` to `HeartbeatSnapshot`; compute in `serviceRegistry.getHeartbeatSnapshot()` from pending queue labels
- [x] 2.2 Extend `formatStatusLine` to emit correlation drain segment (`completed=`, `pending=`) during Output/Epilogue when correlation activity exists and pending > 0
- [x] 2.3 Extend `formatEventSummaryLines` for `completed=+N/interval` delta on correlation segment
- [x] 2.4 Unit tests in `src/services/logService/__tests__/operationHeartbeat.test.ts`

## 3. Suppress correlated-action during aggregation

- [x] 3.1 Gate `recordCorrelatedActionGranted` callback behind `!isAggregationMode` in `fusionService.processFusionAccount`
- [x] 3.2 Gate callback in `fusionService.getISCAccount` when aggregation mode
- [x] 3.3 Gate callback in `decisionProcessor.processFusionIdentityDecision`
- [x] 3.4 Update `fusionService.test.ts` to assert no correlated-action recording during aggregation

## 4. PATCH completion instrumentation

- [x] 4.1 Pass `kind` through to `buildCorrelationPromise` in `identityService.ts`
- [x] 4.2 Call `recordCorrelationCompleted` on PATCH `.then()` success
- [x] 4.3 Update `identityService.test.ts` for completed counter

## 5. Documentation and changelog

- [x] 5.1 Update `docs/guides/advanced-connection-settings.md` — remove correlated-action from accountList examples; document completed/pending drain format
- [x] 5.2 Add CHANGELOG entry for correlated-action removal from accountList and drain metrics

## 6. Verification

- [x] 6.1 Run targeted tests: operationRunContext, operationHeartbeat, identityService, fusionService
- [x] 6.2 Run `npm run lint`
