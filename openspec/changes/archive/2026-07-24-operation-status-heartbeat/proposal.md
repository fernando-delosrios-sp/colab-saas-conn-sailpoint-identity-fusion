# Proposal: operation-status-heartbeat

## Why

Long `accountList` aggregations emit three disconnected heartbeats — queue stats (30s), memory RSS (60s), and unbounded per-account match/correlation lines — with no indication of which pipeline phase or step is running. When the API queue appears stuck (flat `totalProcessed` with full concurrency slots), operators cannot tell whether the run is progressing, stalled on slow calls, or dead. Phase labels only log after each phase completes, so multi-minute Phase 4 runs look silent between sporadic match lines. The connector host delivers plain text only; visibility must come from predictable, grep-friendly line kinds aligned to the operation pipeline.

## What Changes

**Unified operation heartbeat replaces orphan telemetry**
- From: `ClientService` logs `Queue Stats: …` every 30s; `operationHandler` logs `Memory usage - RSS: …` every 60s; no shared run context.
- To: `OperationHeartbeat` emits a `STATUS` line every 30s combining phase, step, progress, queue delta, memory, and elapsed time; platform `res.keepAlive()` stays at 60s without a memory log line.
- Reason: one line must answer "where am I, how far, is it stuck?"
- Impact: non-breaking on behavior; log string changes for queue/memory scrapers.

**Phase and step boundaries visible at start**
- From: `timer.phase()` logs `PHASE N: …` only after each phase completes.
- To: `PHASE`/`STEP` START lines at boundaries; END/completion timing preserved via existing `PhaseTimer`.
- Reason: operators need context during long phases, not only after they finish.
- Impact: additive INFO lines; phase-timing report rows unchanged.

**Per-account activity summarized in heartbeat**
- From: each match/correlation emits its own INFO line (`MATCH FOUND: …`, `Triggering correlation for …`).
- To: callers record events into `OperationRunContext`; heartbeat flushes `EVENT_SUMMARY` line(s) each tick; failures stay immediate warn/error.
- Reason: reduce noise; preserve aggregate visibility.
- Impact: log output change at INFO; debug level may retain per-account detail.

**Stall warnings when queue stops completing**
- From: repeated identical queue stats with no interpretation.
- To: `WARN STALL` when `totalProcessed` delta is zero for two consecutive STATUS ticks, listing top active queue labels.
- Reason: directly addresses "queue not making progress" confusion.
- Impact: additive WARN lines.

## Capabilities

### New Capabilities

(none — assigned to existing specs)

### Modified Capabilities

- `log-service`: text-line operation vocabulary (`STATUS`, `EVENT_SUMMARY`, `PHASE`, `STEP`, `METRIC`, stall warnings); `OperationRunContext` and heartbeat contract; amend structured-log aspirational requirement to reflect host text-line reality.
- `account-list-operation`: account-list runs start/stop heartbeat; phase/step instrumentation; event aggregation during Process/Output phases.
- `client-service`: remove standalone periodic queue stats logging; queue stats remain observable via API for heartbeat consumption.
- `ubiquitous-language`: canonical terms for operation heartbeat line kinds (`STATUS`, `EVENT_SUMMARY`, `Operation heartbeat`).

## Impact

- **Code**: `src/services/logService/` (helpers, `operationHeartbeat.ts`, `OperationRunContext`), `src/services/serviceRegistry.ts`, `src/operations/accountList.ts`, `src/operations/helpers/accountListPhases.ts`, `src/services/clientService/clientService.ts`, `src/utils/operationHandler.ts`, `src/services/matchingService/matchOutcomeDispatcher.ts`, `src/services/fusionService/managedAccountAnalysisRecorder.ts`, `src/services/fusionService/fusionService.ts`, `src/services/identityService.ts`.
- **Specs**: deltas for `log-service`, `account-list-operation`, `client-service`, `ubiquitous-language`.
- **Tests**: new heartbeat/context tests; updates to `accountList.test.ts`, `operationHandler.test.ts`, match/correlation logging tests.
- **APIs/contracts**: no connector-spec changes. Log output changes only.
