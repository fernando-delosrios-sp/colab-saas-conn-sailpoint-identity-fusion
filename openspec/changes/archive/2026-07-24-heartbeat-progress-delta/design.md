# Design: heartbeat-progress-delta

## Context

`OperationHeartbeat` (`operationHeartbeat.ts`) emits STATUS every `statsLoggingIntervalMs` (default 10s). It reads `OperationRunContext.progress` and `ClientService.getQueueStats()`. Today it tracks `previousProcessed` for queue delta and stall detection but does not track previous pipeline progress. Callers update progress via `LogService.setProgress(done, total, unit?)` in Refresh (`batchProcess`), Process (`matchOutcomeDispatcher`, record-unique registration), and Output (`forEachISCAccount`). Fetch parallel pagination knows `X-Total-Count` but never calls `setProgress`.

The ISC connector host receives plain text only; STATUS must remain grep-friendly with `name=value` segments.

## Goals / Non-Goals

**Goals:**
- Show pipeline progress delta on each STATUS tick when `progress` is set.
- Relabel API queue segment to `api-queue … completed=` so it cannot be confused with pipeline units like `processed`.
- Wire Fetch-phase pagination to `setProgress` with unit `fetched`.
- Preserve existing stall detection on api-queue completed delta.
- Update tests, glossary, and CHANGELOG.

**Non-Goals:**
- Changing heartbeat interval configuration (already in Advanced Connection Settings, default 10s).
- Stall detection on pipeline progress (false positives during idle queue).
- Per-account INFO progress lines.
- Migrating operations other than account-list fetch instrumentation in v1.

## Decisions

### D1: Dual delta tracking in OperationHeartbeat
- **Choice**: Add `previousProgressDone?: number`; compute `progressDelta = done - previousProgressDone` each tick (undefined on first tick or when progress absent).
- **Reason**: mirrors proven queue delta pattern; minimal state.
- **Considered alternatives**: store full `ProgressSnapshot` — unnecessary; derive delta inside `formatStatusLine` only — loses reset semantics on heartbeat stop.

### D2: STATUS vocabulary
- **Choice**:
  - Pipeline: `progress=7596/18495 processed(Δ+2700/10s)` when unit set, else `progress=7596/18495(Δ+2700/10s)`.
  - API queue: `api-queue active=0 queued=0 completed=635(Δ+0/10s)`.
- **Reason**: unit immediately after fraction ties delta to pipeline work type; `api-queue` + `completed` avoids collision with pipeline `processed` unit.
- **Considered alternatives**: `pipeline-progress` prefix — redundant with `progress=` key; keep `queue processed=` — caused the original confusion.

### D3: Shared delta formatter
- **Choice**: Extract `formatDeltaSuffix(current, previous, intervalMs)` used by both progress and api-queue formatters.
- **Reason**: consistent `(Δ±N/intervalSeconds)` spelling; single place to omit first tick.
- **Considered alternatives**: inline duplication — drift risk.

### D4: Fetch progress instrumentation points
- **Choice**: Update progress at service batch boundaries:
  - `SourceService.fetchManagedAccounts` — accumulate across sources; total from `X-Total-Count` when parallel pagination provides it.
  - `SourceService.fetchFusionAccounts` — same pattern.
  - `IdentityService.fetchIdentities` — after search pagination batches (via client pagination hook or post-batch loop).
  - `FormService.fetchFormInstances` — after sequential pagination pages if duration warrants.
- **Reason**: aligns heartbeat with meaningful memory-loaded batches, not every queued HTTP call.
- **Considered alternatives**: hook inside `ApiQueue` on completion — wrong abstraction layer.

### D5: Optional pagination progress callback on ClientService
- **Choice**: Add optional `onPageProgress?: (loaded: number, total?: number) => void` to paginate policies used by Fetch paths; services pass `(loaded, total) => log.setProgress(loaded, total ?? loaded, 'fetched')`.
- **Reason**: centralizes total-count discovery in pagination helpers already parsing headers.
- **Considered alternatives**: duplicate header parsing in each service — error-prone.

### D6: Unknown fetch totals
- **Choice**: When total unknown (sequential pagination without count header), use `setProgress(loaded, loaded, 'fetched')` until total known; delta still reflects pages loaded.
- **Reason**: better than omitting progress entirely.
- **Considered alternatives**: omit progress until total known — STATUS blind for early fetch minutes.

## Risks / Trade-offs

- [Risk] Log monitors grep `queue processed=` → **Mitigation**: CHANGELOG + glossary migration note; archive delta updates ubiquitous-language.
- [Risk] Fetch progress double-counts across parallel sources → **Mitigation**: single aggregate counter in fetch phase coordinator or per-task progress with step detail (prefer aggregate in `fetchPhase` wrapper if multiple tasks run parallel).
- [Trade-off] Longer STATUS lines → accepted for operator clarity.
- [Trade-off] Parallel Fetch tasks (`Promise.all`) share one progress counter → acceptable v1; step-level detail deferred.

## Migration Plan

N/A — no deployment or stored-data changes. Rollback = revert change. Operators should update log scrapers:
- `queue processed=` → `api-queue completed=`
- Optionally match `progress=…(Δ+` for pipeline throughput alerts.

## Open Questions

- Should Fetch parallel tasks expose separate progress per task (`step=fetch-managed`, `step=fetch-identities`) instead of one aggregate? (Defer — step START lines already identify phase; aggregate sufficient for v1.)
- Should `formatStallWarning` message text reference `completed` instead of `processed`? (Yes — align wording during apply.)
