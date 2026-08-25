# Discovery — honor-managed-account-refresh-threshold

## Scope

**In:** When `FusionLayers.setManagedAccount` decides `needsRefresh` from timestamps, compare the managed account’s `modified` to the Fusion account’s `modified`, using `fusionAccountRefreshThresholdInSeconds` as a grace window. Wire the unused `modified` argument already passed into `addManagedAccountLayer`. Characterization tests with ISO timestamps. Changelog.

**Out:** Identity-layer `isNewerThan(identity.modified, fusionModified)` (no threshold; separate investigate). Unique-register locks. Skipping the Refresh walk. Changing `definition.refresh` / force attribute refresh. Changing `isNewerThan` epoch semantics for other callers. C4 diagrams.

## Language terms

| Term | Status |
|------|--------|
| **FusionLayers** | promote — owns `needsRefresh` |
| **Refresh on each aggregation** | promote — Refresh-off Define follows `needsRefresh` |
| **Aggregation** | promote |
| needsRefresh | draft — flag meaning “underlying source data changed”; not a glossary Term entry in this change |

## Decisions

- **Bug:** `setManagedAccount` calls `isNewerThan(account.modified, undefined, thresholdMs)`. `isNewerThan` treats a missing reference as epoch 0, so any real ISC `modified` is newer than 60s after 1970. Refresh-off Map/Define therefore run on almost every blended Fusion account.
- **Fix:** `isNewerThan(account.modified, fusionModified, thresholdMs)` where `fusionModified` is the Fusion account `modified` already passed into `addManagedAccountLayer` and unused.
- **Missing Fusion `modified`:** Do not fall back to epoch (that recreates the bug). Skip the timestamp check; still set `needsRefresh` for new blends and prune-deleted.
- **Keep:** New managed-account blend (`!previousAccountIds.has(key)`), prune-deleted, identity-layer comparison, force attribute refresh, `refresh: true` definitions.

## Open questions

_(none)_

## Scenarios discussed for specs

- Previously correlated managed account with `modified` older than Fusion `modified` → `needsRefresh` stays false
- Previously correlated managed account `modified` newer than Fusion `modified` by more than the threshold → `needsRefresh` true
- Previously correlated managed account `modified` newer than Fusion `modified` but within the threshold → `needsRefresh` stays false
- New blend (key not in `previousAccountIds`) → `needsRefresh` true regardless of timestamps
- Fusion `modified` absent → timestamp check does not set `needsRefresh`
