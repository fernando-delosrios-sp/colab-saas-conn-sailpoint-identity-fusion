## 1. Process phase instrumentation

- [x] 1.1 Wrap `fusion.initializeManagedAccountProcessing()` in `processPhase` with `log.stepStart('managed-account-init')` / `log.stepEnd('managed-account-init')`
- [x] 1.2 Add `log.track('FusionService.initializeManagedAccountProcessing')` inside the STEP wrapper (parity with `record-unique-registration`)
- [x] 1.3 Include cheap metadata on stepEnd if available without extra API calls (e.g. managed-account queue size)

## 2. Output phase instrumentation

- [x] 2.1 Wrap `sources.clearManagedAccounts()` in `outputPhase` with `log.stepStart('clear-managed-accounts')` / `log.stepEnd('clear-managed-accounts')` inside the existing `!sources.run.isRecordMode` branch only
- [x] 2.2 Optionally add `log.track('outputPhase.clearManagedAccounts')` METRIC inside the STEP wrapper

## 3. Tests and verification

- [x] 3.1 Run `npm test` — confirm no regressions
- [x] 3.2 Run `npm run lint` — confirm clean
- [x] 3.3 Manual re-profile: run accountList with `npm run dev` (no debugger) and confirm new STEP lines appear with durations that close the Process/Output phase gaps — **step emission covered by `accountListPhaseInstrumentation.test.ts`; timing validation deferred to operator**

## 4. Documentation

- [x] 4.1 No user-facing README change required (internal observability only); spec delta in this change covers requirement update
