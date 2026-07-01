# Design: FusionAccount `managedKey` refactor

## Identifier rules

`FusionAccount` will expose a single internal identifier named `managedKey`. It is set by factory methods and never mutated afterwards.

| Factory | Source of `managedKey` | Example |
|---|---|---|
| `fromIdentity(identity)` | `IDENTITIES_SOURCE_NAME::identity.id` | `Identities::id-123` |
| `fromManagedAccount(account)` | `account.sourceId::account.nativeIdentity` | `src-a::jdoe` |
| `fromFusionDecision(decision)` | `decision.account.sourceId::decision.account.nativeIdentity` | `src-a::jdoe` |
| `fromFusionAccount(account)` | `fusionSourceId::account.nativeIdentity` | `fusion-ng::Identities::id-123` |

The fusion source id is obtained from `SourceService.fusionSourceId` and passed into the factory.

## Output key

`FusionAccount.toISCAccount()` and `FusionService.getISCAccount()` will produce:

```ts
key: { simple: { id: fusionAccount.managedKey } }
```

`AttributeService.getSimpleKey()` is simplified to return `SimpleKey(fusionAccount.managedKey)` when the account is not being skipped; otherwise it returns `undefined`.

## `skipAccountsWithMissingId`

The skip decision is decoupled from key generation:

```ts
if (skipAccountsWithMissingId && !fusionAccount.attributes[fusionIdentityAttribute]) {
    return undefined
}
return SimpleKey(fusionAccount.managedKey)
```

This preserves the current admin-facing behavior while making the key itself deterministic.

## `setKey()`

```ts
public setKey(key: SimpleKeyType): void {
    this._key = key
}
```

`managedKey` is no longer modified here. Callers that previously relied on `setKey()` to backfill the identity must ensure the factory set `managedKey` correctly.

## Map and lookup updates

- `FusionAccountRepository.fusionAccountMap` keys are `managedKey`.
- `getFusionAccountByNativeIdentity` is renamed to `getFusionAccountByManagedKey` and accepts the composite key.
- `FusionService` exposes the same rename.
- `identityProcessor.processIdentity` deletes from `fusionAccountMap` using `existingAccount.managedKey`.
- `_currentRunUnmatchedCandidatesIterableForSource` stores and looks up `managedKey` values.
- `reportService.resolveAccountUrl` passes the managed-account key through `getFusionAccountByManagedKey`; for identity-origin accounts it falls back to `fusionIdentityMap`.

## Decision replay compatibility

Fusion decisions reference managed accounts by their stable composite key (`sourceId::nativeIdentity`). That format does not change, so existing decisions continue to replay. Identity-based decisions use `identityId`, which is also unchanged.

## No migration

The old simple-format platform identities are intentionally not migrated. The next aggregation will emit accounts under the new composite identities; the platform will treat old simple-format rows as disconnected.
