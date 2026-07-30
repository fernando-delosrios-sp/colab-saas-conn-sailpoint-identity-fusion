## 1. Config model and connector-spec

- [x] 1.1 Add `ExternalSettingsSection` to `src/model/config.ts`; remove external logging from `DeveloperSettingsSection` and remove `ProxySettingsSection`
- [x] 1.2 Replace Proxy Settings and Developer external-logging fields in `connector-spec.json` with External Settings section (gateway, target URL/password, sub-options with parentKey chains)
- [x] 1.3 Update `connector-spec.json` initial values and remove old keys (`proxyEnabled`, `proxyUrl`, `proxyPassword`, `externalLoggingUrl`)

## 2. External settings config reader

- [x] 2.1 Create `src/data/config/settings/externalSettings.ts` with validation (gateway, proxy URL/password, recording requires proxy + name, logging URL when proxy off)
- [x] 2.2 Delete `src/data/config/settings/proxySettings.ts`; wire `externalSettings.readSettings` in `readConfig.ts` pipeline
- [x] 2.3 Remove external logging from `src/data/config/settings/developerSettings.ts`
- [x] 2.4 Add recording bridge in `readConfig.ts`: External Settings recording name → `config.recording` before/after `resolveRecordingConfig`
- [x] 2.5 Add `src/data/config/settings/__tests__/externalSettings.test.ts` covering validation gates and gateway-off inactivity

## 3. ProxyService updates

- [x] 3.1 Update `src/services/proxyService.ts` to read `externalProcessingEnabled`, `externalProxyEnabled`, `externalTargetUrl`, `externalTargetPassword`
- [x] 3.2 Update `src/services/__tests__/proxyService.test.ts` for new field names and gateway-off scenario

## 4. LogService dual sink

- [x] 4.1 Create `src/services/logService/fileLogSink.ts` (sanitize + append; path from `LOG_FILE` or `logs/fusion-{YYYYMMDD}.log`)
- [x] 4.2 Implement role-aware routing in `logService.ts`: proxy client noop, direct HTTP POST to `externalTargetUrl`, proxy server file sink
- [x] 4.3 Pass proxy role flags into `LogService` from `serviceRegistry.ts` (or derive from config + env)
- [x] 4.4 Add LogService routing tests (direct HTTP, proxy client noop, proxy server disk, gateway off)
- [x] 4.5 Update `flushPendingExternalLogs()` to await file writes

## 5. Recording bridge verification

- [x] 5.1 Update `src/data/config/__tests__/readConfig.test.ts` for ISC recording name → record mode
- [x] 5.2 Update `src/services/__tests__/serviceRegistry.recording.test.ts` if config shape changes affect wiring

## 6. Defaults and cleanup

- [x] 6.1 Update `src/data/config/defaults.ts` and any remaining references to old keys across `src/`
- [x] 6.2 Remove or replace `src/data/config/settings/__tests__/proxySettings.test.ts` and developerSettings external-logging tests

## 7. Documentation

- [x] 7.1 Run `npm run docs:prepare` to regenerate Configuration reference for External Settings
- [x] 7.2 Update `docs/reference/proxy-mode.md` for External Settings configuration and disk logging on proxy server
- [x] 7.3 Update `docs/use-guides/operation/connection-and-observability-tuning.md` (External Settings replaces Developer logging + Proxy Settings)
- [x] 7.4 Update `docs/reference/chain-recording.md` to document ISC recording name field

## 8. Changelog

- [x] 8.1 Create or update the project changelog entry for External Settings unification
- [x] 8.2 Confirm the entry covers breaking config key changes, logging routing split, and ISC recording name
