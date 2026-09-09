## 1. Reviewer locale (TDD)

- [x] 1.1 Wire FormService to `EmailService.getRecipientLocale` for each reviewer; stop using account-wide `resolveFormLocale` (D1; scenarios: Reviewer language attribute sets form locale; Review forms use reviewer locale).
- [x] 1.2 Cover fallbacks: identity language → `defaultLanguage` → English; localization disabled stays English; unsupported `defaultLanguage` with no identity language is English (D1; scenarios: Localization enabled with French defaultLanguage; Localization disabled; Unsupported defaultLanguage falls back to English).
- [x] 1.3 Remove or retarget `resolveFormLocale` once FormService has no callers; keep `resolveEffectiveLocale` as the single resolver (D1; email-service Localization configuration gating).

## 2. Locale groups (TDD)

- [x] 2.1 Group `createFusionForm` reviewers by reviewer locale; for each group, `buildFormName` + definition labels + DESCRIPTION `formInput` use that locale; process groups sequentially on one account (D2, D3, D6; scenario: Two reviewers with different language attributes get two definitions).
- [x] 2.2 When localization is disabled, one English definition and no `[locale]` suffix even if reviewers have language attributes (D3, Q5; scenario: Localization disabled uses one English definition with no suffix).

## 3. Pending reviews and refresh (TDD)

- [x] 3.1 Union `existingRecipientIds` across every locale-variant definition for the managed account; skip instance create when the reviewer already has a pending instance in any locale (D4; scenarios: Distinct reviewers on different locale groups are not duplicate reviews; Language attribute change does not reissue an in-flight review).
- [x] 3.2 Evaluate `shouldRefreshLocalizedFormDefinition` against the locale group's locale, not account-wide `defaultLanguage` (D5; scenario: French definition is not refreshed for a German defaultLanguage).

## 4. Reset forms locale variants (TDD)

- [x] 4.1 Assert `deleteExistingForms` deletes `[fr]` and `[de]` definitions matching `fusionFormNamePattern` and closes leftover instances; do not switch to exact `defaultLanguage` names (D7; scenario: Reset forms deletes French and German variants for the same account).

## 5. Verification

- [x] 5.1 Confirm canonical test command: `npx vitest run src/services/formService/__tests__/formService.test.ts src/services/formService/__tests__/formBuilder.test.ts src/services/emailService/__tests__/localization.test.ts`.
- [x] 5.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`).
- [x] 5.3 Run `npm test` (global suite) and `npm run lint`.

## 6. Documentation

- [x] 6.1 Update `docs/use-guides/configuration/managing-reviewers.md` Localization and reviewer experience so Fusion review forms use reviewer locale (scenario: Operator reads localization and reviewer experience).
- [x] 6.2 Update `docs/use-guides/configuration/review-forms-and-reviewers.md` if it still describes Default Language-only forms.
- [x] 6.3 Add **reviewer locale** and **locale group** to `openspec/specs/ubiquitous-language/spec.md` (canonical table) and `docs/glossary.md`; amend **Fusion review form definition** for the locale dimension (UL scenarios).
- [x] 6.4 Drop report-service wording that review forms use `resolveFormLocale` (`defaultLanguage` only); JSDoc on `getRecipientLocale` / FormService locale-group helpers.

## 7. Changelog

- [x] 7.1 Create changelog entry via changelog-generator during apply.
- [x] 7.2 Confirm entry covers: Fusion review forms use reviewer locale; one definition per locale group; Reset forms deletes every locale variant.
