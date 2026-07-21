# Deepen Match Step — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single `MatchOutcomeDispatcher` module that owns the Match step (scoring + resolution + outcome dispatch), clean up `FusionRun` as the state seam, and break the `matchingService ⇄ fusionService` import cycle.

**Architecture:** The Match step moves from `fusionService.ts` into `src/services/matchingService/matchOutcomeDispatcher.ts`. `FusionService` calls one verb: `runMatchSweep(accounts, batchSize): MatchSweepResult`. The dispatcher depends on real collaborators (`FusionRun`, `FormService`, `CorrelationManager`, `DefinitionService`, `MatchingService`, an `AccountAssembly` module) and owns the four outcome paths. `FusionRun` becomes the single source of truth for the run-scoped state the dispatcher needs.

**Tech Stack:** TypeScript, Node.js, Vitest, SailPoint connector SDK.

## Global Constraints

- All services SHALL be stateless strategy objects; per-run mutable state lives in `FusionRun`.
- Domain vocabulary MUST follow `openspec/specs/ubiquitous-language/spec.md`.
- `matchingService` SHALL NOT import from `fusionService`; `formService` only imports types from `matchingService`.
- New public interfaces MUST be exercised by unit tests; existing `fusionService.test.ts` Match coverage migrates to the dispatcher tests.
- `npm run lint` and `npm test` MUST pass before each commit.

---

## Task 1: FusionRun cleanup

**Files:**
- Modify: `src/model/fusionRun.ts`
- Modify: `src/services/sourceService/sourceService.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/managedAccountAnalysisRecorder.ts`
- Test: `src/model/__tests__/fusionRun.test.ts`

**Interfaces:**
- Produces: `run.queueDisableOperation(account: Account): void`
- Produces: `run.removeMatchAccount(id: string | undefined): void`
- Produces: `run.trackFailed(fusionAccount: FusionAccount, message: string): void`
- Produces: `run.sourcesByName` as the single source of truth

- [ ] **Step 1:** Identify and delete dead `FusionRun` fields (`managedAccountsAllById`, `managedSources`, `tracker`, `fusionBlends`, `clearNonMatchedKeys`/`_currentRunNonMatchedKeysBySource`).
- [ ] **Step 2:** Move `pendingDisableOperations` from `FusionService` to `FusionRun` and add `queueDisableOperation`.
- [ ] **Step 3:** Add `removeMatchAccount` and `trackFailed` verbs to `FusionRun` that delegate to internal collections/recorder.
- [ ] **Step 4:** Absorb `SourceService.sourcesByName` into `FusionRun.sourcesByName`; delete the duplicate in `SourceService`.
- [ ] **Step 5:** Move `AggregationTracker` type to `src/model/` and update `managedAccountAnalysisRecorder.ts` to import from there.
- [ ] **Step 6:** Add tests for the new `FusionRun` verbs and run `npm test`.
- [ ] **Step 7:** Commit.

## Task 2: Break the matching → fusion / form cycles

**Files:**
- Create: `src/utils/yieldToEventLoop.ts`
- Create: `src/model/operationContext.ts` (or extend `src/model/` types)
- Modify: `src/services/fusionService/helpers.ts`
- Modify: `src/services/fusionService/collections.ts`
- Modify: `src/services/fusionService/types.ts`
- Modify: `src/services/matchingService/managedAccountAnalyzer.ts`
- Modify: `src/services/matchingService/managedAccountMatchingRunner.ts`
- Modify: `src/services/matchingService/managedAccountOutcomeHandler.ts`
- Modify: `src/services/matchingService/matchingService.ts`
- Modify: `src/services/formService/helpers.ts`
- Test: affected matchingService and formService tests

**Interfaces:**
- Produces: `hasIdentityCandidateMatches(fusionAccount: FusionAccount): boolean` in `matchingService/`
- Produces: `hasDeferredCandidateMatches(fusionAccount: FusionAccount): boolean` in `matchingService/`
- Produces: `countIdentityCandidateFusionMatches(...)` in `matchingService/`
- Produces: `formatFusionMatchDiscoveryLog(...)` in `matchingService/`
- Produces: `yieldToEventLoop(): Promise<void>` in `utils/`

- [ ] **Step 1:** Move `hasIdentityCandidateMatches`, `hasDeferredCandidateMatches`, and `formatFusionMatchDiscoveryLog` from `fusionService/helpers.ts` to `matchingService/`.
- [ ] **Step 2:** Move `countIdentityCandidateFusionMatches` from `formService/helpers.ts` to `matchingService/`.
- [ ] **Step 3:** Move `yieldToEventLoop` from `fusionService/collections.ts` to `utils/yieldToEventLoop.ts` and update callers.
- [ ] **Step 4:** Move `OperationContext`, `FusionReportBlend`, `UrlContext` types from `fusionService/types.ts` to `src/model/`.
- [ ] **Step 5:** Update all imports in `matchingService/`, `formService/`, and `fusionService/` and verify no circular imports remain.
- [ ] **Step 6:** Run `npm run lint` and `npm test`.
- [ ] **Step 7:** Commit.

## Task 3: Extract the account-assembly recipe

