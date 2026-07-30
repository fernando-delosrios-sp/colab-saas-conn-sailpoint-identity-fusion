## 1. Locale resolver and config gating

- [x] 1.1 Add `isLocalizationEnabled(config)` and `resolveEffectiveLocale(config, identityAttributes?)` to `src/services/emailService/localization.ts`
- [x] 1.2 Implement attribute precedence: configured `identityLanguageAttribute` → legacy fallbacks → `defaultLanguage` → `'en'`
- [x] 1.3 Add `__tests__/localization.test.ts` covering gating, attribute precedence, and normalization edge cases

## 2. EmailService wiring

- [x] 2.1 Refactor `getRecipientLocale` to use `resolveEffectiveLocale` with `FusionConfig` and identity attributes
- [x] 2.2 Gate locale resolution behind `enableLocalization` in `sendFusionEmail`
- [x] 2.3 Add localized review email subject keys to `locales.ts` and use them in `sendFusionEmail`
- [x] 2.4 Localize `TRUNCATION_NOTICE_HTML` via locale dictionary or resolver helper
- [x] 2.5 Extend `emailService.reviewEmail.test.ts` with Spanish locale assertion (subject + body)

## 3. Template and helper string migration

- [x] 3.1 Replace hardcoded "Aggregation Warnings/Errors" in `helpers.ts` with `{{i18n}}` keys
- [x] 3.2 Localize `decisionLabel` construction in `reportService.ts` via `translate()`
- [x] 3.3 Localize report email subject in `reportService.ts`
- [x] 3.4 Migrate `ALGORITHM_LABELS` and `formatScores` match/no-match text in `messagingHandlebarsRegistration.ts` to use locale from template root
- [x] 3.5 Add missing `blended` and `blended_account` keys to all nine non-English locale dictionaries

## 4. ReportService wiring

- [x] 4.1 Add locale resolution helper (reuse `EmailService.getRecipientLocale` or shared resolver) for report recipients
- [x] 4.2 Pass resolved locale to all `renderFusionReportHtml` call sites (`deliverReportToRecipients`, dry-run paths)
- [x] 4.3 Add test asserting Spanish report HTML when localization enabled and recipient has `preferredLanguage: es`

## 5. Dictionary parity verification

- [x] 5.1 Add test asserting every locale in `locales.ts` contains all keys from the English dictionary

## 6. Documentation

- [x] 6.1 Update `docs/configuration/matching.md` to note ISC review form UI labels remain English (deferred)
- [x] 6.2 Update `openspec/specs/email-service/spec.md` purpose section if still TBD (optional, only if touched during archive)

## 7. Changelog

- [x] 7.1 Create or update the project changelog entry for wired localization config behavior
- [x] 7.2 Confirm the entry covers enableLocalization toggle, defaultLanguage, and identityLanguageAttribute now taking effect
