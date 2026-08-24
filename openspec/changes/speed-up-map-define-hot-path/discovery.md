## Scope

In: CPU cost of **Map** (`MappingService.mapAttributes`) and **Define** (`DefinitionService.refreshNormalAttributes` / Velocity evaluation) on the shared **account assembly** recipe (`AccountAssembly.applyAttributeProcessing`). That recipe runs for Fusion-account refresh and for every `assembleManagedAccount` call (Match pre-score and `scoreIdentityCandidates`). Out: MatchingService scoring/trigram, unique-attribute generation locks and collision loops, `refreshUniqueAttributes`, reverse-correlation attribute writes beyond not regressing them, LogService global early-return for all callers, splitting Map/Define off the match scoring concurrency cap, schema-wide mapping targets that are not in `attributeMaps`, C4 diagrams.

## Language

**Account assembly** (canonical — reuse):
`AccountAssembly` recipe that applies Map then Normal Define then reverse-correlation attributes (`openspec/specs/account-assembly/spec.md`).
_Avoid_: “attributeService”; use MappingService / DefinitionService.

**Map** (canonical — reuse):
`MappingService.mapAttributes` merging managed source snapshots into `fusionAccount.attributeBag.current`.

**Define** (canonical — reuse):
`DefinitionService` Velocity evaluation for Normal (this change) and Unique (out of scope except shared `evaluateVelocityTemplate`).

**Current attribute bag** (canonical — reuse):
`FusionAccount.attributeBag.current`, also exposed as `FusionAccount.attributes`.

**Snapshot-key index** (`draft` → `promote`):
A per-`mapAttributes` invocation `Map` from `getManagedAccountSnapshotKey(account)` and trimmed `_id` to the snapshot object, used to resolve origin/main accounts. Not stored on MappingService (stateless between invocations — `openspec/specs/mapping-service/spec.md`).
_Avoid_: a service-level cache of snapshots across Fusion accounts.

## Decisions

Context: Fusion account building calls Map then Normal Define once per assembled account. Templates are already compiled (`templateCache` in `formatting.ts`; archived `velocity-context-optimization` already collapsed render-context allocation to one `Object.assign`). Remaining cost is repeated per-account work: cloning the current bag, rebuilding mapping target lists, scanning all snapshots for origin/main, rebuilding Velocity context by spreading current, awaiting sync Define work, and unconditional debug string building (including SDK `logger.debug` inside every template render).

Q1: Change Match to skip Define for scoring?
Chosen: **No.** Match attributes often come from Normal definitions. Skipping Define would change scores. Optimize Map/Define themselves; do not change `assembleManagedAccount` call sites.

Q2: Object-pool render contexts across accounts?
Chosen: **No.** MappingService/DefinitionService are shared across concurrent operations (`mapping-service` / `definition-service` stateless requirements). Pooling a module-level object would race across interleaved async work. Per-account context is required.

Q3: Put Velocity helpers on a non-null prototype to avoid copying them?
Chosen: **No.** Living spec `definition-service` “Velocity render context uses null prototype and merged helpers” requires `Object.getPrototypeOf(renderContext) === null` and helper-over-context precedence. Keep `Object.assign(Object.create(null), context, contextHelpers)`. Cut cost by not cloning `attributeBag.current` when building DefinitionService’s caller context, and by removing per-render debug logs.

Q4: Map every schema attribute (living `mapping-service` wording) to “fix” spec/code drift?
Chosen: **No.** Runtime only maps `attributeMaps[].newAttribute`. Mapping schema attributes that have no maps would add work and is a product/spec conflict, not a performance fix.

## Open questions

None.

## Scenarios discussed for specs

- MappingService resolves origin and main snapshots via a per-invocation snapshot-key index
- MappingService does not clone the current bag when mapping is skipped and history is empty
- Lookup attribute names for a mapping target are computed once at MappingService construction
- DefinitionService does not shallow-copy current attributes into the Velocity caller context
- `evaluateVelocityTemplate` does not emit debug logs on every render
- `refreshNormalAttributes` does not await a Promise per Normal definition

## Considered and rejected

- **Skip Normal Define on `assembleManagedAccount` for Match** — rejected: match fields are often defined attributes; would change Match outcomes.
- **Reusable pooled Velocity render context** — rejected: concurrent operations share DefinitionService.
- **Helpers on prototype instead of null-proto merge** — rejected: conflicts with `definition-service` null-prototype requirement.
- **Rewrite LogService.debug to no-op when level is info** — high leverage but out of scope (touches every debug caller). This package only stops hot-path Map/Define debug work.
- **Expand mapping targets to all schema attributes** — rejected: spec/code drift; would slow Map.
