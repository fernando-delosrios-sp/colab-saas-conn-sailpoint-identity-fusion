## Context

`skip-unchanged-managed-snapshots` introduced claim-only absorb so quiet Refresh skips copying managed attributes onto `attributeBag.sources`. That optimization is sound when Map never runs. It breaks when the same Fusion account later becomes refresh-eligible in Process (automatic or authorized merge of a new managed key): `assembleAccount` → `addManagedAccountLayer` correctly decides live sources are required, but already-claimed linked keys are gone from `managedAccountsById`, so only the newly blended account materializes. Map Main-account merges then delete prior bag values; Define Velocity `$sources` sees a sibling-only list.

Ground truth: `recordings/company24509-poc/nadia` step-10; MelonHRM MEL0011 (origin) claim-only then MEL0010 auto-merge; Fusion account `ddc1ca65-fe36-4654-9c3f-d5d5fdce9799`.

## Goals / Non-Goals

**Goals:**
- Whenever Map or Define evaluates a Fusion account this run, `attributeBag.sources` contains materialized snapshots for every live linked managed account whose attributes were loaded earlier in the run
- Main/Origin merge does not delete bag values solely because the designated snapshot was never loaded
- Preserve claim-only CPU/heap win for accounts that never need live sources

**Non-Goals:**
- Re-fetching managed accounts from ISC to recover attributes
- Changing attributeMaps, merge defaults, or Match thresholds
- Always materializing on claim-only absorb
- Tenant data repair scripts

## Decisions

### D1: Retain claimed Account bodies on FusionRun
- **Choice**: On `claimAccount` (and identity bulk claim), copy or move the Account (or its attributes + key metadata needed for `setManagedAccount` materialization) into a retention map keyed by managed account key. Clear that map with `clearWorkQueue` / `clearManagedAccountState`. Expose a read used by FusionLayers rematerialization (not by Match as a second work queue).
- **Reason**: Inventory is metadata-only; work queue deletes the body; ISC re-fetch is out of scope.
- **Considered alternatives**: Always materialize on claim-only (defeats skip-unchanged); re-fetch on rematerialize (latency/rate-limit); keep snapshots only on `attributeBag.sources` during claim-only (similar memory, but conflates “loaded for Map” with “retained for later”).

### D2: Rematerialize from retention when live sources become required
- **Choice**: In `FusionLayers.addManagedAccountLayer`, after the existing once-per-invocation live-sources decision is true, for each linked key that lacks a snapshot in `attributeBag.sources`, materialize from retention if present, else from the work queue as today. Applies on Refresh layer entry and on Process `assembleAccount` re-entry for authorized/automatic merges.
- **Reason**: Matches the existing “materialize all live linked accounts” intent once the attribute bodies are reachable.
- **Considered alternatives**: Only rematerialize origin/main keys (insufficient for multi-account First/Concatenate and `$sources`); rematerialize inside MappingService (wrong layer; Define also needs sources).

### D3: Amend claim-then-materialize rule
- **Choice**: Keep “decide before first claim in this layer invocation.” Allow rematerialization of keys claimed earlier in the **same run** from retention. Do not require already-claimed keys to still sit in `managedAccountsById`.
- **Reason**: The original forbid assumed attributes were unrecoverable after claim; retention removes that assumption without putting claimed keys back on the Match work queue.

### D4: Map no-opinion when designated snapshot unavailable
- **Choice**: For Main account and Origin account merges, if the resolved designated snapshot key is absent from the snapshot index / `sourceAttributeMap` entirely, return a sentinel or otherwise signal “no opinion” so `applyMappedValue` preserves `attributeBag.current` (unless other existing preserve rules already apply). If the snapshot object is present and the attribute has no value, keep today’s empty → delete / vanished-key behavior.
- **Reason**: Defensive layer against partial sources; does not weaken genuine vanish detection.
- **Considered alternatives**: Preserve whenever any Main/Origin merge returns undefined (would stop clearing real drops); only preserve when `sources` is empty (already covered by `shouldPreserveCurrentWithoutContext`).

### D5: Spec conflict with clear-vanished-snapshot-attributes
- **Choice**: MODIFIED delta on mapping-service revises “Clearing does not require the selected snapshot to be present” to: clearing requires that either (a) some live snapshot was evaluated under a non-Main/Origin strategy for that key, or (b) the Main/Origin designated snapshot **was** loaded and lacks the attribute. Unavailable designated snapshot + sibling snapshots present → preserve.
- **Reason**: Discovery Q5; explicit supersession of the earlier scenario.

## Risks / Trade-offs

- [Risk] Retention increases peak heap for large aggregations → Mitigation: retain only Accounts that were claim-only (or all claimed bodies until clear — document choice in tasks; prefer retaining every claimed body for simplicity unless profiling shows need). Clear at existing work-queue clear points.
- [Risk] Rematerialization misses keys never loaded this run (deleted upstream) → Mitigation: those keys stay missing; Map preserve only applies when designated snapshot unavailable, not when account is gone from inventory; prune-deleted path unchanged.
- [Trade-off] Slightly more complex FusionRun surface → Reason for acceptance: only place that can hold post-claim attribute bodies without API re-fetch.
- [Trade-off] Map preserve can leave a stale value if rematerialization fails silently → Reason for acceptance: better than wiping; logging at debug when no-opinion fires is acceptable follow-up in tasks.

## Migration Plan

N/A — connector behavior fix; no schema or deployment migration. Operators may re-run account aggregation after upgrade to restore wiped attributes from live MelonHRM (or other) snapshots. Damaged `displayName` templates self-heal once `firstname`/`lastname` return and Define refresh runs.

## Open Questions

None.
