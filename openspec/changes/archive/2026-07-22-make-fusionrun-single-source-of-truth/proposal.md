# Proposal: Make FusionRun the Single Source of Truth

## Why

The `fusion-run` spec mandates that "no service SHALL hold mutable run-scoped state" and that FusionRun SHALL be the single source of truth for operation run state. After the "Encapsulate FusionRun State Mutations" (2026-07-20) and "Move Form State to FusionRun" (2026-07-20) changes, per-run mutable state is still scattered across four services:

- **FormService**: 4 dead fossil fields left from the migration; live counter fields (`formsCreated`, `formInstancesCreated`, etc.) and delete queue state invisible to `snapshot()`
- **FusionService**: `AggregationTracker`, managed account processing state machine, and pass-through getters that delegate to FusionRun but expose raw access
- **MatchingService**: trigram index and normalization caches that are functionally per-run but live on the service instance
- **SourceService**: dead `managedAccountsByIdentityId` field; `managedAccountsAllById` duplicated with FusionRun

The snapshot/replay recording seam silently captures a subset of the truth — counters, tracker, trigram index, and lifecycle state all bypass `snapshot()`.

## What Changes

1. **Delete dead fields**: 4 FormService fossils (`_fusionIdentityDecisions`, `_pendingReviewUrlsByReviewerId`, `_pendingCandidateIdentityIds`, `_pendingReviewUrlsByCandidateId`), dead `SourceService.managedAccountsByIdentityId`, and FusionService pass-through getters that expose raw access.

2. **Move per-run state to FusionRun**:
   - **From FusionService**: `AggregationTracker` (`_tracker`), managed account processing state machine (`_managedAccountProcessingState`, `_managedAccountProcessingStartedAt`, `_managedAccountProcessingBatchSize`)
   - **From MatchingService**: trigram index (`trigramIndexByAttribute`), normalization caches (`normalizedCache`, `nameNormalizedCache`)
   - **From FormService**: form lifecycle counters (`formsCreated`, `formInstancesCreated`, `formsFound`, `formInstancesFound`, `answeredFormInstancesProcessed`), delete queue machinery (`formsToDelete`, `formDeleteQueue`, `pendingFormDeleteTasks`, `queuedFormDeleteIds`, `activeFormDeleteWorkers`)
   - **From SourceService**: canonical `managedAccountsAllById` (make FusionRun the owner; SourceService becomes a writer)

3. **Consolidate `managedAccountsAllById`**: promote from optional fossil to non-optional canonical field on FusionRun.

4. **Update FusionRun snapshot/restore**: include moved tracker, counters, trigram index, and delete queue state in `snapshot()`.

## Capabilities

### Modified Capabilities
- **fusion-run** — absorbs tracker, counters, trigram index, sweep machine, delete queue state; snapshot/restore expanded
- **fusion-service** — delegates tracker and sweep machine to FusionRun; pass-through getters removed
- **matching-service** — delegates trigram index and normalization caches to FusionRun
- **form-service** — delegates counters and delete queue to FusionRun; dead fields deleted
- **source-service** — delegates `managedAccountsAllById` ownership to FusionRun; dead field deleted

## Impact

- **Code**: ~6 dead fields deleted (~30 lines). ~10 state fields moved to FusionRun (~150 lines added to FusionRun, ~150 lines removed from services). Net zero or negative line count change.
- **Tests**: FusionRun tests expanded for new fields and snapshot coverage. Service tests updated to initialize FusionRun with the moved state. No behavioral change.
- **API**: No breaking changes to config schema or connector operations. Internal-only refactor.
- **Replay fidelity**: snapshot()/restore() becomes truthful — all per-run state captured in one place.
