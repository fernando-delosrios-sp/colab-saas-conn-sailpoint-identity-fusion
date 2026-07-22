<!--
Raw capture of superpowers:brainstorming output.
design.md extracts and reorganizes this content into structured sections.
-->

# Brainstorm: Make FusionRun the Single Source of Truth

## Background

The `fusion-run` spec mandates: "No service SHALL hold mutable run-scoped state." Yet after the "Encapsulate FusionRun State Mutations" and "Move Form State to FusionRun" changes, per-run mutable state remains scattered across services:

- **FormService**: 4 dead fossil fields (`_fusionIdentityDecisions`, `_pendingReviewUrlsByReviewerId`, `_pendingCandidateIdentityIds`, `_pendingReviewUrlsByCandidateId`) left from the migration; live counter fields (`formsCreated`, `formInstancesCreated`, etc.) invisible to `snapshot()`
- **FusionService**: `_tracker` (AggregationTracker), `_managedAccountProcessingState` state machine, pass-through getters that delegate to FusionRun but expose raw access
- **MatchingService**: `trigramIndexByAttribute`, `normalizedCache`, `nameNormalizedCache` — functionally per-run but live on the service instance
- **SourceService**: dead `managedAccountsByIdentityId` field; `managedAccountsAllById` duplicated between SourceService and FusionRun

The snapshot/replay seam silently captures a subset of the truth because counters and tracker state bypass `snapshot()`.

The ARCHITECTURE-REVIEW (candidate #2) identifies this as "Strong" priority: "absorb every per-run mutable field into FusionRun, delete the dead fields, and narrow the interface from ~68 members exposing raw Maps to domain operations."

## Decision Chain

### Q1: How deep — just delete dead fields and move remaining state, or also absorb tracker?

**Option A — Minimal:** Delete the 4 dead FormService fields + SourceService dead fields. Move `_managedAccountProcessingState` to FusionRun. Leave tracker and trigram index where they are.

**Option B — Complete:** Move everything the ARCHITECTURE-REVIEW identifies: inventory maps, form counters, tracker, trigram index, sweep state machine. Delete the dead fields.

**Decision: Option B.** The ARCHITECTURE-REVIEW is clear that completeness unlocks the snapshot/replay seam. Partial moves leave the seam broken. Candidates 1 and 6 are already done, so candidate 2 (this change) is the next logical step.

### Q2: Where does `AggregationTracker` belong?

The tracker (`src/services/fusionService/aggregationTracker.ts`) is currently owned by FusionService and passed to sub-components via closures (`getTracker: () => this._tracker`). It's per-run — reset with each operation.

**Decision:** Move to FusionRun. The tracker tracks phase-level aggregation metrics (managed account counts, progression). It's run-scoped state, not service logic. FusionRun owns it via `_tracker` field with `getTracker()` getter, matching the existing closure pattern. FusionService sets it via `run.setTracker()` during initialization.

### Q3: Should the trigram index move to FusionRun?

The trigram index (`MatchingService.trigramIndexByAttribute`) and normalization caches (`normalizedCache`, `nameNormalizedCache`) are per-run — rebuilt at the start of each match sweep. WeakMap keys auto-expire, so there's no cross-run leakage.

**Decision: Yes, move them.** The index and caches are run-scoped data, not service logic. Moving them to FusionRun eliminates the implicit per-run reset contract and makes them visible to `snapshot()`. MatchingService accesses them via `run`.

### Q4: What about FormService's remaining live counters?

`formsCreated`, `formInstancesCreated`, `formsFound`, `formInstancesFound`, `answeredFormInstancesProcessed` are live counters with public getters. `fusionAssignmentDecisionMap` and `_pendingReviewContextByAccountId` are internal FormService maps. The delete queue machinery (`formsToDelete`, `formDeleteQueue`, etc.) is operation lifecycle state.

**Decision: Move counters and lifecycle state to FusionRun.** `fusionAssignmentDecisionMap` and `_pendingReviewContextByAccountId` stay in FormService — they're truly internal to form-building logic, not shared run state. Delete queue state moves because it represents an operation's pending work.

### Q5: What about SourceService's `managedAccountsAllById`?

It's populated by SourceService and consumed by FormService and ReportService. The FusionRun copy is optional and never populated — it's a fossil.

**Decision: Move it to FusionRun as the canonical location.** SourceService writes to `run.managedAccountsAllById`. It becomes non-optional on FusionRun. The existing getter on SourceService becomes a pass-through. The `ALL_ACCOUNTS_SOURCE_ID` constant moves to FusionRun along with the map.

### Q6: Dead field cleanup strategy

Six dead fields identified:
1. FormService: `_fusionIdentityDecisions`, `_pendingReviewUrlsByReviewerId`, `_pendingCandidateIdentityIds`, `_pendingReviewUrlsByCandidateId`
2. SourceService: `managedAccountsByIdentityId`
3. FusionRun: `managedAccountsAllById?` (the optional declaration — replace with non-optional)

Plus FusionService pass-through getters that expose raw access: `sourcesByName`, `_reviewersBySourceId`, `_sourcesWithoutReviewers`, `autoAssignedIdentityIds`.

**Decision: Delete all dead fields. Replace pass-through getters with direct `run.*` access at call sites that need reads (already the case for most) or with FusionRun verbs where mutations happen.**

## Design Trade-offs

| Trade-off | Choice | Why |
|-----------|--------|-----|
| Tracker on FusionRun vs FusionService | FusionRun | Per-run state. Snapshot must see it. |
| Trigram index on FusionRun vs MatchingService | FusionRun | Per-run cache. Separates lifecycle from logic. |
| Form counters on FusionRun | FusionRun | Already mostly moved; these are the stragglers. |
| fusionAssignmentDecisionMap stays in FormService | FormService | Truly internal — never consumed outside FormService. |
| managedAccountsAllById canonical location | FusionRun | SourceService already accesses `run`. Natural consolidation. |
| FusionService pass-through getters | Deleted | Callers already read from `run` directly in most cases. Residual wrappers are dead code. |

## Callers Mapped

| State | From | To |
|-------|------|----|
| Tracker + sweep machine | FusionService lines 85, 1193-1195 | FusionRun |
| Trigram index + norm caches | MatchingService lines 74-75, 84-86 | FusionRun |
| Form counters | FormService lines 65-69 | FusionRun |
| Form delete queue | FormService lines 44-49 | FusionRun |
| managedAccountsAllById | SourceService line 67 | FusionRun (canonical) |
| 4 dead FormService fields | FormService lines 50,53,60,62 | **Deleted** |
| managedAccountsByIdentityId | SourceService line 70 | **Deleted** (dead, only FusionRun copy used) |
| FusionService pass-through getters | FusionService lines 70-83 | **Deleted** |
