# Design: Encapsulate FusionRun State Mutations

## Context

FusionRun was designed as a centralized state container (see `2026-07-20-extract-map-define-match-services`), but its design stopped at "gather all the Maps in one place." It's a struct with public fields — no encapsulation, no invariants, no domain methods beyond the `WorkQueue` interface.

The `FusionAccountRepository` was introduced later as a partial abstraction layer for fusion account CRUD. However:
- `identityProcessor.ts` bypasses it entirely (direct Map manipulation)
- `fusionService.ts` has duplicate `getFusionIdentity` and `getFusionAccountByManagedKey` methods that do the same Map lookups
- The repository adds an indirection without solving the encapsulation problem

This design completes the FusionRun extraction by turning it from a passive data bag into an active domain object.

## Goals / Non-Goals

**Goals:**
- All collection mutations go through named methods on FusionRun
- Callers no longer know about FusionRun's internal storage topology (one map vs two maps)
- `FusionAccountRepository` is absorbed into FusionRun
- Zero behavioral changes — all tests pass with the same expectations
- Backward compatible: existing public fields become `private` where possible, or remain accessible only through methods

**Non-Goals:**
- Changing the WorkQueue interface
- Changing the snapshot/restore serialization format
- Adding new domain logic beyond what already exists scattered in callers
- Making FusionRun fields truly `#private` (would break tests; use `private` TypeScript keyword and convention instead)

## Decisions

### D1: FusionRun owns all collection-management logic

Every raw Map/Set/Array mutation currently performed by external callers becomes a FusionRun method. The principle: if you need to know WHICH map holds a FusionAccount or HOW it's stored, you're in the wrong class.

**Before (caller knows internal structure):**
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

**After (caller tells FusionRun what it wants):**
```typescript
this.run.removeFusionAccount(existingAccount)
```

**Rationale:** Callers express intent ("remove this account"), not mechanism ("check map A, if not there check map B, delete from whichever"). If the storage topology changes (e.g., single map with a discriminator), only FusionRun changes.

### D2: Absorb FusionAccountRepository, don't delegate

FusionRun gets all methods currently on FusionAccountRepository:
- `registerFusionAccount(fa, tracker?)` — absorbs `setFusionAccount` with conflict tracking
- `getFusionIdentity(id)` / `getFusionAccountByManagedKey(key)` / `hasFusionIdentity(id)`
- `clearCurrentRunState()` — absorbed as individual methods
- Iterators: `allFusionAccounts`, `allFusionIdentities`, `fusionIdentitiesExcluding`
- Reviewer state: `reviewersBySourceId`, `sourcesWithoutReviewers`

The repository class is deleted. FusionService's duplicate `getFusionIdentity` / `getFusionAccountByManagedKey` wrappers are removed; callers use FusionRun methods directly.

**Rationale:** FusionRun IS the repository — it owns the data. Having a separate repository class that wraps FusionRun is an unnecessary abstraction layer. If logging or validation is needed, it can be added to FusionRun methods directly.

### D3: Move `findFusionAccountByIdentityManagedAccounts` into FusionRun

This method currently lives as a private method on `IdentityProcessor` but it's purely a query over FusionRun's internal collections. It iterates `fusionAccountMap` and `fusionIdentityMap` looking for accounts with intersecting managed accounts.

**Rationale:** It's a query over FusionRun's data — it belongs on FusionRun. Moving it eliminates the processor's knowledge that there are two separate maps.

### D4: Identity cache methods on FusionRun

The `identityMap` is currently mutated directly by `identityService.ts`. New methods:
- `addIdentity(id, doc)` — simple set
- `removeIdentity(id)` — simple delete
- `clearIdentities()` — clears the map
- `getIdentity(id)` / `hasIdentity(id)` — reads

The current "protected identity" dance (`set('-')` then `delete('-')`) moves to identityService as a filtering step before calling `addIdentity`.

**Rationale:** Simple encapsulation — the map is FusionRun's, so mutations go through FusionRun.

### D5: Scoring state methods

