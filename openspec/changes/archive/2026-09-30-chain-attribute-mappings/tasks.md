## 1. Prior mapped values

- [x] 1.1 In `mapAttributes`, evaluate explicit maps in `attributeMaps` order and record a prior mapped value only when that map produces a value. Keep the record local to the invocation. Do not record an empty result or designated snapshot unavailable, and do not store it on MappingService.
- [x] 1.2 Pass that record into explicit-map lookup. When a lookup name has a prior mapped value, use it and do not read snapshots for that name. Keep the account-major walk for every other name.
- [x] 1.3 Honor the prior mapped value for First found, Source name, list, concatenate, Main account, and Origin account. Source filtering applies only to snapshots. List and concatenate include the prior value once and omit snapshot values for that same name.
- [x] 1.4 Leave `onlyTargets` membership, implicit candidates, snapshot cloning, and the once-per-invocation snapshot-key index unchanged. An unrequested earlier map contributes no prior mapped value.

## 2. Tests

- [x] 2.1 Add mapping tests for: a later map reading an earlier new attribute; a missing earlier value falling through to the snapshot; a forward reference not seeing a later map; a prior mapped value winning over the same snapshot name.
- [x] 2.2 Add mapping tests for Source name, list, Main account when the designated snapshot lacks the name, and Origin account when the origin snapshot is unavailable.
- [x] 2.3 Add mapping tests for: `onlyTargets` not evaluating an unrequested predecessor; an implicit `department` candidate staying on the snapshot; First found still preferring `mail` on the earlier account over `email` on a later account; a second `mapAttributes` call not seeing the previous invocation's prior mapped value.
- [x] 2.4 Keep the existing `mainAccount` rewrite test and the current no-prior-value Main account and Origin account preserve/clear tests passing.

## 3. Verification

- [x] 3.1 Confirm the canonical test command is `npm test`. Run `npx vitest run src/services/mappingService/__tests__/mapService.test.ts src/services/mappingService/__tests__/helpers.test.ts` for this change.
- [x] 3.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)

## 4. Documentation

- [x] 4.1 Update `docs/use-guides/configuration/mapping-attributes.md` so explicit maps run in list order, a later map can read an earlier new attribute, a prior mapped value wins over a snapshot of the same name, and a selective map does not pull unrequested earlier maps. Do not call this a mapping chain.
- [x] 4.2 Update the Existing attributes `helpKey` in `connector-spec.json`, then regenerate `docs/configuration/mapping.md` with `node scripts/generate-config-docs.cjs`.
- [x] 4.3 Add **prior mapped value** to `docs/glossary.md`, distinct from a live snapshot attribute, a definition-owned name, and a pass-through definition.

## 5. Changelog

- [x] 5.1 Create or update the changelog entry for this change with **changelog-generator**
- [x] 5.2 Confirm the entry covers ordered explicit attribute maps and prior mapped values
