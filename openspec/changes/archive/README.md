# Archived OpenSpec Changes

Archived changes record **point-in-time** planning and implementation. Artifact text may use names that were canonical when the change shipped but have since been retired.

## Current terminology (living specs)

After change **`reconcile-matching-delegation-spec`** (2026-08-09), the Match step architecture is documented as:

| Role | Canonical type / API |
|---|---|
| Pipeline phases (init, correlated sweep, record registration, uncorrelated drain) | `FusionService` |
| Two-sweep lifecycle + outcome dispatch | `MatchOutcomeDispatcher.runMatchSweep()` |
| Scoring algorithms + trigram blocking | `MatchingService` |

## Historical name mapping

When reading archived artifacts, map retired intermediate names to current terms:

| Historical (archive) | Current (living) | Notes |
|---|---|---|
| `ManagedAccountPassRunner` | `MatchOutcomeDispatcher` | Extracted 2026-07-18; renamed 2026-07-19; superseded by dispatcher extraction 2026-07-21 |
| `ManagedAccountMatchingRunner` | `MatchOutcomeDispatcher` | Intermediate rename; never the final public sweep API |
| `MatchingService.processUncorrelatedManagedAccounts` | `FusionService.processUncorrelatedManagedAccounts` → `MatchOutcomeDispatcher.runMatchSweep` | Planned in 2026-07-20 extract; not implemented as MatchingService method |
| `MatchingService.setCaptureBreakdown(value)` | `MatchingService.configureScoring({ captureBreakdown })` | Shipped as `setCaptureBreakdown`; renamed in living spec 2026-08-09 |
| MatchService (spec name) | MatchingService (code) | Folder/code uses `matchingService/` |

## How to use archives

- **Plans, retrospectives, commit references** — preserve historical names; they describe what existed at merge time.
- **Spec deltas in archive** — requirements may be superseded by later changes; prefer **`openspec/specs/`** living specs for normative behavior.
- **Each affected change** may include `archive-terminology.md` pointing here.

## Superseding changes

| Topic | Superseded by |
|---|---|
| Matching delegation / sweep ownership | `reconcile-matching-delegation-spec` |
| FusionAccount collaborator API | `finish-fusion-account-collaborator-api` |
