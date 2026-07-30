# Wire Localization Config Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make `enableLocalization`, `defaultLanguage`, and `identityLanguageAttribute` drive localized review emails and reports end-to-end.

**Architecture:** Extend `localization.ts` with a config-aware resolver consumed by `EmailService` and `ReportService`. Gate all lookups behind `enableLocalization`. Migrate remaining English literals to locale dictionaries and add Vitest coverage before wiring callers.

**Tech Stack:** TypeScript, Vitest, Handlebars, existing `locales.ts` dictionaries

**References:** `openspec/changes/wire-localization-config/design.md`, `specs/email-service/spec.md`, `specs/report-service/spec.md`

---

## Task 1: Locale resolver (TDD)

- [ ] **Step 1:** Create `src/services/emailService/__tests__/localization.test.ts` with failing tests for `isLocalizationEnabled`, attribute precedence, and disabled gating
- [ ] **Step 2:** Implement `isLocalizationEnabled` and `resolveEffectiveLocale` in `localization.ts`
- [ ] **Step 3:** Run `npm test -- src/services/emailService/__tests__/localization.test.ts`
- [ ] **Step 4:** Commit: `feat(emailService): add config-aware locale resolver`

## Task 2: EmailService integration

- [ ] **Step 1:** Add subject/truncation keys to `locales.ts` (all ten locales)
- [ ] **Step 2:** Refactor `getRecipientLocale` to call `resolveEffectiveLocale`
- [ ] **Step 3:** Update `sendFusionEmail` subject to use `translate('review_email_subject', locale, { accountName, accountSource })` or equivalent pattern
- [ ] **Step 4:** Add Spanish review email test in `emailService.reviewEmail.test.ts` (`preferredLanguage: 'es'`, assert subject + body)
- [ ] **Step 5:** Run `npm test -- src/services/emailService/__tests__/`
- [ ] **Step 6:** Commit: `feat(emailService): wire localization config to review emails`

## Task 3: Template string migration

- [ ] **Step 1:** Replace aggregation warning/error hardcoded strings in `helpers.ts` with `{{i18n}}`
- [ ] **Step 2:** Localize `decisionLabel` strings in `reportService.ts` using `translate()` at build time
- [ ] **Step 3:** Localize report subject in `reportService.ts`
- [ ] **Step 4:** Update `messagingHandlebarsRegistration.ts` — algorithm labels and formatScores via translate when root locale present
- [ ] **Step 5:** Add missing `blended` / `blended_account` to es, fr, de, zh, ja, pt, it, ru, ar in `locales.ts`
- [ ] **Step 6:** Add dictionary parity test
- [ ] **Step 7:** Commit: `feat(emailService): complete i18n string migration and dictionary parity`

## Task 4: ReportService wiring

- [ ] **Step 1:** Add method or inline call to resolve locale for primary report recipient (reuse EmailService or shared resolver)
- [ ] **Step 2:** Pass locale to `renderFusionReportHtml` at lines ~244, ~388, ~479 in `reportService.ts`
- [ ] **Step 3:** Add report localization test (mock recipient with `preferredLanguage: 'es'`, assert Spanish in HTML)
- [ ] **Step 4:** Run `npm test` and `npm run lint`
- [ ] **Step 5:** Commit: `feat(reportService): wire localization config to report delivery`

## Task 5: Documentation and changelog

- [ ] **Step 1:** Update `docs/configuration/matching.md` with form UI deferral note if needed
- [ ] **Step 2:** Run changelog-generator or update `docs/CHANGELOG.md`
- [ ] **Step 3:** Commit: `docs: document wired localization behavior`

---

## Verification checklist

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Manual: `enableLocalization: false` → English output, no attribute reads
- [ ] Manual: `enableLocalization: true` + `preferredLanguage: es` → Spanish review email and report
