## Why

The pagination circuit waits 30 seconds and probes after three consecutive gateway failures. That extra wait does not clear skip-scan congestion, and a consecutive streak is the wrong signal for a parallel window. We need to abort a pagination stream when enough **currently sick** pages sit in a pool (`min(10, window)`), with no cooldown and no probe, so Fetch fails fast instead of stacking OFFSET work.

## What Changes

**Pagination circuit (pool then abort)**
- From: After 3 consecutive gateway-failure page outcomes, shed, wait 30s, probe once; probe 200 resumes; probe 504 or a second streak throws `PaginationError`
- To: Track a **gateway-failure pool** of in-flight pages that have seen 504/timeout and have not yet succeeded. Trip at `min(10, this stream’s window)`, shed that stream’s in-flight page HTTP, throw `PaginationError`. No cooldown, no probe, no resume-after-wait
- Reason: Concurrent sick pages are the storm; waiting 30s was ad-hoc and still hammered ISC
- Impact: Non-breaking `call()` shape; Fetch/account-list fails sooner on 504 storms; other queue traffic continues

**Window-scaled threshold**
- From: Fixed streak of 3 for every pagination mode
- To: Threshold is `min(10, window)` where window is this stream’s concurrent page cap (parallel: `batchSize` or `parallelBatchSize`; sequential/searchAfter: 1)
- Reason: A hard 10 never trips on a window of 8; window 1 must not wait for 10 sequential 504s
- Impact: Sequential/searchAfter fail on the first gateway failure (same rule)

**Vocabulary**
- From: Glossary defines pagination circuit via consecutive streak, cooldown, and probe
- To: Glossary defines **gateway-failure pool**; pagination circuit is pool-then-shed; cooldown and probe are retired from this behavior
- Reason: Operators must not look for a 30s pause that no longer exists
- Impact: `openspec/specs/ubiquitous-language` + `docs/glossary.md`

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `client-service`: Replace cooldown/probe/streak pagination circuit with gateway-failure pool, `min(10, window)` trip, shed, `PaginationError`; keep paginated gateway-failure retry cap and non-paginated 504 policy
- `ubiquitous-language`: Add gateway-failure pool; redefine pagination circuit; retire cooldown and probe as current pagination behavior

## Impact

- **Code:** `src/services/clientService/` (`paginationCircuit.ts`, `OffsetPageScheduler`, sequential/searchAfter `loadWithCircuit`, internal client constants, tests in `clientService.test.ts` / `helpers.test.ts`)
- **Specs:** deltas for `client-service` and `ubiquitous-language`
- **Docs:** `docs/use-guides/operation/tune-api-performance.md`; `docs/glossary.md`; `CHANGELOG.md`
- **Operations:** Large-source Fetch fails when the pool hits threshold instead of after a 30s cooldown; sequential list paging fails on the first 504/timeout
- **Out of scope:** Keyset / id-range fetch; global queue breaker; new connector-spec knobs
