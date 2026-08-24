## Scope

In: two new Map merge strategies — **Main account** (new-install default, first radio) and **Origin account** — on both the global Default attribute merge radio and the per-attribute override radio; account-snapshot resolution with no fallback; docs, connector-spec, types, MappingService, and SchemaService cardinality. Out: migrating existing stored `attributeMerge` values; changing First found / list / concatenate / Source name behavior; changing Velocity `$account` / `$originSource` / `$originAccount`; renaming or removing the `$originSource` Source-name token; Define-step evaluation; Match.

## Language

**Main account merge** (`draft` → `promote`):
A Map merge strategy that reads mapped attribute values from a single snapshot: the `mainAccount` managed account when that key is present and found this run, otherwise the origin snapshot. Stored config value `mainAccount`.
_Avoid_: “Origin source merge”; “prioritized source”; treating this as First found with a head start.

**Origin account merge** (`draft` → `promote`):
A Map merge strategy that reads mapped attribute values from the origin snapshot only (`originAccount` / Identities identity bag). Ignores `mainAccount`. Stored config value `originAccount`.
_Avoid_: “Origin source” as the radio label; `$originSource` token as a synonym.

**Origin snapshot** (`draft` → `promote`):
The account object Mapping uses for Origin account merge (and as Main account merge’s fallback). Managed origin: the bag row whose key equals `originAccount`. Identity origin (`originSource` = Identities): the identity bag already injected as source `Identities`. Same object Velocity exposes as `$account`.
_Avoid_: “origin source accounts” (plural); first account on `originSource`.

**No-fallback account merge** (`draft`):
When the chosen snapshot is missing or has no value for the mapped attributes, the Fusion attribute is left empty. Other sources and sibling accounts on the same source are not consulted.
_Avoid_: “prefer then fall through.”

**$originSource token** (canonical — reuse, do not conflate):
Existing Source-name field token that resolves to the prioritized/`mainAccount` **source name**, then takes the first account on that source. Unchanged. Not Origin account merge.
_Avoid_: documenting the new radios as this token.

## Decisions

Context: operators pin attributes with Source name = `$originSource`. That is source-level and actually follows `mainAccount`’s source, not immutable origin. They wanted a first-class option, then split it into two account-level strategies.

Q1: Fallback if the chosen snapshot has no value?
Chosen: **no fallback.** Empty attribute.

Q2: Which snapshot?
Chosen: **two radios** — Main account (defaults to origin snapshot when `mainAccount` is unset or not found) and Origin account (origin snapshot only). Keep First found, list, concatenate, Source name.

Q3: Surfaces?
Chosen: **both** — global Default attribute merge and per-attribute Attribute Merging Settings. Source name remains per-attribute only (needs the source text field).

Q4: Existing sources?
Chosen: **leave stored values.** New installs default to Main account. Existing `"first"` (and others) stay.

Q5: Default and radio order?
Chosen: **Main account first and default** on both radios, then Origin account, then existing options.

Q6: Source vs account grain?
Chosen: **account snapshot**, not “all accounts from origin/main source.” Distinct from Source name.

## Open questions

None. Persisted enum values assumed `mainAccount` and `originAccount` (match schema attribute names). If connector-spec radio values must stay short like `first`/`source`, apply may use `main`/`origin` and map in `readSettings` — same UI labels.

## Scenarios discussed

- Managed origin, `mainAccount` unset: both new modes use the creating managed account; Origin and Main agree.
- Managed origin, `mainAccount` = later-correlated AD account: Origin stays Workday origin; Main uses AD; missing AD attribute → empty (not Workday).
- Identity origin, `mainAccount` unset: both modes use the Identities identity bag.
- Identity origin, `mainAccount` = managed row: Origin stays identity; Main uses that managed row.
- Origin snapshot missing this run (missing-accounts / not in bag): empty.
- Multiple accounts on the origin source: Origin account uses the specific `originAccount` key, not the first account on that source.
- First found still checks `mainAccount` first then walks source order (unchanged).
- Identity-type Fusion accounts still skip mapping (unchanged).
- `$originSource` token on old Source name cards unchanged.

## Considered and rejected

- **Single “Origin source” radio** — rejected: conflates origin vs main; source-level not account-level.
- **Promote `$originSource` token as the default** — rejected: token is source-of-main, not origin account; cannot be a global default without a source field.
- **Migrate existing `"first"` to Main account** — rejected: leave existing sources.
- **Fall through to source order when snapshot empty** — rejected: would duplicate First found.
