## 1. Remove `_id` matching fallbacks from `AttributeService`

- [x] 1.1 Remove the `|| trimStr(account?._id) === mainAccountId` branch from `AttributeService.getOrderedAccountsForContext()` in `src/services/attributeService/attributeService.ts`.
- [x] 1.2 Remove the `_id` fallback branch from `AttributeService.findAccountByIdInSourceMap()` in `src/services/attributeService/attributeService.ts`.
- [x] 1.3 Verify `AttributeService` still resolves snapshots using only `getManagedAccountSnapshotKey()` / nested `source.id::schema.id`.

## 2. Remove legacy flat-key fallbacks from `velocityAccountSnapshot`

- [x] 2.1 Remove `_source` and `_sourceId` fallbacks from `velocitySnapshotSourceName()` in `src/utils/velocityAccountSnapshot.ts`.
- [x] 2.2 Remove `_sourceId` fallbacks from `velocitySnapshotSourceId()` in `src/utils/velocityAccountSnapshot.ts`.
- [x] 2.3 Remove `_name` fallbacks from `velocitySnapshotSchemaName()` in `src/utils/velocityAccountSnapshot.ts`.
- [x] 2.4 Remove `_managedKey` fallbacks from `velocitySnapshotSchemaId()` in `src/utils/velocityAccountSnapshot.ts`.
- [x] 2.5 Ensure helpers return an empty string when nested `source` or `schema` objects are absent.

## 3. Update unit tests to match the canonical snapshot shape

- [x] 3.1 Remove `_id` from all hand-constructed account snapshots in `src/services/attributeService/__tests__/attributeService.test.ts`.
- [x] 3.2 Remove the misleading test `does not resolve managed $account by transient account.id fallback` from `attributeService.test.ts`.
- [x] 3.3 Update `src/utils/__tests__/velocityAccountSnapshot.test.ts` to stop asserting legacy flat-key behavior (`_source`, `_sourceId`, `_name`, `_managedKey`).
- [x] 3.4 Run `attributeService` and `velocityAccountSnapshot` test suites and fix any failing mocks.

## 4. Update user-facing documentation

- [x] 4.1 Remove prose describing `_id` as a legacy flat key from `README.md`.
- [x] 4.2 Remove prose describing `_id` as a legacy flat key from `docs/guides/define.md`.
- [x] 4.3 Regenerate `docs/index.md` by running `scripts/sync-docs-home.cjs`.
- [x] 4.4 Verify no references to `_id`, `_source`, `_sourceId`, `_name`, or `_managedKey` remain in user-facing docs.

## 5. Validate and finalize the change

- [x] 5.1 Run the full relevant test suite (at minimum `attributeService` and `velocityAccountSnapshot`).
- [x] 5.2 Run `openspec validate remove-velocity-id-fallback --type change --strict` and resolve any issues.
