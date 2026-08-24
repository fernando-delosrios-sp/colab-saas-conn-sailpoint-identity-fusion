## Why

Operators who want Fusion attributes to follow one account currently misuse **Source name** with `$originSource`. That token is source-level and follows the `mainAccount` source when set, not the immutable origin account Velocity calls `$account`. First found then walks every other source. There is no first-class way to pin mapping to the main account (falling back to origin) or to origin only, and neither policy can be the global default. New installs should default to Main account merge so mapped attributes stay with the representative account instead of source order.

## What Changes

**Main account and Origin account merge strategies**
- From: Global default is First found (`first`). Per-attribute radios are First found, list, concatenate, Source name. Account-level pin requires Source name + `$originSource`.
- To: Add **Main account** (`mainAccount`) and **Origin account** (`originAccount`) on both radios. Main account is first and the new-install default. Main account merge reads the `mainAccount` snapshot when found, otherwise the origin snapshot. Origin account merge reads the origin snapshot only. Neither walks other sources or sibling accounts when the snapshot is missing or has no value.
- Reason: Account-level pin matching `$account` / `mainAccount`, usable as a global default without a source text field.
- Impact: **Non-breaking** for existing sources (stored `attributeMerge` left as-is). **Behavior change for new installs** (default becomes Main account instead of First found).

**Unchanged**
- First found still checks `mainAccount` first then source order.
- List, concatenate, and Source name (including `$originSource` token) unchanged.
- Identity-type accounts still skip mapping.
- Velocity `$account` / `$originSource` / `$originAccount` unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mapping-service`: SHALL apply Main account and Origin account merge strategies (no fallback) using the origin snapshot and optional `mainAccount` snapshot.
- `ubiquitous-language`: Promote Main account merge, Origin account merge, and origin snapshot; distinguish them from the `$originSource` Source-name token.

## Impact

- `connector-spec.json` — radio options and order on global and per-attribute `attributeMerge`; `initialValues.attributeMerge` → `mainAccount`; sync via `scripts/sync-connector-spec-initial-values.cjs`
- `src/model/config.ts` — `AttributeMergeMode` + `DefaultAttributeMergeMode` include `mainAccount` and `originAccount`
- `src/data/config/settings/attributeMappingDefinitionsSettings.ts` — runtime/spec default
- `src/services/mappingService/` — resolve origin snapshot; Main/Origin merge in helpers; pass origin into `processAttributeMapping`
- `src/services/schemaService/schemaService.ts` — new modes remain single-valued (not List)
- Tests: `mappingService/__tests__/helpers.test.ts`, mapping service tests
- Docs: `docs/use-guides/configuration/mapping-attributes.md`, `docs/configuration/mapping.md`
- Changelog via changelog-generator at apply close
- No ISC config migration; no new dependencies
