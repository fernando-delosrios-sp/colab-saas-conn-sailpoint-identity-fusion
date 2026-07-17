## 1. Extract report account resolver

- [x] 1.1 Create `src/services/fusionService/__tests__/reportAccountResolver.test.ts` with tests for `resolveReportAccountId` and `resolveReportAccountIdValue` covering stored ISC id, managed key resolution, empty inputs, and raw value resolution.
- [x] 1.2 Run `npm test -- src/services/fusionService/__tests__/reportAccountResolver.test.ts` and confirm the suite fails (module not found).
- [x] 1.3 Create `src/services/fusionService/reportAccountResolver.ts` exporting `resolveReportAccountId(fusionAccount, sources)` and `resolveReportAccountIdValue(accountId, sources)` using `SourceService.resolveIscAccountIdForManagedKey`.
- [x] 1.4 Run `npm test -- src/services/fusionService/__tests__/reportAccountResolver.test.ts` and confirm the suite passes.
- [x] 1.5 Update `src/services/fusionService/fusionService.ts` to import the resolver functions and replace the two private `resolveReportAccountId*` methods with thin wrappers that delegate to the new module.
- [x] 1.6 Update `src/services/fusionService/fusionReportBuilder.ts` to import the resolver functions, add `sources: SourceService` to `FusionReportState`, remove the `resolveReportAccountId` callback, and replace its call with direct resolver calls.
- [x] 1.7 Update all call sites that create `FusionReportState` to provide `sources` instead of the callback.
- [x] 1.8 Run `npm test -- src/services/fusionService/__tests__/fusionService.test.ts` and `npm run typecheck` to ensure no regressions.
- [x] 1.9 Commit the report resolver changes.

## 2. Extract managed account analysis recorder

- [x] 2.1 Read the current `recordManagedAccountAnalysis` and `trackFailedMatching` implementations in `src/services/fusionService/fusionService.ts` to confirm all branches, logging, and side effects are captured exactly.
- [x] 2.2 Create `src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts` with tests for identity-backed match recording, deferred match recording, non-match recording, authoritative deferred skip, and failed matching recording.
- [x] 2.3 Run `npm test -- src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts` and confirm the suite fails (module not found).
- [x] 2.4 Create `src/services/fusionService/managedAccountAnalysisRecorder.ts` exporting `ManagedAccountAnalysisRecorder` with a constructor dependency interface (`log`, `tracker`, `urlContext`, `reportAttributes`, `sourcesByName`, `config`, `analyzer`, `sources`) and `recordAnalysis`/`trackFailed` methods that reproduce the exact behavior of the original private methods.
- [x] 2.5 Run `npm test -- src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts` and confirm the suite passes.
- [x] 2.6 Update `src/services/fusionService/fusionService.ts` to import `ManagedAccountAnalysisRecorder`, initialize it in the constructor with the required dependencies, and replace calls to `this.recordManagedAccountAnalysis(analysis)` with `this.analysisRecorder.recordAnalysis(analysis)` and `this.trackFailedMatching(...)` with `this.analysisRecorder.trackFailed(...)`.
- [x] 2.7 Delete the private `recordManagedAccountAnalysis` and `trackFailedMatching` methods from `FusionService` after verifying all references are removed.
- [x] 2.8 Run `npm test` and `npm run typecheck` to confirm the full test suite passes and type checks are clean.
- [x] 2.9 Run `npm run lint` on the changed source and test files to confirm no lint errors.
- [x] 2.10 Commit the managed account analysis recorder changes.

## 3. Documentation and final verification

- [x] 3.1 Review inline comments and JSDoc in `src/services/fusionService/fusionService.ts`, `reportAccountResolver.ts`, `managedAccountAnalysisRecorder.ts`, and `fusionReportBuilder.ts` to ensure they remain accurate after the refactor.
- [x] 3.2 Run the full project test suite (`npm test`), typecheck (`npm run typecheck`), and lint (`npm run lint`) one final time.
- [x] 3.3 Update AGENTS.md if any project conventions, build steps, or test commands changed as a result of this refactor.
- [x] 3.4 Mark the change as ready for final review.
