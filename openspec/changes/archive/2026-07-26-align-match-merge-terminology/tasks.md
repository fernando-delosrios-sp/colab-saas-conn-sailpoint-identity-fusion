## 1. Ubiquitous language and documentation

- [x] 1.1 Update `openspec/specs/ubiquitous-language/spec.md` via archive (delta already authored)
- [x] 1.2 Sync `docs/concepts/glossary.md` with new Merge / Manual merge / Automatic merge entries and retired terms
- [x] 1.3 Update `docs/guides/match.md`, `docs/guides/matching-algorithms.md`, `docs/operations/account-list.md`, and README merge vocabulary
- [x] 1.4 Add CHANGELOG entry noting breaking rename (config keys, report wire values, snapshot fields)

## 2. Configuration

- [x] 2.1 Rename keys in `connector-spec.json`: `fusionEnableAutoMerge`, `fusionAutoMergeScore`; update labels and help text to "automatic merge"
- [x] 2.2 Update `src/data/config/settings/matchingSettings.ts`: new keys, validation messages, `migrateConfigKey` from old keys
- [x] 2.3 Update `FusionConfig` in `src/model/config.ts` and any defaults in `connectorSpecInitialValues` / runtime defaults
- [x] 2.4 Update `matchingSettings.test.ts` for new key names

## 3. Domain model and run state

- [x] 3.1 Rename `FusionDecision.automaticAssignment` → `automaticMerge` in `src/model/form.ts`
- [x] 3.2 Rename `autoAssignedIdentityIds` → `autoMergedIdentityIds`, `markAutoAssigned` → `markAutoMerged`, snapshot `autoMergedIds` in `src/model/fusionRun.ts` and tests
- [x] 3.3 Update history messages in `src/model/fusionCollections.ts` to merge vocabulary
- [x] 3.4 Update `operationRunContext.ts` and `operationHeartbeat.ts`: event `autoMerged`, counter renames

## 4. Services — forms, matching, fusion

- [x] 4.1 Rename `fusionAssignmentDecisionMap` → `fusionMergeDecisionMap`, `getFusionMergeDecision` in `formService.ts`
- [x] 4.2 Update `formBuilder.ts` and `formService/helpers.ts` review copy and synthetic merge decision submitter text
- [x] 4.3 Update `matchOutcomeDispatcher.ts`, `matchingService.ts` for config keys and `automaticMerge`
- [x] 4.4 Rename `authorizedLinkDecision` → `mergeDecision` in `fusionService.ts`, `decisionProcessor.ts`, `correlationManager.ts`
- [x] 4.5 Update `fusionService/types.ts`: `merge-existing-identity`, `automaticMerge` on report types

## 5. Reports and email

- [x] 5.1 Update `reportService.ts` and `fusionReportBuilder.ts` for new wire values and config keys
- [x] 5.2 Update `emailService/helpers.ts` templates: `automaticMerge`, `isAutoMerge`
- [x] 5.3 Update golden/expected test artifacts and chain fixtures referencing old strings

## 6. Verification

- [x] 6.1 Repo-wide search: no remaining `assign-existing-identity`, `automaticAssignment`, `fusionEnableAutoAssignment`, `authorizedLinkDecision`, `Auto-assigned` in `src/` or `docs/` (except `migrateConfigKey` sources)
- [x] 6.2 Run `npm test` and `npm run lint`
