# Brainstorm: Defer Provisioning Timeout Per Action

## Background

Production `accountList` runs with correlation-on-aggregation show `api=0a/0q` during Epilogue while completions still rise (`Δ+61/10s`), then isolated `API request failed (IdentityService>correlateAccounts): Aborted` errors at ~5 minutes elapsed (default `provisioningTimeout=300s`).

Investigation confirmed:
- Output streams accounts with `awaitCorrelations=false`; PATCHes drain as fire-and-forget LOW-priority queue work during Output/Epilogue.
- `0q` counts FIFO queue only; items dequeued for rate-limit scheduling are invisible to both `0a` and `0q`.
- `provisioningTimeout` timer currently starts in `ClientService.execute()` **before** `queue.enqueue()`, so queue wait + rate-limit wait consume the timeout budget.
- Queue abort handlers reject with generic `Error('Aborted')`, discarding `signal.reason` (timeout message lost).
- `Aborted` is not retried (`shouldRetry` returns false).

## Decision Chain

### Q1: What is the intended timeout semantics?

**Decision:** Each API action gets an independent timeout budget starting when HTTP execution begins (after FIFO dequeue and rate-limit slot acquisition), not when the action is scheduled/enqueued.

| Phase | Timeout applies? |
|-------|------------------|
| FIFO queue wait | No |
| Rate-limiter wait | No |
| HTTP in flight (each attempt) | Yes — fresh budget per attempt |

**Rationale:** Matches operator expectation, existing spec intent (abort in-flight HTTP), and docs describing provisioning timeout as per-operation wait — not enqueue-to-completion wall clock.

### Q2: How to implement deferred timeout?

**Decision:** Move `AbortController` + `setTimeout` from outer `execute()` into the `fn()` closure the queue invokes (lazy start at `item.execute()` time). Pass only caller `abortSignal` to the queue enqueue options; merge timeout signal inside `fn()`.

**Alternatives rejected:**
- Separate longer timeout for LOW priority — adds config surface; doesn't fix semantic bug for all priorities.
- Await correlation drain before epilogue — slows Output; out of scope for this change.

### Q3: Should abort errors preserve signal.reason?

**Decision:** Yes. Queue abort handlers SHALL reject with `signal.reason ?? new Error('Aborted')` so logs show timeout vs caller abort.

### Q4: Should rate-limiter wait appear in STATUS `q`?

**Decision:** Yes, minimal scope — combine `queueLength + rateLimitWaitCount` in `formatApiQueueSegment`. ~30 lines, no label tracking for rate-limit wait items (FIFO labels unchanged).

**Alternatives rejected:**
- Separate `rate-limit=N` segment — more log noise; user asked to combine with `q`.
- Track per-label rate-limit wait Set — ~20 extra lines; defer unless needed.

## Agreed Approach

1. Defer provisioning timeout to execution start (primary fix)
2. Propagate abort signal reason in queue rejections
3. Combine rate-limiter wait into STATUS `q` count
4. Tests + docs update for timeout semantics

## Out of Scope

- Epilogue await-correlations guard
- Per-label rate-limit wait in `queue-pending=`
- New connector-spec fields
