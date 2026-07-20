# Proposal: Move Form State to FusionRun

## Why

FormService holds per-run mutable state (`_fusionIdentityDecisions`, `_pendingCandidateIdentityIds`, `_pendingReviewUrlsByReviewerId`, `_pendingReviewUrlsByCandidateId`) that is exposed via public getters and consumed by DecisionProcessor and FusionService. This violates the FusionRun-as-single-source-of-truth pattern — the same per-run state lives across two services (FormService + FusionService.forms) and no snapshotting works without custom RecordingService coordination.

## What Changes

Move 4 public per-run state fields from FormService to FusionRun:

| FormService field | → FusionRun field | Type |
|---|---|---|
| `_fusionIdentityDecisions` | `fusionIdentityDecisions` | `FusionDecision[]` |
| `_pendingCandidateIdentityIds` | `pendingCandidateIdentityIds` | `Set<string>` |
| `_pendingReviewUrlsByReviewerId` | `pendingReviewUrlsByReviewerId` | `Map<string, string[]>` |
| `_pendingReviewUrlsByCandidateId` | `pendingReviewUrlsByCandidateId` | `Map<string, string[]>` |

FormService methods that write to these fields will receive and mutate `run` directly. FormService getters will be removed — callers read from `run` directly.

## Out of scope

- Internal FormService state (delete queues, review context, finished decisions)
- `fusionAssignmentDecisionMap` (used only in FormService internals)
- FusionRun snapshot/restore expansion
