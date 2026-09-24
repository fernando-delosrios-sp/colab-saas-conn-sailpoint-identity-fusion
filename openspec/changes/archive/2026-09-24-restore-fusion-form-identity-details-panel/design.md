## Context

Fusion review forms (`formBuilder` + `formHtml`) already render the managed account as DESCRIPTION HTML (`accountHtml`: header, source, human-account link, form-attributes table) and all identity candidates as one stacked score-table blob (`candidatesHtml`). Interactive controls remain `newIdentity` TOGGLE and identities SEARCH_V2 SELECT. `buildFormConditions` returns `[]`. Pre-restyle HIDE rules compared the SELECT to `resolveIdentitiesSelectLabel` (aligned with `Candidate.name` after enrichment). Reviewers lost the selected-identity form-attributes view that used to follow that dropdown.

This change stays inside `form-service`. ISC Custom Forms still evaluate conditions client-side.

## Goals / Non-Goals

**Goals:**

- Show an identity details DESCRIPTION for the identity currently selected in the identities SELECT
- Match the account context panel’s attribute table (same form-attribute names, two-column table, visual tokens, UrlContext identity link)
- Hide that panel when nothing is selected or when the new-identity / no-match toggle is on
- Keep stacked candidate score tables always visible
- Keep decision processing keys, SEARCH_V2 query, and per-account definition naming unchanged

**Non-Goals:**

- TEXT fields for attributes or scores
- Hiding score tables based on SELECT
- Disabling the SELECT when the toggle is on (not required to restore the panel)
- Migrating in-flight form instances (Reset forms remains the recut)
- One shared form definition; SEARCH_V2 query interpolation

## Decisions

### D1: Identity details are a separate surface from score tables

- **Choice**: Keep `candidatesHtml` as one always-visible score-table block. Add per-candidate identity details HTML (link + form-attributes table).
- **Reason**: Restyle D3’s comparison view stays; the missing piece is account-vs-identity attributes for the chosen identity.
- **Considered alternatives**: Hide entire candidate HTML on SELECT (loses side-by-side scores); put attributes into the score table only (already has a value column, but not the full form-attribute set and not tied to selection).

### D2: DESCRIPTION HTML, not TEXT

- **Choice**: Reuse `renderAttributeTable` / `renderIscUiLink` tokens from `formHtml.ts`. New helper `renderIdentityDetailsHtml(candidate, fusionFormAttributes, locale, urlContext)`.
- **Reason**: Same look as the account context panel; stay inside the restyle HTML contract.
- **Considered alternatives**: Restore TEXT rows (rejected in restyle); duplicate account header chrome on the identity panel (too noisy under the SELECT).

### D3: Safe per-candidate formInput keys by list index

- **Choice**: Launch-time keys `identityHtml0` … `identityHtmlN-1` in candidate list order (already combined-score descending). Element ids `identityDetails0` … `identityDetailsN-1`. Interpolate `{{$.form.input.identityHtmlN}}`.
- **Reason**: Identity UUIDs contain hyphens; `{{$.form.input.identityHtml_<uuid>}}` is unsafe in JSONPath. Index keys match `accountHtml` / `candidatesHtml` style.
- **Considered alternatives**: Slug the UUID; one concatenated HTML blob with impossible client-side hide (Custom Forms cannot slice a blob).

### D4: HIDE conditions on SELECT label and newIdentity

- **Choice**: One condition per candidate: `ruleOperator: OR` of (1) identities SELECT `NE` that candidate’s `name` (the identities-SELECT primary label) (2) `newIdentity` `EQ` true. Effect: `HIDE` `identityDetailsN`. `valueType` STRING for the SELECT label; BOOLEAN for the toggle, matching pre-restyle Custom Forms rules.
- **Reason**: Empty SELECT does not equal any candidate name, so NE hides all panels. Toggle-on hides the panel even if a SELECT value lingers. `resolveIdentitiesSelectLabel` / enrichment already keep `Candidate.name` aligned with SEARCH_V2 `attributes.displayName`.
- **Considered alternatives**: SHOW-when-EQ only (ISC effects are HIDE/DISABLE); compare identity id (SELECT value is id but displayed label is what conditions historically compared — keep the proven display-name comparison).

### D5: Place the panel in identitiesSection under the column set

- **Choice**: Append the N DESCRIPTION elements to `identitiesSection` after `decisionsColumnSet`. Leave `displaySection` as account + scores.
- **Reason**: The dropdown and the panel it drives sit together.
- **Considered alternatives**: Between account and scores (weaker coupling to SELECT); replace scores (out of scope).

### D6: Heading uses existing `form_candidate_details`

- **Choice**: Identity panel heading is `translateWithParams('form_candidate_details', locale, { name })` (already in all ten locales). No new locale keys unless extra chrome is needed.
- **Reason**: Key already exists from pre-restyle; localization coverage requirement stays satisfied.
- **Considered alternatives**: New `form_identity_details` key (unnecessary churn).

### D7: New definitions only

- **Choice**: Do not patch pending instances. Operators recut with **Reset forms?** as today.
- **Reason**: Same restyle migration rule; avoid mutating in-progress reviews.
- **Considered alternatives**: Auto-refresh definitions on next aggregation (rejected previously).

## Risks / Trade-offs

- [Risk] ISC HIDE on DESCRIPTION may differ from TEXT → Mitigation: conditions use the same SELECT-label comparison as pre-restyle; tenant-check during apply if tests cannot prove rendering
- [Risk] SELECT label drift vs `Candidate.name` → Mitigation: keep enrichment + `resolveIdentitiesSelectLabel`; existing error log when displayName is missing
- [Risk] Condition count at `fusionMaxCandidatesForForm` = 15 → Mitigation: one condition per candidate (≪ 500 warning threshold)
- [Trade-off] Score tables still list every candidate while only one identity details panel shows → Reason: comparison vs focused attribute view
- [Trade-off] In-flight reviews lack the panel until Reset forms → Reason: no silent mutation of open reviews

## Migration Plan

1. Deploy connector. New Fusion review definitions include identity details elements and conditions. Pending instances unchanged.
2. Operators who want a consistent inbox run **Reset forms?** on one persistent aggregation; rematch issues updated instances.
3. Rollback: revert connector; leftover new-style definitions persist until Reset forms or stale cleanup.

Acceptance: selecting a candidate shows that identity’s form-attributes table (same names as the account panel); other identity panels hidden; all score tables remain; toggle-on hides identity panels; FusionDecision still does not require HTML keys.

## Open Questions

None blocking. Tenant confirmation that DESCRIPTION HIDE follows SELECT is an apply-time check, not a design fork.
