## 1. Definition-owned name exclusion

- [x] 1.1 Add a private readonly set of definition-owned names to `MappingService`, built at construction from `config.normalAttributeDefinitions` and `config.uniqueAttributeDefinitions` entry names (trimmed, empty names skipped)
- [x] 1.2 Exclude definition-owned names when collecting implicit candidates, leaving explicit `attributeMaps[].newAttribute` targets unaffected
- [x] 1.3 Test: unique definition name in the bag with no snapshot occurrence is preserved
- [x] 1.4 Test: normal definition name in the bag with no snapshot occurrence is not deleted
- [x] 1.5 Test: definition-owned name present on a live snapshot is not written as an implicit map result
- [x] 1.6 Test: explicit attribute map for a definition-owned name still maps

## 2. Bag keys as implicit candidates

- [x] 2.1 Rename `collectUnmappedSnapshotKeys` to reflect the widened candidate set and add the `attributeBag.current` key union, keeping `IMPLICIT_KEY_DENYLIST` and the definition-owned exclusion applied to both key sources
- [x] 2.2 Confirm the candidate list stays per-invocation with no new MappingService instance state
- [x] 2.3 Test: attribute dropped by its origin source clears from `attributeBag.current`
- [x] 2.4 Test: attribute dropped by a record source clears
- [x] 2.5 Test: candidate still present on a live snapshot is merged, not cleared
- [x] 2.6 Test: clearing happens even when neither main nor origin snapshot was fetched this invocation
- [x] 2.7 Test: name whose definition row was removed clears

## 3. Preserved guards

- [x] 3.1 Test: `onlyTargets` invocation neither merges nor clears implicit candidates
- [x] 3.2 Test: Fusion account with no managed context keeps its persisted bag (`shouldPreserveCurrentWithoutContext`)
- [x] 3.3 Test: `needsRefresh` false still skips Map without cloning `attributeBag.current`
- [x] 3.4 Test: identity-origin account keeps a bag key backed by the Identities snapshot

## 5. Verification

- [x] 5.1 Confirm canonical test command: `npm test`
- [x] 5.2 All delta spec scenarios covered by named automated tests
- [x] 5.3 `npm run lint` clean (ESLint, connector-spec help check, knip)
- [x] 5.4 `openspec validate --all --json` all valid

## 6. Documentation

- [x] 6.1 Update `docs/use-guides/configuration/mapping-attributes.md` — implicit Map now clears names that left every contributing snapshot; how to retain a value (explicit mapping row or Normal definition)
- [x] 6.2 Update `docs/configuration/mapping.md` — implicit candidate set and the definition-owned exclusion
- [x] 6.3 Add **vanished snapshot key** and **definition-owned name** to `docs/glossary.md`; cross-reference from **unmapped snapshot key**
- [x] 6.4 Update JSDoc on `MappingService.mapAttributes` and the candidate-collection helper
- [x] 6.5 `npm run lint:markdown` and `npm run lint:docs-guides` clean

## 7. Changelog

- [x] 7.1 Create changelog entry via changelog-generator covering the behavior change and the retain-a-value migration path
- [x] 7.2 Confirm the entry names both modified capabilities from proposal Capabilities
