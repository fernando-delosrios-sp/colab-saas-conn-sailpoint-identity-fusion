## Why

Record mode appears broken for local development: `npm run record` sets `RECORD_MODE=true` but only `connector.log` is produced — no `scenario.json`, no `api-log.ndjson`, and replay cannot run. Root cause is a split-brain: `FusionRun.isRecordMode` honors the env var while `ServiceRegistry` only wires `RecordingService` when `config.recording.mode === 'record'`, and `safeReadConfig()` never bridges env vars into `FusionConfig.recording`. The env→config bridge was planned in archived `2026-07-22-api-seam-record-replay` but never shipped. Secondary issues (singleton finalize-on-every-operation, deleted `steps.ndjson`, silent failure) further degrade multi-op chain recording.

## What Changes

**Env→config bridge for recording**
- From: `RECORD_MODE` env sets `FusionRun.isRecordMode` but `config.recording.mode` stays undefined; `RecordingService` never activates
- To: `resolveRecordingConfig()` in `safeReadConfig()` maps env vars to `FusionConfig.recording`; `FusionRun` and `ServiceRegistry` use the same resolved config
- Reason: Single source of truth so record mode actually captures api-log and scenario artifacts
- Impact: Non-breaking; record/replay remains off by default

**Pluggable RecordingStore with NDJSON default**
- From: `RecordingService` writes files directly; no manifest; `steps.ndjson` deleted on finalize
- To: `RecordingStore` interface with `NdjsonRecordingStore` default; `manifest.json` on finalize; retain `steps.ndjson`
- Reason: Structured local storage for replay data; swappable backend (SQLite later) without pipeline changes
- Impact: Non-breaking; replay still reads api-log via `ApiLogReader`

**Recording lifecycle finalize-once**
- From: Singleton `RecordingService`; `finalize()` in every operation's `finally` block
- To: Per-run instance; finalize once at process exit (signals / beforeExit)
- Reason: Multi-operation chain recording must accumulate steps and api-log across ops
- Impact: Non-breaking for single-op accountList runs

**Phase and report artifacts (diagnostic)**
- From: No phase-boundary persistence; no local report copy
- To: Append PHASE/STEP summaries to `phases.ndjson`; optional `reports/aggregation.json` when report epilogue runs
- Reason: Inspectable run timeline beyond plain stdout logs
- Impact: Non-breaking; email/send behavior unchanged

**record-chain.js verification**
- From: Assumes scenario saved; no artifact validation
- To: Log expected paths on startup; warn on exit if api-log empty or manifest missing
- Reason: Fail loud when recording is inactive
- Impact: Dev script only

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recording-service`: Env bridge via `resolveRecordingConfig`; pluggable `RecordingStore`; manifest; finalize-once; phase/report artifacts
- `fusion-run`: `isRecordMode` derived from resolved `config.recording`, not direct env read
- `client-service`: `loadApiLog` accepts path or `ApiLogReader`; replay reads store type from manifest

## Impact

- **Files added**: `src/data/config/resolveRecordingConfig.ts`, `src/services/recordingService/recordingStore.ts`, `src/services/recordingService/ndjsonRecordingStore.ts`, `src/data/config/__tests__/resolveRecordingConfig.test.ts`
- **Files modified**: `src/data/config/readConfig.ts`, `src/model/config.ts`, `src/model/fusionRun.ts`, `src/services/recordingService.ts`, `src/services/serviceRegistry.ts`, `src/utils/operationHandler.ts`, `src/services/clientService/replayApiAdapter.ts`, `src/services/logService/helpers.ts`, `src/operations/helpers/accountListPhases.ts`, `scripts/record-chain.js`, `openspec/specs/recording-service/spec.md`
- **Tests**: `resolveRecordingConfig.test.ts`, updates to `fusionRun.test.ts`, `recordingService.test.ts`, ServiceRegistry wiring test
- **No production path change** when recording mode is off (default)
