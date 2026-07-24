# Client Queue ISC Throughput Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or `/opsx:apply` to implement task-by-task.

**Goal:** Increase Fetch-phase API throughput by aligning `ApiQueue` with ISC's 100/10s window, decoupling concurrency from rate waits, and aborting timed-out HTTP.

**Architecture:** Introduce `SlidingWindowRateLimiter` used by `ApiQueue` before HTTP starts; keep priority sub-queues and retry logic unchanged. `ClientService.execute()` merges timeout and caller abort signals. Config defaults and connector-spec expose higher concurrency and `parallelBatchSize`.

**Tech Stack:** TypeScript, Node.js 24, Vitest

**Change artifacts:** `openspec/changes/client-queue-isc-throughput/`

---

## Task 1: Sliding-window rate limiter

**Files:**
- Create: `src/services/clientService/rateLimiter.ts`
- Create: `src/services/clientService/__tests__/rateLimiter.test.ts`
- Modify: `src/services/clientService/types.ts`, `src/data/config/internal/clientService.ts`

- [ ] **Step 1:** Implement `SlidingWindowRateLimiter` storing timestamps of recent acquires; `waitForSlot()` resolves when count < max within window
- [ ] **Step 2:** Test: 80 acquires succeed immediately; 81st waits until oldest timestamp exits 10s window (use fake timers)
- [ ] **Step 3:** Add config fields with defaults `windowMs: 10_000`, `maxRequests: 80`
- [ ] **Step 4:** Run `npm test -- src/services/clientService/__tests__/rateLimiter.test.ts`

---

## Task 2: Wire limiter into ApiQueue

**Files:**
- Modify: `src/services/clientService/queue.ts`
- Modify: `src/services/serviceRegistry.ts` (queue config wiring)
- Modify: `src/services/clientService/__tests__/apiQueue.test.ts`

- [ ] **Step 1:** Remove `nextRequestTime` / `minRequestInterval` throttle block from `executeRequest`
- [ ] **Step 2:** Before HTTP: `await rateLimiter.waitForSlot()` — **then** `activeRequests++`
- [ ] **Step 3:** Map `requestsPerSecond` → `maxRequests = rps * (windowMs/1000)` when explicit max unset
- [ ] **Step 4:** Add test: with `maxConcurrentRequests: 5`, 5 slow HTTP mocks in flight, items waiting on rate limit show `activeRequests === 5` not higher
- [ ] **Step 5:** Add test: burst of N starts within window respects cap (may replace or supplement existing rate-limit test)
- [ ] **Step 6:** Run `npm test -- src/services/clientService/__tests__/apiQueue.test.ts`

---

## Task 3: Abort on timeout

**Files:**
- Modify: `src/services/clientService/clientService.ts`
- Modify: `src/services/clientService/queue.ts` (pass through abort)
- Modify: `src/services/clientService/__tests__/clientService.test.ts`

- [ ] **Step 1:** In `execute()`, when `requestTimeoutMs` set, create `AbortController`, `setTimeout(() => controller.abort(), requestTimeoutMs)`
- [ ] **Step 2:** Merge caller `abortSignal` with timeout signal (abort either → reject)
- [ ] **Step 3:** Pass merged signal into enqueued fn; check `aborted` before and during execute
- [ ] **Step 4:** Wire axios cancel: pass `signal` in SDK request config if supported by call pattern (verify with sailpoint-api-client / axios)
- [ ] **Step 5:** Test: mock slow API; assert rejection before 5s when timeout 100ms; mock records abort
- [ ] **Step 6:** Run `npm test -- src/services/clientService/__tests__/clientService.test.ts`

---

## Task 4: Defaults and connector-spec

**Files:**
- Modify: `src/data/config/settings/advancedConnectionSettings.ts`
- Modify: `connector-spec.json`
- Modify: `docs/guides/advanced-connection-settings.md`
- Modify: `src/model/config.ts` (if new fields need typing)

- [ ] **Step 1:** Set runtime defaults: `maxConcurrentRequests: 20`, `parallelBatchSize: 12`
- [ ] **Step 2:** In connector-spec Advanced Connection Settings: raise `maxConcurrentRequests` max to 30, default 20; add `parallelBatchSize` field (1–16, default 12)
- [ ] **Step 3:** Update help keys to mention ISC ~100 requests / 10 seconds and conservative default 80
- [ ] **Step 4:** Update advanced-connection-settings guide (queue section table + tuning)
- [ ] **Step 5:** Run `npm run build` or spec sync script if CI requires it

---

## Task 5: Full verification

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run lint`
- [ ] **Step 3:** Manual smoke: note Fetch phase duration before/after on a large tenant (optional, operator-side)

---

## Reference

| Aspect | Before | After |
|--------|--------|-------|
| Rate model | 100ms spacing (10 RPS) | 80/10s sliding window (max 100) |
| Concurrency count | Includes throttle sleep | In-flight HTTP only |
| Timeout | Reject only | Reject + abort HTTP |
| Default concurrent | 10 | 20 |
| Default parallel batch | 8 (hidden) | 12 (exposed) |
| UI max concurrent | 10 | 30 |

## Out of scope

- Dynamic `maxSockets` (stay 50)
- Heartbeat / logging changes
- Matching CPU optimizations
