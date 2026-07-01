# Proposal: Standardize FusionAccount identifier as `managedKey`

## Why

`FusionAccount` currently exposes an internal domain key through a getter named `nativeIdentity`, which is easily confused with the platform `Account.nativeIdentity`. The persisted-account reconstruction path (`resolveCompositeManagedKeyFromFusionRecord`) also guesses the account key by scanning unrelated attributes such as `Accounts` and `MissingAccounts`, which can adopt a correlated managed key as the account's own identity. This makes the identifier semantics inconsistent and hard to reason about.

We now have a clear rule: every Fusion account is identified by a composite `managedKey` derived from its origin. Making `key.simple.id` equal that `managedKey` removes the internal/external split and guarantees unique, deterministic keys.

## What Changes

- **BREAKING** Rename `FusionAccount.nativeIdentity` / `nativeIdentityOrUndefined` to `managedKey`. Remove the `nativeIdentity` terminology from the domain model.
- **BREAKING** Change the platform account identity (`key.simple.id`) to equal the composite `managedKey`.
  - Identity-origin accounts become `Identities::<identityId>`.
  - Managed-origin accounts become `<managedSourceId>::<managedNativeIdentity>`.
  - Reloaded persisted Fusion accounts become `<fusionSourceId>::<persistedNativeIdentity>`.
- Remove `resolveCompositeManagedKeyFromFusionRecord`; derive `managedKey` deterministically in each factory method.
- Make `managedKey` immutable after construction; `setKey()` only assigns the SDK output key.
- Keep `skipAccountsWithMissingId` behavior by checking whether `fusionIdentityAttribute` is set before outputting an account.
- Update all callers, tests, and report/map lookups to use `managedKey` and the new composite key format.

## Capabilities

- **Modified Capabilities**:
  - `fusion-account-attribute-resolution` — the generated account identity is no longer derived from `attributes[fusionIdentityAttribute]` with a fallback; it is always the composite `managedKey`. The skip-when-empty behavior remains.

## Impact

- `src/model/fusionAccount.ts` and `src/model/managedAccountKey.ts`
- `src/services/fusionService/*` (maps, lookups, report helpers)
- `src/operations/*` that pass or log account identities
- Test harnesses and replay fixtures
- Existing platform accounts keyed under the old simple format will be recreated; no data migration is planned.
