# Tasks: FusionAccount `managedKey` refactor

## Model

- [x] Rename `FusionAccount.nativeIdentity` getter to `managedKey`.
- [x] Rename `FusionAccount.nativeIdentityOrUndefined` getter to `managedKeyOrUndefined`.
- [x] Remove all internal references to `nativeIdentity` in `FusionAccount`.
- [x] Update factory `managedKey` derivation:
  - [x] `fromIdentity`: `IDENTITIES_SOURCE_NAME::identity.id`
  - [x] `fromManagedAccount`: `sourceId::account.nativeIdentity`
  - [x] `fromFusionDecision`: `decision.account.sourceId::decision.account.nativeIdentity`
  - [x] `fromFusionAccount`: `fusionSourceId::account.nativeIdentity` (requires passing fusion source id)
- [x] Remove `resolveCompositeManagedKeyFromFusionRecord` and its import.
- [x] Change `setKey()` to set `_key` only.
- [x] Update `initializeAttributeState` and any other internal uses of the old `nativeIdentity` parameter to use `managedKey`.

## Attribute service

- [x] Simplify `AttributeService.getSimpleKey()` to return `SimpleKey(fusionAccount.managedKey)` unless `skipAccountsWithMissingId` and missing `fusionIdentityAttribute`.

## Fusion service / repository

- [x] Rename repository `getFusionAccountByNativeIdentity` → `getFusionAccountByManagedKey`.
- [x] Update `setFusionAccount` assertion and map key usage to `managedKey`.
- [x] Rename `FusionService.getFusionAccountByNativeIdentity` → `getFusionAccountByManagedKey`.
- [x] Update `identityProcessor` map deletion to use `managedKey`.
- [x] Update unmatched-candidate tracking (`currentRunUnmatchedFusionNativeIdentitiesBySource`) to store `managedKey`.
- [x] Update `reportService` and other consumers to call renamed lookup methods.

## Source service

- [x] Provide fusion source id to `FusionAccount.fromFusionAccount` where it is constructed.

## Operations

- [x] Update log messages and variable names referencing `nativeIdentity` to `managedKey`.

## Tests

- [x] Update `model/__tests__/fusionAccount.test.ts` expectations.
- [x] Update `ReplayAdapter` and chain-state test helpers.
- [x] Update operation tests that mock `nativeIdentity`.
- [x] Run full test suite and fix failures.
