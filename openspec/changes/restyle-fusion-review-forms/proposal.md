## Why

Fusion review forms today are a stack of disabled TEXT fields. Reviewers already get a richer layout in the Fusion review email (colors, score tables, identity and account links). The Custom Forms DESCRIPTION element can render the same HTML. Restyling the whole form closes that gap. In-flight reviews keep the old definition until **Reset forms?** closes them so rematch can issue the new layout.

## What Changes

**Review form presentation**
- From: Per-attribute and per-score TEXT fields; candidate sections hide when another identity is selected; only a small DESCRIPTION header for score details
- To: Whole-form DESCRIPTION HTML aligned with the review email (account context, attributes, all candidates’ score tables, links and colors); toggle and identities SELECT stay native
- Reason: Reviewers should see the same match evidence on the form as in email
- Impact: Non-breaking for decision processing; pending instances keep old layout until Reset forms

**Candidate visibility**
- From: Hide other candidate sections when SELECT does not match that candidate
- To: All form candidates remain visible in one HTML block (email behavior)
- Reason: Side-by-side comparison
- Impact: Form conditions drop per-candidate HIDE rules

**Reset forms**
- From: Setup deletes Fusion review form definitions matching the name pattern
- To: Same operator flag, specified as closing in-flight Fusion reviews (definitions, and instances if they survive definition delete); docs state restyle does not migrate pending instances
- Reason: Recut open reviews onto the new layout without a per-account reset
- Impact: Operators run **Reset forms?** once after deploy when they want existing inbox items recut; dry-run still does not apply the flag

**Out of scope**
- One shared form definition for all reviews
- Individual / single-account review reset

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `form-service`: Review form definition and instance input use DESCRIPTION HTML for display; native toggle and identities SELECT remain; decision extractors unchanged
- `account-list-operation`: **Reset forms?** closes in-flight Fusion reviews, then aggregation continues so those accounts rematch
- `ubiquitous-language`: Promote Fusion review form definition, DESCRIPTION HTML, and in-flight review
- `documentation-site`: Review-form and Reset Fusion state guides describe the HTML layout and that **Reset forms?** recuts in-flight reviews

## Impact

- `src/services/formService/formBuilder.ts` — section/field composition; drop display TEXT and hide-on-select conditions
- New form HTML helpers under `src/services/formService/` (escape, score table, account/identity links via `UrlContext`)
- `src/services/formService/formService.ts` — compose formInput HTML blobs; wire `UrlContext`
- `src/services/formService/formLifecycle.ts` / `deleteExistingForms` — ensure Reset forms closes open reviews if definition delete leaves instances
- `src/services/emailService/locales.ts` — any new `form_*` strings for HTML chrome
- Tests: `formBuilder`, formService, Reset forms Setup
- Docs: `docs/use-guides/configuration/review-forms-and-reviewers.md`, `docs/use-guides/operation/reset-fusion-state.md`, screenshot if the example form image is outdated
- No connector-spec key changes unless Reset forms help text needs a restyle note
