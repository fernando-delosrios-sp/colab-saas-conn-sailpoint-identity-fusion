## Why

The connector's default schema attribute names (`history`, `statuses`, `actions`, `accounts`, `missing-accounts`, `reviews`, `sources`, `mainAccount`, `originSource`, `originAccount`) are scattered across the codebase as bare string literals — about 30 call sites in 8 files. Three of them are already partially aliased as private `const`s in `src/services/attributeService/attributeService.ts` (`MAIN_ACCOUNT_ATTRIBUTE`, `ORIGIN_ACCOUNT_ATTRIBUTE`, `ORIGIN_SOURCE_ATTRIBUTE`). A typo at any call site (e.g. `'missing-accounts'` vs `'missingAccounts'`) silently breaks a `Set` lookup, a `bag[...]` write, or a schema attribute resolution, and the connector emits accounts with the wrong data with no compile-time signal. The string enum `StatusEntitlement` already locks the same kind of contract for status IDs; the default schema attribute names deserve the same treatment.

## What Changes

- Introduce a TypeScript `enum` named `FusionAttribute` (string-valued) in `src/data/schema.ts` with one member for every default schema attribute name in `fusionAccountSchemaAttributes` except `name` and `id`.
- Replace the string-literal references at every internal call site that reads, writes, or otherwise references a default schema attribute name with the matching `FusionAttribute` member.
- Remove the three private `const` aliases in `src/services/attributeService/attributeService.ts` (`MAIN_ACCOUNT_ATTRIBUTE`, `ORIGIN_ACCOUNT_ATTRIBUTE`, `ORIGIN_SOURCE_ATTRIBUTE`) and inline the enum members at the use sites.
- Add a contract test that asserts the enum's string values are present in the `fusionAccountSchemaAttributes` array, so the two cannot drift.
- Do **not** include `name` and `id` in the enum. They double as the structural `identityAttribute` and `displayAttribute` defaults in the dynamically built schema and as the SDK's built-in identity/display attribute keys; referencing them via the enum would conflate "schema attribute name" with "SDK structural key", and the few places they appear as schema defaults are already structurally adjacent to other `displayAttribute` / `identityAttribute` literals that are out of scope for this change.

## Capabilities

### New Capabilities

- `fusion-schema-attribute-names`: A typed enum that names every default Fusion schema attribute and is the single source of truth for those attribute names in production code.

### Modified Capabilities

- (None) — no spec-level requirement is changing; this is an internal refactor that hardens the existing contract.

## Impact

- **Affected code:**
  - Modified: `src/data/schema.ts` (add enum)
  - New: `src/data/__tests__/schema.test.ts` (contract test)
  - Modified: `src/model/fusionAccount.ts` (string literals become enum members)
  - Modified: `src/model/fusionAccountUtils.ts`
  - Modified: `src/operations/helpers/rebuildFusionAccount.ts`
  - Modified: `src/operations/helpers/buildDryRunPayload.ts`
  - Modified: `src/operations/helpers/dryRunHelpers.ts`
  - Modified: `src/services/attributeService/attributeService.ts` (replace literals and drop 3 module consts)
  - Modified: `src/services/schemaService/schemaService.ts` (replace `groupAttribute: 'actions'` literal)
- **Public API:** No change. Persisted `accounts` / `missing-accounts` / `statuses` / `actions` / `reviews` / `sources` / `history` / `mainAccount` / `originSource` / `originAccount` arrays round-trip as `string[]` with the same string values. `FusionAccount` public methods keep `string` parameters.
- **Dependencies / build:** None. Pure TypeScript refactor.
- **Verification:** `npm run lint`, `npm test`.
