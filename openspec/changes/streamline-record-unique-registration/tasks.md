## 1. UniqueRegistrationPlan and selective mapping

- [x] 1.1 Add `UniqueRegistrationPlan` type and builder in `DefinitionService` (intersect unique def names with attribute map targets; compute passthrough names)
- [x] 1.2 Add unit tests for plan intersection in `definitionService/__tests__/`
- [x] 1.3 Add optional `onlyTargets?: ReadonlySet<string>` to `MappingService.mapAttributes` and filter `mappingTargets` loop
- [x] 1.4 Add unit tests for selective mapping in `mappingService/__tests__/mapService.test.ts`

## 2. Record unique registration service method

- [x] 2.1 Add `registerUniqueValuesFromRecordManagedAccount(account, plan)` (or equivalent) on `DefinitionService` using `FusionAccount.fromManagedAccount`, selective map, `registerUniqueAttributes`
- [x] 2.2 Add batch helper `registerUniqueValuesFromRecordManagedAccounts(accounts, mappingService, run)` with progress callback support
- [x] 2.3 Add unit tests covering mapped + passthrough + missing value cases

## 3. FusionService bulk pre-pass phase

- [x] 3.1 Add `processRecordUniqueRegistration()` on `FusionService` — filter Record sources with `includeRecordAccountsForMatching: false`, batch process, remove from `managedAccountsById`
- [x] 3.2 Wire into `accountListPhases.processPhase` after correlated sweep, before uncorrelated sweep
- [x] 3.3 Refactor `applyNonAuthoritativeNoMatch` / decision processor record path to reuse the same registration helper
- [x] 3.4 Update `fusionService.test.ts` and `matchOutcomeDispatcher.test.ts` for pre-pass behavior (match-disabled record accounts never scored)

## 4. Logging and progress

- [x] 4.1 Add `log.stepStart('record-unique-registration')` / `stepEnd` with account counts in `processPhase`
- [x] 4.2 Report progress with unit `registered` during bulk pass (`log.setProgress`)
- [x] 4.3 Optional: add `recordUniqueRegistered` to `OperationRunContext` event counters and EVENT_SUMMARY formatter

## 5. Documentation

- [x] 5.1 Update `docs/guides/source-configuration.md` — record-only path uses selective map + register, skips normal Define and match sweep
- [x] 5.2 Update `openspec/specs/ubiquitous-language` delta if needed during archive (record-only registration phase term)

## 6. Verification

- [x] 6.1 Run targeted tests: `npm test -- definitionService mappingService fusionService matchOutcomeDispatcher accountListPhases`
- [x] 6.2 Run `npm run lint`
