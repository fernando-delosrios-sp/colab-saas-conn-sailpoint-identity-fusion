# Design: resilient-report-epilogue

## Context

`accountList` is a 5-phase pipeline (`setupPhase`…`outputPhase`) followed by inline reporting labeled "PHASE 6" and an inline dry-run block. Two structural problems:

1. **Fragile ordering**: durable artifacts (fusion report email, dry-run HTML file, dry-run email) are sequenced *after* the most fragile channel (the HTTP response stream via `res.send`) with no error isolation. `ResponseStream.send` is a synchronous `writable.write(...)`; when the platform disconnects (timeout), it throws synchronously (`ERR_STREAM_WRITE_AFTER_END`/`ERR_STREAM_DESTROYED`) mid-loop in `forEachISCAccount`. The run then dies before any report is emitted — failure produces silence.
2. **Taxonomy drift**: "PHASE 6" (accountList) and "PHASE 7" (reportService, ×2) label the same logical step; `generateAndSendFusionReport` must patch its own timing into the report after rendering — a phase that cannot time itself is not a phase.

Additionally, dry-run violates its non-persistent contract: `isAggregationMode` is `operationContext === 'accountList'` (true for dry-run), so `CorrelationManager.applyPerSourceCorrelationIfNeeded` PATCHes ISC identities when sources use `correlationMode: 'correlate'`; and `fetchPhase` always fetches the delayed-aggregation sender workflow whose only consumer is persistent-only.

## Goals / Non-Goals

**Goals:**
- Reports (persistent email, dry-run file/email) are emitted regardless of pipeline outcome.
- Pipeline failures still fail the run (deferred rethrow) — never silently, never swallow.
- Dry-run emission order: file → email → summary (most-durable-first).
- Report step becomes the **Epilogue**: a `reportPhase()` helper, no phase number; ubiquitous language updated.
- Dry-run performs no correlation writes and no delayed-aggregation fetch.
- State persistence remains all-or-nothing: a failed run saves no state.

**Non-Goals:**
- Rendering `runError`/partial-send counts *inside* report content (plumbing via `streamProgress`/`runError` lands; rendering is a follow-up).
- Retrying or tolerating per-account send failures (a dead stream stays dead).
- Running delayed-aggregation scheduling / form deletions after pipeline failure (remains skipped).
- Implementing 1-to-1 dry-run row streaming (spec claims it; code never did — see D6).

## Decisions

### D1: Report = Epilogue, not a phase
- **Choice**: New `reportPhase()` helper in `accountListPhases.ts`, invoked after the pipeline regardless of outcome. Timer marker: `timer.phase('Epilogue: report generation', 'info', 'Report')` — the `Report` short label is preserved so the phaseTiming row is unchanged. `reportService` internal labels become "Epilogue: fusion report" / "Epilogue: report — HTML/email and stats". Ubiquitous-language spec gains **Epilogue**; **Phase** loses "report phase" as an example.
- **Reason**: the report renders the phase timings of phases 1–5; self-reference forces the post-render timing patch. Epilogue framing resolves the PHASE 6/7 contradiction by removing numbers.
- **Alternatives**: (b) "Phase 6 with helper" — keeps symmetry but preserves the self-timing hack and contradicts reportService's PHASE 7; (c) fold into `outputPhase` — mixes failure-isolated report logic into the phase whose stream is the failure source.

### D2: Deferred rethrow (capture → epilogue → rethrow)
- **Choice**: `accountList` wraps phases 1–5 in try/catch, captures `runError`, runs `reportPhase()`, then rethrows (`log.crash` first for non-`ConnectorError` persistent runs, preserving current semantics). `finally` still releases the process lock.
- **Reason**: ISC must not treat partial output as a complete aggregation, but the failure must be reported first.
- **Alternatives**: immediate rethrow (today — loses all durable artifacts); swallow with crash log (platform accepts partial data as complete — rejected).

