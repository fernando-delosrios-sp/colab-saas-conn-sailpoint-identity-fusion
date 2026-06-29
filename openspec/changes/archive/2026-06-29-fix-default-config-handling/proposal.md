## Why

The current configuration handling in `src/data/config/settings/*.ts` unpredictably mixes UI defaults (`connectorSpecInitialValues`), internal fallback sources (`internalConfig`), and hardcoded values. This tangle leads to silent unit mutations (e.g., multiplying `processingWait` twice), omits certain runtime defaults in `defaults.ts`, and allows drift between `connector-spec.json` and the codebase. Standardizing this into a strict "UI vs Runtime" split will prevent silent misconfigurations and make adding new configuration keys safe and predictable.

## What Changes

- **Strict Separation in `defaults.ts`**: `defaults.ts` will explicitly export two unified objects: `connectorSpecInitialValues` (aggregating only UI-exposed defaults) and `runtimeDefaults` (aggregating all settings, acting as the ultimate execution fallback).
- **Unified `readSettings` Pattern**: All settings modules will standardize on `raw.key ?? runtimeDefaults.key` instead of ad-hoc fallback logic.
- **Unit Mutation Fix**: Correct the extraction logic for `processingWait` in `advancedConnectionSettings.ts` so it doesn't double-multiply by 1000.
- **Spec Drift Cleanup**: Remove orphaned keys (`force`), migrated keys (`fusionAverageScore`), and reconcile abbreviations (`dragNDropEnabled`) in `connector-spec.json`.

## Capabilities

### New Capabilities
*(None)*

### Modified Capabilities
*(None - This is an internal configuration refactoring and drift cleanup. No requirement-level behaviors are changing.)*

## Impact

- **Affected Code**: `src/data/config/defaults.ts`, `src/data/config/settings/*.ts`
- **Configuration Schema**: `connector-spec.json` (removing dead keys)
- **Runtime**: Safer configuration parsing without changing the intended behavior of the system.
