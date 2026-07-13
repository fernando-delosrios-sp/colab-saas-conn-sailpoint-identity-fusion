## Why

The Velocity context still carries a legacy `_id` fallback in account-snapshot matching, even though production snapshots no longer include `_id`. This creates a small but real drift: the code suggests `_id` is a supported matching key, tests rely on it in hand-rolled mocks, and documentation still advertises `_id` as an available legacy field. Removing the fallback makes the contract honest — Velocity snapshots are matched only by their canonical nested `source` / `schema` shape.

## What Changes

1. **Drop the `_id` fallback in production** — remove the `|| trimStr(account?._id) === ...` branches from `AttributeService.getOrderedAccountsForContext()` and `AttributeService.findAccountByIdInSourceMap()`.
2. **Clean up test mocks** — remove `_id` from hand-constructed account snapshots in `attributeService.test.ts`. All existing values duplicate `source.id::schema.id`, so the tests continue to pass via `getManagedAccountSnapshotKey()`.
3. **Update documentation** — remove the prose in `README.md`, `docs/index.md`, and `docs/guides/define.md` that describes `_id` as a legacy flat key on Velocity snapshots.
4. **Clarify the misleading test** — the test named `does not resolve managed $account by transient account.id fallback` uses `_id` but exercises `resolveOriginAccountObjectForVelocity`, which already ignores `_id`. Update or remove it so it does not imply `_id` behavior that no longer exists.

## Capabilities

### Modified Capabilities
- `fusion-account-attribute-resolution`: Account matching in the Velocity context now uses only the canonical `source` / `schema` composite key.

## Impact

- `src/services/attributeService/attributeService.ts`
- `src/services/attributeService/__tests__/attributeService.test.ts`
- `README.md`
- `docs/guides/define.md`
- `docs/index.md` (generated from `README.md` via `scripts/sync-docs-home.cjs`)
