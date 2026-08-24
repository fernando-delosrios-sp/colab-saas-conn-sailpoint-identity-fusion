## 1. Config and connector spec

- [x] 1.1 Add `AttributeMergeMode.MainAccount = 'mainAccount'` and `AttributeMergeMode.OriginAccount = 'originAccount'`; include both in `DefaultAttributeMergeMode`
- [x] 1.2 Set `connectorSpecInitialValues.attributeMerge` and `runtimeDefaults` to `AttributeMergeMode.MainAccount`
- [x] 1.3 Add Main account then Origin account as the first two options on both `attributeMerge` radios in `connector-spec.json`; keep Source name last on the per-attribute radio only
- [x] 1.4 Set `connector-spec.json` `initialValues.attributeMerge` to `mainAccount` (or sync via `scripts/sync-connector-spec-initial-values.cjs`)
- [x] 1.5 Keep `readSettings` missing-key fallback on runtime default; do not rewrite stored `"first"` / `"list"` / `"concatenate"` / `"source"`
- [x] 1.6 Treat unknown persisted `attributeMerge` values as First found so a future rollback does not crash (design migration item 5)

## 2. MappingService origin snapshot and merge

- [x] 2.1 Resolve origin snapshot in `MappingService` before the mapping loop (Identities identity bag when identity-origin; else managed row by `originAccount` key)
- [x] 2.2 Pass `originSnapshot` into `processAttributeMapping`; Origin account merge reads only that snapshot
- [x] 2.3 Main account merge reads `prioritizedAccount` if present, else `originSnapshot`; neither mode walks `sourceOrder`
- [x] 2.4 Keep First found, list, concatenate, Source name, and `$originSource` token on the existing paths

## 3. Tests (TDD)

- [x] 3.1 Test: Main account merge uses `mainAccount` snapshot when found (`helpers.test.ts` and/or `mapService.test.ts`)
- [x] 3.2 Test: Main account merge uses origin snapshot when `mainAccount` is unset; does not take a later source
- [x] 3.3 Test: Main account merge does not fall through when the chosen snapshot lacks the attribute
- [x] 3.4 Test: Origin account merge ignores `mainAccount` and uses origin
- [x] 3.5 Test: Origin account merge uses Identities identity bag for identity-origin Fusion accounts
- [x] 3.6 Test: Origin account merge pins `originAccount` key, not the first account on `originSource`
- [x] 3.7 Test: `readSettings` with no `attributeMerge` key yields `mainAccount`
- [x] 3.8 Test: stored `"first"` still First found (not substituted with Main account)
- [x] 3.9 Test: `$originSource` Source-name token still resolves to prioritized source name
- [x] 3.10 Run `npm test -- src/services/mappingService/__tests__/helpers.test.ts src/services/mappingService/__tests__/mapService.test.ts src/data/config/settings/` (adjust paths to the files that cover 3.1–3.9)

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test`
- [x] 4.2 All delta spec scenarios covered by named automated tests in section 3
- [x] 4.3 Run `npm run lint` (includes connector-spec help check)

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/configuration/mapping-attributes.md` — Main/Origin vs First found vs Source name; no-fallback; identity-origin vs managed-origin matrix
- [x] 5.2 Update `docs/configuration/mapping.md` — new radio values, order, default `mainAccount`
- [x] 5.3 Update `docs/glossary.md` to match ubiquitous-language terms (Main account merge, Origin account merge, origin snapshot; distinguish `$originSource` token)
- [x] 5.4 Update JSDoc on `AttributeMergeMode` / `AttributeMap.source` so `$originSource` is not described as Origin account merge

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via changelog-generator
- [x] 6.2 Confirm entry covers new radios, new-install default Main account, no migration of existing sources, and no-fallback behavior
