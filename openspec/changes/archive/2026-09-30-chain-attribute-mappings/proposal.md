## Why

Map reads each explicit attribute map only from live source snapshots, so a later map cannot use an earlier map's new attribute. Operators cannot build an owner or display name from generated aliases. On Orphan Account Management that left NHI ownership matching with empty values, skipped match rules, and no owner. Define already lets a later definition read an earlier one in list order. Map should do the same for explicit maps.

## What Changes

**Explicit attribute map lookup**
- From: every lookup name is resolved only from live snapshots, using the map's merge strategy.
- To: explicit maps run in configured order. A present prior mapped value for a lookup name is used and snapshots are not consulted for that name. A missing earlier value falls through to today's snapshot rules.
- Reason: generated aliases such as `NHI Admin` need to feed a later `Owner` map.
- Impact: non-breaking for maps whose lookup names are only raw snapshot attributes. Breaking when a lookup name collides with an earlier explicit map's new attribute that produced a value: the prior mapped value wins over the snapshot.

**Selective mapping**
- From: `onlyTargets` evaluates only the requested explicit maps.
- To: unchanged set of maps. A requested map sees prior mapped values only from earlier maps that this invocation also evaluated.
- Reason: unique registration must not grow into a hidden dependency walk.
- Impact: non-breaking.

**Implicit candidates and Define**
- From: implicit candidates use same-name snapshot lookup. Define reads the bag after Map.
- To: unchanged.
- Reason: the gap is between explicit maps, not between Map and Define.
- Impact: non-breaking.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mapping-service`: explicit maps read prior mapped values in configured order, for every merge strategy, without changing implicit candidates or selective target membership.
- `ubiquitous-language`: glossary defines **prior mapped value** and avoids "chain" for this behavior.

## Impact

- `src/services/mappingService/mappingService.ts` and `src/services/mappingService/helpers.ts`
- Mapping tests in `src/services/mappingService/__tests__/`
- `connector-spec.json` help text for Existing attributes, then the generated configuration reference
- `docs/use-guides/configuration/mapping-attributes.md` and `docs/glossary.md`
- Changelog entry during apply

No ISC API, schema, or tenant configuration migration. Existing `mainAccount` snapshot rewrite stays.
