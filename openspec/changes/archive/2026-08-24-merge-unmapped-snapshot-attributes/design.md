## Context

`MappingService.mapAttributes` merges managed snapshots into `attributeBag.current` using `attributeMaps` and `config.attributeMerge`. Targets are `attributeMaps[].newAttribute` only. `buildAttributeMappingConfig` already fills a same-name default-merge config when no row exists, but that helper is never called for names outside the maps list.

Identity-origin injects `attributeBag.identity` as source `Identities` at the end of source order and resolves origin with a dedicated branch. Managed-origin rows that later have an identity bag do not put Identities in the snapshot index, so `mainAccount` cannot name an identity.

Merge decisions and auto-merge blend snapshots, then Map, then Define, once. Implicit merge belongs in that Map pass.

This change stays inside MappingService (one service). No C4 container diagram.

## Goals / Non-Goals

**Goals:**
- On full Map, merge unmapped snapshot keys with the stored global default merge
- Keep cost proportional to keys on this account’s live snapshots
- Register Identities as a snapshot whenever the identity bag is present; resolve origin and main through the snapshot-key index
- Preserve explicit maps, `onlyTargets`, Identity-kind skip, and merge-strategy semantics (including no fall-through for Main/Origin)

**Non-Goals:**
- Walking Fusion schema names that never appear on this invocation’s snapshots
- Changing stored `attributeMerge` or connector-spec radios
- Velocity Define, Match scoring, unique attributes
- Making `FusionAccountKind.Identity` run Map
- Expanding implicit merge when `onlyTargets` is set

## Decisions

### D1: Implicit targets are live snapshot keys, not the schema
- **Choice**: After injecting Identities (when present), collect the union of enumerable keys on snapshots in `sourceAttributeMap`. Subtract explicit `newAttribute` names and the denylist. Remaining names are implicit targets; each gets `buildAttributeMappingConfig(name, undefined maps-or-no-match, defaultAttributeMerge)` and `processAttributeMapping`.
- **Reason**: Matches “same name, no mapping row” without O(tenant schema) work.
- **Considered alternatives**: All Fusion schema names (rejected — cost and Main-account clears); always Main account for unmapped (rejected — user wants stored default).

### D2: Denylist
- **Choice**: Skip Fusion control attributes (`FusionAttribute` members), Fusion identity/display `id` and `name`, and snapshot overlays `source`, `schema`, `IIQDisabled`.
- **Reason**: `setManagedAccount` copies overlays onto snapshots; writing them onto `current` would pollute ISC output. `id` / `name` are core Fusion schema, not contributor merge.
- **Considered alternatives**: Allow `name` from snapshots (rejected — display/identity attributes are Define/core, not implicit Map).

### D3: Identities snapshot always when bag present
- **Choice**: If `attributeBag.identity` is non-empty, `sourceAttributeMap.set(IDENTITIES_SOURCE_NAME, [identity])`, append Identities to source order if not already listed, and index the bag under identity id (`identityId` / `identity.id`) in the same snapshot-key index as managed accounts.
- **Reason**: Origin/main are pointers; identity-origin is not a second algebra. Managed-origin rows can resolve Identities if the pointer is the identity id.
- **Considered alternatives**: Keep inject only when `originSource === Identities` (rejected — user does not want a behavioral fork).

### D4: Origin via snapshot-key index
- **Choice**: After indexing Identities, `getOriginAccountContextAccount` uses `snapshotIndex.get(originAccountId)` (plus existing identity-id match if the bag is indexed under that id). Remove the origin-source special return once the index contains the identity.
- **Reason**: One lookup path for managed and Identities.
- **Considered alternatives**: Keep the Identities branch (works but preserves the fork).

### D5: Full Map vs `onlyTargets`
- **Choice**: Implicit keys run only when `onlyTargets` is omitted. When `onlyTargets` is set, evaluate only that set (explicit configs), unchanged.
- **Reason**: Record unique registration maps coincident unique names only; implicit expansion would write unrelated snapshot keys onto throwaway Fusion rows.
- **Considered alternatives**: Implicit ∩ `onlyTargets` (unnecessary; those names are already explicit maps when unique).

### D6: Empty implicit value
- **Choice**: Reuse the existing mapped-attribute write/delete/identity-fallback loop.
- **Reason**: Main/Origin no-fallback stays honest for implicit names too.
- **Considered alternatives**: Leave `current` unchanged on implicit miss (rejected — would keep stale origin copies when Main lacks the key).

### D7: Processing order
- **Choice**: Evaluate explicit mapping targets first (including `mainAccount` rewrite), then implicit keys. Implicit merge sees the updated main snapshot.
- **Reason**: Same as today’s mid-loop `mainAccount` rewrite for later explicit maps; implicit should not run before that rewrite.
- **Considered alternatives**: Interleave by name (no benefit).

## Risks / Trade-offs

- [Risk] Existing sources with stored `first` or `list` start merging unmapped same-named keys on refresh → Mitigation: changelog + mapping docs; no config migration (this is the intended product)
- [Risk] Snapshot key union includes unexpected contributor fields → Mitigation: denylist; tests for overlay keys not written to `current`
- [Risk] Indexing Identities on managed-origin changes First found (Identities last) for **mapped** attributes that previously never saw the identity bag → Mitigation: identity is last in source order, so First found still prefers managed sources; List/Concatenate may gain identity values for overlapping names — document as part of Identities-as-snapshot
- [Trade-off] Spec “schema-defined attributes are mapping targets” is replaced by snapshot keys → Reason: living spec never matched runtime; snapshot keys are the cheap honest contract
- [Trade-off] Match `assembleManagedAccount` still runs full Map → Reason: single-snapshot assembly is near no-op for implicit keys; no call-site split

## Migration Plan

No ISC config migration. Stored `attributeMerge` unchanged. First aggregation after upgrade refreshes unmapped snapshot keys. Rollback is revert of MappingService. Acceptance: mapping-service unit tests for implicit keys, Identities index, `onlyTargets` isolation, denylist; docs describe default merge without a mapping row.

## Open Questions

None.
