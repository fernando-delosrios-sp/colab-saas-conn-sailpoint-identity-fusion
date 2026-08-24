## Context

Account-list Fetch runs identities, managed accounts, fusion accounts, and forms in `Promise.all`. HTTP pagination already reports `log.setProgress(..., 'fetched')`. After the last page, several paths still do a collect-all continuation:

- `IdentityService.fetchIdentities` awaits `client.call` `searchAfter` (`paginateSearchAfter` returns `T[]`) then synchronously `run.addIdentity` and builds `identityIdsInScope`.
- `SourceService.fetchFusionAccounts` concatenates generator pages into `accounts[]` then `new Map(accounts.map(...))`.
- `paginateSearchAfter` / sequential collect-all grow `all` with `push(...page)` with no `yieldToEventLoop` between pages.

Process already yields (`yieldToEventLoop` every N managed accounts). Fetch ingest does not. STATUS (`setInterval`) and `res.keepAlive` (`processingWait`, default 60s) cannot run while the continuation is synchronous. This design makes bulk ingest cooperative and visible on the STATUS line as `ingested`.

Fewer than three containers; no C4 diagram.

## Goals / Non-Goals

**Goals:**

- Yield the event loop during bulk ingest so Operation heartbeat and keep-alive keep firing
- Show STATUS `progress=done/total ingested` analogously to Fetch `fetched`
- Prefer existing generators for identity and fusion-account Fetch; share one chunk helper for remaining arrays
- Keep Fetch as phase 2 (no new phase)

**Non-Goals:**

- Extending the ISC/Cambridge 5-minute `std:account:list` timeout
- Streaming fusion accounts to the platform before Process
- New connector-spec knobs (chunk size is a code constant)
- Changing managed-account per-page `setManagedAccount` (already streamed)
- A new log line kind (`INGEST`) or replacing STATUS

## Decisions

### D1: Shared `forEachChunked` on `yieldToEventLoop`

- **Choice**: Add `forEachChunked<T>(items, fn, options)` next to `yieldToEventLoop`. Default chunk size **250**. After each chunk: `await yieldToEventLoop()`, then optional `onProgress(done, total)`. Do not add a second yield primitive (`setTimeout(0)` etc.).
- **Reason**: Process already uses `yieldToEventLoop`; 250 is large enough to avoid await overhead and small enough that a 10s heartbeat and 60s keep-alive can fire during 100k+ ingest. Not a UI setting (discovery: design constant).
- **Considered alternatives**: Reuse `promiseAllBatched` (rejected — that is concurrent async work, not CPU ingest). Yield every item (rejected — too many microtasks). `managedAccountsBatchSize` (rejected — that setting is matching-batch grouping, not event-loop cadence).

### D2: Identities — generator ingest, not collect-all then loop

- **Choice**: `fetchIdentities` SHALL consume search pages via the existing search-after generator (`paginateSearchApiGenerator` / equivalent `client.call` parallel-style page stream). Each page: add non-protected identities to FusionRun; update `identityIdsInScope` incrementally or rebuild once at the end **in chunks**. After each page (and within a page if page size > 250), yield and `setProgress(done, totalIfKnown, 'ingested')`. If `X-Total-Count` is unknown, `total` MAY equal `done` (same pattern as Fetch when totals are unknown).
- **Reason**: Avoids allocating a second full `T[]` plus a blocking `for`. Generator already exists and is unused by `fetchIdentities`.
- **Considered alternatives**: Keep `client.call` collect-all and only chunk the `for` (accepted as fallback if generator wiring is blocked, but primary path is generator).

### D3: Fusion accounts — register per generator page

- **Choice**: `fetchFusionAccounts` SHALL set map entries per page (`fusionAccountsByNativeIdentity.set`) instead of `accounts.push(...batch)` then `new Map(accounts.map)`. Yield after each page; `setProgress` with unit `ingested`. Initialize the map empty before the loop (replace, same as today’s assign-once semantics).
- **Reason**: Same memory and event-loop win as identities; generator already used.
- **Considered alternatives**: Chunked `new Map` after full concat (rejected — extra peak memory for no benefit).

### D4: Collect-all pagination yields between pages

- **Choice**: `paginateSearchAfter` and sequential `fetchSequentialOffsetPages` SHALL `await yieldToEventLoop()` after appending each page when those collect-all APIs remain for other callers. Progress callbacks stay `onPageProgress` / `fetched` for HTTP; ingest progress is the caller’s job.
- **Reason**: `all.push(...items)` on a 250-item page is cheap; concatenating hundreds of pages without a tick still starves timers. Yield is cheap compared to HTTP.
- **Considered alternatives**: Only fix callers (rejected — other collect-all callers can hit the same stall).

### D5: STATUS unit `ingested` + DETAIL start

- **Choice**: Callers pass `log.setProgress(done, total, 'ingested')`. Heartbeat already prints `progress=N/M ingested(Δ+…/10s)` and resets delta when `unit` changes. When ingest starts with a known count > 0, emit one DETAIL `action=ingesting identities|fusion-accounts count=N` (same DETAIL kind as Fetch milestones). No per-chunk INFO lines.
- **Reason**: User asked for progress like account Fetching; Fetch already uses STATUS progress + occasional DETAIL, not a custom spam loop.
- **Considered alternatives**: Reuse unit `fetched` (rejected — operators cannot distinguish HTTP vs ingest). New `INGEST` line kind (rejected — violates log-service host-visible kinds).

### D6: Parallel Fetch progress slot

- **Choice**: Last writer wins on `OperationRunContext.progress` (today’s behavior). When a Fetch task enters bulk ingest, it sets unit `ingested`. HTTP tasks may overwrite with `fetched` while still paging. Accept interleaved STATUS units during `Promise.all`; do not add a multiplexed progress map in this change.
- **Reason**: Multiplexing progress is a larger observability change; yielding is the hang fix. Interleaved units still beat a silent blocked loop.
- **Considered alternatives**: Serialize Fetch tasks (rejected — throughput). Aggregate progress object (deferred).

### D7: Empty and small result sets

- **Choice**: Count 0: do not set `ingested` progress (avoid unit flicker). Count ≤ 250: one chunk, `setProgress(N, N, 'ingested')`, one yield after the chunk.
- **Reason**: Matches discovery empty/small scenarios.

## Risks / Trade-offs

[Risk] Interleaved `fetched` / `ingested` STATUS during parallel Fetch confuses operators. -> Mitigation: DETAIL names the ingest subject; unit change is still better than silence; multiplexed progress is out of scope.

[Risk] Yielding slightly lengthens Fetch. -> Mitigation: 250-item chunks; yield is one `setImmediate` per chunk.

[Trade-off] Does not prevent 5-minute command expiry for a full 102k first run. -> Reason for acceptance: host limit is out of scope; batch size remains the operational lever; this change restores visibility and keep-alive during ingest.

[Risk] `identityIdsInScope` rebuilt incorrectly if incremental adds miss protected filtering. -> Mitigation: same `!identity.protected` predicate as today; tests cover protected skip.

## Migration Plan

N/A — This change does not involve deployment changes. Ship as a connector version bump; no config migration.

## Open Questions

None.
