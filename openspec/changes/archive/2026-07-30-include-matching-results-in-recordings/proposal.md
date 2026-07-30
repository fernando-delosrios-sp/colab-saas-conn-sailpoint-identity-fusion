## Why

Chain recordings capture ISC API traffic and operation state but omit per-account matching outcomes — score breakdowns, deferred candidates, and sweep counters. Developers must re-run matching from recorded api-log data to inspect results (`fernandoRecordingReplay.test.ts` does this today). Standard account-list recordings also skip report capture unless `fusionReportOnAggregation` is enabled, leaving tracker arrays empty. Persisting matching results offline enables regression analysis and AI-assisted debugging without duplicating production matching logic.

## What Changes

**Matching results artifact**
- From: Recordings store api-log, steps, phases, scenario, manifest, and optional aggregation report only.
- To: Recordings include `reports/matching-results.json` with identity matches, deferred matches (with scores), non-matches, failures, and sweep summary counts.
- Reason: Offline access to match diagnostics without re-executing matching.
- Impact: Non-breaking; existing recordings lack the file until re-recorded.

**Record-mode report capture**
- From: `ManagedAccountAnalysisRecorder` populates tracker slices only when `shouldCaptureManagedAccountReportData()` is true (typically dry-run or fusion-report-on-aggregation).
- To: Account-list operations in record mode automatically enable managed-account report capture.
- Reason: Dev recordings must capture scores without extra config flags.
- Impact: Non-breaking; slightly slower matching in record mode only.

**Manifest and scenario metadata**
- From: `manifest.json` and `scenario.json` reference api-log, steps, phases, and optional aggregation report.
- To: Both files reference `matchingResultsPath` when the artifact exists.
- Reason: Harness and tooling can discover matching results consistently.
- Impact: Non-breaking additive fields.

**Documentation**
- From: README lists recording files without matching results; no docs site coverage of artifact schema.
- To: README and `docs/guides/testing-process.md` document all artifacts, capture timing, and matching-results JSON shape.
- Reason: Developers and AI agents need a single reference for what is stored and how.

## Capabilities

### New Capabilities

_(none — changes fit existing specs)_

### Modified Capabilities

- `recording-service`: New requirements for persisting matching results, record-mode capture enablement, and manifest/scenario path references.
- `testing`: Document matching-results artifact in harness/testing docs; optional test loading artifact instead of re-running matching.

## Impact

- **Modified:** `src/services/recordingService.ts`, `src/services/fusionService/fusionService.ts` (or record-mode capture gate), `src/operations/helpers/accountListPhases.ts`, `src/services/recordingService/recordingStore.ts` (manifest type)
- **Tests:** `src/services/__tests__/recordingService.test.ts`, `src/services/matchingService/__tests__/fernandoRecordingReplay.test.ts`
- **Docs:** `README.md`, `docs/guides/testing-process.md`
- **Unchanged:** Replay API adapter, `npm run test-recording` golden comparison (operation outputs only in v1)
