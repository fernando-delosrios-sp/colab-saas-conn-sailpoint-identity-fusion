# Tasks: Rationalize Processor / Runner / Handler Deps Interfaces

## 1. Add FusionRun.recordFusionBlend

- [x] 1.1 Add `recordFusionBlend(blend: FusionReportBlend, tracker?: AggregationTracker): void` to `src/model/fusionRun.ts` next to `addDecision`
- [x] 1.2 Method body: if no tracker, return; else push the blend to `tracker.fusionBlends`

## 2. Replace FusionService.registerFusionBlend with buildFusionBlend

- [x] 2.1 In `src/services/fusionService/fusionService.ts`, add `buildFusionBlend(fa, account): FusionReportBlend` (value-returning)
- [x] 2.2 Delete `registerFusionBlend` from `FusionService`
- [x] 2.3 Add `FusionReportBlend` to the existing `import { ... } from './types'` line
- [x] 2.4 Update the one internal self-call site in `processFusionAccount` (line ~572) to `this.run.recordFusionBlend(this.buildFusionBlend(fa, account), this._tracker)`

## 3. Update IdentityProcessor

- [x] 3.1 Add `StandardCommand` import from `@sailpoint/connector-sdk`
- [x] 3.2 Add `MappingService`, `DefinitionService`, `FusionReportBlend` type imports; add `OperationContext` value import
- [x] 3.3 Reduce `IdentityProcessorDeps` to 7 fields: `identities`, `getTracker()`, `sources`, `configSourceNames`, `mappingService`, `definitionService`, `buildFusionBlend`
- [x] 3.4 Add `commandType` and `operationContext` private readonly constructor args
- [x] 3.5 Add private `isAggregationAccountListMode()` method
- [x] 3.6 Add private `shouldPruneDeletedManagedAccounts()` method
- [x] 3.7 Add private `applyAttributeProcessing(fa)` method using `mappingService` + `definitionService`
- [x] 3.8 Add private `setFusionAccount(fa)` method using `run.registerFusionAccount(fa, this.deps.getTracker())`
- [x] 3.9 In `processIdentities`, replace `this.deps.tracker().identitiesProcessedCount = ...` with `const tracker = this.deps.getTracker(); if (tracker) tracker.identitiesProcessedCount = ...`
- [x] 3.10 Remove the `await this.deps.initializeSourceReviewers()` call from `processIdentities`
- [x] 3.11 In `processIdentity`, replace `this.deps.shouldPruneDeletedManagedAccounts()` with `this.shouldPruneDeletedManagedAccounts()`
- [x] 3.12 Replace the `onBlend` callback with `this.run.recordFusionBlend(this.deps.buildFusionBlend(fa, account), this.deps.getTracker())`
- [x] 3.13 Replace `await this.deps.applyAttributeProcessing(fa)` with `await this.applyAttributeProcessing(fa)`
- [x] 3.14 Replace `this.deps.setFusionAccount(fa)` with `this.setFusionAccount(fa)`

## 4. Update DecisionProcessor

- [x] 4.1 Add `StandardCommand` import; add `OperationContext` value import
- [x] 4.2 Add `ManagedAccountOutcomeHandler`, `MappingService`, `DefinitionService`, `AggregationTracker` type imports; add `FusionReportBlend` import
- [x] 4.3 Reduce `DecisionProcessorDeps` to 9 fields: `forms`, `sources`, `identities`, `correlationManager`, `outcomeHandler`, `mappingService`, `definitionService`, `getTracker()`, `buildFusionBlend`
- [x] 4.4 Add `commandType` and `operationContext` private readonly constructor args
- [x] 4.5 Add private `isAggregationAccountListMode()` and `shouldPruneDeletedManagedAccounts()` methods
- [x] 4.6 Add private `applyAttributeProcessing(fa)` method
- [x] 4.7 Add private `setFusionAccount(fa)` method
- [x] 4.8 In `processFusionIdentityDecision`, replace all `this.deps.*` closure calls with private methods or direct `this.deps.outcomeHandler` calls
- [x] 4.9 In `resolveIdentityBestEffort`, replace `this.deps.isAggregationAccountListMode()` with `this.isAggregationAccountListMode()`
- [x] 4.10 Remove the `import type { SourceInfo }` line (now unused)

## 5. Update ManagedAccountOutcomeHandler

- [x] 5.1 Add `StandardCommand` import; add `OperationContext` value import
- [x] 5.2 Update `ManagedAccountOutcomeHandlerDeps` to keep 5 orchestration closures + add `getTracker` + add `buildFusionBlend`; remove 6 dead/trampoline closures
- [x] 5.3 Add `commandType` and `operationContext` private readonly constructor args
- [x] 5.4 Add private `isAggregationAccountListMode()` method
- [x] 5.5 In `handleIdentityMatch`, replace `this.deps.isAggregationAccountListMode()` with `this.isAggregationAccountListMode()`
- [x] 5.6 In `finalizeAuthoritativeNonMatch`, replace `this.deps.setFusionAccount(fa)` with `this.run.registerFusionAccount(fa, this.deps.getTracker())`

## 6. Update FusionService construction sites

- [x] 6.1 Add `initializeSourceReviewers` call after `identityProcessor.processIdentities()` in `FusionService.processIdentities`
- [x] 6.2 Reorder constructor: `managedAccountAnalyzer` → `candidateRegistry` → `outcomeHandler` → `matchingRunner` → `identityProcessor` → `decisionProcessor`
- [x] 6.3 Update each `new XxxProcessor(...)` call to use the new Deps shape
- [x] 6.4 `FusionService.applyAttributeProcessing` is KEPT (called internally by `processFusionAccount:591` and `preProcessManagedAccount:1358`); processors no longer call it through Deps — they use their own private copy
- [x] 6.5 `FusionService.shouldPruneDeletedManagedAccounts` and `isAggregationAccountListMode` are KEPT (called internally by `CorrelationManager` ctor, `shouldCaptureManagedAccountReportData:251`, `processFusionAccount:569`, `queueDisableOperation:1240`); processors no longer call them through Deps — they use their own private copy

## 7. Update tests

- [x] 7.1 In `src/services/fusionService/__tests__/fusionService.test.ts`, update the spy at line ~2929 from `vi.spyOn(fusionService, 'setFusionAccount')` to `vi.spyOn(fusionService.run, 'registerFusionAccount')`

## 8. Verify

- [x] 8.1 `npm run lint` — passes
- [x] 8.2 `npm test` — 933 passed, 2 skipped
- [x] 8.3 `npm run build` — succeeds
