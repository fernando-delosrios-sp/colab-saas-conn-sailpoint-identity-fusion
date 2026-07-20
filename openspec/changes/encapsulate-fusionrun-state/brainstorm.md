<!--
Raw capture of superpowers:brainstorming output.
design.md extracts and reorganizes this content into structured sections.
-->

# Brainstorm: Encapsulate FusionRun State Mutations

## Background

FusionRun was introduced as a centralized state container to break the god-class FusionService problem. It succeeded at gathering all run-scoped state into one place, but stopped at the struct level — 15+ mutable Maps/Sets/Arrays exposed as public fields, mutated directly by 6+ different services.

A `FusionAccountRepository` was later added as a partial wrapper, but it's inconsistently used (bypassed by identityProcessor, duplicated by fusionService), adding confusion without solving the encapsulation problem.

## Decision Chain

### Q1: Is FusionRun too anemic?

**Symptom:** `identityProcessor.ts:95-104` — a "remove this FusionAccount from whichever Map it's in" operation implemented as raw map iteration in a processor that should not know there are two maps.

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

**Decision:** Yes. FusionRun is a data bag, not a domain object. External callers know too much about internal storage topology.

### Q2: Where should the methods live?

**Option A — FusionRun directly:** Add domain methods to FusionRun. Co-locates state and behavior. Eliminates the repository wrapper.
**Option B — FusionAccountRepository with enforcement:** Make FusionRun fields truly private, force all access through repo. Bigger refactor.

**Decision: Option A.** FusionRun already has `WorkQueue` methods. It's the natural owner of its data. The repository becomes redundant and is absorbed.

### Q3: How deep — just methods, or also move processor logic?

**Option A — Just methods:** Add get/set/remove methods. Processors still know about two maps but use methods.
**Option B — Move processor logic too:** `findFusionAccountByIdentityManagedAccounts` moves into FusionRun. Processors express intent, not mechanism.

**Decision: Option B.** FusionRun owns the knowledge of how its collections are structured. Queries over those collections belong on FusionRun.

### Q4: What about conflict tracking's LogService dependency?

The existing `FusionRun` spec says: "SHALL NOT contain business logic, service dependencies, or side-effecting operations." But `registerFusionAccount` (absorbed from repo) uses LogService for conflict warnings.

**Options:**
- Accept LogService, update spec — collection validation != business logic
- Keep conflict tracking separate — simple map writes only
- Callback pattern — no service dependency

**Decision: Accept LogService.** Spec updated from "pure data container" to "domain object with validation." Conflict detection is state-integrity checking, not business orchestration.

## Design Trade-offs

| Trade-off | Choice | Why |
|-----------|--------|-----|
| FusionRun size | Grows ~170→350 lines | Methods are thin (1-5 lines). Class stays focused on state management |
| Repository class | Deleted | Absorbed into FusionRun. No need for wrapper when FusionRun IS the repository |
| Field visibility | TypeScript `private` | True `#private` breaks tests. Convention + compiler enforcement is sufficient |
| Infrastructure fields | Remain public | Set once at init. Adding getters/setters would be ceremony |
| Caller impact | ~100 lines removed across callers | Each caller loses 5-15 lines of Map manipulation, replaced by 1-3 method calls |

## Callers Mapped

| Caller | Before | After |
|--------|--------|-------|
| identityProcessor | Raw map surgery, custom iteration | hasFusionIdentity, findFusionAccountForIdentity, removeFusionAccount, registerFusionAccount |
| fusionService | Duplicate wrappers + raw assignments | Direct FusionRun method calls |
| identityService | Raw map clear/set/delete + protected dance | clearIdentities, addIdentity, removeIdentity |
| formService | Raw array push/assign + Map get/set | addDecision, clearDecisions, addReviewUrl* |
| managedAccountOutcomeHandler | Raw Set.add | markAutoAssigned |
| decisionProcessor | Raw Map.get | getFusionIdentity |
| FusionAccountRepository | Deleted | Absorbed |
