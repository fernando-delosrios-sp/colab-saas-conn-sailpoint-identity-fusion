# Proposal: heartbeat-progress-delta

## Why

The operation heartbeat STATUS line shows climbing `progress=done/total` during Refresh, Process, and Output, but the only visible delta is `(Δ+0/interval)` on the API queue `processed` counter. Operators interpret that as “nothing is happening” even when thousands of pipeline items advance each tick, because queue completions and enumerable pipeline progress are different metrics sharing one ambiguous suffix. Fetch phase is worse: paginated ISC calls complete through the queue while STATUS shows no pipeline progress at all, even though each page adds accounts to memory. The heartbeat must expose pipeline throughput separately from API queue throughput with grep-friendly labels.

## What Changes

**Pipeline progress delta on STATUS**
- From: `progress=7596/18495` with no delta; only queue segment shows `(Δ+0/10s)`.
- To: `progress=7596/18495(Δ+2700/10s)` (optional unit suffix such as `fetched`, `processed`, `analyzed`, `sent`, `registered` when set by caller).
- Reason: operators need per-tick pipeline throughput during CPU-bound phases when the API queue is idle.
- Impact: additive field on STATUS; non-breaking on behavior.

**API queue segment relabeled for clarity**
- From: `queue active=… queued=… processed=635(Δ+0/10s)`.
- To: `api-queue active=… queued=… completed=635(Δ+0/10s)`.
- Reason: disambiguate HTTP queue completions from pipeline “processed” unit.
- Impact: log string change; scrapers matching `queue processed=` need updating.

**Fetch phase progress instrumentation**
- From: Fetch phase emits no `setProgress`; STATUS during Fetch lacks `progress=`.
- To: Fetch tasks update `setProgress` at page/batch boundaries with unit `fetched` and known totals when `X-Total-Count` (or search page accumulation) allows.
- Reason: Fetch runs minutes on large tenants; heartbeat should show fetch advancement without relying on queue delta alone.
- Impact: additive `setProgress` calls in fetch services; STATUS shows progress during Fetch.

**Stall detection unchanged**
- From/To: WARN STALL still keyed on flat **api-queue completed** delta with active/queued items.
- Reason: pipeline progress can advance while queue is idle (Refresh); stall semantics stay API-specific.

## Capabilities

### New Capabilities

(none — assigned to existing specs)

### Modified Capabilities

- `log-service`: STATUS format adds pipeline progress delta; api-queue relabeling; progress unit display; heartbeat tracks previous progress baseline.
- `account-list-operation`: Fetch phase SHALL drive `setProgress` during paginated loads so STATUS reflects fetch advancement.
- `ubiquitous-language`: distinguish pipeline progress delta from api-queue completed delta in STATUS line vocabulary.

## Impact

- **Code**: `src/services/logService/operationHeartbeat.ts`, `src/services/logService/operationRunContext.ts`, `src/services/sourceService/sourceService.ts`, `src/services/identityService.ts`, `src/services/formService/formService.ts` (form fetch pagination), `src/operations/helpers/accountListPhases.ts`, tests under `src/services/logService/__tests__/`.
- **Specs**: deltas for `log-service`, `account-list-operation`, `ubiquitous-language`.
- **Docs**: `docs/concepts/glossary.md`, `docs/guides/advanced-connection-settings.md` (STATUS line description), CHANGELOG.
- **APIs/contracts**: no connector-spec schema changes. Log output string changes only.
