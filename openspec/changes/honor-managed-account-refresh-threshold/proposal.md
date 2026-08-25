## Why

`definition-service` and the defining-attributes guide say Refresh-off Normal definitions recalculate only when underlying source data changes (`needsRefresh`). That flag is supposed to flip when a new managed account blends or when a managed account’s `modified` exceeds the Fusion account by the internal refresh threshold. The threshold comparison currently uses `undefined` as the Fusion timestamp, which `isNewerThan` treats as epoch 0. Every live ISC managed account then looks “newer,” so Map and Refresh-off Define run on essentially every blended Fusion row every aggregation. Yesterday’s per-definition skip cannot help until `needsRefresh` is accurate.

## What Changes

**Timestamp reference for managed-account refresh**
- From: `isNewerThan(account.modified, undefined, thresholdMs)` in `FusionLayers.setManagedAccount`
- To: `isNewerThan(account.modified, fusionModified, thresholdMs)` using the Fusion account `modified` already passed into `addManagedAccountLayer`
- Reason: `isNewerThan` documents that a missing reference is epoch 0; a real ISO `modified` is always newer than 1970 + 60s
- Impact: Unchanged previously correlated accounts skip Map and Refresh-off Define; new blends, deletions, force refresh, and Refresh-on definitions still refresh

**Missing Fusion `modified`**
- From: Same epoch fallback (forces refresh whenever the managed account has any `modified`)
- To: Skip the timestamp check when Fusion `modified` is absent/empty; do not invent epoch as the reference
- Reason: Avoid recreating the bug for rows without `modified`
- Impact: Those rows still refresh on new blend or prune-deleted

**Unchanged**
- New-account blend sets `needsRefresh`
- Prune-deleted and orphan-clear paths
- Identity layer: `isNewerThan(identity.modified, fusionModified)` without threshold
- `fusionAccountRefreshThresholdInSeconds` default (60) and `isNewerThan` helper contract
- Account-list Refresh still visits every Fusion account (STATUS `refreshed` / work-queue depletion)

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-service`: `needsRefresh` from managed-account timestamps compares against Fusion account `modified`, not epoch

## Impact

- **Code:** `src/model/fusionLayers.ts`; tests in `src/model/__tests__/fusionAccount.test.ts` (and optionally `fusionLayers.refreshLookup.test.ts`)
- **Docs:** Optional clarifying sentence in `docs/use-guides/configuration/defining-attributes.md` that “source data changed” means new/removed managed accounts or managed `modified` newer than the Fusion account beyond the grace window. Do not publish the internal config key.
- **Migration:** None. Operators with Refresh-off definitions should see faster Refresh on unchanged accounts. Refresh-on definitions still evaluate every aggregation.

## Apply status

- **Status**: TODO
- **Depends on**: none
- **Issue**:
