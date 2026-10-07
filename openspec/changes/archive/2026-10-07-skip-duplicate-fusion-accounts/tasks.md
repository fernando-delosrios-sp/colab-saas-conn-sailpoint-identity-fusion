## 1. Developer Setting plumbing

- [x] 1.1 Add `skipDuplicateFusionAccounts: boolean` to `DeveloperSettingsSection` in `src/model/config.ts` with JSDoc (default `false`)
- [x] 1.2 Add `skipDuplicateFusionAccounts: false` to `runtimeDefaults` in `src/data/config/settings/developerSettings.ts`
- [x] 1.3 Wire `readSettings` to read `skipDuplicateFusionAccounts` via `extractBoolean` with the runtime default
- [x] 1.4 Add the `skipDuplicateFusionAccounts` toggle entry (label "Skip Fusion accounts with duplicate names?", helpKey) under Advanced Settings → Developer Settings in `connector-spec.json`

## 2. FusionRun duplicate handling

- [x] 2.1 Store the `skipDuplicateFusionAccounts` setting on `FusionRun` (read from config in the constructor)
- [x] 2.2 Change `trackConflictingFusionIdentity` to return a boolean duplicate verdict before the `tracker && log` guard
- [x] 2.3 Update `registerFusionAccount` to skip the duplicate (return early, keep first) when the setting is enabled and the verdict is a duplicate; keep the overwrite path when disabled

## 3. Tests

- [x] 3.1 Add unit tests in `src/model/__tests__/fusionRun.test.ts` covering: setting-enabled skip, setting-disabled overwrite, same-key in-place update, and skip without a tracker
- [x] 3.2 Update `src/services/fusionService/__tests__/fusionService.report.test.ts` if existing conflict-warning scenarios assert overwrite that is now gated

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (Vitest global suite; scenario suite via `npm run test:scenario`)
- [x] 4.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)
- [x] 4.3 Run `npm run lint` (includes connector-spec help check) and `npm run docs:prepare`

## 5. Documentation

- [x] 5.1 Regenerate `docs/configuration/advanced.md` via `npm run docs:prepare` so the new field is documented
- [x] 5.2 Update inline docs (JSDoc on `DeveloperSettingsSection.skipDuplicateFusionAccounts` and the new connector-spec helpKey)

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change
- [x] 6.2 Confirm entry covers user-visible changes from proposal Capabilities
