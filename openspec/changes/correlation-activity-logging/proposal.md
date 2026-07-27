# Proposal: correlation-activity-logging

## Why

Correlation-on-aggregation, merge-driven correlation PATCHes, and correlated-action entitlement grants are core identity-linking outcomes during `accountList`, but they are invisible at INFO today. PATCH triggers record generic heartbeat counters only when `correlateAccounts` runs; skip paths and entitlement grants are silent. Refresh phase ends without correlation totals even when thousands of fusion accounts are processed. Operators cannot distinguish link (aggregation) from merge (decision) activity or diagnose why missing accounts remain.

## What Changes

**Correlation activity taxonomy at INFO**
- From: single `correlationTriggers` / `correlationAccounts` counters; no link vs merge attribution; no correlated-action counter.
- To: `link` and `merge` PATCH subtypes, `correlated-action` grant counter, aggregated skip-reason buckets.
- Reason: operators need unified correlation vocabulary aligned with domain terms.
- Impact: non-breaking; EVENT_SUMMARY string format evolves.

**Phase END includes correlation totals**
- From: `PHASE N Name END elapsed=` only.
- To: Refresh and Process `PHASE END` lines include cumulative correlation detail when non-zero (e.g. `correlations link=42/56 merge=0 correlated-action=38`).
- Reason: phase summaries must reflect identity-linking work, especially Refresh.
- Impact: additive INFO detail on phase boundaries.

**Instrumentation at correlation call sites**
- From: `IdentityService.correlateAccounts` records generic correlation; `updateStatus` grants entitlement silently; `CorrelationManager` skips silently at INFO.
- To: typed recording at PATCH, entitlement transition, and skip aggregation.
- Reason: counters only reflect what is instrumented.
- Impact: internal code only.

**Per-account correlation remains debug-only**
- From: already debug-only per 2026-07-24 heartbeat change.
- To: unchanged — INFO via aggregation only.
- Reason: scale (18k+ accounts).
- Impact: none.

## Capabilities

### New Capabilities

(none — assigned to existing specs)

### Modified Capabilities

- `log-service`: correlation activity counters (`link`, `merge`, `correlated-action`, skips); EVENT_SUMMARY format; PHASE END correlation detail; Refresh STATUS optional segment; LogService helper API.
- `account-list-operation`: pass phase correlation summary to `phaseEnd`; extend Process completion DETAIL; Refresh-phase correlation visibility scenarios.
- `ubiquitous-language`: glossary entries for **Correlation link**, **Correlation merge**, **Correlated-action grant** (log counter sense).

## Impact

- **Code**: `src/services/logService/` (`operationRunContext.ts`, `operationHeartbeat.ts`, `logService.ts`), `src/services/identityService.ts`, `src/services/correlationManager.ts`, `src/model/fusionAccount.ts`, `src/services/fusionService/decisionProcessor.ts`, `src/operations/accountList.ts`, `src/operations/helpers/accountListPhases.ts`.
- **Specs**: deltas for `log-service`, `account-list-operation`, `ubiquitous-language`.
- **Docs**: `docs/guides/advanced-connection-settings.md`, CHANGELOG.
- **Tests**: context, heartbeat, correlation manager, fusion service, account-list phase instrumentation.
- **APIs/contracts**: no connector-spec changes. Log output format change only.
