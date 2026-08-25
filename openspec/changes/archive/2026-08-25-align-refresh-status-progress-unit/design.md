## Context

Account-list Refresh walks Fusion accounts via `batchProcess` → `log.setProgress(done, total, 'processed')`. Independently, `processFusionAccount` calls `log.recordRefreshedAccount()` when `needsRefresh` is true, and `formatStatusLine` always appends `refreshed({refreshedCount})` in phase Refresh. Fetch STATUS already uses `progress=done/total fetched(Δ…)` with no extra `fetched(N)`. This design makes Refresh use the same progress-unit pattern and deletes the unused subset counter.

Fewer than three containers; no C4 diagram.

## Goals / Non-Goals

**Goals:**

- Refresh STATUS: `progress={done}/{total} refreshed` with optional `(Δ±N/interval)` after the first tick / unit change
- Remove `refreshed(N)` from STATUS
- Remove `recordRefreshedAccount`, `refreshedCount`, and `incrementRefreshedCount` once unused
- Keep Refresh correlation segments when link/merge activity occurred in the phase
- Keep Process `batchProcess` unit `processed` unless a caller passes another unit

**Non-Goals:**

- Renaming Process identity / decision / correlated-sweep progress units
- A STATUS needsRefresh-vs-visited outcome segment
- Changing `fusionAccountRefreshThresholdInSeconds` or Map/Define skip logic
- New log line kinds
- Stall detection changes (still api-queue based; Refresh still omits idle `api=`)

## Decisions

### D1: Progress unit `refreshed` on Fusion-account Refresh walk

- **Choice**: `processFusionAccounts` SHALL call `batchProcess` with progress unit `refreshed`. `progress.done` remains Fusion accounts completed in that batch walk (same as today’s `processed` done count).
- **Reason**: Discovery: name the phase work on the unit like Fetch `fetched`; do not count only `needsRefresh` accounts (that would hide list position).
- **Considered alternatives**: Count only `needsRefresh` as `done` (rejected — loses 19032/102407 position). Keep unit `processed` and only drop `refreshed(N)` (rejected — still inconsistent with Fetch verbs).

### D2: Optional unit on `batchProcess`

- **Choice**: Add an optional `progressUnit` argument (or options bag) to `batchProcess` / `createBatchProgressUpdater`, default `'processed'`. Refresh Fusion-account walk passes `'refreshed'`. Other `batchProcess` callers stay default.
- **Reason**: One helper, no duplicate batch loop; Process paths unchanged.
- **Considered alternatives**: Hardcode `refreshed` inside `createBatchProgressUpdater` (rejected — would change Process). Call `setProgress` from `processFusionAccount` per account (rejected — progress already updates at batch boundaries; per-account would be noisier for the same heartbeat).

### D3: Delete refreshed-count API

- **Choice**: Remove `LogService.recordRefreshedAccount`, `OperationRunContext.refreshedCount`, and `incrementRefreshedCount`. Stop calling them from `processFusionAccount`. Heartbeat SHALL NOT append `refreshed(N)`.
- **Reason**: Discovery Q4; knip/`no-unused` after STATUS stop reading the field.
- **Considered alternatives**: Keep the counter for future EVENT_SUMMARY (rejected — YAGNI). Print `refreshed=` only when it differs from `progress.done` (rejected — magic; default 60s TTL almost never differs).

### D4: Correlation segment wording

- **Choice**: Keep `formatStatusLine` Refresh correlation block. Spec scenarios SHALL require the correlation segment next to `progress=… refreshed`, not `refreshed(N)`.
- **Reason**: Discovery Q5; correlation is a real extra, unlike the duplicate count.
- **Considered alternatives**: Move Refresh correlation only to EVENT_SUMMARY (out of scope).

## Risks / Trade-offs

[Risk] Log monitors grep `refreshed(` as a cumulative token or `processed(Δ` during Refresh. -> Mitigation: CHANGELOG + observability STATUS units; tests pin the new string.

[Trade-off] High-TTL tenants lose a STATUS view of how many accounts actually remapped. -> Reason for acceptance: default 60s threshold makes the numbers equal; Map/Define still honors `needsRefresh`; operators still see walk throughput.

[Trade-off] Unit name `refreshed` includes accounts that skip Map/Define. -> Reason for acceptance: it names the Refresh phase walk, matching Fetch’s “accounts in this phase’s pipeline,” not the flag.

## Migration Plan

N/A — no deployment or stored-data changes. Rollback = revert. Operators grepping Refresh `processed(Δ` or `refreshed(N)` should match `progress=… refreshed` instead.

## Open Questions

None.
