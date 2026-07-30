## 1. Record-mode capture enablement

- [x] 1.1 Extend `shouldCaptureManagedAccountReportData()` (or FusionService record-mode wiring) to return true when `run.isRecordMode` during account-list
- [x] 1.2 Add unit test: record-mode account-list populates `deferredMatchReportData` with score breakdowns

## 2. Matching results persistence

- [x] 2.1 Define `MatchingResultsSnapshot` type (version, recordedAt, sweepSummary, identity/deferred/non-match/failed arrays)
- [x] 2.2 Add `RecordingService.writeMatchingResults(snapshot)` writing to `reports/matching-results.json`
- [x] 2.3 Build snapshot from `AggregationTracker` + sweep summary in account-list epilogue (`accountListPhases.ts`)
- [x] 2.4 Extend `RecordingManifest` and `finalizeRecordingChain` to set `matchingResultsPath` and include in `artifactPaths`
- [x] 2.5 Extend `buildScenario()` to include `matchingResultsPath` when file exists
- [x] 2.6 Add `recordingService.test.ts` coverage for write path and manifest fields

## 3. Test migration

- [x] 3.1 Refactor `fernandoRecordingReplay.test.ts` to load deferred match scores from `reports/matching-results.json` when present (fallback to re-run sweep for stale recordings)
- [x] 3.2 Assert golden counts (`deferred: 12`, `nonMatch: 24`) against artifact data

## 4. Documentation

- [x] 4.1 Update README chain-recording table with `reports/matching-results.json` (purpose, fields, capture timing)
- [x] 4.2 Add artifact layout section to `docs/guides/testing-process.md` describing all recording files and matching-results schema
- [x] 4.3 Document re-record requirement for existing chains missing the artifact

## 5. Changelog

- [x] 5.1 Create or update CHANGELOG entry for matching-results recording artifact
- [x] 5.2 Confirm entry covers record-mode capture and new artifact path
