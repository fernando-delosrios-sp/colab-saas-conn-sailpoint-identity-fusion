# Fix Record Mode Storage Implementation Plan

> **For agentic workers:** Use `/opsx:apply` or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix record mode so `npm run record` produces complete replay artifacts (api-log, scenario, manifest) via env→config bridge, pluggable NDJSON store, and finalize-once lifecycle.

**Architecture:** `resolveRecordingConfig()` bridges env vars into `FusionConfig.recording` during `safeReadConfig()`. `RecordingService` delegates persistence to `NdjsonRecordingStore` behind a `RecordingStore` interface. Per-run instances finalize once at process exit. Phase/report artifacts are diagnostic append-only NDJSON/JSON files.

**Tech Stack:** TypeScript, Node.js 24, Vitest, existing RecordingApiAdapter/ReplayApiAdapter seam

**Spec refs:** `openspec/changes/fix-record-mode-storage/specs/recording-service/spec.md`, `fusion-run/spec.md`, `client-service/spec.md`

---

## Task 1: resolveRecordingConfig bridge

**Files:**
- Create: `src/data/config/resolveRecordingConfig.ts`
- Modify: `src/data/config/readConfig.ts`, `src/model/config.ts`, `src/model/fusionRun.ts`
- Create: `src/data/config/__tests__/resolveRecordingConfig.test.ts`
- Modify: `src/model/__tests__/fusionRun.test.ts`

- [ ] **Step 1:** Write failing tests for env fallback and explicit config precedence
- [ ] **Step 2:** Implement `resolveRecordingConfig(raw?: Partial<RecordingConfig>): RecordingConfig`
- [ ] **Step 3:** Call from `safeReadConfig()` after settings pipeline: `config.recording = resolveRecordingConfig(config.recording)`
- [ ] **Step 4:** Add `store?: 'ndjson' | 'sqlite'` to `RecordingConfig` type
- [ ] **Step 5:** Update `FusionRun` — `isRecordMode = config.recording?.mode === 'record'`; remove `process.env.RECORD_MODE` branch
- [ ] **Step 6:** Run `npm test -- src/data/config/__tests__/resolveRecordingConfig.test.ts src/model/__tests__/fusionRun.test.ts`

---

## Task 2: RecordingStore interface + NdjsonRecordingStore

**Files:**
- Create: `src/services/recordingService/recordingStore.ts`
- Create: `src/services/recordingService/ndjsonRecordingStore.ts`
- Modify: `src/services/recordingService.ts`

- [ ] **Step 1:** Define `ApiLogReader`, `RecordingStore`, `RecordingManifest` types and `createRecordingStore()` factory
- [ ] **Step 2:** Implement `NdjsonRecordingStore` — `appendApiCall`, `append(collection, record)`, `loadApiLog`, `writeManifest`, `getRecordingDir`, `close`
- [ ] **Step 3:** Refactor `RecordingService` constructor to create store from config; replace inline fs append in `onApiCall` and `persistStep`
- [ ] **Step 4:** Write unit tests for NdjsonRecordingStore append/load/manifest
- [ ] **Step 5:** Run `npm test -- src/services/__tests__/recordingService.test.ts`

---

## Task 3: Lifecycle — per-run instance, finalize-once

**Files:**
- Modify: `src/services/recordingService.ts`, `src/services/serviceRegistry.ts`, `src/utils/operationHandler.ts`

- [ ] **Step 1:** Remove `RecordingService.init` singleton pattern; construct in `ServiceRegistry` when `recMode === 'record'`
- [ ] **Step 2:** Rename/refactor `finalize()` → `finalizeOnce()`; stop deleting `steps.ndjson`; write `manifest.json`
- [ ] **Step 3:** Remove `serviceRegistry.recording.finalize()` from `createOperationHandler` finally; keep `endOperation()` per op
- [ ] **Step 4:** Register `finalizeOnce` on SIGINT/SIGTERM/beforeExit (dedupe with existing handlers)
- [ ] **Step 5:** Log at startup: `Recording enabled — chain: {name}, dir: {path}, store: ndjson`
- [ ] **Step 6:** Test multi-step accumulation and finalize-once idempotency

---

## Task 4: Replay loading via manifest

**Files:**
- Modify: `src/services/clientService/replayApiAdapter.ts`, `src/services/serviceRegistry.ts`
- Modify: `src/services/clientService/__tests__/replayApiAdapter.test.ts`

- [ ] **Step 1:** Add `loadRecordingApiLog(chainDir: string)` that reads `manifest.json` and delegates to store factory
- [ ] **Step 2:** Update ServiceRegistry replay path to use manifest-based loader when chain dir exists
- [ ] **Step 3:** Add tests for manifest-based load
- [ ] **Step 4:** Run chain replay tests: `npm test -- src/operations/__tests__/chain/`

---

## Task 5: Phase and report artifacts

**Files:**
- Modify: `src/services/logService/helpers.ts`, `src/operations/helpers/accountListPhases.ts`

- [ ] **Step 1:** In phase/step helpers, when recording active, append summary to store `phases` collection
- [ ] **Step 2:** In `reportEpilogue`, write aggregation report JSON to `reports/aggregation.json` when recording active
- [ ] **Step 3:** Include phase/report paths in manifest

---

## Task 6: record-chain.js verification

**Files:**
- Modify: `scripts/record-chain.js`

- [ ] **Step 1:** Log expected artifact directory and file list on startup
- [ ] **Step 2:** On child exit, check `manifest.json` and `api-log.ndjson` exist; warn if api-log line count is 0
- [ ] **Step 3:** Add ServiceRegistry integration test with env-only RECORD_MODE

---

## Task 7: Verification and docs

- [ ] **Step 1:** Run full suite: `npm test`
- [ ] **Step 2:** Run linter: `npm run lint`
- [ ] **Step 3:** Manual smoke: `npm run build && npm run record` (short run) — verify artifacts in `test-data/recordings/{chain}/`
- [ ] **Step 4:** Update recording docs / README artifact layout section
- [ ] **Step 5:** Changelog entry

---

## Commit guidance

Suggested commits:
1. `fix(config): bridge RECORD_MODE env vars via resolveRecordingConfig`
2. `feat(recording): add pluggable RecordingStore with NDJSON default`
3. `fix(recording): finalize-once lifecycle and retain steps.ndjson`
4. `feat(recording): phase and report local artifacts`
5. `chore(scripts): record-chain.js artifact verification`
