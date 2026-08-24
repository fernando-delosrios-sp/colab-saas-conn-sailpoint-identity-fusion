## Why

A first-time Fetch of ~102k managed accounts finished HTTP (`collected 102407`) then went silent: STATUS and platform keep-alive share the Node event loop with the Fetch continuation. Collect-all promises (`searchAfter` identities, fusion-account arrays) resolve into one giant array and a tight `for` / `Map` build blocks the loop for minutes. Cambridge then expires `std:account:list` at 5 minutes (`command expired`, `output_count=0`, `keep_alive_count=2`). Operators need ingest to yield like Process already does, and to see `progress=N/M ingested` on STATUS the same way Fetch shows `fetched`.

## What Changes

**Bulk ingest yields to the event loop**
- From: After a collect-all fetch promise resolves, the entire result is registered in one synchronous loop (identities `for` over `T[]`; fusion accounts `new Map(accounts.map(...))`; searchAfter `all.push(...page)` with no yield between pages).
- To: Registration runs in chunks (prefer page-at-a-time generators; otherwise a shared chunk+`yieldToEventLoop` helper) so Operation heartbeat and `res.keepAlive` can fire during ingest.
- Reason: A blocked event loop drops STATUS and keep-alive and looks like a hang.
- Impact: Non-breaking; Fetch duration may increase slightly due to yields.

**STATUS progress during ingest**
- From: After HTTP `fetched` progress stops, no pipeline progress until the next phase; operators see a gap after `collected N`.
- To: Bulk ingest calls `log.setProgress(done, total, 'ingested')` and a DETAIL line when ingest starts with a known count, matching Fetch’s `progress=… fetched` shape.
- Reason: Operators need the same heartbeat visibility as account Fetching while caches are filled.
- Impact: Non-breaking; STATUS unit switches from `fetched` to `ingested` (heartbeat already resets delta baselines on unit change).

**Unchanged**
- 5-minute host command ceiling; Output still after Process; managed-account Fetch already registers per HTTP page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `identity-service`: Identity Fetch SHALL ingest documents in yielded chunks (generator or chunked array) and report `ingested` progress.
- `source-service`: Fusion-account Fetch SHALL ingest pages into the native-identity map with yields and `ingested` progress; managed-account per-page registration stays as-is.
- `client-service`: Collect-all pagination (`searchAfter` / sequential concat) SHALL yield between pages so concatenation cannot monopolize the event loop.
- `log-service`: Fetch-phase STATUS SHALL render `ingested` progress via existing `setProgress` / heartbeat (no new line kind).
- `ubiquitous-language`: Promote **Bulk ingest** and **Ingested (progress unit)**.

## Impact

- `src/utils/yieldToEventLoop.ts` — chunked `forEach` helper + tests
- `src/services/identityService.ts` — `fetchIdentities` ingest path
- `src/services/sourceService/sourceService.ts` — `fetchFusionAccounts`
- `src/services/clientService/clientService.ts` — `paginateSearchAfter` / sequential collect-all
- Tests under those services plus heartbeat progress-unit scenarios
- No connector-spec settings; no new dependencies
