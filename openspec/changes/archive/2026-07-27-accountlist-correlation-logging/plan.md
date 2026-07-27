# AccountList Correlation Logging Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remove misleading `correlated-action` from accountList correlation logs and add live drain metrics (`completed=`, `pending=`) so operators can reconcile fast Output phase completion with background correlation PATCH queue drain.

**Architecture:** Extend `CorrelationActivityCounters` with completed counts; gate `recordCorrelatedActionGranted` behind `!isAggregationMode`; wire PATCH resolve to `recordCorrelationCompleted`; expose `correlationQueuePending` in heartbeat snapshot; extend formatters for drain segments on STATUS/EVENT_SUMMARY/PHASE END.

**Tech Stack:** TypeScript, Vitest, existing LogService / OperationHeartbeat / IdentityService / ApiQueue infrastructure.

**Spec refs:** `openspec/changes/accountlist-correlation-logging/specs/{log-service,account-list-operation}/spec.md`

---

## Task 1: Completed counters + format updates

**Files:** `src/services/logService/operationRunContext.ts`, `src/services/logService/logService.ts`

- [ ] **Step 1:** Add `linkCompleted`, `mergeCompleted` to `CorrelationActivityCounters` and `createEmptyCorrelationActivityCounters()`
- [ ] **Step 2:** Implement `incrementCorrelationCompleted()` helper and `recordCorrelationCompleted({ kind, count? })` on context + LogService
- [ ] **Step 3:** Extend `formatCorrelationSummaryValue` — add `completed=` segment (cumulative + interval delta); keep `correlated-action=` only when counter > 0 (will be zero during aggregation after Task 3)
- [ ] **Step 4:** Update `hasCorrelationActivity` to include completed fields
- [ ] **Step 5:** Update `operationRunContext.test.ts` — completed counter, format without correlated-action
- [ ] **Step 6:** Run `npm test -- src/services/logService/__tests__/operationRunContext.test.ts`

---

## Task 2: Heartbeat snapshot + drain formatting

**Files:** `src/services/serviceRegistry.ts`, `src/services/logService/operationHeartbeat.ts`

- [ ] **Step 1:** Add `correlationQueuePending?: number` to `HeartbeatSnapshot` type
- [ ] **Step 2:** In `getHeartbeatSnapshot()`, count pending items matching `CORRELATE_ACCOUNTS_LABEL_PREFIX`
- [ ] **Step 3:** Extend `formatCorrelationSummaryValue` or STATUS builder to append `pending=N` when snapshot pending > 0 and phase is Output/Epilogue
- [ ] **Step 4:** Extend `formatEventSummaryLines` for `completed=+N/interval` on correlation segment
- [ ] **Step 5:** Update `operationHeartbeat.test.ts` — STATUS drain segment, EVENT_SUMMARY completed delta
- [ ] **Step 6:** Run `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts`

---

## Task 3: Suppress correlated-action during aggregation

**Files:** `src/services/fusionService/fusionService.ts`, `src/services/fusionService/decisionProcessor.ts`

- [ ] **Step 1:** In `processFusionAccount`, pass `undefined` callback when `this.isAggregationMode`:
  ```typescript
  const onGrant = this.isAggregationMode ? undefined : () => this.log.recordCorrelatedActionGranted()
  fusionAccount.updateCorrelationStatus(onGrant)
  ```
- [ ] **Step 2:** Same pattern in `getISCAccount` when building output during aggregation
- [ ] **Step 3:** Same pattern in `decisionProcessor.processFusionIdentityDecision`
- [ ] **Step 4:** Add/update fusionService test asserting no `recordCorrelatedActionGranted` when `isAggregationMode: true`
- [ ] **Step 5:** Run `npm test -- src/services/fusionService/__tests__/fusionService.test.ts`

---

## Task 4: PATCH completion instrumentation

**Files:** `src/services/identityService.ts`

- [ ] **Step 1:** Pass `kind` from `correlateSingleAccount` into `buildCorrelationPromise(accountId, iscAccountId, identityId, kind)`
- [ ] **Step 2:** In `.then()` success handler, call `this.log.recordCorrelationCompleted({ kind })`
- [ ] **Step 3:** Update `identityService.test.ts` — mock log, assert completed counter on resolve
- [ ] **Step 4:** Run `npm test -- src/services/__tests__/identityService.test.ts`

---

## Task 5: Docs, changelog, full verify

**Files:** `CHANGELOG.md`, `docs/guides/advanced-connection-settings.md`

- [ ] **Step 1:** CHANGELOG entry — remove correlated-action from accountList; add completed/pending drain format
- [ ] **Step 2:** Update advanced-connection-settings correlation format section and grep examples
- [ ] **Step 3:** Run targeted test suite:
  ```bash
  npm test -- src/services/logService/__tests__/operationRunContext.test.ts src/services/logService/__tests__/operationHeartbeat.test.ts src/services/__tests__/identityService.test.ts
  ```
- [ ] **Step 4:** Run `npm run lint`

---

## Commit guidance

1. `fix(logging): add correlation completed counters and drain format`
2. `fix(logging): suppress correlated-action during accountList aggregation`
3. `docs: update correlation log format for accountList drain metrics`
