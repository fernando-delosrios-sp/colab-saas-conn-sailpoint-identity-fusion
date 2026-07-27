## 1. LogService API

- [x] 1.1 Add `phaseStartedAt` to `OperationRunContext`; set in `phaseStart`, read in new `phaseEnd`
- [x] 1.2 Implement `phaseEnd(phaseNumber, phase, detail?)` emitting `PHASE N Phase END … elapsed=`
- [x] 1.3 Implement `detail(data)` emitting `DETAIL key=value …`
- [x] 1.4 Implement `epilogueEnd(block, detail?)` emitting `EPILOGUE block END … elapsed=`
- [x] 1.5 Add unit tests in `logService.test.ts` and `operationRunContext.test.ts`

## 2. Bootstrap logging

- [x] 2.1 Create `src/services/logService/bootstrapLog.ts` with `[config]` prefix
- [x] 2.2 Migrate `matchingSettings.ts`, `developerSettings.ts`, `assertLite.ts`, `readConfig.ts`
- [x] 2.3 Update `operationHandler.ts` to emit `DETAIL mode=…` with operation prefix after registry creation

## 3. Account-list phase merge

- [x] 3.1 Remove `timer.phase('PHASE N: …')` from `accountList.ts` and `accountListPhases.ts`
- [x] 3.2 Add `log.phaseEnd()` after each phase in `accountList.ts`
- [x] 3.3 Replace epilogue `timer.phase('Epilogue: …')` with `log.epilogueEnd('report')`
- [x] 3.4 Use `PhaseTimer.recordElapsed()` for HTML report timing breakdown (no host colon lines)
- [x] 3.5 Update `accountList.test.ts` and `accountListPhaseInstrumentation.test.ts`

## 4. Account-list DETAIL conversion

- [x] 4.1 Convert free-form INFO in `accountListPhases.ts` to `log.detail()`
- [x] 4.2 Convert milestone INFO in `fusionService.ts`, `identityProcessor.ts`, `decisionProcessor.ts`
- [x] 4.3 Deduplicate email logs in `emailService.ts`; add `formId` to single DETAIL line
- [x] 4.4 Convert `workflowService.ts` workflow resolution to DETAIL
- [x] 4.5 Add `emailSent` to EVENT_SUMMARY in `operationHeartbeat.ts`

## 5. Other operations STEP migration

- [x] 5.1 Migrate `accountCreate.ts` to STEP start/end
- [x] 5.2 Migrate `accountEnable.ts` and `accountDisable.ts`
- [x] 5.3 Migrate `testConnection.ts`
- [x] 5.4 Audit and migrate `accountRead.ts`, `accountUpdate.ts`, `entitlementList.ts`, `accountDiscoverSchema.ts`

## 6. Service log routing

- [x] 6.1 Route `stateWrapper.ts` through registry log with bootstrapLog fallback
- [ ] 6.2 Add ESLint/knip rule restricting direct SDK `logger` imports outside allowlist (deferred — remaining direct logger use is in logService, bootstrapLog, and form/velocity helpers)

## 7. Documentation

- [x] 7.1 Update `docs/guides/advanced-connection-settings.md` — DETAIL kind, `[config]` prefix, grep migration table
- [x] 7.2 Update `docs/concepts/glossary.md` — DETAIL line, STATUS api segment, EPILOGUE format

## 8. Verification

- [x] 8.1 Run `npm test` — all suites green
- [x] 8.2 Run `npm run lint`
- [ ] 8.3 Dry-run accountList and grep log for no `PHASE [1-5]:`, no duplicate email lines, known KIND prefixes (manual — requires tenant run)
