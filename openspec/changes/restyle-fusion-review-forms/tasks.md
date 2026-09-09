## 1. Form HTML helpers (TDD)

- [x] 1.1 Add formService HTML helpers (escape, identity/account anchors via `UrlContext`, score table) with email colors `#0b5cab`, `#f0fdf4`, `#fef2f2`, `#e0f2fe`; cover escape, missing URL fallback, `target="_blank"` / `rel="noopener noreferrer"` (D5, D7; scenarios: Untrusted values are HTML-escaped; Missing URL falls back to escaped text; Identity and account links when UrlContext can build them).
- [x] 1.2 Render candidate HTML with columns attribute, value, algorithm, threshold, result, score for all candidates in one block (D3; scenario: Candidate score table matches the review email columns).

## 2. Form definition restyle (TDD)

- [x] 2.1 Change `buildFormFields` / `buildFormInputs` / `buildFormInput` so display is DESCRIPTION + interpolated HTML formInput; keep `newIdentity` TOGGLE and identities SEARCH_V2 SELECT; drop display TEXT fields (D1, D2; scenarios: New review form uses HTML for the whole display surface).
- [x] 2.2 Remove per-candidate HIDE conditions and TEXT disable-when-not-empty rules; keep `buildFormName` and SEARCH_V2 candidate id query (D3, D4; scenarios: Multiple candidates stay visible together; Per-account definition naming unchanged).
- [x] 2.3 Wire `UrlContext` into form definition/instance composition in FormService; localize HTML chrome via `locales.ts` / `translate()` and `resolveFormLocale` (D5; form locale existing scenarios).
- [x] 2.4 Confirm `formProcessor` still builds FusionDecision from existing keys without display HTML keys (`formProcessor.test.ts`) (D2; scenario: Processor ignores display HTML keys).

## 3. Reset forms closes in-flight reviews (TDD)

- [x] 3.1 Extend `deleteExistingForms` (and Setup) so matching Fusion review form definitions are deleted and leftover instances are cancelled or deleted in the same pass (D6; scenario: resetForms only deletes forms and continues).
- [x] 3.2 Keep dry-run skipping form delete/cancel/config patch (`accountListReset.test.ts`) (scenario: Dry-run skips reset side effects).
- [x] 3.3 Confirm a normal aggregation does not replace pending definitions solely for the new layout (D6; scenario: Restyle does not migrate pending instances without Reset forms).

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npx vitest run src/services/formService/__tests__/formBuilder.test.ts src/services/formService/__tests__/formProcessor.test.ts src/services/formService/__tests__/formService.test.ts src/operations/helpers/__tests__/accountListReset.test.ts` (plus the new HTML helper test file).
- [x] 4.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`).
- [x] 4.3 Run `npm test` (global suite) and `npm run lint`.

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/configuration/review-forms-and-reviewers.md` for DESCRIPTION HTML, email-aligned table, toggle/SELECT, and refresh `docs/assets/images/match-review-form.png` if it shows the old TEXT layout.
- [x] 5.2 Update `docs/use-guides/operation/reset-fusion-state.md` so **Reset forms?** closes in-flight reviews and recuts layout; no per-account reset flag.
- [x] 5.3 Add glossary rows for DESCRIPTION HTML and in-flight review in `openspec/specs/ubiquitous-language/spec.md` (canonical) and `docs/glossary.md`.
- [x] 5.4 Update `connector-spec.json` **Reset forms?** help if it still says definitions-only without closing open instances.
- [x] 5.5 JSDoc on new HTML helpers and `deleteExistingForms`.

## 6. Changelog

- [x] 6.1 Create changelog entry via changelog-generator during apply.
- [x] 6.2 Confirm entry covers: whole-form HTML restyle aligned with review email; in-flight reviews unchanged until **Reset forms?**; Reset forms closes open Fusion reviews.
