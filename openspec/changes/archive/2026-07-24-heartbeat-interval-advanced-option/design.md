## Context

`OperationHeartbeat` ticks every `statsLoggingIntervalMs` to emit `STATUS`, `EVENT_SUMMARY`, and optional `WARN STALL` lines. Today that value is merged from `internalConfigClientService.statsLoggingIntervalMs` (30_000) via `getInternalConfigFlat()` before the settings pipeline runs, so it is not operator-configurable.

Advanced Connection Settings already converts second-based UI fields (e.g. `processingWait`) to milliseconds in `advancedConnectionSettings.readSettings`. This change follows the same pattern for heartbeat interval.

## Goals / Non-Goals

**Goals:**
- Expose **Heartbeat interval (seconds)** in Advanced Connection Settings
- Default to **10 seconds** (10_000 ms runtime)
- Preserve existing `statsLoggingIntervalMs` field on `FusionConfig` for consumers (`ServiceRegistry.getHeartbeatSnapshot`, `OperationHeartbeat`)
- Update specs, tests, and CHANGELOG

**Non-Goals:**
- Changing heartbeat line format or stall-detection algorithm
- Adding heartbeat to other operations (`accountRead`, etc.) — separate change
- Renaming `statsLoggingIntervalMs` across the codebase

## Decisions

### D1: Setting key and placement
- **Choice:** `heartbeatInterval` in Advanced Connection Settings section of `connector-spec.json`
- **Reason:** Operational tuning alongside `processingWait`; not developer-only
- **Considered alternatives:** Developer Settings (rejected — too hidden); env var override (rejected — inconsistent with connector config model)

### D2: Runtime field name
- **Choice:** Keep `statsLoggingIntervalMs` on `FusionConfig`; populate from `heartbeatInterval` via `readSettings`
- **Reason:** Minimal churn — `ServiceRegistry` and tests already reference this field
- **Considered alternatives:** Rename to `heartbeatIntervalMs` (rejected — unnecessary refactor)

### D3: Default and bounds
- **Choice:** Default 10 seconds; UI min 5 seconds; no max (reasonable upper bound optional in help text)
- **Reason:** User request for 10s default; min 5s prevents log flooding
- **Considered alternatives:** Min 10s (rejected — would block user request); keep 30s default (rejected — explicit user requirement)

### D4: Internal config removal
- **Choice:** Remove `statsLoggingIntervalMs` from `getInternalConfigFlat()` merge; define fallback in `advancedConnectionSettings.runtimeDefaults` only
- **Reason:** Prevents internal constant from overriding the advanced-settings default after merge order changes
- **Considered alternatives:** Leave internal constant and override in readSettings (rejected — two sources of truth)

### D5: Unit conversion
- **Choice:** Same as `processingWait`: UI stores seconds; `readSettings` multiplies by 1000 when present; falls back to `runtimeDefaults.statsLoggingIntervalMs`
- **Reason:** Established connector-spec convention for time intervals in Advanced Connection Settings

## Risks / Trade-offs

- [Risk] Default 10s triples STATUS log volume vs 30s → Mitigation: advanced setting lets operators increase interval; document in CHANGELOG
- [Risk] Stall WARN fires after ~20s instead of ~60s → Mitigation: accepted — faster stall signal is desirable; interval is configurable
- [Trade-off] Existing deployments get new default on upgrade without explicit config → Reason: non-breaking; operators can set 30 if preferred

## Migration Plan

1. Ship connector with new `connector-spec.json` field and default initial value `heartbeatInterval: 10`
2. Existing saved source configs without the field receive runtime default 10s via `readSettings` fallback
3. Operators wanting previous behavior set **Heartbeat interval** to 30 in Advanced Connection Settings
4. Rollback: revert connector version; no data migration required

## Open Questions

- None
