## Why

`FusionService` has accumulated multiple responsibilities, including report-account ID resolution and managed-account analysis recording. These two concerns are self-contained, depend on narrow interfaces, and are difficult to unit test while trapped inside a large class. Extracting them into focused modules reduces the god-object surface area, improves testability, and makes future changes safer without altering connector behavior.

## What Changes

**Report Account Resolution**
- From: `FusionService.resolveReportAccountId` and `resolveReportAccountIdValue` private methods; `FusionReportState` carries a callback.
- To: Pure functions in `src/services/fusionService/reportAccountResolver.ts`; `fusionReportBuilder.ts` imports them directly and receives `SourceService`.
- Reason: Decouple report construction from `FusionService` and make ID resolution independently testable.
- Impact: Non-breaking internal refactor.

**Managed Account Analysis Recording**
- From: `FusionService.recordManagedAccountAnalysis` and `trackFailedMatching` private methods.
- To: `ManagedAccountAnalysisRecorder` class in `src/services/fusionService/managedAccountAnalysisRecorder.ts` with a narrow dependency interface.
- Reason: Isolate tracker-mutation logic and cover it with focused unit tests.
- Impact: Non-breaking internal refactor.

**Tests**
- Add `src/services/fusionService/__tests__/reportAccountResolver.test.ts`.
- Add `src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts`.
- All existing `fusionService.test.ts` tests continue to pass without modification.

## Capabilities

### New Capabilities
- `reportService`: Report account ID resolution via `reportAccountResolver.ts` for ISC account link generation.
- `recordingService`: Managed account analysis recording via `managedAccountAnalysisRecorder.ts` into `AggregationTracker`.

### Modified Capabilities
- None. This change is a structural refactor with no external behavioral changes.

## Impact

- Affected files: `src/services/fusionService/fusionService.ts`, `src/services/fusionService/fusionReportBuilder.ts`, plus two new source files and two new test files.
- No API or configuration changes.
- `npm test`, `npm run typecheck`, and `npm run lint` must remain clean.
