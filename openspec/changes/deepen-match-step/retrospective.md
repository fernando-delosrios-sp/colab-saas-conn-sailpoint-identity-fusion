# Retrospective: deepen-match-step

## What went well

- The Match step is now centralized in `MatchOutcomeDispatcher` with a single public method.
- Import cycles between `matchingService`, `fusionService`, and `formService` are broken.
- `FusionRun` exposes the required domain verbs (`queueDisableOperation`, `removeMatchAccount`, `claimAccount`, `trackFailed`).
- `AccountAssembly` eliminated duplicated account-assembly recipe across processors.
- Domain term **Match outcome dispatch** is documented in ubiquitous language and glossary.
- ServiceRegistry now wires `MatchOutcomeDispatcher` with real collaborators, removing closures over `FusionService`.
- All automated checks pass:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npx madge --circular --ts-config tsconfig.json src/`
  - `npx vitest run` — 941 passed, 2 skipped
- Two pre-existing test failures in `generateReport.test.ts` and `identityService.test.ts` were also fixed during this session.

## What could be improved

- `FusionService` still constructs `AccountAssembly` and `CorrelationManager` internally because they need `FusionService`-scoped callbacks (`buildFusionBlend`, `isAggregationAccountListMode`). Future work could extract a `FusionReportBlendBuilder` and pass `commandType`/`operationContext` into `CorrelationManager` so these collaborators can be constructed entirely in `ServiceRegistry`.

## Misses / follow-up

- None blocking.

## Decisions

- Kept `runMatchSweep` as the single public method; added an optional `analysisOnly` flag instead of a separate public `analyzeAccounts` method.
- Introduced a local `DecisionProcessor` interface in `matchOutcomeDispatcher.ts` so the dispatcher depends on a narrow seam rather than the full `DecisionProcessor` class, avoiding an import cycle.
- Moved `match-outcome-dispatch` delta spec to `openspec/specs/matching-service/match-outcome-dispatch/spec.md` so it lives with the matching-service specs.
