# Brainstorm: Hydrate correlated orphan identities

## Background

The `hydrate-correlated-identity-aliases` change added `hydrateCorrelatedManagedAccountIdentities` at the end of **fetchPhase**. It collects every `identityId` from all fetched managed accounts and calls `hydrateMissingIdentitiesById`, then tries to apply `addIdentityLayer` on registered `FusionAccount` objects.

Two problems surfaced in review:

1. **Wrong timing** — At fetch time `_fusionAccountMap` is empty; fusion accounts are built in `refreshPhase` (`processFusionAccounts`). The apply loop is effectively a no-op.
2. **Wrong scope** — Hydration runs for *all* correlated managed accounts, including those already linked to existing Fusion rows. Those accounts do not need out-of-scope identity hydration for the display-attribute override: existing Fusion accounts are guarded by `isExistingFusionAccount` and keep their persisted display value unless `needsReset`.

## Purpose (narrowed)

The **identity alias** (`IdentityDocument.displayName`) is consumed by `DefinitionService.applyDisplayAttributeOverride`, which writes `fusionAccount.identityAlias` to the Fusion display attribute. That override applies when:

- `fusionAccount.isIdentity` is true (requires `addIdentityLayer`), and
- The account is **not** treated as an existing Fusion account (new accounts from managed sources).

The only path that needs out-of-scope hydration is therefore:

> **New Fusion accounts created from correlated managed accounts that are not linked to any loaded Fusion row** — the correlated **orphans** handled in the correlated account sweep (`account.uncorrelated === false` but absent from every loaded Fusion row's account keys).

Existing fusion rows refreshed in `processFusionAccounts`, and managed accounts merely blended into them, do not need this pass.

## Decision chain

### Q1: What is the exact hydration scope?

**Choice:** Only correlated managed accounts still on the work queue **after refresh** that will produce a **new** Fusion account in the correlated sweep (orphans).

**Reason:** Display-attribute override with identity alias applies to new managed-origin Fusion accounts, not to existing persisted Fusion rows.

**Rejected:** All fetched correlated managed accounts (current implementation) — over-hydrates and runs before Fusion accounts exist.

**Rejected:** All fusion account `identityId`s after refresh — includes identity-origin and existing rows outside the alias-override need.

### Q2: When should hydration run?

**Choice:** In **processPhase**, immediately **before the correlated account sweep**, after `initializeManagedAccountProcessing()` (linked-account index is built; refresh has claimed linked accounts off the queue).

**Reason:** Matches spec intent ("before the managed-account sweep") while ensuring orphan correlated accounts are the only queue entries considered. Fusion accounts for orphans are created during the sweep, so identity fetch must complete before `assembleManagedAccount` / serialization.

**Rejected:** End of fetchPhase — fusion accounts do not exist; scope is too broad.

**Rejected:** End of refreshPhase — still includes linked correlated accounts in queue in edge cases; orphans are only guaranteed isolated after refresh + linked index.

### Q3: Where should `addIdentityLayer` run?

**Choice:** In the correlated orphan branch of `MatchOutcomeDispatcher` (when `account.uncorrelated === false` and not linked in Fusion), immediately after `assembleManagedAccount`, if the hydrated identity is in cache and not protected.

**Reason:** That branch is the single creation site for new Fusion accounts from correlated orphans. Applying the layer there keeps hydration (fetch ids) and application (layer on the new account) co-located with the business event.

**Rejected:** Pre-sweep apply loop over `_fusionAccountMap` — orphans are not registered yet.

### Q4: How to collect identity ids for hydration?

**Choice:** Iterate `managedAccountsById` and collect distinct `identityId` values where `account.uncorrelated === false`.

**Reason:** After refresh, linked correlated accounts are claimed off the queue. Remaining correlated entries are orphans by definition.

**Rejected:** Full fetch snapshot — would re-include linked accounts before refresh depletes the queue if run too early.

### Q5: What happens to the existing helper?

**Choice:** Rename/refocus to `hydrateCorrelatedOrphanIdentities` (or keep name with narrowed contract), remove call from `fetchPhase`, add call before correlated sweep, slim apply logic to the dispatcher path.

## Approaches considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. Pre-sweep hydrate + apply in dispatcher** (recommended) | Minimal API surface; correct scope and timing | Two touch points (phase + dispatcher) |
| B. Inline hydrate in dispatcher per account | Simplest call graph | N+1 batching unless deduped; duplicates chunk logic |
| C. Extend `assembleManagedAccount` to always layer identity | One assembly seam | Couples assembly to identity cache; runs for non-orphan paths too |

**Recommendation:** Approach A.

## Design trade-offs

- **Smaller hydration footprint** — Only orphan correlated identities fetched; no API cost for linked correlated accounts.
- **Spec correction** — The archived requirement "each fetched managed source account" was broader than the display-override purpose; delta spec narrows to orphan-derived Fusion accounts.
- **Identity cache timing** — Hydration runs before `identities.clear()` in processPhase, so cache remains available through correlated sweep and output.

## Agreed direction

Remove fetch-phase hydration. Before correlated sweep, hydrate distinct `identityId`s from correlated orphan queue entries. Apply identity layer when the correlated sweep creates each new Fusion account from such a managed account, enabling `identityAlias` on first `getISCAccount` serialization.
