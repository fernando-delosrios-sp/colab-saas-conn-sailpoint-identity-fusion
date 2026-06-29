## 1. Schema Cleanup

- [ ] 1.1 Remove orphaned key `force` from `connector-spec.json`.
- [ ] 1.2 Remove migrated key `fusionAverageScore` from `connector-spec.json`.
- [ ] 1.3 Verify `dragNDropEnabled` versus `dragAndDropEnabled` in `connector-spec.json` and fix to match expected platform property.

## 2. Refactor `defaults.ts`

- [ ] 2.1 Update `defaults.ts` to strictly export `connectorSpecInitialValues` (aggregating only UI defaults).
- [ ] 2.2 Update `defaults.ts` to explicitly construct and export `runtimeDefaults` (acting as the universal fallback including non-UI config).

## 3. Standardize Settings Modules

- [ ] 3.1 Refactor `advancedConnectionSettings.ts` to use `raw.key ?? runtimeDefaults.key` pattern.
- [ ] 3.2 Fix the `processingWait` extraction in `advancedConnectionSettings.ts` so it doesn't double-multiply by 1000.
- [ ] 3.3 Refactor `matchingSettings.ts` to adopt the uniform fallback pattern.
- [ ] 3.4 Refactor remaining settings files (`sourcesSettings.ts`, `connectionSettings.ts`, `developerSettings.ts`, etc.) as needed to follow the same strict fallback pattern.
- [ ] 3.5 Ensure `internalConfig` references are properly routed through each module's `runtimeDefaults`.

## 4. Testing & Validation

- [ ] 4.1 Run unit tests and verify default configuration fallback behavior is intact.
- [ ] 4.2 Run `npm run lint` and `npm test` to ensure code quality gates pass.
