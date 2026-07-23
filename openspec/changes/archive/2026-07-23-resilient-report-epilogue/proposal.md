# Proposal: resilient-report-epilogue

## Why

The account-list pipeline treats reporting as an inline afterthought with no failure isolation. If `res.send` throws mid-stream (HTTP stream error on platform timeout/disconnect), the run dies before the report is generated — owners get total silence exactly when they need visibility most. In dry-run, the fragile summary send runs before the durable file/email report, so a stream error loses the entire analysis. The "PHASE 6" label also contradicts `reportService`'s internal "PHASE 7" logs, and reporting cannot time itself inside its own artifact — evidence it is an epilogue, not a phase. Additionally, dry-run currently performs write side effects (correlation PATCHes via "Correlate missing accounts on aggregation") and wasted fetches (delayed-aggregation sender), violating its non-persistent contract.

## What Changes

**Report becomes an epilogue, not a phase**
- From: reporting is inline in `accountList`, labeled "PHASE 6", while `reportService` logs contradictory "PHASE 7" markers for the same step.
- To: a guarded `reportPhase()` epilogue helper runs after the pipeline regardless of outcome; labels become "Epilogue: …"; the ubiquitous-language spec gains the **Epilogue** term.
- Reason: an artifact that renders the phase timings cannot itself be a phase (it must patch its own timing in after rendering).
- Impact: non-breaking; log/label changes only.

**Failure-resilient reporting**
- From: a mid-stream `res.send` crash aborts the run before the fusion report; in dry-run `res.send(summary)` runs before `finalizeDryRunReport`, so a stream error loses the HTML file and email.
- To: pipeline errors are captured (`runError`), the epilogue always runs (each step individually guarded, never throws), then the error is rethrown so the run is still marked failed. Dry-run emission order becomes file → email → summary (most-durable-first, most-fragile-last). Partial `sent` count is tracked via `streamProgress` for observability.
- Reason: durable artifacts must survive the failure they are meant to explain.
- Impact: non-breaking on success path; failure path now emits reports before failing.

**State is all-or-nothing on failure**
- From: (unchanged behavior, now explicit) when the stream dies mid-send, `saveState()`/`saveBatchCumulativeCount()` are skipped.
- To: same, codified as a decision: a failed run persists no state.
- Reason: all-or-nothing semantics chosen over partial-state continuity.
- Impact: no behavior change; documented contract.

**Dry-run performs no correlation writes or delayed-aggregation work**
- From: `isAggregationMode` is true for dry-run (`operationContext === 'accountList'`), so `applyPerSourceCorrelationIfNeeded` PATCHes ISC identities during dry-run; `fetchPhase` always fetches the delayed-aggregation sender workflow.
- To: correlation-on-aggregation is suppressed in dry-run; `fetchDelayedAggregationSender` is guarded by `isPersistent`.
- Reason: dry-run must be a read-only analysis.
- Impact: behavior change on the dry-run path only; removes unintended writes.

## Capabilities

### New Capabilities

(none — assigned to existing specs)

### Modified Capabilities

- `account-list-operation`: pipeline/epilogue structure, failure-resilient report emission, dry-run emission ordering, dry-run no-write guarantees (correlation suppression, delayed-aggregation fetch guard).
- `ubiquitous-language`: add **Epilogue** term; amend **Phase** definition so the report step is the epilogue, not a phase example.

## Impact

- **Code**: `src/operations/accountList.ts` (restructure into pipeline + epilogue, deferred rethrow), `src/operations/helpers/accountListPhases.ts` (new `reportPhase()`, `streamProgress` in `PhaseOptions`, `fetchPhase` guard), `src/services/fusionService/fusionService.ts` + `src/services/correlationManager.ts` (dry-run correlation suppression), `src/services/reportService.ts` (label strings).
- **Specs**: `account-list-operation`, `ubiquitous-language` deltas.
- **Tests**: `src/operations/__tests__/accountList.test.ts` (stream-crash resilience, dry-run ordering, dry-run no-write), plus label assertions where present.
- **APIs/contracts**: no connector-spec changes; dry-run loses unintended correlation side effects (a fix, not a break). Log output changes: "PHASE 6"/"PHASE 7" markers become "Epilogue: …" lines.
