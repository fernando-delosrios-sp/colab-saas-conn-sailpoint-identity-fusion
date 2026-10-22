## Scope

Add an **Advanced Settings → Log Settings** section with a **Log level** radio (Error / Warn / Info / Debug, default **Info**) that sets the connector's master log level, and make `LogService` skip building and emitting any message below that level. Out of scope: changing external log delivery routing, recording, or the platform `spConnDebugLoggingEnabled` toggle.

## Language

**Log Settings** (`promote`):
The Advanced Settings section that exposes the connector's master log level. Sections in Advanced Settings group one concern per section; Log Settings owns host-log verbosity only.
_Avoid_: "Developer Settings", "debug logging settings", "logging options".

**Log level** (`promote`):
The minimum severity the connector writes to the ISC host log, ordered `debug < info < warn < error`, selected in Log Settings (`logLevel`). Messages below it are discarded before construction. Default **Info**.
_Avoid_: "log severity", "verbosity", "log threshold", "debug level".

**External logging level** (`draft`, canonical exists):
Separate minimum severity for external delivery (`externalLoggingLevel`). Not renamed; interacts with Log level (see Decisions D5).
_Avoid_: conflating it with **Log level**.

**Master log level** (`draft`, synonym to avoid):
Descriptive only — do not introduce as a second config key. The canonical term is **Log level**.
_Avoid_: using "master" as a UI label or code identifier.

Canonical conflict check (`openspec/specs/ubiquitous-language/spec.md`): no existing **Log level** / **Log Settings** entries. The existing **Advanced Connection Settings** definition mentions "external logging configuration" but no conflict arises — Advanced Connection Settings is a sibling section, not the new home.

## Decisions

- **D1 — Placement and shape.** New section **Log Settings** under Advanced Settings, field `logLevel` of type `radio` with options Error/Warn/Info/Debug and default `info`. A grouping section (not a new connector-spec menu). Rejected: reusing the existing External Settings logging level (it governs external delivery only) and reusing the platform `spConnDebugLoggingEnabled` toggle (platform-owned, boolean, not a level).
- **D2 — Where the gate lives.** Enforce the level inside `LogService` (single choke point). `log()`, `assert()`, and `crash()` route through one internal emit path that returns before `formatMessage`, `getCallerInfo`, and the host `logger[level]` call when the message is below the configured level. Rejected: relying on the SDK pino `logger.level` (it filters after the message and stack trace are already built) and filtering at call sites (scattered).
- **D3 — Precedence with the platform debug toggle.** `spConnDebugLoggingEnabled === true` forces `debug`; otherwise the Log Settings value applies (default `info`). This preserves the existing platform escape hatch. Rejected: "Log Settings wins" (would break the platform toggle, since the new default is always defined) and "most verbose wins" (equivalent in practice but harder to explain).
- **D4 — Aggregation issue summary stays independent.** `trackIssue` for warn/error still records counts/samples for reports regardless of the gate, so lowering Log level does not silently zero warning counts in dry-run/report output. Rejected: gating `trackIssue` too (would corrupt report fidelity).
- **D5 — Interaction with external logging.** Host emission is gated by **Log level**. External delivery stays gated by **External logging level**. Message construction is skipped only when *neither* active sink wants the message (below Log level *and* not admitted by external logging). Rejected: making Log level unconditionally suppress external messages (would regress existing external-debug setups).
- **D6 — Legacy `logLevel` config key.** The old optional `LogConfig.logLevel` field (never wired to the UI) is repurposed as the read value of the new setting; constructor precedence becomes debug-flag-first then this value then `info`.

## Open questions

- None blocking. Deferred to design: whether the new section needs a `parentKey` conditional (decision: no — it is always visible), and whether the radio should label "Warning" or "Warn" (decision: mirror the existing External logging level option label "Warn" for consistency, while the user-facing description says Warning).

## Scenarios discussed

- Default: no `logLevel` stored → effective level `info`; `debug()` is not emitted, `info()`/`warn()`/`error()` are.
- `logLevel: 'error'` → `info`, `warn`, `debug` calls build nothing and reach neither the host logger nor external; `error` still emits.
- `logLevel: 'debug'` → every level emits to the host.
- Platform debug toggle on + `logLevel: 'error'` → `debug` wins (D3).
- `logLevel: 'error'` with external logging level `debug` and external route active → debug/info/warn still reach the external sink (D5).
- `logLevel: 'error'` → warn/error aggregation issue counts still tracked for reports (D4).
- Invalid stored value (e.g. `verbose`) → falls back to `info`, no crash.
- `setLogLevel()` at runtime updates both the gate and the SDK `logger.level`.
- Non-accountList operations and bootstrap logging honor the same level.