Currently `autoAssignedIdentityIds` (Set) and `matchScoringMs` (number) are mutated directly:
- `markAutoAssigned(id)` — Set.add
- `isAutoAssigned(id)` — Set.has
- `resetScoringState()` — clears autoAssignedIds + resets matchScoringMs (replaces the scatter of `.clear()` + `= 0` across fusionService.ts)

### D6: Linked account index methods

- `initLinkedAccountIndex()` — `= new Set<string>()`
- `clearLinkedAccountIndex()` — `= undefined`

These replace direct assignment in fusionService.ts.

### D7: Decision tracking methods

- `addDecision(d)` — array.push
- `clearDecisions()` — `= []`

### D8: Review URL tracking methods

The "get ?? [], push, set" pattern repeated across formService.ts becomes:
- `addReviewUrlForReviewer(reviewerId, url)` — handles the three-step pattern
- `addReviewUrlForCandidate(candidateId, url)` — same
- `addPendingCandidateId(id)` — Set.add
- `getReviewerUrls(reviewerId)` / `getCandidateUrls(candidateId)` — reads

### D10: Spec evolution — FusionRun may have LogService

The current `fusion-run` spec states: "FusionRun SHALL NOT contain business logic, service dependencies, or side-effecting operations." This is updated to allow collection-management methods and state-adjacent validation (conflict tracking) that uses LogService. The distinction: business logic orchestrates across services; validation logic checks invariants on the data FusionRun owns.

**Rationale:** `registerFusionAccount` includes conflict detection that warns when two FusionAccounts claim the same identity. This is a state-integrity concern, not business orchestration. It belongs on the object that owns the state. The LogService dependency is a minor evolution from "pure data bag" to "domain object with validation."

### D9: Field visibility

Production fields become `private`:
- `fusionAccountMap`, `fusionIdentityMap`, `identityMap`
- `autoAssignedIdentityIds`, `linkedAccountKeyIndex`
- `fusionIdentityDecisions`, `pendingCandidateIdentityIds`
- `pendingReviewUrlsByReviewerId`, `pendingReviewUrlsByCandidateId`
- `currentRunNonMatchedKeysBySource`

Infrastructure fields (set once at init) remain public:
- `analysisRecorder?`, `tracker?`, `managedAccountsAllById?`
- `managedSources[]`, `sourcesByName`, `fusionBlends[]`
- `phaseTimings[]`, `matchScoringMs`
- `reviewersBySourceId`, `sourcesWithoutReviewers`

Tests access private fields via `(run as any).fieldName` or through the public method API.

**Rationale:** True `#private` would break existing tests that construct FusionRun instances and inspect state. TypeScript `private` + convention is sufficient for production code enforcement (the compiler catches misuse).

## Target API Surface

