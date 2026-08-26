## Why

Quiet account-list Refresh still takes on the order of 1.5 hours for ~100k Fusion accounts after Map/Define skip work. Sub-step DETAIL shows `managedLayerMs` as essentially all CPU while `mapMs` and `normalDefineMs` are sub-second and definitions evaluate zero times. FusionLayers still copies every linked managed account’s attributes onto `attributeBag.sources` before claiming the work queue, even when `needsRefresh` stays false and Map throws those snapshots away. Claim must remain so Process stays empty; snapshot copies need not.

## What Changes

**Source snapshot materialization vs claim-only absorb**
- From: `FusionLayers.setManagedAccount` always spreads managed account attributes onto `attributeBag.sources` whenever a linked key is found on the work queue, then claims the key. Specs say previously correlated stale accounts are still “blended and claimed.”
- To: Decide once per Fusion row **before** `claimAccount` whether live source snapshots are required this row. If not, claim-only absorb (queue claim, keys, uncorrelated, `managedAccountInfo`) without source snapshot materialization. If yes, materialize snapshots for all remaining live linked accounts on that row (Map merge and `$accounts` need the full set). `claimAccount` still deletes the Account from the work queue in both paths.
- Reason: After claim, full attributes are gone from `managedAccountsById`; prune/`needsRefresh` discovered late cannot recover them. Whole-row decide-before-claim is the only safe skip.
- Impact: Non-breaking for ISC account output when Map already skips (`!needsRefresh`). Tenants with Always recalculate, force attribute refresh, new blends, deletions, or over-threshold `modified` keep current materialization. Quiet Refresh heap and CPU should drop.

**Unchanged**
- When `needsRefresh` is set (new blend, prune-deleted, over-threshold managed `modified`, identity `modified`, force/rebuild flags)
- Map/Define skip rules
- Visiting every Fusion account during Refresh (STATUS `refreshed`)
- Report `fusionBlends` (new-account history only)
- Fetch, Match, Output unique JIT

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-service`: claim-only absorb vs source snapshot materialization on the managed-account layer; targeted lookup scenarios distinguish claim from materializing snapshots
- `ubiquitous-language`: **Source snapshot materialization** and **Claim-only absorb**

## Impact

- **Code:** `src/model/fusionLayers.ts` (`addManagedAccountLayer` / `setManagedAccount`); `src/services/fusionService/fusionService.ts` and/or `accountAssembly.ts` to pass materialize intent (force, rebuild AttributeOperations, eligible Always recalculate) **before** the layer; tests under `src/model/__tests__/` and fusion/account-assembly tests that assume `attributeBag.sources` is always filled after Refresh
- **Docs:** Optional sentence in defining-attributes or mapping guides that live `$accounts` require source snapshot materialization (Always recalculate / `needsRefresh`)
- **Changelog:** PATCH user-facing note that unchanged Fusion accounts skip copying managed source attributes during Refresh; operators with Always recalculate still copy
- **Migration:** None
