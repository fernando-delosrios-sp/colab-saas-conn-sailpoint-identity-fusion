# Make FusionRun the Single Source of Truth — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the FusionRun consolidation: delete dead fields, move remaining per-run mutable state (tracker, trigram index, counters, delete queue, processing phase machine) to FusionRun, consolidate `managedAccountsAllById`, remove vestigial pass-through getters, and expand snapshot/restore.

**Architecture:** Add ~15 new fields/methods to FusionRun for tracker, processing phase, trigram index, form counters, and form delete queue. Delete 6+ dead fields across FormService, SourceService, and FusionService. Move 5 normalization/trigram fields from MatchingService to FusionRun. Expand snapshot() to include all moved state.

**Tech Stack:** TypeScript, Vitest, Node.js

---

## Task 1: Add new state fields and methods to FusionRun

**Files:**
- Modify: `src/model/fusionRun.ts`

**Interfaces:**
- Consumes: `AggregationTracker` (from `../services/fusionService/aggregationTracker`)
- Produces: `setTracker()`, `getTracker()`, `startManagedAccountProcessing()`, `resetManagedAccountProcessing()`, `managedAccountProcessingState` getter, `trigramIndexByAttribute`, `normalizedCache`, `nameNormalizedCache`, `indexedMandatoryAttributes`, `trigramIndexBuilt`, form counter fields + increment methods, delete queue fields + methods, `resetFormState()`, `managedAccountsAllById` (non-optional), expanded `snapshot()` / `restore()`

### Tracker fields

- [ ] **Step 1.1: Add private `_tracker` field and accessors**

In `src/model/fusionRun.ts`, add the private `_tracker` field alongside existing private fields:

```typescript
private _tracker?: AggregationTracker
```

Add `setTracker` and `getTracker` methods to FusionRun:

```typescript
setTracker(tracker: AggregationTracker): void {
    this._tracker = tracker
}

getTracker(): AggregationTracker | undefined {
    return this._tracker
}
```

### Managed account processing phase state

- [ ] **Step 1.2: Add private processing phase state fields and methods**

Add private fields:

```typescript
private _managedAccountProcessingState: 'idle' | 'initialized' = 'idle'
private _managedAccountProcessingStartedAt: number = 0
private _managedAccountProcessingBatchSize: number = 0
```

Add methods:

```typescript
startManagedAccountProcessing(batchSize: number): void {
    this._managedAccountProcessingBatchSize = batchSize
    this._managedAccountProcessingStartedAt = Date.now()
    this._managedAccountProcessingState = 'initialized'
}

resetManagedAccountProcessing(): void {
    this._managedAccountProcessingState = 'idle'
    this._managedAccountProcessingStartedAt = 0
    this._managedAccountProcessingBatchSize = 0
}

get managedAccountProcessingState(): 'idle' | 'initialized' {
    return this._managedAccountProcessingState
}
```

### Trigram index fields

- [ ] **Step 1.3: Add trigram index and normalization cache fields**

```typescript
trigramIndexByAttribute: Map<string, Map<string, Set<string>>> = new Map()
normalizedCache: WeakMap<object, string> = new WeakMap()
nameNormalizedCache: WeakMap<object, string> = new WeakMap()
indexedMandatoryAttributes: string[] = []
trigramIndexBuilt: boolean = false
```

### Form counter fields

- [ ] **Step 1.4: Add form counter fields and increment methods**

```typescript
formsCreated: number = 0
formInstancesCreated: number = 0
formsFound: number = 0
formInstancesFound: number = 0
answeredFormInstancesProcessed: number = 0

incrementFormsCreated(): void { this.formsCreated++ }
incrementFormInstancesCreated(): void { this.formInstancesCreated++ }
incrementFormsFound(): void { this.formsFound++ }
incrementFormInstancesFound(): void { this.formInstancesFound++ }
incrementAnsweredFormInstancesProcessed(): void { this.answeredFormInstancesProcessed++ }

resetFormCounters(): void {
    this.formsCreated = 0
    this.formInstancesCreated = 0
    this.formsFound = 0
    this.formInstancesFound = 0
    this.answeredFormInstancesProcessed = 0
}
```

### Delete queue fields

- [ ] **Step 1.5: Add delete queue fields and methods**

