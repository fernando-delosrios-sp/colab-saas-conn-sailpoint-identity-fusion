## Why

For identity-based Fusion accounts, the Velocity context is incomplete: `$name` and `$identity.name` are not available even though the correlated ISC identity has a root-level `name`. `FusionAccount.addIdentityLayer()` stores only `identity.attributes` in `attributeBag.identity`, so the root `name` is lost before the Velocity context is built.

## What Changes

1. **Promote `$name`** — for identity-based Fusion accounts, expose the identity name as `$name` when no mapped attribute named `name` already exists.
2. **Expose `$identity.name`** — always set `$identity.name` to the root identity name, overriding any `identity.attributes.name`.
3. **Expose `$account.name`** — for identity-backed origin snapshots (`originSource === 'Identities'`), set `$account.name` to the account display name.
4. **Update documentation** — keep the Velocity context reference in `docs/guides/define.md` and `README.md` current. `docs/index.md` is generated from `README.md` via `scripts/sync-docs-home.cjs`.

## Capabilities

### Modified Capabilities
- `fusion-account-attribute-resolution`: Extend Velocity context completeness for identity-based accounts.

## Impact

- `src/services/attributeService/attributeService.ts`
- `src/services/attributeService/__tests__/attributeService.test.ts`
- `docs/guides/define.md`
- `README.md` (source for generated `docs/index.md`)
