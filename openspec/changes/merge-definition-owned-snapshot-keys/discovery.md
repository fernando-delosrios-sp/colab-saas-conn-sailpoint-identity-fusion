## Scope

In: **Map** (`MappingService.mapAttributes`) merging an implicit candidate whose name matches a **Normal attribute definition** when a live snapshot carries that name, while still never clearing it. Out: Unique definition names (stay fully excluded from implicit Map), Velocity **Define** evaluation and ordering, explicit `attributeMaps` rows, the control/overlay denylist, when Map runs, and any new configuration setting.

## Language

**Definition-owned name** (`conflicts-with-canonical` → `promote`):
Canonical today (`ubiquitous-language`, Map-step terms) states Map "neither merges nor clears" a definition-owned name. That single rule must split by definition kind: a Normal definition name is merged when a live snapshot carries it and never cleared; a Unique definition name is neither merged nor cleared.
_Avoid_: treating "definition-owned" as one uniform exclusion.

**Pass-through definition** (`draft` → `promote`):
A Normal attribute definition whose expression reads its own name — a definition named `CRSID` with expression `$CRSID` — so Define transforms (case, trim, normalize) a value Map seeded into `attributeBag.current` from the same-named snapshot key. Define reads only the bag, never flattened snapshots.
_Avoid_: "identity mapping", "copy definition".

## Decisions

Context: `cab5bcb fix(mapping): clear vanished snapshot keys on full Map` added `definitionOwnedNames` to `isImplicitCandidateKey`, which is evaluated when candidates are **collected**. Its intent (Q3 of `2026-08-28-clear-vanished-snapshot-attributes`) was only to stop Map from *clearing* Define outputs, but filtering at collection time also suppresses the *merge*. Before that commit, `collectUnmappedSnapshotKeys` filtered only the denylist and explicit targets, so a Normal definition name present on a snapshot was merged. Reproduced against `recordings/cambridge-sb/attributes` (Fusion account `d931e715-…`, origin `sailpoint-Jackdaw::sailpoint-AB3398`, global `attributeMerge` Main account, no `mainAccount` override, no map row for `CRSID`): with the `CRSID` definition configured, Map leaves the stale bag value `$crsid`; with `normalAttributeDefinitions` emptied and nothing else changed, the same Map invocation writes `sailpoint-AB3398` from the Jackdaw origin snapshot. Because the bag lacks `CRSID`, Define renders the unresolved literal `$CRSID` and `case: "lower"` stores `$crsid`. Two sibling values confirm the same path: `COLLEGE_NAME` (`case: "same"`) stored `$COLLEGE_NAME`, and `UPN` (`${CRSID}@cam.ac.uk`, `case: "lower"`) stored `$crsid@cam.ac.uk`.

Q1: Where does the exclusion move to?
Chosen: **Suppress only the delete branch, not collection.** A Normal definition name becomes an ordinary implicit candidate; when `processAttributeMapping` yields empty, Map preserves the existing bag value instead of deleting it. This restores merge-when-present while keeping every guarantee the previous change bought — Define outputs never get a transient hole, and a removed definition row still lets its leftover clear because exclusion is computed from the current definition lists.

Q2: Do Unique definition names merge too?
Chosen: **No — Unique names stay excluded at collection.** `registerUniqueAttributes` runs before Map and `refreshUniqueAttributes` preserves an existing unique value by reading the bag, so a snapshot key colliding with a unique name would overwrite a Fusion-generated identity key and then be preserved forever. Unique values are Fusion-generated, never sourced. (`id` is already denylisted, but arbitrary unique names such as `UID` are not.)

Q3: Does clearing come back for Normal definition names?
Chosen: **No.** Unchanged from Q3 of the previous change. Preserve on empty, for both definition kinds.

Q4: Does Map now fight Define for the same name?
Chosen: **No.** Pipeline order is blend → Map → Define within one pass (`applyAttributeProcessing`), so Define still writes last and wins whenever it evaluates. Map only seeds the input a pass-through expression reads.

Q5: What happens to a `refresh: false` definition on an existing Fusion account?
Chosen: **The merged snapshot value wins.** `processNormalDefinition` skips a non-refresh definition that already has a value, so the bag keeps what Map merged. That is precisely the Cambridge fix — `CRSID` tracks Jackdaw again without operators flipping Always recalculate.

Q6: Does selective Map (`onlyTargets`) change?
Chosen: **No.** Record unique registration must not expand its write set.

## Open questions

None.

## Scenarios discussed

- Cambridge `CRSID`: Normal definition named `CRSID`, expression `$CRSID`, Jackdaw origin snapshot carries `CRSID`, no map row — merges, then Define lowercases
- Same shape for `COLLEGE_NAME`, `COLLEGE_ID`, `INST_NAME`; `UPN` recovers transitively once `CRSID` is in the bag
- Normal definition name on no live snapshot (`STUDENT_URL`) — preserved, Define still owns it
- Unique definition name on a live snapshot (`UID`) — not merged, generated value survives
- Unique definition name on no live snapshot (`UID`) — preserved (unchanged)
- Operator deletes a Normal definition row, no snapshot carries the name — leftover still clears
- Explicit map row for a definition-owned name still wins (unchanged)
- Denylisted control and overlay keys (`id`, `name`, `source`, `schema`, `IIQDisabled`) never candidates (unchanged)
- Fusion account with no managed context preserves its bag (unchanged)
- `onlyTargets` invocation neither merges nor clears definition-owned names (unchanged)
- Non-goal observed while reproducing: the tenant's `CRSID` definition sets `case: "lower"`, so the fixed value is `sailpoint-ab3398`, not `sailpoint-AB3398`. That is the configured transform, not part of this defect.
