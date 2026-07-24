## Context

All ISC HTTP traffic flows through `ClientService.call()` → `ApiQueue`. Fetch phase loads managed accounts via `SourceService.fetchAccountsBySourceIdGenerator`, which uses `paginate: { mode: 'parallel' }`. Today `_paginateParallel` computes offset batches, fires `Promise.all` per batch, yields results, and calls `onPageProgress` once per batch. `ClientService` constructor caps `parallelBatchSize` at `maxConcurrentRequests`, so operators setting concurrent=10 never exceed 10 pages per batch wave.

Prior changes shipped heartbeat interval (`heartbeatInterval`, default 10s) and STATUS line separation of pipeline progress delta vs `api-queue completed` delta. Fetch already calls `setProgress` with unit `fetched`, but only when a full parallel batch completes (~2500 accounts).

Production evidence: ITKEYS 82k accounts, `Δ+2500/10s`, `active=10`, `queued=0` — queue healthy, pagination loop structure is the limiter.

```
paginateParallel (today)
  batch₁ [p1..p10] ──await ALL──► yield ──► batch₂ [p11..p20] ── ...
                      ▲ straggler blocks batch₂ enqueue

paginateParallel (proposed)
  window ≤ parallelBatchSize in-flight
  p1..pk running ── any completes ── enqueue p(k+1) ── yield in offset order
```

## Goals / Non-Goals

**Goals:**

- Replace sequential batch barriers in parallel pagination with a sliding-window scheduler
- Remove constructor `min(parallelBatchSize, maxConcurrentRequests)` cap
- Invoke `onPageProgress` after each page completes (monotonic loaded count)
- Preserve ascending offset yield order for generator consumers
- Maintain existing error semantics (`PaginationError` with collected count)
- Add tests proving improved concurrency utilization and per-page progress

**Non-Goals:**

- Changing heartbeat interval configuration (already exposed)
- Changing STATUS delta format or stall detection (already specified)
- Raising default `maxConcurrentRequests` or ISC rate window caps
- Sequential or searchAfter pagination modes
- Matching, Refresh, or Process phase progress (already granular)

## Decisions

### D1: Sliding window over larger batches

- **Choice:** Maintain a pool of up to `windowSize` in-flight page fetches; when one completes, schedule the next unresolved offset if any remain
- **Reason:** Eliminates inter-batch idle time when page latencies vary within a batch
- **Considered alternatives:** Larger `Promise.all` batches only — rejected (still has batch barrier); raise defaults only — rejected (does not fix straggler bubbles)

### D2: Window size source

- **Choice:** `windowSize = paginate.batchSize ?? this.parallelBatchSize` where `parallelBatchSize` comes from config (default 12) **without** capping to `maxConcurrentRequests`
- **Reason:** Per-stream pipelining depth is independent from global concurrent HTTP cap; queue mediates total in-flight work
- **Considered alternatives:** Use `maxConcurrentRequests` as window — rejected (ignores explicit batch tuning); unbounded window — rejected (memory/race risk)

### D3: Yield ordering

- **Choice:** Reorder buffer — hold completed pages until contiguous offsets from `nextYieldOffset` are available, then yield in order
- **Reason:** `SourceService` aggregates batches sequentially; out-of-order yield could complicate debugging
- **Considered alternatives:** Yield on completion order — rejected (visible reordering in logs/tests)

### D4: Progress callbacks

- **Choice:** Call `policy.onPageProgress?.(loaded, total)` after each page completes (increment `loaded` by page item count)
- **Reason:** Heartbeat every 10s sees smoother `fetched` deltas; aligns with "page or batch boundaries" spec intent
- **Considered alternatives:** Throttle progress to heartbeat interval — rejected (couples pagination to log layer)

### D5: Legacy `paginateParallelGenerator`

- **Choice:** Apply the same sliding-window helper to both `_paginateParallel` and the public generator overload for consistency
- **Reason:** Avoid divergent behavior between call paths
- **Considered alternatives:** Only update `_paginateParallel` — rejected (dual code paths already a maintenance burden)

### D6: Documentation

- **Choice:** Update Advanced Connection Settings guide: `maxConcurrentRequests` = global HTTP concurrency; `parallelBatchSize` = max in-flight pages per parallel pagination stream
- **Reason:** Operators previously unaware of hidden cap and sequential batch semantics

## Risks / Trade-offs

- [Risk] Higher burst of enqueue attempts when many streams share the queue → **Mitigation:** unchanged global rate window and `maxConcurrentRequests`; monitor 429 retries in verify
- [Risk] Reorder buffer memory → **Mitigation:** buffer size bounded by `windowSize` (≤16 per spec range)
- [Trade-off] Slightly more complex pagination code → **Accept** for measurable Fetch improvement on 50k+ account sources
- [Trade-off] Per-page `setProgress` increases heartbeat log churn → **Accept**; deltas remain meaningful and grep-friendly

## Migration Plan

1. Implement sliding window + tests behind no config flag (behavior change is strictly better at same settings)
2. Deploy connector build; compare Fetch `METRIC fetchPhase.parallelFetch` duration on ITKEYS-scale tenant
3. Rollback: revert `clientService.ts` pagination helper if 429 rate spikes (no schema migration)
4. Operators: optional tune `maxConcurrentRequests` 10→20 after validating no 429s; adjust `parallelBatchSize` only if multiple parallel paginations contend

## Open Questions

- None blocking implementation. Benchmark baseline should be captured in `verify.md` during apply phase.
