# Include Matching Results in Recordings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-account matching outcomes to `reports/matching-results.json` during record-mode account-list and document all recording artifacts.

**Architecture:** Enable report capture when `isRecordMode`; build a `MatchingResultsSnapshot` from `AggregationTracker` at account-list epilogue; write via `RecordingService`; reference path in manifest/scenario; update docs.

**Tech Stack:** TypeScript, Node.js 24, Vitest, existing RecordingService / FusionReport types

**References:**
- Design: [design.md](./design.md)
- Tasks: [tasks.md](./tasks.md)
- Specs: [specs/recording-service/spec.md](./specs/recording-service/spec.md), [specs/testing/spec.md](./specs/testing/spec.md)

## Global Constraints

- Record mode only (`config.recording.mode === 'record'`) — no production behavior change
- Reuse `FusionReportAccount` / `sanitizeForJson` — no new wire vocabulary
- `npm test` must not depend on local `recordings/` artifacts

---

## Task 1: Record-mode report capture

**Files:** `src/services/fusionService/fusionService.ts`, `src/services/fusionService/__tests__/fusionService.report.test.ts`

- [ ] **Step 1:** Write failing test — construct FusionService with `run.isRecordMode = true`, account-list mode, verify `shouldCaptureManagedAccountReportData()` path populates tracker on mock analysis
- [ ] **Step 2:** Update `shouldCaptureManagedAccountReportData()`:
  ```typescript
  return (
      this.run.isRecordMode ||
      this.fusionReportOnAggregation ||
      !this.accountAssembly.isAggregationAccountListMode() ||
      this.shouldCaptureReportData
  )
  ```
- [ ] **Step 3:** Run targeted tests — `npm test -- src/services/fusionService/__tests__/fusionService.report.test.ts`

---

## Task 2: MatchingResultsSnapshot type and write method

**Files:** `src/services/recordingService/matchingResultsSnapshot.ts` (new), `src/services/recordingService.ts`

- [ ] **Step 1:** Define exported type with `version`, `recordedAt`, `operation`, `stepId?`, `sweepSummary?`, four account arrays
- [ ] **Step 2:** Write failing test in `recordingService.test.ts` — call `writeMatchingResults`, assert file at `reports/matching-results.json`
- [ ] **Step 3:** Implement `writeMatchingResults(snapshot: MatchingResultsSnapshot): string` mirroring `writeAggregationReport` (mkdir, sanitize, write, return path)
- [ ] **Step 4:** Run `npm test -- src/services/__tests__/recordingService.test.ts`

---

## Task 3: Wire account-list epilogue

**Files:** `src/operations/helpers/accountListPhases.ts`, `src/services/fusionService/fusionReportBuilder.ts`

- [ ] **Step 1:** Add helper `buildMatchingResultsSnapshot(tracker, sweepSummary, stepId?)` using existing report builder functions for identity/deferred/non-match/failed rows
- [ ] **Step 2:** In account-list epilogue (near `writeAggregationReport`), when `serviceRegistry.recording` exists and tracker has data, call `recording.writeMatchingResults(...)`
- [ ] **Step 3:** Manual smoke: record-mode unit test or integration stub verifies epilogue invokes write

---

## Task 4: Manifest and scenario metadata

**Files:** `src/services/recordingService/recordingStore.ts`, `src/services/recordingService.ts`

- [ ] **Step 1:** Add `matchingResultsPath?: string` to `RecordingManifest`
- [ ] **Step 2:** In `finalizeRecordingChain`, detect `reports/matching-results.json`, set path and append to `artifactPaths`
- [ ] **Step 3:** In `buildScenario()`, add `matchingResultsPath` when file exists
- [ ] **Step 4:** Extend `recordingService.test.ts` — finalize with matching-results present, assert manifest/scenario fields

---

## Task 5: fernando replay test migration

**Files:** `src/services/matchingService/__tests__/fernandoRecordingReplay.test.ts`

- [ ] **Step 1:** Add `loadMatchingResults()` reading `reports/matching-results.json` when present
- [ ] **Step 2:** When artifact exists, assert `deferredMatches.length === 12` and sweep summary without re-running match sweep
- [ ] **Step 3:** Keep re-run fallback when artifact missing (stale recordings)
- [ ] **Step 4:** Run test — `npm test -- src/services/matchingService/__tests__/fernandoRecordingReplay.test.ts`

---

## Task 6: Documentation

**Files:** `README.md`, `docs/guides/testing-process.md`, `CHANGELOG.md`

- [ ] **Step 1:** Add `reports/matching-results.json` row to README artifact table with field summary
- [ ] **Step 2:** Add "Recording artifacts" subsection to testing-process guide (all files, capture timing, schema sketch)
- [ ] **Step 3:** Note re-record requirement for chains recorded before this change
- [ ] **Step 4:** CHANGELOG entry under dev/recording section

---

## Task 7: Verification

- [ ] **Step 1:** `npm test -- src/services/__tests__/recordingService.test.ts src/services/fusionService/__tests__/fusionService.report.test.ts`
- [ ] **Step 2:** `npm run lint`
- [ ] **Step 3:** Re-record `fernando` chain locally and confirm `reports/matching-results.json` populated (manual dev step)
