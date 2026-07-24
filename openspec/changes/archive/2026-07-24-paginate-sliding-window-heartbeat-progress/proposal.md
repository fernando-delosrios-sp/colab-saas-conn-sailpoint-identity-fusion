## Why

Fetch on large tenants spends minutes in parallel account pagination while STATUS shows lumpy `fetched` progress (2500-account jumps) and occasional idle concurrency when one page in a batch is slow. `paginateParallel` waits for every page in a batch before enqueueing the next group, and `parallelBatchSize` is capped to `maxConcurrentRequests`, hiding the pipelining benefit of the shared queue. Heartbeat interval and pipeline-vs-api-queue deltas already shipped; this change completes Fetch throughput and observability by sliding-window pagination and per-page progress updates.

## What Changes

**Parallel pagination concurrency model**
- From: Sequential batches of `min(parallelBatchSize, maxConcurrentRequests)` pages; `await Promise.all` before next batch
- To: Sliding window maintaining up to `parallelBatchSize` in-flight page requests per stream; next offset enqueued when any page completes
- Reason: Eliminates straggler bubbles and improves slot utilization without raising ISC load above existing queue caps
- Impact: Non-breaking API; faster Fetch on large sources; same global `maxConcurrentRequests` and rate window

**parallelBatchSize cap**
- From: `ClientService` sets `parallelBatchSize = min(configured, maxConcurrentRequests)`
- To: Use configured `parallelBatchSize` as per-stream in-flight page limit; global queue still enforces `maxConcurrentRequests`
- Reason: Operators can set batch size for pagination pipelining independently of global concurrency; cap was redundant and limited throughput
- Impact: Non-breaking; update connector-spec help text

**Fetch progress granularity**
- From: `onPageProgress` / `setProgress` at parallel batch boundaries (~2500 accounts)
- To: Progress updated after each page completes within the sliding window
- Reason: Heartbeat STATUS `fetched` delta reflects steady advancement between 10s ticks
- Impact: Additive; improves operator visibility during Fetch

**Yield ordering**
- From: Yields follow batch completion order (offset order within batch)
- To: Pages yielded in ascending offset order via reorder buffer while fetches run concurrently
- Reason: Preserves SourceService batch consumption semantics
- Impact: Internal pagination behavior; callers unchanged

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `client-service`: Parallel pagination mode uses sliding-window concurrency; `parallelBatchSize` semantics and cap removal
- `source-service`: Managed-account fetch progress driven at page completion boundaries
- `account-list-operation`: Fetch phase progress requirements refined for per-page updates

## Impact

- **Code:** `src/services/clientService/clientService.ts`, `src/services/clientService/__tests__/clientService.test.ts`, `src/services/sourceService/sourceService.ts`, tests as needed
- **Specs:** deltas under `openspec/changes/.../specs/` for `client-service`, `source-service`, `account-list-operation`
- **Docs:** `docs/guides/advanced-connection-settings.md` (`parallelBatchSize` vs `maxConcurrentRequests`), CHANGELOG
- **Operations:** Monitor Fetch duration and 429 rate on large tenants after deploy; tune `maxConcurrentRequests` first, then `parallelBatchSize`
