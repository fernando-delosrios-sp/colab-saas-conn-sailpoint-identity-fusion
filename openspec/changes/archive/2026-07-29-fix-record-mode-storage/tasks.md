## 1. Recording config bridge

- [x] 1.1 Add `resolveRecordingConfig()` in `src/data/config/resolveRecordingConfig.ts` with env fallback for `RECORD_MODE`, `RECORD_CHAIN_NAME`, `VERBOSE_RECORDING`
- [x] 1.2 Extend `RecordingConfig` in `src/model/config.ts` with optional `store?: 'ndjson' | 'sqlite'`
- [x] 1.3 Wire `resolveRecordingConfig()` in `safeReadConfig()` after settings pipeline
- [x] 1.4 Update `FusionRun` constructor to derive `isRecordMode` from resolved `config.recording.mode` only (remove direct env read)
- [x] 1.5 Add `src/data/config/__tests__/resolveRecordingConfig.test.ts` — env fallback, explicit config precedence
- [x] 1.6 Update `src/model/__tests__/fusionRun.test.ts` for resolved-config behavior

## 2. Pluggable RecordingStore

- [x] 2.1 Add `RecordingStore` and `ApiLogReader` interfaces in `src/services/recordingService/recordingStore.ts`
- [x] 2.2 Implement `NdjsonRecordingStore` in `src/services/recordingService/ndjsonRecordingStore.ts` — append api-log, steps, phases, manifest
- [x] 2.3 Add `createRecordingStore(config, dir)` factory (default `'ndjson'`)
- [x] 2.4 Refactor `RecordingService` to delegate I/O to store; remove direct fs writes for api-log/steps

## 3. Recording lifecycle

- [x] 3.1 Remove `RecordingService` singleton; instantiate per `ServiceRegistry` in record mode
- [x] 3.2 Split `finalize()` into `finalizeOnce()` — write scenario.json + manifest; retain steps.ndjson
- [x] 3.3 Remove per-operation `finalize()` from `createOperationHandler` finally block; register process exit handlers for `finalizeOnce()`
- [x] 3.4 Log resolved recording config and artifact directory at ServiceRegistry startup when recording enabled
- [x] 3.5 Update `src/services/__tests__/recordingService.test.ts` — manifest, steps retained, finalize-once

## 4. Replay loading

- [x] 4.1 Refactor `loadApiLog` in `replayApiAdapter.ts` to support manifest-based loading via store factory
- [x] 4.2 Update `ServiceRegistry` replay path to read store type from manifest when chain directory exists
- [x] 4.3 Add/update tests in `replayApiAdapter.test.ts` for manifest-based load

## 5. Diagnostic artifacts

- [x] 5.1 Hook log service phase/step helpers to append to `phases.ndjson` when recording active
- [x] 5.2 Write `reports/aggregation.json` in `reportEpilogue` when record mode and aggregation report generated
- [x] 5.3 Enrich `manifest.json` with api-log entry count, phase count, artifact paths

## 6. record-chain.js and integration

- [x] 6.1 Update `scripts/record-chain.js` — log expected artifact paths on startup; verify manifest/scenario/api-log on exit; warn if api-log empty
- [x] 6.2 Add ServiceRegistry wiring test: `RECORD_MODE=true` env only → `RecordingApiAdapter` active
- [x] 6.3 Run `npm test` and `npm run lint`

## 7. Documentation

- [x] 7.1 Update developer/recording docs if present (or add brief section to README) describing artifact layout and `npm run record` output
- [x] 7.2 Update JSDoc on `RecordingConfig`, `resolveRecordingConfig`, and `RecordingStore` public surfaces
- [x] 7.3 N/A — no connector-spec.json or ISC UI config change (dev-only env vars)

## 8. Changelog

- [x] 8.1 Create or update changelog entry for record mode storage fix
- [x] 8.2 Confirm entry covers: env bridge fix, artifact layout, pluggable store default
