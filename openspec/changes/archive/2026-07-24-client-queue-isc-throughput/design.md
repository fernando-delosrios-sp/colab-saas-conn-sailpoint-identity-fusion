## Context

All outbound ISC HTTP traffic flows through `ClientService.call()` → `ApiQueue`. Fetch phase drives the highest queue load: parallel account pagination (`parallelBatchSize` pages per batch), multiple managed sources in `Promise.all`, identity search pagination, and form/source setup calls — all sharing one global queue.

ISC tenant API limits are approximately **100 requests per 10 seconds** (sliding window). The connector currently enforces a **steady 10 requests/second** spacing via `minRequestInterval = 1000 / requestsPerSecond`, and increments `activeRequests` before throttle sleep. That combination:

1. Prevents burst utilization within the ISC window
2. Occupies concurrency slots while waiting to start (not while HTTP is in flight)
3. Leaves `parallelBatchSize` at 8 with no connector-spec exposure

`ClientService.execute()` wraps requests in a timeout timer but does not abort the underlying SDK/axios call, leaving zombie HTTP work after timeout.

```
┌──────────────┐     enqueue      ┌─────────────┐     https.Agent    ┌─────┐
│ Domain       │ ───────────────► │  ApiQueue   │ ─────────────────► │ ISC │
│ services     │   call()         │ rate+conc   │                    └─────┘
└──────────────┘                  └─────────────┘
                                       ▲
                              OperationHeartbeat reads stats
```

## Goals / Non-Goals

**Goals:**

- Replace uniform RPS spacing with a **sliding-window rate limiter** (default 80 req / 10s, max 100 / 10s)
- **Decouple** rate-limit waiting from `activeRequests` counting
- **Abort in-flight HTTP** when client `provisioningTimeout` expires
- Raise sensible defaults: `maxConcurrentRequests: 20`, `parallelBatchSize: 12`
- Expose `parallelBatchSize` in connector-spec; raise `maxConcurrentRequests` UI max to 30
- Preserve priority ordering, retry policy, queue stats API, and heartbeat consumption
- Backward-compatible mapping from legacy `requestsPerSecond` when window fields unset

**Non-Goals:**

- Dynamic `maxSockets` alignment (fixed 50 agent pool remains)
- Changing axios-level retry (stays disabled; queue is sole retry authority)
- Matching/Process CPU work
- Structured logging or heartbeat changes
- Removing `requestsPerSecond` from connector-spec in this change (derive window from it)

## Decisions

### D1: Sliding window vs steady RPS

- **Choice:** `SlidingWindowRateLimiter` with `windowMs: 10_000`, default `maxRequests: 80`, hard cap 100
- **Reason:** Matches ISC 100/10s semantics; 80 default leaves headroom for retries and non-queue calls
- **Considered alternatives:** Keep `nextRequestTime` spacing — rejected (no burst, wrong model); token bucket with separate burst/refill — rejected (more complex, window is sufficient)

### D2: Legacy `requestsPerSecond` mapping

- **Choice:** If operator sets `requestsPerSecond` only, compute `maxRequests = requestsPerSecond × (windowMs / 1000)` (e.g. 10 → 100/10s)
- **Reason:** Existing configs keep equivalent average; no silent behavior change for tuned tenants
- **Considered alternatives:** Ignore RPS field — rejected (breaking for operators who lowered it for 429s)

### D3: Decouple concurrency from throttle wait

- **Choice:** Await rate-limit slot **before** `activeRequests++`; increment only when `item.execute()` begins (HTTP in flight)
- **Reason:** With 20 concurrent slots and ~200–500ms ISC latency, in-flight count can approach limit while window governs start rate
- **Edge case:** If concurrency fills between acquiring a rate slot and incrementing `activeRequests`, the item is re-enqueued (`queue.ts:195-199`). The rate slot is consumed but HTTP has not started yet; the item retries on the next `processQueue` pass. This is a conservative trade-off that preserves priority ordering and avoids over-dequeue races.
- **Considered alternatives:** Separate "scheduled" counter — rejected (two counters harder to observe); status quo — rejected

### D4: Abort on timeout

- **Choice:** Create `AbortController` per `execute()` when timeout enabled; pass `signal` into queue item; merge with caller `abortSignal`; axios cancel via SDK request options where supported
- **Reason:** Stops socket and slot leak after timeout
- **Considered alternatives:** Rely on agent `timeout: 60000` — rejected (misaligned with 300s provisioning timeout)

### D5: Default and UI limits

- **Choice:** Defaults — concurrent 20, batch 12, window 80/10s; UI max concurrent 30, window max 100/10s
- **Reason:** User-validated against ISC limits; batch 12 ≤ concurrent 20 for parallel pagination batches
- **Considered alternatives:** concurrent 25 — rejected (marginal gain vs 20 with lower 429 risk)

### D6: `parallelBatchSize` exposure

- **Choice:** Add field to Advanced Connection Settings in `connector-spec.json` with default 12, range 1–16
- **Reason:** Operators tuning concurrency need batch size visibility; currently code-only

## Risks / Trade-offs

- [Risk] Higher defaults cause 429 on strict tenants → Mitigation: conservative 80/10s default; existing configs unchanged; docs say lower window if 429s appear
- [Risk] AbortSignal not honored by all SDK code paths → Mitigation: verify axios `signal` in execute wrapper; test with slow mock; document gap if SDK ignores
- [Risk] Window limiter allows burst that triggers ISC edge cases → Mitigation: default 80 not 100; retry-after path unchanged
- [Trade-off] Two rate concepts (RPS field + window) → Accepted: RPS derives window for compat; docs steer operators to concurrent + batch tuning

## Migration Plan

N/A — connector bundle update only. No stored data migration.

**Deploy:** Ship with new defaults for unset fields only (`??` fallbacks in `readSettings`).

**Rollback:** Revert queue and execute changes; configs with raised concurrency remain valid but behave under old throttle.

**Acceptance:** `npm test` green; apiQueue tests prove (1) 80+ requests blocked within 10s window, (2) concurrent slots not held during rate wait, (3) timeout aborts mock slow request; manual Fetch phase time improvement on large tenant optional.

## Open Questions

- None blocking. If SDK cannot propagate abort to all API methods, scope abort to axios layer in adapter follow-up.
