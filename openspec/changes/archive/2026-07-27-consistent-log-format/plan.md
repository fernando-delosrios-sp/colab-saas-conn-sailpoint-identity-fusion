# Consistent Log Format Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Unify connector logging to `[context] KIND payload` format across all operations, merging dual phase lines into PHASE END boundaries and introducing DETAIL for operational milestones.

**Architecture:** Extend `LogService` with `phaseEnd`, `detail`, `epilogueEnd`; add `bootstrapLog` for `[config]` prefix; migrate accountList first (remove PhaseTimer colon lines), then other operations to STEP; convert free-form INFO to DETAIL; align specs via change deltas.

**Tech Stack:** TypeScript, Vitest, LogService, OperationRunContext, OperationHeartbeat

**Spec references:** `openspec/changes/consistent-log-format/specs/{log-service,account-list-operation,ubiquitous-language}/spec.md`

---

## Task 1: LogService API (TDD)

**Files:** `src/services/logService/operationRunContext.ts`, `logService.ts`, `__tests__/logService.test.ts`

- [ ] **Step 1:** Write failing test — `phaseStart(1,'Setup')` then `phaseEnd(1,'Setup')` emits `[accountList] PHASE 1 Setup END elapsed=`
- [ ] **Step 2:** Add `phaseStartedAt?: number` to OperationRunContext; set in `phaseStart`
- [ ] **Step 3:** Implement `phaseEnd()` using `formatDetailSuffix` + `PhaseTimer.formatElapsed`
- [ ] **Step 4:** Write failing test for `detail({ sources: 3 })` → `DETAIL sources=3`
- [ ] **Step 5:** Implement `detail(data: Record<string, unknown>)`
- [ ] **Step 6:** Write failing test for `epilogueEnd('report')` → `EPILOGUE report END elapsed=`
- [ ] **Step 7:** Implement `epilogueEnd()` with epilogue start timestamp tracking
- [ ] **Step 8:** Run `npm test -- src/services/logService/__tests__/logService.test.ts`
- [ ] **Step 9:** Commit: `feat(log): add phaseEnd, detail, epilogueEnd helpers`

---

## Task 2: Bootstrap logger

**Files:** `src/services/logService/bootstrapLog.ts`, `index.ts`, config settings files

- [ ] **Step 1:** Create `bootstrapLog` with `info/warn/error/debug` prepending `[config] `
- [ ] **Step 2:** Replace `logger.info` in `matchingSettings.ts` → `bootstrapLog.detail({ manualReviewScore, thresholdCount })`
- [ ] **Step 3:** Replace in `developerSettings.ts` → `bootstrapLog.detail({ validation: 'success' })`
- [ ] **Step 4:** Replace in `assertLite.ts` warn/error calls
- [ ] **Step 5:** Update `operationHandler.ts` — after registry: `log.detail({ mode: runMode })`
- [ ] **Step 6:** Run `npm test`
- [ ] **Step 7:** Commit: `feat(log): add [config] bootstrap logger`

---

## Task 3: Account-list phase merge

**Files:** `src/operations/accountList.ts`, `src/operations/helpers/accountListPhases.ts`

- [ ] **Step 1:** Update `accountList.test.ts` — expect `PHASE 1 Setup END`; remove assertions for `PHASE [1-5]:` and `Epilogue: report generation`
- [ ] **Step 2:** In `accountList.ts`: after each phase function, call `log.phaseEnd(n, phaseName)`; delete `timer.phase('PHASE N: …')` lines
- [ ] **Step 3:** In `accountListPhases.ts` reportEpilogue: replace `timer.phase('Epilogue: …')` with `log.epilogueEnd('report')`; use `timer.recordElapsed('Report', ms)` for breakdown
- [ ] **Step 4:** Remove `timer.phase` from `buildReportContext` (lines 434–443); add phaseEnd calls if phases run there
- [ ] **Step 5:** Run `npm test -- src/operations/__tests__/accountList.test.ts`
- [ ] **Step 6:** Commit: `refactor(accountList): merge phase boundaries to PHASE END`

---

## Task 4: Account-list DETAIL + email dedup

**Files:** `accountListPhases.ts`, `emailService.ts`, `workflowService.ts`, `fusionService/*.ts`, `operationHeartbeat.ts`

- [ ] **Step 1:** Replace `log.info('Loaded N managed source(s)')` → `log.detail({ sources: N })` in setupPhase
- [ ] **Step 2:** Replace source fetch/collection messages with DETAIL
- [ ] **Step 3:** In `emailService.sendEmail`: emit single `log.detail({ action: 'email sent', subject, recipients, formId })`; remove duplicate log in `sendFusionReviewEmail`
- [ ] **Step 4:** Add `emailSent` counter to EVENT_SUMMARY formatter in `operationHeartbeat.ts`
- [ ] **Step 5:** Call `recordEvent('emailSent')` from email send path during operations
- [ ] **Step 6:** Convert workflow resolution in `workflowService.ts` to DETAIL
- [ ] **Step 7:** Run targeted tests; commit: `refactor(log): DETAIL lines and email dedup for accountList`

---

## Task 5: Other operations STEP migration

**Files:** `accountCreate.ts`, `accountEnable.ts`, `accountDisable.ts`, `testConnection.ts`, others

- [ ] **Step 1:** accountCreate — wrap each block with `stepStart('fetch-identity')` / `stepEnd('fetch-identity')`; remove `timer.phase`
- [ ] **Step 2:** accountEnable / accountDisable — same pattern with kebab-case slugs
- [ ] **Step 3:** testConnection — STEP per validation checkpoint
- [ ] **Step 4:** Audit accountRead, accountUpdate, entitlementList, accountDiscoverSchema
- [ ] **Step 5:** Run full `npm test`
- [ ] **Step 6:** Commit: `refactor(operations): migrate to STEP boundaries`

---

## Task 6: Guardrails + docs

**Files:** ESLint config, `stateWrapper.ts`, docs

- [ ] **Step 1:** Route StateWrapper info/debug through registry log fallback
- [ ] **Step 2:** Add ESLint rule or knip restriction for SDK logger imports
- [ ] **Step 3:** Update `docs/guides/advanced-connection-settings.md` and `docs/concepts/glossary.md`
- [ ] **Step 4:** Run `npm run lint && npm test`
- [ ] **Step 5:** Dry-run grep verification per tasks.md 8.3
- [ ] **Step 6:** Commit: `docs(log): consistent format guide and lint guardrail`

---

## Verification checklist

```bash
npm test
npm run lint
# After dry-run:
grep -E 'PHASE [1-5]:' logs/debug-messages-*.log   # expect zero matches
grep -c 'Sent fusion review email' logs/...         # expect zero (replaced by DETAIL)
grep -E '^\[accountList\] (PHASE|STEP|STATUS|METRIC|EVENT_SUMMARY|EPILOGUE|DETAIL)' logs/...  # spot-check
```
