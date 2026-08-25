# Discovery — index-refresh-managed-account-lookups

## Scope

**In:** Replace full managed-account work-queue scan in `FusionLayers.processPreviousRunMatchedAccounts` with targeted composite-key lookups; preserve blend, claim, missing-account, and uncorrelated status behavior; characterization tests with large queue fixture.

**Out:** Raising fusion parallel batch size; Define refresh semantics; identity-index redesign; changing `processIdentityMatchedAccounts` or `processDeclaredAccountIds` (already keyed).

## Language terms

| Term | Status |
|------|--------|
| **Managed account key** | promote — lookups use `sourceId::nativeIdentity` |
| **Managed source account** | promote — queue entries are managed source accounts |
| **Correlated account sweep** | conflicts-with-canonical — this change is Refresh managed-layer blending, not Process sweep |

## Decisions

- **Root cause:** `processPreviousRunMatchedAccounts` iterates `for (const [id, account] of queue.entries())` when `previousAccountIds` or `missingAccountIds` is non-empty, yielding O(fusionAccounts × queueSize) CPU even when only a handful of keys match.
- **Fix:** Iterate the union of normalized `previousAccountIds` and `missingAccountIds`; for each key, `queue.get(id)` — O(1) per key per fusion account.
- **Validation:** Depends on `instrument-account-list-refresh` — compare `queueEntriesScanned` before/after on same tenant profile.

## Open questions

_(none)_

## Scenarios discussed for specs

- Previous/missing keys blend without full queue walk
- Keys absent from queue are skipped without error
- Claim and uncorrelated status behavior unchanged
