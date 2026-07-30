# Brainstorm: include-matching-results-in-recordings

## Context

Chain recordings under `recordings/{chainName}/` persist ISC API traffic, operation steps, phase boundaries, and optional aggregation reports. They do **not** persist per-account matching outcomes — the score breakdowns, deferred candidate rows, and sweep counters that `ManagedAccountAnalysisRecorder` writes into `AggregationTracker` during account-list.

Evidence of the gap:

- `recordings/fernando/reports/aggregation.json` has `"accounts": []` despite 36 managed accounts and 12 deferred matches in a live run.
- `fernandoRecordingReplay.test.ts` manually reloads api-log + scenario config and re-runs `runMatchSweep` to reconstruct scores — fragile, slow, and duplicates production logic.
- `FusionRun.snapshot()` (embedded in `steps.ndjson`) excludes `AggregationTracker`; matching diagnostics live outside the recording seam.
- `shouldCaptureManagedAccountReportData()` is false for standard persistent account-list unless `fusionReportOnAggregation` is enabled, so tracker arrays stay empty during typical dev recordings.

Developers and AI agents need offline access to **what matched, how, and with what scores** without re-executing matching against recorded API data.

## Decision chain

**Q1: What data belongs in the matching-results artifact?**
- **Decision:** Serialize the four tracker slices used for fusion reporting: identity-origin matches, deferred candidate matches (with per-attribute scores), analyzed non-matches, and failed matching entries. Include sweep summary counts (`processed`, `exact`, `partial`, `deferred`, `nonMatch`) when available.
- **Reason:** Reuses existing `FusionReportAccount` / `FusionReportMatch` / `FusionReportScore` vocabulary; aligns with dry-run report shape developers already know.

**Q2: Where should matching results be stored?**
- **Decision:** New file `reports/matching-results.json` under the chain recording directory, written by `RecordingService` at account-list operation end (mirrors `reports/aggregation.json` pattern).
- **Alternatives considered:**
  - Embed in `steps.ndjson` `stateAfter` — rejected; bloats every step, tracker not on FusionRun snapshot today.
  - Extend `aggregation.json` — rejected; different lifecycle (aggregation report epilogue vs match sweep), and current file often has empty accounts.
  - New top-level `matching-results.ndjson` — rejected; JSON snapshot at operation end is simpler for golden comparison and docs.
- **Chosen:** `reports/matching-results.json` — colocated with other report artifacts, referenced from `manifest.json` and `scenario.json`.

**Q3: When should capture be enabled?**
- **Decision:** Enable managed-account report capture automatically when `config.recording.mode === 'record'` during account-list operations.
- **Reason:** Recording is dev-only; the extra score breakdown cost is acceptable for offline regression. Avoids requiring `fusionReportOnAggregation` or dry-run just to get scores in a recording.
- **Impact:** Non-breaking; only affects record mode. Replay and production runs unchanged.

**Q4: Should replay/test-recording validate matching results?**
- **Decision:** Phase 1 — persist and document only. Optional golden comparison for matching results is a follow-up (test-recording already validates operation outputs).
- **Reason:** Keeps scope focused; `fernandoRecordingReplay.test.ts` can migrate to load the artifact instead of re-running matching in a later task.

**Q5: What documentation needs updating?**
- **Decision:** README chain-recording table (primary developer entry point) plus a short section in `docs/guides/testing-process.md` describing artifact layout, capture timing, and JSON schema overview.
- **Reason:** README already documents recording files; testing-process covers harness workflows.

## Design trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Record mode enables score breakdown capture (slightly slower matching) | Acceptable — dev-only path |
| Existing recordings lack matching-results until re-recorded | Expected — document in migration |
| Identity-origin matches stored as minimal report rows, not raw FusionAccount objects | Acceptable — consistent with report builder |
| No replay golden for matching-results in v1 | Acceptable — persistence + docs first |

## Agreed approach

1. Extend record-mode account-list to force `shouldCaptureManagedAccountReportData()` (or equivalent) when recording.
2. Add `RecordingService.writeMatchingResults()` — serializes tracker + sweep summary to `reports/matching-results.json`.
3. Wire write at account-list operation end (alongside existing aggregation report write).
4. Extend `manifest.json` (`matchingResultsPath`, counts) and `scenario.json` (`matchingResultsPath`).
5. Update README and testing-process docs with artifact schema and capture behavior.
6. Add unit test for write path; refactor `fernandoRecordingReplay.test.ts` to load artifact (optional stretch in tasks).