**Files:**
- Create: `src/services/accountAssembly/accountAssembly.ts` (or `src/services/fusionService/accountAssembly.ts`)
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/identityProcessor.ts`
- Modify: `src/services/fusionService/decisionProcessor.ts`
- Test: `src/services/fusionService/__tests__/fusionService.test.ts`

**Interfaces:**
- Produces: `AccountAssembly.assembleManagedAccount(account: Account): Promise<FusionAccount>`
- Consumes: `run`, `config`, `sources`, `mappingService`, `definitionService`, `log`

- [ ] **Step 1:** Create `AccountAssembly` with the shared recipe: mode gate, `addManagedAccountLayer`, attribute processing, registration in `run`.
- [ ] **Step 2:** Replace duplicated recipe blocks in `fusionService.ts`, `identityProcessor.ts`, and `decisionProcessor.ts` with calls to `accountAssembly.assembleManagedAccount(account)`.
- [ ] **Step 3:** Delete the duplicated `isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`, `applyAttributeProcessing`, and `addManagedAccountLayer` blocks from the three processors.
- [ ] **Step 4:** Run `npm test` and confirm the processors still work.
- [ ] **Step 5:** Commit.

## Task 4: Create MatchOutcomeDispatcher

**Files:**
- Create: `src/services/matchingService/matchOutcomeDispatcher.ts` (or `src/services/matchingService/matchOutcomeDispatcher/index.ts`)
- Delete: `src/services/matchingService/managedAccountAnalyzer.ts`
- Delete: `src/services/matchingService/managedAccountMatchingRunner.ts`
- Delete: `src/services/matchingService/managedAccountOutcomeHandler.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/serviceRegistry.ts`
- Test: `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`

**Interfaces:**
- Produces: `MatchOutcomeDispatcher.runMatchSweep(accounts: Account[], batchSize: number): MatchSweepResult`
- Produces: `MatchSweepResult { processed, matchScoringMs, counts: { identity, deferred, nonMatch, autoAssigned }, resolved: ResolvedMatch[] }`
- Consumes: `FusionRun`, `FormService`, `CorrelationManager`, `DefinitionService`, `MatchingService`, `AccountAssembly`, `FusionConfig`, `LogService`

- [ ] **Step 1:** Define `MatchSweepResult` and `ResolvedMatch` types.
- [ ] **Step 2:** Move `ManagedAccountAnalyzer` logic into the dispatcher's private scoring helper.
- [ ] **Step 3:** Move the two-pass sweep logic from `ManagedAccountMatchingRunner` into the dispatcher.
- [ ] **Step 4:** Move outcome dispatch from `ManagedAccountOutcomeHandler` into the dispatcher, using direct collaborators instead of closures.
- [ ] **Step 5:** Replace the two duplicated resolution switches in `fusionService.ts` with `matchOutcomeDispatcher.runMatchSweep(...)` calls.
- [ ] **Step 6:** Wire `MatchOutcomeDispatcher` construction in `serviceRegistry.ts` and pass it to `FusionService`.
- [ ] **Step 7:** Delete the old analyzer/runner/outcome-handler files.
- [ ] **Step 8:** Write unit tests for `runMatchSweep` covering the four outcomes.
- [ ] **Step 9:** Run `npm test` and `npm run lint`.
- [ ] **Step 10:** Commit.

## Task 5: Update the ubiquitous-language spec

**Files:**
- Modify: `openspec/specs/ubiquitous-language/spec.md`
- Modify: `docs/concepts/glossary.md`

**Interfaces:**
- Produces: canonical term **Match outcome dispatch** with definition

- [ ] **Step 1:** Add the term **Match outcome dispatch** to `openspec/specs/ubiquitous-language/spec.md` under the matching section.
- [ ] **Step 2:** Update `docs/concepts/glossary.md` to mirror the new term.
- [ ] **Step 3:** Add a note that `MatchingService` owns the Match step and `FusionService` owns operation-run orchestration.
- [ ] **Step 4:** Commit.

## Task 6: Test migration and final verification

**Files:**
- Modify: `src/services/fusionService/__tests__/fusionService.test.ts`
- Modify: `src/operations/__tests__/harness/mockRegistry.ts` if needed
- Modify: `src/operations/__tests__/harness/registryMocking.ts` if needed

- [ ] **Step 1:** Characterize current Match behavior in `fusionService.test.ts` before moving code.
- [ ] **Step 2:** Migrate existing Match scenarios from `fusionService.test.ts` to `matchOutcomeDispatcher.test.ts`.
- [ ] **Step 3:** Update any test registries that construct `FusionService` with the new dependencies.
- [ ] **Step 4:** Verify `buildFusionBlend` is unused in the outcome handler and remove it if dead.
- [ ] **Step 5:** Run `npm run lint` and `npm test`.
- [ ] **Step 6:** Run any integration/scenario tests.
- [ ] **Step 7:** Update `CHANGELOG.md` and `ARCHITECTURE-REVIEW.md`.
- [ ] **Step 8:** Final commit.

## Spec Coverage Check

- `match-outcome-dispatch` spec — Task 4.
- `fusion-run` spec (new verbs + single source of truth) — Task 1.
- `ubiquitous-language` spec — Task 5.

No placeholders. All tasks end with a test command and a commit.
