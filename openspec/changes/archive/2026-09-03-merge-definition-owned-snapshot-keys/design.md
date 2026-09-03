## Context

`cab5bcb` stopped Map from clearing Define outputs by adding `definitionOwnedNames` to `isImplicitCandidateKey`, which runs when implicit candidates are **collected**. That also suppressed the merge. Before that commit, `collectUnmappedSnapshotKeys` filtered only the denylist and explicit targets, so a Normal definition name present on a live snapshot was merged.

Pass-through definitions depend on that merge. Define reads only `attributeBag.current`; a definition named `CRSID` with expression `$CRSID` renders the unresolved literal when Map never seeds the bag. Reproduced on `recordings/cambridge-sb/attributes` (Fusion account `d931e715-…`, origin `sailpoint-Jackdaw::sailpoint-AB3398`): with the `CRSID` definition configured, Map leaves `$crsid`; with `normalAttributeDefinitions` emptied, the same Map writes `sailpoint-AB3398`.

`applyMappedValue` already has a delete branch for empty `processAttributeMapping` results. The no-clear guarantee belongs there, not at collection.

Constraints:

- Pipeline order is unchanged: blend → Map → Define within `applyAttributeProcessing`. Define still writes last.
- `registerUniqueAttributes` runs before Map; `refreshUniqueAttributes` preserves an existing unique value by reading the bag. A snapshot key colliding with a Unique name must not overwrite a Fusion-generated identity key.
- `MappingService` stays stateless per invocation; exclusion still comes from the current definition lists on the `FusionConfig` already passed in.

## Goals / Non-Goals

**Goals:**

- A Normal definition name is an ordinary implicit candidate and merges under the global `attributeMerge` default when a live snapshot carries it
- Map never clears a definition-owned name (Normal or Unique) as an implicit candidate
- Unique definition names stay excluded at collection
- Restore Cambridge pass-through names (`CRSID`, `COLLEGE_NAME`, `COLLEGE_ID`, `INST_NAME`) so Define can transform the seeded bag value

**Non-Goals:**

- Define evaluation, ordering, or `refresh` semantics
- Unique generation
- Explicit `attributeMaps` row behavior except that it still wins over implicit Map
- The control/overlay denylist (`id`, `name`, `source`, `schema`, `IIQDisabled`, Fusion control attributes)
- When Map runs (`needsRefresh`, `onlyTargets`, no-managed-context preservation)
- A new connector-spec setting

## Decisions

### D1: Suppress only the delete branch for Normal definition names

- **Choice**: Drop Normal definition names from the collection filter. They become ordinary implicit candidates. When `processAttributeMapping` yields empty, `applyMappedValue` preserves the existing bag value instead of deleting.
- **Reason**: The previous change needed only the no-clear guarantee. Filtering at collection took the merge with it and broke pass-through definitions. Moving the exclusion to the delete branch restores merge-when-present and keeps Define outputs free of a transient hole.
- **Considered alternatives**: Keep collection exclusion and add a second “seed then define” path (rejected — duplicates merge); special-case expressions that equal `$<own name>` (rejected — Map must not parse Velocity).

### D2: Unique definition names stay excluded at collection

- **Choice**: `isImplicitCandidateKey` still rejects Unique definition names. They are neither merged nor cleared as implicit candidates.
- **Reason**: Unique values are Fusion-generated, never sourced. A colliding snapshot key would overwrite the generated identity key; `refreshUniqueAttributes` would then preserve that overwrite forever. `id` is already denylisted, but arbitrary unique names such as `UID` are not.
- **Considered alternatives**: Collect Unique names and skip only the delete (rejected — merge would still clobber generated keys); collect Unique names and skip both write and delete in `applyMappedValue` (rejected — extra work for the same outcome as not collecting).

### D3: Delete suppression covers every definition-owned name that reaches `applyMappedValue`

- **Choice**: Empty merge never deletes a name that is currently on either definition list. Implicit Unique names never reach this branch (D2). An explicit `attributeMaps` row for a definition-owned name still merges when it yields a value; when it yields empty, the bag value is preserved rather than cleared.
- **Reason**: Q3 of this change and of `2026-08-28-clear-vanished-snapshot-attributes`: never clear a definition-owned name. Preserve-on-empty is the same rule for both kinds.
- **Considered alternatives**: Let explicit maps still delete (rejected — would re-open the unique-regeneration and sibling-template hole for operators who also mapped the name).

### D4: Exclusion follows the current definition lists

- **Choice**: Collection filter (Unique) and delete suppression (both kinds) are computed from `normalAttributeDefinitions` and `uniqueAttributeDefinitions` on this invocation. A removed definition row becomes an ordinary implicit candidate, including vanished-key clearing.
- **Reason**: Same as the previous change’s D4. Operators who delete a definition expect its leftover to clear when no snapshot carries it.
- **Considered alternatives**: Persist historically owned names (rejected — leftovers would never clear).

### D5: Pipeline order and selective Map stay unchanged

- **Choice**: Map still runs before Define. `onlyTargets` still skips implicit candidates entirely. `refresh: false` on an existing Fusion account keeps the value Map merged, because `processNormalDefinition` skips when the bag already has a value.
- **Reason**: Define still wins whenever it evaluates. Map only seeds the input a pass-through expression reads. Record unique registration must not expand its write set. Cambridge recovery must not require flipping Always recalculate.
- **Considered alternatives**: Reorder Define before Map (rejected in the previous change; still out of scope); treat Normal definition names as `onlyTargets` extras (rejected — would widen selective Map).

## Risks / Trade-offs

- [Risk] First refresh after upgrade re-merges Normal definition names that collide with a snapshot key, changing Fusion output for tenants with that collision → Mitigation: changelog and mapping guide name the pass-through pattern and the Cambridge attributes that recover; no config migration required.
- [Risk] A Unique name accidentally configured as Normal would start merging from snapshots → Mitigation: Unique vs Normal is the operator’s definition list; Unique collection exclusion is unchanged.
- [Trade-off] A `refresh: false` Normal definition on an existing account keeps the merged snapshot value instead of the prior Define output → Accepted: that is the Cambridge fix; operators who want Define to recompute use Always recalculate.
- [Trade-off] Explicit map rows for definition-owned names no longer clear on empty merge → Accepted: same no-clear guarantee as implicit; merge still writes when the mapping yields a value.

## Migration Plan

No deployment or connector-spec change. The first full Map after upgrade merges Normal definition names that a live snapshot carries. Rollback is a connector version revert. Values merged before rollback stay in the bag until a later Map/Define pass.

## Open Questions

None.
