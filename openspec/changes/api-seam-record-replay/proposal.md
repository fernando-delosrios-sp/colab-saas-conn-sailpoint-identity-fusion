## Why

Record/replay is inverted. Recording captures operation outputs (`res.send`) and `FusionRun` snapshots but never records ISC API responses — the one dependency the feature exists to neutralize. Replay compensates by hand-mocking ~25 service methods in a 758-line `ReplayAdapter` that re-implements the pipeline, drifts from `corePipeline.ts`, and has latent crashes (undefined `nativeId`, double-mocked `processFusionAccounts`). Meanwhile, all ~60 ISC API call sites already funnel through `ClientService.call()` behind the `IscApiAdapter` interface, which has two adapters proving the seam is real. Recording and replaying at that seam makes the entire real pipeline the test subject and eliminates the hand-synced parallel implementation.

## What Changes

**Add `RecordingApiAdapter` — records at the API seam**
- From: ISC API responses flow through `SdkApiAdapter` unrecorded; `RecordingService` only captures outputs and snapshots
- To: `RecordingApiAdapter` decorates `SdkApiAdapter`, intercepting each of the 12 API getters and logging (method, args) → response pairs to an api-log file alongside the existing output capture
- Reason: Records the actual dependency — the API data — so replay can serve it without hand-mocking service internals
- Impact: `RecordingService` gains api-log persistence; `FusionRun.snapshot()` remains as an assertion artifact

**Add `ReplayApiAdapter` — serves recorded API responses**
- From: Replay constructs a `FakeApiAdapter` of empty objects (`{} as any`) and mocks ~25 service methods by hand to inject state
- To: `ReplayApiAdapter implements IscApiAdapter`, serving recorded responses by (method, args) key; unknown requests fail loudly as drift detection. The entire real pipeline runs — real services, real `PipelineRunner`, real `ServiceRegistry`
- Reason: Pipeline refactors no longer require coordinated harness edits; mocks type-check against the real interface
- Impact: `FakeApiAdapter` deleted; ~25 service-method mocks in `ReplayAdapter` deleted

**Refactor `ReplayAdapter` to use `ReplayApiAdapter` + real pipeline**
- From: 758-line `ReplayAdapter` re-implements `corePipeline` phases independently, reads `ChainState`, mocks service methods
- To: `ReplayAdapter.buildReplayContext` creates a real `ServiceRegistry` with `ReplayApiAdapter` configured from the scenario's api-log, delegates to `PipelineRunner.run()`, and captures `res.send()` outputs for comparison
- Reason: Pipeline drift eliminated; the adapter is a delegation layer, not a parallel implementation
- Impact: `ReplayAdapter` shrinks from ~758 lines to ~150 lines of delegation and output comparison

**Consolidate recording lifecycle**
- From: `RECORD_MODE` on `FusionRun` but `RECORD_CHAIN_NAME` + `VERBOSE_RECORDING` read directly in `RecordingService`; `finalize()` only fires on SIGINT/SIGTERM (clean exit loses `scenario.json`)
- To: `RecordingConfig` owned by `FusionConfig` with `mode`, `chainName`, and `verbose`; `RecordingService.finalize()` called from `createOperationHandler` finally block
- Reason: Complete centralization of recording config; clean exit produces complete scenario files
- Impact: `RecordingService` singleton removed (per-run instance); `scripts/record-chain.js` simplified

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client-service`: New `IscApiAdapter` implementations — `RecordingApiAdapter` (decorator, logs req→resp) and `ReplayApiAdapter` (serves recorded responses, drift detection)
- `recording-service`: `RecordingService` records api-log (not just outputs+snapshots); lifecycle config centralized; finalize on operation end
- `testing`: `ReplayAdapter` delegates to real pipeline with `ReplayApiAdapter`; `FakeApiAdapter` deleted; harness mocks reduced to one seam

## Impact

- **Files added**: `src/services/clientService/recordingApiAdapter.ts`, `src/services/clientService/replayApiAdapter.ts`
- **Files modified**: `src/services/recordingService.ts`, `src/services/serviceRegistry.ts`, `src/utils/operationHandler.ts`, `src/model/fusionRun.ts` (RecordingConfig), `src/model/config.ts`, `scripts/record-chain.js`
- **Files deleted**: `src/operations/__tests__/chain/harness/fakeApiAdapter.ts`
- **Files refactored**: `src/operations/__tests__/chain/harness/ReplayAdapter.ts`, chain test files, operation test files
- **No production code path changes** (record/replay is off by default; `SdkApiAdapter` used normally)
