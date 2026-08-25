## Scope

In: account-list Refresh STATUS SHALL use pipeline unit `refreshed` on `progress=done/total` with the same delta shape as Fetch `fetched`, and SHALL drop the extra cumulative `refreshed(N)` segment. Out: Process-phase `batchProcess` unit `processed` (identities, decisions, correlated sweep); a separate needsRefresh-vs-visited outcome counter; new heartbeat line kinds; changing `fusionAccountRefreshThresholdInSeconds`.

## Language

**Refreshed (progress unit)** (`draft` → `promote`):
The `OperationRunContext.progress.unit` value while account-list Refresh walks Fusion accounts (`processFusionAccounts`). Rendered on the STATUS line as `progress=done/total refreshed` with optional interval delta, same shape as Fetch `fetched` and Fetch ingest `ingested`.
_Avoid_: generic unit `processed` on Refresh STATUS; a second segment `refreshed(N)` that repeats `progress.done`

**STATUS line** (canonical — reuse):
Periodic host-visible situational line. Refresh extras that are not the progress count remain correlation segments only.
_Avoid_: inventing `REFRESH` as a line kind

**Refresh** (canonical operation phase — reuse):
Account-list phase 3. Pipeline progress during this phase counts Fusion accounts visited in `processFusionAccounts`, not a needsRefresh subset.
_Avoid_: using STATUS unit `processed` as a synonym for this phase’s work

**needsRefresh** (canonical FusionLayers flag — reuse, not a STATUS token):
Per-account flag that attribute Map/Define should recompute. Not a heartbeat progress unit in this change.
_Avoid_: exposing needsRefresh as a second cumulative on STATUS

**processed (progress unit)** (existing call-site label — keep for Process `batchProcess`):
Default `setProgress` unit from `batchProcess` when the caller does not pass another unit. Remains valid for Process identity / decision / correlated-sweep work.
_Avoid_: treating `processed` as the Refresh-phase verb

## Decisions

Context: Operators see `STATUS phase=Refresh progress=19032/102407 processed(Δ+192/10s) refreshed(19032)`. Fetch already prints `progress=… fetched(Δ+…/10s)` with no extra `fetched(N)`. Refresh uses the generic `batchProcess` unit `processed` plus `recordRefreshedAccount()` for accounts with `needsRefresh`. With the default 60s refresh threshold those two numbers lockstep, so `refreshed(N)` is redundant.

Q1: Keep dual counters (visited vs needsRefresh) or one progress unit?
Chosen: **one unit**. `progress.done` stays “Fusion accounts visited this Refresh.” Name the unit `refreshed`. Do not keep `refreshed(N)` even when a high TTL would make needsRefresh a subset — that metric is not worth a STATUS slot after the Fetch pattern.

Q2: Where does the delta attach?
Chosen: **on the unit**, matching Fetch: `progress=19032/102407 refreshed(Δ+192/10s)`. Drop `processed` from Refresh STATUS.

Q3: Process-phase `processed` in the same change?
Chosen: **no**. Identity processing, fusion-identity decisions, and correlated sweep keep `batchProcess` default `processed`. Separate rename if we later pick `identities` / `correlated`.

Q4: Remove `recordRefreshedAccount` / `refreshedCount`?
Chosen: **yes**, once STATUS no longer reads them. Nothing else (report, epilogue) consumes the counter.

Q5: Correlation on Refresh STATUS?
Chosen: **keep** the existing cumulative correlation segment when link/merge activity occurred in the phase. Spec text today says “alongside `refreshed(N)`”; reword to sit next to `progress=… refreshed`.

## Open questions

None blocking.

## Scenarios discussed

- Steady Refresh ticks: `progress=19032/102407 refreshed(Δ+192/10s)` — no `processed`, no `refreshed(19032)`.
- First tick after Fetch→Refresh (and first tick after unit change): omit progress delta (existing baseline reset).
- Refresh with correlation activity: `progress=… refreshed` plus `correlations link=…` (no `refreshed(N)`).
- Idle API queue during Refresh: still omit `api=` (existing); pipeline delta remains on `refreshed`.
- Process `batchProcess` still emits unit `processed` after this change.
- Empty Fusion-account list: no `refreshed` progress flicker (existing `batchProcess` skip when total is 0).
