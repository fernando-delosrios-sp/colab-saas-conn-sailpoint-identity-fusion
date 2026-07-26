## 1. Shared write classification

- [x] 1.1 Extract `isWriteMethod()` and write-method set from `src/services/clientService/replayApiAdapter.ts` into `src/services/clientService/apiWriteClassification.ts`
- [x] 1.2 Update `ReplayApiAdapter` to import shared classification; run existing replay adapter tests

## 2. DryRunApiAdapter

- [x] 2.1 Create `src/services/clientService/dryRunApiAdapter.ts` wrapping `SdkApiAdapter` (proxy pattern from `recordingApiAdapter.ts`)
- [x] 2.2 Implement in-memory shadow store with deterministic synthetic IDs for form creation, account PATCH, and source config PATCH
- [x] 2.3 Add unit tests in `src/services/clientService/__tests__/dryRunApiAdapter.test.ts` (read delegation, write inhibition, synthetic form IDs)

## 3. ServiceRegistry wiring

- [x] 3.1 Add `ServiceRegistry.activateDryRunMode()` to wrap client adapter with `DryRunApiAdapter`
- [x] 3.2 Call `activateDryRunMode()` at start of `src/operations/accountList.ts` when `dryRun.enabled`
- [x] 3.3 Add mutual exclusivity guard: reject dry-run when `recording.mode` is `record` or `replay`, or when `run.isRecordMode` is true

## 4. Unify accountList pipeline

- [x] 4.1 Remove dry-run early exit in `outputPhase` (`src/operations/helpers/accountListPhases.ts`); run `forEachISCAccount` + `res.send` with `refreshUniqueAttributes: true`
- [x] 4.2 Remove `isPersistentRun()` business-logic skips from `MatchOutcomeDispatcher` (auto-assign, partial match, orphan disable gate)
- [x] 4.3 Remove `isPersistentRun()` skip from `CorrelationManager.applyPerSourceCorrelationIfNeeded`
- [x] 4.4 Remove remaining setup/process/output phase persistence skips that duplicate adapter write inhibition (keep reset-flag early exit and dry-run epilogue branching)
- [x] 4.5 Remove or repurpose `FusionService.setPersistentRun()` / `isPersistentRun()` if no longer needed for business logic

## 5. Tests

- [x] 5.1 Update `src/operations/__tests__/accountList.test.ts` dry-run scenarios: assert account `res.send` calls and non-zero `rowsSent`
- [x] 5.2 Add write-suppression integration test (RecordingApiAdapter on inner; assert zero real writes during dry-run path)
- [x] 5.3 Run `npm test` and fix regressions

## 6. Documentation

- [x] 6.1 Update `docs/operations/dry-run.md`: Phase 5 streams accounts, adapter-based write inhibition, remove `rowsSent: 0`
- [x] 6.2 Update `docs/operations/account-list.md` dry-run section to match new behavior
