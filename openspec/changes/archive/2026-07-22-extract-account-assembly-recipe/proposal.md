# Proposal: One account-assembly recipe behind the processors

## Why

`AccountAssembly` was extracted into `src/services/accountAssembly/` and is shared by `FusionService`, `IdentityProcessor`, `DecisionProcessor`, and `MatchOutcomeDispatcher`. However, two methods remain duplicated across the callers despite the shared collaborator already owning the canonical implementation:

- `isAggregationAccountListMode()` — 3 copies: `FusionService` (L202), `DecisionProcessor` (L39), `MatchOutcomeDispatcher` (L238)
- `shouldPruneDeletedManagedAccounts()` — 1 copy: `FusionService` (L1063)

All copies are identical to the private versions already in `AccountAssembly`. Any change to the mode-gate logic requires coordinated edits in 3–4 files. Two of the three callers (`DecisionProcessor`, `MatchOutcomeDispatcher`) hold their own state copy (`commandType`, `operationContext`) solely to power this duplicated method.

### Before / After

```
Before: same method cloned per processor
 fusionService.ts      decisionProcessor   matchOutcomeDispatcher
 ├ isAggregation..()   ├ isAggregation..() ├ isAggregation..()   ← 3 copies
 └ shouldPrune..()     │                   │                     ← 1 copy

After: one canonical source via AccountAssembly
 ┌────────────────────────────────────────────────────┐
 │ AccountAssembly (deep)                             │
 │  isAggregationAccountListMode()  ← public          │
 │  shouldPruneDeletedManagedAccounts() ← public     │
 └────────────────────────────────────────────────────│
   FusionService        DecisionProcessor  MatchOutcomeDispatcher
   └ deps.accountAssembly.method()         ← one source
```

## What Changes

1. **Expose mode gates as public on AccountAssembly** — `isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` become `public` (currently `private`).
2. **Remove duplicated copies from FusionService** — replace `this.isAggregationAccountListMode()` and `this.shouldPruneDeletedManagedAccounts()` with delegates to `this.accountAssembly`.
3. **Remove duplicated copy from DecisionProcessor** — replace `this.isAggregationAccountListMode()` with `this.deps.accountAssembly.isAggregationAccountListMode()`.
4. **Remove duplicated copy from MatchOutcomeDispatcher** — replace `this.isAggregationAccountListMode()` with `this.deps.accountAssembly.isAggregationAccountListMode()`.

## Capabilities

### Modified Capabilities

- **fusion-service** — Mode-gate methods removed; calls delegate to AccountAssembly. No behavioral change.
- **matching-service** — `MatchOutcomeDispatcher.isAggregationAccountListMode()` removed; delegates to injected AccountAssembly.

### No New Capabilities

This is a pure de-duplication refactor. No new capabilities are introduced.

## Impact

- **Modified files**: `src/services/accountAssembly/accountAssembly.ts` (2 methods: private → public), `src/services/fusionService/fusionService.ts` (2 methods removed, 4 call sites updated), `src/services/fusionService/decisionProcessor.ts` (1 method removed, 1 call site updated), `src/services/matchingService/matchOutcomeDispatcher.ts` (1 method removed, 1 call site updated)
- **Net line count**: ~35 lines deleted, ~10 lines modified → **~25 lines net reduction**
- **Public API**: Breaking changes to `AccountAssembly` method visibility (private → public); no changes to external connector API
- **Verification gates**: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`
