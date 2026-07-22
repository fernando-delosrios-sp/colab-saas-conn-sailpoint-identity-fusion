## 1. Add new state fields and methods to FusionRun

- [x] 1.1 Add tracker fields: `_tracker` (private), `setTracker(tracker)`, `getTracker()`
- [x] 1.2 Add managed account processing phase fields: `_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize` (private), `startManagedAccountProcessing(batchSize)`, `resetManagedAccountProcessing()`, `managedAccountProcessingState` getter
- [x] 1.3 Add trigram index fields: `trigramIndexByAttribute`, `normalizedCache`, `nameNormalizedCache`, `indexedMandatoryAttributes`, `trigramIndexBuilt`
- [x] 1.4 Add form counter fields: `formsCreated`, `formInstancesCreated`, `formsFound`, `formInstancesFound`, `answeredFormInstancesProcessed`; methods: `incrementFormsCreated()`, `incrementFormInstancesCreated()`, `incrementFormsFound()`, `incrementFormInstancesFound()`, `incrementAnsweredFormInstancesProcessed()`, `resetFormCounters()`
- [x] 1.5 Add delete queue fields: `formsToDelete`, `formDeleteQueue`, `pendingFormDeleteTasks`, `queuedFormDeleteIds`, `activeFormDeleteWorkers` (private); methods: `queueFormForDeletion(formDefId)`, `isFormQueuedForDeletion(formDefId)`, `getNextFormToDelete()`, `markFormDeletionComplete(formDefId)`, `addPendingFormDeleteTask(task)`, `awaitPendingFormDeleteTasks()`, `resetFormDeletionQueue()`
- [x] 1.6 Add `resetFormState()` convenience method that calls `resetFormCounters()` + `resetFormDeletionQueue()`
- [x] 1.7 Make `managedAccountsAllById` non-optional (`Map<string, Account>`, initialized to empty Map)
- [x] 1.8 Expand `snapshot()` to include: formCounters, formDeleteQueue, managedAccountProcessing, trigramIndexBuilt, managedAccountsAllById
- [x] 1.9 Expand `restore()` to reconstruct the new fields from snapshot

## 2. Migrate FusionService state to FusionRun

- [x] 2.1 Replace `this._tracker` with `this.run.setTracker()` / `this.run.getTracker()` in FusionService and all sub-components that receive `getTracker` closures
- [x] 2.2 Replace `_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize` with `this.run.startManagedAccountProcessing()` / `this.run.resetManagedAccountProcessing()` / `this.run.managedAccountProcessingState`
- [x] 2.3 Delete FusionService fields: `_tracker`, `_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize`
- [x] 2.4 Delete FusionService pass-through getters: `sourcesByName`, `_reviewersBySourceId`, `_sourcesWithoutReviewers`, `autoAssignedIdentityIds`; update call sites to use `this.run.*` directly

## 3. Migrate MatchingService state to FusionRun

- [x] 3.1 Update `buildTrigramIndex` to receive and populate `run`: `buildTrigramIndex(fusionAccounts, config, log, run)`
- [x] 3.2 Update `buildTrigramIndex` to write to `run.trigramIndexByAttribute`, `run.indexedMandatoryAttributes`, `run.trigramIndexBuilt`
- [x] 3.3 Update all trigram query methods to read from `run.trigramIndexByAttribute` instead of `this.trigramIndexByAttribute`
- [x] 3.4 Update normalization methods to read/write `run.normalizedCache`, `run.nameNormalizedCache` instead of `this.*`
- [x] 3.5 Delete MatchingService fields: `trigramIndexByAttribute`, `indexedMandatoryAttributes`, `trigramIndexBuilt`, `normalizedCache`, `nameNormalizedCache`

## 4. Migrate FormService state to FusionRun

- [x] 4.1 Delete dead fossil fields: `_fusionIdentityDecisions`, `_pendingReviewUrlsByReviewerId`, `_pendingCandidateIdentityIds`, `_pendingReviewUrlsByCandidateId`
- [x] 4.2 Replace counter fields (`_formsCreated`, `_formInstancesCreated`, `_formsFound`, `_formInstancesFound`, `_answeredFormInstancesProcessed`) with `this.run.incrementFormsCreated()` etc.; update counter getters to delegate to `this.run.*`
- [x] 4.3 Replace delete queue fields (`formsToDelete`, `formDeleteQueue`, `pendingFormDeleteTasks`, `queuedFormDeleteIds`, `activeFormDeleteWorkers`, `formDeleteQueueConcurrency`) with `this.run.queueFormForDeletion()` etc.
- [x] 4.4 Update `resetFormDataState` to call `this.run.clearDecisions()`, `this.run.clearReviewUrls()`, `this.run.resetFormState()`
- [x] 4.5 Delete FormService private fields for counters and delete queue that were replaced by FusionRun methods

## 5. Migrate SourceService state to FusionRun

- [x] 5.1 Delete dead field: `managedAccountsByIdentityId`
- [x] 5.2 Replace `this.managedAccountsAllById` writes with `this.run.managedAccountsAllById`
- [x] 5.3 Update callers that read `sourceService.managedAccountsAllById` to read `run.managedAccountsAllById`
- [x] 5.4 Delete SourceService `managedAccountsAllById` field

## 6. Update tests

- [x] 6.1 Add tests for new FusionRun fields and methods: tracker, processing phase state, trigram index, form counters, form delete queue, managedAccountsAllById, snapshot expansion
- [x] 6.2 Update FusionService tests: tracker and processing phase state now on run; no more pass-through getters
- [x] 6.3 Update MatchingService tests: trigram index and caches now on run; update buildTrigramIndex calls
- [x] 6.4 Update FormService tests: counters and delete queue via run methods; dead fields gone; resetFormDataState updated
- [x] 6.5 Update SourceService tests: managedAccountsAllById now on run; no more service-local fields
- [x] 6.6 Update any other affected test files
- [x] 6.7 Run full test suite: `npm test`
- [x] 6.8 Run `npm run lint` and fix any issues
- [x] 6.9 Run `npm run build` to verify compilation
