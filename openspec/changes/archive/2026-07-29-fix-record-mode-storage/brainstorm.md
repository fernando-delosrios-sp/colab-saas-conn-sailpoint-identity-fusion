# Fix Record Mode Storage — Brainstorm Capture

## Background

Record mode (`npm run record` / `scripts/record-chain.js`) is intended to capture ISC API responses via `RecordingApiAdapter` and operation state via `RecordingService` so chain replay can run without fetching from the tenant. The user reported only seeing `connector.log` — no `scenario.json`, no `api-log.ndjson`, no inspectable data layers.

Investigation found a **split-brain** between `FusionRun.isRecordMode` (reads `RECORD_MODE` env fallback) and `ServiceRegistry` (only wires recording when `config.recording.mode === 'record'`). The env→config bridge planned in archived `2026-07-22-api-seam-record-replay` was never implemented in `safeReadConfig()`.

Aggregation report sending works — confirmed by user. Local report artifact is optional for inspection.

## Decision Chain

### Q1: What is the replay data source of truth?

**Decision:** ISC API responses captured at the `IscApiAdapter` seam (`api-log.ndjson`). FusionRun snapshots are assertion artifacts, not replay inputs. Per-account FusionLayers events are not required for ISC-free replay.

### Q2: What storage backend?

**Options considered:**
- NDJSON files only — zero deps, human-readable, but full-file load on replay
- NDJSON + sidecar index — scale without deps
- SQLite native (`better-sqlite3`) — indexed queries, native addon + ncc pain
- SQLite WASM (`sql.js`) — no native deps, larger bundle
- LevelDB — KV by call key, limited querying
- External DB — wrong fit for local dev

**Decision:** **Pluggable `RecordingStore` interface** — ship **NDJSON default** (`NdjsonRecordingStore`), allow SQLite swap later without touching `RecordingService` / `ReplayApiAdapter` consumers. SQLite implementation deferred to follow-up change.

### Q3: What artifacts should a record run produce?

**Decision:** Chain directory under `test-data/recordings/{chainName}/`:

- `manifest.json` — store type, file inventory, counts
- `scenario.json` — replay scenario (existing, enriched)
- `api-log.ndjson` — primary replay store
- `steps.ndjson` — per-operation steps (retain, do not delete on finalize)
- `phases.ndjson` — PHASE/STEP boundaries + counts (diagnostic)
- `connector.log` — stdout tee from script
- `reports/aggregation.json` — optional local copy when report generated

### Q4: How to fix the config bridge?

**Decision:** Add `resolveRecordingConfig()` in `src/data/config/`, called from `safeReadConfig()` after settings pipeline. Explicit `config.recording` wins; env vars (`RECORD_MODE`, `RECORD_CHAIN_NAME`, `VERBOSE_RECORDING`) are fallback for local dev via `record-chain.js`.

### Q5: Recording lifecycle fixes?

**Issues:**
1. Singleton `RecordingService` + `finalize()` after every operation — multi-op chains lose data
2. `steps.ndjson` deleted on finalize
3. No startup/finalize summary of artifact paths and api-log counts

**Decision:**
- Per-run `RecordingService` instance owned by `ServiceRegistry`
- Finalize once at process exit (SIGINT/SIGTERM/beforeExit), not per operation
- Keep `steps.ndjson`; write `manifest.json` on finalize

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| NDJSON full load on replay | Accept for Phase 1; interface allows indexed backend later |
| Env var fallback retained | Backward compat for `record-chain.js`; centralized in one resolver |
| Phase capture not per-account layers | Sufficient for observability; replay needs api-log only |
| SQLite deferred | Avoid ncc/native risk until real tenant recording proves NDJSON insufficient |

## Agreed Approach

1. Fix env→config bridge (`resolveRecordingConfig`)
2. Fix lifecycle (per-run instance, finalize-once)
3. Introduce pluggable `RecordingStore` with NDJSON default
4. Add phase boundary capture and optional local report artifact
5. Update `record-chain.js` exit verification and logging
