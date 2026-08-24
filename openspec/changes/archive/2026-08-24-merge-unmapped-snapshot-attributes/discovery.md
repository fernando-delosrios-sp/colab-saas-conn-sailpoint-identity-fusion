## Scope

In: **Map** (`MappingService.mapAttributes`) applying the global default merge to **unmapped snapshot keys** on live snapshots this invocation, and registering the **Identities** identity bag as a first-class snapshot so **mainAccount** / **originAccount** can resolve to an identity or a managed account without an origin-source fork. Out: Velocity **Define**, Match scoring, unique-attribute generation, walking the full Fusion schema, changing stored `attributeMerge` values, C4 diagrams.

## Language

**Map** (canonical — reuse):
Merging attributes from contributing snapshots into `fusionAccount.attributeBag.current`.
_Avoid_: “attributeService”.

**Origin snapshot** (canonical — reuse):
The snapshot whose key equals `originAccount`. For identity-origin that key is the Identities identity; after this change it is the same index lookup as any other snapshot.
_Avoid_: treating identity-origin as a second merge algebra.

**Main account merge** / **Origin account merge** (canonical — reuse):
Single-snapshot Map strategies; no fall-through when the chosen snapshot lacks a value.

**Unmapped snapshot key** (`draft` → `promote`):
An attribute name that appears on at least one live snapshot in this `mapAttributes` invocation and is not an `attributeMaps[].newAttribute` mapping target.
_Avoid_: “schema attribute”, “unmapped schema name” (those include the tenant-wide Fusion schema, which we do not walk).

**Identities snapshot** (`draft` → `promote`):
The identity bag registered in `sourceAttributeMap` / the snapshot-key index under the identity id, treated as another contributing account for Map.
_Avoid_: “identity extras”; “Identities is not a managed account”.

**Snapshot-key index** (canonical — reuse):
Per-invocation index from snapshot key and trimmed `_id` to the snapshot object.

## Decisions

Context: Runtime Map only evaluates `attributeMaps[].newAttribute`. Unmapped same-named values stay at create-time seed (origin or identity) across refresh. Operators expected the global default merge to apply without a mapping row. Walking every Fusion schema name would be expensive and would delete identity-only names when Main account points at a managed snapshot. Merge decisions already blend snapshots then run Map then Define once.

Q1: Apply global default to unmapped names how?
Chosen: **Union of keys on live snapshots this invocation**, not the full Fusion schema. Apply the same merge function as explicit maps (`processAttributeMapping` with `defaultAttributeMerge` and same-name lookup).

Q2: Where does that run?
Chosen: **MappingService** whenever `mapAttributes` runs without `onlyTargets` (full Map). Selective `onlyTargets` stays maps-only for those names (record unique registration must not expand).

Q3: Is identity-origin a different merge?
Chosen: **No.** Identities is another snapshot. Origin/main are pointers into the same index. Register the identity bag whenever it is present (not only when `originSource` is Identities) so a managed-origin row can also select Identities as main or origin if the key is set.

Q4: Empty implicit result (Main/Origin snapshot lacks the key)?
Chosen: **Same as explicit maps** — treat as empty; delete from `current` unless the existing identity-bag mapped fallback applies (`fusionAccount.isIdentity` and identity has the name). No special “keep identity extras” path.

Q5: Absorb this in Normal definitions?
Chosen: **No.** Define stays Velocity. Merge timing is already blend → Map → Define.

## Open questions

None. Assumed denylist for implicit keys: Fusion control attributes (`FusionAttribute`), Fusion identity/display `id` / `name`, and snapshot overlay fields (`source`, `schema`, `IIQDisabled`). Record in design.

## Scenarios discussed

- Two managed accounts share `department`, no mapping row; refresh applies stored default merge
- New-install default Main account refreshes unmapped keys from main, else origin
- Existing stored First found / List starts merging those keys (behavior change)
- Identity-origin Fusion row with linked managed accounts: Identities is in the snapshot set; main/origin may point at identity or managed
- Managed-origin row with identity bag present: Identities is indexed so main/origin *can* resolve to the identity id
- `onlyTargets` does not implicit-merge extra snapshot keys
- `FusionAccountKind.Identity` still skips Map (unchanged)
- Merge decision / auto-merge: one Map after blend; no second refresh

## Considered and rejected

- **Map every Fusion schema attribute** — rejected: cost scales with tenant schema; Main account would clear names never on the chosen snapshot.
- **Unmapped always Main account, ignore stored default** — cheaper but not the operator mental model; user chose follow-default if snapshot-key scoped.
- **Normal definitions / Velocity absorb same-name copy** — rejected: wrong layer; per-attribute template cost.
- **Keep unmapped static (maps-only)** — rejected: create-time values never refresh.
