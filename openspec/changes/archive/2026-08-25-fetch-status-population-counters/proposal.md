## Why

Fetch STATUS uses one `progress=` slot. Parallel loads (Fusion accounts, managed accounts, identities) overwrite it, so a heartbeat shows either `158951 fetched` (managed sum) or `102407 ingested` (Fusion), never both. Operators cannot tell which inventory is moving, and equal censuses (Jackdaw vs Fusion) look like one counter jumping. Fetch needs independent who-axis counters on the same STATUS line.

## What Changes

**Fetch STATUS population counters**
- From: One `progress=done/total fetched|ingested` last-writer slot during Fetch.
- To: Independent segments `fusion-accounts=done/total`, `managed-accounts=done/total`, and `identities=done/total` when identity Fetch runs. Omit identities when skipped. Omit a segment until that population has a known total or first registration.
- Reason: Operators need to see concurrent Fetch inventories, not HTTP vs ingest.
- Impact: Log-string change for scrapers matching Fetch `progress=` / `fetched` / `ingested`. Non-breaking for runtime Fetch.

**Fetch progress writers**
- From: Identity and Fusion ingest call `setProgress(…, 'ingested')`; managed aggregate calls `setProgress(…, 'fetched')`.
- To: Each writer updates only its population counter. `done` is items registered into the run cache; `total` is known census when available.
- Reason: Shared `setProgress` is the last-writer bug.
- Impact: Internal progress API; Refresh/Process still use `setProgress` with a unit.

**Ingested unit off Fetch STATUS**
- From: Fetch STATUS may show `progress=… ingested`.
- To: Fetch STATUS SHALL NOT use `ingested` or a single `fetched` fraction as the pipeline slot. DETAIL `action=ingesting identities|fusion-accounts` MAY remain. Bulk ingest still yields.
- Reason: Stage is not the STATUS axis (proposal B).
- Impact: Spec and tests that assert Fetch `progress=` with `ingested`/`fetched`.

**Unchanged**
- Refresh/Process/Output single `progress=` (`refreshed`, `analyzed`, …).
- `queue-pending` per-source HTTP offsets.
- Forms / delayed-aggregation Fetch not STATUS counters.
- Managed counter stays one aggregate (not per source).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `log-service`: Fetch STATUS SHALL render population counters with per-segment deltas; SHALL NOT require a single Fetch `progress=` unit of `fetched` or `ingested`.
- `account-list-operation`: Fetch SHALL drive population counters instead of one `fetched` progress unit.
- `source-service`: Managed Fetch SHALL update `managed-accounts`; Fusion Fetch SHALL update `fusion-accounts` (not `ingested`/`fetched` as the shared slot).
- `identity-service`: Identity Fetch SHALL update `identities` when it runs; SHALL NOT write Fetch STATUS via unit `ingested`.
- `ubiquitous-language`: Promote **Fetch population counter**; note Fetch STATUS is who-axis, not `ingested` as the pipeline fraction.

## Impact

- `src/services/logService/` — `OperationRunContext` Fetch counters; heartbeat `formatStatusLine` / delta baselines
- `src/services/sourceService/` — `fetchFusionAccounts`, `managedAccountFetcher` progress
- `src/services/identityService.ts` — identity Fetch progress
- Tests: `operationHeartbeat.test.ts`, source/identity Fetch progress tests, account-list Fetch STATUS
- Docs: `docs/reference/observability.md` STATUS progress
- CHANGELOG via changelog-generator during apply
- No connector-spec settings
