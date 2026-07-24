# Operation Status Heartbeat Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace disconnected queue/memory/per-account logs with a unified 30s operation heartbeat that explains phase, step, progress, queue stall state, and aggregated account activity during `accountList`.

**Architecture:** `OperationRunContext` on `ServiceRegistry` holds phase/step/progress/event counters updated by new `LogService` helpers. `OperationHeartbeat` reads context + `ClientService` queue stats + memory every 30s and emits `STATUS`, `EVENT_SUMMARY`, and `WARN STALL` text lines. Legacy `Queue Stats` and `Memory usage` log lines are removed.

**Tech Stack:** TypeScript, Vitest, `@sailpoint/connector-sdk` logger, existing `ApiQueue` observability APIs.

**Spec refs:** `openspec/changes/operation-status-heartbeat/specs/{log-service,account-list-operation,client-service,ubiquitous-language}/spec.md`

---

## Task 1: OperationRunContext + LogService helpers

**Files:** `src/services/logService/operationRunContext.ts` (new), `src/services/logService/logService.ts`, `src/services/serviceRegistry.ts`

- [ ] **Step 1:** Define `OperationRunContext`, `EventCounters`, and `ProgressSnapshot` types; add `runContext` field to `ServiceRegistry` initialized per operation
- [ ] **Step 2:** Implement `phaseStart/End`, `stepStart/End`, `setProgress`, `recordEvent`, `resetEventCounters` on `LogService`; emit formatted `PHASE`/`STEP`/`METRIC` lines
- [ ] **Step 3:** Write `operationRunContext.test.ts` — context updates, event counter increment/reset, progress formatting
- [ ] **Step 4:** Run `npm test -- src/services/logService/__tests__/operationRunContext.test.ts`

---

## Task 2: OperationHeartbeat module

**Files:** `src/services/logService/operationHeartbeat.ts` (new), `src/services/logService/index.ts`

- [ ] **Step 1:** Implement `OperationHeartbeat.start(log, getSnapshot)` / `.stop()` with 30s interval from config
- [ ] **Step 2:** Implement STATUS formatter: phase, step, progress, elapsed, queue stats with delta, memory RSS/heap
- [ ] **Step 3:** Implement EVENT_SUMMARY formatter (multiple lines); flush and reset counters each tick
- [ ] **Step 4:** Implement stall detection (2 consecutive zero deltas) and WARN STALL with grouped active labels (top 3)
- [ ] **Step 5:** Write `operationHeartbeat.test.ts` covering format, delta, stall, multi-line summaries
- [ ] **Step 6:** Run `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts`

---

## Task 3: Remove legacy heartbeats

**Files:** `src/services/clientService/clientService.ts`, `src/utils/operationHandler.ts`

- [ ] **Step 1:** Remove `startStatsLogging()` call from constructor; delete or no-op the interval method
- [ ] **Step 2:** In `scheduleKeepAlive` memory mode, remove `logger.info('Memory usage…')`; keep `res.keepAlive()`
- [ ] **Step 3:** Update `operationHandler.test.ts` — assert keepAlive called, no memory log
- [ ] **Step 4:** Update `clientService.test.ts` if it asserts queue stats logging
- [ ] **Step 5:** Run affected tests

---

## Task 4: Wire heartbeat into accountList

**Files:** `src/operations/accountList.ts`, `src/operations/helpers/accountListPhases.ts`

- [ ] **Step 1:** Start heartbeat after timer creation; pass snapshot closure reading `ServiceRegistry.getCurrent()`
- [ ] **Step 2:** Stop heartbeat in outer `finally`
- [ ] **Step 3:** Add `phaseStart` before each phase in `accountList.ts`
- [ ] **Step 4:** Add `stepStart`/`stepEnd` at sub-step boundaries in `accountListPhases.ts` (Process and Output steps per design)
- [ ] **Step 5:** Replace progress INFO strings with `setProgress` in match sweep, batch process, and send-accounts loop
- [ ] **Step 6:** Update `accountList.test.ts` — expect PHASE START, no `Queue Stats`/`Memory usage`
- [ ] **Step 7:** Run `npm test -- src/operations/__tests__/accountList.test.ts`

---

## Task 5: Aggregate per-account events

**Files:** `managedAccountAnalysisRecorder.ts`, `matchOutcomeDispatcher.ts`, `fusionService.ts`, `identityService.ts`

- [ ] **Step 1:** Replace `log.info` match lines in `managedAccountAnalysisRecorder.recordAnalysis` with `recordEvent('match', { type })`
- [ ] **Step 2:** Replace deferred match INFO in dispatcher and fusionService with `recordEvent`
- [ ] **Step 3:** Replace correlation trigger INFO in `identityService.correlateAccounts` with `recordEvent('correlation', { accounts: N })`
- [ ] **Step 4:** Add debug-only individual lines behind `log.getLogLevel() === 'debug'` if useful
- [ ] **Step 5:** Update match/correlation tests to assert aggregation behavior at INFO
- [ ] **Step 6:** Run related test files

---

## Task 6: Docs, changelog, full verify

**Files:** `CHANGELOG.md`, optional docs

- [ ] **Step 1:** Add CHANGELOG entry with migration note (`Queue Stats` → `STATUS`, `Memory usage` folded into STATUS)
- [ ] **Step 2:** Add ubiquitous-language glossary entries when syncing specs (during archive) or note in CHANGELOG
- [ ] **Step 3:** Run `npm test`
- [ ] **Step 4:** Run `npm run lint`

---

## Commit checkpoints (suggested)

1. `feat(log): add OperationRunContext and text line helpers`
2. `feat(log): add OperationHeartbeat with STATUS and stall detection`
3. `refactor(log): remove standalone queue and memory log heartbeats`
4. `feat(accountList): wire operation heartbeat and phase/step boundaries`
5. `refactor(accountList): aggregate match and correlation logs into heartbeat`
6. `docs: changelog for operation status heartbeat`
