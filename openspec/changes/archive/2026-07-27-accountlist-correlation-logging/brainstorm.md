# Brainstorm: accountlist-correlation-logging

## Background

Production accountList run (first run after account reset, 2000 accounts) produced confusing correlation logs:

- `PHASE 5 Output END correlations correlated-action=2000 elapsed=225MS` — completed in 225ms
- `EVENT_SUMMARY correlations link=2000/2000 correlated-action=+2000/10s`
- `STATUS phase=Epilogue … queue-pending=IdentityService>correlateAccounts×1853`

Operator expectation: if 1853 correlations are still queued, how did Output finish so fast? And why is `correlated-action` reported during accountList when that entitlement grant belongs to accountUpdate?

## Root cause (validated)

Three different metrics were conflated:

1. **link=2000/2000** — PATCH jobs enqueued during Process (Phase 4) via optimistic correlation
2. **correlated-action=2000** — in-memory `FusionAction.Correlated` set on output rows during Output (Phase 5) via `updateCorrelationStatus`; not entitlement grants, not PATCH completion
3. **queue-pending×1853** — PATCH jobs still waiting in ApiQueue at LOW priority while handler continues

First run after reset: Refresh processes zero fusion rows; Process creates fusion accounts and enqueues link PATCHes to identityIds. No pre-existing fusion row required.

Optimistic correlation is by design (`docs/operations/account-list.md`): mark correlated in output, drain PATCHes in background.

## Q1: Should correlated-action appear in accountList logs?

**Decision: No.**

`correlated-action` represents the Correlated entitlement grant (accountUpdate / correlateAction). During accountList, `updateCorrelationStatus` only sets output attribute state optimistically — it must not increment logging counters.

Gate `recordCorrelatedActionGranted()` behind `!isAggregationMode` at call sites in fusionService and decisionProcessor.

## Q2: How to make background queue drain visible?

**Options considered:**

| Option | Pros | Cons |
|--------|------|------|
| DETAIL line at Process end only | Simple | No live drain visibility during Output/Epilogue |
| Rely on existing queue-pending | No code change | Hard to connect to link= counts |
| **STATUS/EVENT_SUMMARY drain metrics** | Live completed + pending alongside link counts | Slightly more counter plumbing |

**Decision: STATUS/EVENT_SUMMARY drain metrics** (user selected).

Format: `correlations link=triggers/accounts completed=N pending=M` where:
- `completed` — PATCH promises resolved successfully (interval delta on EVENT_SUMMARY)
- `pending` — queue snapshot count of `IdentityService>correlateAccounts` labels (STATUS during Output/Epilogue)

## Q3: Scope of correlated-action logging after fix?

Keep `recordCorrelatedActionGranted` for non-aggregation operations (future accountUpdate instrumentation). Remove from accountList EVENT_SUMMARY, PHASE END, STATUS, and Process DETAIL.

## Agreed approach

1. Suppress correlated-action counter during aggregation mode
2. Add linkCompleted/mergeCompleted counters wired from IdentityService PATCH resolve
3. Extend formatCorrelationSummaryValue and heartbeat formatters with completed + pending segments
4. Update log-service and account-list-operation specs; docs and CHANGELOG

## Open questions

(none — queue visibility approach confirmed by operator)
