## 1. Identity details HTML (TDD)

- [x] 1.1 Add `renderIdentityDetailsHtml` in `formHtml.ts` reusing the account form-attributes table and `renderIscUiLink`; heading via `form_candidate_details`; omit the attribute table when no form attributes are configured (D1, D2, D6; scenarios: Selected candidate identity details are shown; Identity details omit the attribute table when no form attributes are configured).
- [x] 1.2 Cover identity details HTML for escape, missing URL fallback, and identity anchors with `target="_blank"` / `rel="noopener noreferrer"` (`formHtml.test.ts`) (D2; scenarios: Untrusted values are HTML-escaped; Missing URL falls back to escaped text; Identity and account links when UrlContext can build them).

## 2. Form definition and conditions (TDD)

- [x] 2.1 Add `identityHtml0`…`identityHtmlN-1` to `buildFormInput` / `buildFormInputs` and `identityDetailsN` DESCRIPTION elements in `identitiesSection` after the toggle/SELECT column set; interpolate `{{$.form.input.identityHtmlN}}`; no TEXT fields (D3, D5; scenarios: Selected candidate identity details are shown; New review form uses HTML for the whole display surface).
- [x] 2.2 Restore `buildFormConditions`: one OR condition per candidate hiding `identityDetailsN` when identities SELECT `NE` that candidate’s `name` or `newIdentity` is true; do not HIDE `candidatesDisplay` (D4; scenarios: Unselected candidate identity details are hidden; Empty identities SELECT hides identity details; New-identity toggle hides identity details; Multiple candidates stay visible together).
- [x] 2.3 Keep `buildFormName` and SEARCH_V2 candidate id query; keep stacked `candidatesHtml` listing every candidate (D1, D7; scenarios: Per-account definition naming unchanged; Multiple candidates stay visible together; Candidate score table matches the review email columns).
- [x] 2.4 Confirm `formProcessor` still builds FusionDecision from existing keys without identity-details HTML keys (`formProcessor.test.ts`) (scenario: Processor ignores display HTML keys).

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npx vitest run src/services/formService/__tests__/formHtml.test.ts src/services/formService/__tests__/formBuilder.test.ts src/services/formService/__tests__/formProcessor.test.ts src/services/formService/__tests__/formService.test.ts`
- [x] 3.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`).
- [x] 3.3 Run `npm test` (global suite) and `npm run lint`.
- [x] 3.4 If a tenant is available during apply, confirm Custom Forms HIDE on DESCRIPTION follows the identities SELECT (not run: no tenant was supplied for this local apply).

## 4. Documentation

- [x] 4.1 Update `docs/use-guides/configuration/review-forms-and-reviewers.md` so reviewers see stacked score tables plus identity details for the identities SELECT value (documentation-site scenarios: Review forms guide describes the HTML layout).
- [x] 4.2 Remove the example-image reference because `docs/assets/images/match-review-form.png` is a 1×1 placeholder rather than a review-form screenshot.
- [x] 4.3 Confirm `docs/use-guides/operation/reset-fusion-state.md` still states layout changes do not migrate pending instances without **Reset forms?** (no per-account reset).
- [x] 4.4 JSDoc on `renderIdentityDetailsHtml` and `buildFormConditions`.

## 5. Changelog

- [x] 5.1 Create changelog entry via changelog-generator during apply.
- [x] 5.2 Confirm entry covers: identity details panel on Fusion review forms driven by the identities SELECT; score tables remain visible for all candidates; in-flight reviews unchanged until **Reset forms?**.
