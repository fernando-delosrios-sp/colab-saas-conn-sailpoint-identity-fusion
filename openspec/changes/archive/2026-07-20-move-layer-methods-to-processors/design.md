## Context

`FusionAccountBase` (`src/model/fusionAccountBase.ts`) is the core domain model with ~70 methods. Four are "layer methods" — thin pass-throughs to free functions in `src/model/fusionAccountRules/layerRules.ts`:

```typescript
public addIdentityLayer(identity: IdentityDocument): void {
    addIdentityLayer(this.state, identity)
}
public addManagedAccountLayer(workQueue, allAccountsById, options): void {
    addManagedAccountLayer(this.state, workQueue, allAccountsById, options)
}
public addFusionDecisionLayer(decision: FusionDecision): void {
    addFusionDecisionLayer(this.state, decision)
}
public addFusionMatch(fusionMatch: FusionMatch): void {
    addFusionMatch(this.state, fusionMatch)
}
```

These exist because `this.state` is `protected readonly`. The free functions take `FusionAccountState` as first arg. Without the thin wrappers, processors could call `addManagedAccountLayer(fusionAccount.state, ...)` directly — but they can't reach `state`.

The 2026-07-17 "split-fusion-account-data-rules-seam" refactor already extracted all implementation logic into free functions. The thin wrappers are the only remaining artifact — they serve as access-control bridges, not behavioral encapsulation.

The active change `encapsulate-fusionrun-state` is moving raw Map access into FusionRun methods. This change is complementary — both push coordination logic toward the service layer where the context already lives.

### Current call sites

| Free function | Callers (service layer) |
|---|---|
| `addManagedAccountLayer` | DecisionProcessor, IdentityProcessor, FusionService.processFusionAccount |
| `addIdentityLayer` | DecisionProcessor, IdentityProcessor, FusionService.processFusionAccount |
| `addFusionDecisionLayer` | DecisionProcessor, FusionService.processFusionAccount |
| `addFusionMatch` | MatchingService |

## Goals / Non-Goals

**Goals:**
- Remove the 4 thin-wrapper layer methods from `FusionAccountBase`
- Expose `state` (or equivalent access) so processors can call free functions directly
- Update all call sites to import from `layerRules.ts` and pass `fusionAccount.state`
- Keep `FusionAccountBase` test suite passing with equivalent free-function-based tests

**Non-Goals:**
- Rename or restructure `FusionAccountState` contents
- Change method signatures of the free functions
- Remove `FusionAccountBase` entirely (the other ~66 methods are fine where they are)
- Address `setManagedAccount` (it's called internally by `addManagedAccountLayer`, not from the service layer)

## Decisions

### D1: `public readonly state` vs `getState()` method

- **Choice**: `public readonly state: FusionAccountState`
- **Reason**: `FusionAccountState` is already a plain data class with no invariants — there's nothing to protect. A getter would be ceremony without purpose. `readonly` prevents reassignment while allowing mutation (mutation is already the pattern via free functions). Plus `fusionAccount.state` reads more naturally than `fusionAccount.getState()`.
- **Alternatives considered**:
  - `getState()` method: Adds ceremony, no real protection. Rejected.
  - Keep `protected` + add a public `get state()` getter: Equivalent to `public readonly` but more characters. Rejected.
  - Make individual free functions static methods on FusionAccountState: Over-engineering, pollutes the data class. Rejected.

### D2: What to delete from FusionAccountBase

- **Choice**: Remove only the 4 layer methods and their imports from `layerRules.ts`. Leave everything else intact.
- **Reason**: The other ~66 methods are genuine model operations (getters, setters, status management, review management) that operate on state the model owns. The 4 layer methods are the only ones that accept external service-layer context.
- **Alternatives considered**:
  - Delete all pass-through methods (~20): Too aggressive, would break valid model operations. Rejected.
  - Convert to static: No advantage, same number of indirections. Rejected.

### D3: Import strategy for callers

- **Choice**: Each processor imports what it needs directly from `layerRules.ts`. DecisionProcessor imports all 4; IdentityProcessor imports `addManagedAccountLayer` + `addIdentityLayer`; FusionService imports all 4; MatchingService imports `addFusionMatch`.
- **Reason**: Tree-shakeable. No indirection. Each caller only sees the functions it uses. Consistent with the existing pattern where `FusionAccountBase` already imports from `layerRules.ts`.
- **Alternatives considered**:
  - Barrel re-export from `fusionAccount.ts`: Adds an import hop without benefit. Rejected.
  - Import through a service: Over-engineering for 4 function calls. Rejected.

## Risks / Trade-offs

- **[Risk] `state` goes public — any code can reach into FusionAccountState and mutate it directly.** → Mitigation: This was already possible indirectly through the thin wrappers. The existing ~70 methods already provide broad mutation access. The architectural contract is that free functions in `fusionAccountRules/*` are the sanctioned mutators; making `state` public doesn't change this contract, it just removes the indirection.

- **[Risk] Test changes could be invasive.** → Mitigation: `fusionAccount.test.ts` already imports from `layerRules.ts` (confirmed by the compose output showing `fusionAccountMatcher.ts` imports from `layerRules.ts`). The test change is mechanical: `acc.addManagedAccountLayer(run)` → `addManagedAccountLayer(acc.state, run)`.

- **[Trade-off] `state` visibility means model consumers can bypass FusionAccountBase methods entirely.** → Accepted: `FusionAccountBase` is a convenience layer, not a security boundary. Callers already bypass it via the thin wrappers. Making `state` public makes this explicit and honest.

- **[Trade-off] Deleting methods changes the public API of FusionAccountBase.** → Accepted: The methods were not part of a published API — they're internal to the connector. External consumers (connector operations) never interact with FusionAccountBase directly.

## Migration Plan

1. Change `protected readonly state` to `public readonly state` in `fusionAccountBase.ts`
2. Delete the 4 layer methods and their `layerRules.ts` imports from `fusionAccountBase.ts`
3. Add `layerRules.ts` imports to DecisionProcessor, IdentityProcessor, FusionService, MatchingService
4. Update call sites: `fusionAccount.addManagedAccountLayer(...)` → `addManagedAccountLayer(fusionAccount.state, ...)`
5. Update test files similarly
6. Run `npm test` + `npm run lint`
7. No deployment changes — internal refactor only. Rollback: revert the commit.

## Open Questions

- Should this be sequenced after or concurrently with `encapsulate-fusionrun-state`? Both touch DecisionProcessor and IdentityProcessor imports, but at different call sites. Concurrent is feasible with good merge discipline.
