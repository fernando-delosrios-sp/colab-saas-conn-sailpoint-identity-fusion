## Context

Identity Fusion writes the Fusion display attribute from `fusionAccount.identityAlias` (SDK `IdentityDocument.displayName`) via `DefinitionService.applyDisplayAttributeOverride`. That override runs when `fusionAccount.isIdentity` is true and the account is not treated as an existing persisted Fusion row.

Correlated **orphan** managed accounts — correlated on the managed source (`uncorrelated === false`) but absent from every account key on loaded Fusion rows — are assembled into **new** Fusion accounts during the correlated account sweep. Without hydrating their correlated identity (often outside `identityScopeQuery`), `addIdentityLayer` never runs and the display attribute falls back to the source account name instead of the identity alias.

The prior change placed hydration at fetchPhase over all correlated managed accounts. After refresh, linked correlated accounts are claimed off the work queue; only orphans remain correlated on the queue. Hydration must align with that depletion model.

## Goals / Non-Goals

**Goals:**

- Hydrate out-of-scope identities only for correlated orphan managed accounts before the correlated sweep.
- Apply the identity layer when each orphan-derived Fusion account is created so `identityAlias` is set before `getISCAccount`.
- Remove the ineffective fetch-phase hydration pass.
- Correct the fusion-run spec to match the display-override purpose.

**Non-Goals:**

- Hydrating identities for managed accounts already linked to existing Fusion rows.
- Hydrating identities for existing Fusion accounts refreshed in `processFusionAccounts`.
- Hydrating identities for uncorrelated managed accounts (uncorrelated sweep / match scoring).
- Widening `identityScopeQuery` or adding new configuration.
- Changing identity-origin Fusion account behavior.

## Decisions

### D1: Scope = correlated orphans on the post-refresh work queue

- **Choice:** Collect distinct `identityId` values from `managedAccountsById` entries where `account.uncorrelated === false`, evaluated after refresh and before the correlated sweep.
- **Reason:** Refresh claims linked correlated accounts via `addManagedAccountLayer`. Remaining correlated queue entries are orphans that become new Fusion accounts — the only path needing alias override from out-of-scope hydration.
- **Considered alternatives:**
  - All fetched correlated accounts — rejected; includes linked accounts whose Fusion row already owns display semantics.
  - Fusion account `identityId` scan after refresh — rejected; pulls in existing rows outside scope.

### D2: Timing = processPhase, before correlated sweep

- **Choice:** Call hydration after `initializeManagedAccountProcessing()` and immediately before `processCorrelatedManagedAccounts()`.
- **Reason:** Satisfies "before managed-account sweep"; linked-account index is ready; queue reflects post-refresh state; runs before `identities.clear()`.
- **Considered alternatives:**
  - fetchPhase — rejected; queue not depleted; fusion accounts absent.
  - Inline per-account in dispatcher — rejected; loses batch deduplication and 50-id chunking.

### D3: Apply identity layer in MatchOutcomeDispatcher orphan branch

- **Choice:** After `assembleManagedAccount(account)` when handling `account.uncorrelated === false` and not linked in Fusion, call `addIdentityLayer` if identity is in cache and not protected.
- **Reason:** Single creation site for orphan-derived Fusion accounts; layer must exist before attribute processing serializes via `getISCAccount`.
- **Considered alternatives:**
  - Pre-sweep loop over `_fusionAccountMap` — rejected; orphans not registered yet.
  - Inside `assembleManagedAccount` unconditionally — rejected; also used for uncorrelated paths that should not layer identity.

### D4: Keep `hydrateMissingIdentitiesById` for batch fetch

- **Choice:** Reuse `IdentityService.hydrateMissingIdentitiesById` with 50-id chunks; helper only collects ids and invokes the service.
- **Reason:** Existing batching, deduplication, and error isolation; no new API surface.
- **Considered alternatives:** New fetch method — rejected; unnecessary duplication.

### D5: Rename helper for clarity (optional)

- **Choice:** Rename exported helper to `hydrateCorrelatedOrphanIdentities` (or keep name with updated JSDoc). Export path via `accountList.ts` updated if renamed.
- **Reason:** Name reflects narrowed contract.
- **Considered alternatives:** Keep misleading name — rejected for maintainability.

## Risks / Trade-offs

- [Risk] Orphan misclassified if refresh fails to claim a linked account → orphan hydration applies incorrectly. → Mitigation: correlated sweep already uses `linkedAccountKeyIndex`; orphan branch only runs when not linked.
- [Risk] `identities.clear()` runs later in processPhase after correlated sweep — hydrated orphans remain in cache until clear, which is acceptable; layer data is copied onto `FusionAccount`.
- [Trade-off] Existing Fusion rows correlated outside scope still show persisted display name, not alias — accepted; `isExistingFusionAccount` guard is intentional.
- [Trade-off] Narrower scope means linked correlated accounts never get out-of-scope hydration — accepted; they do not need alias override on new account creation.

## Migration Plan

N/A — behavior correction within the same connector version line. No configuration migration. Tenants with correlated orphan managed accounts whose identity is outside scope will see the correct identity alias on the Fusion display attribute after upgrade (fix, not regression for existing persisted rows).

## Open Questions

- None — scope and placement confirmed by product intent (identity alias for new orphan-derived Fusion accounts only).
