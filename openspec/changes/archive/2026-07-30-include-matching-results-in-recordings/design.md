## Context

The recording subsystem persists ISC API interactions and operation steps for offline replay. Matching diagnostics — per-account scores, deferred candidates, sweep counts — are assembled in `AggregationTracker` via `ManagedAccountAnalysisRecorder` but are not written to disk during typical account-list recordings. `FusionRun.snapshot()` excludes tracker state. Developers currently reconstruct matching by re-running `MatchOutcomeDispatcher.runMatchSweep` against recorded api-log data.

Record mode is dev-only (`config.recording.mode === 'record'`). The existing `reports/` subdirectory already holds `aggregation.json` when the aggregation report epilogue runs.

## Goals / Non-Goals

**Goals:**
- Persist matching results to `reports/matching-results.json` at account-list operation end in record mode
- Auto-enable managed-account report capture during record-mode account-list
- Reference the artifact from `manifest.json` and `scenario.json`
- Document artifact layout, capture timing, and JSON schema in README and testing-process guide

**Non-Goals:**
- Golden comparison of matching results in `npm run test-recording` (v1)
- Embedding tracker state in `FusionRun.snapshot()` / `steps.ndjson`
- Changing replay mode or production account-list behavior
- Persisting matching results for operations other than account-list (unless trivial to extend later)

## Decisions

### D1: Artifact location and format
- **Choice:** `reports/matching-results.json` — single JSON file per account-list operation (last write wins if multiple sweeps in one process; append keyed by step if needed later)
- **Reason:** Mirrors `reports/aggregation.json`; easy to load in tests and docs
- **Considered alternatives:** NDJSON stream (overkill for one snapshot per operation); embedding in steps (bloats state snapshots)

### D2: Payload shape
- **Choice:**
  ```typescript
  {
    version: '1.0.0',
    recordedAt: string,
    operation: 'accountList',
    stepId?: string,
    sweepSummary?: { processed, exact, partial, deferred, nonMatch },
    identityMatches: FusionReportAccount[],
    deferredMatches: FusionReportAccount[],
    nonMatches: FusionReportAccount[],
    failedMatches: FusionReportAccount[]
  }
  ```
- **Reason:** Reuses `FusionReportAccount` report vocabulary; includes sweep counters for quick sanity checks
- **Considered alternatives:** Raw `FusionAccount` serialization (inconsistent with report consumers); full `FusionReport` (includes stats already in aggregation.json)

### D3: Capture enablement
- **Choice:** Treat record mode as an implicit "capture report data" signal for account-list — extend `shouldCaptureManagedAccountReportData()` to return true when `run.isRecordMode` (or pass record flag into FusionService)
- **Reason:** No new config knob; dev recordings always get scores
- **Considered alternatives:** New `recording.captureMatchingResults` config (unnecessary for v1); require `fusionReportOnAggregation` (current pain point)

### D4: Write timing and API
- **Choice:** Add `RecordingService.writeMatchingResults(payload)` called from account-list epilogue (near existing `writeAggregationReport`)
- **Reason:** Keeps persistence in RecordingService; fusion layer supplies tracker snapshot via existing `getTracker()` / report builder helpers
- **Considered alternatives:** RecordingStore.append collection (matching results are one snapshot, not a stream)

### D5: Manifest/scenario references
- **Choice:** Add optional `matchingResultsPath` to `RecordingManifest`, `scenario.json`, and `artifactPaths` array on finalize
- **Reason:** Consistent discovery pattern with `apiLogPath`, `reportsPath`

## Risks / Trade-offs

- [Risk] Record-mode matching slower due to score breakdown capture → Mitigation: dev-only path; reuse existing `_captureBreakdown` gate tied to report capture
- [Risk] Large recordings for tenants with many accounts → Mitigation: same data already computed for aggregation reports; JSON sanitized via `sanitizeForJson`
- [Risk] Stale recordings without matching-results → Mitigation: document re-record requirement; tests skip file if absent
- [Trade-off] No automated golden for matching-results in v1 → Acceptable; persistence enables manual and test loading first

## Migration Plan

1. Implement capture + write behind record mode
2. Re-record dev chains (e.g. `fernando`) to populate `reports/matching-results.json`
3. Update README and docs
4. Optional: refactor `fernandoRecordingReplay.test.ts` to assert against artifact instead of re-running sweep

Rollback: remove write call and record-mode capture override; artifact file ignored if present.

## Open Questions

- Should multi-sweep account-list chains store one matching-results file per step or merge? **Default v1:** one file per operation end (last sweep overwrites or single sweep per recording session is typical).
- Should identity-origin matches include full score breakdown or only matchAccounts references? **Default v1:** use `fusionReportBuilder.buildMatchAccounts` for consistent rows.
