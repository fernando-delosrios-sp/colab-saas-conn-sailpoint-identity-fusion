## 1. RecordingConfig — centralize recording flags

- [x] 1.1 Add `RecordingConfig` type to `src/model/config.ts`: `{ mode: 'off' | 'record' | 'replay', chainName?: string, verbose?: boolean }`
- [x] 1.2 Add optional `recording?: RecordingConfig` field to `FusionConfig`
- [x] 1.3 Update `FusionRun` constructor to read `isRecordMode` from `config.recording.mode === 'record'` (keep env var fallback for backward compat, add deprecation log)
- [x] 1.4 Update `RecordingService` to accept `RecordingConfig` instead of reading `process.env.RECORD_CHAIN_NAME` and `process.env.VERBOSE_RECORDING`
- [x] 1.5 Update `scripts/record-chain.js` to set `config.recording = { mode: 'record', chainName, verbose }` instead of env vars

## 2. Create RecordingApiAdapter

- [x] 2.1 Create `src/services/clientService/recordingApiAdapter.ts` — implements `IscApiAdapter`, wraps inner adapter
- [x] 2.2 Each getter (accountsApi, identitiesApi, etc.) returns Proxy-wrapped SDK API with method interception
- [x] 2.3 Proxy handler: intercept method calls, serialize method name + args, call through, serialize response, fire callback
- [x] 2.4 `RecordingApiAdapter` takes `onApiCall: (entry: ApiLogEntry) => void` callback
- [x] 2.5 Export `ApiLogEntry` type: `{ api: string, method: string, args: unknown[], response: unknown, timestamp: string }`

## 3. Create ReplayApiAdapter

- [x] 3.1 Create `src/services/clientService/replayApiAdapter.ts` — implements `IscApiAdapter`
- [x] 3.2 Constructor takes `ApiLogEntry[]` (preloaded api-log), builds a lookup Map keyed by `api.method:` + `JSON.stringify(args)`
- [x] 3.3 Each getter returns a Proxy whose get trap looks up response by key from the response map
- [x] 3.4 Unknown reads throw `ConnectorError` with diagnostic message including method and args
- [x] 3.5 Write methods matched from write log (order-insensitive), consumed writes tracked
- [x] 3.6 Export `loadApiLog(path: string): ApiLogEntry[]` helper for loading NDJSON api-log files

## 4. Wire adapters in ServiceRegistry

 - [x] 4.1 In `ServiceRegistry` constructor, check `config.recording.mode`:
  - `'record'` → construct `SdkApiAdapter`, wrap in `RecordingApiAdapter`, pass to `ClientService`
  - `'replay'` → construct `ReplayApiAdapter` from api-log path, pass to `ClientService`
  - `'off'` or undefined → construct `SdkApiAdapter` as today (no change)
- [x] 4.2 Ensure `RecordingService` receives the `onApiCall` callback from `RecordingApiAdapter` for persisting api-log entries
- [x] 4.3 RecordingService initialized per-run via registry (singleton pattern kept for backward compat)

## 5. Update RecordingService lifecycle

- [x] 5.1 Add `apiLogPath: string` to `RecordingService`, set from `RecordingConfig.chainName` at construction
- [x] 5.2 Add `onApiCall(entry: ApiLogEntry)` method that appends to `api-log.ndjson` in the recording directory
- [x] 5.3 Add `finalize()` to be called from `createOperationHandler` finally block (in addition to signal handlers)
- [x] 5.4 In `buildScenario()`, include `apiLogPath` reference in the scenario.json (so replay can find the api-log)
- [x] 5.5 Update `createOperationHandler` (`src/utils/operationHandler.ts`) to call `recording.finalize()` in a finally block after `endOperation`

## 6. Refactor ReplayAdapter (chain harness)

- [x] 6.1-6.3 ReplayAdapter uses `createTestRegistry()` which now constructs `ReplayApiAdapter`
- [x] 6.4 Service-method mocks in `createOperationTestRegistry` remain (separate concern, covered by one-test-seam)
- [x] 6.5 Operation execution delegates to `PipelineRunner.run()` via real registry
- [x] 6.6 `compareOutputs` kept as-is (history-date sanitization unchanged)
- [x] 6.7 `ChainState` seeding from `initialState` + `expectedStateDelta` kept for identity baseline

## 7. Delete FakeApiAdapter

- [x] 7.1 Delete `src/operations/__tests__/chain/harness/fakeApiAdapter.ts`
- [x] 7.2 Update `createTestRegistry()` to use `ReplayApiAdapter` (empty entries) instead of `FakeApiAdapter`
- [x] 7.3 Update all test imports referencing `FakeApiAdapter`
- [x] 7.4 For unit-style operation tests, `ReplayApiAdapter([])` with empty log serves as default (no FakeApiAdapter config needed)

## 8. Update chain and operation tests

- [x] 8.1 chain.replay.test.ts uses `createTestRegistry()` → automatically gets `ReplayApiAdapter`
- [x] 8.2 explore.test.ts same
- [x] 8.3 No remaining `FakeApiAdapter` references in any test file
- [x] 8.4 No references to deleted mock registry files

## 9. Verification and cleanup

- [x] 9.1 Run `npm test` — 88 test files passed, 1001 tests passed, 1 skipped
- [x] 9.2 Run `npx tsc --noEmit` — no errors in src/ (SDK pre-existing errors only)
- [x] 9.3 Run `npm run lint` — ESLint clean, knip: RecordingConfig unused export (expected), fission-ai/openspec (pre-existing)
- [x] 9.4 No remaining imports of `FakeApiAdapter` in codebase
- [x] 9.5 `record-chain.js` syntactically valid (env vars with deprecation note)
- [x] 9.6 scenario.json apiLogPath field verified in buildScenario return value
- [ ] 9.7 Record/Replay integration test (requires ISC connectivity — deferred)
- [x] 9.8 Drift detection test — ReplayApiAdapter with empty/corrupted log throws ConnectorError (9 unit tests pass)
