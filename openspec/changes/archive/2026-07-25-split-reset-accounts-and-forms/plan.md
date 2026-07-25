# Split Reset Accounts and Forms — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Split the coupled Developer Settings reset into independent `resetAccounts` and `resetForms` toggles (both default `false`, both auto-disable after one persistent run).

**Architecture:** Config layer parses two flags with legacy `reset` fallback. FusionService exposes accessors and disable methods that patch ISC source config. Setup phase in `accountListPhases.ts` evaluates flags independently — forms reset deletes via FormService and continues; account reset clears state and exits early.

**Tech Stack:** TypeScript, Vitest, connector-spec.json, SailPoint connector SDK

**Reference:** `design.md`, `specs/account-list-operation/spec.md`, `specs/fusion-service/spec.md`

---

## Task 1: Configuration layer

- [ ] **Step 1:** Edit `connector-spec.json` — change key `reset` to `resetAccounts`, add `resetForms` toggle after it with helpKey describing independent behavior and auto-disable
- [ ] **Step 2:** Update `src/model/config.ts` — replace `reset: boolean` with `resetAccounts: boolean` and `resetForms: boolean` on `DeveloperSettingsSection`
- [ ] **Step 3:** Update `src/data/config/settings/developerSettings.ts`:
  ```typescript
  resetAccounts: extractBoolean(raw, 'resetAccounts') ?? extractBoolean(raw, 'reset') ?? false,
  resetForms: extractBoolean(raw, 'resetForms') ?? false,
  ```
- [ ] **Step 4:** Update `developerSettings.test.ts` — test defaults, legacy fallback, prefer `resetAccounts` over `reset`
- [ ] **Step 5:** Run `npm test -- src/data/config/settings/__tests__/developerSettings.test.ts`

## Task 2: FusionService API

- [ ] **Step 1:** In `fusionService.ts`, replace `private readonly reset` with `resetAccounts` and `resetForms` fields loaded from config
- [ ] **Step 2:** Add `isResetAccounts()`, `isResetForms()`, `disableResetAccounts()` (patches `resetAccounts` + legacy `reset`), `disableResetForms()` (patches `resetForms`); remove old `isReset()` / `disableReset()`
- [ ] **Step 3:** Update `fusionService.test.ts` initialization assertions
- [ ] **Step 4:** Update `operationTestRegistry.ts` mocks: `isResetAccounts`, `isResetForms`, `disableResetAccounts`, `disableResetForms`
- [ ] **Step 5:** Run `npm test -- src/services/fusionService/__tests__/fusionService.test.ts`

## Task 3: Setup phase branching

- [ ] **Step 1:** Replace `applyFusionReset` in `accountListPhases.ts`:
  ```typescript
  async function applyFusionFormsReset(sr) {
      await sr.forms.deleteExistingForms()
      await sr.fusion.disableResetForms()
  }
  async function applyFusionAccountReset(sr) {
      await sr.fusion.disableResetAccounts()
      await sr.fusion.resetState()
      await sr.sources.resetBatchCumulativeCount()
  }
  ```
- [ ] **Step 2:** In `setupPhase`, before account-reset check:
  ```typescript
  if (isPersistent && fusion.isResetForms()) {
      log.info('Reset forms flag detected, deleting fusion review forms')
      await applyFusionFormsReset(serviceRegistry)
  }
  if (fusion.isResetAccounts()) {
      log.info('Reset accounts flag detected, clearing state and exiting')
      if (isPersistent) await applyFusionAccountReset(serviceRegistry)
      return false
  }
  ```
- [ ] **Step 3:** Add `src/operations/helpers/__tests__/accountListReset.test.ts` with mocked ServiceRegistry covering: accounts-only, forms-only, both, neither, dry-run
- [ ] **Step 4:** Run new tests

## Task 4: Fixture sweep

- [ ] **Step 1:** Grep for `reset: false` / `reset: true` in test configs; replace with `resetAccounts` / `resetForms`
- [ ] **Step 2:** Update `ChainRunner.ts` scenario config type
- [ ] **Step 3:** Run full `npm test`

## Task 5: Documentation

- [ ] **Step 1:** Update `docs/guides/advanced-connection-settings.md` — document both toggles, run matrix, workflow
- [ ] **Step 2:** Update `docs/operations/account-list.md` Setup step (line ~30)
- [ ] **Step 3:** Update README Advanced Settings table
- [ ] **Step 4:** Run `npm run lint:markdown` if available

## Task 6: Final verification

- [ ] **Step 1:** Run `npm test`
- [ ] **Step 2:** Run `npm run lint`
- [ ] **Step 3:** Manual smoke: verify connector-spec sync via `npm run build`
