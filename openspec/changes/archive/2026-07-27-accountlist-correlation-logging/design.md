# Design: accountlist-correlation-logging

## Context

Account-list correlation uses optimistic linking: `IdentityService.correlateSingleAccount` marks accounts correlated in memory and enqueues `accounts.updateAccount` PATCH at LOW priority. Output calls `getISCAccount(account, false)` — it does not await PATCH completion. The prior logging change added `correlated-action` when `updateCorrelationStatus` transitions to fully correlated, which fires for every output row during Phase 5 even when PATCHes are still queued.

| Phase | Correlation work | What logs showed |
|-------|------------------|------------------|
| Refresh | Link PATCH for existing fusion rows | link counts (0 on first run) |
| Process | Bulk link/merge PATCH enqueue | link=2000/2000 |
| Output | Status recompute only (no PATCH) | correlated-action=2000 in 225ms |
| Epilogue | Background queue drain | queue-pending×1853 |

Stakeholders: operators monitoring aggregation logs, log grep/monitor maintainers.

## Goals / Non-Goals

**Goals:**
- accountList correlation logs show `link=` and `merge=` only (plus skipped, completed, pending).
- Suppress misleading `correlated-action` during aggregation.
- Live drain visibility: completed PATCH count and pending queue count in STATUS/EVENT_SUMMARY.
- Preserve existing link/merge enqueue counters and skip buckets.

**Non-Goals:**
- Awaiting correlation PATCHes before accountList returns (optimistic behavior unchanged).
- Per-account INFO correlation lines.
- Instrumenting accountUpdate correlateAction in this change (correlated-action counter remains available for future non-aggregation use).
- Changing correlation business logic or queue priority.

## Decisions

### D1: Gate correlated-action recording on aggregation mode

- **Choice**: Pass `undefined` instead of `recordCorrelatedActionGranted` callback to `updateCorrelationStatus` when `FusionService.isAggregationMode` is true. Call sites: `processFusionAccount`, `getISCAccount`, `decisionProcessor.processFusionIdentityDecision`.
- **Reason**: aggregation output state ≠ entitlement grant; avoids 2000 false positives in Output phase.
- **Alternatives**: Filter at format time only — counters would still inflate internally; gate at source is cleaner.

### D2: completed counter at PATCH resolve

- **Choice**: Add `linkCompleted` / `mergeCompleted` to `CorrelationActivityCounters`. New helper `recordCorrelationCompleted({ kind, count })`. Wire in `IdentityService.buildCorrelationPromise` `.then()`.
- **Reason**: single seam where API success is known; kind already flows through `correlateAccounts`.
- **Alternatives**: infer from api-queue totalProcessed delta — cannot attribute to correlation vs other API calls.

### D3: pending from queue snapshot

- **Choice**: Count pending queue items matching `IdentityService>correlateAccounts` label prefix in `getHeartbeatSnapshot`. Expose as `correlationQueuePending` on `HeartbeatSnapshot`. Show `pending=N` on STATUS when N > 0 and phase is Output or Epilogue (or whenever link/merge activity exists in run).
- **Reason**: reuses existing label normalization in operationHeartbeat; no duplicate queue.
- **Alternatives**: track enqueued-minus-completed — drifts if PATCH fails and is not retried as correlate label.

### D4: Format segments

- **Choice**:
  - Enqueue (unchanged): `link=triggers/accounts`, `merge=triggers/accounts`
  - Drain: `completed=N` cumulative on PHASE END / Refresh STATUS; `completed=+N/interval` on EVENT_SUMMARY
  - Queue: `pending=N` on STATUS only when N > 0
- **Reason**: matches operator-requested `link=x merge=y completed=z pending=w` without overloading link fraction semantics.
- **Alternatives**: `link=2000/2000/147` (triggers/accounts/completed) — breaks existing parsers.

### D5: Spec and doc migration

- **Choice**: MODIFIED requirements in log-service and account-list-operation; remove correlated-action from accountList examples in advanced-connection-settings; CHANGELOG entry.
- **Reason**: prior change documented correlated-action for accountList — must revert that guidance.

## Risks / Trade-offs

- [Risk] Operators grep `correlated-action=` on accountList logs. → Mitigation: CHANGELOG and doc update; note scoped to accountUpdate.
- [Risk] completed counter lags if PATCH fails silently (logged error, no increment). → Mitigation: accepted; pending stays high; errors remain at error level.
- [Trade-off] pending is point-in-time snapshot, not cumulative. → Accepted: sufficient for drain visibility.
- [Trade-off] Output phase END may show zero link if enqueue happened in Process. → Accepted: Process PHASE END carries bulk totals; documented.

## Migration Plan

N/A — log format only. Rollback = revert change. Update grep patterns:
- Remove: `grep 'correlated-action=' connector.log` for accountList monitoring
- Add: `grep 'correlations.*completed=' connector.log`, `grep 'pending=' connector.log`

## Open Questions

(none)
