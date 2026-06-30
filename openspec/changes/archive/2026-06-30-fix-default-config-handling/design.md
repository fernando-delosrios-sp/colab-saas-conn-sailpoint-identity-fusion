## Context

Currently, configuration values are populated from multiple sources in an ad-hoc manner. The `readSettings` function in each configuration module (e.g., `advancedConnectionSettings.ts`) arbitrarily merges `raw` input with `connectorSpecInitialValues`, `internalConfig` fallbacks, and local variables. This structure obscures the source of truth, allows runtime defaults to be missed in the main `defaults.ts` export, and leads to bugs such as the double-multiplication of `processingWait`. Furthermore, the `connector-spec.json` UI configuration has drifted, retaining obsolete properties.

## Goals / Non-Goals

**Goals:**
- Unify configuration fallback resolution across all settings modules.
- Enforce a strict separation between UI defaults (`connectorSpecInitialValues`) and runtime defaults (`runtimeDefaults`).
- Fix existing bugs related to configuration extraction (e.g., unit conversions like `processingWait`).
- Remove obsolete keys from `connector-spec.json` to prevent confusion.

**Non-Goals:**
- Modifying the underlying behavior of any connector feature.
- Changing the schema structure for `connector-spec.json` beyond removing dead keys.
- Changing internal variables (like `pageSize` or `retriesConstant`) outside of configuration resolution logic.

## Decisions

1. **Strictly Separate `connectorSpecInitialValues` and `runtimeDefaults` in `defaults.ts`**
   - *Rationale*: We must distinguish between values presented in the SailPoint UI (`connectorSpecInitialValues`) and values the system falls back to for safe execution if omitted by the user (`runtimeDefaults`). `defaults.ts` will explicitly combine all UI defaults into `connectorSpecInitialValues` and all runtime defaults (which extend UI defaults) into `runtimeDefaults`.

2. **Standardize `readSettings(raw: Record<string, unknown>)`**
   - *Rationale*: Every setting extraction should follow a uniform pattern: `extractBoolean(raw, 'key') ?? runtimeDefaults.key` (or `raw.key ?? runtimeDefaults.key`). This eliminates confusion regarding where a fallback value originates and removes implicit dependencies on `internalConfig` from within the read function itself. `runtimeDefaults` inside the settings module will bridge `internalConfig` constants.

3. **Purge Drift in `connector-spec.json`**
   - *Rationale*: Properties like `force` and `fusionAverageScore` (which was migrated) remain in the JSON as orphans. Removing them keeps the UI schema lean and aligned with actual code. We will also check `dragNDropEnabled` vs `dragAndDropEnabled` to ensure the property matches what the code / platform expects.

## Risks / Trade-offs

- **Risk: Breaking changes to existing JSON configs** 
  - *Mitigation*: Ensure that removing orphaned keys in `connector-spec.json` does not break backwards compatibility for existing deployed connectors, as they are ignored by `readSettings`.
- **Risk: Unit conversion bugs introduced during standardization**
  - *Mitigation*: Carefully audit variables that handle time (seconds vs milliseconds), such as `processingWait` and `retryDelay`, to ensure they are handled and multiplied correctly exactly once.
