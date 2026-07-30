# External Settings Unification Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Unify proxy mode, external logging, and recording under Advanced Settings → External Settings with role-aware logging and ISC recording name support.

**Architecture:** New `externalSettings.ts` config reader validates gateway + sub-options and bridges recording name to `RecordingConfig`. `ProxyService` and `LogService` read new field names directly (no legacy aliases). `LogService` routes external logs by role: HTTP POST (ISC direct), file append (proxy server), noop (proxy client).

**Tech Stack:** TypeScript, Vitest, connector-spec.json, existing ProxyService / LogService / RecordingService

**References:** `openspec/changes/external-settings-unification/design.md`, `specs/proxy-service/spec.md`, `specs/log-service/spec.md`, `specs/recording-service/spec.md`, `specs/documentation-site/spec.md`

---

## Task 1: Config model and connector-spec (TDD prep)

- [ ] **Step 1:** Add `ExternalSettingsSection` to `src/model/config.ts`; update `AdvancedSettingsMenu` to extend it instead of `ProxySettingsSection`; remove logging fields from `DeveloperSettingsSection`
- [ ] **Step 2:** Edit `connector-spec.json` — add External Settings section with parentKey chains; remove Proxy Settings section and Developer external-logging fields; update initial values
- [ ] **Step 3:** Grep for `proxyEnabled`, `proxyUrl`, `proxyPassword`, `externalLoggingUrl` to inventory remaining references

## Task 2: External settings reader

- [ ] **Step 1:** Create failing tests in `src/data/config/settings/__tests__/externalSettings.test.ts` (validation, gateway off, recording requires proxy)
- [ ] **Step 2:** Implement `src/data/config/settings/externalSettings.ts`
- [ ] **Step 3:** Delete `proxySettings.ts`; update `readConfig.ts` pipeline; strip logging from `developerSettings.ts`
- [ ] **Step 4:** Add recording bridge in `readConfig.ts` after env resolution
- [ ] **Step 5:** Run `npm test -- src/data/config/settings/__tests__/externalSettings.test.ts`

## Task 3: ProxyService

- [ ] **Step 1:** Update `proxyService.test.ts` to use new config keys; add gateway-off test
- [ ] **Step 2:** Update `proxyService.ts` — `isProxyMode()` checks `externalProcessingEnabled && externalProxyEnabled && externalTargetUrl`
- [ ] **Step 3:** Update `performFetch()` to use `externalTargetUrl` and forward `externalTargetPassword`
- [ ] **Step 4:** Run `npm test -- src/services/__tests__/proxyService.test.ts`

## Task 4: LogService file sink and routing

- [ ] **Step 1:** Create `fileLogSink.ts` with sanitize (from `log-server.js`) and append helpers
- [ ] **Step 2:** Add failing LogService routing tests (mock fetch + fs)
- [ ] **Step 3:** Implement role detection and route in `sendToExternalService()` / `shouldSendExternal()`
- [ ] **Step 4:** Wire role flags in `serviceRegistry.ts` constructor
- [ ] **Step 5:** Run LogService tests; verify `flushPendingExternalLogs()` awaits disk writes

## Task 5: Integration tests and cleanup

- [ ] **Step 1:** Update `readConfig.test.ts` for recording bridge scenarios
- [ ] **Step 2:** Grep-replace remaining old key references in `src/` and tests
- [ ] **Step 3:** Run `npm test` and `npm run lint`

## Task 6: Documentation and changelog

- [ ] **Step 1:** Run `npm run docs:prepare`
- [ ] **Step 2:** Update proxy-mode, observability tuning, and chain-recording docs
- [ ] **Step 3:** Update CHANGELOG with breaking config key note

---

## Verification checklist

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Gateway off → no proxy, no external logging, no recording
- [ ] Gateway + logging only → HTTP POST from ISC to target URL
- [ ] Gateway + proxy + logging → server writes to `LOG_FILE` or default path; ISC client does not external-log
- [ ] Gateway + proxy + recording + name → server record mode with named chain
