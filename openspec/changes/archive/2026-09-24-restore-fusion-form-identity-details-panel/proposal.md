## Why

After the Fusion review form restyle, reviewers still see every candidate’s score table, but they lost the selected-identity attribute panel that sat next to the identities SELECT. The upper account context panel already shows form attributes for the managed account; reviewers need the same view for the identity they pick so they can compare account vs identity values without scrolling through stacked score rows. Restoring that panel with DESCRIPTION HTML and SELECT-driven show/hide closes the gap without undoing email-aligned score tables.

## What Changes

**Identity details for the selected candidate**
- From: No per-candidate identity attribute panel; all candidates appear only as stacked score-table HTML; `buildFormConditions` is empty
- To: One identity details DESCRIPTION per identity candidate (identity link plus the same form-attributes table as the account context panel), placed under the identities SELECT; ISC conditions show only the selected candidate’s panel and hide all panels when the SELECT is empty or the new-identity / no-match toggle is on
- Reason: Reviewers need account-vs-identity attribute comparison for the identity they are about to choose
- Impact: Non-breaking for FusionDecision processing; new form definitions only; in-flight reviews unchanged until **Reset forms?**

**Candidate score tables**
- From: All form candidates remain visible in one HTML block (unchanged requirement)
- To: Same — score tables stay stacked and are not hidden by SELECT
- Reason: Side-by-side match evidence from the restyle must remain
- Impact: The restyle’s “all candidates visible” rule is narrowed to score-table HTML, not identity details

**Out of scope**
- Reverting display to TEXT fields
- Hiding score tables on SELECT change
- Shared tenant-wide form definition or per-account review reset
- Decision key or SEARCH_V2 query changes

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `form-service`: Add SELECT-driven identity details DESCRIPTION panels; keep stacked candidate score HTML; restore HIDE conditions only for identity details; decision processing keys unchanged
- `documentation-site`: Review-forms guide describes the identity details panel and that score tables remain all visible

## Impact

- `src/services/formService/formHtml.ts` — per-candidate identity details HTML (reuse account attribute-table markup and UrlContext identity links)
- `src/services/formService/formBuilder.ts` — extra DESCRIPTION elements, formInput/formInputs keys, `buildFormConditions` HIDE rules keyed to identities SELECT label and `newIdentity`
- `src/services/formService/helpers.ts` — keep SELECT-label alignment (`resolveIdentitiesSelectLabel`); conditions must use that string
- Tests: `formBuilder`, `formHtml`, existing formService definition snapshots
- Docs: `docs/use-guides/configuration/review-forms-and-reviewers.md` (and screenshot if the example form image omits the panel)
- `src/services/emailService/locales.ts` — reuse existing `form_candidate_details`; add keys only if new chrome strings appear
- No connector-spec keys, no FusionDecision schema change
