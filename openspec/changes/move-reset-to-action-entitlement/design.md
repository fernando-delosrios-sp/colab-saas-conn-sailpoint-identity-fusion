## Context

- `accountEnable` (`src/operations/accountEnable.ts`) previously ran `initializeCounters`, `fetchFusionAccounts`, `registerUniqueValuesFromManagedSourceAccounts`, `preProcessFusionAccounts`, `rebuildFusionAccount(..., ATTR_OPS_RESET)`, and `refreshUniqueAttributes`.
- `accountDisable` (`src/operations/accountDisable.ts`) already uses `ATTR_OPS_REFRESH` and `refreshBlankUniqueAttributes(..., false)` without a global pre-process.
- `reportAction` (`src/operations/actions/reportAction.ts`) establishes the pattern for one-shot action entitlements: execute on `AttributeChangeOp.Add`, no-op on `AttributeChangeOp.Remove`.

## Goals / Non-Goals

- **Goals**:
  - Make `accountEnable` symmetrical with `accountDisable` (`ATTR_OPS_REFRESH` + `refreshBlankUniqueAttributes`, no global pre-process).
  - Add `reset` action entitlement (`FusionAction.Reset = 'reset'`) and `resetAction` handler to perform `ATTR_OPS_RESET` on demand via `std:account:update`.
  - Ensure `DefinitionService.processUniqueDefinition` preserves both `fusionIdentityAttribute` and `fusionDisplayAttribute` on existing Fusion accounts even when `needsReset` is `true`.
- **Non-Goals**:
  - Changing `accountDisable` behavior.
  - Changing `Unique` attribute generation rules for newly created Fusion accounts.

## Decisions

1. **`accountEnable` mirrors `accountDisable`**:
   - Calls `sources.fetchAllSources()`, `schemas.setFusionAccountSchema(input.schema)`, `rebuildFusionAccount(input.identity, ATTR_OPS_REFRESH, ...)`, `refreshBlankUniqueAttributes(fusionAccount, { definition, sources, log }, false)`, `fusionAccount.enable()`, `fusion.normalizePendingFormStateForOutput()`, and `fusion.getISCAccount(fusionAccount)`.
2. **`resetAction` on `AttributeChangeOp.Add`**:
   - Calls `definition.initializeCounters()`, `sources.fetchFusionAccounts()`, `definition.registerUniqueValuesFromManagedSourceAccounts(sources.fusionAccounts)`, `fusion.preProcessFusionAccounts()`, `rebuildFusionAccount(fusionAccount.managedKey!, ATTR_OPS_RESET, ...)`, and `definition.refreshUniqueAttributes(rebuilt)`.
   - Copies the resulting attributes from `rebuilt` onto `fusionAccount.attributeBag.current` (preserving `fusionAccount` identity and allowing `runAccountUpdatePipeline` to restore reverse-correlation attributes and call `fusion.getISCAccount(fusionAccount, true)`).
   - `AttributeChangeOp.Remove` is a no-op.
3. **`DefinitionService.processUniqueDefinition` immutability guard**:
   - Replace `if (hasValue && isFusionIdentityAttribute && isExistingIdentity)` with `if (hasValue && isExistingFusionAccount && (isFusionIdentityAttribute || isFusionDisplayAttribute))` so both `id` and `name` are registered and preserved on existing Fusion accounts regardless of `needsReset`.

## Risks / Trade-offs

- **Existing callers expecting `accountEnable` to reset unique attributes**: Mitigated by documenting the new `reset` action entitlement; `enable` now preserves existing unique values and only fills blank ones.