```typescript
private _formsToDelete: Set<string> = new Set()
private _formDeleteQueue: string[] = []
private _pendingFormDeleteTasks: Set<Promise<void>> = new Set()
private _queuedFormDeleteIds: Set<string> = new Set()
private _activeFormDeleteWorkers: number = 0

queueFormForDeletion(formDefId: string): void {
    if (this._queuedFormDeleteIds.has(formDefId)) return
    this._queuedFormDeleteIds.add(formDefId)
    this._formsToDelete.add(formDefId)
    this._formDeleteQueue.push(formDefId)
}

isFormQueuedForDeletion(formDefId: string): boolean {
    return this._queuedFormDeleteIds.has(formDefId)
}

getNextFormToDelete(): string | undefined {
    return this._formDeleteQueue.shift()
}

markFormDeletionComplete(formDefId: string): void {
    this._formsToDelete.delete(formDefId)
    this._queuedFormDeleteIds.delete(formDefId)
    this._activeFormDeleteWorkers--
}

addPendingFormDeleteTask(task: Promise<void>): void {
    this._pendingFormDeleteTasks.add(task)
}

async awaitPendingFormDeleteTasks(): Promise<void> {
    await Promise.all(this._pendingFormDeleteTasks)
}

resetFormDeletionQueue(): void {
    this._formsToDelete.clear()
    this._formDeleteQueue = []
    this._pendingFormDeleteTasks.clear()
    this._queuedFormDeleteIds.clear()
    this._activeFormDeleteWorkers = 0
}
```

- [ ] **Step 1.6: Add `resetFormState()` convenience method**

```typescript
resetFormState(): void {
    this.resetFormCounters()
    this.resetFormDeletionQueue()
}
```

### managedAccountsAllById

- [ ] **Step 1.7: Make `managedAccountsAllById` non-optional**

Change `managedAccountsAllById?: Map<string, Account>` to `managedAccountsAllById: Map<string, Account> = new Map()`

### Snapshot and restore

- [ ] **Step 1.8: Expand `snapshot()`**

Add to the returned object:

```typescript
formCounters: {
    formsCreated: this.formsCreated,
    formInstancesCreated: this.formInstancesCreated,
    formsFound: this.formsFound,
    formInstancesFound: this.formInstancesFound,
    answeredFormInstancesProcessed: this.answeredFormInstancesProcessed,
},
formDeleteQueue: {
    formsToDelete: [...this._formsToDelete],
    queuedFormDeleteIds: [...this._queuedFormDeleteIds],
},
managedAccountProcessing: {
    state: this._managedAccountProcessingState,
    startedAt: this._managedAccountProcessingStartedAt,
    batchSize: this._managedAccountProcessingBatchSize,
},
trigramIndexBuilt: this.trigramIndexBuilt,
managedAccountsAllById: Object.fromEntries(this.managedAccountsAllById),
```

- [ ] **Step 1.9: Expand `restore()`**

Add reconstruction for new fields from snapshot data.

---

