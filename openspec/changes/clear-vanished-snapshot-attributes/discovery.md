## Scope

In: **Map** (`MappingService.mapAttributes`) clearing persisted attributes that no live snapshot carries this invocation, by widening the implicit candidate set from live-snapshot keys to live-snapshot keys plus `attributeBag.current` keys, while excluding names owned by Normal and Unique attribute definitions. Out: Velocity **Define** evaluation, unique generation, Match scoring, walking the full Fusion schema, changing stored `attributeMerge` values, adding a configuration setting, changing when Map runs.

## Language

**Map** (canonical — reuse):
Merging attributes from contributing snapshots into `fusionAccount.attributeBag.current`.

**Unmapped snapshot key** (canonical — reuse):
An attribute name that appears on at least one live snapshot in this `mapAttributes` invocation and is not an `attributeMaps[].newAttribute` mapping target.

**Vanished snapshot key** (`draft` → `promote`):
An attribute name present in `attributeBag.current` that no live snapshot in this `mapAttributes` invocation carries, that is not an `attributeMaps[].newAttribute` target, and that is not owned by a Normal or Unique attribute definition or on the control denylist.
_Avoid_: "orphaned attribute" (collides with **Orphan**, a Fusion account with no contributing managed source accounts); "stale attribute" (collides with stale-account refresh vocabulary).

**Definition-owned name** (`draft` → `promote`):
An attribute name that appears as `name` on a configured `normalAttributeDefinitions` or `uniqueAttributeDefinitions` entry. Define owns the value; Map neither merges nor clears it.
_Avoid_: "generated attribute" (already used loosely for unique values only).

**Normal attribute definition** / **Unique attribute definition** (canonical — reuse):
Define-step rules. Unique definitions run after normal definitions and preserve an existing value when one is present.

## Decisions

Context: `3762e06 feat(mapping): refresh unmapped snapshot keys with the default merge` closed the "unmapped attributes are static after Fusion account creation" gap for names still present on a snapshot. The candidate set is built by walking live snapshots (`collectUnmappedSnapshotKeys`), so a name that disappeared from every contributing account never becomes a target. Map seeds its working copy from `{ ...attributeBag.current }` and only writes or deletes target names, so the create-time value survives every refresh. `needsRefresh` gates only *whether* Map runs, not *which* names it considers, so forced refresh on `accountRead` does not help. Reproduced against `recordings/cambridge-sb/accountread`: `STUDENT_ID` stays `sailpoint-307803971` after Jackdaw dropped the attribute; a throwaway MappingService test failed with `expected 'sailpoint-307803971' to be undefined`.

Q1: Where do vanished-key candidates come from?
Chosen: **Union of live-snapshot keys and `attributeBag.current` keys**, filtered by the existing denylist. Not a Fusion schema walk — cost still scales with the tenant schema, and the bag already holds exactly the names that could go stale.

Q2: Guard clearing when the snapshot Map selected was not fetched this run?
Chosen: **No — unconditional.** Whenever no live snapshot carries the key, the key clears. This is the semantics explicit mapping rows already have under Main account and Origin account merge, where a missing chosen snapshot yields empty and deletes the value. A second, bag-key-only rule would make Map's contract depend on whether a name happens to have a mapping row.

Q3: Do Define outputs clear?
Chosen: **No.** Exclude every definition-owned name from the vanished-key candidate set. This is forced by pipeline order, not preference: `registerUniqueAttributes` runs before Map, and `refreshUniqueAttributes` preserves an existing unique value by reading it from the bag, so clearing a unique name would regenerate it and churn identity keys. Normal definition outputs are recomputed by Define after Map, so clearing them is at best a no-op and at worst a transient hole for templates that read sibling definition outputs.

Q4: What happens when an operator deletes a definition row?
Chosen: **The orphaned value clears.** Exclusion is computed from the *current* definition lists, so a removed definition's name is no longer excluded and becomes a vanished snapshot key on the next refresh.

Q5: Does selective Map (`onlyTargets`) gain vanished keys?
Chosen: **No.** Unchanged — record unique registration must not expand its write set.

Q6: Does Map start running more often?
Chosen: **No.** `mappingRuns = needsRefresh && sourceAttributeMap.size > 0` is unchanged, as is `shouldPreserveCurrentWithoutContext` for accounts with no managed context at all.

## Open questions

None.

## Scenarios discussed

- Origin source drops an attribute it used to publish; no mapping row exists; value clears on refresh (the Cambridge `STUDENT_ID` case)
- Knock-on: once `STUDENT_FLAG` clears, `IN_STUDENT_SYSTEM` and `STUDENT_URL` recompute from empty and their `#if` guards render nothing
- A record source contributes a key that the origin never had; that key still clears when the record account stops publishing it
- Unique definition name (`UID`) is in the bag and on no snapshot — excluded, value preserved
- Normal definition name (`STUDENT_URL`) is in the bag and on no snapshot — excluded, Define owns it
- Operator deletes a Normal definition row; the leftover value clears on the next refresh
- Fusion control attributes, `id`, `name`, `source`, `schema`, `IIQDisabled` are never candidates
- Fusion account with no managed context at all still preserves current (`shouldPreserveCurrentWithoutContext`)
- `onlyTargets` invocation does not clear vanished keys
- `needsRefresh` false — Map still skips entirely and does not clone the bag
- Identity-origin account with the identity bag registered as Identities: bag keys backed by the identity snapshot are not vanished

## Considered and rejected

- **Walk the full Fusion schema** — rejected previously in `2026-08-24-merge-unmapped-snapshot-attributes` on cost; the bag-key union gets the same clearing behavior without schema-wide iteration.
- **Clear only when the selected main/origin snapshot was actually fetched this run** — rejected: adds a second merge contract that explicit mapping rows do not follow.
- **Gate behind an advanced setting, default off** — rejected: the current behavior is the bug, not a preference.
- **Restrict clearing to single-account operations** — rejected: aggregation is where stale values accumulate.
