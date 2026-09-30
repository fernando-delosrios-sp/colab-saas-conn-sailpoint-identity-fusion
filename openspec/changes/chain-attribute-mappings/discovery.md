## Scope

Explicit attribute maps are evaluated in configured order, and a later map can read the new attribute written by an earlier map in the same Map invocation. Dependency reordering, cycle detection, implicit-candidate chaining, and Define behavior are out.

## Language

**Prior mapped value** (`promote`):
The value an earlier explicit attribute map wrote during the same Map invocation, addressed by that map's new attribute name.
_Avoid_: mapping chain, chained mapping, derived attribute, chained definition

Conflict check: `openspec/specs/ubiquitous-language/spec.md` reserves **chain** for recording artifacts and forbids that word in new docs and help text when it means a recording. **Map**, **definition-owned name**, and **pass-through definition** stay as they are. A prior mapped value is not a definition and not a live snapshot attribute.

## Decisions

Context: On Orphan Account Management, `Owner` lists `NHI Admin` and `Identity Display Name`, and `displayName` lists generated names including a typo (`Identity DisplayName`). Map reads only live snapshots, so those names are missing, both match rules skip, and NHI machine accounts never receive an owner. Define already lets a later definition read an earlier definition's output in list order.

- Q1. Reorder maps by dependency, or keep configured order? → Configured order, same as Define. A map does not see a later map.
- Q2. Where does the earlier value live? → An invocation-local prior mapped value, not a copied snapshot and not MappingService instance state.
- Q3. If the name also exists on a live snapshot? → A present prior mapped value wins for that lookup name. Snapshots are not consulted for that name.
- Q4. If the earlier map wrote nothing? → That name is not a prior mapped value. Existing snapshot resolution applies, including designated-snapshot-unavailable preservation.
- Q5. Do source, list, concatenate, Main account, and Origin account merges see it? → Yes. Source filtering applies to live snapshots, not to a prior mapped value.
- Q6. Does `onlyTargets` pull in earlier maps that were not requested? → No. A requested map sees prior mapped values only from earlier maps evaluated in that same invocation.
- Q7. Do implicit candidates read prior mapped values? → No. They keep same-name snapshot lookup.
- Q8. Is the extra lookup a performance problem? → No, if the snapshot index is built once and each lookup name checks the prior mapped values before snapshots. Map already runs once per account, outside scoring.

## Open questions

None. Forward references stay unresolved on purpose and fall through to snapshots.

## Scenarios discussed

- `NHI Admin` from `adminDisplayName` on the NHI source, then `Owner` with First found reading `NHI Admin` before `Identity Display Name`.
- An earlier map that produces no value, so the later lookup still reads the live snapshot.
- A map listed first that names a new attribute defined further down the list: no prior mapped value, snapshot lookup only.
- Source-name merge whose existing attribute is a prior mapped value that is not on that source's snapshot.
- List or concatenate uses the prior mapped value once and does not also collect that same name from snapshots.
- Main account or Origin account merge uses a prior mapped value even when the designated snapshot is present and lacks that name. Without a prior mapped value, today's empty-snapshot and unavailable-snapshot rules stay.
- Selective map of `Owner` does not evaluate an unrequested `NHI Admin` map, so `Owner` does not see `NHI Admin`.
- An implicit `department` candidate still comes from snapshots when `department` is not an explicit map target.
- Duplicate `newAttribute` rows stay first-row-wins. The existing `mainAccount` rewrite still updates the snapshot chosen for later Main account merges.
