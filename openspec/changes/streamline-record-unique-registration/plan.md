# Streamline Record Unique Registration — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Bulk-register unique attribute values for thousands of match-disabled record accounts before the uncorrelated match sweep, using selective map targets only.

**Architecture:** Precompute `UniqueRegistrationPlan` at service init. New `FusionService.processRecordUniqueRegistration()` runs after correlated sweep, applies minimal FusionAccount hydration + selective `mapAttributes` + `registerUniqueAttributes`, then removes accounts from the work queue. Decision processor reuses the same helper.

**Tech Stack:** TypeScript, Vitest, existing MappingService / DefinitionService / FusionService / accountListPhases

**Specs:** `openspec/changes/streamline-record-unique-registration/specs/`

---

## Task 1: UniqueRegistrationPlan

- [x] **Step 1:** Create `src/services/definitionService/uniqueRegistrationPlan.ts` with `buildUniqueRegistrationPlan(config)` returning `{ uniqueNames, mapTargets, passthroughNames }`
- [x] **Step 2:** Wire plan into `DefinitionService` constructor as readonly field `registrationPlan`
- [x] **Step 3:** Write `uniqueRegistrationPlan.test.ts` — fixture with 2 unique defs, 1 map coincidence, assert sets
- [x] **Step 4:** Run `npm test -- uniqueRegistrationPlan`

---

## Task 2: Selective mapAttributes

- [x] **Step 1:** Extend `MappingService.mapAttributes(fusionAccount, run, options?: { onlyTargets?: ReadonlySet<string> })` — when set, skip attributes not in set (except internal mainAccount/history handling when those names are in set)
- [x] **Step 2:** Add test: full map writes 3 attrs; selective with one target writes only that attr
- [x] **Step 3:** Run `npm test -- mapService`

---

## Task 3: Record registration method

- [x] **Step 1:** Add `DefinitionService.registerUniqueValuesFromRecordManagedAccount(account, mappingService, run)`:
  ```typescript
  const fa = FusionAccount.fromManagedAccount(account)
  mappingService.mapAttributes(fa, run, { onlyTargets: this.registrationPlan.mapTargets })
  await this.registerUniqueAttributes(fa)
  ```
- [x] **Step 2:** Add batch variant iterating accounts with `yieldToEventLoop` every N accounts
- [x] **Step 3:** Tests for mapped value, passthrough value, missing value skip
- [x] **Step 4:** Run `npm test -- defineService` (or new test file name)

---

## Task 4: FusionService bulk phase

- [x] **Step 1:** Add helper `isRecordUniqueRegistrationOnly(sourceName)` using existing `isRecordMatchingEnabledForSource` inverted + SourceType.Record
- [x] **Step 2:** Implement `processRecordUniqueRegistration()`:
  - Collect eligible accounts from `managedAccountsById`
  - Batch register via DefinitionService batch helper
  - Delete each from map / claim as non-match does today
  - Return `{ registered: number }`
- [x] **Step 3:** In `accountListPhases.ts` `processPhase`, insert between correlated sweep and uncorrelated sweep with `log.stepStart` / `track` / `stepEnd`
- [x] **Step 4:** Update `applyNonAuthoritativeNoMatch` or extract shared call for decision path
- [x] **Step 5:** Update fusion + dispatcher tests — pre-pass removes accounts; `scoreFusionAccount` not called
- [x] **Step 6:** Run `npm test -- fusionService matchOutcomeDispatcher`

---

## Task 5: Logging

- [x] **Step 1:** During bulk pass call `log.setProgress(done, total, 'registered')`
- [x] **Step 2:** Add EVENT_SUMMARY counter if `OperationRunContext` extended (optional per design)
- [x] **Step 3:** Update `operationHeartbeat.test.ts` if new event key added

---

## Task 6: Docs and lint

- [x] **Step 1:** Update `docs/guides/source-configuration.md` record-only bullet
- [x] **Step 2:** Run `npm run lint`
- [x] **Step 3:** Run full `npm test` before PR

---

## Commit points

1. After Task 1–2: `feat: add UniqueRegistrationPlan and selective mapping`
2. After Task 3–4: `feat: bulk record unique registration pre-pass`
3. After Task 5–6: `docs: clarify record-only registration path`
