## Context

`FusionLayers.addManagedAccountLayer` identity-matches first, then `processPreviousRunMatchedAccounts` looks up leftover `previousAccountIds` and `missingAccountIds` on the work queue. Those leftovers are marked uncorrelated and absorbed. Prune-deleted only removes keys missing from `managedAccountInventory`, so a key claimed by another Fusion identity stays linked here. The work queue Account carries `identityId`; inventory `ManagedAccountInfo` also stores `identityId` after claim.

Fewer than three containers; no C4 diagram.

## Goals / Non-Goals

**Goals:**

- Exclusive Fusion identity ownership for a managed account key after Refresh
- Drop this Fusion account’s previous/missing link when the key is foreign-owned
- Leave foreign-owned Accounts on the work queue for the owning identity
- Keep prune-deleted inventory semantics and this-identity absorb unchanged

**Non-Goals:**

- Treating NonMatched / provisional Fusion accounts as owners by themselves
- Changing correlated-sweep skip-linked or Match pre-score
- Dropping identity-matched keys for this Fusion identity
- Scanning the full work queue (targeted key lookup stays)
- New operator settings or log STATUS tokens

## Decisions

### D1: Foreign-owned detection

- **Choice**: A previous/missing key is foreign-owned when (a) the live Account or inventory `identityId` is set, differs from this Fusion account’s identity id, and `FusionRun.hasFusionIdentity(identityId)` is true, or (b) another loaded Fusion identity already lists the key in accounts / missing-accounts / previous keys.
- **Reason**: Matches “part of another Fusion identity.” A different ISC identity with no Fusion identity is not an owner yet; today’s uncorrelated re-absorb remains.
- **Considered alternatives**: Inventory miss only — keeps ghost links. Any other Fusion _account_ (including NonMatched) as owner — over-drops vs canonical Fusion identity. Linked-key index built after Refresh — too late for this path unless rebuilt mid-Refresh; prefer identity map + optional identity `accountIds` check.

### D2: Previous/missing path only

- **Choice**: Apply the check in the previous/missing uncorrelated lookup, after identity matching for this Fusion identity. Do not skip `processIdentityMatchedAccounts` for this identity’s keys.
- **Reason**: If this identity still owns the ISC correlation, it must keep the account. Foreign-owned is “leftover keys that identity matching did not claim.”
- **Considered alternatives**: Check every declared `accountIds` key — would fight identity matching. Check only `missingAccountIds` — previous-run correlated keys that moved identity would still steal or ghost.

### D3: Drop without claim

- **Choice**: Remove the key locally with the same mutations and refresh/orphan semantics as prune-deleted: accounts, missing, previous, `managedAccountInfo`, and history are updated; remaining contributors force refresh, while a managed-origin account that loses its last contributor becomes orphan with `needsRefresh` false. Do not `claimAccount`. If the Account is already gone from the queue, only local drop.
- **Reason**: Claim would hide the account from the owning Fusion identity later in Refresh.
- **Considered alternatives**: Claim then skip blend — Process would not rematch, but neither would the owner. Leave the ghost link — status quo.

### D4: Materialize remaining live keys

- **Choice**: Foreign-owned drop is a `requireLiveSourceSnapshots` signal, same as prune-deleted would remove a tracked key. Decide before any claim on the row.
- **Reason**: Map and `$accounts` need remaining contributors after a blend loss.
- **Considered alternatives**: Claim-only after drop — mapped attributes could keep the foreign account’s data.

### D5: History text

- **Choice**: Reuse prune-deleted history (`Removed managed account missing reference: {key}`) unless tests already distinguish; do not add a new INFO-per-account line.
- **Reason**: Same operator-visible outcome (link gone). Correlated-sweep already avoided per-account INFO for skip-linked.
- **Considered alternatives**: Distinct history string — nicer for support, extra spec surface; defer unless verify wants it.

### D6: Ownership helper placement

- **Choice**: Small helper used by FusionLayers (on FusionRun or beside `isManagedAccountLinkedInFusion`) that answers “foreign-owned relative to this Fusion account’s identity id.” Must be O(1) or O(linked keys), not O(all Fusion accounts × keys).
- **Reason**: Refresh visits every Fusion account; a full scan per leftover key would regress quiet tenants.
- **Considered alternatives**: Reuse `isManagedAccountLinkedInFusion` as-is — true for _this_ account’s own persisted keys, so it cannot distinguish self vs other without an exclude id.

## Risks / Trade-offs

[Risk] Refresh order: owner processed after this identity → queue still has the Account, we drop without claim, owner identity-matches later. -> Mitigation: D3.

[Risk] Refresh order: owner processed first → Account claimed, inventory `identityId` still set; we drop ghost link. -> Mitigation: D1 uses inventory `identityId` / other identity’s key sets, not queue presence.

[Risk] `hasFusionIdentity` false for an out-of-scope identity that still has a persisted Fusion account not loaded this run. -> Mitigation: Accepted; without a loaded Fusion identity we cannot prove ownership. Uncorrelated re-absorb may apply; next full-scope run corrects.

[Risk] Helper accidentally treats this identity as foreign. -> Mitigation: Compare identity ids; identity matcher runs first.

[Trade-off] NonMatched Fusion accounts listing the same key do not force a drop. -> Reason for acceptance: user and UL say Fusion identity, not every Fusion account.

[Trade-off] Shared prune-deleted history wording. -> Reason for acceptance: outcome is gone; optional distinct message later.

## Migration Plan

N/A — This change does not involve deployment changes. The next Fusion aggregation drops stale previous/missing links. No config migration.

## Open Questions

None.
