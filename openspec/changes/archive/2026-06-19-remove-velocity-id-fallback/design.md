## Context

The Velocity context still carries legacy flat-key fallbacks for account-snapshot matching and field access. Production snapshots have used the nested `source`/`schema` shape for some time, but the codebase retains two categories of backward-compatibility code:

1. **Matching fallbacks in `AttributeService`** (`src/services/attributeService/attributeService.ts`):
   - `getOrderedAccountsForContext()` promotes the account whose `getManagedAccountSnapshotKey()` equals `mainAccount`, but also accepts `trimStr(account?._id) === mainAccountId`.
   - `findAccountByIdInSourceMap()` similarly falls back to `_id` when looking up a managed account by id.
   - These branches are unreachable in production because `AttributeService` populates snapshots only with nested `source`/`schema`, but they mislead readers and tests into thinking `_id` is a supported matching key.

2. **Field-access fallbacks in `velocityAccountSnapshot.ts`** (`src/utils/velocityAccountSnapshot.ts`):
   - `velocitySnapshotSourceName`, `velocitySnapshotSourceId`, `velocitySnapshotSchemaName`, and `velocitySnapshotSchemaId` read nested objects first, then fall back to `_source`, `_sourceId`, `_name`, and `_managedKey`.
   - These flat keys are not documented in current user-facing docs, but the utility still resolves them, creating drift between the canonical shape and what the code actually accepts.

User-facing documentation in `README.md`, `docs/index.md`, and `docs/guides/define.md` continues to describe `_id` as a legacy field present on Velocity snapshots, reinforcing the outdated contract.

## Goals / Non-Goals

**Goals:**
- Remove the `_id` matching fallback from `AttributeService.getOrderedAccountsForContext()` and `AttributeService.findAccountByIdInSourceMap()`.
- Remove `_id` from hand-constructed account snapshots in `attributeService.test.ts`.
- Remove or clarify the misleading test `does not resolve managed $account by transient account.id fallback`.
- Remove legacy flat-key fallbacks (`_source`, `_sourceId`, `_name`, `_managedKey`) from `velocityAccountSnapshot.ts`.
- Update `velocityAccountSnapshot.test.ts` to stop asserting legacy flat-key behavior.
- Update user-facing docs to stop presenting `_id` (or any legacy flat key) as a supported or legacy-access field on Velocity snapshots.
- Keep all existing behavior unchanged for snapshots that already use the nested `source`/`schema` shape.

**Non-Goals:**
- Changing how account snapshots are produced upstream (e.g., in `FusionService`, `SourceService`, or aggregation flows).
- Changing the nested `source`/`schema` data model.
- Modifying `resolveOriginAccountObjectForVelocity` logic beyond removing stale test implications.
- Adding new runtime validation or migration scripts.

## Decisions

1. **Single canonical matching key.** `getManagedAccountSnapshotKey()` already computes `sourceId::nativeIdentity` from nested `source.id` and `schema.id` via `velocitySnapshotSourceId` / `velocitySnapshotSchemaId`. After this change, both `getOrderedAccountsForContext()` and `findAccountByIdInSourceMap()` will match only against that key. This makes the matching contract identical to the key produced for `$originAccount` and `mainAccount`.

2. **Remove all legacy flat-key resolution.** The field-access helpers in `velocityAccountSnapshot.ts` will return the nested value when present and an empty string otherwise. The flat-key branches are removed rather than deprecated because they are already undocumented and production data no longer uses them.

3. **Test mocks reflect production shape.** All hand-constructed snapshots in unit tests already duplicate `_id` with `source.id::schema.id`. Removing `_id` does not change test outcomes; it only removes the false dependency.

4. **Misleading test removed, not renamed.** The test `does not resolve managed $account by transient account.id fallback` exercises `resolveOriginAccountObjectForVelocity`, which already ignores `_id`. Keeping it suggests there is meaningful `_id` behavior to guard. Remove it entirely.

5. **Docs use nested shape exclusively.** `README.md`, `docs/index.md`, and `docs/guides/define.md` will describe `$accounts[]` / `$account` / `$sources` using only nested `source` and `schema` objects. Any mention of `_id` as a legacy flat key is removed. `docs/index.md` will be regenerated with `scripts/sync-docs-home.cjs`.

## Risks / Trade-offs

- **[Risk]** Customers or integrators still constructing snapshots with `_id` (outside the connector) could break if they pass those snapshots into the Velocity context.  
  -> **Mitigation:** This is a contract cleanup; the connector itself has not produced `_id` snapshots for some time. The change is communicated via release notes.
- **[Risk]** Internal tests may have hidden dependencies on `_source`/`_sourceId`/`_name`/`_managedKey`.  
  -> **Mitigation:** Run the full `attributeService` and `velocityAccountSnapshot` test suites; fix any failing mocks.
- **[Risk]** Removing the misleading test reduces coverage for the "origin mismatch" scenario.  
  -> **Mitigation:** Existing tests already cover `$account` resolution with valid and missing origin snapshots; no new test is needed because the `_id` path is gone.
- **[Trade-off]** This is a breaking change for any remaining legacy snapshot consumers, but it aligns the code with the documented canonical shape and removes technical debt.

## Migration Plan

- Code changes are confined to:
  - `src/services/attributeService/attributeService.ts`
  - `src/utils/velocityAccountSnapshot.ts`
  - `src/services/attributeService/__tests__/attributeService.test.ts`
  - `src/utils/__tests__/velocityAccountSnapshot.test.ts`
  - `README.md`
  - `docs/guides/define.md`
  - regenerated `docs/index.md`
- No database migration or state transformation is required.
- Rollback: revert the commit and restore the fallback branches.

## Open Questions

- None. Scope was clarified to include all legacy flat keys (`_id`, `_source`, `_sourceId`, `_name`, `_managedKey`).
