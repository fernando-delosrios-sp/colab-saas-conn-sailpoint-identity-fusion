
# Brainstorming: Split FusionAccount Along the Data/Rules Seam

## Background

`FusionAccount` is a 1,694-line god-class in `src/model/fusionAccount.ts`. It contains:

- **41 private fields** covering identity info, state flags, collections (7 sets), promises, maps, attribute bags, timestamps, and config
- **4 factory methods** (`fromFusionAccount`, `fromIdentity`, `fromManagedAccount`, `fromFusionDecision`)
- **3 layer methods** (`addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`)
- **~30 mutators** (status/action/review/correlation/collection/history methods)
- **~15 accessors** (getters that return state)
- **Serialization** (`toISCAccount`, `syncCollectionAttributesToBag`)
- **Private helpers** (`initializeCoreState`, `initializeSources`, `addToSet`, `removeFromSet`, etc.)

Reading and maintaining this file requires holding ~1700 lines of state and behavior in your head. The coupling between state and behavior makes it hard to:
- Understand what state a method touches
- Add new behavior without accidentally mutating state
- Write focused tests for individual behaviors
- Refactor any one concern without breaking others

## Clarifying Questions & Decisions

### Q1: What's the primary goal?

**A:** Decompose the god-class so readers can reason about state separately from behavior. No public API changes, no behavior changes.

### Q2: How to decompose — what seam do we split on?

Options considered:

| Approach | Pros | Cons |
|----------|------|------|
| **A. Split by feature/use-case** (e.g., construction vs. layer vs. correlation) | Maps to user-facing operations | Methods in different modules still mutate the same state; need to pass state around or keep it on FusionAccount |
| **B. Split data/state from behavior/rules** (the "data/rules seam") | Clean separation of concerns; state is inert, rules are pure functions on state; easy to test rules independently | Requires discipline to avoid adding logic back to facade |
| **C. Full decomposition into smaller independent classes** | Each class has its own state | Major API change; callers need to know about multiple classes; breaks existing tests |

**Decision:** **Approach B** — Split along the data/rules seam.

The data half (`FusionAccountState`) holds all mutable state as a plain object with read-only config. The rules half (individual rule modules) are pure-ish functions that take state and return void. `FusionAccount` becomes a thin facade that delegates all behavior to rule functions.

### Q3: How many rule modules?

Options: 1 module vs. 3 modules vs. 7-8 focused modules.

**Decision:** **7 focused modules**, one per concern:
- `constructionRules` — factory builders
- `layerRules` — identity/managed/fusion-decision layer application
- `statusRules` — status/uncorrelated/orphan management
- `actionRules` — actions and source reviewers
- `reviewRules` — review lifecycle
- `correlationRules` — correlation promises and account linking
- `historyRules` — history messages

Plus one helper for collection mutations already inline. This keeps each module under ~400 lines.

### Q4: Should `fusionAccountMatcher.ts` change?

**Decision:** No. `fusionAccountMatcher.ts` stays unchanged (in out-of-scope file list). The `MatchContext` interface stays the same; layer rules build it using the state object directly instead of closures over `this`.

### Q5: How to verify correctness?

**Decision:** Plan 002 (characterization tests for `FusionAccount` mutation surface) must be completed and passing before this plan begins. These tests serve as a regression safety net. After every refactor step: `npx tsc --noEmit`, `npx eslint`, `npx vitest run`. If any characterization test fails, the refactor is wrong.

### Q6: Should we rename FusionAttribute keys (`accounts`/`missing-accounts`) now?

**Decision:** No. That's plan 004. Keep this plan focused on just the decomposition.

## Design Trade-offs

### Trade-off: Mutability of `FusionAccountState` fields

The state fields are `public` (not `private`) because rule modules need direct access. This means rules can reach into state and mutate anything — the contract is discipline-based (rules operate on their named subset of state) rather than enforced by the type system.

**Mitigation:** The contract test in Task 6 verifies facade/state consistency. Code review rejects PRs that add logic directly to `FusionAccount.ts`.

### Trade-off: Rule functions vs. rule classes

Rule modules export standalone functions rather than classes. Functions are easier to tree-shake, import individually, and test in isolation. A class would add ceremony without benefit since there's no shared instance state (all state is passed in via `FusionAccountState`).

### Trade-off: `readonly` config fields

`sourceConfigNamesSet`, `fusionAccountRefreshThresholdInSeconds`, and `maxHistoryMessages` are passed into `FusionAccountState`'s constructor and marked `readonly`. This enforces immutability for config while keeping data fields mutable.

## Implementation Sequence

1. Create `FusionAccountState` — move all private fields, keep accessors on facade
2. Extract construction rules — move factory logic into rule functions
3. Extract layer rules — move layer application, adapt MatchContext
4. Extract status/action/review/correlation rules — move remaining mutators
5. Extract history rules and finish facade — remove private helpers, `FusionAccount.ts` is pure delegation
6. Add contract test for facade/state consistency
7. Final verification — lint, typecheck, full test suite

## Final File Layout

```
src/model/
  fusionAccount.ts              (~400 lines, facade only)
  fusionAccountState.ts         (data container)
  fusionAccountRules/
    collectionRules.ts
    constructionRules.ts
    layerRules.ts
    statusRules.ts
    actionRules.ts
    reviewRules.ts
    correlationRules.ts
    historyRules.ts
```

No `index.ts` barrel file — each import should be explicit so static analysis can trace calls directly.

## Out of Scope

- Renaming `FusionAttribute` keys (plan 004)
- Modifying callers outside `src/model`
- Changing public API of `FusionAccount`
- Modifying `fusionAccountMatcher.ts`, `fusionAccountUtils.ts`, `fusionAccountTypes.ts`, `fusionService/*.ts`, `operations/**/*.ts`
