# Tasks: resilient-report-epilogue

## 1. Dry-run write-side-effect elimination

- [x] 1.1 Add a runtime persistence flag to `FusionService` (e.g. `setPersistentRun(isPersistent)`), following the existing `setTracker` pattern; wire it into `CorrelationManager` via a closure like the existing `isAggregationMode`
- [x] 1.2 Guard `CorrelationManager.applyPerSourceCorrelationIfNeeded` to return early when the run is non-persistent (covers dry-run and `buildReportContext`/reportAction)
- [x] 1.3 Set the flag in `setupPhase` (next to `fusion.setTracker(...)`) from `options.isPersistent`
- [x] 1.4 Guard `workflows.fetchDelayedAggregationSender()` in `fetchPhase` with `isPersistent`
- [x] 1.5 Tests: dry-run with `correlationMode: 'correlate'` issues no correlation calls; persistent mode still correlates; dry-run does not call `fetchDelayedAggregationSender`

## 2. Epilogue helper and failure isolation

- [x] 2.1 Add `streamProgress?: { sent: number }` to `PhaseOptions` and increment it in `outputPhase`'s send callback after each successful `res.send`
- [x] 2.2 Create `reportPhase()` + `ReportPhaseOptions` in `src/operations/helpers/accountListPhases.ts`: persistent report step (guarded, warn-only), then dry-run file/email step (guarded, warn-only), then dry-run `res.send(summary)` last (its failure becomes `runError` when the pipeline was clean)
- [x] 2.3 Restructure `accountList` into pipeline (phases 1–5 in try/catch capturing `runError`) → `reportPhase()` epilogue → cache cleanup → deferred rethrow (`log.crash` + rethrow, preserving `ConnectorError` pass-through) → `finally` lock release
- [x] 2.4 Replace the "PHASE 6" timer marker with `timer.phase('Epilogue: report generation', 'info', 'Report')`
- [x] 2.5 Verify state all-or-nothing: stream failure must leave `definition.saveState()` and `sources.saveBatchCumulativeCount()` uncalled (no code change expected — codified by test)

## 3. Label and language alignment

- [x] 3.1 Rename `reportService.ts` labels: `PHASE 7: Report (fusion report)` → `Epilogue: fusion report`; `PHASE 7: Report — HTML/email and stats` → `Epilogue: report — HTML/email and stats`
- [x] 3.2 Add **Epilogue** to the "Operations, phases, and sweeps" table in `openspec/specs/ubiquitous-language/spec.md` and remove "report phase" from the **Phase** examples
- [x] 3.3 Fix the stale `accountList` doc comment (dry-run does not stream 1-to-1 rows; it sends a terminal summary after report artifacts)

## 4. Resilience and ordering tests

- [x] 4.1 Persistent: send callback throws mid-stream → `generateAndSendFusionReport` still called, `saveState` not called, original error rethrown, process lock released
- [x] 4.2 Dry-run: `res.send(summary)` throws → HTML file/email step already executed; error propagates after epilogue
- [x] 4.3 Dry-run: `finalizeDryRunReport` throws → summary send still attempted; epilogue error logged as warning; pipeline result intact
- [x] 4.4 Dry-run ordering: with `saveFile`/`sendEmail`, file write and email delivery complete before the summary `res.send` (assert mock call order)
- [x] 4.5 No "PHASE 6"/"PHASE 7" strings logged in success or failure paths; "Epilogue:" labels present
- [x] 4.6 Update existing tests asserting old labels or inline PHASE 6 behavior (N/A — no pre-existing tests reference these labels)

## 5. Documentation and verification

- [x] 5.1 Update user-facing docs referencing "PHASE 6"/"PHASE 7" or dry-run behavior (README/docs site) to Epilogue terminology and the file → email → summary ordering
- [x] 5.2 Run `npm test` (accountList, helpers, reportService, fusionService suites) — all green
- [x] 5.3 Run `npm run lint` — clean
