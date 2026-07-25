## 1. Configuration and connector spec

- [x] 1.1 Rename `reset` → `resetAccounts` in `connector-spec.json` and add `resetForms` toggle with updated helpKey text
- [x] 1.2 Update `DeveloperSettingsSection` in `src/model/config.ts` with `resetAccounts` and `resetForms`
- [x] 1.3 Update `developerSettings.ts` to parse both flags (default `false`), with legacy `reset` fallback for `resetAccounts`
- [x] 1.4 Extend `developerSettings.test.ts` for new defaults, legacy fallback, and `resetForms` parsing

## 2. FusionService reset API

- [x] 2.1 Replace `reset` field with `resetAccounts` and `resetForms` in `fusionService.ts`
- [x] 2.2 Add `isResetAccounts()`, `isResetForms()`, `disableResetAccounts()`, `disableResetForms()`; remove `isReset()` / `disableReset()`
- [x] 2.3 Update `fusionService.test.ts` and operation test harness mocks

## 3. Account-list Setup phase

- [x] 3.1 Split `applyFusionReset` into `applyFusionFormsReset` and `applyFusionAccountReset` in `accountListPhases.ts`
- [x] 3.2 Wire independent branches: forms reset continues; account reset exits early
- [x] 3.3 Add setup-phase tests covering all four flag combinations and dry-run gating

## 4. Test fixture cleanup

- [x] 4.1 Update remaining test configs using `reset: false` to `resetAccounts` / `resetForms` (e.g. `fusionAccount.test.ts`, chain scenarios)

## 5. Documentation

- [x] 5.1 Update `docs/guides/advanced-connection-settings.md` reset section for independent toggles
- [x] 5.2 Update `docs/operations/account-list.md` Setup step description
- [x] 5.3 Update README Developer Settings table
- [x] 5.4 Update `docs/guides/troubleshooting.md` reset workflow if referenced

## 6. Verification

- [x] 6.1 Run `npm test` for affected test files
- [x] 6.2 Run `npm run lint`
