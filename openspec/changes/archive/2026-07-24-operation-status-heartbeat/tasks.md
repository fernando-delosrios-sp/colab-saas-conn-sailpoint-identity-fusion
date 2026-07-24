## 1. Operation run context and log helpers

- [x] 1.1 Add `OperationRunContext` type and instance on `ServiceRegistry` with phase, step, progress, event counters, and operation start time
- [x] 1.2 Add `LogService` helpers: `phaseStart`, `phaseEnd`, `stepStart`, `stepEnd`, `setProgress`, `recordEvent`; wire `PhaseTimer.phase()` and `track().done()` to emit `PHASE`/`METRIC` formatted lines
- [x] 1.3 Add unit tests for context updates and text formatters in `src/services/logService/__tests__/`

## 2. Operation heartbeat

- [x] 2.1 Implement `OperationHeartbeat` in `src/services/logService/operationHeartbeat.ts` (STATUS, EVENT_SUMMARY flush, stall detection, active-label grouping)
- [x] 2.2 Add heartbeat start/stop API on `LogService` or registry; integrate with `client.getQueueStats()` and `client.getQueueItems()`
- [x] 2.3 Add unit tests for STATUS formatting, delta tracking, stall threshold, and multi-line EVENT_SUMMARY in `src/services/logService/__tests__/operationHeartbeat.test.ts`

## 3. Remove legacy heartbeats

- [x] 3.1 Remove or disable `ClientService.startStatsLogging()` standalone `Queue Stats:` interval
- [x] 3.2 Change `operationHandler` memory keep-alive to call `res.keepAlive()` only (no `Memory usage` log line)
- [x] 3.3 Update `src/utils/__tests__/operationHandler.test.ts` and `src/services/clientService/__tests__/clientService.test.ts`

## 4. Account-list pipeline instrumentation

- [x] 4.1 Start/stop heartbeat in `src/operations/accountList.ts` try/finally
- [x] 4.2 Add `phaseStart` before each phase and `stepStart`/`stepEnd` in `src/operations/helpers/accountListPhases.ts` for all named sub-steps
- [x] 4.3 Replace progress log strings in `matchOutcomeDispatcher.ts`, `fusionService/collections.ts`, and `fusionService.ts` output loop with `setProgress` only
- [x] 4.4 Update `src/operations/__tests__/accountList.test.ts` for PHASE START, STATUS, absence of legacy heartbeats

## 5. Event aggregation (replace per-account INFO)

- [x] 5.1 Route match discovery in `managedAccountAnalysisRecorder.ts` through `recordEvent` instead of INFO
- [x] 5.2 Route deferred match logs in `matchOutcomeDispatcher.ts` and `fusionService.ts` through `recordEvent`
- [x] 5.3 Route correlation triggers in `identityService.ts` through `recordEvent`
- [x] 5.4 Optional debug-only per-account detail when log level is debug; update related tests in `managedAccountAnalysisRecorder.test.ts` and `matchOutcomeDispatcher.test.ts`

## 6. Documentation and changelog

- [x] 6.1 Add CHANGELOG entry describing STATUS heartbeat, removed Queue Stats / Memory usage lines, and log monitor migration
- [x] 6.2 Note new log line kinds in operator-facing docs if a logging section exists (README or docs site)

## 7. Verification

- [x] 7.1 Run `npm test` on touched test files and full suite
- [x] 7.2 Run `npm run lint`
