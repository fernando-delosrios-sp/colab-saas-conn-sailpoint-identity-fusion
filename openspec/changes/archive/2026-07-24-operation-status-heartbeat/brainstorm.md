# Brainstorm: operation-status-heartbeat

## Background

During long `accountList` aggregations, operators see disconnected telemetry:

- `Queue Stats: …` every 30s from `ClientService` — no phase context, no delta, `totalProcessed` can appear frozen for minutes while the queue is actually busy with slow in-flight API calls.
- `Memory usage - RSS: …` every 60s from `operationHandler` keep-alive — unrelated to pipeline phase.
- Per-account INFO lines (`MATCH FOUND`, `Triggering correlation for …`) — high volume, drown periodic signals.
- Phase labels (`PHASE N: …`) only logged **after** each phase completes — during a 15-minute Phase 4, no phase indicator appears.

Structured logging is **not** available from the ISC connector host today; all output must be plain text lines prefixed with `[accountList]`.

## Q1: What is the primary deliverable?

**Decision:** A unified **operation heartbeat** that explains *where* the run is, *how far* it has progressed, *whether it is stalled*, and *what account-level activity occurred* — using standardized text line kinds, not JSON fields.

## Q2: How should memory and queue heartbeats relate?

**Decision:** Consolidate into one **STATUS** line every 30s (`statsLoggingIntervalMs`).

- Remove standalone `Memory usage - RSS: …` log line; keep `res.keepAlive()` every 60s (platform timeout unchanged).
- Remove standalone `Queue Stats: …` interval from `ClientService`; heartbeat reads `getQueueStats()` + `getQueueItems()`.

## Q3: What about per-account logs (MATCH FOUND, correlation)?

**Decision:** **Summarize at INFO** via heartbeat `EVENT_SUMMARY` lines; reset counters each tick. Multiple summary lines allowed when content would be long (e.g. matches vs correlations vs outcomes-by-source). Failures (`trackFailed`) remain immediate warn/error — not deferred.

Optional: emit individual account detail at **debug** level when debug logging is enabled.

## Q4: Phase visibility?

**Decision:** Log **PHASE/STEP START** at boundaries (not only END). Keep existing `timer.phase()` at completion for report phase-timing breakdown. Use canonical phase names: Setup, Fetch, Refresh, Process, Output; Epilogue is not numbered.

## Q5: Stall detection?

**Decision:** When queue `totalProcessed` delta is zero for ≥2 consecutive STATUS ticks (~60s), emit `WARN STALL` with grouped active item labels (top 3 by count from queue `label` field).

## Q6: Scope?

**Decision:** v1 scopes instrumentation to **`accountList`** pipeline; shared infrastructure (`OperationRunContext`, `OperationHeartbeat`, LogService helpers) reusable by other operations later.

**Out of scope:** fixing slow API root cause, structured host logging, migrating all operations in v1.

## Agreed approach

```
OperationRunContext (on ServiceRegistry)
  ← phase/step/progress updated at boundaries
  ← event counters via recordEvent()
       ↓
OperationHeartbeat (30s)
  → STATUS line (phase, step, progress, queue delta, mem, elapsed)
  → EVENT_SUMMARY line(s) (aggregated since last tick)
  → WARN STALL when queue appears frozen
```

Text line vocabulary: `PHASE`, `STEP`, `STATUS`, `EVENT_SUMMARY`, `METRIC`, `WARN STALL`, `EPILOGUE`.

## Trade-offs accepted

- Less per-account INFO detail during runs — operators rely on heartbeat summaries; debug level retains detail.
- STATUS every 30s may feel coarse for fast runs — acceptable vs log noise.
- Log-scraping tools matching `Queue Stats:` or `Memory usage` strings will break — intentional migration.
