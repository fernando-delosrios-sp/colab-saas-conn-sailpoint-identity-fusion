# Design: Collapse the FusionAccount facade into behavior-rich objects

## Context

`FusionAccountBase` (350 lines, `src/model/fusionAccountBase.ts`) is a thin pass-through: every public method is a 1–3 line delegation to a function in one of 8 rule modules under `src/model/fusionAccountRules/`. Each of the 54 rule functions has exactly one production caller — the facade method that delegates to it. `FusionAccountState` is a data container with 41 public fields, giving every rule function unrestricted access to the full state graph.

This creates three problems:
1. **Fragmentation**: understanding "blend a managed account" requires reading `layerRules.ts` → `fusionAccountMatcher.ts` → `collectionRules.ts` → `historyRules.ts` — four files for one behavior.
2. **Shallow facade**: the ~70 public methods add no abstraction — they are a 1:1 projection of rule functions onto a class interface.
3. **No encapsulation**: `FusionAccountState` fields are public so any rule can touch any field. There is no enforcement of which concern owns which state.

## Goals / Non-Goals

**Goals:**
- Delete the 8 rule module files and `FusionAccountState` — inline rule logic into methods on behavior-rich sub-objects
- Create three sub-objects that each own a slice of state as private fields and expose domain-level methods
- Reduce the `FusionAccount` public API from ~70 pass-through methods to ~20 direct methods + sub-object access
- Eliminate the hidden global `FusionAccount.configure(config)` invariant (move config to constructor parameter)
- Make every behavior traceable to a single file

**Non-Goals:**
- Changing behavioral logic — this is a pure structural refactor
- Changing `FusionAccountMatcher` public API — its functions become methods on sub-objects but expose the same signatures
- Changing any files outside `src/model/` except for API migration (callers must use new sub-object path)
- Changing the connector's external behavior or ISC API surface

## Decisions

### D1: Three sub-objects — Collections, Correlation, Layers

Each sub-object owns a cohesive slice of the state graph as private fields and exposes domain-level methods:

| Sub-object | Owns (private) | Exposes (public) |
|---|---|---|
| **FusionCollections** | accountIds, missingAccountIds, statuses, actions, reviews, sources, fusionMatches, history, previousAccountIds, managedAccountInfo, pendingReviewUrls, reviewPromises | `accounts.add(id)`, `accounts.remove(id)`, `accounts.addMissing(id)`, `accounts.removeMissing(id)`, `accounts.getMissingForSource(name)`, `statuses.add(s)`, `statuses.remove(s)`, `statuses.has(s)`, `statuses.setNonMatched()`, `actions.add(a)`, `actions.remove(a)`, `reviews.add(r)`, `reviews.remove(r)`, `reviews.addFusionReview(url)`, `reviews.removeFusionReview(url)`, `reviews.clearFusionReviews()`, `sources.add(s)`, `sources.remove(s)`, `matches.add(m)`, `matches.clearRefs()`, `history.importFromArray(arr)`, `syncToBag(bag)`, readonly getters for all collections |
| **FusionCorrelation** | correlationPromises | `addPromise(accountId, promise)`, `updateStatus()`, `resolvePendingOperations(awaitCorrelations?)`, `resolvePendingReviewUrls()`, `addPendingReviewUrl(url)`, `addReviewPromise(promise)` |
| **FusionLayers** | needsRefresh, needsReset, isIdentity, identityInfo state | `addIdentityLayer(state, identity)`, `addManagedAccountLayer(state, workQueue, accounts, opts)`, `addFusionDecisionLayer(state, decision)`, `addFusionMatch(state, match)`, `clearFusionIdentityReferences(state)` |

**Rationale**: The three sub-objects map directly to the three architectural concerns identified in ARCHITECTURE-REVIEW:
- Collections — "what is on this account" (entitlements, history, sources)
- Correlation — "how this account links to managed accounts" (correlation state, promises, deferred operations)
- Layers — "how this account is built" (the three data-enrichment phases)

**Alternatives considered**: (a) Keep a single FusionAccount class with private fields and inline methods — still ~70 methods on one class, no reduction in interface surface. (b) Four sub-objects (collections, correlation, layers, attributes) — attribute state is tightly coupled with collections (syncToBag writes collection state into attributes) and layers (layer methods set attribute context). Keeping them together reduces cross-object coupling.

### D2: State moves to private fields on sub-objects

Each sub-object declares its state as private TypeScript fields. No class outside the sub-object can access them. Callers interact through the public methods only.

This eliminates the problem of any rule function being able to mutate any field on `FusionAccountState`. Now, only `FusionCollections` methods can mutate collections, only `FusionCorrelation` methods can mutate correlation state, and `FusionLayers` methods receive references to the other sub-objects for coordination.

**Trade-off**: Cross-object mutations (e.g., a layer adding an account to both collections and correlation) require passing sub-object references to `FusionLayers` at construction time. The three sub-objects are created inside `FusionAccount`'s constructor and wired together there. This is explicit coupling rather than the implicit coupling of public-field access.

### D3: `configure()` moves to constructor — config passed directly

