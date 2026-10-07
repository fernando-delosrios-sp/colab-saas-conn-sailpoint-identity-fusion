## Why

When two managed source accounts correlate to the same Fusion identity, `FusionRun.registerFusionAccount` currently lets the last registered account overwrite the first, then only logs a warning. This silently drops the first account's generated attributes (e.g. unique ids) and makes the winning account non-deterministic for a given ordering. Operators need an explicit opt-in to keep the first account and skip duplicates, rather than having that behavior forced on every deployment.

## What Changes

**Duplicate Fusion account handling in `registerFusionAccount`**
- From: when a Fusion identity already has a registered Fusion account with a different account key, the incoming account overwrites the existing one (last-wins) and a conflict warning is logged.
- To: this behavior becomes conditional on a new Developer Setting. When the setting is enabled, the first registered account is kept and later duplicates are skipped (never returned); when disabled (default), the existing last-wins overwrite is preserved. A same-key registration remains an in-place update in both states.
- Reason: make keep-first/skip-later an explicit, non-breaking opt-in instead of an unconditional behavior change.
- Impact: non-breaking; default behavior unchanged. Affected code: `FusionRun.registerFusionAccount`, `FusionRun.trackConflictingFusionIdentity`.

**New Developer Setting: Skip Fusion accounts with duplicate names**
- Adds a boolean toggle `skipDuplicateFusionAccounts` (default `false`) under Advanced Settings → Developer Settings, wired through `connector-spec.json`, `DeveloperSettingsSection`, and `developerSettings.ts` read settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fusion-run`: `registerFusionAccount` duplicate handling becomes conditional on the `skipDuplicateFusionAccounts` Developer Setting.
- `ubiquitous-language`: adds the canonical term **Duplicate Fusion account** (and the **Skip Fusion accounts with duplicate names** Developer Setting) to the glossary.

## Impact

- `src/model/fusionRun.ts` — `registerFusionAccount` and `trackConflictingFusionIdentity` read the new setting to decide skip vs. overwrite.
- `src/model/config.ts` — `DeveloperSettingsSection` gains `skipDuplicateFusionAccounts: boolean`.
- `src/data/config/settings/developerSettings.ts` — `runtimeDefaults` (false) and `readSettings` wiring.
- `connector-spec.json` — new toggle entry under Developer Settings.
- `docs/configuration/advanced.md` (generated) — documents the new field.
- Tests: `src/model/__tests__/fusionRun.test.ts` and `src/services/fusionService/__tests__/fusionService.report.test.ts`.
