## 1. Log Settings config module (TDD)

- [x] 1.1 Add `src/data/config/settings/logSettings.ts` with `connectorSpecInitialValues = { logLevel: 'info' }`, `runtimeDefaults`, and `readSettings(raw)` returning `{ logLevel }`; accept only `error|warn|info|debug`, otherwise fall back to `info` (no throw). (design D1, D6)
- [x] 1.2 Add `LogSettingsSection { logLevel?: 'error' | 'warn' | 'info' | 'debug' }` to `src/model/config.ts` and include it in `AdvancedSettingsMenu`. (design D1)
- [x] 1.3 Compose the new module: add `logSettings.connectorSpecInitialValues` and `logSettings.runtimeDefaults` to `src/data/config/defaults.ts`, and add `logSettings.readSettings` to the `settingsPipeline` in `src/data/config/readConfig.ts`. (design D1)
- [x] 1.4 Add `src/data/config/settings/__tests__/logSettings.test.ts` covering: omitted → `info`; `warn` → `warn`; `verbose` → `info` without throwing. (spec: default/custom/invalid scenarios)
- [x] 1.5 Extend `src/data/config/__tests__/readConfig.test.ts` to assert `safeReadConfig()` surfaces the effective `logLevel` and defaults to `info`.

**Verify:** `npx vitest run src/data/config/settings/__tests__/logSettings.test.ts src/data/config/__tests__/readConfig.test.ts` exit 0.

## 2. connector-spec UI surface and inline help

- [x] 2.1 Add a `Log Settings` section to the Advanced Settings menu in `connector-spec.json` with a `logLevel` radio (`Error`=`error`, `Warn`=`warn`, `Info`=`info`, `Debug`=`debug`), a plain-text `helpKey`, and a `sectionHelpMessage` + `docLink`/`docLinkLabel` pointed at the advanced configuration reference. (design D1)
- [x] 2.2 Add the `Log Settings` entry to `SECTION_HELP` in `scripts/connector-spec-help-lib.cjs` so the section carries valid help and `npm run lint` passes. (design D1, Risks)
- [x] 2.3 Run `node scripts/sync-connector-spec-initial-values.cjs` and confirm `sourceConfigInitialValues.logLevel` is written to `connector-spec.json`. (design D1)
- [x] 2.4 Confirm the setting renders with default Info and that `node scripts/check-connector-spec-help.cjs` reports OK. (spec: connector-spec presence scenario)

## 3. LogService host-level gate (TDD)

- [x] 3.1 Route `log()`, `assert()`, and `crash()` through one internal emit path in `src/services/logService/logService.ts` that computes `belowHost = LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[configuredLevel]` and `toExternal = shouldSendExternal(level)`. (design D2)
- [x] 3.2 Return before `formatMessage` and `getCallerInfo` when `belowHost && !toExternal`; call the host `logger[level]` only when `!belowHost`; deliver externally only when `toExternal`. (design D2, D5; specs: gated emission, external interaction)
- [x] 3.3 Apply precedence `spConnDebugLoggingEnabled ? 'debug' : (logLevel ?? 'info')` in the constructor, and keep `configuredLevel` and the SDK `logger.level` in sync in the constructor and `setLogLevel`. (design D3)
- [x] 3.4 Keep `trackIssue` running for warn/error before the gate so aggregation issue counts/samples are unaffected by the selected level. (design D4)
- [x] 3.5 Add tests in `src/services/logService/__tests__/logService.test.ts` (mock SDK logger) covering: below-level debug/info not emitted; at-or-above emitted; `assert(warn)` gated; `crash` still emits error and throws; warn/error tracked while below host level; debug-toggle override; selected level when toggle off. (specs: gated emission, precedence, issue summary)
- [x] 3.6 Add tests in `src/services/logService/__tests__/externalLoggingRouting.test.ts` covering: below-host-level message delivered externally when external level admits it; below-level message skipped entirely when external logging is inactive. (spec: external interaction)

**Verify:** `npx vitest run src/services/logService/__tests__/logService.test.ts src/services/logService/__tests__/externalLoggingRouting.test.ts` exit 0.

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (full suite before PR; targeted `npx vitest run <file>` during development).
- [x] 4.2 All delta spec scenarios covered by named automated tests (default/custom/invalid level, connector-spec presence, gated emission, assertion path, crash, debug-toggle precedence, issue-summary independence, external-sink interaction).
- [x] 4.3 `npm run lint` (ESLint + connector-spec help check + knip).

## 5. Documentation

- [x] 5.1 Update `docs/reference/observability.md` "Log levels" to document the **Log level** setting (Error/Warn/Info/Debug, default Info) as the host-stream gate, and clarify it is distinct from **External logging level**.
- [x] 5.2 Update `docs/use-guides/operation/monitor-aggregation-progress.md` "Log levels" table and the external-logging step to reference **Advanced Settings → Log Settings → Log level**.
- [x] 5.3 Mirror the new terms in `docs/glossary.md` (**Log Settings**, **Log level**) and keep them aligned with `openspec/specs/ubiquitous-language/spec.md`.
- [x] 5.4 Regenerate `docs/configuration/advanced.md` via `npm run docs:prepare` and confirm the `Log Settings` section appears.
- [x] 5.5 Add JSDoc to the new `logSettings` module and the `LogSettingsSection` field explaining level ordering and default.
- [x] 5.6 Skip README / getting-started — no install, package, or first-run behavior change.

## 6. Changelog

- [x] 6.1 During apply, invoke **changelog-generator** and merge the entry into today's `CHANGELOG.md` section (no Unreleased heading).
- [x] 6.2 Confirm the entry covers the user-visible **Log Settings → Log level** addition, the Info default, and the skip-below-level behavior; note the platform debug toggle still forces Debug.
