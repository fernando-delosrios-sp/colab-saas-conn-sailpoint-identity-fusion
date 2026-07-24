# Heartbeat Progress Delta Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Show pipeline progress delta on STATUS lines, relabel API queue metrics as `api-queue completed=`, and instrument Fetch pagination with `setProgress` so heartbeat throughput is visible during all long phases.

**Architecture:** Extend `OperationHeartbeat` with dual baseline tracking (`previousProgressDone`, `previousProcessed`). Centralize delta formatting. Relabel STATUS queue segment. Add optional `onPageProgress` callback to ClientService pagination helpers; Fetch services call `log.setProgress(..., 'fetched')` at batch boundaries.

**Tech Stack:** TypeScript, Vitest, OpenSpec delta specs in `openspec/changes/heartbeat-progress-delta/`

**References:** `design.md`, `specs/log-service/spec.md`, `specs/account-list-operation/spec.md`

---

## Task 1: Shared delta formatter and heartbeat state

**Files:** `src/services/logService/operationHeartbeat.ts`, `src/services/logService/__tests__/operationHeartbeat.test.ts`

- [ ] **Step 1:** Write failing tests for `formatDeltaSuffix` (undefined previous → no suffix; zero delta → `(Δ+0/10s)`; negative omitted in practice)
- [ ] **Step 2:** Implement `formatDeltaSuffix` and export for tests if needed
- [ ] **Step 3:** Write failing tests for progress delta + unit suffix (`progress=10296/18495(Δ+2700/10s)`, `progress=537/800 analyzed(Δ+0/10s)`)
- [ ] **Step 4:** Update `formatStatusLine` signature to accept `previousProgressDone`; render progress delta and optional unit
- [ ] **Step 5:** Relabel `queue` → `api-queue`, `processed=` → `completed=` in formatter and tests
- [ ] **Step 6:** Add `previousProgressDone` to `OperationHeartbeat.tick()` update/reset logic
- [ ] **Step 7:** Run `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts`

---

## Task 2: Stall warning wording

**Files:** `src/services/logService/operationHeartbeat.ts`, tests

- [ ] **Step 1:** Update `formatStallWarning` message to say `api-queue completed unchanged` instead of `queue processed unchanged`
- [ ] **Step 2:** Adjust stall test expectations
- [ ] **Step 3:** Confirm stall detection still uses api-queue completed only (add test: progress delta non-zero, queue idle → no stall)

---

## Task 3: ClientService pagination progress callback

**Files:** `src/services/clientService/clientService.ts`, `src/services/clientService/types.ts`, `src/services/clientService/__tests__/clientService.test.ts`

- [ ] **Step 1:** Add optional `onPageProgress?: (loaded: number, total?: number) => void` to paginate policy type
- [ ] **Step 2:** Invoke callback from `_paginateParallel`, `_paginateSequential`, and `_paginateSearchAfter` after each page/batch with running loaded count and known total
- [ ] **Step 3:** Add unit test verifying callback fires with correct loaded/total on multi-page fetch

---

## Task 4: SourceService fetch progress

**Files:** `src/services/sourceService/sourceService.ts`, tests

- [ ] **Step 1:** Pass `onPageProgress: (loaded, total) => log.setProgress(loaded, total ?? loaded, 'fetched')` into managed-account and fusion-account fetch `client.call` paginate policies
- [ ] **Step 2:** When multiple sources fetch in parallel, use atomic running totals or sequential per-source progress (design D6: aggregate counter — implement simplest correct aggregate)
- [ ] **Step 3:** Add test that fetch updates `runContext.progress` with unit `fetched`

---

## Task 5: Identity and form fetch progress

**Files:** `src/services/identityService.ts`, `src/services/formService/formService.ts`, tests

- [ ] **Step 1:** Wire identity search pagination to `setProgress` via callback or batch loop
- [ ] **Step 2:** Wire form-instance fetch pagination similarly if multi-page
- [ ] **Step 3:** Run targeted service tests

---

## Task 6: Documentation

**Files:** `docs/concepts/glossary.md`, `docs/guides/advanced-connection-settings.md`, `CHANGELOG.md`

- [ ] **Step 1:** Update STATUS line description with progress delta and `api-queue completed=`
- [ ] **Step 2:** Add glossary entries for Pipeline progress delta and API queue completed delta
- [ ] **Step 3:** CHANGELOG entry with scraper migration note

---

## Task 7: Final validation

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run lint`
- [ ] **Step 3:** `openspec validate heartbeat-progress-delta --strict`

**Commit suggestion:** `feat(observability): add pipeline progress delta to STATUS heartbeat`
