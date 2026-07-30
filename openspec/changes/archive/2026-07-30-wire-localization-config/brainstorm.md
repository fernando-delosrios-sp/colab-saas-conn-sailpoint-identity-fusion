# Brainstorming Log: Wire Localization Config End-to-End

## Context & Problem Statement

Identity Fusion exposes three localization settings in connector-spec (`enableLocalization`, `defaultLanguage`, `identityLanguageAttribute`) and ships Handlebars `i18n` helpers with ten locale dictionaries. A code review on branch `i18n` found the i18n engine works when `locale` is injected manually, but configuration is never read at runtime. Reports never receive locale, email subjects and several template strings remain English, and `identityLanguageAttribute` / `defaultLanguage` are dead config keys.

## Objectives

1. Make operator-facing localization settings drive runtime behavior.
2. Localize review emails and aggregation/dry-run reports for recipients.
3. Complete string migration (subjects, decision labels, remaining hardcoded template fragments).
4. Add Vitest coverage for locale resolution and translated output.

## Key Design Decisions & Alternatives

### Q1: Where should locale resolution live?

- **Option A**: Duplicate locale lookup in `EmailService` and `ReportService`.
- **Option B**: Shared `LocalizationService` or module (`resolveLocaleForIdentity`, `effectiveLocale`) consumed by both (**Chosen**).
- **Rationale**: Single place honors `enableLocalization`, `identityLanguageAttribute`, and `defaultLanguage`; avoids drift.

### Q2: Behavior when `enableLocalization` is false or unset?

- **Option A**: Keep current behavior (always i18n, English fallback).
- **Option B**: When disabled, skip locale resolution and force English (**Chosen**).
- **Rationale**: Matches connector-spec toggle semantics and operator expectation.

### Q3: How to resolve identity language attribute?

- **Option A**: Only read configured `identityLanguageAttribute`.
- **Option B**: Read configured attribute first, then fall back to `preferredLanguage`, `language`, `locale`, `userLanguage` (**Chosen**).
- **Rationale**: Backward compatible for tenants already populating common ISC attributes without reconfiguration.

### Q4: Localize ISC review form definitions?

- **Option A**: Translate formBuilder labels via `translate()` at form creation time.
- **Option B**: Defer form UI localization to a follow-up change (**Chosen for initial scope**).
- **Rationale**: Emails and reports are the highest-impact surfaces; form definitions require FormService changes and API contract review. Document as follow-up in non-goals.

### Q5: Report locale when multiple recipients?

- **Option A**: Per-recipient rendered HTML (separate sends).
- **Option B**: Use primary recipient locale for report body; English when disabled (**Chosen**).
- **Rationale**: Matches existing review-email pattern (`recipientIds[0]`); report emails already send one body to all recipients.

### Q6: Localize algorithm labels and score helper output?

- **Option A**: Full i18n for `ALGORITHM_LABELS`, `formatScores`, phase names in this change.
- **Option B**: Migrate high-visibility strings (subjects, aggregation headers, decision labels) now; helper literals in same PR if small (**Chosen — include in scope**).
- **Rationale**: Partial English in localized emails undermines operator trust.

## Summary

Proceed with a shared locale resolver wired to existing config, gated by `enableLocalization`, applied to review emails and report delivery, with complete dictionary parity and Vitest coverage. Defer ISC form definition label localization to a follow-up change.
