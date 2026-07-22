## 1. RecordingConfig — centralize recording flags

- [ ] 1.1 Add `RecordingConfig` type to `src/model/config.ts`: `{ mode: 'off' | 'record' | 'replay', chainName?: string, verbose?: boolean }`
- [ ] 1.2 Add optional `recording?: RecordingConfig` field to `FusionConfig`
- [ ] 1.3 Update `FusionRun` constructor to read `isRecordMode` from `config.recording.mode === 'record'` (keep env var fallback for backward compat, add deprecation log)
- [ ] 1.4 Update `RecordingService` to accept `RecordingConfig` instead of reading `process.env.RECORD_CHAIN_NAME` and `process.env.VERBOSE_RECORDING`
- [ ] 1.5 Update `scripts/record-chain.js` to set `config.recording = { mode: 'record', chainName, verbose }` instead of env vars

## 2. Create RecordingApiAdapter

- [ ] 2.1 Create `src/services/clientService/recordingApiAdapter.ts` — implements `IscApiAdapter`, wraps `SdkApiAdapter`
- [ ] 2.2 Each getter (accountsApi, identitiesApi, etc.) returns a Proxy over the real SDK API instance
- [ ] 2.3 Proxy handler: intercept method calls, serialize method name + args (using `sanitizeForJson`), call through to real SDK, serialize response, append to api-log via callback
- [ ] 2.4 `RecordingApiAdapter` takes `onApiCall: (entry: ApiLogEntry) => void` callback — `RecordingService` provides the append-to-file callback
- [ ] 2.5 Export `ApiLogEntry` type: `{ api: string, method: string, args: unknown[], response: unknown, timestamp: string }`

## 3. Create ReplayApiAdapter

- [ ] 3.1 Create `src/services/clientService/replayApiAdapter.ts` — implements `IscApiAdapter`
- [ ] 3.2 Constructor takes `ApiLogEntry[]` (preloaded api-log), builds a lookup `Map<string, unknown>` keyed by `api.method:` + `JSON.stringify(args)` (stable key ordering)
- [ ] 3.3 Each getter returns a Proxy whose get trap looks up `api.method:` + `JSON.stringify(args)` and returns the recorded response
- [ ] 3.4 Unknown reads (GET methods with no recorded match) throw `ConnectorError` with diagnostic message including method and args
- [ ] 3.5 For write methods (POST/PATCH/PUT/DELETE), assert the replayed call matches a recorded write (order-insensitive: match by args, consume from write queue)
- [ ] 3.6 Export `loadApiLog(path: string): ApiLogEntry[]` helper for loading NDJSON api-log files

## 4. Wire adapters in ServiceRegistry

- [ ] 4.1 In `ServiceRegistry` constructor, check `config.recording.mode`:
  - `'record'` → construct `SdkApiAdapter`, wrap in `RecordingApiAdapter`, pass to `ClientService`
  - `'replay'` → construct `ReplayApiAdapter` from api-log path, pass to `ClientService`
  - `'off'` or undefined → construct `SdkApiAdapter` as today (no change)
- [ ] 4.2 Ensure `RecordingService` receives the `onApiCall` callback from `RecordingApiAdapter` for persisting api-log entries
- [ ] 4.3 Remove process-based singleton from `RecordingService` (per-run instance via registry)

## 5. Update RecordingService lifecycle

- [ ] 5.1 Add `apiLogPath: string` to `RecordingService`, set from `RecordingConfig.chainName` at construction
- [ ] 5.2 Add `onApiCall(entry: ApiLogEntry)` method that appends to `api-log.ndjson` in the recording directory
- [ ] 5.3 Add `finalize()` to be called from `createOperationHandler` finally block (in addition to signal handlers)
- [ ] 5.4 In `buildScenario()`, include `apiLogPath` reference in the scenario.json (so replay can find the api-log)
- [ ] 5.5 Update `createOperationHandler` (`src/utils/operationHandler.ts`) to call `recording.finalize()` in a finally block after `endOperation`

## 6. Refactor ReplayAdapter (chain harness)

- [ ] 6.1 In `buildReplayContext`, load api-log from `scenario.apiLogPath` using `loadApiLog()`
- [ ] 6.2 Construct `ReplayApiAdapter` with the loaded api-log entries
- [ ] 6.3 Pass `ReplayApiAdapter` to `createTestRegistry()` as the adapter override
- [ ] 6.4 Remove all ~25 service-method mocks (`processFusionAccounts`, `fetchManagedAccounts`, `fetchIdentityById`, `getISCAccount`, `forEachISCAccount`, etc.) — real services handle everything
- [ ] 6.5 Delegate operation execution to `PipelineRunner.run()` via the real registry; capture `res.send()` outputs with a mock res object
- [ ] 6.6 Keep `compareOutputs` as-is (history-date sanitization, output comparison logic unchanged)
- [ ] 6.7 Keep `ChainState` seeding from `initialState` + `expectedStateDelta` for the initial identity baseline only

## 7. Delete FakeApiAdapter

- [ ] 7.1 Delete `src/operations/__tests__/chain/harness/fakeApiAdapter.ts`
- [ ] 7.2 Update `createTestRegistry()` to use `ReplayApiAdapter` (or a hand-crafted empty api-log) instead of `FakeApiAdapter`
- [ ] 7.3 Update all test imports referencing `FakeApiAdapter`
- [ ] 7.4 For unit-style operation tests that need specific API responses, create inline `ApiLogEntry[]` arrays instead of configuring `FakeApiAdapter`

## 8. Update chain and operation tests

- [ ] 8.1 Update chain replay test (`chain.replay.test.ts`) — `buildReplayContext` now loads api-log and uses `ReplayApiAdapter`
- [ ] 8.2 Update chain explore test (`explore.test.ts`) — same api-log loading path
- [ ] 8.3 Update any operation test that directly referenced `FakeApiAdapter` to use `ReplayApiAdapter` or inline api-logs
- [ ] 8.4 Ensure `buildReplayContext` no longer references deleted mock registry files

## 9. Verification and cleanup

- [ ] 9.1 Run `npm test` — all tests must pass (chain replay, operation tests, unit tests)
- [ ] 9.2 Run `npx tsc --noEmit` — no type errors
- [ ] 9.3 Run `npm run lint` — no lint errors, no dead imports
- [ ] 9.4 Verify no remaining imports of `FakeApiAdapter` in the codebase
- [ ] 9.5 Verify `record-chain.js` still works (passes `--recording` config override)
- [ ] 9.6 Verify recorded scenario.json now includes `apiLogPath` field
- [ ] 9.7 Record a two-step chain, replay it, confirm output comparison passes
- [ ] 9.8 Verify drift detection: intentionally add an unrecorded API call, confirm replay fails loudly
