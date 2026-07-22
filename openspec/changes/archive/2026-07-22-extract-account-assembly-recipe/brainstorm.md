# Brainstorm: One account-assembly recipe behind the processors

## Background

After extracting `AccountAssembly` into `src/services/accountAssembly/`, the three processors (`FusionService`, `DecisionProcessor`, `IdentityProcessor`) and `MatchOutcomeDispatcher` all share the collaborator for the main recipe (managed-account layer, attribute processing, registration). However, two mode-gate methods were left duplicated:

- `isAggregationAccountListMode()` — 3 copies (FusionService L202, DecisionProcessor L39, MatchOutcomeDispatcher L238)
- `shouldPruneDeletedManagedAccounts()` — 1 copy (FusionService L1063, dead code — zero external callers)

All copies are byte-for-byte identical to the private versions already in `AccountAssembly`.

## Decision Chain

### Q1: Should these methods live on AccountAssembly or as standalone utilities?

**Context**: AccountAssembly already owns private copies of both methods for its own internal use (`addManagedAccountLayer` needs prune-delete gating, `assembleManagedAccount` needs aggregation-mode gating).

**Option A**: Make them public on AccountAssembly. Callers already hold `this.accountAssembly` or `this.deps.accountAssembly`. Zero new imports. Single source of truth.

**Option B**: Extract to standalone utility functions. Requires passing `commandType`/`operationContext` as params. DecisionProcessor would still need to store these values just to pass them — defeats half the purpose.

**Option C**: Keep them duplicated. "Safe" but any logic change requires 3-4 coordinated edits. What we have now.

**Decision**: **Option A**. Simplest path. AccountAssembly is already the canonical home. Changing `private` → `public` is a visibility change, not a structural one.

### Q2: Should `shouldPruneDeletedManagedAccounts()` stay on FusionService?

**Context**: The FusionService copy (L1063) has zero callers. The only remaining use is inside `AccountAssembly.addManagedAccountLayer()` using AccountAssembly's own private copy.

**Decision**: Delete it. Dead code. Zero risk.

### Q3: What about DecisionProcessor's duplicated state?

**Context**: DecisionProcessor stores `commandType` and `operationContext` in its constructor (L35-36) solely to power `isAggregationAccountListMode()` (L39-44). After migration, these fields are unused.

**Decision**: Remove the constructor params and fields. If any caller passes them, `tsc` catches it immediately.

### Q4: Should MatchOutcomeDispatcher's deps change?

**Context**: MatchOutcomeDispatcher already has `this.deps.accountAssembly` injected and `commandType`/`operationContext` on the same deps object. Its duplicate L238-243 accesses `this.deps.commandType`.

**Decision**: Replace `this.isAggregationAccountListMode()` with `this.deps.accountAssembly.isAggregationAccountListMode()`. No constructor changes. `commandType` stays on deps for other uses.

### Q5: What's the migration risk?

**Assessment**:
- 4 files touched, 6 call sites updated, 2 methods exposed
- All changes are mechanical (replace `this.X()` with `this.deps.accountAssembly.X()`)
- `npx tsc --noEmit` catches every missed call site
- No behavioral changes — pure structural de-duplication

**Risk level**: Very low. TypeScript compiler is the safety net.

## Trade-offs

| Trade-off | Assessment |
|---|---|
| Public exposure of internal detail (`isAggregationAccountListMode`) | Already public in FusionService — just moves the surface to canonical location |
| DecisionProcessor constructor signature change | `tsc` catches all broken callers |
| Scope creep risk | Scope is narrow — 2 methods, 3 files. No temptation to extract more. |

## Design Sections Approved

1. **Expose on AccountAssembly**: `private` → `public` for both methods ✓
2. **FusionService cleanup**: Remove both copies, delegate 3 call sites ✓
3. **DecisionProcessor cleanup**: Remove copy + unused state, delegate 1 call site ✓
4. **MatchOutcomeDispatcher cleanup**: Remove copy, delegate 1 call site ✓
5. **Verification sequence**: Typecheck after each file, full test suite at end ✓
