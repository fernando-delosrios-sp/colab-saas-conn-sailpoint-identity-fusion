# Proposal: Encapsulate FusionRun State Mutations

## Why

FusionRun was introduced as a centralized state container, but it's anemic — 15+ mutable Maps/Sets/Arrays are exposed as public fields and mutated directly by 6+ different services. This scatters collection-management logic across callers, creates duplication (e.g., `getFusionIdentity` exists in both `fusionService.ts` and `fusionAccountRepository.ts`), and makes it impossible to change the internal storage topology without touching every caller.

The `FusionAccountRepository` was created as a partial wrapper but is inconsistently used — `identityProcessor.ts` bypasses it entirely, and `fusionService.ts` duplicates its methods. This adds confusion without solving the encapsulation problem.

The clearest symptom is in `identityProcessor.ts:95-104` — a "remove this FusionAccount from whichever Map it's in" operation implemented as raw map iteration in a processor that should not know there are two maps:

```typescript
if (this.run.fusionAccountMap.get(existingAccount.managedKey) === existingAccount) {
    this.run.fusionAccountMap.delete(existingAccount.managedKey)
} else {
    for (const [staleId, fa] of this.run.fusionIdentityMap.entries()) {
        if (fa === existingAccount) {
            this.run.fusionIdentityMap.delete(staleId)
            break
        }
    }
}
```

## What Changes

1. **Add domain methods to FusionRun** — encapsulate all collection mutations behind named methods. Processors and services interact with FusionRun through a "tell, don't ask" API instead of raw Map/Set operations.

2. **Move processor logic into FusionRun** — `findFusionAccountByIdentityManagedAccounts` (currently a private method on `identityProcessor`) moves into FusionRun as `findFusionAccountForIdentity`. FusionRun owns the knowledge of how its collections are structured.

3. **Absorb FusionAccountRepository** — its fusion account CRUD methods (`setFusionAccount`, `getFusionIdentity`, etc.) become FusionRun methods. Its reviewer state (`reviewersBySourceId`, `sourcesWithoutReviewers`) moves to FusionRun. Conflict tracking logic moves to FusionRun.

4. **Eliminate duplicate methods in fusionService.ts** — `getFusionIdentity` and `getFusionAccountByManagedKey` wrappers are removed in favor of FusionRun methods.

## Capabilities

### Modified Capabilities
- **fusion-run** — expanded from passive state holder to active domain object with encapsulated mutation methods; absorbs FusionAccountRepository
- **identity-processor** — simplified: delegates map searches and account registration to FusionRun
- **fusion-service** — simplified: delegates fusion account lookup to FusionRun methods instead of wrapping them
- **identity-service** — simplified: uses `addIdentity`/`removeIdentity`/`clearIdentities` instead of raw Map operations
- **form-service** — simplified: uses `addDecision`/`clearDecisions`/`addReviewUrl*` instead of raw array/Map operations
- **match-service** — simplified: uses `markAutoAssigned` instead of raw Set operations

### Deleted Capabilities
- **fusion-account-repository** — absorbed into FusionRun

## Impact

- **Code**: ~150 lines of raw Map manipulation replaced with ~200 lines of encapsulated methods on FusionRun. Net ~50 line increase in FusionRun, offset by ~100 line reduction across callers. FusionAccountRepository (~120 lines) deleted.
- **Tests**: FusionRun tests expanded. Existing tests updated to use methods instead of raw map access. No behavioral change.
- **API**: No breaking changes to config schema or connector operations. Internal-only refactor.
