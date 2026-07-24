# Brainstorm: Streamline Record Unique Registration

## Background

Record-type managed sources with **Include record accounts in Match** disabled exist solely to reserve unique attribute values (e.g. third-party identifiers). They must not create Fusion accounts or participate in Match scoring.

Today each record account still enters the uncorrelated match sweep. Per account the connector runs:

- Full `mapAttributes` (all attribute maps)
- Full `refreshNormalAttributes` (all normal Velocity definitions)
- `refreshReverseCorrelationAttributes`
- Match machinery (scoring skipped, but assembly + analysis recording remain)
- `registerUniqueAttributes` (reads values already on the fusion attribute bag)

`registerUniqueAttributes` does **not** evaluate unique-definition Velocity templates. Values must already exist via:

1. **Passthrough** — managed source attribute name equals unique definition name
2. **Map** — an attribute map's `newAttribute` equals the unique definition name

Normal defines with different names and generated unique values are out of scope for this path.

Volume: **several thousand record accounts per aggregation run**.

## Decision chain

### Q1 — Typical volume?

**Answer:** Several thousands per run. Full per-account match sweep overhead is material.

### Q2 — Do unique values ever come from normal defines with a different name?

**Answer:** No. Only passthrough (same attribute name on record) or mapping creates the value. Values are never calculated on this path.

### Q3 — Minimal change vs bulk pre-pass?

**Answer:** Prioritise performance → **bulk pre-pass** before uncorrelated match sweep.

## Approaches considered

### A — Selective map/define inside existing sweep (minimal diff)

Add `UniqueRegistrationPlan` (unique def names ∩ map targets) and filter map/normal define inside `assembleManagedAccount` when record + match disabled.

- Pros: Smallest code change, low risk
- Cons: Still O(N) FusionAccount hydration, match sweep progress noise, trigram/index setup cost for accounts that never score

### B — Bulk pre-pass phase (recommended)

Before `processUncorrelatedManagedAccounts`, partition record sources with `includeRecordAccountsForMatching=false`, run a dedicated **record unique registration** step:

1. Precompute registration plan at startup (set intersection)
2. Batch process accounts: lightweight hydration → selective map only → register values → remove from work queue
3. Remaining accounts use existing match sweep unchanged

- Pros: Removes thousands from match queue; clearer logging; avoids match infrastructure; best CPU profile
- Cons: New phase + spec updates; must handle correlated/skipped edge cases

### C — Velocity dependency analysis

Parse expressions to discover indirect dependencies.

- Rejected: User confirmed no cross-name defines; YAGNI.

## Agreed design (performance-first)

### UniqueRegistrationPlan (config-time)

Built once from `uniqueAttributeDefinitions` + `attributeMaps`:

```
uniqueNames   = all unique definition names
mapTargets    = uniqueNames ∩ { attributeMap.newAttribute }
passthrough   = uniqueNames − mapTargets (read raw source attrs after fromManagedAccount)
```

No normal define evaluation on this path.

### Bulk record unique registration phase

Insert in process phase **after** correlated sweep, **before** uncorrelated match sweep:

```
correlated-sweep
    ↓
record-unique-registration   ← NEW (CPU-bound, progress unit=registered)
    ↓
uncorrelated-sweep           ← smaller queue
```

Per eligible account:

1. `FusionAccount.fromManagedAccount(account)` (cheap — copies source attrs)
2. `mapAttributes(fusionAccount, { onlyTargets: plan.mapTargets })`
3. For each `uniqueName`: read `fusionAccount.attributes[name]`, add to registry if present
4. Remove account from `managedAccountsById` / claim (same as current non-match disposal)

Skip: full map, normal define, reverse correlation, match scoring, analysis recorder non-match rows (or record separately as registration-only metric).

### Logging alignment

- New step: `record-unique-registration` with `progress=N/M registered`
- Avoids false API queue stall warnings during CPU-heavy registration
- Optional: `EVENT_SUMMARY recordUniqueRegistered=N`

### Edge cases

- **Correlated record accounts:** Handle in correlated sweep or skip if already linked (existing drop logic)
- **Missing unique ID skip:** Respect `skipAccountsWithMissingId` if configured for fusion identity attribute
- **Record + match enabled:** Unchanged — full match path
- **Form decision path:** Reuse same selective map + register helper for record no-match decisions

## Success criteria

- Thousands of record-only accounts no longer enter uncorrelated match sweep
- Only attribute maps whose targets coincide with unique definition names are evaluated
- Registered unique values identical to current behavior for passthrough + map cases
- Process phase logs show distinct `record-unique-registration` step with progress
- Existing tests for record skip-match behavior pass; new tests cover bulk path and plan intersection
