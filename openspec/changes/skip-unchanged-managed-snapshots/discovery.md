## Scope

In: Refresh `addManagedAccountLayer` may **claim-only absorb** previously correlated managed accounts that would not set `needsRefresh`, skipping **source snapshot materialization**. Out: skipping the Fusion-account visit, changing Map/Define skip rules, skipping work-queue `claimAccount`, changing Fetch, or skipping snapshot materialization when Map/Define will read live sources this row (new blend, prune-deleted, over-threshold `modified`, identity-driven `needsRefresh`, force attribute refresh, rebuild `refreshMapping`/`refreshDefinition`/`resetDefinition`, or eligible Always recalculate).

## Language

**Source snapshot materialization** (`promote`):
Copying a managed source account’s attributes onto `attributeBag.sources` during FusionLayers absorb so Map and Velocity `$accounts` / `$sources` can read this run’s live snapshots.
_Avoid_: blend (ambiguous with report fusionBlends), clone, hydrate

**Claim-only absorb** (`promote`):
Absorbing a work-queue managed account by claiming it and updating Fusion account bookkeeping (keys, uncorrelated, `managedAccountInfo`) without source snapshot materialization.
_Avoid_: skip blend, skip layer, skip Refresh

**needsRefresh** (`conflicts-with-canonical` — reuse, do not redefine):
Canonical FusionLayers flag that source data (or identity) changed enough to remap/redefine. This change does not alter when the flag is set; it stops materializing snapshots when the flag will stay false and live sources are not needed.
_Avoid_: refresh needed, dirty

## Decisions

Context: Quiet Refresh (`logs/performance2.log`) spent ~1h 34m visiting 102407 Fusion accounts. `managedLayerMs` dominated; `mapMs=202`, `normalDefineMs=507`, `definitionsEvaluated=0`. Map already skips when `!needsRefresh`. `setManagedAccount` still spreads every linked managed account’s attributes onto `attributeBag.sources` then claims the queue. `claimAccount` deletes the Account from `managedAccountsById`, so a later snapshot pass cannot recover attributes.

Q1: Skip Map at the caller vs skip snapshot materialization?
Chosen: **Skip source snapshot materialization** on unchanged links. Map caller-skip does not move this tenant.

Q2: Skip visiting Fusion accounts with `!needsRefresh`?
Chosen: **No.** Refresh must still claim linked managed accounts or Process rematches them (this run: Process 1.8s after 147329 claims).

Q3: Per-account snapshot vs whole-row materialize?
Chosen: **Decide once per Fusion row before claim.** If any linked key is new, over-threshold newer, or would be pruned, or the row already needs live sources (identity `needsRefresh`, force/rebuild flags, eligible Always recalculate), materialize snapshots for all remaining live linked accounts. Otherwise claim-only for those keys. Reason: Map merge and `$accounts` need the full contributing set; prune/`needsRefresh` after claim cannot re-fetch deleted queue entries.

Q4: Always recalculate (`definition.refresh`) on `!needsRefresh`?
Chosen: **Materialize.** Those templates may read `$accounts` / `$sources` / origin `$account`. This tenant had zero evaluations; tenants with Always recalculate keep current Refresh cost for materialization.

Q5: Report `fusionBlends`?
Chosen: Unchanged. `onBlend` today fires only for **new** account history (`setManagedAccount` return). Claim-only applies to previously correlated keys, not new blends.

## Open questions

None blocking. Assumption: `managedAccountInfo` can be filled from the live Account (or inventory) during claim-only without copying the full attribute bag. Assumption: Refresh METRIC may distinguish materialized vs claimed-only counts; not required for correctness.

## Scenarios discussed

- Previously correlated managed account, `modified` older than Fusion `modified` + threshold, no Always recalculate, no force → claim-only; `needsRefresh` false; Map skip; sources map has no new snapshot for that key.
- New blend (key not in `previousAccountIds`) → materialize + `needsRefresh` true.
- Managed `modified` beyond threshold → materialize all live linked accounts on that Fusion row + `needsRefresh` true.
- Prune-deleted would remove a tracked key → materialize remaining live accounts + `needsRefresh` true (decide before claim).
- Identity layer already set `needsRefresh` → materialize.
- `forceAttributeRefresh` or rebuild `refreshMapping`/`refreshDefinition`/`resetDefinition` → materialize (flags known before `addManagedAccountLayer`).
- Eligible Always recalculate on the row → materialize even if timestamps are stale.
- Missing Fusion `modified` → timestamp check does not force `needsRefresh` (existing spec); claim-only unless another materialize rule applies.
- Work queue: every linked key still `claimAccount`; Process must not see those keys again.
