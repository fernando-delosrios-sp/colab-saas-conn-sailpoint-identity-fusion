## Why

Map only evaluates attribute names that appear on a live snapshot this invocation, so a value whose source account stopped publishing it is never re-evaluated and never cleared. The persisted value survives every refresh, including forced refresh on `accountRead`. Operators see attributes that contradict their source systems, and Velocity definitions keep computing derived values from the stale input. The previous change made unmapped attributes refreshable; this makes them clearable, which is what "refresh" is expected to mean.

## What Changes

**Vanished snapshot keys clear on a full Map**
- From: Implicit Map candidates are names present on at least one live snapshot this invocation. A name that disappeared from every contributing account is not a candidate, so the create-time value persists indefinitely.
- To: Implicit candidates are the union of live-snapshot keys and `attributeBag.current` keys, minus the control denylist and minus definition-owned names. A name no live snapshot carries resolves to empty and is deleted from `attributeBag.current`.
- Reason: Refresh must be able to remove a value, not only overwrite it.
- Impact: **Behavior change** on every full Map. Attributes that a source stopped publishing now disappear from Fusion output instead of persisting. Operators who relied on Fusion retaining a value after the source dropped it must add an explicit mapping row or a Normal definition.

**Definition-owned names are excluded from implicit Map**
- From: The denylist covers Fusion control attributes, `id`, `name`, and the snapshot overlay fields `source`, `schema`, `IIQDisabled`.
- To: It also excludes every `normalAttributeDefinitions[].name` and `uniqueAttributeDefinitions[].name`.
- Reason: `registerUniqueAttributes` runs before Map and `refreshUniqueAttributes` preserves an existing unique value by reading the bag; clearing a unique name would regenerate it. Define owns its outputs and recomputes them after Map.
- Impact: Non-breaking. Removing a definition row still lets the leftover value clear, because exclusion follows the current definition lists.

**Unchanged**
- When Map runs (`needsRefresh` gate), and the no-managed-context preservation path
- Explicit mapping rows, per-attribute merge overrides, and every merge algorithm
- Selective `onlyTargets` invocations (record unique registration)
- Define, Match scoring, unique generation, connector-spec radios, stored `attributeMerge` values

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mapping-service`: SHALL treat `attributeBag.current` keys as implicit Map candidates alongside live-snapshot keys; SHALL delete a candidate that no live snapshot carries; SHALL exclude definition-owned names from implicit candidates.
- `ubiquitous-language`: Promote **vanished snapshot key** and **definition-owned name**; the glossary must not describe unmapped-key refresh as overwrite-only.

## Impact

- `src/services/mappingService/mappingService.ts` — widen `collectUnmappedSnapshotKeys` to the bag union; extend the denylist with definition-owned names
- `src/services/mappingService/types.ts` — definition names reaching MappingService construction, if not already on `FusionConfig`
- Tests: `src/services/mappingService/__tests__/mapService.test.ts`
- Docs: `docs/use-guides/configuration/mapping-attributes.md`, `docs/configuration/mapping.md`, `docs/glossary.md`
- Changelog via changelog-generator at apply close
- No connector-spec change, no ISC config migration, no new dependencies
