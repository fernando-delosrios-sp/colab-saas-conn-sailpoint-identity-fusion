## Scope

Move unique-attribute reset (`ATTR_OPS_RESET`) out of `accountEnable` into a dedicated `reset` action entitlement (like `report`), and ensure `processUniqueDefinition` preserves `fusionDisplayAttribute` (`name`) as well as `fusionIdentityAttribute` (`id`) on existing Fusion accounts during reset.

## Language

No new domain terms introduced; uses existing canonical terms (`Fusion account`, `actions` entitlement, `Unique` definition, `Normal` definition).

## Decisions

- **Context**: `accountEnable` previously ran `ATTR_OPS_RESET`, triggering a global Fusion account fetch/pre-process and regenerating unique attributes on every enable. Because `processUniqueDefinition` did not guard `fusionDisplayAttribute` (`name`) for existing Fusion accounts during `needsReset`, enabling `OrangeHRM`-origin Fusion accounts overwrote `name` from `<username>` to `<username> [OrangeHRM]`.
- **Q1**: Should `accountEnable` use `ATTR_OPS_REFRESH` and `refreshBlankUniqueAttributes` like `accountDisable`?
  - **Chosen**: Yes — `accountEnable` uses `ATTR_OPS_REFRESH` and `refreshBlankUniqueAttributes` without a global pre-process pass.
- **Q2**: How should unique-attribute reset be triggered?
  - **Chosen**: A new `reset` action entitlement (`id: 'reset'`, `name: 'Reset'`) in `actions`, handled by `resetAction` in `accountUpdate` (Add runs the reset pipeline; Remove is a no-op, matching `reportAction`).
- **Q3**: Should `processUniqueDefinition` preserve `fusionDisplayAttribute` (`name`) during `needsReset` on existing Fusion accounts?
  - **Chosen**: Yes — align `processUniqueDefinition` with `processNormalDefinition` so both `fusionIdentityAttribute` and `fusionDisplayAttribute` are immutable on existing Fusion accounts even when `needsReset` is `true`.

## Open questions

None.

## Scenarios discussed

- `accountEnable` on a disabled Fusion account preserves populated unique attributes and calculates only blank unique attributes without global pre-process.
- `accountUpdate` adding `actions: ['reset']` runs global pre-process, rebuilds with `ATTR_OPS_RESET`, refreshes unique attributes, and preserves `nativeIdentity` (`id`) and `name` (`fusionDisplayAttribute`) on existing Fusion accounts.
- `accountUpdate` removing `actions: ['reset']` is a no-op.
