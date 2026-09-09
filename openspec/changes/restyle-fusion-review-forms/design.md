## Context

`formBuilder` builds one ISC Custom Forms definition per managed account: TEXT fields for configured attributes and scores, a SEARCH_V2 identities SELECT (`id:… OR id:…` baked in), and conditions that hide other candidate sections. The Fusion review email already presents the same match as a colored score table with identity and account links (`UrlContext`). SoD Custom Forms (saas-custom-operations) show DESCRIPTION elements interpolate `{{$.form.input.*Html}}` and render inline-styled HTML.

This change restyles the whole review form to that email look while keeping per-account definitions and using **Reset forms?** as the only recut for in-flight reviews.

## Goals / Non-Goals

**Goals:**

- Match review-email visual language on the entire form (header, account context, attributes, all candidates, links, row colors)
- Keep toggle + identities SELECT as the only interactive decision controls
- Keep per-account definition naming and SEARCH_V2 candidate query
- **Reset forms?** closes in-flight Fusion reviews so rematch issues restyled instances
- Localization still uses `resolveFormLocale` (`defaultLanguage` only)

**Non-Goals:**

- One shared form definition for all Fusion reviews
- Individual-account review reset
- Auto-patch or replace still-pending definitions on aggregation
- Changing match scoring, reviewer assignment, or decision processing keys (`account`, `name`, `source`, `candidates`, `identityId`, toggle, SELECT)

## Decisions

### D1: Display surface is DESCRIPTION HTML, not TEXT

- **Choice**: Render display content as DESCRIPTION elements. Launch-time formInput supplies HTML strings (account panel, candidate score tables). Definition `description` may interpolate `{{$.form.input.<key>}}`.
- **Reason**: TEXT cannot color, tabulate, or link. SoD verified DESCRIPTION HTML in tenant rendering (Aug 2026).
- **Considered alternatives**: COLUMN_SET of TEXT fields (no color/links); static HTML only in the definition (bloats per-account definitions further; harder to share email table markup).

### D2: Native controls stay outside HTML

- **Choice**: `newIdentity` TOGGLE and identities SEARCH_V2 SELECT remain form elements. HTML wraps context around them; it does not replace them.
- **Reason**: Decisions and SEARCH_V2 cannot live in DESCRIPTION. Processor already keys off those elements.
- **Considered alternatives**: STATIC SELECT of candidates (loses search UX); HTML-only “buttons” (not submitable).

### D3: Email score table, all candidates visible

- **Choice**: One candidate HTML block listing every form candidate. Columns: attribute, value, algorithm, threshold, result, score. Row colors: match `#f0fdf4`, miss `#fef2f2`, fusion/average `#e0f2fe`. Links `#0b5cab`. Drop per-candidate HIDE conditions (and the TEXT disable-when-not-empty rules that exist only for display fields).
- **Reason**: Same comparison as email; hide-on-select fought a single HTML blob and added conditions.
- **Considered alternatives**: Keep hide-on-select (needs per-candidate sections); two-column attribute/score only (less information than email).

### D4: Per-account definitions remain

- **Choice**: Keep `buildFormName` and SEARCH_V2 query baked with candidate ids. Do not target one tenant-wide definition.
- **Reason**: SEARCH_V2 query interpolation is unproven. Operator still needs a named definition per account for Reset forms to delete the right set by pattern.
- **Considered alternatives**: Single seed + interpolated search query (deferred); open-ended identity search without id filter (product change).

### D5: HTML builders live in formService; visual tokens copied from email

- **Choice**: New helpers under `src/services/formService/` (escape, account/identity anchors via existing `createUrlContext` / `UrlContext`, score table). Copy email color tokens; do not compile Handlebars into the form.
- **Reason**: formService already owns definition composition. Email templates stay email. Avoid a cross-service Handlebars dependency.
- **Considered alternatives**: Shared module used by email and forms (larger refactor, out of scope); embed Handlebars partials in formInput (wrong runtime).

### D6: Reset forms closes in-flight reviews; no pending migration

- **Choice**: New form definitions after deploy use the restyle. Existing pending instances are untouched. **Reset forms?** (`deleteExistingForms`) MUST leave no open Fusion review instances for matching definitions: delete definitions, and if ISC leaves instances, cancel or delete them in the same Setup pass. Then aggregation continues so those accounts rematch.
- **Reason**: Operator asked to update global Reset forms only; not to auto-refresh in-flight definitions; not to add per-account reset.
- **Considered alternatives**: Patch pending definitions in place (risk to in-progress reviewers; rejected); per-account reset (deferred).

### D7: HTML is escaped; missing URLs fall back to text

- **Choice**: All interpolated attribute values, names, and labels are HTML-escaped. Anchors only when `UrlContext` returns a URL (identity details, human-account). `target="_blank"` `rel="noopener noreferrer"`.
- **Reason**: Same safety as SoD `escapeHtml` / `renderIscUiLink`.
- **Considered alternatives**: Unescaped email `{{{ }}}` style (unsafe in forms).

## Risks / Trade-offs

- [Risk] ISC sanitizes DESCRIPTION HTML (strips tables or anchors) → Mitigation: keep markup in the SoD-verified set (`<p>`, `<table>`, `<a>`, `<span style>`, `<strong>`); screenshot-test on a tenant during apply if needed
- [Risk] Large HTML formInput at `fusionMaxCandidatesForForm` = 15 → Mitigation: cap is already 15; keep tables compact (email font sizes); fail create with a clear log if ISC rejects payload size
- [Risk] Definition delete does not close inbox instances → Mitigation: Reset forms also cancels/deletes remaining instances (D6)
- [Trade-off] Per-account definitions still proliferate → Reason: SEARCH_V2 and reset-by-name-pattern; single-form deferred
- [Trade-off] In-flight reviews look old until Reset forms → Reason: no silent mutation of open reviews
- [Trade-off] Reviewers always see every candidate → Reason: matches email; SELECT still picks one identity

## Migration Plan

1. Deploy connector with restyle. New reviews get the new layout. In-flight reviews unchanged.
2. Operators who want a consistent inbox enable **Reset forms?** for one persistent aggregation (not dry-run). Flag auto-disables. Rematch creates restyled instances.
3. Rollback: revert connector; remaining new-style definitions persist until Reset forms or stale cleanup. No schema/API migration.

Acceptance: new review form HTML matches email tables/links/colors; toggle and SELECT still submit decisions; **Reset forms?** on a persistent run closes matching Fusion reviews and those accounts can receive new forms on the same run; dry-run does not delete forms.

## Open Questions

None blocking. Deferred: SEARCH_V2 interpolation / single definition; individual review reset.