Current flow:
1. `FusionAccount.configure(config)` — sets static field
2. `FusionAccount.fromXYZ(...)` — factory reads static field

New flow:
1. `FusionAccount.fromXYZ(account, config)` — config passed as factory parameter
2. Constructors read config from parameter, not static

**Rationale**: The hidden global invariant — "must call configure before any factory" — is a recurring source of test failures and misuse. Passing config explicitly makes the dependency visible. The static `configure()` method is kept as a convenience that stores config for use by factory methods that don't yet receive it (for backward compatibility during migration).

**Alternatives considered**: (a) Keep static configure — maintains the same hidden-global problem. (b) Inject config via a context/setup function — over-engineered for a single config object.

### D4: FusionAccountMatcher functions become FusionLayers private methods

`fusionAccountMatcher.ts` has 4 exported functions that are only called from `addManagedAccountLayer` in `layerRules.ts`:
- `processIdentityMatchedAccounts`
- `processPreviousRunMatchedAccounts`
- `preserveMissingAccountContext`
- `pruneDeletedManagedAccounts`

These become private methods on `FusionLayers` since they are internal implementation details of the managed-account-layer processing. `fusionAccountMatcher.ts` is deleted.

### D5: Caller migration path

Existing callers access:
```typescript
fusionAccount.addAccountId(id, message)
fusionAccount.removeMissingAccountId(id)
fusionAccount.addStatus(status, message)
fusionAccount.updateCorrelationStatus()
```

After migration:
```typescript
fusionAccount.collections.accounts.add(id, message)
fusionAccount.collections.accounts.removeMissing(id)
fusionAccount.collections.statuses.add(status, message)
fusionAccount.correlation.updateStatus()
```

Each caller file is updated atomically — not gradually. The facade methods are removed in one step.

### D6: Read-only collection getters replace flat accessors

Current facade exposes:
- `get accountIds(): string[]` (array allocation on every call)
- `get accountIdsSet(): ReadonlySet<string>` (zero-copy)
- `get attributes(): Attributes`
- `get currentAttributes(): Attributes`
- `get attributeBag(): FusionAttributeBag`

After migration:
- `fusionAccount.collections.accountIds` → `ReadonlySet<string>` (zero-copy, no getter hiding)
- `fusionAccount.collections.statuses` → `ReadonlySet<string>`
- `fusionAccount.collections.reviews` → `ReadonlySet<string>`
- `fusionAccount.collections.fusionMatches` → `readonly FusionMatch[]`
- `fusionAccount.collections.history` → `readonly string[]`

Attribute access stays on `FusionAccount` directly (it's not a collection concern):
- `fusionAccount.getAttribute(name)` → unchanged
- `fusionAccount.attributeBag` → `FusionAttributeBag` (readonly reference)

### D7: `syncCollectionAttributesToBag` becomes `FusionCollections.syncToBag`

The method reads all collection state and writes it to the attribute bag. It moves from `FusionAccountState` (where it had public-field access) to `FusionCollections` (where it has private-field access).

### D8: `FusionAccountAccessors` deleted

Currently `FusionAccount` in `fusionAccountAccessors.ts` extends `FusionAccountBase`. After the refactor, `FusionAccount` is a standalone class in `fusionAccount.ts` (replacing the current re-export barrel). `fusionAccountAccessors.ts` is deleted.

## Risks / Trade-offs

- **[Risk] Migration touches ~20 caller files** — The API surface change is widespread. Mitigation: type-check after each task catches missed call sites. Task breakdown migrates callers by service (one task per directory), enabling incremental verification.
- **[Risk] Cross-object coupling in FusionLayers** — Layer methods need to mutate collections AND correlation. Mitigation: explicit constructor injection. The wiring is done once in `FusionAccount`'s constructor. No circular dependencies.
- **[Risk] Test breakage** — Tests that inspect `FusionAccountState` fields directly (via `as any`) will fail after state becomes private. Mitigation: tests migrate to use public methods on sub-objects. No behavior change means test assertions should not need logic changes — only how they access the data under test.
- **[Trade-off] Read-only collection getters expose Sets as public API** — Unlike the current array-getters (which return defensive copies), the new `ReadonlySet` getters return live views. Callers can iterate but cannot mutate. This is intentional: it eliminates per-call allocations in hot loops. Any caller that needs a mutable snapshot can call `Array.from()`.

## Migration Plan

1. Create the three sub-object files with private state and public methods — copy rule function bodies into methods
2. Rewrite `FusionAccount` to compose the three sub-objects
3. Delete `fusionAccountAccessors.ts`, `fusionAccountState.ts`, and the 8 rule module files
4. Delete `fusionAccountMatcher.ts` — logic moved into `FusionLayers`
5. Update callers (~20 files in services/ and operations/) to use new sub-object API
6. Update tests
7. Verify at each step: typecheck + lint + full test suite

No deployment migration — internal-only refactor. No config changes. Rollback: `git revert`.

## Open Questions

None. The ARCHITECTURE-REVIEW recommendation is explicit about the target structure (collections, correlation, layers). All design decisions are mapped above.
