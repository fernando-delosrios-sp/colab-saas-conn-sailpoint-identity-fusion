## Context

All outbound ISC HTTP traffic flows through `ClientService.call()` → `ApiQueue`. The queue decouples rate-limit scheduling from `activeRequests` (D3 from client-queue-isc-throughput): items dequeued from FIFO await a rate-limit slot before HTTP starts, during which they are invisible to both `0a` and `0q` in STATUS logs.

`provisioningTimeout` (default 300s) is applied in `ClientService.execute()` today by creating an `AbortController` and timer **before** `queue.enqueue()`. LOW-priority `IdentityService>correlateAccounts` PATCHes enqueued during Process can sit in queue for minutes while Output/Epilogue completes, then abort when the enqueue-time timer fires — logged as generic `Aborted` because queue handlers discard `signal.reason`.

Stakeholders: operators monitoring Epilogue STATUS during aggregation; accounts using correlation-on-aggregation (`correlationMode: correlate`).

## Goals / Non-Goals

**Goals:**
- Start provisioning timeout when HTTP execution begins, not at enqueue
- Fresh timeout budget per queue execution attempt (including retries)
- Preserve caller `abortSignal` behavior while queued
- Propagate abort `signal.reason` through queue rejections
- Include rate-limiter wait count in STATUS `q` segment

**Non-Goals:**
- Awaiting correlation drain before Epilogue ends
- Per-label tracking for rate-limiter wait in `queue-pending=`
- New connector-spec configuration fields
- Changing retry policy for abort errors

## Decisions

### D1: Lazy timeout inside queue `fn()` closure

- **Choice:** Move timer creation from outer `execute()` into the function passed to `queue.enqueue()`, invoked at `item.execute()` time (after rate-limit slot in `executeRequest`)
- **Reason:** Minimal change; timeout naturally scoped to HTTP attempt; caller abortSignal still passed to queue unchanged
- **Considered alternatives:** Timer in `queue.executeRequest` directly — couples queue to provisioning config; rejected to keep timeout logic in ClientService

### D2: Caller abort only on queue enqueue signal

- **Choice:** Pass caller `abortSignal` (not merged timeout signal) to `queue.enqueue({ abortSignal })`; merge timeout inside lazy `fn()`
- **Reason:** Prevents enqueue-time timeout from aborting items still waiting in FIFO; caller abort while queued still works
- **Considered alternatives:** No abort while queued — rejected; breaks pagination early-exit

### D3: Combined `q` via `rateLimitWaitCount` counter

- **Choice:** Increment/decrement counter in `executeRequest` around `waitForSlot()`; expose in `QueueStats`; heartbeat sums with `queueLength` for display
- **Reason:** ~30 lines, no item tracking; fixes misleading `0q` during drain
- **Considered alternatives:** Separate log segment — rejected per user preference to combine with `q`

### D4: Abort reason propagation

- **Choice:** Queue handlers use `item.reject(options.abortSignal?.reason ?? new Error('Aborted'))` pattern when signal is already aborted or abort event fires
- **Reason:** Logs show `Request timed out after Xms` when applicable

## Risks / Trade-offs

- [Risk] Very slow HTTP still times out at provisioning limit → Mitigation: unchanged; timeout now correctly measures HTTP duration only
- [Risk] Long-queued requests could delay aggregation completion indefinitely → Mitigation: acceptable; queue wait is intentional backpressure; operators tune concurrency/window if needed
- [Trade-off] `queue-pending=` labels remain FIFO-only while `q` includes rate-limit wait → Accepted; label tracking deferred to keep scope small
- [Trade-off] Stall detection uses combined `q` → Accepted; more accurate idle detection

## Migration Plan

- Deploy as connector patch; no config migration required
- Existing `provisioningTimeout` values apply to HTTP execution time only (behavior correction, not config change)
- Rollback: revert commit; no data migration
- Acceptance: unit tests pass; aggregation with background correlation shows no `Aborted` at 300s wall clock when HTTP starts after 4+ min queue wait

## Open Questions

_(none — scope locked in brainstorm)_
