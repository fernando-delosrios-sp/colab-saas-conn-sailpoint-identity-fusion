## Scope

In: During Refresh `addManagedAccountLayer`, when a Fusion account looks up previous-run and missing (uncorrelated) managed account keys, if any of those keys already belong to a **different Fusion identity**, drop this Fusion account’s link and treat the managed account as gone (same bookkeeping as prune-deleted), without claiming it from the work queue. Out: Identity-matched absorb for **this** Fusion identity; prune-deleted for keys absent from managed-account inventory; correlated-sweep skip-linked; Match scoring and uncorrelated-sweep claim of already-linked keys.

## Language

**Foreign-owned managed account** (`promote`):
A managed source account whose current ISC `identityId` is a different loaded **Fusion identity** than the Fusion account currently under Refresh. A Fusion listing does not establish ownership by itself.
_Avoid_: stolen account, duplicate link, gone account (gone is prune-deleted for inventory absence)

**Uncorrelated previous-run lookup** (`draft` — describe in spec, do not promote):
The Refresh path that resolves `previousAccountIds` and `missingAccountIds` that identity matching did not claim, today marking them uncorrelated and absorbing them from the work queue.
_Avoid_: uncorrelated sweep (that is Process Match)

**Fusion identity** (`conflicts-with-canonical` — reuse):
A Fusion account correlated to an ISC identity. Ownership checks use this term, not every Fusion account (NonMatched / provisional rows are not Fusion identities).
_Avoid_: Fusion row, correlated Fusion account

**Prune-deleted** (`conflicts-with-canonical` — reuse for bookkeeping, not detection):
Removing a tracked managed account key because it is gone. This change uses the same removal (accounts, missing-accounts, previous keys, `managedAccountInfo`, history, `needsRefresh`) when the key is foreign-owned even though inventory still has it.
_Avoid_: unlink, detach, steal

## Decisions

Context: `processPreviousRunMatchedAccounts` re-absorbs leftover previous/missing keys still on the work queue and marks them uncorrelated. It does not check whether the managed account now belongs to another Fusion identity. If the other identity already claimed the key, prune-deleted keeps the stale link because `managedAccountInventory` still lists it (by design: inventory is not the work queue). Two orderings both fail exclusive ownership: this identity processes first and steals the account as uncorrelated; the other identity processes first and this identity keeps a ghost link.

Q1: Detect by inventory absence vs Fusion identity ownership?
Chosen: **Fusion identity ownership.** Inventory presence means the managed account still exists on the source; another Fusion identity owning it must not keep this identity’s link.

Q2: What counts as “part of another Fusion identity”?
Chosen: **Current managed-account ISC `identityId`.** If that `identityId` matches a loaded Fusion identity **other than** the current Fusion account, the leftover previous/missing link is foreign-owned. The identity that currently holds the account blends it; the identity that only has it as missing treats it as gone. A Fusion listing does not override an unset or matching `identityId`. A different `identityId` with **no** loaded Fusion identity is not foreign-owned (keep today’s uncorrelated re-absorb).

Q3: Claim from the work queue when dropping?
Chosen: **Do not claim.** Leave the account on the queue so the owning Fusion identity can identity-match it. If it is already claimed, only drop the local link.

Q4: Same removal as prune-deleted?
Chosen: **Yes** — remove from accounts, missing-accounts, previous keys, and `managedAccountInfo`; history; `needsRefresh` true. Treat as gone for this Fusion account. Live-source materialization for remaining keys follows the prune-deleted rule (dropping a contributing account is a blend change).

Q5: Identity-matched accounts for this identity?
Chosen: **Unchanged.** `processIdentityMatchedAccounts` still absorbs keys for this `identityId`. Foreign-owned handling applies only to the previous/missing uncorrelated lookup.

## Open questions

None blocking. Assumption: `ManagedAccountInfo.identityId` on inventory is enough to detect foreign ownership when the Account is already claimed. Assumption: NonMatched Fusion accounts that happen to list the same key are not “another Fusion identity”; they do not by themselves force a drop (identityId / Fusion identity map is the source of truth).

## Scenarios discussed

- Previous/missing key still on the queue; `identityId` is another loaded Fusion identity → do not absorb, do not claim, drop local link, `needsRefresh` true.
- Previous/missing key already claimed by the other Fusion identity; inventory still has it → drop local link (prune-deleted would have kept it).
- Previous/missing key on the queue; `identityId` unset or an identity with no Fusion identity → absorb as uncorrelated as today.
- Key is this Fusion identity’s `identityId` → identity matcher claims it; previous-run path does not drop it.
- Key absent from inventory → existing prune-deleted only.
- Remaining live sibling on this Fusion account after a foreign-owned drop → materialize live sources (same as prune-deleted).
