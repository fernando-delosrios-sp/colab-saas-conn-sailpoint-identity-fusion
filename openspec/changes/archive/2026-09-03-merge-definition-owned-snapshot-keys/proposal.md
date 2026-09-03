## Why

`cab5bcb` stopped Map from clearing Define outputs by filtering definition-owned names out of implicit candidate *collection*. That also suppressed the merge, breaking pass-through definitions — a Normal definition named `CRSID` with expression `$CRSID`. Define reads only `attributeBag.current`, so with nothing seeded the expression renders the unresolved literal and stores `$crsid`. Reproduced on `recordings/cambridge-sb/attributes`: emptying `normalAttributeDefinitions` makes the same Map invocation write `sailpoint-AB3398` from the Jackdaw origin snapshot. Operators configuring the documented default merge get a stale value with no error.

## What Changes

**Implicit Map candidates for Normal definition names**
- From: Every `normalAttributeDefinitions[].name` and `uniqueAttributeDefinitions[].name` is filtered out when implicit candidates are collected, so Map neither merges nor clears it
- To: A Normal definition name is an ordinary implicit candidate and merges under the global `attributeMerge` default when a live snapshot carries it; Unique definition names stay filtered at collection
- Reason: The previous change needed only the no-clear guarantee; filtering at collection took the merge with it and broke pass-through definitions
- Impact: **Behavior change.** Fusion accounts whose Normal definition names match a snapshot key start tracking that source again on refresh. Non-breaking for tenants with no such name collision

**Clearing definition-owned names**
- From: Never cleared, because never collected
- To: Never cleared, because the delete branch is suppressed for definition-owned names
- Reason: Preserve the `2026-08-28` guarantee — no transient hole for templates reading sibling definition outputs, no unique-value regeneration
- Impact: Non-breaking; same observable outcome by a different mechanism

**Vocabulary**
- From: Glossary states Map "neither merges nor clears" a definition-owned name, as one uniform rule
- To: The rule splits by definition kind — Normal names merge when present and never clear; Unique names neither merge nor clear. Glossary defines **pass-through definition**
- Reason: One sentence cannot cover both kinds once merge returns
- Impact: `openspec/specs/ubiquitous-language` + `docs/glossary.md`

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `mapping-service`: Normal definition names become implicit merge candidates; the definition-owned exclusion moves from candidate collection to the delete branch; Unique definition names remain excluded at collection
- `ubiquitous-language`: Definition-owned name splits by definition kind; adds pass-through definition

## Impact

- **Code:** `src/services/mappingService/mappingService.ts` (`isImplicitCandidateKey`, `collectImplicitCandidateKeys`, `applyMappedValue`); tests in `src/services/mappingService/__tests__/mapService.test.ts`
- **Specs:** deltas for `mapping-service` and `ubiquitous-language`. Inverts the existing scenario `Definition-owned name on a snapshot is not merged by Map`
- **Docs:** `docs/use-guides/configuration/mapping-attributes.md` (pass-through pattern), `docs/glossary.md`, `CHANGELOG.md`
- **Operations:** First refresh after upgrade re-merges Normal definition names that collide with a snapshot key; Cambridge `CRSID`, `COLLEGE_NAME`, `COLLEGE_ID`, `INST_NAME`, and transitively `UPN` recover
- **Out of scope:** Define evaluation and ordering, unique generation, explicit map rows, the control/overlay denylist, when Map runs, new connector-spec settings
