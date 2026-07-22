## Context

The connector has a record/replay feature with a fundamental inversion: recording captures operation outputs (`res.send`) and `FusionRun` snapshots, but the ISC API data — the dependency the feature exists to neutralize — flows through `SdkApiAdapter` unrecorded. The replay side compensates with a 758-line `ReplayAdapter` that re-implements the pipeline by hand-mocking ~25 service methods over a `FakeApiAdapter` of empty API objects. The 2026-07-22 architecture review surfaced this as the keystone fix: move recording to the `IscApiAdapter` seam where all ~60 ISC API call sites funnel through `ClientService.call()`.

The building blocks already exist:
- `IscApiAdapter` interface with 12 lazy getters (accountsApi, identitiesApi, searchApi, sourcesApi, customFormsApi, workflowsApi, entitlementsApi, transformsApi, governanceGroupsApi, taskManagementApi, identityProfilesApi, identityAttributesApi)
- `SdkApiAdapter` — production adapter building real SDK API instances via `Configuration`
- `FakeApiAdapter` — test adapter returning empty `{} as any` objects (to be replaced)
- `RecordingService` — captures operation inputs, `res.send()` outputs, and `FusionRun.snapshot()` per step; persists to `test-data/recordings/<chain>/`
- `ReplayAdapter` — chain harness that builds a replay context and compares outputs (to be refactored)
- The one-test-seam change already unified the test harness behind `createTestRegistry()`, so only `IscApiAdapter` needs substituting

The `client-service` spec mandates "a single public entry point for all ISC API calls" — `ClientService.call()` is the choke point. Recording and replay adapters sit between `ClientService` and the SDK, at the `IscApiAdapter` interface.

## Goals / Non-Goals

**Goals:**
- Create `RecordingApiAdapter` that decorates `SdkApiAdapter` and logs (method, args) → response for every API call during record mode
- Create `ReplayApiAdapter implements IscApiAdapter` that serves recorded responses by key, failing on unknown requests
- Refactor `ReplayAdapter` to create a real `ServiceRegistry` with `ReplayApiAdapter` and delegate to `PipelineRunner.run()`
- Delete `FakeApiAdapter` — replaced by `ReplayApiAdapter`
- Delete ~25 service-method mocks in `ReplayAdapter` — real pipeline handles everything
- Centralize recording lifecycle: `RecordingConfig` on `FusionConfig`, finalize on operation end (not just signals)
- Keep `FusionRun.snapshot()` as an assertion artifact (stateAfter in scenario.json still captured)

**Non-Goals:**
- Retiring `FusionRun.restore()` — separate change
- Side-effect capture/assertion — separate change
- Determinism controls (seeded clock/UUID) — separate change
- Changing `ClientService.call()` interface or `IscApiAdapter` interface
- Modifying the `IscApiSurface` type
- Adding test coverage beyond what the refactored harness provides

## Decisions

### D1: Interception at the IscApiAdapter getter level via Proxy

- **Choice**: `RecordingApiAdapter` implements `IscApiAdapter`. Each getter (e.g., `accountsApi`) returns a Proxy wrapping the real SDK API instance. The Proxy intercepts every method call, records method name + serialized args, calls through to the real SDK, then logs the response. `ReplayApiAdapter` returns Proxy objects that look up (method, args) in a preloaded api-log map.
- **Rationale**: `ClientService.call()` receives opaque closures — intercepting at the closure level can't identify the API method being called or its arguments. Intercepting one level down at the API object methods gives exact method name + args, which is the stable lookup key for replay. The `IscApiAdapter` interface already names the 12 API getters — no new abstraction needed.
- **Alternatives considered**:
  - *Intercept at `ClientService.call()` or `execute()`* — Rejected because the `fn` closure is opaque; you could record (fn, response) but never look it up by method+args during replay. Would need a bespoke keying scheme per call site.
  - *Intercept at `IscApiSurface` getters inside `ClientService`* — Rejected because `_apiSurface` is private; recording at the adapter boundary is cleaner and doesn't require modifying `ClientService`.
  - *Record at HTTP level* — Rejected because the SDK already abstracts HTTP; intercepting the raw SDK API methods preserves the same abstraction level for recording and replay.

