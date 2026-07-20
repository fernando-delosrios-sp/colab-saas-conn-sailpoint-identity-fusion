# Tasks: Complete FusionRun Cleanup — Sync Specs

## Spec Updates

- [x] 1. Update `fusion-service/spec.md`:
  - [x] 1.1 Update "FusionService reads fusion accounts from FusionRun" scenario to reflect `run.fusionAccountMap` pattern
  - [x] 1.2 Add "sourcesByName" to the list of maps moved to FusionRun in "FusionService receives state via FusionRun"
  - [x] 1.3 Add requirement: Processors receive FusionRun for state access, FusionService for service methods
  - [x] 1.4 Add requirement: CorrelationManager receives explicit dependencies (not FusionService)
  - [x] 1.5 Update "Internal maps" list to include `linkedAccountKeyIndex`
- [x] 2. Update `fusion-run/spec.md`:
  - [x] 2.1 Add `sourcesByName` and `currentRunNonMatchedKeysBySource` to "FusionRun holds all run-scoped data"
  - [x] 2.2 Align snapshot spec with actual `snapshot()` fields (fusionAccounts, identities, not fusionIdentities)
  - [x] 2.3 Add `phaseTimings` to snapshot spec

## Implementation (already done)

- [x] 3. IdentityProcessor receives `run: FusionRun` directly
- [x] 4. DecisionProcessor receives `run: FusionRun` directly
- [x] 5. FusionService.sourcesByName removed; getter delegates to run
- [x] 6. CorrelationManager takes explicit deps (config, log, sources, identities, isAggregationMode)
- [x] 7. All tests pass (671), typecheck clean, lint clean
