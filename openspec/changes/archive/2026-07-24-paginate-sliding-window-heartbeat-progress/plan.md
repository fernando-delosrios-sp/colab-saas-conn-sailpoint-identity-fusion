# Paginate Sliding Window + Fetch Progress Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace sequential parallel pagination batches with a sliding-window scheduler, remove the parallelBatchSize/maxConcurrentRequests cap, and surface per-page fetch progress for smoother heartbeat STATUS deltas.

**Architecture:** Add a reusable sliding-window executor inside `ClientService` that maintains up to `parallelBatchSize` in-flight page `execute()` calls, buffers completed pages for ascending-offset yields, and fires `onPageProgress` after each completion. Global throttling unchanged via `ApiQueue`. SourceService already aggregates progress callbacks — verify wiring after client change.

**Tech Stack:** TypeScript, Vitest, OpenSpec deltas in `openspec/changes/paginate-sliding-window-heartbeat-progress/`

**References:** `design.md`, `tasks.md`, spec deltas under `specs/`

---

## Task 1: Sliding-window helper (TDD)

- [ ] **Step 1:** In `clientService.test.ts`, add failing test — mock slow/fast pages; assert next offset enqueued before all window pages complete
- [ ] **Step 2:** Add failing test — completion order reversed; assert yield order ascending by offset
- [ ] **Step 3:** Add failing test — `onPageProgress` called N times for N pages (not once per old batch)
- [ ] **Step 4:** Implement private helper (e.g. `_runParallelPageWindow`) in `clientService.ts`
- [ ] **Step 5:** Run `npm test -- src/services/clientService/__tests__/clientService.test.ts`

## Task 2: Wire `_paginateParallel`

- [ ] **Step 1:** Replace sequential `for (i += bs) await Promise.all` loop in `_paginateParallel` with helper
- [ ] **Step 2:** Preserve initial count page + `X-Total-Count` handling and `PaginationError` semantics
- [ ] **Step 3:** Run clientService tests; fix regressions

## Task 3: Wire legacy generator + remove cap

- [ ] **Step 1:** Apply helper to `paginateParallelGenerator` (or consolidate if duplicate)
- [ ] **Step 2:** Remove `Math.min(parallelBatchSize, maxConcurrentRequests)` in constructor (~line 50)
- [ ] **Step 3:** Add test: configured batchSize 16 + maxConcurrent 10 → window 16 on ClientService instance
- [ ] **Step 4:** Run full `npm test`

## Task 4: SourceService progress verification

- [ ] **Step 1:** Review `sourceService.fetchManagedAccounts` aggregate progress callback — adjust only if batch-level assumption remains
- [ ] **Step 2:** Extend `sourceService.test.ts` with mock paginate emitting multiple small page progress ticks
- [ ] **Step 3:** Run sourceService tests

## Task 5: Docs + verify

- [ ] **Step 1:** Update connector-spec help + `docs/guides/advanced-connection-settings.md`
- [ ] **Step 2:** CHANGELOG entry
- [ ] **Step 3:** Run `npm run lint`
- [ ] **Step 4:** Write `verify.md` with test evidence and optional Fetch duration comparison notes

**Commit points:** After Task 1 (helper + tests), Task 3 (cap removal), Task 5 (docs)
