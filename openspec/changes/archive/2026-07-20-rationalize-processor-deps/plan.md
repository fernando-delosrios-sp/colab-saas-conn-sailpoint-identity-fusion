# Plan: Rationalize Processor / Runner / Handler Deps Interfaces

## Execution order

The implementation is done; this plan captures the order in which the work was applied, for the archive record.

1. **Add `FusionRun.recordFusionBlend`** (5 lines, isolated, no callers yet). Verified: `src/model/fusionRun.ts:356`.
2. **Replace `FusionService.registerFusionBlend` with `buildFusionBlend`** (value-returning). Update the one internal self-call site in `processFusionAccount`. Verified: `src/services/fusionService/fusionService.ts:572`, `:1482`.
3. **Update `IdentityProcessor`**:
   - Reduce `IdentityProcessorDeps` to 7 fields.
   - Add `commandType`/`operationContext` constructor args.
   - Inline `isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`, `applyAttributeProcessing`, `setFusionAccount` as private methods.
   - Replace `onBlend` callback body.
   - Remove `initializeSourceReviewers` call from `processIdentities`.
   - Verified: `src/services/fusionService/identityProcessor.ts`.
4. **Update `DecisionProcessor`**:
   - Reduce `DecisionProcessorDeps` to 9 fields.
   - Add `commandType`/`operationContext` constructor args.
   - Inline the four private methods.
   - Replace `handleNonAuthoritativeNoMatch` Deps closure with `outcomeHandler` direct injection.
   - Remove unused `SourceInfo` import.
   - Verified: `src/services/fusionService/decisionProcessor.ts`.
5. **Update `ManagedAccountOutcomeHandler`**:
   - Reduce `ManagedAccountOutcomeHandlerDeps` to remove 6 dead/trampoline closures; add `getTracker` and `buildFusionBlend`.
   - Add `commandType`/`operationContext` constructor args.
   - Inline `isAggregationAccountListMode` private method.
   - Replace `setFusionAccount` and `isAggregationAccountListMode` Deps uses.
   - Verified: `src/services/matchingService/managedAccountOutcomeHandler.ts`.
6. **Update `FusionService`**:
   - Reorder constructor: `managedAccountAnalyzer` → `candidateRegistry` → `outcomeHandler` → `matchingRunner` → `identityProcessor` → `decisionProcessor`.
   - Update each `new XxxProcessor(...)` call to use the new Deps shape.
   - Move `initializeSourceReviewers` call from `IdentityProcessor` to `FusionService.processIdentities`.
   - Verified: `src/services/fusionService/fusionService.ts`.
7. **Update tests**:
   - One spy in `src/services/fusionService/__tests__/fusionService.test.ts:2929` updated from `vi.spyOn(fusionService, 'setFusionAccount')` to `vi.spyOn(fusionService.run, 'registerFusionAccount')`.
8. **Verify**:
   - `npm run lint` — passes.
   - `npm test` — 933 passed, 2 skipped.
   - `npm run build` — succeeds.

## Files touched

| File | Net change |
|------|-----------|
| `src/model/fusionRun.ts` | +6 lines (new method) |
| `src/services/fusionService/fusionService.ts` | constructor reordered; `registerFusionBlend` renamed to `buildFusionBlend`; `processIdentities` orchestrator; 3 call sites updated |
| `src/services/fusionService/identityProcessor.ts` | Deps interface shrunk; 4 private methods added; 1 closure removed; 1 call site updated |
| `src/services/fusionService/decisionProcessor.ts` | Deps interface shrunk; 4 private methods added; `outcomeHandler` injected; 5 closure call sites updated |
| `src/services/matchingService/managedAccountOutcomeHandler.ts` | Deps interface cleaned; 1 private method added; 2 closure call sites updated |
| `src/services/fusionService/__tests__/fusionService.test.ts` | 1 spy target updated |

## Risks that materialized

- **`tracker` is undefined at processor construction time.** `FusionService.setTracker` is called post-construction (in tests, before the relevant method; in production, before). The direct `tracker` pass via Deps fired `undefined`-access errors. Resolution: switch to `getTracker(): AggregationTracker | undefined` (a method call that returns the live value). The `run.registerFusionAccount` and `run.recordFusionBlend` methods tolerate `undefined` tracker and no-op, so the read sites don't need null checks everywhere — only where we *read* the tracker (e.g. `processIdentities` setting `identitiesProcessedCount`).
- **Construction order bug in original `FusionService` ctor.** The old code constructed `outcomeHandler` before `candidateRegistry`, so the `candidateRegistry` field in `outcomeHandler`'s Deps was `undefined`. The order fix is a real correctness improvement on top of the refactor.
- **`FusionAccount.state` is `protected`.** Cannot be accessed from outside `FusionAccountBase` or its subclasses. Switched the call sites from the free functions (`addIdentityLayer(fa.state, ...)`) to the public methods (`fa.addIdentityLayer(...)`) that the class already exposes as thin wrappers.

## Out-of-scope work that future changes might pick up

- `FusionService.setFusionAccount`, `isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`, and `applyAttributeProcessing` are still on `FusionService`. They are used internally by orchestrator methods that this change did not refactor. A future change could either (a) inline private copies in each orchestrator method, or (b) move the orchestration methods to their own coordinator class. Both are out of scope here.
- `FusionService.shouldPruneDeletedManagedAccounts` and `isAggregationAccountListMode` are still on `FusionService` because `CorrelationManager`'s constructor (`new CorrelationManager(config, log, sources, identities, () => this.isAggregationAccountListMode())`) still uses the closure. A future change could move the mode flag onto `FusionRun` (the user noted "FusionRun seems the right placeholder" in the planning conversation).
