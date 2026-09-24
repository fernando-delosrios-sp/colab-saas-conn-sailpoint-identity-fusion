## 1. FusionRun claimed account retention

- [x] 1.1 Add claimed account retention store on `FusionRun` (keyed by managed account key) populated when `claimAccount` / identity bulk claim remove bodies from `managedAccountsById`
- [x] 1.2 Expose a rematerialization read accessor; ensure Match / uncorrelated sweeps do not treat retention as unfinished work
- [x] 1.3 Clear retention in `clearWorkQueue` and `clearManagedAccountState`
- [x] 1.4 Unit tests: claim retains attributes; clear empties retention; `get(key)` after claim still undefined on the work queue

## 2. FusionLayers rematerialization

- [x] 2.1 When live sources are required, materialize missing linked keys from claimed account retention after queue-backed materialization (`fusionLayers.ts` / `setManagedAccount` helpers)
- [x] 2.2 Keep once-per-invocation live-sources decision; amend comments/specs alignment so rematerialization from retention is allowed without resurrecting Match queue entries
- [x] 2.3 Ensure claim-only path still skips `attributeBag.sources` copy but still fills retention (via FusionRun claim)
- [x] 2.4 Unit / fusion-service tests: prior claim-only origin + new blend rematerializes both; authorized/`assembleAccount` merge onto claim-only-preprocessed account rematerializes linked keys; missing retention leaves only queue-backed snapshots

## 3. MappingService designated-snapshot unavailable

- [x] 3.1 Teach Main/Origin merge (`helpers.ts` / `processAttributeMapping`) to signal designated snapshot unavailable vs present-but-empty
- [x] 3.2 In `applyMappedValue` / vanished-key path (`mappingService.ts`), preserve `attributeBag.current` on unavailable; keep delete when snapshot present without the attribute
- [x] 3.3 Unit tests covering ADDED/MODIFIED mapping-service scenarios: unavailable preserves; present-without-attribute clears; Origin unavailable preserves; sibling cannot fill Main/Origin; revised vanished-key sibling scenario preserves under Main account default

## 4. Integration / Nadia regression

- [x] 4.1 Add a focused fusion/decision or scenario-style test that reproduces claim-only then same-run auto-merge: `firstname`/`lastname` (or equivalent Main-account maps) remain; Define `$sources` still sees origin snapshot for expressions like `employeeId`
- [x] 4.2 Optionally ground the fixture in `recordings/company24509-poc/nadia` step-10 shapes without requiring a full tenant replay in CI

## 5. Ubiquitous language tables

- [x] 5.1 Add glossary table rows for **Designated snapshot unavailable** and **Claimed account retention** when applying the ubiquitous-language delta (apply/archive will sync; ensure delta scenarios stay consistent)

## 6. Verification

- [x] 6.1 Confirm canonical test command: `npm test` (global Vitest suite); use targeted files under `src/model/__tests__/`, `src/services/mappingService/__tests__/`, and fusion-service decision tests while iterating
- [x] 6.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)

## 7. Documentation

- [x] 7.1 Add a short note in mapping / defining-attributes docs (for example `docs/use-guides/configuration/mapping-attributes.md` and/or `docs/reference/` Map–Define notes) that Map and Define need complete live snapshots when `needsRefresh` becomes true mid-run, and that claim-only rows rematerialize from retention
- [x] 7.2 Update inline JSDoc on FusionRun retention / FusionLayers rematerialization public surfaces if new accessors are exported
- [x] 7.3 No README getting-started change required unless operator-facing config is introduced (none planned)

## 8. Changelog

- [x] 8.1 Create or update changelog entry for this change via **changelog-generator** during apply
- [x] 8.2 Confirm entry covers user-visible fix: Fusion attributes no longer wiped after claim-only absorb followed by same-run merge
