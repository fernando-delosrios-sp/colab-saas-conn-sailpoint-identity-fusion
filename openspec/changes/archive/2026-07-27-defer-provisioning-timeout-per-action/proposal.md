## Why

Background `correlateAccounts` PATCHes enqueued during Process can abort with `Aborted` at the default 300s provisioning timeout even though HTTP never started — the timer begins at enqueue, not execution. Operators see misleading `api=0a/0q` during Epilogue while completions still rise, then unexplained correlation failures that are not retried. This violates the intended per-action timeout model and causes silent correlation loss on large aggregations.

## What Changes

**Per-action provisioning timeout**
- From: Timer starts when `ClientService.execute()` enqueues; queue wait and rate-limit wait consume the budget
- To: Timer starts when the queue invokes the request function (after rate-limit slot, before HTTP); each attempt gets a fresh budget
- Reason: Restore intended in-flight-only timeout; fix early-enqueued LOW-priority PATCH aborts during Epilogue drain
- Impact: Non-breaking behavior correction; long-queued requests no longer abort before HTTP starts

**Abort error propagation**
- From: Queue abort handlers reject with generic `Error('Aborted')`
- To: Reject with `signal.reason` when present (e.g. timeout message)
- Reason: Operators can distinguish timeout vs caller abort in logs
- Impact: Non-breaking log format improvement

**STATUS `q` includes rate-limiter wait**
- From: `q` = FIFO queue length only; dequeued items awaiting rate slots invisible
- To: `q` = FIFO queue length + `rateLimitWaitCount`
- Reason: Reconcile `0q` with steady completion deltas during Epilogue drain
- Impact: Non-breaking STATUS format; same `api=Na/Nq/Nc` shape with richer `q`

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `client-service`: Deferred provisioning timeout start, abort reason propagation, `rateLimitWaitCount` in queue stats
- `log-service`: STATUS `q` segment includes rate-limiter wait count

## Impact

- **Code:** `src/services/clientService/clientService.ts`, `queue.ts`, `types.ts`, `helpers.ts` (if needed), `src/services/logService/operationHeartbeat.ts`, `src/services/clientService/__tests__/`
- **Tests:** `clientService.test.ts`, `apiQueue.test.ts`, `operationHeartbeat.test.ts`
- **Docs:** `docs/guides/advanced-connection-settings.md` (clarify timeout starts at HTTP execution)
- **Operations:** Fewer spurious `correlateAccounts` Aborted errors on long aggregations; STATUS `q` more accurate during background drain