## Task 2: Migrate FusionService state to FusionRun

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`

- [ ] **Step 2.1: Replace `this._tracker` with `this.run.*`**

Search for all `this._tracker` references. Replace:
- `this._tracker = tracker` → `this.run.setTracker(tracker)`
- `this._tracker` reads → `this.run.getTracker()`
- Update all `{ getTracker: () => this._tracker }` closures to `{ getTracker: () => this.run.getTracker() }`

- [ ] **Step 2.2: Replace processing phase state fields**

Replace `this._managedAccountProcessingState`, `this._managedAccountProcessingStartedAt`, `this._managedAccountProcessingBatchSize` with calls to `this.run.startManagedAccountProcessing(batchSize)`, `this.run.resetManagedAccountProcessing()`, and `this.run.managedAccountProcessingState`.

Find the `initializeManagedAccountProcessing` method and update it. Find where state is reset to `'idle'` and replace with `this.run.resetManagedAccountProcessing()`.

- [ ] **Step 2.3: Delete FusionService fields**

Delete: `_tracker` (line ~85), `_managedAccountProcessingState` (line ~1193), `_managedAccountProcessingStartedAt` (line ~1194), `_managedAccountProcessingBatchSize` (line ~1195)

- [ ] **Step 2.4: Delete FusionService pass-through getters**

Remove getters: `sourcesByName`, `_reviewersBySourceId`, `_sourcesWithoutReviewers`, `autoAssignedIdentityIds` (lines ~70-83). Search for references in FusionService and its callers. Replace `this.sourcesByName` → `this.run.sourcesByName`, `this.autoAssignedIdentityIds` → `this.run.autoAssignedIdentityIds`, etc.

Check these callers: formService.ts, fusionService.ts internal references, and any test files.

---

## Task 3: Migrate MatchingService state to FusionRun

**Files:**
- Modify: `src/services/matchingService/matchingService.ts`
- Modify: any files calling `buildTrigramIndex` or normalization methods

- [ ] **Step 3.1: Update `buildTrigramIndex` signature**

Change `buildTrigramIndex(fusionAccounts, config)` to `buildTrigramIndex(fusionAccounts, config, log, run)`. Update write targets: `this.trigramIndexByAttribute` → `run.trigramIndexByAttribute`, `this.indexedMandatoryAttributes` → `run.indexedMandatoryAttributes`, `this.trigramIndexBuilt` → `run.trigramIndexBuilt`.

- [ ] **Step 3.2: Update trigram query methods**

Find all methods that read `this.trigramIndexByAttribute` (e.g., `getCandidates`, `queryTrigramIndex`). Update to read from `run.trigramIndexByAttribute`. These methods may need `run` passed as parameter or accessed from a stored reference.

- [ ] **Step 3.3: Update normalization methods**

Find all methods that read/write `this.normalizedCache` and `this.nameNormalizedCache`. Update to read/write `run.normalizedCache` and `run.nameNormalizedCache`.

- [ ] **Step 3.4: Delete MatchingService fields**

Delete: `normalizedCache`, `nameNormalizedCache`, `trigramIndexByAttribute`, `indexedMandatoryAttributes`, `trigramIndexBuilt` (lines ~74-86).

---

## Task 4: Migrate FormService state to FusionRun

**Files:**
- Modify: `src/services/formService/formService.ts`

- [ ] **Step 4.1: Delete dead fossil fields**

Delete four field declarations:
- `_fusionIdentityDecisions` (line ~50)
- `_pendingReviewUrlsByReviewerId` (line ~53)
- `_pendingCandidateIdentityIds` (line ~60)
- `_pendingReviewUrlsByCandidateId` (line ~62)

- [ ] **Step 4.2: Migrate counter fields**

Replace `this._formsCreated++` → `this.run.incrementFormsCreated()`, `this._formsCreated` → `this.run.formsCreated`, etc. for all five counters. Update public getters (`get formsCreated()` etc.) to return `this.run.formsCreated`. Delete private counter fields.

- [ ] **Step 4.3: Migrate delete queue fields**

Replace `this.formsToDelete.add(id)` → `this.run.queueFormForDeletion(id)`, `this.queuedFormDeleteIds.has(id)` → `this.run.isFormQueuedForDeletion(id)`, etc. Delete private delete queue fields.

- [ ] **Step 4.4: Update `resetFormDataState`**

Replace reset logic to call: `this.run.clearDecisions()`, `this.run.clearReviewUrls()`, `this.run.resetFormState()`. Remove all individual `this._*` resets.

---

## Task 5: Migrate SourceService state to FusionRun

**Files:**
- Modify: `src/services/sourceService/sourceService.ts`

- [ ] **Step 5.1: Delete dead field `managedAccountsByIdentityId`**

Remove the `managedAccountsByIdentityId` declaration (line ~70).

- [ ] **Step 5.2: Migrate `managedAccountsAllById`**

In `fetchManagedAccounts` and `fetchManagedAccount`, replace `this.managedAccountsAllById.set(key, account)` → `this.run.managedAccountsAllById.set(key, account)`.

- [ ] **Step 5.3: Update callers reading `managedAccountsAllById`**

Find callers that read `sourceService.managedAccountsAllById` or `this.sources.managedAccountsAllById`. Update to read `run.managedAccountsAllById`.

- [ ] **Step 5.4: Delete SourceService `managedAccountsAllById` field**

Remove the `managedAccountsAllById` declaration (line ~67).

---

## Task 6: Update tests

- [ ] **Step 6.1: Add FusionRun tests**

In `src/model/__tests__/fusionRun.test.ts`, add tests for:
- Tracker set/get lifecycle
- Processing phase state transitions
- Form counter increments
- Delete queue operations (queue, check, next, complete, reset)
- `resetFormState()` convenience method
- `managedAccountsAllById` availability
- Snapshot/restore includes new fields

- [ ] **Step 6.2: Update FusionService tests**

Update `src/services/fusionService/__tests__/` tests:
- Tracker initialized via `run.setTracker()` not `this._tracker`
- Processing phase state via `run.*` methods
- No references to deleted pass-through getters

- [ ] **Step 6.3: Update MatchingService tests**

Update `src/services/matchingService/__tests__/` tests:
- Trigram index built on `run` not `this`
- Normalization cache on `run` not `this`
- Update `buildTrigramIndex` calls to pass `run`

- [ ] **Step 6.4: Update FormService tests**

Update `src/services/formService/__tests__/` tests:
- Counter access via `run` not `this._*`
- Delete queue via `run` methods
- No references to deleted dead fields
- `resetFormDataState` uses `run.clearDecisions()`, `run.clearReviewUrls()`, `run.resetFormState()`

- [ ] **Step 6.5: Update SourceService tests**

Update `src/services/sourceService/__tests__/` tests:
- `managedAccountsAllById` on `run` not `this`
- No reference to deleted `managedAccountsByIdentityId`

- [ ] **Step 6.6: Run full test suite**

```bash
npm test
```

- [ ] **Step 6.7: Run lint**

```bash
npm run lint
```

- [ ] **Step 6.8: Run build**

```bash
npm run build
```
