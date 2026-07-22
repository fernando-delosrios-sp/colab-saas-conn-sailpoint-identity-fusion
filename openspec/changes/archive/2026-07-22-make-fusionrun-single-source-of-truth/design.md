# Design: Make FusionRun the Single Source of Truth

## Context

The `fusion-run` spec (openspec/specs/fusion-run/spec.md) states: "No mutable state relevant to the operation run SHALL exist outside FusionRun." After two prior refactors (Encapsulate FusionRun State Mutations, Move Form State to FusionRun), the core encapsulation is done — but fossil fields, scattered lifecycle state, and per-run caches remain outside FusionRun.

The ARCHITECTURE-REVIEW (candidate #2) identifies this as "Strong" priority: the snapshot/replay seam captures a subset of the truth because counters, tracker state, and trigram index bypass `snapshot()`. This change completes the consolidation.

## Goals / Non-Goals

**Goals:**
- Delete all dead fields left from prior migrations (FormService ×4, SourceService ×1)
- Move all remaining per-run mutable state to FusionRun: tracker, counters, trigram index, normalization caches, sweep state machine, delete queue
- Consolidate `managedAccountsAllById` on FusionRun as the canonical owner
- Remove FusionService pass-through getters that expose raw access
- Expand FusionRun `snapshot()`/`restore()` to include all moved state

**Non-Goals:**
- Changing FusionAccount or its rule system (ARCHITECTURE-REVIEW candidate #3)
- Changing the ISC API client interface (candidate #5)
- Re-cutting messaging along domain nouns (candidate #7)
- Making FusionRun fields truly `#private` (TypeScript `private` is sufficient)
- Changing behavioral logic — this is a pure state relocation

## Decisions

### D1: Tracker (`AggregationTracker`) moves to FusionRun

The tracker tracks per-run aggregation metrics (managed account counts, skipped accounts, progression). It's created per-operation in `FusionService.performAggregation()` and passed to sub-components via closure. FusionService holds it in `_tracker` (line 85).

**Design:** Add `_tracker` private field to FusionRun with `getTracker()` getter. FusionService sets it via a public `setTracker(tracker)` method during initialization. Sub-components that receive `{ getTracker }` closures continue to work — the closure simply wraps `run.getTracker()`.

### D2: Managed account processing state machine moves to FusionRun

FusionService holds three fields for the managed account processing phase:
- `_managedAccountProcessingState` (line 1193): `'idle' | 'initialized'`
- `_managedAccountProcessingStartedAt` (line 1194): number
- `_managedAccountProcessingBatchSize` (line 1195): number

**Design:** Move to FusionRun with encapsulated accessors. FusionService reads/writes via `run`:
- `run.startManagedAccountProcessing(batchSize)` → sets state to `'initialized'`, records start time
- `run.resetManagedAccountProcessing()` → state to `'idle'`, clears timestamps
- `run.managedAccountProcessingState` → read-only getter

### D3: Trigram index and normalization caches move to FusionRun

MatchingService holds:
- `normalizedCache` (WeakMap, line 74)
- `nameNormalizedCache` (WeakMap, line 75)
- `trigramIndexByAttribute` (Map, line 84)
- `indexedMandatoryAttributes` (string[], line 85)
- `trigramIndexBuilt` (boolean, line 86)

These are rebuilt at the start of each match sweep via `buildTrigramIndex()`. WeakMaps auto-expire when FusionAccount objects go out of scope.

**Design:** Move to FusionRun:
- `run.trigramIndexByAttribute: Map<string, Map<string, Set<string>>>`
- `run.normalizedCache: WeakMap<object, string>`
- `run.nameNormalizedCache: WeakMap<object, string>`
- `run.indexedMandatoryAttributes: string[]`
- `run.trigramIndexBuilt: boolean`

MatchingService's `buildTrigramIndex()` receives `run` as parameter (it already receives `config` and `log`). The method becomes: `buildTrigramIndex(fusionAccounts, config, run)`. Call sites update: `this.buildTrigramIndex(run.allFusionAccounts, config, run)`.

### D4: Form counters and delete queue move to FusionRun

**Counters:**
- `_formsCreated`, `_formInstancesCreated`, `_formsFound`, `_formInstancesFound`, `_answeredFormInstancesProcessed`

**Delete queue:**
- `formsToDelete: Set<string>`
- `formDeleteQueue: string[]`
- `pendingFormDeleteTasks: Set<Promise<void>>`
- `queuedFormDeleteIds: Set<string>`
- `activeFormDeleteWorkers: number`

**Design:** Move to FusionRun with encapsulated methods:
- `incrementFormsCreated()`, `incrementFormInstancesCreated()`, etc.
- `queueFormForDeletion(formDefId)`, `isFormQueuedForDeletion(formDefId)`, `getNextFormToDelete()`, `markFormDeletionComplete(formDefId)`, `addPendingFormDeleteTask(task)`, `awaitPendingFormDeleteTasks()`, `resetFormDeletionQueue()`

FormService accesses them via `this.run.*`. The counters stay as direct number fields with methods for increment — no need for getter/setter overhead on simple counters.

### D5: `managedAccountsAllById` consolidation

Currently:
- `SourceService.managedAccountsAllById` (line 67) — populated by `fetchManagedAccounts()`, consumed by FormService and ReportService
- `FusionRun.managedAccountsAllById?` (line 56) — optional, never populated, a fossil

**Design:** Remove the optional from FusionRun. Make it `managedAccountsAllById: Map<string, Account>` (non-optional, initialized to empty Map). SourceService writes to `run.managedAccountsAllById`. SourceService's own field is deleted. Callers that read `this.sources.managedAccountsAllById` read `run.managedAccountsAllById` instead. The `ALL_ACCOUNTS_SOURCE_ID` constant stays in SourceService where it's used for lookups.

### D6: Delete dead FormService fields

Four fields (lines 50, 53, 60, 62) are declared but never read or written via `this.`:
- `_fusionIdentityDecisions` → replaced by `this.run.fusionIdentityDecisions`
- `_pendingReviewUrlsByReviewerId` → replaced by `this.run.addReviewUrlForReviewer()`
- `_pendingCandidateIdentityIds` → replaced by `this.run.addPendingCandidateId()`
- `_pendingReviewUrlsByCandidateId` → replaced by `this.run.addReviewUrlForCandidate()`

**Design:** Delete the four declarations. No import changes needed. No callers reference these fields.

### D7: Delete dead SourceService field

`managedAccountsByIdentityId` (line 70) is declared but never read or written in SourceService. Only `FusionRun.managedAccountsByIdentityId` (line 35) is used.

**Design:** Delete the declaration. Tests that reference `mockSources.managedAccountsByIdentityId` update to reference `run.managedAccountsByIdentityId` (or the mock equivalent).

### D8: Delete FusionService pass-through getters

Four getters on FusionService delegate directly to FusionRun:
- `sourcesByName` (line 74-76) → `this.run.sourcesByName`
- `_reviewersBySourceId` (line 78-80) → `this.run.reviewersBySourceId`
- `_sourcesWithoutReviewers` (line 81-83) → `this.run.sourcesWithoutReviewers`
- `autoAssignedIdentityIds` (line 70-72) → `this.run.autoAssignedIdentityIds`

**Design:** Delete the getters. Update call sites. Most callers already access `run` directly — these getters are vestigial.

### D9: Snapshot and restore expansion

**Current snapshot captures:** managedAccounts, fusionAccounts, identities, formDecisions, fusionIdentityDecisions, pendingCandidateIdentityIds, pendingReviewUrlsByReviewerId, pendingReviewUrlsByCandidateId, sourcesByName, currentRunNonMatchedKeysBySource, fusionBlends, autoAssignedIds, matchScoringMs, phaseTimings

**New fields in snapshot:**
- `formCounters`: `{ formsCreated, formInstancesCreated, formsFound, formInstancesFound, answeredFormInstancesProcessed }`
- `formDeleteQueue`: `{ formsToDelete: string[], queuedFormDeleteIds: string[] }`
- `managedAccountProcessing`: `{ state: string, startedAt: number, batchSize: number }`
- `trigramIndexBuilt`: boolean

Tracker is NOT serialized in snapshot (it's a complex object with internal maps; its metrics are captured in phaseTimings). Normalization caches (WeakMaps) cannot be serialized — acceptable, as they're derived data that can be rebuilt.

### D10: Snapshot of managedAccountsAllById

`managedAccountsAllById` was previously not in snapshot because FusionRun's field was optional. Now that it's the canonical location, include it: `managedAccountsAllById` serialized as `Record<string, Account>`.

## Risks / Trade-offs

[R1] FusionRun grows further (~80 lines added for new methods/fields) → Mitigation: Methods are thin wrappers. FusionRun is still focused on state management. The spec already allows it to be a "domain object with validation."

[R2] WeakMaps cannot be serialized in snapshot → Mitigation: Acceptable. Normalization caches are derived data rebuilt from source data. Not capturing them in snapshot doesn't affect replay fidelity — they'll be rebuilt during replay.

[R3] Tracker not serialized in snapshot → Mitigation: The tracker's key outputs (account counts, progression metrics) are captured in `phaseTimings` and `analysisRecorder`. The tracker object itself is an execution detail.

[R4] FormService's fusionAssignmentDecisionMap stays in FormService → Mitigation: This map is truly internal to FormService's review-form building logic. It's never consumed outside FormService. No snapshot needs it directly.

[R5] Test access to now-moved state → Mitigation: Tests already access `run` via `(service as any).run`. New FusionRun tests cover the moved fields in the same pattern as existing tests.

## Migration Plan

1. Add new fields/methods to FusionRun (fields public, snapshots expanded)
2. Update callers to use FusionRun instead of service-local state
3. Delete dead fields and pass-through getters
4. Make FusionRun fields private where applicable
5. All tests pass at each step

No deployment migration needed — internal refactor with zero behavioral change.

## Open Questions

- Should the delete queue use a `WorkQueue`-style interface on FusionRun rather than raw Set/Array access? (Deferred — the current pattern works; refactoring the queue implementation is out of scope for this state-relocation change.)
- Should `fusionAssignmentDecisionMap` eventually move to FusionRun? (Deferred — it's truly internal to FormService's form-building logic and has no consumers outside the service. If that changes, it can move in a follow-up.)
