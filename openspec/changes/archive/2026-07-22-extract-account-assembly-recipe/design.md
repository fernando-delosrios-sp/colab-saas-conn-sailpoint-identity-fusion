# Design: One account-assembly recipe behind the processors

## Context

`AccountAssembly` (`src/services/accountAssembly/accountAssembly.ts`, ~130 lines) already owns the canonical implementations of `isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` as **private** methods. These are consumed internally by `addManagedAccountLayer()` (to gate prune-delete logic) and `assembleManagedAccount()` (to gate attribute processing).

However, three callers still maintain their own copies of `isAggregationAccountListMode()` and `FusionService` also keeps a copy of `shouldPruneDeletedManagedAccounts()`. The callers need these methods for their own logic:

| Caller | Method | Call sites | Reason caller needs it |
|---|---|---|---|
| `FusionService` | `isAggregationAccountListMode()` | 3 (constructor, report capture, prune-delete) | Gates report capture mode and prune-delete decisions |
| `FusionService` | `shouldPruneDeletedManagedAccounts()` | 0 external (dead code) | Was used by old managed-account flow; now only AccountAssembly uses it |
| `DecisionProcessor` | `isAggregationAccountListMode()` | 1 (`resolveIdentityBestEffort`) | Decides whether to eagerly fetch identity during aggregation |
| `MatchOutcomeDispatcher` | `isAggregationAccountListMode()` | 1 (`dispatchOutcome`) | Gates whether to process outcomes during aggregation |

## Goals / Non-Goals

**Goals:**
- Eliminate all 4 duplicated method copies across 3 files
- Expose `isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` as public on `AccountAssembly`
- Update all 6 call sites to delegate to `AccountAssembly`
- Remove duplicated `commandType`/`operationContext` state from `DecisionProcessor` that only powers the duplicate method

**Non-Goals:**
- Changing behavioral logic — pure structural de-duplication
- Removing `isAggregationAccountListMode()` from `AccountAssembly` internal use — it stays, just becomes public
- Changing the connector's external behavior or ISC API surface
- Extracting additional methods or expanding AccountAssembly's scope beyond the two duplicated methods

## Decisions

### D1: Make AccountAssembly methods public rather than extracting to a utility

`isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` currently live as private methods on `AccountAssembly`. Two options for exposing them:

**Option A (chosen)**: Change visibility from `private` to `public` on `AccountAssembly`.
- Callers already hold a reference to `AccountAssembly` (via `this.accountAssembly` or `this.deps.accountAssembly`)
- Zero new imports, zero new files
- Single source of truth for the logic and its dependencies (`commandType`, `operationContext`)

**Option B**: Extract to a standalone utility function.
- Would require passing `commandType` and `operationContext` as parameters
- Callers in `DecisionProcessor` would still need to store these values, defeating the goal of removing duplicated state
- Adds a new import to each caller

**Rationale**: Option A is simpler, requires fewer changes, and keeps the logic in one place. `AccountAssembly` is already the canonical home for these methods — making them public is the minimal change.

### D2: Remove `shouldPruneDeletedManagedAccounts()` from FusionService entirely

`FusionService.shouldPruneDeletedManagedAccounts()` (L1063) has **zero external callers**. The only remaining use of prune-delete logic is inside `AccountAssembly.addManagedAccountLayer()` which uses its own private copy. The FusionService copy is dead code.

**Decision**: Delete the method. It has no callers and removing it is risk-free.

### D3: Keep `isAggregationAccountListMode()` public on FusionService via delegation or remove it

`FusionService.isAggregationAccountListMode()` (L202) is used in 3 places within `FusionService` itself:
1. L132: Constructor — sets `this.run.fusionReportOnAggregation` flag
2. L177: Constructor — gates managed-account loading
3. L216: `shouldCaptureManagedAccountReportData()` — gates report slice population

All three are internal to `FusionService`. No external callers exist.

**Decision**: Make the method private on FusionService and delegate to `this.accountAssembly.isAggregationAccountListMode()`. This preserves the local convenience while eliminating the duplicated logic.

### D4: DecisionProcessor — remove duplicated state

`DecisionProcessor` currently stores `commandType` and `operationContext` in its constructor (L35–36) solely to power `isAggregationAccountListMode()` (L39–44). After migration, these fields become unused.

**Decision**: Remove the constructor parameters and fields. Only `isAggregationAccountListMode()` and its one call site at `resolveIdentityBestEffort` (L267) need updating.

### D5: MatchOutcomeDispatcher — delegate via existing deps

`MatchOutcomeDispatcher` already has `this.deps.accountAssembly` injected. The duplicate `isAggregationAccountListMode()` (L238–243) accesses `this.deps.commandType` and `this.deps.operationContext` from the same deps object that AccountAssembly receives.

**Decision**: Replace `this.isAggregationAccountListMode()` calls with `this.deps.accountAssembly.isAggregationAccountListMode()`. No constructor changes needed — `commandType` and `operationContext` stay on deps for other uses.

### D6: Call site migration — one commit per file

Each file is updated atomically:
1. `accountAssembly.ts` — change two methods from `private` to `public`
2. `fusionService.ts` — remove two duplicated methods, update 3 internal call sites
3. `decisionProcessor.ts` — remove one method + unused constructor params, update 1 call site
4. `matchOutcomeDispatcher.ts` — remove one method, update 1 call site

Verification after each file: `npx tsc --noEmit`. Full test suite after all files.

## Risks / Trade-offs

- **[Risk] Making `isAggregationAccountListMode` public exposes an internal implementation detail** — External consumers could now call it directly. Mitigation: it was already conceptually public (FusionService's version was `public`). Making it public on AccountAssembly just moves the public surface to the canonical location.
- **[Risk] DecisionProcessor constructor signature change** — Removing `commandType` and `operationContext` params could break callers that pass them. Mitigation: `npx tsc --noEmit` catches all broken call sites immediately.

## Open Questions

None. Scope is narrow and well-understood — two duplicated methods, three files, zero behavioral changes.
