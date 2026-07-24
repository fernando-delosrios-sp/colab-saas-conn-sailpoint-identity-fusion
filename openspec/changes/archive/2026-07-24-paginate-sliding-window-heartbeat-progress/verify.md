# Verify: paginate-sliding-window-heartbeat-progress

## Automated verification

| Check | Command | Result |
|-------|---------|--------|
| ClientService tests | `npm test -- src/services/clientService/__tests__/clientService.test.ts` | **PASS** (19 tests) |
| SourceService tests | `npm test -- src/services/sourceService/__tests__/sourceService.test.ts` | **PASS** (26 tests) |
| Operation heartbeat tests | `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts` | **PASS** |
| Lint | `npm run lint` | **PASS** |

## New test coverage

- **Sliding window pipelining:** slow page at offset 2 does not block offset 3 from starting (`offset3StartedWhileOffset2InFlight`)
- **Yield ordering:** pages yielded as `a0, a1, a2` despite out-of-order completion delays
- **Per-page progress:** `onPageProgress` invoked at loaded counts `[1, 2, 3]` (not batch jumps)
- **Cap removal:** `parallelBatchSize: 16` preserved when `maxConcurrentRequests: 10`
- **SourceService single-source progress:** `setProgress` on each page callback (100/300 → 300/300)
- **SourceService multi-source aggregate:** concurrent sources sum loaded/total on each callback (100/200 → 500/500)
- **Heartbeat page-sized deltas:** STATUS shows `Δ+250/10s` not `Δ+2500/10s` between ticks during Fetch
- **Throughput proxy benchmark:** straggler pipelining test (`offset3StartedWhileOffset2InFlight`) proves next offset enqueues before slow page completes — the behavior sequential batch barriers prevented

## Production baseline (ITKEYS-scale tenant)

Prior run (sequential batches, `maxConcurrentRequests=10`, capped `parallelBatchSize=10`):

- ITKEYS 82,628 accounts: ~6m 50s of Fetch-dominated STATUS lines
- Progress rhythm: `Δ+2500/10s` with periodic `Δ+0` stalls (straggler batches)
- Queue healthy: `active=10`, `queued=0`

**Expected improvement after this change (same config):**

- Faster average page throughput when page latencies vary within a window (straggler no longer blocks next offset enqueue)
- Smoother STATUS `fetched` deltas (per-page `setProgress`, not only every 2500 accounts)
- Raising `maxConcurrentRequests` remains the primary lever for higher global HTTP parallelism

**Benchmark status:** Automated timing proxy covers straggler pipelining (`completes paginated fetch faster than a sequential batch barrier`). Optional operator follow-up: re-run `accountList` on the ITKEYS tenant and compare `METRIC fetchPhase.parallelFetch` duration.

## Spec alignment

- `client-service`: sliding window + uncapped `parallelBatchSize` — implemented in `_runParallelOffsetWindow`
- `source-service`: page-level aggregate progress — single- and multi-source tests
- `account-list-operation`: per-page fetch progress — ClientService → SourceService → heartbeat page-sized delta test

## Status

**PASS** — ready for archive
