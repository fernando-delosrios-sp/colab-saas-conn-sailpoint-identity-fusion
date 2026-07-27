# Proposal: accountlist-correlation-logging

## Why

The correlation-activity-logging change (2026-07-27) introduced link/merge/correlated-action counters at INFO, but production runs show misleading output during accountList. `correlated-action` counts in-memory output state during Phase 5 Output (225ms for 2000 accounts) while thousands of correlation PATCHes remain queued — operators cannot reconcile fast phase completion with background drain. `correlated-action` also misrepresents accountUpdate entitlement grants during aggregation. First-run-after-reset scenarios enqueue bulk link PATCHes in Process, not Refresh, which is invisible when only Output phase END is read.

## What Changes

**Remove correlated-action from accountList logging**
- From: `recordCorrelatedActionGranted()` fires during aggregation Refresh, Process, and Output via `updateCorrelationStatus`; EVENT_SUMMARY and PHASE END include `correlated-action=`.
- To: correlated-action counter suppressed when `isAggregationMode`; accountList logs use `correlations link=… merge=…` only (plus skipped when non-zero).
- Reason: correlated-action is the accountUpdate entitlement grant, not optimistic output attribute state.
- Impact: non-breaking format change; grep patterns for `correlated-action=` no longer apply to accountList.

**Add correlation drain metrics to STATUS and EVENT_SUMMARY**
- From: enqueue visibility via link=triggers/accounts; drain only via generic `queue-pending=IdentityService>correlateAccounts×N`.
- To: `completed=N` (PATCH resolved) and `pending=N` (queue snapshot) segments alongside link/merge during Output and Epilogue STATUS; interval `completed=+N/interval` on EVENT_SUMMARY.
- Reason: operators need to see background PATCH progress vs enqueued totals.
- Impact: additive INFO segments; no behavior change to correlation logic.

**Instrumentation at PATCH resolve boundary**
- From: no completed counter; pending inferred only from queue labels.
- To: `recordCorrelationCompleted({ kind })` on IdentityService PATCH success; heartbeat snapshot includes correlation queue pending count.
- Reason: counters must reflect actual API completion, not optimistic in-memory state.
- Impact: internal code only.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `log-service`: remove correlated-action from accountList correlation format; add completed/pending drain segments; extend OperationRunContext counters and heartbeat snapshot.
- `account-list-operation`: update aggregation logging requirements to exclude correlated-action; require drain visibility during Output/Epilogue when correlation queue is active.

## Impact

- **Code**: `src/services/logService/` (operationRunContext, operationHeartbeat, logService), `src/services/identityService.ts`, `src/services/fusionService/fusionService.ts`, `src/services/fusionService/decisionProcessor.ts`, `src/services/serviceRegistry.ts`.
- **Specs**: deltas for `log-service`, `account-list-operation`.
- **Docs**: `docs/guides/advanced-connection-settings.md`, CHANGELOG.
- **Tests**: operationRunContext, operationHeartbeat, identityService, fusionService.
- **APIs/contracts**: no connector-spec changes. Log format evolution only.
