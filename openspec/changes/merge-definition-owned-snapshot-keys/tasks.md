## 1. Unique names stay excluded; Normal names become implicit candidates

- [x] 1.1 Split definition-owned name collection so Unique names alone feed `isImplicitCandidateKey` / `collectImplicitCandidateKeys`; keep a full definition-owned set (Normal + Unique) for delete suppression (design D1, D2)
- [x] 1.2 Invert the existing test currently named like "Definition-owned name on a snapshot is not merged by Map" so `CRSID` writes from the live snapshot (`Normal definition name on a snapshot is merged by Map`)
- [x] 1.3 Test: Definition-owned name on a snapshot is not merged by Map — Unique `UID` stays the generated bag value when a snapshot also carries `UID`
- [x] 1.4 Confirm existing tests still pass: unique value preserved with no snapshot; explicit map wins over definition-owned exclusion; overlay/control keys stay non-candidates

## 2. Delete suppression on empty merge

- [x] 2.1 In `applyMappedValue`, skip `delete` when the attribute is definition-owned and `processAttributeMapping` yielded empty; still write when the merge yields a value (design D3)
- [x] 2.2 Test: Normal definition name in the bag with no snapshot occurrence is not deleted (`STUDENT_URL`)
- [x] 2.3 Test: removing a Normal definition row lets its leftover vanished key clear (`STAFF_URL`)
- [x] 2.4 Test: `onlyTargets` invocation does not merge a Normal definition name as an implicit candidate
- [x] 2.5 Update JSDoc on `mapAttributes` and `collectImplicitCandidateKeys` to match the split (Unique excluded at collection; Normal collected; both skip delete)

## 3. Ubiquitous language

- [x] 3.1 Update **definition-owned name** in `openspec/specs/ubiquitous-language/spec.md` Canonical Terms (and matching glossary requirement) so archive merge is a no-op conflict: Normal merges when present and never clears; Unique neither merges nor clears
- [x] 3.2 Add **pass-through definition** to Canonical Terms: Normal definition whose expression reads its own name; Define reads only the bag

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (do not pipe the suite to `tail`; redirect to a file if output is long)
- [x] 4.2 All delta spec scenarios covered by named automated tests in `src/services/mappingService/__tests__/mapService.test.ts`
- [x] 4.3 `npm run lint` clean (ESLint, connector-spec help check, knip)
- [x] 4.4 `openspec validate --all --json` all valid

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/configuration/mapping-attributes.md`: Normal definition names are implicit merge candidates; Unique names are not; pass-through pattern (`$CRSID`); vanished-key retain path still works via a Normal definition
- [x] 5.2 Update `docs/glossary.md`: **definition-owned name** split by kind; add **pass-through definition**
- [x] 5.3 `npm run lint:markdown` and `npm run lint:docs-guides` clean

## 6. Changelog

- [x] 6.1 Create changelog entry via changelog-generator covering the behavior change: Normal definition names merge again from snapshots; Unique names stay excluded; no-clear guarantee remains
- [x] 6.2 Confirm the entry names both modified capabilities from proposal Capabilities (`mapping-service`, `ubiquitous-language`)
