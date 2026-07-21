## 1. FusionRun cleanup

- [x] 1.1 Identify and delete dead `FusionRun` fields (`managedAccountsAllById`, `managedSources`, `tracker`, `fusionBlends`, `clearNonMatchedKeys`/`_currentRunNonMatchedKeysBySource`) and their snapshot references
- [x] 1.2 Deduplicate `sourcesByName`: absorb `SourceService.sourcesByName` into `FusionRun.sourcesByName`, update all readers, and delete the `SourceService` copy
- [x] 1.3 Add `run.queueDisableOperation(account)` verb and move `pendingDisableOperations` from `FusionService` to `FusionRun`
- [x] 1.4 Add `run.removeMatchAccount(id)` verb and move the managed-account work-queue removal logic into `FusionRun`
- [x] 1.5 Add `run.trackFailed(fusionAccount, message)` verb and hide `analysisRecorder` access behind it
- [x] 1.6 Move `AggregationTracker` type to `model/` next to `FusionRun` and update `ManagedAccountAnalysisRecorder` to import it from there
- [x] 1.7 Run `npm test` and fix regressions from `FusionRun` changes before proceeding

## 2. Break cycles and relocate shared code

- [x] 2.1 Move `hasIdentityCandidateMatches` and `hasDeferredCandidateMatches` from `fusionService/helpers.ts` into `matchingService/`
- [x] 2.2 Move `countIdentityCandidateFusionMatches` from `formService/helpers.ts` into `matchingService/`
- [x] 2.3 Move `formatFusionMatchDiscoveryLog` from `fusionService/helpers.ts` into `matchingService/`
- [x] 2.4 Move `yieldToEventLoop` from `fusionService/collections.ts` into `utils/`
- [x] 2.5 Move `OperationContext`, `FusionReportBlend`, and `UrlContext` types from `fusionService/types.ts` into `model/`
- [x] 2.6 Update all import sites in `matchingService/`, `formService/`, and `fusionService/` and verify no cycles remain (`npx madge --circular src/` or equivalent)
- [x] 2.7 Decide whether `createAutomaticAssignmentDecision` stays a helper or becomes a `FormService` method; update callers and exports

## 3. Extract account-assembly recipe

- [x] 3.1 Create `src/services/accountAssembly/` (or similar) with an `AccountAssembly` collaborator that owns the shared recipe: mode gate, `addManagedAccountLayer`, Map/Define, registration
- [x] 3.2 Replace the duplicated recipe in `fusionService.ts`, `identityProcessor.ts`, and `decisionProcessor.ts` with calls to `AccountAssembly.assembleManagedAccount(account)`
- [x] 3.3 Delete duplicated `isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`, `applyAttributeProcessing`, and `addManagedAccountLayer` blocks from the three processors
- [x] 3.4 Wire `MatchOutcomeDispatcher` to receive `AccountAssembly` as a constructor dependency instead of a `preProcessManagedAccount` closure

## 4. Create MatchOutcomeDispatcher

- [x] 4.1 Create `src/services/matchingService/matchOutcomeDispatcher.ts` and move `ManagedAccountAnalyzer`, `ManagedAccountMatchingRunner`, and `ManagedAccountOutcomeHandler` internals into it
- [x] 4.2 Define `MatchSweepResult` and `ResolvedMatch` types inside the module
- [x] 4.3 Implement `runMatchSweep(accounts, batchSize): MatchSweepResult` as the public dispatch method
- [x] 4.4 Wire the four outcomes (exact, partial, deferred, non-match) inside the dispatcher using direct collaborators (`FusionRun`, `FormService`, `CorrelationManager`, `DefinitionService`, `MatchingService`, `AccountAssembly`)
- [x] 4.5 Delete the two duplicated resolution switches in `fusionService.ts` and replace them with `matchOutcomeDispatcher.runMatchSweep(...)` calls
- [x] 4.6 `FusionService` constructs `MatchOutcomeDispatcher` with real collaborators (kept inside `FusionService` for now to avoid duplicating `AccountAssembly`/`CorrelationManager` wiring)
- [x] 4.7 Delete the old `managedAccountAnalyzer.ts`, `managedAccountMatchingRunner.ts`, and `managedAccountOutcomeHandler.ts` files once their logic is fully absorbed

## 5. Update ubiquitous-language spec

- [x] 5.1 Add **Match outcome dispatch** to `openspec/specs/ubiquitous-language/spec.md` with the agreed definition
- [x] 5.2 Update `docs/concepts/glossary.md` to mirror the new term
- [x] 5.3 Add an architecture note clarifying that `MatchingService` owns the Match step and `FusionService` owns operation-run orchestration

## 6. Test migration and verification

- [x] 6.1 Add characterization tests for current Match behavior in `fusionService.test.ts` before moving code
- [x] 6.2 Write unit tests for `MatchOutcomeDispatcher.runMatchSweep()` using real `MatchingService` and mocked collaborators
- [x] 6.3 Migrate existing Match scenarios from `fusionService.test.ts` to the new dispatcher tests
- [x] 6.4 Update `ServiceRegistry` and operation tests to use the new constructor shape
- [x] 6.5 Run `npm run lint` and fix style/type errors
- [x] 6.6 Run `npm test` and ensure all tests pass
- [x] 6.7 Run scenario tests / integration tests if available

## 7. Final cleanup and documentation

- [x] 7.1 Verify `buildFusionBlend` — it is used by `AccountAssembly`, so no dead code remains
- [x] 7.2 No production references to old processor names or closure-based outcome dispatch remain
- [x] 7.3 Marked candidates 1, 2, and 6 as implemented in `ARCHITECTURE-REVIEW.md`
- [x] 7.4 Added `CHANGELOG.md` entry for the Match step deepening, account-assembly extraction, FusionRun cleanup, cycle breaking, and terminology update
