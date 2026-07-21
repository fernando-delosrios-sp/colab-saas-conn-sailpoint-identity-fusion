## Why

The Match step is the core of the Fusion connector: it decides whether a managed source account belongs to an existing identity, defers it, or creates a new one. After recent refactors moved matching logic into `matchingService/`, the Match step still spans six files across two packages with circular imports and an 18-member dependency bag. The resolution switch is duplicated inside `fusionService.ts`, and outcome dispatch depends on seven closures over private FusionService methods. This extraction-without-seam formation makes every workflow change require coordinated edits in 3–4 files, and it prevents the Match step from being tested through a single interface. We need to deepen the Match step into one module so the domain concept, its interface, and its tests all live in one place.

## What Changes

**FusionRun cleanup (prerequisite)**
- From: run-scoped state split between `FusionRun`, `SourceService`, `FormService`, and `FusionService` (`tracker`, `analysisRecorder`, duplicate `sourcesByName` maps, dead fields).
- To: `FusionRun` becomes the single source of truth for the state the Match module needs, exposing verbs like `trackFailed`, `queueDisableOperation`, and `removeMatchAccount`.
- Impact: non-breaking internal refactor; `snapshot()`/`restore()` become more truthful.

**Break the matching ⇄ fusion ⇄ form cycles**
- From: `matchingService` imports `fusionService/helpers` and `formService/helpers`; `formService` imports matching types.
- To: match predicates move into `matchingService`; shared types (`OperationContext`, `FusionReportBlend`, `UrlContext`) move to `model/`; `formService` only consumes matching types, never produces them.
- Impact: internal dependency direction becomes one-way: `fusionService → matchingService → model`.

**Extract account-assembly recipe**
- From: `preProcessManagedAccount` recipe duplicated across `fusionService`, `identityProcessor`, and `decisionProcessor`.
- To: one account-assembly collaborator owns mode gates, layer application, Map/Define, and registration.
- Impact: deletes ~15 duplicated blocks and gives the Match module a real input seam.

**Create `MatchOutcomeDispatcher`**
- From: `ManagedAccountAnalyzer`, `ManagedAccountMatchingRunner`, `ManagedAccountOutcomeHandler`, and two duplicated resolution switches live in `fusionService`.
- To: a single `MatchOutcomeDispatcher` module in `matchingService/` owns scoring, resolution dispatch, and outcome application; `FusionService` calls `runMatchSweep(accounts, batchSize): MatchSweepResult`.
- Impact: the Match step gets a single interface and a single test surface; the duplicated switch disappears.

**Add domain term to the ubiquitous language**
- From: "Match outcome dispatch" is an unnamed concept scattered across `fusionService` and `matchingService`.
- To: the spec defines **Match outcome dispatch** as routing a scored managed source account to exact/partial/deferred/non-match and applying the result.

## Capabilities

### New Capabilities
- `match-outcome-dispatch`: Orchestrates the Match step for managed source accounts — scoring, resolution dispatch, and outcome application — behind a single interface (`runMatchSweep`).

### Modified Capabilities
- `ubiquitous-language`: Adds the canonical term `Match outcome dispatch` and clarifies that MatchingService owns the Match step while `FusionService` orchestrates operation runs.
- `fusion-run`: Tightens the requirement that `FusionRun` is the single source of truth for run-scoped state, including the tracker/recorder access needed by the Match module.

## Impact

- **Code:** `src/services/fusionService/fusionService.ts`, `src/services/matchingService/managedAccountAnalyzer.ts`, `managedAccountMatchingRunner.ts`, `managedAccountOutcomeHandler.ts`, `src/services/fusionService/helpers.ts`, `src/services/fusionService/collections.ts`, `src/model/fusionRun.ts`, `src/services/sourceService/sourceService.ts`.
- **APIs:** No connector-facing API changes; this is an internal architectural refactor.
- **Dependencies:** `matchingService` will no longer import from `fusionService`; `formService` keeps only type imports from `matchingService`.
- **Tests:** `fusionService.test.ts` will shrink as Match-dispatch coverage moves to `MatchOutcomeDispatcher` tests; new unit tests will drive `runMatchSweep` through its public interface.
