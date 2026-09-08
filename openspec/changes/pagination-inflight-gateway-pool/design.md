## Context

Paginated `ClientService.call()` (sequential, parallel, searchAfter) already owns a per-stream pagination circuit. Today that circuit counts **consecutive completed** gateway failures (3), then **sheds**, **cools down 30s**, **probes** once, and either resumes or throws `PaginationError`. Parallel Fetch uses a sliding window (`parallelBatchSize` default 12, max 16). Paginated 504s already use a tight retry cap (`paginationGatewayMaxRetries` 1). Non-paginated queue items still use configured `maxRetries`.

Discovery replaced cooldown-then-abort with a **gateway-failure pool**: pages that have seen 504/timeout and have not yet succeeded. Trip at `min(10, this stream’s window)`. No extra wait.

```
page 504/timeout ──► enter pool (slot occupied, re-attempt same page)
page 200          ──► leave pool; slot can take the next offset
pool size >= min(10, window) ──► shed stream ──► PaginationError
```

## Goals / Non-Goals

**Goals:**

- Abort a pagination stream when the gateway-failure pool reaches `min(10, window)`
- Drop pagination cooldown and probe
- Let a later 200 on the **same** page remove it from the pool
- Shed in-flight page HTTP on that stream only; keep `PaginationError` (no silent partial list)
- Leave non-paginated 504 retries and HTTP 429 Retry-After unchanged

**Non-Goals:**

- Replacing OFFSET or parallel `listAccounts` with keyset / id-range workers
- Adaptive `parallelBatchSize` on success-path latency
- Tenant-wide or `ApiQueue`-wide breaker
- New Advanced Connection Settings fields
- Guaranteeing progress when `pool size < threshold` while those pages keep 504ing (provisioning timeout remains the backstop)

## Decisions

### D1: Circuit stays on the pagination stream

- **Choice:** Pool state is per paginated `call()`, not on `ApiQueue`.
- **Reason:** A 504 storm on account paging must not block forms/patches.
- **Considered alternatives:** Queue-wide 504 counter — rejected (wrong blast radius).

### D2: Gateway failure unchanged

- **Choice:** HTTP **504** or `ECONNABORTED` / `ETIMEDOUT`. Not 429. Not other 5xx.
- **Reason:** Same P1 signal; 429 and 500 already have paths.
- **Considered alternatives:** All 5xx — rejected.

### D3: Pool membership, not a consecutive streak

- **Choice:** A page (offset or searchAfter cursor) **enters** the pool when it observes a gateway failure. It **leaves** only when that page returns success. Any other page’s 200 does not clear it.
- **Reason:** Matches concurrent storm detection; a mixed 200/504 window must not reset the sick set.
- **Considered alternatives:** Consecutive streak of 3 — current behavior, rejected; lifetime budget of 10 504s that ignore later success — rejected.

### D4: Threshold is `min(10, window)`

- **Choice:** `window` is this stream’s max concurrent pages: parallel uses `paginate.batchSize` if set, else `parallelBatchSize`; sequential and searchAfter use **1**. Cap constant **10** in internal client config. Threshold is not `min(10, configured parallelBatchSize)` when this stream’s window is smaller.
- **Reason:** Hard 10 is a no-op on window 8; window 1 must trip on the first gateway failure.
- **Considered alternatives:** Fixed 10 — rejected; `min(10, parallelBatchSize)` from config even for sequential — rejected.

### D5: No cooldown, no probe

- **Choice:** At threshold, shed (stop scheduling; abort in-flight page HTTP for this stream) and throw `PaginationError` immediately.
- **Reason:** The 30s wait was ad-hoc; probe still 504s on skip-scans that cannot finish inside the gateway timeout.
- **Considered alternatives:** Keep one cooldown — rejected by discovery.

### D6: Below threshold, sick pages keep their slots

- **Choice:** A pool member occupies a window slot and is re-attempted (existing `paginationGatewayMaxRetries` / queue backoff may apply). Do not enqueue a **new** offset into that slot until success or abort.
- **Reason:** Replacing a 504 page with a higher OFFSET is the P1 amplifier. Pool size cannot exceed the window.
- **Considered alternatives:** Drop the failed offset and continue — rejected (hole / silent skip); free the slot and count only simultaneous HTTP — rejected (completed 504s would vanish from the pool).

### D7: Paginated gateway retry cap stays

- **Choice:** Keep `paginationGatewayMaxRetries = 1` on page fetches so a blip can succeed and leave the pool without consuming `maxRetries` 20. After that attempt, the same page may be submitted again while below threshold (no 30s circuit sleep). Non-paginated 504 unchanged.
- **Reason:** Twenty 60s backoffs on one OFFSET still hide the pool.
- **Considered alternatives:** `noRetry` on 504 — possible later; keep 20 — rejected.

### D8: Constants

- **Choice:** Replace `consecutiveGatewayFailures`, `paginationCooldownMs`, and `maxCooldownsPerStream` with `inFlightGatewayFailureCap = 10`. Keep `paginationGatewayMaxRetries = 1`.
- **Reason:** One operator-visible number (10) plus existing window settings.
- **Considered alternatives:** Connector-spec field — deferred.

### D9: Observability

- **Choice:** WARN when a page enters/leaves the pool (or on size changes at debug if enter/leave is too noisy — default WARN when approaching/at threshold and on shed/abort). Include `context`, position, pool size, threshold. Remove cooldown/probe log lines.
- **Reason:** Operators should see pool abort, not look for a 30s pause.
- **Considered alternatives:** STATUS `api=` flag — deferred.

## Risks / Trade-offs

- [Risk] Window 12 with 9 pages stuck 504ing never reaches 10 → Mitigation: caller `abortSignal` / provisioning timeout; deferred tighter per-page give-up
- [Risk] Sequential/searchAfter fail on the first 504 (no retry storm, no wait) → Mitigation: same `min(10, window)` rule; document in tune-api-performance
- [Risk] Re-submitting the same OFFSET below threshold still loads ISC → Mitigation: no *new* higher offsets in those slots; shed at threshold
- [Risk] Shed races the parallel yield buffer → Mitigation: aborted siblings are not success; `PaginationError` uses items already collected
- [Trade-off] No recovery path after a brief 10-wide 504 burst → Reason: cooldown/probe did not pay for the wait
- [Trade-off] Fetch fails instead of grinding OFFSET → Reason: that grind was the P1

## Migration Plan

Ship in a connector release. No tenant schema or ISC API change. Rollback is revert of the pagination circuit. Operators should watch WARN pool/shed lines; sequential paging will fail faster on a single 504.

Acceptance: unit tests for parallel (pool 10 of 12 trips; member 200 leaves pool; window 8 trips at 8), sequential and searchAfter (first gateway failure trips, no 30s sleep), 429 not entering the pool, exhausted 500 immediate `PaginationError`, non-paginated 504 unchanged.

## Open Questions

None blocking. Cap 10 may move to connector-spec later if operations need it.
