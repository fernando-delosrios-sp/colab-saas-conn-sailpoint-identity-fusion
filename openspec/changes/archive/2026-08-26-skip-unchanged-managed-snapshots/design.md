## Context

Account-list Refresh visits every Fusion account so linked managed accounts can be claimed from the work queue. `needsRefresh` already gates Map and Refresh-off Define. `FusionLayers.setManagedAccount` still always materializes source snapshots (`attributeBag.sources`) by spreading `account.attributes`. Quiet-tenant DETAIL (`logs/performance2.log`): `managedLayerMs` dominates; `mapMs`/`normalDefineMs` are sub-second; `definitionsEvaluated=0`. `FusionRun.claimAccount` deletes the Account from `managedAccountsById`, so snapshots cannot be materialized after claim.

## Goals / Non-Goals

**Goals:**

- Claim linked managed accounts on every Refresh visit without copying attributes when this Fusion row will not read live sources
- Decide materialize-vs-claim-only **once per Fusion row before any claim**
- Keep `needsRefresh` rules, Map/Define skip rules, and STATUS visit semantics unchanged

**Non-Goals:**

- Skipping the Fusion-account Refresh visit
- Changing Map/Define evaluation gates
- Per-key mixed materialize on one Fusion row (Map/`$accounts` need the full contributing set)
- Heuristics that inspect Velocity templates for `$accounts` usage
- Changing Fetch, Match, or Output unique JIT
- C4/container architecture (single in-process collaborator change)

## Decisions

### D1: Whole-row materialize flag before claim

- **Choice**: Compute `requireLiveSourceSnapshots` for the Fusion row, then absorb every linked queue hit with either full source snapshot materialization or claim-only absorb. Never claim first then copy.
- **Reason**: Claim deletes the Account object. Prune and timestamp results that flip `needsRefresh` after a claim-only pass would leave Map with an empty `sources` map and wipe mapped current.
- **Considered alternatives**: Two-pass (detect then copy) rejected unless the first pass does not claim — equivalent to decide-before-claim. Skip visit entirely rejected (work-queue depletion). Per-key copy only for newer accounts rejected (merge/`$accounts` need siblings).

### D2: When `requireLiveSourceSnapshots` is true

- **Choice**: True if any of: identity (or other prelude) already set `needsRefresh`; `forceAttributeRefresh`; rebuild `refreshMapping` / `refreshDefinition` / `resetDefinition`; eligible Always recalculate on this row; any linked key is a new blend; any linked key’s `modified` exceeds Fusion `modified` + threshold; prune-deleted would remove a tracked key.
- **Reason**: Those paths run Map and/or Define against live snapshots.
- **Considered alternatives**: Materialize only for Always recalculate that mention `$accounts` — brittle. Ignore prune until after absorb — unsafe after claim.

### D3: Claim-only still updates bookkeeping

- **Choice**: Claim-only still `claimAccount`, uncorrelated/status updates, `managedAccountInfo` from the live Account (or inventory) without spreading the attribute bag, and history rules for **new** blends unchanged (new blends always materialize).
- **Reason**: Reverse correlation and Process depletion do not need full snapshots. Report `fusionBlends` only records new-account history today.

### D4: Callers pass prelude/config flags into the layer

- **Choice**: `processFusionAccount` computes force/rebuild/Always-recalculate eligibility **before** `addManagedAccountLayer` and passes them on `AddManagedAccountOptions`. FusionLayers ORs row-local new/timestamp/prune signals.
- **Reason**: Force is currently applied **after** the layer via `setNeedsRefresh(...)`. If snapshots were skipped first, force Map would see empty sources.
- **Considered alternatives**: Move force OR before the layer only — insufficient; FusionLayers still must see Always recalculate and rebuild flags.

### D5: Instrumentation

- **Choice**: Keep Refresh buckets. `queueEntriesScanned` remains lookups. Do not require a new STATUS token. Tests assert presence/absence of `attributeBag.sources` snapshots, not wall-clock.
- **Reason**: Correctness first; optional later counter for materialized vs claimed-only.

## Risks / Trade-offs

[Risk] Prune detection misses a deleted key → `needsRefresh` true and sources empty → Map clears mapped attributes. -> Mitigation: Compare tracked keys to `managedAccountInventory` **before** claim; if any would prune, require live snapshots for remaining live keys.

[Risk] Always recalculate tenants see no Refresh improvement. -> Mitigation: Accepted; live `$accounts` need snapshots. Quiet tenants without Always recalculate are the target.

[Risk] Tests stub `attributeBag.sources` after every `addManagedAccountLayer`. -> Mitigation: Update tests that assumed always-filled sources on stale rows.

[Trade-off] Extra pre-pass over linked keys (O(linked), not O(queue)) before absorb. -> Reason for acceptance: Tiny vs spreading every attribute bag; enables skip.

[Trade-off] `managedAccountInfo` without full attributes. -> Reason for acceptance: Inventory already stores source name / native id; reverse correlation uses schema id, not the full snapshot.

## Migration Plan

N/A — This change does not involve deployment changes. Operators keep existing config. Force attribute refresh still rematerializes. After apply, quiet aggregations should show much lower `managedLayerMs` and less heap sawtooth; `definitionsEvaluated` stays 0 unless Always recalculate or `needsRefresh`.

## Open Questions

None.
