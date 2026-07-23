# Brainstorm — Resilient report epilogue

Raw capture of the explore-mode session that preceded this change (verbal `superpowers:brainstorming` conducted in `/opsx:explore`, promoted here after all 5 promotion criteria held).

## Context

`accountList` runs a 5-phase pipeline via helpers (`setupPhase`…`outputPhase`), then handles reporting **inline** with no helper, labeled "PHASE 6". Concerns raised by the user:

1. PHASE 6 has no helper method — misaligned with phases 1–5.
2. It is semantically arguable whether report is a phase at all, if reports are legitimate output.
3. `res.send` can crash the run with HTTP stream errors; reports must be sent and files saved **regardless**.
4. Delayed aggregation and account correlations ("Correlation mode → Correlate missing accounts on aggregation") should be skipped in dry-run.

## Investigation findings (grounded in code)

- **Phase taxonomy already broken**: `accountList.ts` logs `PHASE 6: Report generation`; `reportService.ts:477` logs `PHASE 7: Report (fusion report)` *inside the same logical step*; `reportService.ts:432` logs a second `PHASE 7` for dry-run. One persistent run logs both PHASE 6 and PHASE 7 for one report.
- **Self-timing hack**: `generateAndSendFusionReport` (reportService.ts:475–480) generates the report, then logs its own phase, then patches `stats.phaseTiming` and re-assigns `report.stats` — a phase that cannot time itself inside its own artifact is not a phase; it is the footer that renders phases 1–5.
- **`outputPhase` is already an emissions grab-bag**: accounts→stream, state→disk, delayed aggregations→workflow, form deletions→API. Reports→humans is the same *kind* of emission.
- **Crash mechanics verified in SDK**: `ResponseStream.send` = synchronous `writable.write(new RawResponse(chunk))`. Platform timeout/disconnect kills the socket → subsequent writes throw **synchronously** (`ERR_STREAM_WRITE_AFTER_END` / `ERR_STREAM_DESTROYED`) mid-loop inside `forEachISCAccount`. Catchable — but today nothing catches it until the top level.
- **Blast radius of a mid-stream crash (persistent run)**: skips `definition.saveState()`, `saveBatchCumulativeCount()`, `aggregateDelayedSources()`, `awaitPendingDeleteOperations()`, and the report → **total silence** for owners.
- **Dry-run ordering is backwards**: `res.send(summary)` (most fragile channel) runs *before* `finalizeDryRunReport` (file + email, most durable). If the summary send throws, the entire point of the dry-run is lost. Correct order: **file → email → stream**.
- **Dry-run writes correlation state (live bug)**: `ServiceRegistry` constructs `FusionService` with `isAggregationMode = (operationContext === 'accountList')` — true for dry-run too (dry-run is an input flag, not a command). `CorrelationManager.applyPerSourceCorrelationIfNeeded` guards only on `isAggregationMode()` → dry-run PATCHes identities via `identities.correlateAccounts(...)` when a source has `correlationMode: 'correlate'`.
- **Delayed aggregation fetch wasted in dry-run**: `fetchPhase` pushes `workflows.fetchDelayedAggregationSender()` whenever delayed sources exist, regardless of persistence; its only consumer is persistent-only `outputPhase → aggregateDelayedSources`.
- Stale doc comment: `accountList` claims dry-run "streams 1-to-1 StdAccountListOutput rows" — it does not; `outputPhase` short-circuits non-persistent runs.

## Decision chain

**Q1 — Is the report a phase?**
No. Evidence: the PHASE 6/7 numbering contradiction, and the self-timing hack. The report is an **epilogue** — the terminal block that renders/emits the results of phases 1–5. New domain term: *Epilogue* (must be added to `openspec/specs/ubiquitous-language/spec.md` per repo rules).

**Q2 — How should the report step be framed?** (user decision)
Options: (a) epilogue, not numbered; (b) Phase 6 with helper for symmetry; (c) fold into `outputPhase`.
→ **(a) Epilogue, not numbered.** A `reportPhase()` helper named by function absorbs both the persistent report and the dry-run block. Timer marker becomes `Epilogue: report generation` (keeps the `Report` row in phaseTiming).

**Q3 — Should `saveState()`/`saveBatchCumulativeCount()` run after partial stream failure?** (user decision)
→ **Skip.** All-or-nothing semantics: a failed run persists no state. (Trade-off accepted: accounts that reached ISC before the crash may drift on the next run.)

**Q4 — Should the run still be marked failed after the epilogue completes?** (user decision)
→ **Yes.** Capture `runError`, run the epilogue, then `log.crash` + rethrow. ISC must not treat partial output as a complete aggregation — but the failure is never silent.

**Q5 — Which "account correlations" should dry-run skip?** (user clarification)
→ The process governed by *Correlation mode → Correlate missing accounts on aggregation*: `CorrelationManager.applyPerSourceCorrelationIfNeeded` (call sites: `processFusionAccount`, `processFusionIdentityDecision`, `finalizeAuthoritativeNonMatch`). In dry-run this must become a no-op — it performs PATCH writes to ISC identities. Additionally, guard `fetchDelayedAggregationSender` behind `isPersistent` in `fetchPhase`.

## Design trade-offs

- **Deferred rethrow vs. immediate**: immediate rethrow is today's behavior and loses all durable artifacts. Deferred rethrow preserves reports/files/state decisions while still failing the run. Cost: slightly more complex control flow in `accountList`.
- **Epilogue step isolation**: each epilogue step (persistent report, dry-run file, dry-run email, summary send) is individually guarded (`try/catch` + `log.warn`); the epilogue never throws. Cost: epilogue failures are warn-only — acceptable, they are best-effort channels by nature.
- **Per-account send retry rejected**: a dead stream stays dead; retrying sends is pointless. The stream error aborts the send loop; partial `sent` count is tracked via `streamProgress` for observability.
- **Out of scope** (follow-ups): rendering `runError`/partial counts *inside* report content; running delayed-aggregation scheduling / form deletions after pipeline failure; per-account payload-error tolerance.
