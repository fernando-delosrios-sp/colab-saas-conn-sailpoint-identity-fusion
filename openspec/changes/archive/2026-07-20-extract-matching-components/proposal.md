# Proposal: Extract Matching Components to matchingService/

## Why

Three managed-account matching components (`ManagedAccountAnalyzer`, `CandidateRegistry`, `ManagedAccountMatchingRunner`) live in `src/services/fusionService/` but have no FusionService dependency — they use clean state interfaces (`ManagedAccountAnalyzerState`, `CandidateRegistryDeps`, `ManagedAccountMatchingRunnerState`). They belong in `src/services/matchingService/` alongside the scoring algorithms.

## What Changes

Move 3 files from `fusionService/` to `matchingService/`:
- `managedAccountAnalyzer.ts`
- `candidateRegistry.ts`
- `managedAccountMatchingRunner.ts`

Update all imports in: the moved files, `fusionService.ts`, `managedAccountAnalysisRecorder.ts`, helpers, tests.

## Out of scope

- Outcome handler extraction (deferred — deep FusionService coupling)
- MatchService orchestrator class (not needed — FusionService orchestrates via runner)