```
FusionRun
│
├── WorkQueue (unchanged)
│   setManagedAccount, claimAccount, claimAccountsForIdentity,
│   get, getKeysForIdentity, entries, clearWorkQueue
│
├── Fusion Account Registry (was: raw Maps + repo methods)
│   registerFusionAccount(fa, tracker?)
│   removeFusionAccount(fa): boolean
│   getFusionIdentity(id): FusionAccount | undefined
│   getFusionAccountByManagedKey(key): FusionAccount | undefined
│   hasFusionIdentity(id): boolean
│   findFusionAccountForIdentity(identity, sourceNames): FusionAccount | undefined
│   totalFusionAccountCount: number
│   allFusionAccounts: FusionAccount[]
│   allFusionIdentities: Iterable<FusionAccount>
│   *fusionIdentitiesExcluding(excludeIds): Iterable<FusionAccount>
│
├── Identity Cache (was: identityMap raw)
│   addIdentity(id, doc)
│   removeIdentity(id)
│   clearIdentities()
│   getIdentity(id): IdentityDocument | undefined
│   hasIdentity(id): boolean
│
├── Scoring State (was: autoAssignedIds + matchScoringMs raw)
│   markAutoAssigned(identityId)
│   isAutoAssigned(identityId): boolean
│   resetScoringState()
│
├── Linked Account Index (was: linkedAccountKeyIndex raw)
│   initLinkedAccountIndex()
│   clearLinkedAccountIndex()
│
├── Decision Tracking (was: fusionIdentityDecisions raw)
│   addDecision(d)
│   clearDecisions()
│
├── Review URL Tracking (was: pending* Maps/Sets raw)
│   addReviewUrlForReviewer(reviewerId, url)
│   addReviewUrlForCandidate(candidateId, url)
│   addPendingCandidateId(id)
│   getReviewerUrls(reviewerId): string[] | undefined
│   getCandidateUrls(candidateId): string[] | undefined
│
├── Reviewer State (from FusionAccountRepository)
│   reviewersBySourceId: Map<string, Set<FusionAccount>>
│   sourcesWithoutReviewers: Set<string>
│
├── Non-Matched Keys (was: currentRunNonMatchedKeysBySource raw)
│   clearNonMatchedKeys()
│
├── Infrastructure (public fields, set at init)
│   analysisRecorder?, tracker?, managedAccountsAllById?
│   managedSources[], sourcesByName, fusionBlends[]
│   phaseTimings[], matchScoringMs
│
└── Serialization (unchanged)
    snapshot(), restore()
```

## Caller Impact Summary

| Caller | Before | After |
|--------|--------|-------|
| `identityProcessor.ts` | Raw map `.get/.has/.set/.delete`, custom map-iteration logic | `hasFusionIdentity`, `findFusionAccountForIdentity`, `removeFusionAccount`, `registerFusionAccount` |
| `fusionService.ts` | Duplicate wrapper methods + raw field assignments | `resetScoringState`, `initLinkedAccountIndex`, `clearLinkedAccountIndex`, direct FusionRun method calls |
| `identityService.ts` | Raw `identityMap.clear/set/delete` + protected identity dance | `clearIdentities`, `addIdentity`, `removeIdentity`, `getIdentity` |
| `formService.ts` | Raw array push/assign + Map get/set + Set add | `addDecision`, `clearDecisions`, `addReviewUrlForReviewer`, `addReviewUrlForCandidate`, `addPendingCandidateId` |
| `managedAccountOutcomeHandler.ts` | Raw `autoAssignedIdentityIds.add` | `markAutoAssigned` |
| `decisionProcessor.ts` | Raw `fusionIdentityMap.get` | `getFusionIdentity` |
| `fusionAccountRepository.ts` | **Deleted** | Methods absorbed into FusionRun |

## Risks / Trade-offs

[R1] FusionRun grows from ~170 to ~350 lines → Mitigation: Methods are thin wrappers (~1-5 lines each). The class stays focused on state management. If it grows further, group methods into mixin-like region interfaces.

[R2] `findFusionAccountForIdentity` depends on `buildManagedAccountKey` and `readString` utilities → Mitigation: These are already imported in `identityProcessor.ts`. The import moves to `fusionRun.ts`. No new dependencies.

[R3] Conflict tracking (`trackConflictingFusionIdentity`) depends on `LogService` → Decision: **Accept LogService dependency.** The existing spec forbids service dependencies, but collection-management with validation is distinct from business logic. The spec is updated to allow state-adjacent validation (see D10).

[R4] Reviewer state (`reviewersBySourceId`, `sourcesWithoutReviewers`) has its own mutation patterns in callers → Mitigation: These remain public readonly Maps for now. They're infrastructure state set up during initialization, not frequently mutated during processing. If they later need encapsulation, that's a separate change.

[R5] Test access to now-private fields → Mitigation: Tests already use `(service as any).run.fieldName` patterns. Continue using `as any` for test access, or better, test through the public method API where possible.

## Migration Plan

1. Add all new methods to FusionRun (fields still public — methods coexist with raw access)
2. Update callers one by one to use methods instead of raw access
3. Make fields `private` once all callers migrate
4. Delete FusionAccountRepository
5. Update FusionRun tests
6. All tests pass at each step
