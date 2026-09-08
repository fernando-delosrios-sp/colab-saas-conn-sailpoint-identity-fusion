## Scope

In: replace the pagination-stream cooldown-then-abort circuit with a **gateway-failure pool** of in-flight pages that have seen HTTP 504 or timeout; trip at `min(10, this stream’s window)`, shed that stream, throw `PaginationError` with no cooldown and no probe. Out: OFFSET replacement; a global `ApiQueue` kill switch; changing non-paginated `call()` 504 retries; new connector-spec knobs; shrinking `parallelBatchSize` on the success path.

## Language

**Gateway failure** (canonical — reuse):
An HTTP 504 or a request timeout (`ECONNABORTED` / `ETIMEDOUT`) on a page fetch. Distinct from HTTP 429 and from other 5xx.
_Avoid_: treating every 5xx as this; calling 429 a gateway failure

**Gateway-failure pool** (`promote`):
The set of page fetches on one pagination stream that have observed a gateway failure and have not yet returned success. Membership is per page (offset or searchAfter cursor), not per HTTP attempt.
_Avoid_: consecutive streak, cooldown, in-flight error count (ambiguous), 504 budget (sounds cumulative across successes)

**Pagination circuit** (`conflicts-with-canonical`):
Canonical glossary still describes consecutive failures, cooldown, and probe. This change redefines it as per-stream pool state that sheds and fails the call at the pool threshold — still not a tenant-wide or whole-queue breaker.
_Avoid_: circuit breaker (implementation metaphor), global API kill switch

**Pagination window** (`draft`):
This stream’s maximum concurrent page fetches: `paginate.batchSize` when set, otherwise configured `parallelBatchSize` for parallel mode; **1** for sequential and searchAfter.
_Avoid_: using configured `parallelBatchSize` as the threshold input when this stream’s window is smaller

**Cooldown** (`conflicts-with-canonical`):
Canonical term for the 30s wait after shed. This change **retires** cooldown from pagination behavior.
_Avoid_: keeping the word in operator docs as if it still happens

**Probe** (`conflicts-with-canonical`):
Canonical term for the single page after cooldown. This change **retires** probe from pagination behavior.
_Avoid_: health check, canary

**PaginationError** (canonical — reuse):
Failure of a paginated `client.call` after some items may have been collected. Silent partial-data return remains forbidden.

## Decisions

Context: The cooldown-then-abort circuit (streak of 3, 30s wait, one probe) is the wrong shape for a 504 storm. Operators want a concurrent sick-page set, abort when it is large enough, and no extra wait.

Q1: Consecutive streak vs concurrent pool vs lifetime budget?
Chosen: **Concurrent pool (B).** A page enters the pool on gateway failure; it leaves only when **that page** succeeds. Not a reset-on-any-200 streak. Not a lifetime count of 504s that survive successes.

Q2: Hard 10 vs scaled threshold?
Chosen: **`min(10, this stream’s window)`.** Default parallel window 12 → 10. Window 8 → 8. Window 1 → 1. Do not use configured `parallelBatchSize` when this call’s window is `batchSize` or sequential.

Q3: Cooldown and probe?
Chosen: **Remove both.** At threshold: shed in-flight page HTTP on this stream, throw `PaginationError`. No 30s sleep, no probe, no second-chance resume.

Q4: Sequential / searchAfter (window 1)?
Chosen: **First gateway failure trips.** That is the same rule, not a special case: pool size 1 meets `min(10, 1)`.

Q5: Whole queue vs pagination stream?
Chosen: **Pagination stream only.** Unrelated `call()` (forms, patches) continues. Non-paginated 504 still uses configured `maxRetries`.

Q6: What stays in the pool while below threshold?
Chosen: **The sick page keeps occupying a window slot and is re-attempted** (existing per-item gateway retry/backoff may apply; no pagination cooldown). Do not enqueue a *new* offset into that slot until the page succeeds or the call aborts. Pool size cannot exceed the window.

Q7: Partial data on abort?
Chosen: **No.** Throw `PaginationError` with items collected; do not return a successful partial list.

Q8: Operator knobs?
Chosen: **Internal constant 10** (and existing window config). Not a new connector-spec field unless apply-time testing says otherwise.

## Open questions

None blocking.

Deferred: replacing OFFSET paging; adaptive window shrink on success-path latency; unbounded per-page retry vs provisioning timeout when `pool size < threshold` (e.g. 9 of 12 pages keep 504ing).

## Scenarios discussed

- Parallel window 12, 10 in-flight pages in the pool → shed, `PaginationError`, no 30s wait, no probe.
- Parallel window 12, 9 in pool, one of those pages then 200 → that page leaves the pool; paging continues.
- Parallel window 8 → threshold 8; the whole window in the pool trips.
- Sequential or searchAfter: first page gateway failure trips (window 1).
- HTTP 429 does not enter the pool; Retry-After path unchanged.
- Exhausted HTTP 500 still `PaginationError` immediately (not a gateway failure).
- Non-paginated 504 does not fill the pool and does not shed other calls.
- Caller `abortSignal` during paging still fails the call; there is no cooldown to interrupt.
- Dry-run / replay adapters that never 504 must keep passing.
