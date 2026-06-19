## 1. Update `connector-spec.json` inline help

- [x] 1.1 Rewrite the Normal Attribute Definitions `sectionHelpMessage` to use the nested snapshot shape (`source.id`, `source.name`, `schema.id`, `schema.name`) and to add `$originSource` and the `$sources.get()` access pattern.
- [x] 1.2 Update the Normal Attribute Definition `expression` `helpKey` to mention the available helper objects and the `$account` vs. `$accounts[0]` distinction.
- [x] 1.3 Rewrite the Unique Attribute Definitions `sectionHelpMessage` to add `$isUnique(value)`, the `$counter` auto-append skip for Velocity directives, the optional `$Normalize.date` priority parameter, the optional `$Normalize.phone` country parameter, and an expanded `$Datefns` method list.
- [x] 1.4 Update the Unique Attribute Definition `expression` `helpKey` to mention `$isUnique(value)` and to clarify the `$counter` empty-first behavior.

## 2. Update `README.md` per-attribute definition table

- [x] 2.1 Change the "Attribute Type" column to list only `Normal` and `Unique`, with a footnote explaining that UUID (via `$UUID` in the expression) and incremental counter (via the `Use incremental counter?` toggle) are sub-modes of Unique.
- [x] 2.2 Change the documented default for `maxAttempts` from `100` to `20`.
- [x] 2.3 Mark the `Apache Velocity expression` field as required for the Unique type, and add a note that the expression must reference `$UUID` (for UUID mode) or `$counter` (for collision disambiguation) to produce a unique value.
- [x] 2.4 Mention `$isUnique(value)` in the Velocity context description for the Unique type.
- [x] 2.5 Update the prose note describing managed account snapshots to use the nested `source` / `schema` shape (in addition to or instead of the legacy `_id` flat key).

## 3. Update `docs/guides/define.md`

- [x] 3.1 Change the global settings table default for `Maximum attempts for unique Define generation` from `100` to `20`.
- [x] 3.2 Update the per-attribute definition table: change "Attribute Type" to list only `Normal` and `Unique` (with the same footnote as `README.md`); mark the expression field as required for the Unique type.
- [x] 3.3 Remove the standalone "UUID type" subsection under "Attribute types explained". Replace it with a "UUID sub-mode" subsection under the "Unique type" section that explains UUID generation via `$UUID` in the expression (and that the expression is required).
- [x] 3.4 Remove the standalone "Counter-based type" subsection. Replace it with an "Incremental counter sub-mode" subsection under the "Unique type" section that explains the `Use incremental counter?` toggle and the `Counter start value` field.
- [x] 3.5 Update the "Available data" table to use nested `source` / `schema` access (`$accounts[0].source.name`, `$accounts[0].schema.name`) instead of `_id` flat-key notation.
- [x] 3.6 Keep the existing `$isUnique` example (conditional candidate selection between formats) and the counter-prefix example, but move them into the new sub-mode subsections.

## 4. Verify

- [x] 4.1 Run `node -e "JSON.parse(require('fs').readFileSync('connector-spec.json','utf8'))"` to confirm `connector-spec.json` is still valid JSON.
- [x] 4.2 Run `npm run docs:prepare` and confirm the docs build succeeds.
- [x] 4.3 Spot-check the three updated surfaces (in-app help preview, `README.md` rendered table, `define.md` rendered guide) for layout regressions.
- [x] 4.4 Run `openspec validate update-attribute-definition-docs --type change --strict` to confirm the change validates.
