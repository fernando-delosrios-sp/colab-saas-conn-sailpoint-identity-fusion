# Dry-run API Adapter Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make dry-run a full accountList execution that streams identical `StdAccountListOutput` rows while inhibiting all ISC tenant writes via a `DryRunApiAdapter`.

**Architecture:** Introduce `DryRunApiAdapter` at the same layer as `RecordingApiAdapter` / `ReplayApiAdapter`. Reads pass through to live SDK; writes return synthetic shadow-store responses. Remove `isPersistentRun()` business-logic gates so Match, Correlation, and Output run identically to persistent aggregation.

**Tech Stack:** TypeScript (strict), Node.js 24, Vitest, @sailpoint/connector-sdk, sailpoint-api-client

**Spec refs:** `openspec/changes/dryrun-api-adapter/specs/`
**Design ref:** `openspec/changes/dryrun-api-adapter/design.md`

---

## Task 1: Shared write classification

**Files:**
- Create: `src/services/clientService/apiWriteClassification.ts`
- Modify: `src/services/clientService/replayApiAdapter.ts`

- [ ] **Step 1:** Copy `WRITE_METHODS`, `isWriteMethod()` from `replayApiAdapter.ts` into `apiWriteClassification.ts`; export both
- [ ] **Step 2:** Update `replayApiAdapter.ts` to import from shared module
- [ ] **Step 3:** Run `npm test -- src/services/clientService/__tests__/replayApiAdapter.test.ts`

---

## Task 2: DryRunApiAdapter

**Files:**
- Create: `src/services/clientService/dryRunApiAdapter.ts`
- Create: `src/services/clientService/__tests__/dryRunApiAdapter.test.ts`

- [ ] **Step 1:** Write failing tests: read delegates to inner mock; write does not call inner; `createFormDefinition` returns `{ id: string }`
- [ ] **Step 2:** Implement `DryRunApiAdapter` using `RecordingApiAdapter` proxy pattern; use `isWriteMethod()` for branch
- [ ] **Step 3:** Implement shadow store with `stableKey(api, method, args)` for deterministic synthetic IDs
- [ ] **Step 4:** Add synthetic handlers for: `createFormDefinition`, `createFormInstance`, `updateAccount`, `updateSource`, delete methods
- [ ] **Step 5:** Run `npm test -- src/services/clientService/__tests__/dryRunApiAdapter.test.ts`

---

## Task 3: ServiceRegistry wiring

**Files:**
- Modify: `src/services/serviceRegistry.ts`
- Modify: `src/services/clientService/clientService.ts` (if adapter swap requires accessor)
- Modify: `src/operations/accountList.ts`

- [ ] **Step 1:** Add `activateDryRunMode()` to `ServiceRegistry` — wrap current adapter with `DryRunApiAdapter`, log activation
- [ ] **Step 2:** At top of `accountList()`, after `parseDryRunInput`: call `activateDryRunMode()` when enabled
- [ ] **Step 3:** Add guard: if dry-run && (`config.recording.mode !== 'off'` || `run.isRecordMode`) → throw `ConnectorError`
- [ ] **Step 4:** Write test for mutual exclusivity guard

---

## Task 4: Unify pipeline — output phase

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts`
- Modify: `src/operations/accountList.ts`

- [ ] **Step 1:** Delete `if (!isPersistent) { ... return 0 }` block in `outputPhase` (lines ~304–311)
- [ ] **Step 2:** Extract shared send path: both modes call `forEachISCAccount(send, true)`; only persistent tail runs `saveState`, `saveBatchCumulativeCount`, form cleanup, scheduling
- [ ] **Step 3:** Fix double cache-clear in `accountList.ts` so fusion accounts aren't cleared before send
- [ ] **Step 4:** Update dry-run test to expect account sends before summary

---

## Task 5: Remove business-logic gates

**Files:**
- Modify: `src/services/matchingService/matchOutcomeDispatcher.ts`
- Modify: `src/services/correlationManager.ts`
- Modify: `src/operations/helpers/accountListPhases.ts`
- Modify: `src/services/fusionService/fusionService.ts`

- [ ] **Step 1:** Remove `if (!this.isPersistentRun()) return` blocks in `handleExactMatch`, `handlePartialMatch`; keep logic body
- [ ] **Step 2:** Remove correlation gate in `CorrelationManager.applyPerSourceCorrelationIfNeeded`
- [ ] **Step 3:** Remove setup/process phase `isPersistent` skips for: reverse correlation, managed-source aggregation, process lock, await-disable-ops (adapter handles writes)
- [ ] **Step 4:** Remove `setPersistentRun` calls and `isPersistentRun` wiring if only used for gates; keep dry-run flag for epilogue only
- [ ] **Step 5:** Update `correlationManager.test.ts` — correlation logic runs in dry-run; inner adapter not called for PATCH

---

## Task 6: Tests and docs

**Files:**
- Modify: `src/operations/__tests__/accountList.test.ts`
- Modify: `docs/operations/dry-run.md`
- Modify: `docs/operations/account-list.md`

- [ ] **Step 1:** Rewrite dry-run tests: `res.send` called N times for accounts + 1 summary; `rowsSent === N`
- [ ] **Step 2:** Assert `saveBatchCumulativeCount` PATCH inhibited (inner not called) when dry-run adapter active
- [ ] **Step 3:** Run full `npm test`
- [ ] **Step 4:** Update dry-run.md flow diagram and suppressed side effects table (adapter-based)
- [ ] **Step 5:** Run `npm run lint`

---

## Task 7: Verify

- [ ] **Step 1:** Run `openspec validate dryrun-api-adapter`
- [ ] **Step 2:** Manual smoke: `npm run dev` + spcx dry-run invocation; confirm account rows streamed, tenant unchanged
