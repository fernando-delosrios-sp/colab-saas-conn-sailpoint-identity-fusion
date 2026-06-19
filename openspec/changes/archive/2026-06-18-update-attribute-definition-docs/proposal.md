## Why

The attribute-definition help text in `connector-spec.json`, the per-attribute table in `README.md`, and the dedicated guide in `docs/guides/define.md` have drifted from the actual implementation. Several details are misleading users configuring Identity Fusion NG:

- The inline help still describes account snapshots with the legacy flat keys (`_name`, `_source`, `_sourceId`, `_nativeIdentity`) instead of the nested `source`/`schema` shape that has been the canonical structure for some time.
- `README.md` and `define.md` describe **UUID** and **Counter-based** as separate attribute types, but the model (`UniqueAttributeDefinition` in `src/model/config.ts:91-112`) only has two UI sections: Normal and Unique. UUID and incremental counter are sub-modes of Unique (via `$UUID` reference and the `useIncrementalCounter` toggle).
- The `maxAttempts` default is documented as `100` in `README.md:141-142` and `define.md:23`, but the actual default is `20` (see `src/data/config/settings/uniqueAttributeDefinitionsSettings.ts:7` and the `connector-spec.json` helpKey that already says `Default: 20`).
- The `$isUnique(value)` helper (a significant feature for conditional candidate selection in unique definitions) is mentioned only in `define.md` and is absent from the in-app `connector-spec.json` help and the `README.md`.
- `$originSource`, `$sources.get(...)` access pattern, the `$counter` auto-append skip for Velocity directives (`#if`/`#set`/`#end`), and the optional `$Normalize.date` priority and `$Normalize.phone` country parameters are all missing from the in-app help.

This change brings all three documentation layers in sync with the real behavior, removes the UUID/Counter-based "type" fiction, and surfaces the `$isUnique` helper to users configuring the connector.

## What Changes

1. **Update inline help in `connector-spec.json`** (Normal and Unique sections):
   - Replace legacy `_name`/`_source`/`_sourceId`/`_nativeIdentity` notation with the nested `source.name` / `source.id` / `schema.name` / `schema.id` structure.
   - Add `$originSource` to the documented context variables.
   - Explain that `$sources` is a Map — use `$sources.get('HR')` (not `$sources.HR`).
   - Add the `$isUnique(value)` helper to the Unique section help and the unique-expression helpKey.
   - Add the `$counter` auto-append caveat: skipped when the expression contains Velocity directives (`#if`/`#set`/`#end`).
   - Document the optional `$Normalize.date` priority and `$Normalize.phone` default-country parameters.
   - Expand the `$Datefns` method list.
2. **Fix `README.md` Attribute Definition table** (`:131-177`):
   - Remove the "Attribute Type" column or rewrite it so that UUID and Counter-based are described as Unique sub-modes (use `$UUID`, toggle `useIncrementalCounter`).
   - Change `maxAttempts` default from `100` to `20`.
   - Mark the expression as **required** for Unique definitions (UUID mode still requires `$UUID` in the expression; "no expression needed" is a fiction).
3. **Rewrite the type-by-type sections in `docs/guides/define.md`**:
   - Replace the "UUID type" and "Counter-based type" sections with sub-mode sections under "Unique type".
   - Fix `maxAttempts` default to `20`.
   - Replace legacy `_id` notation in the available-data table with nested `source`/`schema` references.
4. **No code changes** — this is a documentation-only change.
5. **Validate** the JSON still parses and the docs build cleanly.

## Capabilities

### New Capabilities
- `attribute-definition-documentation`: Captures the documentation-accuracy requirements for attribute-definition help text and guides — the in-app `connector-spec.json` help, the per-attribute table in `README.md`, and the full guide in `docs/guides/define.md`. The spec describes what each documentation surface must say about Velocity context, helper methods, the `$isUnique` helper, the `$counter` auto-append rules, the legacy/nested snapshot key convention, and the `maxAttempts` default.

## Impact

- `connector-spec.json` — inline help text (no schema change; only `helpKey` / `sectionHelpMessage` strings).
- `README.md` — Attribute Definition Settings section.
- `docs/guides/define.md` — full user guide.
- No source-code or unit-test changes. No runtime behavior changes.
- Verification: `node -e "JSON.parse(require('fs').readFileSync('connector-spec.json','utf8'))"` to confirm JSON validity, plus `npm run docs:prepare` to confirm docs build.
