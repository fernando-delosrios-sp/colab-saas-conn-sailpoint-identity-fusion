# Verify: Rationalize Processor / Runner / Handler Deps Interfaces

## Verification

### 1. Lint

- **Command**: `npm run lint`
- **Result**: PASS
  - 0 ESLint errors
  - 0 ESLint warnings
  - knip: 4 pre-existing unused-export warnings (unrelated to this change)

### 2. Tests

- **Command**: `npm test`
- **Result**: PASS
  - 933 tests passed
  - 2 skipped (pre-existing)
  - 0 failed
  - Duration: ~4s

### 3. Build

- **Command**: `npm run build`
- **Result**: PASS
  - ncc bundle produced at `dist/index.js` (9547 kB)
  - TypeScript compilation clean
  - No type errors

### 4. Code-level checks

#### 4.1 IdentityProcessorDeps reduced

- **Before**: 8 fields, 5 closures
- **After**: 7 fields, 1 closure (`buildFusionBlend` is a value-returning function, not a forwarder)
- **Status**: PASS

#### 4.2 DecisionProcessorDeps reduced

- **Before**: 10 fields, 5 closures
- **After**: 9 fields, 1 closure (`buildFusionBlend`)
- **Status**: PASS

#### 4.3 ManagedAccountOutcomeHandlerDeps cleaned

- **Before**: 11 fields, 10 closures
- **After**: 17 fields, 6 closures (5 genuine orchestrations + `getTracker` + `buildFusionBlend`)
- **Net closures eliminated**: 6 trampolines (`applyAttributeProcessing`, `registerFusionBlend`, `setFusionAccount`, `addMatchScoringTimeMs`, `shouldPruneDeletedManagedAccounts`, `isAggregationAccountListMode`) were unused in the file or forwarded to methods that have been inlined into the handler
- **Status**: PASS

#### 4.4 FusionRun.recordFusionBlend added

- **Location**: `src/model/fusionRun.ts:356`, next to `addDecision` and `addReviewUrlForReviewer`
- **Signature**: `recordFusionBlend(blend: FusionReportBlend, tracker?: AggregationTracker): void`
- **Behavior**: no-op if `tracker` is undefined; otherwise pushes to `tracker.fusionBlends`
- **Status**: PASS

#### 4.5 FusionService.registerFusionBlend deleted; buildFusionBlend added

- **Deleted**: `FusionService.registerFusionBlend` (no remaining callers: `grep -r 'this\.registerFusionBlend\|registerFusionBlend(' src/` returns 0 matches)
- **Replaced with**: `FusionService.buildFusionBlend(fa, account): FusionReportBlend` (pure value-returning function at `src/services/fusionService/fusionService.ts:1482`)
- **Status**: PASS

#### 4.6 applyAttributeProcessing is KEPT on FusionService; processors use their own copy

- The original task 6.4 said "Delete `applyAttributeProcessing` from `FusionService`". This was re-scoped after verification: `FusionService.processFusionAccount:591` and `FusionService.preProcessManagedAccount:1358` both call `this.applyAttributeProcessing(fusionAccount)`, so the method cannot be deleted.
- **Actual outcome**: each processor now has its own private `applyAttributeProcessing(fa)` method (calling `mappingService.mapAttributes` + `definitionService.refreshNormalAttributes` + `definitionService.refreshReverseCorrelationAttributes` in the same order). The method on `FusionService` is kept for the two internal orchestrator callers.
- **Status**: PASS (re-scoped)

#### 4.7 initializeSourceReviewers call moved to orchestrator

- **Before**: called from `IdentityProcessor.processIdentities` via `await this.deps.initializeSourceReviewers()`
- **After**: called from `FusionService.processIdentities` directly (`src/services/fusionService/fusionService.ts:642`)
- **Note**: the `initializeSourceReviewers` *method* on `FusionService` is still defined (`src/services/fusionService/fusionService.ts:1325`) and is the implementation. Only the call site moved.
- **Status**: PASS

#### 4.8 `shouldPruneDeletedManagedAccounts` and `isAggregationAccountListMode` are KEPT on FusionService

- The original task 6.5 said "Delete `shouldPruneDeletedManagedAccounts` and `isAggregationAccountListMode` from `FusionService`". This was re-scoped after verification: `FusionService` itself uses them internally (correlationManager ctor at line 134, `shouldCaptureManagedAccountReportData:251`, `processFusionAccount:569`, `queueDisableOperation:1240`).
- **Actual outcome**: each processor / handler now has its own private `isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` method using captured `commandType`/`operationContext`. The methods on `FusionService` are kept for internal use.
- **Status**: PASS (re-scoped)

#### 4.8 Construction order in FusionService fixed

- **Before**: `outcomeHandler` constructed before `candidateRegistry`, passing `undefined` for the `candidateRegistry` Deps field
- **After**: `managedAccountAnalyzer` → `candidateRegistry` → `outcomeHandler` → `matchingRunner` → `identityProcessor` → `decisionProcessor`
- **Status**: PASS

#### 4.9 commandType / operationContext captured in processors

- **IdentityProcessor**, **DecisionProcessor**, and **ManagedAccountOutcomeHandler** each take `commandType` and `operationContext` as private readonly constructor args
- **Status**: PASS

### 5. Behavioral verification

- The `setFusionAccount` test spy was updated from `fusionService.setFusionAccount` to `fusionService.run.registerFusionAccount`. The new spy target is the actual write site after the change. The test passes.
- All 933 tests pass, including:
  - 60+ tests under `processIdentities` (exercises the new inlined methods)
  - 100+ tests under `processManagedAccounts` (exercises the new outcome handler methods)
  - 20+ tests under `processFusionIdentityDecision` (exercises the new decision processor)
  - All 6 `setFusionAccount routing` tests (exercises the `run.registerFusionAccount` direct call)

## Out of scope (verified unchanged)

- `ManagedAccountMatchingRunner` Deps (already a clean value object — no changes needed)
- `FusionRun` field privacy (the partial work in `encapsulate-fusionrun-state` is unchanged)
- Public service signatures (only construction sites changed)
