# Correlation Activity Logging Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make correlation-on-aggregation (link), merge-driven correlation (merge), and correlated-action entitlement grants visible at INFO via EVENT_SUMMARY, PHASE END totals, and Refresh STATUS segments — without per-account INFO spam.

**Architecture:** Extend `OperationRunContext` with typed correlation activity counters (interval + phase cumulative). Instrument PATCH, entitlement transition, and skip paths. Extend `OperationHeartbeat` formatters and wire `accountList` phase boundaries to flush summaries.

**Tech Stack:** TypeScript, Vitest, existing `LogService` / `OperationHeartbeat` infrastructure.

**Spec refs:** `openspec/changes/correlation-activity-logging/specs/{log-service,account-list-operation,ubiquitous-language}/spec.md`

---

## Task 1: CorrelationActivityCounters + LogService helpers

**Files:** `src/services/logService/operationRunContext.ts`, `src/services/logService/logService.ts`

- [ ] **Step 1:** Define `CorrelationActivityCounters` and skip-reason type; add interval + phase cumulative fields to `OperationRunContext`
- [ ] **Step 2:** Implement `recordCorrelationActivity`, `recordCorrelatedActionGranted`, `recordCorrelationSkipped`; reset phase counters in existing `phaseStart` path
- [ ] **Step 3:** Implement `flushPhaseCorrelationSummary()` returning detail record for `phaseEnd`
- [ ] **Step 4:** Add `LogService` passthrough methods
- [ ] **Step 5:** Write/update `operationRunContext.test.ts`
- [ ] **Step 6:** Run `npm test -- src/services/logService/__tests__/operationRunContext.test.ts`

---

## Task 2: Heartbeat + phase formatters

**Files:** `src/services/logService/operationHeartbeat.ts`

- [ ] **Step 1:** Add `formatCorrelationSummarySegment(counters, options?)` for EVENT_SUMMARY and PHASE END
- [ ] **Step 2:** Update `formatEventSummaryLines` — replace `correlations triggered=` with `link=` / `merge=` breakdown
- [ ] **Step 3:** Add Refresh STATUS correlation segment in `formatStatusLine` when phase is Refresh
- [ ] **Step 4:** Write/update `operationHeartbeat.test.ts` for new formats
- [ ] **Step 5:** Run `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts`

---

## Task 3: Instrument PATCH and skip paths

**Files:** `src/services/identityService.ts`, `src/services/correlationManager.ts`

- [ ] **Step 1:** Add optional `kind: 'link' | 'merge'` param to `correlateAccounts`; call `recordCorrelationActivity`
- [ ] **Step 2:** In `correlateSingleAccount`, call `recordCorrelationSkipped('noIscAccountId')` on missing ISC id (keep existing WARN)
- [ ] **Step 3:** In `correlatePerSource`, count skips (no identity, no source context, wrong mode) before filter; pass `kind: 'link'`
- [ ] **Step 4:** Update `correlationManager.test.ts` and `identityService.test.ts`
- [ ] **Step 5:** Run affected tests

---

## Task 4: Correlated-action grant + merge kind

**Files:** `src/model/fusionAccount.ts`, `src/model/fusionCorrelation.ts`, `src/services/fusionService/fusionService.ts`, `src/services/fusionService/decisionProcessor.ts`

- [ ] **Step 1:** Track prior correlated state in `updateStatus`; invoke optional `onCorrelatedActionGranted` callback on transition
- [ ] **Step 2:** Wire callback from `FusionService.processFusionAccount` to `log.recordCorrelatedActionGranted()`
- [ ] **Step 3:** In `DecisionProcessor.processFusionIdentityDecision`, pass merge context so correlation uses `kind: 'merge'`
- [ ] **Step 4:** Update `fusionService.test.ts` for merge link counting and entitlement grant
- [ ] **Step 5:** Run affected tests

---

## Task 5: Account-list phase wiring

**Files:** `src/operations/accountList.ts`, `src/operations/helpers/accountListPhases.ts`

- [ ] **Step 1:** After Refresh and Process phases, call `phaseEnd(n, phase, flushPhaseCorrelationSummary())` when non-empty
- [ ] **Step 2:** Extend Process completion `log.detail` with correlation segment
- [ ] **Step 3:** Update `accountListPhaseInstrumentation.test.ts`
- [ ] **Step 4:** Run `npm test -- src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts`

---

## Task 6: Docs, changelog, full verify

**Files:** `CHANGELOG.md`, `docs/guides/advanced-connection-settings.md`

- [ ] **Step 1:** CHANGELOG entry with format migration note
- [ ] **Step 2:** Update advanced-connection-settings EVENT_SUMMARY / PHASE END examples
- [ ] **Step 3:** Run `npm test`
- [ ] **Step 4:** Run `npm run lint`

---

## Commit checkpoints (suggested)

1. `feat(log): add correlation activity counters to OperationRunContext`
2. `feat(log): format link/merge correlation in EVENT_SUMMARY and PHASE END`
3. `feat(correlation): instrument PATCH, skip, and correlated-action grant paths`
4. `feat(accountList): emit correlation totals on Refresh and Process phase END`
5. `docs: changelog and operator guide for correlation activity logging`
