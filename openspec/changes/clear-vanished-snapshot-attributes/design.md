## Context

`MappingService.mapAttributes` builds its working copy from `{ ...attributeBag.current }` and writes or deletes only names in its target set. The target set has two parts: explicit `attributeMaps[].newAttribute` rows, and implicit **unmapped snapshot keys** produced by `collectUnmappedSnapshotKeys`, which iterates `sourceAttributeMap` and collects the keys present on live snapshots.

`applyMappedValue` already has the delete branch this change needs:

```
if (processedValue === undefined) {
    if (fusionAccount.isIdentity && identity[attribute] !== undefined) { ...fallback }
    else if (!shouldPreserveCurrentWithoutContext) { delete attributes[attribute] }
    return
}
```

The branch is unreachable for a name that no snapshot carries, because such a name never enters the target set. That is the whole defect. `needsRefresh` gates `mappingRuns`, so forced refresh on `accountRead` changes nothing about target selection.

Constraints:

- `MappingService` already receives the whole `FusionConfig`, which carries `normalAttributeDefinitions` and `uniqueAttributeDefinitions`, so definition names need no new plumbing.
- Pipeline order in `processFusionAccount` is `registerUniqueAttributes` → `applyAttributeProcessing` (Map → `refreshNormalAttributes` → `refreshReverseCorrelationAttributes`). `refreshUniqueAttributes` runs later, at output. A unique value deleted by Map would be regenerated rather than preserved.
- `MappingService` must stay stateless per its existing requirement; the candidate computation is per-invocation.

## Goals / Non-Goals

**Goals:**

- A persisted attribute that no live snapshot carries is removed from `attributeBag.current` on a full Map
- Define keeps exclusive ownership of its own outputs, including unique-value preservation
- No change to when Map runs, to explicit mapping behavior, or to selective `onlyTargets` invocations

**Non-Goals:**

- Walking the Fusion account schema
- A configuration setting to opt in or out
- Distinguishing "account genuinely gone" from "account not fetched this run"
- Changing Define, Match, or unique generation

## Decisions

### D1: Implicit candidates are the union of live-snapshot keys and bag keys

- **Choice**: `collectUnmappedSnapshotKeys` also iterates `Object.keys(attributeBag.current)`. One candidate set, one code path, same denylist, same `processAttributeMapping` call, same `applyMappedValue` write/delete/identity-fallback handling.
- **Reason**: A name in the bag is exactly a name that could have gone stale. Reusing the existing path means a vanished key follows the configured merge and the existing empty-result semantics rather than getting a bespoke deletion rule.
- **Considered alternatives**: Schema walk (rejected on cost, already rejected in the prior change); a separate "prune" pass over the bag after mapping (rejected — duplicates the identity-bag fallback and `shouldPreserveCurrentWithoutContext` logic).

### D2: Clearing is unconditional on snapshot absence

- **Choice**: When no live snapshot carries the key, the merge yields `undefined` and the key is deleted. No check that the main or origin snapshot was fetched this run.
- **Reason**: This is already what an explicit mapping row does under Main account and Origin account merge — a missing chosen snapshot yields empty and deletes. Adding a guard only for implicit keys would make Map's contract depend on whether a name happens to have a mapping row.
- **Considered alternatives**: Skip clearing when the selected snapshot is absent (rejected — two contracts); clear only on single-account operations (rejected — aggregation is where staleness accumulates).

### D3: Definition-owned names are excluded from implicit candidates

- **Choice**: Extend the implicit denylist with every `normalAttributeDefinitions[].name` and `uniqueAttributeDefinitions[].name`, computed once at construction from the config already passed in. Explicit `attributeMaps` rows are unaffected — an operator who maps a name that a definition also owns keeps today's behavior.
- **Reason**: `refreshUniqueAttributes` preserves an existing unique value by reading it from the bag; a Map-side delete would regenerate it and churn identity keys. Normal definitions are recomputed after Map, so deleting them is a no-op at best and a transient hole for templates reading sibling outputs at worst.
- **Considered alternatives**: Exclude only unique names (rejected — leaves normal definitions exposed to ordering effects for no benefit); reorder the pipeline so Define precedes Map (rejected — far larger blast radius than this defect warrants).

### D4: Deleting a definition row lets its leftover value clear

- **Choice**: Exclusion is derived from the current definition lists, not from a persisted record of names Define once owned.
- **Reason**: Falls out of D3 at no cost and matches the operator expectation that removing a definition removes its output.

### D5: Selective mapping and the refresh gate are untouched

- **Choice**: `onlyTargets` invocations still skip implicit candidates entirely. `mappingRuns` and `shouldPreserveCurrentWithoutContext` are unchanged.
- **Reason**: Record unique registration must not widen its write set, and an account with no managed context must not have its bag emptied.

## Risks / Trade-offs

- [Risk] A transient aggregation gap (missing account, failed cascade, source outage) clears attributes that will come back on the next successful run → Mitigation: the `missing-accounts` mechanism and `shouldPreserveCurrentWithoutContext` still cover the total-absence case; document that partial context clears the absent source's contributions, and note dry-run as the way to preview.
- [Risk] Tenants relying on Fusion as a durable store for values a source stopped publishing lose those values on first refresh after upgrade → Mitigation: call out the migration path (explicit mapping row or Normal definition) in the changelog and mapping guide.
- [Trade-off] Iterating bag keys adds work proportional to the persisted attribute count per Fusion account, on top of snapshot iteration → Accepted: same order of magnitude as the existing snapshot walk, and bounded by attributes actually stored on the account rather than the tenant-wide schema.
- [Trade-off] Definition-owned exclusion means a stale value stays if its definition renders empty but Define is skipped → Accepted: Define's own clearing path covers this whenever it evaluates, and Map runs only when `needsRefresh` is set, which is also when Define re-evaluates `refresh: false` definitions.

## Migration Plan

No deployment or configuration change. The first full Map after upgrade drops attributes that no contributing account publishes. Operators wanting to retain such a value add an explicit `attributeMaps` row or a Normal attribute definition for that name. Rollback is a connector version revert; no persisted state changes shape, though values cleared before rollback are not restored and repopulate only if a source publishes them again.

## Open Questions

None.
