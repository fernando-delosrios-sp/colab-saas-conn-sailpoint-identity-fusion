# Tasks: Extract Map/Define/Match Services

## 1. FusionRun — Centralized State Container

- [x] 1.1 Create `src/model/fusionRun.ts` with FusionRun class and RunStateSnapshot type
- [x] 1.2 Define FusionRun fields: managedAccounts, identities, fusionAccounts, matching state, metrics
- [x] 1.3 Implement FusionRun.snapshot() method returning serializable RunStateSnapshot
- [x] 1.4 Implement FusionRun.restore(snapshot) method for deterministic replay
- [x] 1.5 Write FusionRun unit tests (construction, snapshot, restore)
- [x] 1.6 Update ServiceRegistry to instantiate FusionRun before other services

## 2. Move State into FusionRun

- [x] 2.1 Move managedAccountsById, managedAccountsByIdentityId from SourceService to FusionRun
- [ ] 2.2 Move identityMap, identityCount from IdentityService to FusionRun
- [ ] 2.3 Move fusionAccountMap, fusionIdentityMap from FusionService to FusionRun
- [ ] 2.4 Move autoAssignedIdentityIds, linkedAccountKeyIndex, analysisRecorder from FusionService to FusionRun
- [ ] 2.5 Move sourcesByName, managedSources from SourceService to FusionRun
- [ ] 2.6 Move form decisions and pending state from FormService to FusionRun
- [ ] 2.7 Update all service methods to read/write FusionRun instead of internal fields
- [ ] 2.8 Verify all existing tests pass (behavior unchanged)

## 3. MapService + DefineService Extraction

- [ ] 3.1 Create `src/services/mapService/` directory with MapService class
- [ ] 3.2 Extract mapAttributes, attribute mapping config, attrSplit/attrConcat from AttributeService to MapService
- [ ] 3.3 Extract helper functions (processAttributeMapping, buildAttributeMappingConfig) to MapService
- [ ] 3.4 Create `src/services/defineService/` directory with DefineService class
- [ ] 3.5 Extract refreshAllAttributes, refreshNormalAttributes, refreshUniqueAttributes to DefineService
- [ ] 3.6 Extract buildVelocityContext, context helpers, template evaluator to DefineService
- [ ] 3.7 Extract StateWrapper, counter management, unique value registration to DefineService
- [ ] 3.8 Extract key generation (getSimpleKey, getCompoundKey) to DefineService
- [ ] 3.9 Update ServiceRegistry to instantiate MapService and DefineService
- [ ] 3.10 Update FusionService and operation handlers to use MapService and DefineService
- [ ] 3.11 Delete `src/services/attributeService/` directory
- [ ] 3.12 Update map-service and define-service specs
- [ ] 3.13 Verify all existing tests pass (behavior unchanged)

## 4. MatchService Extraction

- [ ] 4.1 Create `src/services/matchService/` directory with MatchService class
- [ ] 4.2 Move ScoringService scoring algorithms into MatchService
- [ ] 4.3 Move outcome handlers from FusionService to MatchService (handleExactMatch, handleIdentityMatch, handlePartialMatch, handleDeferredMatch, handleNonMatch)
- [ ] 4.4 Move ManagedAccountMatchingRunner to matchService/ directory
- [ ] 4.5 Move ManagedAccountAnalyzer to matchService/ directory
- [ ] 4.6 Move CandidateRegistry to matchService/ directory
- [ ] 4.7 Give DecisionProcessor explicit dependencies instead of FusionService reference
- [ ] 4.8 Give CorrelationManager explicit dependencies instead of FusionService reference
- [ ] 4.9 Update ServiceRegistry to instantiate MatchService (replaces ScoringService)
- [ ] 4.10 Update FusionService to delegate matching to MatchService
- [ ] 4.11 Delete `src/services/scoringService/` directory
- [ ] 4.12 Expand match-service spec, shrink fusion-service spec
- [ ] 4.13 Verify all existing tests pass (behavior unchanged)

## 5. RecordingService Simplification

- [ ] 5.1 Update RecordingService.startOperation to receive FusionRun instead of individual services
- [ ] 5.2 Update RecordingService.endOperation to call run.snapshot() instead of snapshotState(sources, identities, forms)
- [ ] 5.3 Remove snapshotState method that digs into individual service internals
- [ ] 5.4 Update recording-service spec
- [ ] 5.5 Verify recording tests pass

## 6. Documentation & Diagrams

- [ ] 6.1 Update ubiquitous-language spec with new terms (MapService, DefineService, MatchService, FusionRun) and retired terms (AttributeService, ScoringService)
- [ ] 6.2 Update docs/concepts/glossary.md with FusionRun entry
- [ ] 6.3 Update 6 .drawio diagram files: rename AttributeService → MapService + DefineService, ScoringService → MatchService
- [ ] 6.4 Delete attribute-service spec (replaced by map-service + define-service)
- [ ] 6.5 Update openspec/specs/ directory for renamed/deleted specs

## 7. Final Verification

- [ ] 7.1 Run full test suite: `npm test`
- [ ] 7.2 Run linter: `npm run lint`
- [ ] 7.3 Run typecheck: `npm run typecheck` (if available)
- [ ] 7.4 Verify no references to AttributeService or ScoringService remain in imports
- [ ] 7.5 Verify no references to old field names (this.fusionAccountMap, this.scoring, this.attributes) remain
