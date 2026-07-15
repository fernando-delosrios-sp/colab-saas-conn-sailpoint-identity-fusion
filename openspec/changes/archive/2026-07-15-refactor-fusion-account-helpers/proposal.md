## Why

`rebuildFusionAccount` and `accountUpdate` currently read and write Fusion account attributes directly (e.g. `account.attributes?.accounts`, `fusionAttributes[attributeName] = ...`). This bypasses the dedicated handling methods on `FusionAccount`, making the code harder to follow, easier to break, and inconsistent with the rest of the model. A refactor will centralize attribute handling, improve readability, and fix a latent initialization bug in the process.

## What Changes

- Refactor `src/operations/helpers/rebuildFusionAccount.ts` into small, single-responsibility helpers with no service parameters.
- Replace direct raw-attribute reads in `rebuildFusionAccount` with model utilities and/or dedicated `FusionAccount` accessors.
- Replace direct attribute-bag mutation in `src/operations/accountUpdate.ts` with `FusionAccount.setReverseCorrelationAttribute` / `clearReverseCorrelationAttribute`.
- Fix `FusionAccount.initializeBasicProperties` so `_missingAccountIds` is loaded from the `missing-accounts` attribute instead of the `accounts` attribute.
- Update/add unit tests to cover the refactored helpers and the corrected initialization.

## Capabilities

### New Capabilities
- (None)

### Modified Capabilities
- `fusion-account-attribute-resolution`: clarify that persisted `missing-accounts` must restore the internal missing-account reference set, not the correlated account set.

## Impact

- **Affected code:** `src/operations/helpers/rebuildFusionAccount.ts`, `src/operations/accountUpdate.ts`, `src/model/fusionAccount.ts`, and related tests.
- **Impact:** Cleaner helper code, centralized attribute mutation rules, and correct restoration of missing-account references from persisted fusion accounts.
