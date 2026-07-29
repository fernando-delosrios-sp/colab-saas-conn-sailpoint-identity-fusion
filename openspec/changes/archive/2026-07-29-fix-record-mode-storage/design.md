## Context

Identity Fusion record/replay captures ISC API responses at the `IscApiAdapter` seam so chain tests replay without tenant fetches. `RecordingService` persists api-log, operation steps, and `scenario.json` under `test-data/recordings/{chainName}/`. Local recording is triggered via `npm run record` (`scripts/record-chain.js`), which sets deprecated env vars.

The archived `2026-07-22-api-seam-record-replay` change implemented `RecordingApiAdapter`, `ReplayApiAdapter`, and `RecordingConfig` on `FusionConfig`, but left the env→config bridge incomplete. Today, `FusionRun.isRecordMode` can be true while `ServiceRegistry` leaves recording off — producing only `connector.log`.

Record/replay is dev/CI-only but code bundles via `ncc`; storage backend choice affects bundle size if native addons are added later.

## Goals / Non-Goals

**Goals:**

- Fix record mode so `npm run record` produces complete artifacts: `manifest.json`, `scenario.json`, `api-log.ndjson`, `steps.ndjson`
- Single source of truth for recording config (`resolveRecordingConfig`)
- Pluggable `RecordingStore` interface with NDJSON default implementation
- Finalize-once lifecycle for multi-operation chain recording
- Lightweight phase-boundary capture for run inspection
- Startup/exit logging that surfaces recording failures

**Non-Goals:**

- SQLite / LevelDB implementation in this change (follow-up behind same interface)
- Per-account FusionLayers event stream
- Web UI or inspect CLI for browsing recordings
- Changes to aggregation report email/send behavior
- Production ISC deployment changes (recording remains off by default)

## Decisions

### D1: Config resolution — centralized bridge

- **Choice:** `resolveRecordingConfig()` called from `safeReadConfig()`; explicit config wins over env vars
- **Reason:** Eliminates split-brain between `FusionRun` and `ServiceRegistry`; one function owns env fallback
- **Considered alternatives:** Read env in each consumer — rejected (already caused the bug); remove env vars entirely — rejected (breaks `record-chain.js` without config injection path)

### D2: Storage — pluggable interface, NDJSON default

- **Choice:** `RecordingStore` / `ApiLogReader` interfaces; `NdjsonRecordingStore` as default; `config.recording.store ?? 'ndjson'`
- **Reason:** Fixes storage immediately with zero deps; SQLite/indexed backend can swap without touching replay pipeline
- **Considered alternatives:** SQLite now — rejected (native addon + ncc risk before proving NDJSON insufficient); NDJSON only without interface — rejected (user chose pluggable)

### D3: Lifecycle — per-run instance, finalize-once

- **Choice:** `RecordingService` owned by `ServiceRegistry` (not singleton); finalize on process exit via signal handlers + `beforeExit`; remove per-operation finalize from `createOperationHandler`
- **Reason:** Multi-op chains (testConnection → accountList) must accumulate api-log and steps
- **Considered alternatives:** Keep singleton + per-op finalize — rejected (loses data); finalize only on SIGINT — rejected (clean exit already fixed in prior change but per-op finalize regressed it)

### D4: Diagnostic artifacts — phase summaries, optional report

- **Choice:** Append to `phases.ndjson` on PHASE/STEP boundaries when recording active; write `reports/aggregation.json` in report epilogue
- **Reason:** User needs visibility beyond stdout without per-account layer overhead
- **Considered alternatives:** Full layer event stream — rejected (not needed for replay; volume concern)

### D5: Replay loading — ApiLogReader abstraction

- **Choice:** `loadApiLog(path)` retained; add overload/factory reading from manifest store type; `ReplayApiAdapter` unchanged contract (entries array)
- **Reason:** Backward compat with existing chain harness and spec
- **Considered alternatives:** Indexed replay without loading all entries — deferred to SQLite store impl

## Risks / Trade-offs

- [Risk] NDJSON api-log grows large on big tenants → Mitigation: `RecordingStore` interface allows indexed backend; manifest reports entry count
- [Risk] Finalize-once misses artifacts if process killed hard (SIGKILL) → Mitigation: append-only api-log and steps survive partial writes; manifest best-effort on signals
- [Risk] Env var fallback masks misconfigured explicit config → Mitigation: log resolved recording config at ServiceRegistry startup
- [Trade-off] No SQLite in this change → Accept; ship fix first, optimize storage when scale proven

## Migration Plan

N/A — dev/CI tooling change only. No ISC deployment or config migration.

**Rollout:**

1. Ship resolver + store + lifecycle fixes
2. Verify with `npm run record` → confirm api-log line count > 0
3. Run chain replay tests: `npm test -- src/operations/__tests__/chain/`

**Rollback:** Revert change; record mode returns to current broken/partial behavior (no production impact).

## Open Questions

- None blocking implementation. SQLite backend choice (`better-sqlite3` vs `sql.js`) deferred until ncc bundle experiment in follow-up change.
