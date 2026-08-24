## 1. Tests first (unmapped snapshot keys)

- [x] 1.1 In `src/services/mappingService/__tests__/mapService.test.ts`, add **Unmapped same-named key uses stored First found default**: two snapshots, no `department` map, `attributeMerge: 'first'`, expect `current.department` is First found. Fails until implicit merge lands.
- [x] 1.2 Add **Unmapped key uses Main account default**: origin `"Origin"`, main `"Main"`, no map, `attributeMerge: 'mainAccount'`, expect `"Main"`.
- [x] 1.3 Add **Unmapped Main account miss does not take a sibling snapshot**: main lacks `department`, sibling has `"Other"`, expect `department` not `"Other"` (cleared or absent per existing empty path).
- [x] 1.4 Add **Overlay and control keys are not implicit targets**: snapshot has `source` / `schema` / `IIQDisabled`; after map, `current` MUST NOT gain those keys from implicit merge.
- [x] 1.5 Add **Schema-only names are not mapping targets**: `current` has `cloudLifecycleState` from persist, no snapshot has that key, no map; Map MUST NOT evaluate it as a target (value unchanged, not cleared for “missing schema attr”).

**Verify**: 1.1–1.5 fail for missing implicit merge, not fixture errors.

## 2. Tests first (Identities snapshot + onlyTargets)

- [x] 2.1 Add **Origin resolves through the index for identity-origin**: identity-origin, bag `department: "HR"`, managed `"IT"`, Origin merge (mapped or unmapped), expect `"HR"`.
- [x] 2.2 Add **Main account can resolve to the Identities snapshot**: `mainAccount` = identity id, bag vs managed `department`, Main merge, expect identity value.
- [x] 2.3 Add **Managed-origin row indexes Identities when the bag is present**: managed-origin, non-empty identity bag, `mainAccount` = identity id, Main merge, expect identity value.
- [x] 2.4 Add **Selective map does not implicit-merge extra keys**: maps for `employeeId` plus snapshot `title`, `onlyTargets: ['employeeId']`; `title` unchanged.

**Verify**: 2.1–2.4 fail until Identities indexing / onlyTargets isolation land.

## 3. MappingService implementation (green)

- [x] 3.1 Register Identities in `sourceAttributeMap` and append to source order when `attributeBag.identity` is non-empty (not only when `originSource === Identities`). Index the bag under identity id in `buildSnapshotIndex` (or equivalent before index build).
- [x] 3.2 Resolve origin via `snapshotIndex.get(originAccountId)` once the identity is indexed; remove the origin-source special return if redundant. Keep Identity-kind early return.
- [x] 3.3 After explicit mapping targets (so `mainAccount` rewrite applies), compute unmapped snapshot keys: union of snapshot keys minus explicit `newAttribute` minus denylist (`FusionAttribute`, `id`, `name`, `source`, `schema`, `IIQDisabled`). Skip this when `onlyTargets` is set.
- [x] 3.4 For each implicit key, `buildAttributeMappingConfig(name, this.attributeMaps, this.attributeMerge)` and `processAttributeMapping` with the same write/delete/identity-fallback as explicit maps.
- [x] 3.5 Re-run `npx vitest run src/services/mappingService/__tests__/mapService.test.ts src/services/mappingService/__tests__/helpers.test.ts` until 1.x–2.x and existing mapping tests pass.

**Verify**: mapping tests exit 0.

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (global Vitest; do not pipe to `tail`)
- [x] 4.2 All delta spec scenarios covered by named automated tests in sections 1–2
- [x] 4.3 `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts` still maps only coincident unique targets
- [x] 4.4 `npm run lint` (do not pipe to `tail`)

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/configuration/mapping-attributes.md`: default merge applies to unmapped snapshot keys on refresh; not the full schema; Identities is a snapshot main/origin can name
- [x] 5.2 Update `docs/glossary.md` and `docs/concepts/glossary.md` for **unmapped snapshot key**, **Identities snapshot**, and origin snapshot as index lookup
- [x] 5.3 Run `npm run lint:docs-guides` and `npm run lint:markdown` after those doc edits

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via **changelog-generator** during apply (dated section, no Unreleased)
- [x] 6.2 Confirm the entry covers the refresh behavior change for unmapped same-named keys and Identities as a first-class snapshot
