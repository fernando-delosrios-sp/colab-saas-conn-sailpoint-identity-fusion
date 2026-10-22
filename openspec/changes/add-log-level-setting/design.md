## Context

`LogService` (`src/services/logService/logService.ts`) is the connector's single logging facade over the SailPoint SDK's pino `logger`. Every `debug/info/warn/error` call currently:

1. updates the aggregation issue summary (`trackIssue`) for warn/error,
2. decides whether caller origin is needed,
3. formats the message (`formatMessage`),
4. calls `this.logger[level](output)` — pino then drops lines below `logger.level`,
5. optionally delivers to the external route (`http`/`disk`).

The effective level is `config.logLevel ?? ('debug' if spConnDebugLoggingEnabled else 'info')`. `logLevel` is declared on `LogConfig` but is never populated from the UI — the platform only offers the boolean `spConnDebugLoggingEnabled` (pino level info or debug). So there is no way to select Error/Warn/Info, and below-level calls are still built (including stack-trace capture via `getCallerInfo`) before pino discards them.

Advanced Settings is a single connector-spec menu whose sections are `Developer Settings`, `External Settings`, and `Advanced Connection Settings`. Settings modules live in `src/data/config/settings/` and are composed in `readConfig.ts` and `defaults.ts`; `connector-spec.json` carries the form definition and `sourceConfigInitialValues`, kept in sync by `scripts/sync-connector-spec-initial-values.cjs`. Section inline help is injected/validated by `scripts/connector-spec-help-lib.cjs` and `scripts/check-connector-spec-help.cjs` (part of `npm run lint`).

## Goals / Non-Goals

**Goals:**
- Expose a **Log level** radio (Error / Warn / Info / Debug, default Info) in a new **Log Settings** section under Advanced Settings.
- Gate host log emission in `LogService` before message construction and caller-origin capture.
- Preserve the platform `spConnDebugLoggingEnabled` escape hatch.
- Keep aggregation issue-summary counts accurate regardless of the selected level.
- Preserve existing external log delivery semantics.

**Non-Goals:**
- Changing external logging routing (`http`/`disk`/`noop`) or the meaning of `externalLoggingLevel`.
- Changing which line kinds exist or their content at a given level.
- Adding per-operation or per-module level overrides.
- Renaming or removing `spConnDebugLoggingEnabled`.

## Decisions

### D1: New section `Log Settings` with radio `logLevel`
- **Choice**: Add a section `Log Settings` to the Advanced Settings menu in `connector-spec.json` with one field, `logLevel` (`type: radio`, options Error=`error`, Warn=`warn`, Info=`info`, Debug=`debug`). Add `logSettings.ts` exporting `connectorSpecInitialValues = { logLevel: 'info' }`, `runtimeDefaults`, and `readSettings`; compose it in `defaults.ts` and the `readConfig.ts` pipeline; add `LogSettingsSection` to `AdvancedSettingsMenu` in `model/config.ts`.
- **Reason**: Mirrors the existing setting-module pattern and the `externalLoggingLevel` radio; a section keeps the change additive and independently documented.
- **Considered alternatives**: (a) add `logLevel` to External Settings — rejected, it conflates host verbosity with external delivery; (b) make it a connector-spec menu — rejected, it is a single concern, not a menu; (c) reuse `spConnDebugLoggingEnabled` — rejected, platform-owned and boolean.

### D2: Gate inside `LogService`, before construction
- **Choice**: Introduce one internal emit path used by `log()`, `assert()`, and `crash()`. It computes `belowHost = LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[configuredLevel]` and `toExternal = shouldSendExternal(level)`. When `belowHost && !toExternal`, it returns before `formatMessage`/`getCallerInfo`. The host `logger[level]` call happens only when `!belowHost`; external delivery happens only when `toExternal`.
- **Reason**: A single choke point fixes all call paths; skipping before formatting/stack capture is the whole point of the change.
- **Considered alternatives**: (a) rely on pino `logger.level` — rejected, it filters too late; (b) filter at call sites — rejected, error-prone and scattered.

### D3: Precedence — platform debug toggle wins
- **Choice**: `configuredLevel = spConnDebugLoggingEnabled ? 'debug' : (logLevel ?? 'info')`. Sync both `configuredLevel` and the SDK `logger.level` in the constructor and `setLogLevel`.
- **Reason**: `LogSettings.logLevel` is now always defined (default `info`), so an explicit-set-first rule would permanently disable the platform toggle. Debug-first keeps the escape hatch and is backward compatible.
- **Considered alternatives**: (a) setting wins — rejected, breaks the toggle; (b) most-verbose-of-the-two — equivalent outcome but harder to describe; chosen rule is simpler.

### D4: Issue summary is level-independent
- **Choice**: `trackIssue` (warn/error counts and samples) runs before the gate and is unaffected by the selected level.
- **Reason**: These counts feed dry-run/report output; lowering host verbosity must not zero warning counts in reports.
- **Considered alternatives**: gate `trackIssue` with everything else — rejected, silently corrupts report fidelity.

### D5: External delivery gated by its own level
- **Choice**: `externalLoggingLevel` continues to filter external delivery. The new early return fires only when neither the host level nor the external level admits the message.
- **Reason**: Operators may want a quiet ISC console and a verbose external sink; the master setting must not regress that.
- **Considered alternatives**: (a) Log level unconditionally suppresses external messages — rejected, a behavior regression for existing external-debug setups; (b) merge the two settings — rejected, they answer different questions.

### D6: Validation and fallback
- **Choice**: `readSettings` accepts only `error|warn|info|debug`; any other stored value falls back to `info` (no throw). The stored key is `logLevel`.
- **Reason**: Mirrors `externalSettings` tolerance for stored values while keeping the runtime safe.
- **Considered alternatives**: throw on invalid value — rejected, a bad stored value should not break aggregation.

## Risks / Trade-offs

- [Risk] A stored `logLevel` below existing expectations (e.g. `error`) hides routine INFO lines operators relied on → Mitigation: default is `info`, docs label the levels, and the platform debug toggle still forces `debug`.
- [Risk] New connector-spec section without a matching `SECTION_HELP` entry fails `npm run lint` → Mitigation: add the `Log Settings` entry to `scripts/connector-spec-help-lib.cjs` and regenerate/verify with the help check.
- [Trade-off] `assert`/`crash` emission now honor the gate → Reason: consistency; `crash` is always `error`, which no valid level exceeds, so crash visibility is preserved.
- [Trade-off] Message construction may still occur when the external sink wants a below-host-level message → Reason: preserves external delivery (D5) at the cost of some building; acceptable and rare.

## Migration Plan

N/A — no deployment or data migration. Existing configs without `logLevel` read as `info` (today's default), and `spConnDebugLoggingEnabled` continues to work. Rollback is reverting the code and connector-spec change; no persisted state.

## Open Questions

- None open. Deferred in discovery and resolved here: no `parentKey` conditional on the section (always visible), and the radio option label uses "Warn" to match the existing External logging level radio (prose may say "Warning").
