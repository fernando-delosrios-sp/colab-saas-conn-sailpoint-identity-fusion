# Brainstorming: Collapse the FusionAccount facade into behavior-rich objects

## Background

After the "Split FusionAccount Along the Data/Rules Seam" refactor (2026-07-17), `FusionAccount` became a thin facade (~350 lines) delegating to:

- **FusionAccountState** — a data container with 41 public fields
- **8 rule modules** — 54 exported functions, each with exactly one production caller (the facade method)
- **FusionAccountMatcher** — 4 functions called only from layerRules

The result achieved the stated goal (separate state from behavior) but introduced a new problem: the facade is now a 1:1 projection. Every public method on FusionAccountBase is a 1-3 line delegation to a rule function. The facade adds no abstraction — it is a mechanical mirror of the rule module API surface.

This was flagged as "Worth exploring" in the ARCHITECTURE-REVIEW with the recommendation to collapse it all back into behavior-rich objects with private state.

## Clarifying Questions & Decisions

### Q1: What problem are we solving?

The current architecture was an intermediate step that solved the god-class problem by splitting state from behavior. But the solution left three residual problems:

1. **Fragmentation across files**: Understanding "blend a managed account" requires reading `layerRules.ts` → `fusionAccountMatcher.ts` → `collectionRules.ts` → `historyRules.ts`
2. **Shallow facade**: The ~70 public methods are 1:1 delegations — the class is a namespace, not an abstraction
3. **No encapsulation**: FusionAccountState's 41 public fields mean any rule function can touch any field

### Q2: What is the target architecture?

Options considered:

| Approach | Pros | Cons |
|----------|------|------|
| **A. Keep facade, inline rules into methods** | Minimal caller changes; same API | Still ~70 methods on one class; no encapsulation gain |
| **B. Three sub-objects (collections, correlation, layers) with private state** | Clear domain boundaries; state is private; callers see domain-level groupings | Caller migration needed (~20 files); learning curve for sub-object API |
| **C. Full domain model (Account, Identity, Review, etc.)** | Most expressive | Too many classes; callers must know which class to use; over-engineered |

**Decision: Approach B** — Three behavior-rich sub-objects owned by FusionAccount.

This directly implements the ARCHITECTURE-REVIEW recommendation: "Regroup façade + rules + state into a few behavior-rich objects (collections, correlation, layers) with state fully private."

### Q3: What goes in each sub-object?

**FusionCollections**: All "what is on this account" state — account IDs, statuses, actions, reviews, sources, fusion matches, history. Plus the `syncToBag()` serialization method. Rule functions from `collectionRules.ts`, `statusRules.ts`, `actionRules.ts`, `reviewRules.ts`, and `historyRules.ts` become methods on this object.

**FusionCorrelation**: Correlation-specific state — correlation promises, deferred operation resolution. Rule functions from `correlationRules.ts` and the promise-resolution logic from `reviewRules.ts` become methods.

**FusionLayers**: The three layer enrichment methods — `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`. Layer-related state (needsRefresh, isIdentity, etc.). Receives references to the other sub-objects for cross-object coordination. Includes the matcher functions (`fusionAccountMatcher.ts`) as private methods.

### Q4: What about FusionAccountState?

**Decision: Delete it.** Its 41 public fields are distributed as private fields across the three sub-objects and FusionAccount itself. No external code should reference FusionAccountState directly — tests that do must migrate to the new sub-object API.

### Q5: What about the hidden global `configure()`?

Options:
- **A. Keep static `configure(config)`** — same hidden invariant
- **B. Pass config to constructor** — explicit dependency
- **C. Pass config to factory methods as parameter** — even more explicit

**Decision: Option B with C as migration path.** The static `configure()` is kept during migration for backward compatibility, but the constructor receives config directly. Factory methods accept an optional config parameter. Once all callers are migrated, the static can be removed.

### Q6: How do callers migrate?

All ~20 caller files across `src/services/` and `src/operations/` must update from flat facade calls to sub-object access:

```typescript
// Before
fusionAccount.addAccountId(id, message)

// After
fusionAccount.collections.accounts.add(id, message)
```

Migration is done atomically — all callers updated in one PR, verified by typecheck and full test suite. No gradual/dual-API period.

### Q7: What about the duplicate accessors?

Current facade has overlapping accessors:
- `identityId` vs `identityIdAttribute` → consolidated to `fusionAccount.identity.id`
- `attributes` vs `currentAttributes` vs `attributeBag` → `fusionAccount.getAttribute()` stays; `attributeBag` is exposed as readonly reference

**Decision:** The sub-object structure naturally eliminates duplicates. Each piece of data has one canonical access path through its owning sub-object.

## Design Trade-offs

### Trade-off: Read-only collection getters vs. defensive copies

Current facade returns defensive copies (`get accountIds(): string[]` returns `Array.from(this.state.accountIds)`). New design returns `ReadonlySet<string>` directly — zero allocation, but callers receive a live view.

**Mitigation:** `ReadonlySet` prevents mutation at the type level. Callers that need a mutable snapshot call `Array.from()`. This is the same pattern already used by `accountIdsSet` getter (zero-copy).

### Trade-off: Cross-object wiring in constructor

FusionLayers needs references to FusionCollections and FusionCorrelation for cross-object mutations (e.g., `addIdentityLayer` adds account IDs to collections). This creates a dependency graph wired in FusionAccount's constructor.

**Mitigation:** The wiring is explicit and done once. No circular dependencies (Collections → Correlaton → Layers → Collections is acyclic — Layers depends on the other two, but neither depends on Layers).

### Trade-off: Deleting files vs. gradual migration

Deleting 9 files (FusionAccountState + 8 rule modules) in one step risks merge conflicts and test breakage.

**Mitigation:** New files are created first, callers are migrated, old files are deleted last. At each step, typecheck verifies no missing references.

## Out of Scope

- Changing behavioral logic — this is a pure structural refactor
- Changing FusionAccount's config schema or external API
- Refactoring FusionService or FormService internals (only updating FusionAccount call sites)
- Making fields `#private` (ECMAScript private) — TypeScript `private` is sufficient
