## 1. DefinitionService Safeguard

- [x] 1.1 Update `DefinitionService.processUniqueDefinition` in `src/services/definitionService/definitionService.ts` to preserve `fusionIdentityAttribute` and `fusionDisplayAttribute` on existing Fusion accounts even when `needsReset` is `true`.
- [x] 1.2 Add unit test in `src/services/definitionService/__tests__/defineService.test.ts` verifying `fusionDisplayAttribute` is preserved when `needsReset` is `true` on an existing Fusion account.

## 2. Move Reset Out of Account Enable

- [x] 2.1 Update `src/operations/accountEnable.ts` to use `ATTR_OPS_REFRESH` and `refreshBlankUniqueAttributes` (mirroring `accountDisable.ts`), removing global pre-process and `ATTR_OPS_RESET`.
- [x] 2.2 Update `src/operations/__tests__/accountEnable.test.ts` to test `ATTR_OPS_REFRESH` and `refreshBlankUniqueAttributes` without global pre-process.

## 3. Add Reset Action Entitlement

- [x] 3.1 Add `Reset = 'reset'` to `FusionAction` (`src/model/fusionAction.ts`) and add the `reset` entitlement entry to `src/data/action.ts`.
- [x] 3.2 Implement `src/operations/actions/resetAction.ts` and register `reset` in `src/operations/actions/index.ts`.
- [x] 3.3 Add unit tests in `src/operations/actions/__tests__/resetAction.test.ts` for `Add` (runs global pre-process, `ATTR_OPS_RESET` rebuild, unique refresh, preserves `nativeIdentity`/`name`) and `Remove` (no-op).

## 4. Verification & Changelog

- [x] 4.1 Update `CHANGELOG.md` under the current `package.json` version (`2.2.0`).
- [x] 4.2 Run targeted tests, `npm run typecheck`, `npm run lint`, and `npm run build`.
