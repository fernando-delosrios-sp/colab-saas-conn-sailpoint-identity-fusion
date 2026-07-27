# Brainstorm: correlation-activity-logging

## Background

Operators running `accountList` cannot see correlation-on-aggregation activity at INFO level. PATCH correlation triggered during Refresh (correlation-on-aggregation for missing managed accounts) records events via `recordEvent('correlation')`, but:

- Per-account trigger text is **debug-only** (`Triggering correlation for …`).
- Skip paths in `CorrelationManager` are debug-only or silent (wrong `correlationMode`, missing source context).
- **`FusionAction.Correlated` entitlement grants** via `FusionCorrelation.updateStatus()` have **no logging**.
- Identity **merge** decisions (authorized form + auto-merge) invoke the same correlation path but PATCH activity is not attributed separately from generic correlation counters.
- `PHASE END` lines carry **no correlation totals** — Refresh phase (where most aggregation correlation runs) ends with only `elapsed=`.

Users observe missing accounts clearing on some fusion rows (identity-index blend) while many remain, with zero `EVENT_SUMMARY correlations` lines — conflating blend with PATCH correlation.

The existing heartbeat model (2026-07-24 operation-status-heartbeat) intentionally aggregates per-account INFO into `EVENT_SUMMARY`; this change extends that model for correlation visibility without reverting to per-account INFO spam.

## Q1: What is the umbrella term and breakdown?

**Decision:** **Correlation** is the general INFO-level observability category. Subtypes:

- **link** — correlation-on-aggregation PATCH (`correlationMode: correlate`, missing accounts during Refresh or non-match Process paths).
- **merge** — correlation PATCH triggered by an identity-merge decision (authorized form outcome or auto-merge).

**Correlated-action** — separate counter for when `FusionAction.Correlated` entitlement is **newly assigned** (transition to fully correlated), not idempotent re-computation.

## Q2: INFO granularity?

**Decision:** **Aggregated at INFO** — phase END totals, heartbeat `EVENT_SUMMARY`, optional Refresh STATUS segment. No per-account INFO at default level (18k+ fusion accounts). Debug retains per-account detail.

## Q3: Where should summaries appear?

**Decision:** Three surfaces:

1. **EVENT_SUMMARY** each heartbeat tick — `correlations link=triggers/accounts merge=triggers/accounts correlated-action=N skipped=…`
2. **PHASE END** detail suffix — cumulative totals for the phase (`PHASE 3 Refresh END correlations link=…`)
3. **Process phase DETAIL** — extend existing `matches=` / `forms=` completion line with correlation segment

Optional: Refresh STATUS cumulative correlation segment alongside `refreshed(N)`.

## Q4: What about skip reasons?

**Decision:** Aggregate skip buckets in counters: `noIdentity`, `noSourceContext`, `wrongMode`, `noIscAccountId`. Include in EVENT_SUMMARY and phase END when non-zero. Keep existing immediate WARN for unresolvable ISC account id; do not emit per-account INFO for skips.

## Q5: Scope?

**Decision:** Account-list pipeline primary; shared `OperationRunContext` / `LogService` helpers reusable by explicit correlate action (`accountUpdate`) later. **Out of scope:** reverse-correlation attribute writes, per-account INFO threshold, correlation business logic changes.

## Agreed approach

```
OperationRunContext
  ← recordCorrelationActivity({ kind: 'link' | 'merge', accounts })
  ← recordCorrelatedActionGranted()
  ← recordCorrelationSkipped(reason)
  ← phase cumulative counters (reset phaseStart, flush phaseEnd)
       ↓
Call sites: IdentityService, CorrelationManager, FusionAccount.updateCorrelationStatus seam, DecisionProcessor
       ↓
OperationHeartbeat EVENT_SUMMARY + accountList phaseEnd detail + Refresh STATUS segment
```

## Trade-offs accepted

- Less granular than per-account INFO — operators use phase totals + debug drill-down.
- `EVENT_SUMMARY correlations triggered=N accounts=M` format evolves to link/merge breakdown — document migration in CHANGELOG.
- Correlated-action counts transitions only — may under-count if status recomputed without state change.