### D3: Epilogue steps are individually guarded; summary-send failure can fail the run
- **Choice**: `reportPhase()` never throws. Persistent report and dry-run file/email steps are `try/catch` + `log.warn`. **Exception**: the dry-run `res.send(summary)` is the pipeline-critical platform output of a dry-run — if it fails and no prior `runError` exists, it becomes the `runError` (deferred rethrow). Order inside the epilogue: dry-run file → dry-run email → summary send (most-durable-first).
- **Reason**: report channels are best-effort; but a dry-run whose terminal output never reached the platform did not fulfil its contract.
- **Alternatives**: all epilogue steps warn-only (a dry-run could appear successful with zero platform output — rejected); summary first (current — loses file/email on stream death, the original bug).

### D4: Skip state persistence on failure (all-or-nothing)
- **Choice**: unchanged code behavior, codified: stream death propagates out of `outputPhase`, so `saveState()`/`saveBatchCumulativeCount()` do not run for failed runs.
- **Reason**: user decision — all-or-nothing over partial-state continuity.
- **Trade-off accepted**: accounts that reached ISC before the crash may drift on next run.

### D5: Dry-run suppresses correlation-on-aggregation and delayed-aggregation fetch
- **Choice**: (a) `FusionService` gains a runtime persistence flag set in `setupPhase` (next to `fusion.setTracker(...)` — construct-time is impossible because the `dryRun` input flag is parsed after the registry is built). `CorrelationManager.applyPerSourceCorrelationIfNeeded` returns early when the run is non-persistent. This also covers `buildReportContext` (reportAction), which is equally non-persistent. (b) `fetchPhase` guards `workflows.fetchDelayedAggregationSender()` with `isPersistent`.
- **Reason**: dry-run must be read-only; today it PATCHes identities — a live bug.
- **Alternatives**: thread `isPersistent` through the three call sites (`processFusionAccount`, `decisionProcessor`, `matchOutcomeDispatcher`) — invasive, they sit deep in fusion processing without `PhaseOptions`.

### D6: Codify actual dry-run output behavior (no row streaming)
- **Choice**: amend spec requirement "Dry-run mode streams 1-to-1 StdAccountListOutput rows" to reflect reality: dry-run emits a terminal summary plus optional file/email report; fix the stale `accountList` doc comment likewise.
- **Reason**: the requirement describes behavior the code never implemented (`outputPhase` short-circuits non-persistent runs); the accepted dry-run contract is summary + report. If row streaming is ever wanted, it is a separate change.

## Risks / Trade-offs

- [Risk] Deferred rethrow changes failure-path control flow; a bug could swallow a pipeline error. → Mitigation: `runError` is always rethrown (or `log.crash` + rethrow); tests assert rethrow on stream crash, lock release in `finally`, and epilogue invocation on failure.
- [Risk] Epilogue report generation itself needs in-memory data that a mid-pipeline crash may have left partially cleared (e.g. `identities.clear()` in processPhase). → Mitigation: report steps are guarded (warn-only on failure); report generation degrades gracefully rather than masking the original error.
- [Trade-off] All-or-nothing state may drift already-sent accounts after a crash. → Reason for acceptance: explicit user decision; continuity option documented as rejected.
- [Trade-off] Epilogue warn-only steps can leave a failed run with no report if the report step itself errors. → Reason for acceptance: report channels are best-effort by nature; the alternative (epilogue throws) risks masking the root error.
- [Risk] Log-scraping automation may rely on "PHASE 6"/"PHASE 7" strings. → Mitigation: labels change to "Epilogue: …"; noted in proposal Impact; phaseTiming rows keep the `Report` short label.

## Migration Plan

N/A — no deployment, endpoint, or stored-data changes. Behavior changes are confined to the dry-run path (removal of unintended writes) and failure-path report emission. Rollback = revert the change; no state migration.

## Open Questions

- Should the fusion report surface partial-run information (accounts sent before stream death, `runError` message) once the plumbing lands? (Follow-up change.)
