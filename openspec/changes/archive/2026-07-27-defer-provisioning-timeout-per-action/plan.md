# Defer Provisioning Timeout Per Action — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or `/opsx:apply` to implement task-by-task.

**Goal:** Fix provisioning timeout to start per action at HTTP execution, propagate abort reasons, and include rate-limiter wait in STATUS `q`.

**Architecture:** Lazy timeout inside `ClientService.execute()`'s queue `fn()` closure; queue tracks `rateLimitWaitCount` around `waitForSlot()`; heartbeat sums pending counts for `q` display.

**Tech Stack:** TypeScript, Node.js 24, Vitest

**Change artifacts:** `openspec/changes/defer-provisioning-timeout-per-action/`

---

## Task 1: Defer provisioning timeout to execution start

**Files:**
- Modify: `src/services/clientService/clientService.ts`
- Modify: `src/services/clientService/__tests__/clientService.test.ts`

- [ ] **Step 1:** Read current `execute()` — identify outer timeout controller and merged signal passed to enqueue
- [ ] **Step 2:** Remove outer `timeoutController` / `setTimeout` / `clearTimeout` from `execute()` try/finally
- [ ] **Step 3:** Inside `fn()`, create timeout controller + timer before `invokeAbortable`; merge with caller `abortSignal`; clear timer in `fn().finally()`
- [ ] **Step 4:** Pass only caller `abortSignal` to `queue.enqueue({ abortSignal, ... })`
- [ ] **Step 5:** Add test — real queue, `provisioningTimeout: 1`, block concurrency so item waits >1s in queue, then fast HTTP → must resolve
- [ ] **Step 6:** Update existing slow-HTTP timeout test to assert rejection message includes `timed out`
- [ ] **Step 7:** Run `npm test -- src/services/clientService/__tests__/clientService.test.ts`

---

## Task 2: Abort reason propagation

**Files:**
- Modify: `src/services/clientService/queue.ts`
- Modify: `src/services/clientService/__tests__/apiQueue.test.ts`

- [ ] **Step 1:** Pre-flight abort: `item.reject(options.abortSignal?.reason ?? new Error('Aborted'))`
- [ ] **Step 2:** While-queued abort listener: same pattern
- [ ] **Step 3:** Post-`waitForSlot` abort check: throw/reject with reason when available
- [ ] **Step 4:** Add test — enqueue with AbortController, abort with custom reason while queued, assert rejection message matches reason
- [ ] **Step 5:** Run `npm test -- src/services/clientService/__tests__/apiQueue.test.ts`

---

## Task 3: Rate-limiter wait counter

**Files:**
- Modify: `src/services/clientService/types.ts`
- Modify: `src/services/clientService/queue.ts`
- Modify: `src/services/clientService/clientService.ts` (fallback stats)
- Modify: `src/services/clientService/__tests__/apiQueue.test.ts`

- [ ] **Step 1:** Add `rateLimitWaitCount: number` to `QueueStats`; init to 0 in queue constructor stats
- [ ] **Step 2:** In `executeRequest`: increment before `await waitForSlot()`, decrement in `finally` after wait completes or throws
- [ ] **Step 3:** Reset counter in `clear()`
- [ ] **Step 4:** Add test — mock slow rate limiter or block window; assert `getStats().rateLimitWaitCount` > 0 while waiting
- [ ] **Step 5:** Run `npm test -- src/services/clientService/__tests__/apiQueue.test.ts`

---

## Task 4: STATUS combined q

**Files:**
- Modify: `src/services/logService/operationHeartbeat.ts`
- Modify: `src/services/logService/__tests__/operationHeartbeat.test.ts`

- [ ] **Step 1:** Add helper `pendingQueueCount(stats)` → `queueLength + (rateLimitWaitCount ?? 0)`
- [ ] **Step 2:** Use in `formatApiQueueSegment`, `isApiQueueIdle`, and stall detection (`queueLength > 0` checks)
- [ ] **Step 3:** Add test — `queueLength: 0, rateLimitWaitCount: 49` → `api=0a/49q/...`
- [ ] **Step 4:** Run `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts`

---

## Task 5: Documentation and full verification

**Files:**
- Modify: `docs/guides/advanced-connection-settings.md`

- [ ] **Step 1:** Update provisioning timeout description — per HTTP attempt, not queue wait
- [ ] **Step 2:** Update STATUS `api=` segment docs — `q` includes rate-limiter wait
- [ ] **Step 3:** `npm test`
- [ ] **Step 4:** `npm run lint`

---

## Commit guidance

- Commit 1: Task 1 (deferred timeout + clientService tests)
- Commit 2: Tasks 2–3 (queue abort reason + rateLimitWaitCount)
- Commit 3: Task 4–5 (heartbeat + docs)