### D2: API-log format — NDJSON lines of (method, args, response)

- **Choice**: Each API call appends one NDJSON line to `api-log.ndjson` in the recording directory: `{ method: "listAccounts", api: "accounts", args: [...], response: {...}, timestamp: "..." }`. The api field identifies the getter (accounts → accountsApi), method is the SDK method name, args is a serialized array of the call arguments.
- **Rationale**: Appendable (no in-memory accumulation needed), human-readable for debugging, trivially mappable to a Map keyed by `api.method:` + JSON.stringify(args)`. NDJSON matches the existing `steps.ndjson` pattern in `RecordingService`.
- **Alternatives considered**:
  - *Single JSON file with all calls* — Rejected because it requires in-memory accumulation; NDJSON appends are free for long-running aggregations.
  - *Binary format (MessagePack, etc.)* — Rejected because debugging recorded data is a primary use case.

### D3: Replay lookup — exact match on (api, method, serialized args); GETs served, writes asserted

- **Choice**: `ReplayApiAdapter` preloads the api-log into a `Map<string, unknown>` keyed by `api.method ` + ` ` + ` JSON.stringify(args)`. GET/read methods serve the recorded response. POST/PATCH/PUT/DELETE methods assert the replayed call matches the recorded call. Order-insensitive: the first unmapped write call in replay is matched against the first unmapped write in the log (both sorted by method+args for stability). Unknown read keys fail with a descriptive error ("unrecorded request: accounts.listAccounts(...)").
- **Rationale**: Exact args matching is deterministic for SDK API calls (fixed parameter shapes). Sorting write calls by method+args makes the assertion immune to parallel pagination ordering. Failing on unknown reads is drift detection — a new API call in the pipeline that wasn't recorded.
- **Alternatives considered**:
  - *Sequential matching (recorded call N → replayed call N)* — Rejected because parallel pagination results arrive in non-deterministic order; breaks on any internal concurrency change.
  - *Serve writes silently (no assertion)* — Rejected because side effects (form creation, correlation config) are part of correctness; silent serve would miss a mutation that changed.

### D4: RecordingConfig on FusionConfig, not env vars

- **Choice**: `FusionConfig` gains an optional `recording` property: `{ mode: 'off' | 'record' | 'replay', chainName?: string, verbose?: boolean }`. `ServiceRegistry` reads it at construction time and wires the appropriate adapter. `RecordingService` reads chain name and verbosity from the config, not `process.env`. `FusionRun.isRecordMode` is computed from config, not env.
- **Rationale**: Single source of truth for recording configuration. Testable (tests set config values directly, not env vars). Consistent with how `ServiceRegistry` already accepts config as a constructor parameter. `scripts/record-chain.js` passes `recording.mode = 'record'` as a config override instead of setting env vars.
- **Alternatives considered**:
  - *Keep env vars but add RECORD_CHAIN_NAME and VERBOSE_RECORDING to FusionRun* — Rejected because env vars are global mutable state; config is the established injection mechanism.
  - *Separate RecordingConfig class* — Rejected because `FusionConfig` is the single config object flowing through the registry; splitting config into multiple objects adds indirection without benefit.

### D5: ReplayAdapter delegates to real pipeline via PipelineRunner.run()

- **Choice**: `ReplayAdapter.buildReplayContext` creates a `ServiceRegistry` via the existing `createTestRegistry()` factory, configuring `ReplayApiAdapter` with the scenario's api-log. It then calls `PipelineRunner.run()` for the operation and captures `res.send()` outputs via a mock `res`. `compareOutputs` stays as-is (output comparison logic unchanged).
- **Rationale**: The one-test-seam change already unified `createTestRegistry()` as the single factory. ReplayAdapter just swaps `FakeApiAdapter` → `ReplayApiAdapter` and removes all service-method mocks. The real pipeline executes, so phase-order changes in `corePipeline.ts` automatically apply to replay.
- **Alternatives considered**:
  - *Delete ReplayAdapter entirely* — Rejected because `compareOutputs` (with history-date sanitization) and the `buildReplayContext` convenience are valuable glue between the recording format and the test harness.
  - *Make ReplayAdapter a thin wrapper around a generic replay runner in src/*  — Rejected because it's test infrastructure; extracting it to src/ without a second caller violates "one adapter = hypothetical seam."

### D6: FakeApiAdapter deleted

- **Choice**: Delete `FakeApiAdapter` and replace all references with `ReplayApiAdapter` (for replay tests) or a hand-authored mini api-log (for unit-style operation tests that need specific API responses).
- **Rationale**: `FakeApiAdapter` returns `{} as any` for every API object — untyped, easy to accidentally call through to undefined methods. `ReplayApiAdapter` fails loudly on unknown requests, making it safer. For unit-style tests that only exercise a few API paths, a small inline api-log array is clearer than an empty mock adapter.
- **Alternatives considered**:
  - *Keep FakeApiAdapter as a base class* — Rejected because `{} as any` is worse than failing loudly; no test intentionally depends on undefined API methods.

## Risks / Trade-offs

- **[Risk]** Serializing and deserializing API arguments/response for the api-log must handle circular references (SDK objects may contain config references). `JSON.stringify` with a replacer or a `sanitizeForJson` (already exists in `RecordingService`) handles this.
  - **Mitigation**: Use the existing `sanitizeForJson` pattern; add specific replacers for known SDK types (Configuration, ApiClient) that appear in args.
- **[Risk]** Args serialization must be deterministic — same call same key. Object key ordering (ES2015+ is insertion-order, but different code paths may insert keys differently).
  - **Mitigation**: Use a stable JSON serializer (`json-stable-stringify` or sort keys in the replacer). The SDK API methods use positional arguments (not options objects), so arg arrays are naturally stable.
- **[Trade-off]** RecordingApiAdapter wraps every SDK API method call, adding a per-call overhead (Proxy + JSON serialization + fs append). This is only active in record mode (off by default).
  - **Acceptance**: Record mode is a development/testing concern, not a production path. The overhead is acceptable.
- **[Trade-off]** `ReplayApiAdapter`'s write-assertion mode (asserting POST/PATCH matches) doesn't validate that writes would *succeed* against ISC — only that the payload matches. Real ISC may reject payloads that passed recording.
  - **Acceptance**: The purpose is regression detection (pipeline changed the payload), not ISC compatibility testing.

## Migration Plan

1. Add `RecordingConfig` to `FusionConfig` type; add `recording` field
2. Create `src/services/clientService/recordingApiAdapter.ts`
3. Create `src/services/clientService/replayApiAdapter.ts`
4. Update `ServiceRegistry` to wire adapters based on `config.recording.mode`
5. Update `RecordingService` to manage api-log file alongside steps.ndjson
6. Update `createOperationHandler` to call `RecordingService.finalize()` in finally block
7. Update `FusionRun` to read `isRecordMode` from config (deprecate env var read)
8. Refactor `ReplayAdapter` to use `ReplayApiAdapter` + `PipelineRunner.run()`
9. Delete `FakeApiAdapter`; update all references to use `ReplayApiAdapter` or inline api-logs
10. Update `scripts/record-chain.js` to pass config override instead of env vars
11. Run full test suite (`npm test`) to verify no regressions
12. Run lint (`npm run lint`) to verify no dead imports
13. Verify chain replay tests pass with recorded data flowing through the real pipeline

**Rollback**: Revert the commit. No production code path changes (`recording.mode` defaults to `'off'` → `SdkApiAdapter` wired as today).

## Open Questions

- Should `ReplayApiAdapter` support a "lax" mode that warns on unknown reads instead of failing? (Useful for partial recordings where only certain API paths are recorded.)
- `paginateSearchApiGenerator` bypasses `ClientService.call()` (calls `adapter.searchApi.searchPost` directly). Should recording intercept that path too? (Currently it's behind the adapter so the Proxy would catch it, but it bypasses the queue policy — worth noting.)
- Should `ReplayApiAdapter` serve `FusionRun.snapshot()` data for the replay step? (Currently `ChainRunner` seeds `ChainState` from `initialState` + `expectedStateDelta`; with ReplayApiAdapter the pipeline would rebuild state from API data — but the initial identity baseline isn't an API call, it's from the snapshot.) Decision: initial state from snapshot stays; everything else from api-log.
