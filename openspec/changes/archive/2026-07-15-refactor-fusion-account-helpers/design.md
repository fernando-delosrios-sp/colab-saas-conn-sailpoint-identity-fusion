## ctx

`rebuildFusionAccount` currently mixes orchestration (fetching, loading, calling services) with low-level attribute parsing and key normalization. It reads `account.attributes?.accounts` and `account.attributes?.['missing-accounts']` directly, then builds and parses managed-account keys inline. `accountUpdate` mutates `fusionAccount.attributes[attributeName]` directly instead of using the model's dedicated reverse-correlation setters.

The `FusionAccount` model already exposes focused methods (`addAccountId`, `removeAccountId`, `addMissingAccountId`, `setCorrelatedAccount`, `setReverseCorrelationAttribute`, `clearReverseCorrelationAttribute`) and utility functions (`attributeToSet`, `buildManagedAccountKey`, `parseManagedAccountKey`) exist in `src/utils/attributes.ts` and `src/model/managedAccountKey.ts`. Using them will make the helpers shorter, clearer, and consistent with the rest of the codebase.

There is also a latent bug in `FusionAccount.initializeBasicProperties`: `_missingAccountIds` is initialized from the `accounts` attribute rather than `missing-accounts`.

## Goals / Non-Goals

**Goals:**
- Split `rebuildFusionAccount` into small, named helpers that each do one thing.
- Remove direct raw-attribute reads from `rebuildFusionAccount` in favor of existing utilities/model methods.
- Remove direct attribute-bag mutation from `accountUpdate` in favor of `FusionAccount.setReverseCorrelationAttribute` / `clearReverseCorrelationAttribute`.
- Fix `_missingAccountIds` initialization in `FusionAccount.initializeBasicProperties`.
- Keep all helpers free of the full service registry; accept only the data or minimal callbacks they need.

**Non-Goals:**
- No new public API or behavior contract changes.
- No changes to `processFusionAccount`, `FusionAccount` public API beyond the initialization fix, or service internals.
- No new dependencies.

## Decisions

### 1. Helper shape in `rebuildFusionAccount.ts`

Extract three helpers with minimal parameters:

```typescript
function collectManagedAccountKeys(
    fusionAccount: Account,
    identity: IdentityDocument | undefined,
    isManagedSource: (sourceName: string) => boolean
): Set<string>

function parseManagedAccountKeys(
    accountIds: Iterable<string>,
    log: LogService
): ParsedAccountKey[]

async function cascadeAggregateSources(
    sourceIds: Iterable<string>,
    sources: SourceService,
    log: LogService
): Promise<void>
```

`collectManagedAccountKeys` combines the fusion account's `accounts` and `missing-accounts` references with identity-linked accounts, returning a deduplicated set of composite keys. It uses `attributeToSet` for attribute reads and `buildManagedAccountKey` for identity account keys. The caller supplies `isManagedSource` as a thin predicate so the helper does not need `SourceService`.

`parseManagedAccountKeys` filters out legacy non-composite keys and logs a warning for each, using `parseManagedAccountKey`.

`cascadeAggregateSources` remains a small helper because it inherently needs `SourceService` and `LogService`; keeping it named keeps the main function readable.

### 2. `accountUpdate.ts` reverse-correlation snapshot restore

Replace the direct mutation block:

```typescript
fusionAttributes[attributeName] = snapshot.value
delete fusionAttributes[attributeName]
```

with:

```typescript
if (snapshot.exists) {
    fusionAccount.setReverseCorrelationAttribute(attributeName, snapshot.value as string)
} else {
    fusionAccount.clearReverseCorrelationAttribute(attributeName)
}
```

This routes attribute writes through the model's dedicated handlers.

### 3. Fix `_missingAccountIds` initialization

In `FusionAccount.initializeBasicProperties`, change:

```typescript
this._missingAccountIds = attributeToSet(attributes, 'accounts')
```

to:

```typescript
this._missingAccountIds = attributeToSet(attributes, 'missing-accounts')
```

### 4. Tests

- Update `rebuildFusionAccount.test.ts` to keep covering the public behavior of `rebuildFusionAccount` (managed source filtering, legacy-key warning, deduplication).
- Add focused unit tests for `collectManagedAccountKeys` and `parseManagedAccountKeys` if they are exported for testing, or verify behavior through `rebuildFusionAccount` mocks.
- Add a test in `fusionAccount.test.ts` (or existing model tests) asserting that `fromFusionAccount` restores `missing-accounts` into `_missingAccountIds` and not into `_accountIds`.

## Risks / Trade-offs

- **Behavior change from the `_missingAccountIds` fix:** Existing fusion accounts with persisted `missing-accounts` will now have those values restored correctly. This is a fix, but it may change observable status/actions for accounts that previously had missing-account data misrouted. Mitigation: test with representative persisted records.
- **`setReverseCorrelationAttribute` signature expects `string`:** The snapshot stores `unknown`; casting preserves current behavior. If reverse-correlation values are ever non-strings, the type is already mismatched today. This refactor does not worsen that.
- **Helper extraction overhead:** Extracting functions adds indirection, but the main function shrinks from ~90 lines to an orchestration skeleton, which improves readability and testability.
