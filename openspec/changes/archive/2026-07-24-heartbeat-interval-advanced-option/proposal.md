## Why

The operation heartbeat interval is hard-coded at 30 seconds in internal client-service config. Operators cannot tune how often STATUS and EVENT_SUMMARY lines appear during long account-list runs, and the 30-second default is slower than needed for operational visibility. Exposing heartbeat interval in Advanced Connection Settings with a 10-second default gives operators faster situational awareness while keeping log volume configurable.

## What Changes

**Heartbeat interval configuration**
- From: Internal constant `statsLoggingIntervalMs = 30000` with no UI setting
- To: Advanced Connection Settings field `heartbeatInterval` (seconds), default 10, converted to `statsLoggingIntervalMs` at runtime
- Reason: User-configurable tuning aligned with existing advanced connection knobs like `processingWait`
- Impact: Non-breaking for existing deployments (new default applies on upgrade; operators who want 30s can set it explicitly)

**Default interval**
- From: 30 seconds
- To: 10 seconds
- Reason: Faster visibility during long aggregations
- Impact: More frequent STATUS/EVENT_SUMMARY lines at default; stall detection fires after ~20s (two ticks) instead of ~60s

## Capabilities

### New Capabilities

_(none — setting and behavior covered by existing capability specs)_

### Modified Capabilities

- `log-service`: Heartbeat interval sourced from advanced settings; default 10 seconds
- `account-list-operation`: Heartbeat uses configured `statsLoggingIntervalMs` from advanced settings (default 10s)
- `ubiquitous-language`: Glossary entry for **Heartbeat interval**; update **Operation heartbeat** default from 30s to 10s

## Impact

- `connector-spec.json` — new Advanced Connection Settings field and initial value
- `src/data/config/settings/advancedConnectionSettings.ts` — read/convert setting
- `src/data/config/internal/clientService.ts` — remove hard-coded interval from flat internal merge
- `src/data/config/defaults.ts` — wire initial value
- `src/model/config.ts` — document setting on `AdvancedConnectionSettingsSection` if needed
- `src/services/serviceRegistry.ts` — already reads `statsLoggingIntervalMs`; no logic change expected
- Spec deltas and tests for config reading, heartbeat timing, ubiquitous language
- `CHANGELOG.md`
