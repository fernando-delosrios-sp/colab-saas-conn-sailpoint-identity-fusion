# Design: operation-status-heartbeat

## Context

The account-list pipeline (`setupPhase` → `outputPhase` + epilogue) can run 15+ minutes. Today three independent timers produce logs:

| Source | Interval | Line |
|--------|----------|------|
| `ClientService.startStatsLogging()` | 30s | `Queue Stats: …` |
| `operationHandler` memory keep-alive | 60s | `Memory usage - RSS: …` + `res.keepAlive()` |
| Match/correlation callers | unbounded | `MATCH FOUND: …`, `Triggering correlation …` |

`PhaseTimer.phase()` in `accountList.ts` fires only **after** each phase. `ApiQueue` already exposes `getStats()`, `getActiveItems()`, and `getPendingItems()` with request `label` strings — unused by stats logging.

The ISC connector host receives plain text via `@sailpoint/connector-sdk` `logger`; structured fields in `log-service` spec are aspirational, not operational.

## Goals / Non-Goals

**Goals:**
- One periodic **STATUS** heartbeat (30s) explaining phase, step, progress, queue delta, memory, elapsed time.
- **EVENT_SUMMARY** line(s) aggregating per-account activity each tick.
- **PHASE/STEP START** at pipeline boundaries; preserve existing phase-timing breakdown for reports.
- **WARN STALL** when queue completion stalls ≥60s, with active label breakdown.
- Shared infrastructure reusable by other operations later.

**Non-Goals:**
- Structured/JSON host logging.
- Fixing slow ISC API root cause.
- Migrating all connector operations to heartbeat in v1.
- Removing platform keep-alive (only the memory **log line**).

## Decisions

### D1: Single heartbeat owner (`OperationHeartbeat`)
- **Choice**: New module `src/services/logService/operationHeartbeat.ts` started/stopped from `accountList` `try/finally`. Reads `ServiceRegistry.getCurrent()`, `client.getQueueStats()`, `client.getQueueItems()`, `process.memoryUsage()`.
- **Reason**: one place formats situational awareness; avoids duplicating interval logic in `ClientService` and `operationHandler`.
- **Alternatives**: extend `ClientService` interval with phase injection — queue layer shouldn't know pipeline phases; extend `operationHandler` — wrong lifecycle (all operations, not just accountList).

### D2: `OperationRunContext` on `ServiceRegistry`
- **Choice**: Mutable context `{ phase, step, progress, events, operationStartedAt }` updated via new `LogService` helpers: `phaseStart/End`, `stepStart/End`, `setProgress`, `recordEvent`.
- **Reason**: AsyncLocalStorage-scoped registry already exists; heartbeat and formatters read one source of truth.
- **Alternatives**: pass context through `PhaseOptions` — invasive prop-drilling; global singleton — breaks concurrent operations.

### D3: Text line vocabulary (grep-friendly prefixes)
- **Choice**: Standard prefixes after `[accountList]`: `PHASE`, `STEP`, `STATUS`, `EVENT_SUMMARY`, `METRIC`, `WARN STALL`, `EPILOGUE`. Key-value segments use `name=value` and `|` separators.
- **Reason**: plain-text contract operators can tail and grep without host structured support.
- **Alternatives**: JSON-in-string — harder to read in ISC log UI; unstructured free text — current problem.

### D4: Event aggregation replaces per-account INFO
- **Choice**: `recordEvent(category, detail)` increments counters; heartbeat emits one or more `EVENT_SUMMARY` lines per tick, then resets counters. Categories: `match` (exact/partial/deferred), `correlation`, `nonMatch`, `autoAssigned`, `formsQueued`. Failures via existing `trackFailed` stay immediate.
- **Reason**: user confirmed events should be **summarized**; multiple summary lines acceptable.
- **Alternatives**: sample N per tick — more complex, less complete; keep all INFO — noise persists.

### D5: Stall detection on queue processed delta
- **Choice**: Track previous `totalProcessed` each STATUS tick; if delta 0 for ≥2 consecutive ticks, emit `WARN STALL` with top 3 active labels grouped by count.
- **Reason**: matches observed failure mode (10 active slots, flat processed, growing queue).
- **Alternatives**: wall-clock on step alone — misses queue-specific stalls; single tick — too noisy on bursty workloads.

### D6: Remove redundant progress log lines
- **Choice**: `setProgress()` updates context only; STATUS shows `progress=done/total`. Remove standalone `Managed accounts progress: …` and `Correlated … progress: …` at INFO (optional debug-only retention).
- **Reason**: avoids duplicating heartbeat; PROGRESS and STATUS would say the same thing 30s apart.
- **Alternatives**: keep both — redundant noise.

### D7: Interval alignment
- **Choice**: STATUS at `statsLoggingIntervalMs` (default 30s). Platform keep-alive at `processingWait` (default 60s), silent.
- **Reason**: reuse existing config; stall detection = 2 × STATUS interval ≈ 60s.

## Risks / Trade-offs

- [Risk] Log automation matching `Queue Stats:` / `Memory usage` breaks. → Mitigation: document new prefixes in spec and CHANGELOG; grep migration guide in verify artifact.
- [Risk] Missing `recordEvent` at a new call site leaves blind spots in EVENT_SUMMARY. → Mitigation: spec lists required instrumentation points; tests assert no direct match/correlation INFO at default level.
- [Trade-off] Operators lose per-account INFO trail during production runs. → Accepted: summaries + debug detail; aligns with user request.
- [Trade-off] Heartbeat only on accountList in v1. → Accepted: other operations unchanged until follow-up.

## Migration Plan

N/A — no deployment or stored-data changes. Rollback = revert change. Operators should update log monitors from `Queue Stats:` / `Memory usage` to `STATUS` / `WARN STALL`.

## Open Questions

- Should `accountRead` / `accountUpdate` adopt heartbeat in a follow-up change? (Recommended yes, separate change.)
- Should EVENT_SUMMARY include top-N source names by match volume when line length exceeds a threshold? (Implement if needed during apply.)
