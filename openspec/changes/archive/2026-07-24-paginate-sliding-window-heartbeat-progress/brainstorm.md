# Brainstorm: paginate-sliding-window-heartbeat-progress

## Context

Production Fetch logs on a ~100k-account tenant (ITKEYS record source) show a stable rhythm: `Δ+2500/10s` (10 pages × 250 accounts), `active=10`, `queued=0`. ClientService `paginateParallel` uses **sequential batches** of `min(parallelBatchSize, maxConcurrentRequests)` pages with `await Promise.all` between batches. Stragglers within a batch block the next batch from being enqueued even when concurrency slots free early. Heartbeat interval (`heartbeatInterval`, default 10s) and pipeline vs `api-queue` progress deltas were shipped in prior changes; Fetch progress today updates at **batch boundaries** only, so heartbeat ticks often show `Δ+0` on progress while `api-queue completed` still moves.

## Decision chain

**Q1: What problem are we solving?**
- Fetch wall time on large single-source paginations (ITKEYS 82k accounts ~5+ min of queue-saturated fetch).
- Straggler-induced idle concurrency within one pagination stream.
- Coarse fetch progress (2500-account steps) making pipeline progress deltas lumpy on STATUS lines.

**Q2: Is ClientService queue/throttle broken?**
- No. Queue is saturated (`active=maxConcurrent`, `queued=0`). Bottleneck is pagination loop structure + ISC page latency, not rate limiter defaults.

**Q3: Should we remove `min(parallelBatchSize, maxConcurrentRequests)`?**
- **Yes, as a constructor cap.** With sliding-window pagination, `parallelBatchSize` means **max in-flight page requests per pagination stream**, not a single-wave batch size. The global `ApiQueue` still enforces `maxConcurrentRequests` across all callers. Allowing `parallelBatchSize > maxConcurrentRequests` enables pipelining (next pages enqueue as slots free) without requiring operators to understand two coupled caps.
- Keep connector-spec range 1–16 for `parallelBatchSize`; document that effective throughput is bounded by `maxConcurrentRequests` and ISC window limits.

**Q4: Sequential batches vs sliding window vs larger Promise.all batches?**

| Approach | Pros | Cons |
|----------|------|------|
| A. Larger sequential batches only | Minimal code change | Straggler bubble remains; batch N+1 still blocked until all of N finish |
| B. `parallelBatchSize > maxConcurrent` without sliding window | Some pipelining within one Promise.all | Still one barrier at batch end; memory holds full batch promises |
| C. **Sliding window (recommended)** | Keeps N pages in flight continuously; next offset starts when any page completes; best slot utilization | Slightly more complex; must preserve offset order for yield/progress |

**Agreed approach: C — sliding window**, plus per-page `onPageProgress` callbacks.

**Q5: Scope boundaries**
- **In scope:** `_paginateParallel` / `paginateParallelGenerator` in `clientService.ts`; constructor cap removal; tests; spec deltas for `client-service`, `account-list-operation`, `source-service`; docs for Advanced Connection Settings.
- **Out of scope:** Heartbeat interval UI (already shipped); STATUS delta format / `api-queue` labeling (already shipped); changing ISC page size (250); matching/process phases.

**Q6: Yield ordering**
- Callers consume `AsyncGenerator<T[]>` and aggregate progress. Yields MAY arrive out of strict offset order if pages complete out of order; **progress `onPageProgress` MUST use monotonic loaded count** (increment by page item count on each completion). Yield order: either preserve offset order with a reorder buffer (small) or document that batch order is completion order (breaking?) — **prefer reorder buffer** so SourceService batch processing unchanged.

**Q7: Success criteria**
- ITKEYS-scale fetch shows higher average pages/minute vs baseline at same `maxConcurrentRequests=10` (benchmark in verify).
- STATUS Fetch lines show progress deltas more frequently (per-page, not only every 2500 accounts).
- No increase in 429 retry rate at default tuning; stall detection unchanged.

## Open questions (resolved for proposal)

- Reorder buffer vs completion-order yield: **reorder buffer** (low memory: one page slot per in-flight offset).
- Deprecate `parallelBatchSize`: **keep** as per-stream in-flight page limit; update help text.
