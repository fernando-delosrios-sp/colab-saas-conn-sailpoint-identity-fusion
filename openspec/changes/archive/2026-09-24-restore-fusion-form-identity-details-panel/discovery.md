## Scope

Restore an **identity details panel** on the Fusion review form: one DESCRIPTION HTML block per **identity candidate**, visually aligned with the upper **account context** panel (identity link plus **form attributes** table), shown only for the candidate currently selected in the identities SELECT.

Out of scope: reverting the restyle to TEXT fields; hiding the stacked candidate score tables; changing SEARCH_V2, per-account definitions, decision keys, scoring, reviewer assignment, or in-flight instance migration (Reset forms remains the recut).

## Language

**Identity details panel** (`draft`):
The review-form display surface for one identity candidate’s configured **form attributes**, laid out like the target-account panel (identity link plus two-column attribute/value table). Distinct from the candidate **score table**.
_Avoid_: identity card, candidate details (ambiguous with score details), identity section (conflicts with the identities SELECT section)

**Account context panel** (`draft`):
The existing upper DESCRIPTION HTML for the managed account under review (header, source, human-account link, form-attributes table). Canonical **Review form** and **Form attributes** already cover the domain; this name only distinguishes the two HTML surfaces.
_Avoid_: upper panel, target account details (informal)

Conflict-check against `openspec/specs/ubiquitous-language/spec.md`: **Review form**, **Form attributes**, **Identity candidate**, **Identity display name**, **Reviewer**, and **Top-K identity matches** are used with their canonical meanings. No term is marked `promote`.

## Decisions

**Context.** After restyle (`2026-09-09-restyle-fusion-review-forms`), `buildFormConditions` is empty and every candidate’s score table is concatenated into one `candidatesHtml` DESCRIPTION. Reviewers can compare scores, but they no longer get a selected-identity attribute panel matching the account context panel. Pre-restyle forms hid per-candidate TEXT blocks from the identities SELECT using ISC HIDE conditions keyed to `resolveIdentitiesSelectLabel`. Locale key `form_candidate_details` still exists unused.

**Q1 — Restore hide-on-select for score tables, or add a separate identity details panel?**
Separate panel. Score tables stay stacked and always visible (restyle D3 / email comparison). Identity details follow the SELECT, matching the account context panel’s attribute table.

**Q2 — TEXT fields or DESCRIPTION HTML?**
DESCRIPTION HTML, same tokens and `renderAttributeTable` as the account context panel. Do not reintroduce TEXT attribute fields.

**Q3 — How does show/hide work?**
Per-candidate DESCRIPTION elements plus ISC form conditions: HIDE when the identities SELECT value is not that candidate’s identities-SELECT label (`resolveIdentitiesSelectLabel` / `Candidate.name` after enrichment). Hide every identity details panel when the SELECT is empty or `newIdentity` is true.

**Q4 — Where does the panel sit?**
In the identities (decision) section, below the toggle + SELECT column set, so changing the dropdown updates the panel immediately beneath it. Account context and score tables stay in `displaySection`.

**Q5 — In-flight reviews?**
New definitions only. Pending instances keep the current layout until **Reset forms?**.

## Open questions

None blocking.

**Whether ISC still honors HIDE on DESCRIPTION elements the way it did on TEXT** — assumed yes from pre-restyle Custom Forms conditions; verify during apply on a tenant if unit tests cannot prove runtime rendering.

## Scenarios discussed

- Two identity candidates: only the selected candidate’s identity details panel is visible; both score tables remain visible.
- No SELECT value yet: no identity details panel is visible.
- `newIdentity` / no-match toggle on: identity details panels are hidden even if a SELECT value remains.
- Form attributes configured: identity panel uses the same attribute names and two-column table as the account context panel, sourced from the candidate’s attributes.
- No form attributes configured: identity panel still shows the identity link; the attribute table is omitted (same as an empty account attribute table).
- Identity URL available via UrlContext: identity name is an ISC identity-details anchor; otherwise escaped text.
- Untrusted attribute values and names are HTML-escaped.
- SELECT label mismatch: conditions compare against the same display-name string the SEARCH_V2 SELECT shows (`resolveIdentitiesSelectLabel`).
- Decision processing still uses `account`, `name`, `source`, `candidates`, optional `identityId`, toggle, and SELECT; identity-details HTML keys are not required for a FusionDecision.
- Per-account definition naming and SEARCH_V2 candidate id query unchanged.
- Localization: identity panel labels use reviewer locale; `form_candidate_details` is the parameterized heading.
