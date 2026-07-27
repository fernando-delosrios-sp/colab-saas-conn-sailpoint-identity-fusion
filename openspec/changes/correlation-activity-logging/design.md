# Design: correlation-activity-logging

## Context

The account-list pipeline performs identity linking through three related mechanisms:

| Mechanism | Code path | Current logging |
|-----------|-----------|-----------------|
| Correlation-on-aggregation (link) | `processFusionAccount` → `CorrelationManager.applyPerSourceCorrelationIfNeeded` → `IdentityService.correlateAccounts` | `recordEvent('correlation')` → EVENT_SUMMARY; debug per-account |
| Merge-driven correlation (merge) | `DecisionProcessor.processFusionIdentityDecision` (authorized + auto-merge) → same correlation path | Same generic counter; `autoMerged` counted separately |
| Correlated-action entitlement | `FusionCorrelation.updateStatus()` when all missing accounts cleared | None |

Refresh phase (Phase 3) processes all fusion accounts and is the primary link-correlation window, but `PHASE 3 Refresh END` emits no activity totals. Operators reported zero correlation log lines while observing partial missing-account cleanup (identity-index blend, not PATCH).

Existing heartbeat infrastructure (`OperationRunContext`, `OperationHeartbeat`, `recordEvent`) from operation-status-heartbeat provides the extension point.

## Goals / Non-Goals

**Goals:**
- INFO-level visibility for correlation activity via aggregation (EVENT_SUMMARY, PHASE END, Process DETAIL).
- Distinguish **link** vs **merge** PATCH subtypes and **correlated-action** entitlement grants.
- Aggregate skip reasons when correlation PATCH is not attempted.
- Phase cumulative totals flushed at Refresh and Process `PHASE END`.
- Optional Refresh STATUS segment for mid-phase visibility.

**Non-Goals:**
- Per-account INFO lines at default log level.
- Logging reverse-correlation attribute writes.
- Changing correlation business logic or dry-run write inhibition.
- Instrumenting non-accountList operations in v1 (helpers reusable later).

## Decisions

### D1: Two-layer counters (interval + phase cumulative)

- **Choice**: Extend `OperationRunContext` with interval counters (heartbeat flush) and phase cumulative counters (reset at `phaseStart`, snapshot at `phaseEnd`). Same fields for both layers.
- **Reason**: matches existing match outcome pattern (`cumulativeOutcomes` vs tick counters).
- **Alternatives**: phase-only counters — lose mid-phase heartbeat visibility; single layer — cannot show both tick delta and phase total.

### D2: Correlation activity API on LogService

- **Choice**: New helpers:
  - `recordCorrelationActivity({ kind: 'link' | 'merge', accounts: number })`
  - `recordCorrelatedActionGranted()`
  - `recordCorrelationSkipped(reason)`
  - `flushPhaseCorrelationSummary()` / `resetPhaseCorrelationCounters()`
- **Reason**: typed API prevents miscategorized events; centralizes counter logic.
- **Alternatives**: extend `recordEvent('correlation', { kind })` only — less type-safe, harder to enforce phase vs tick semantics.

### D3: Entitlement grant on transition only

- **Choice**: Wire `onCorrelatedActionGranted` callback from `FusionAccount.updateCorrelationStatus()` when `FusionCorrelation.updateStatus()` transitions **into** fully correlated state (adds `FusionAction.Correlated`).
- **Reason**: avoid inflating counts on idempotent status recomputation.
- **Alternatives**: count every `updateStatus()` call — noisy on 18k accounts.

### D4: Pass merge vs link kind at correlateAccounts boundary

- **Choice**: `IdentityService.correlateAccounts(fusionAccount, accountIdFilter?, kind?: 'link' | 'merge')`. Default `link`. DecisionProcessor passes `merge` for authorized decisions.
- **Reason**: single PATCH seam; kind known at caller.
- **Alternatives**: infer kind from stack — fragile, untestable.

### D5: Skip aggregation in CorrelationManager

- **Choice**: Before filtering `directCorrelateIds`, increment skip counters for: no `identityId`, missing `getManagedAccountInfo`, wrong `correlationMode`. `IdentityService.correlateSingleAccount` increments `noIscAccountId`.
- **Reason**: explains silent non-PATCH without per-account INFO.
- **Alternatives**: INFO DETAIL per skip — too verbose at scale.

### D6: EVENT_SUMMARY format evolution

- **Choice**: Replace `correlations triggered=N accounts=M` with:
  `EVENT_SUMMARY correlations link=triggers/accounts merge=triggers/accounts correlated-action=+N/interval correlated-action-total optional skipped=…`
  Emit only non-zero segments.
- **Reason**: user-requested link/merge breakdown; interval delta on correlated-action uses existing delta formatter.
- **Alternatives**: keep old format + new line — redundant.

### D7: PHASE END detail wiring in accountList

- **Choice**: After each phase body, `log.phaseEnd(n, phase, log.flushPhaseCorrelationSummary())` when summary non-empty.
- **Reason**: minimal change; reuses existing `phaseEnd` detail suffix.
- **Alternatives**: separate DETAIL line after phaseEnd — splits related info across lines.

## Risks / Trade-offs

- [Risk] Log monitors matching old `correlations triggered=` format break. → Mitigation: CHANGELOG migration note; document new format in advanced-connection-settings guide.
- [Risk] Missing instrumentation at new call sites. → Mitigation: spec lists required sites; tests assert counters increment in fusion/correlation tests.
- [Trade-off] Correlated-action counts transitions only. → Accepted: matches operator intent (new grants).
- [Trade-off] Skip buckets may not capture all edge cases initially. → Accepted: v1 covers four known silent filters.

## Migration Plan

N/A — no deployment or stored-data changes. Rollback = revert change. Operators should update log grep patterns from `correlations triggered=` to `correlations link=`.

## Open Questions

(none — taxonomy and surfaces agreed in brainstorm)
