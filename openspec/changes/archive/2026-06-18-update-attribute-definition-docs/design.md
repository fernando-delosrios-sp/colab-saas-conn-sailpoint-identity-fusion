## Context

The attribute-definition documentation has drifted from the implementation in several places. The connector code in `src/services/attributeService/` is the source of truth — the docs need to catch up. Three documentation surfaces are affected:

1. `connector-spec.json` — inline help text shown in the ISC UI as `sectionHelpMessage` and `helpKey` strings. This is what users see while configuring the connector.
2. `README.md` — a quick-reference table for the Attribute Definition Settings section.
3. `docs/guides/define.md` — the full user guide, with a types-explained section and a per-attribute configuration table.

The `define.md` guide is the most accurate of the three (it already has `$isUnique`, the Velocity-directive skip, and the optional `Normalize.date` / `Normalize.phone` parameters). The `connector-spec.json` in-app help is the most out of date (missing `$isUnique`, missing `$originSource`, using the legacy flat-key snapshot notation). The `README.md` is structurally problematic because it describes UUID and Counter-based as separate "Attribute Type" values, which is not how the model works.

## Goals / Non-Goals

**Goals:**
- Make the in-app help (`connector-spec.json`) match what the code actually does.
- Make the per-attribute table in `README.md` reflect the actual Normal vs. Unique model and the correct `maxAttempts` default (20).
- Rewrite the type-by-type sections in `define.md` so UUID and incremental counter are described as sub-modes of Unique.
- Document `$isUnique(value)`, `$originSource`, the nested snapshot key convention, the `$sources.get()` access pattern, the `$counter` auto-append skip for Velocity directives, and the optional `$Normalize.date` priority / `$Normalize.phone` country parameters in the surfaces that lack them.
- Validate the JSON is still well-formed and the docs build cleanly.

**Non-Goals:**
- No code changes. This is a documentation-only change.
- No new capabilities, no behavior changes.
- No schema changes to `connector-spec.json` (only string content changes inside `helpKey` / `sectionHelpMessage`).
- No test changes (existing tests cover behavior, not docs).

## Decisions

1. **Single source of truth = connector code.** Whenever the documentation disagrees with the code, the documentation is what changes. The code is not modified.

2. **Edit `connector-spec.json` help strings carefully.** The schema validator (if any) cares about JSON structure, not string content. Help text changes need to preserve all existing HTML tags (`<strong>`, `<code>`, `<br>`) and the surrounding structure; only the prose changes.

3. **Use the nested snapshot key convention (`source.id`, `source.name`, `schema.id`, `schema.name`) as the primary form.** The legacy flat keys (`_source`, `_sourceId`, `_name`, `_managedKey`) are still resolved by `src/utils/velocityAccountSnapshot.ts:8-42` for backward compatibility, but the nested form is the canonical one in the implementation. Legacy keys can be mentioned in a parenthetical "legacy form" note if helpful, but the nested form is the default.

4. **Replace the "Attribute Type" column or rewrite its body in `README.md`.** Two options were considered:
   - **Option A: Remove the "Attribute Type" column entirely**, leaving only `Normal` and `Unique` to be implied by the section each definition lives in. Simpler table; less explanatory.
   - **Option B: Keep an "Attribute Type" column but list only `Normal` and `Unique`**, with a footnote that UUID and incremental counter are sub-modes of Unique.
   - **Decision:** Option B — keep the column for clarity, but make it accurate. The user still benefits from seeing at-a-glance which definitions have uniqueness semantics.

5. **Replace "UUID type" and "Counter-based type" sections in `define.md` with sub-mode sections under "Unique type".** This matches the model and removes the "any expression is ignored" myth for UUID mode.

6. **Preserve existing examples in `define.md`.** The `$isUnique` conditional example at lines 114-125 and the counter-prefix example at lines 162-169 are already accurate. They get folded into the new sub-mode sections.

7. **Validate the JSON via a Node one-liner** (`node -e "JSON.parse(...)"`) since there is no dedicated `validate` script for `connector-spec.json` in `package.json`. This is sufficient because the change is content-only.

8. **Run `npm run docs:prepare` to confirm the docs build** before considering the change complete.

## Risks / Trade-offs

- **Risk:** Editing help text in `connector-spec.json` could break the JSON structure if a quote or escape character is mishandled. -> **Mitigation:** Validate with `node -e "JSON.parse(require('fs').readFileSync('connector-spec.json','utf8'))"` before considering the change complete.
- **Risk:** Long help strings may be truncated by the ISC UI. -> **Mitigation:** Keep the prose tight; the existing strings already use `<br>` and `<strong>` to manage layout, so follow the same pattern.
- **Trade-off:** The "Attribute Type" column in `README.md` becomes a 2-value enum (Normal, Unique) rather than a 4-value enum. This loses some information density but gains accuracy. The footnote compensates.
- **Trade-off:** Removing the "UUID type" and "Counter-based type" sections from `define.md` is a structural change. Readers familiar with the old doc structure need to look under "Unique type" instead. The cross-reference is made explicit in the replacement sections.

## Migration Plan

This is a documentation-only change with no migration steps. The change rolls out as part of the next connector release that bundles updated `connector-spec.json` / `README.md` / `docs/guides/define.md`. No data migration, no API changes, no backout complexity beyond reverting the doc files.

## Open Questions

None.
