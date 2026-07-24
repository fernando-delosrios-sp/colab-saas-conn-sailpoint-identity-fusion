# Heartbeat Interval Advanced Option Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Expose operation heartbeat interval as an Advanced Connection Settings field (`heartbeatInterval`, default 10 seconds) and wire it to `statsLoggingIntervalMs` for `OperationHeartbeat`.

**Architecture:** Follow the existing `processingWait` pattern — seconds in `connector-spec.json`, conversion in `advancedConnectionSettings.readSettings`, runtime value on `FusionConfig.statsLoggingIntervalMs`. Remove the hard-coded 30s value from internal flat config merge so advanced settings owns the default.

**Tech Stack:** TypeScript, Vitest, `connector-spec.json`, `@sailpoint/connector-sdk` config pipeline.

**Spec refs:** `openspec/changes/heartbeat-interval-advanced-option/specs/{log-service,account-list-operation,ubiquitous-language}/spec.md`

---

## Task 1: connector-spec.json and defaults

**Files:** `connector-spec.json`, `src/data/config/defaults.ts`

- [ ] **Step 1:** Add `"heartbeatInterval": 10` to `sourceConfigInitialValues`
- [ ] **Step 2:** Add UI item after `processingWait` in Advanced Connection Settings:
  - key: `heartbeatInterval`
  - label: `Heartbeat interval (seconds)`
  - type: `number`, required: false, min: `5`
  - helpKey describing STATUS/EVENT_SUMMARY tick rate and default 10s
- [ ] **Step 3:** Add `heartbeatInterval` to `connectorSpecInitialValues` export in `defaults.ts`
- [ ] **Step 4:** Run `npm run build` to sync spec if required by project scripts

---

## Task 2: advancedConnectionSettings module

**Files:** `src/data/config/settings/advancedConnectionSettings.ts`, `src/model/config.ts`

- [ ] **Step 1:** Add `heartbeatInterval: 10` to `connectorSpecInitialValues`
- [ ] **Step 2:** Add `statsLoggingIntervalMs: 10_000` to `runtimeDefaults`
- [ ] **Step 3:** In `readSettings`, compute:
  ```typescript
  statsLoggingIntervalMs:
      raw.heartbeatInterval !== undefined
          ? (raw.heartbeatInterval as number) * 1000
          : runtimeDefaults.statsLoggingIntervalMs
  ```
- [ ] **Step 4:** Extend return type / merge so `statsLoggingIntervalMs` lands on `FusionConfig` (via settings fragment)
- [ ] **Step 5:** Add JSDoc on `AdvancedConnectionSettingsSection` for `heartbeatInterval` (seconds, UI) documenting runtime ms field
- [ ] **Step 6:** Write tests in `advancedConnectionSettings.test.ts` for default, custom, and conversion

---

## Task 3: Remove internal override

**Files:** `src/data/config/internal/clientService.ts`, `src/data/config/internal/index.ts`

- [ ] **Step 1:** Remove `statsLoggingIntervalMs` from `internalConfigClientService` (or stop exporting via `getInternalConfigFlat`)
- [ ] **Step 2:** Remove `statsLoggingIntervalMs` from `getInternalConfigFlat()` return type if no longer sourced internally
- [ ] **Step 3:** Confirm `FusionConfig.statsLoggingIntervalMs` is still satisfied via advanced settings merge in `safeReadConfig`
- [ ] **Step 4:** Grep for `statsLoggingIntervalMs: 30000` / `60000` in tests and update to 10_000 or configurable values

---

## Task 4: Verify heartbeat consumption (no logic change expected)

**Files:** `src/services/serviceRegistry.ts`, `src/services/logService/operationHeartbeat.ts`

- [ ] **Step 1:** Confirm `getHeartbeatSnapshot()` still passes `this.config.statsLoggingIntervalMs`
- [ ] **Step 2:** Run `npm test -- src/services/logService/__tests__/operationHeartbeat.test.ts`
- [ ] **Step 3:** Run `npm test -- src/operations/__tests__/accountList.test.ts` if interval-sensitive

---

## Task 5: Docs and changelog

**Files:** `CHANGELOG.md`, `openspec/specs/ubiquitous-language/spec.md` (during archive/apply)

- [ ] **Step 1:** CHANGELOG entry under Changed/Added: heartbeat interval advanced setting, default 10s (was internal 30s)
- [ ] **Step 2:** Run `npm run lint`
- [ ] **Step 3:** Run full `npm test` or targeted suite for config + log-service

---

## Commit points

- After Task 1–2: `feat(config): add heartbeatInterval advanced setting`
- After Task 3–4: `refactor(config): source statsLoggingIntervalMs from advanced settings`
- After Task 5: `docs: changelog for heartbeat interval setting`
