# Brainstorm: Heartbeat Interval Advanced Option

## Context

The operation heartbeat (`OperationHeartbeat`) emits periodic `STATUS` and `EVENT_SUMMARY` lines during long-running operations (currently `accountList`). The tick interval is driven by `statsLoggingIntervalMs`, a hard-coded internal constant of **30 seconds** in `src/data/config/internal/clientService.ts`. Operators cannot tune how often situational logs appear.

Advanced Connection Settings already exposes similar tuning knobs (`processingWait`, `maxConcurrentRequests`, etc.) with seconds-in-UI / milliseconds-in-runtime conversion via `advancedConnectionSettings.readSettings`.

## Decision Chain

**Q1: Should the heartbeat interval be user-configurable?**
- **Decision:** Yes — expose it in Advanced Connection Settings alongside `processingWait`.
- **Reason:** Operators debugging long aggregations or tuning log volume need control without code changes.

**Q2: What should the default interval be?**
- **Decision:** **10 seconds** (down from internal 30s).
- **Reason:** User request; faster visibility during long runs. More frequent than platform keep-alive (`processingWait`, default 60s) — STATUS remains informational, keep-alive stays separate.

**Q3: Setting key and units?**
- **Decision:** `heartbeatInterval` in connector-spec (seconds); runtime field `statsLoggingIntervalMs` on `FusionConfig` (milliseconds), populated from advanced settings.
- **Reason:** Matches `processingWait` pattern; avoids renaming every consumer of `statsLoggingIntervalMs`.

**Q4: Where does the default live?**
- **Decision:** `connectorSpecInitialValues.heartbeatInterval: 10` and `advancedConnectionSettings.runtimeDefaults.statsLoggingIntervalMs: 10_000`; remove the value from `internalConfigClientService.statsLoggingIntervalMs` flat merge (keep constant only as fallback in advanced settings module).
- **Reason:** Single source of truth in advanced settings; internal config no longer overrides user-facing defaults silently.

**Q5: Minimum allowed value?**
- **Decision:** Min **5 seconds** in connector-spec (same order of magnitude as queue processing interval).
- **Reason:** Prevents accidental log flooding; 5s is still responsive for debugging.

## Approaches Considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. Advanced Connection Settings field (chosen)** | Consistent with `processingWait`; discoverable in Advanced Settings menu | Slightly more spec/config surface |
| B. Developer Settings field | Groups with debug-oriented options | Heartbeat is operational visibility, not developer-only |
| C. Keep internal only, document env var | Zero UI work | No operator self-service; inconsistent with connector model |

## Agreed Design (Summary)

- Add **Heartbeat interval (seconds)** to Advanced Connection Settings in `connector-spec.json` (`heartbeatInterval`, default 10, min 5).
- Wire through `advancedConnectionSettings.readSettings` → `statsLoggingIntervalMs` on `FusionConfig`.
- Update specs: `log-service`, `account-list-operation`, `ubiquitous-language` (default 10s, new glossary term).
- Update tests for `advancedConnectionSettings`, heartbeat interval consumption, and stall-detection timing references.
- CHANGELOG entry noting default change from 30s to 10s and new advanced setting.

## Trade-offs

- **More log volume at default:** 3× more STATUS lines vs old 30s default → accepted; operators can raise interval if noisy.
- **Stall detection window shrinks:** Two-tick stall threshold becomes ~20s at default 10s vs ~60s at 30s → accepted; faster stall signal is desirable.

## Open Questions

- None blocking — user provided explicit scope (advanced option, 10s default).
