## Why

`accountEnable` currently runs with `ATTR_OPS_RESET` (`resetDefinition: true`), which forces a full tenant-wide Fusion account pre-process on every enable and regenerates unique attributes. In addition, `DefinitionService.processUniqueDefinition` did not guard `fusionDisplayAttribute` (`name`) for existing Fusion accounts when `needsReset` is `true`, causing `accountEnable` to overwrite `name` (e.g., `"barrett.cline"` → `"barrett.cline [OrangeHRM]"`) and leading ISC to split accounts onto new identities during subsequent aggregations.

Moving the reset mechanism out of `accountEnable` into a dedicated `reset` action entitlement (like `report`) makes enable/disable symmetrical, avoids unnecessary tenant-wide pre-processing on enable, and restricts full unique-attribute regeneration to explicit `reset` requests while preserving `nativeIdentity` and `name`.

## What Changes

- **`account-enable-operation`**: Change `accountEnable` from `ATTR_OPS_RESET` (with global pre-process) to `ATTR_OPS_REFRESH` + `refreshBlankUniqueAttributes` (without global pre-process), matching `accountDisable`.
- **`account-update-operation` / `actions`**: Add a `reset` action entitlement (`FusionAction.Reset = 'reset'`, `name: 'Reset'`) and `resetAction` handler. Adding `reset` triggers global pre-process, rebuilds the target Fusion account with `ATTR_OPS_RESET`, and refreshes unique attributes; removing `reset` is a no-op.
- **`definition-service`**: Guard `fusionDisplayAttribute` (`name`) alongside `fusionIdentityAttribute` (`id`) in `processUniqueDefinition` when `isExistingFusionAccount` is `true`, so `needsReset` never mutates `nativeIdentity` or `name` on existing Fusion accounts.

## Capabilities

### New Capabilities

- None (extends existing `account-update-operation` action entitlements).

### Modified Capabilities

- `account-enable-operation`: Remove global pre-process and `ATTR_OPS_RESET`; use `ATTR_OPS_REFRESH` and `refreshBlankUniqueAttributes`.
- `account-update-operation`: Add `reset` action entitlement Add/Remove behavior.
- `definition-service`: Preserve `fusionDisplayAttribute` (`name`) and `fusionIdentityAttribute` (`id`) on existing Fusion accounts during `needsReset`.

## Impact

- `src/operations/accountEnable.ts` and `src/operations/__tests__/accountEnable.test.ts`
- `src/model/fusionAction.ts`, `src/data/action.ts`, `src/operations/actions/index.ts`, `src/operations/actions/resetAction.ts`
- `src/services/definitionService/definitionService.ts` and `src/services/definitionService/__tests__/defineService.test.ts`
- `CHANGELOG.md`
