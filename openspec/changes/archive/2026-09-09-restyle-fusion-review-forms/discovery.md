## Scope

In: restyle the **entire Fusion review form** to match the Fusion review email (HTML DESCRIPTION, colors, side-by-side score tables, identity and account links); keep one form definition per managed account; **Reset forms?** remains the only way to close in-flight reviews and recut them onto the new layout. Out: a single shared form definition for all reviews; per-account / individual review reset; auto-patching still-pending definitions on aggregation.

## Language

**Review form** (canonical — reuse):
An ISC form instance presented to reviewers with identity candidates and a merge / new-identity (or no-match) decision.
_Avoid_: Fusion form (ambiguous with Fusion account), custom form (platform type)

**Fusion review form definition** (`draft`):
The ISC Custom Forms definition named from `fusionFormNamePattern` plus account identity, used as the template for that managed account’s review instance(s).
_Avoid_: seed (SoD term), template form (implies shared definition)

**DESCRIPTION HTML** (`draft`):
ISC Custom Forms DESCRIPTION element content rendered as HTML, including `{{$.form.input.<key>}}` interpolation of launch-time formInput strings.
_Avoid_: TEXT field (does not render HTML), helpText as the restyle surface

**Reset forms** (canonical — reuse as Developer Setting `resetForms`):
The one-run Setup flag that deletes all Fusion review form definitions matching the name pattern so pending reviews close and those managed accounts can rematch on the same aggregation.
_Avoid_: Reset accounts, individual review reset, stale form cleanup (expiration-based, not this flag)

**In-flight review** (`draft`):
A Fusion review form instance that is still pending (not a response and not cancelled), which holds the managed account off the Match work queue.
_Avoid_: stuck form (processing lock), stale form (age vs expiration)

## Decisions

Context: Reviewers should see the same visual language as the Fusion review email. SoD Custom Forms already prove DESCRIPTION HTML + formInput interpolation. Fusion today bakes per-account TEXT fields and SEARCH_V2 identity queries into the definition.

Q1: Whole form vs candidates-only restyle?
Chosen: **Whole form.** Header, account context, configured attributes, copy, candidate score details, and links. Native interactive controls remain: new-identity / no-match toggle and identities SELECT.

Q2: Email table vs two-column attribute/score only?
Chosen: **Email table, all candidates visible.** Columns: attribute, value, algorithm, threshold, result, score; match/miss/fusion-score row colors; identity and account links. Drop hide-other-candidates when SELECT changes.

Q3: One shared definition vs per-account?
Chosen: **Keep per-account definitions.** SEARCH_V2 candidate query and definition naming stay account-specific. Single-form is deferred (interpolation of SEARCH query unproven).

Q4: Recut in-flight reviews?
Chosen: **Reset forms? only.** Shipping the restyle does not migrate pending instances. Operators run **Reset forms?** to close open Fusion reviews; rematch issues new instances with the new layout. Individual-account reset is later work.

Q5: Visual reference?
Chosen: Fusion review email (`emailService` helpers + `#0b5cab` / match-row colors) plus SoD DESCRIPTION patterns (`{{$.form.input.*Html}}`, inline styles, `<a target="_blank">`). Reuse existing `UrlContext` identity and human-account URLs.

## Open questions

None blocking.

Deferred: SEARCH_V2 query interpolation / one definition for all reviews; supported single-account review reset; whether ISC sanitizes DESCRIPTION HTML beyond SoD’s verified set (tables, spans, anchors).

Assumption: deleting Fusion review form definitions via **Reset forms?** closes the corresponding open instances in ISC (inbox). If tenant evidence shows instances surviving definition delete, Reset forms MUST also cancel or delete those instances in the same Setup pass.

## Scenarios discussed

- New potential match after deploy → new definition + instance uses HTML restyle; pending peers keep old layout until Reset forms.
- **Reset forms?** on persistent aggregation → all matching definitions gone; held managed accounts rematch; new instances use new layout; flag auto-disables.
- Dry-run with Reset forms still exits without deleting forms.
- Authoritative vs record vs orphan: toggle labels and section copy still vary by source type; HTML chrome is shared.
- Localization: form locale remains `defaultLanguage` only; HTML fragments use the same `locales.ts` / `translate()` path as today’s form strings.
- Decision processing still reads toggle, identities SELECT, and existing formInput keys (`account`, `name`, `source`, `candidates`, `identityId`); display TEXT fields are not required for decisions.
- fusionMaxCandidatesForForm 1–15: all listed candidates appear in one HTML block (no per-candidate hide).
- Missing account or identity URL → escaped plain text, same as email when UrlContext cannot build a link.
