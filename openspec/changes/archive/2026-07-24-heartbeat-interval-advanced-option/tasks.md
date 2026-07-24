## 1. Connector spec and config model

- [x] 1.1 Add `heartbeatInterval` field to Advanced Connection Settings in `connector-spec.json` (label, help, type number, min 5, default initial value 10)
- [x] 1.2 Add `heartbeatInterval: 10` to `sourceConfigInitialValues` in `connector-spec.json`
- [x] 1.3 Add `heartbeatInterval` to `connectorSpecInitialValues` and `runtimeDefaults.statsLoggingIntervalMs: 10_000` in `advancedConnectionSettings.ts`
- [x] 1.4 Implement `readSettings` conversion: seconds → `statsLoggingIntervalMs` (mirror `processingWait` pattern)
- [x] 1.5 Wire `heartbeatInterval` into `defaults.ts` `connectorSpecInitialValues`
- [x] 1.6 Remove `statsLoggingIntervalMs` from `getInternalConfigFlat()` / `internalConfigClientService` flat merge (keep fallback only in advanced settings)
- [x] 1.7 Document `heartbeatInterval` on `AdvancedConnectionSettingsSection` in `src/model/config.ts` if applicable

## 2. Tests

- [x] 2.1 Extend `advancedConnectionSettings.test.ts` — default 10s, custom value conversion, omitted field fallback
- [x] 2.2 Update `operationHeartbeat.test.ts` / `clientService.test.ts` if they hard-code 30s or 60s interval assumptions
- [x] 2.3 Run `npm test` for affected config and log-service test files

## 3. Documentation

- [x] 3.1 Add CHANGELOG entry: new advanced setting, default changed from 30s to 10s
- [x] 3.2 Update ubiquitous-language glossary table entry for **Operation heartbeat** (default 10s) and add **Heartbeat interval** row when implementing spec archive

