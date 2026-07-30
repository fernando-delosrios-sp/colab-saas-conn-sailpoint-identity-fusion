## Why

Localization settings (`enableLocalization`, `defaultLanguage`, `identityLanguageAttribute`) exist in connector-spec and documentation but are never read at runtime. The i18n engine (Handlebars helpers, locale dictionaries) works when locale is injected manually, yet reports always render in English, config toggles have no effect, and operators cannot rely on documented behavior. This gap was confirmed by a two-axis code review on branch `i18n`.

## What Changes

**Localization gating**
- From: i18n always active; config keys unused
- To: When `enableLocalization` is false or unset, all user communications render in English without identity attribute lookups
- Reason: Match connector-spec toggle semantics
- Impact: Non-breaking; default-off preserves current English-only experience for unset configs

**Locale resolution**
- From: Hardcoded attribute probe (`preferredLanguage`, `language`, `locale`, `userLanguage`)
- To: Shared resolver reads configured `identityLanguageAttribute` first, then legacy fallbacks, then `defaultLanguage`, then `'en'`
- Reason: Honor operator configuration
- Impact: Non-breaking; fallbacks preserve existing tenants

**Report localization**
- From: `renderFusionReportHtml` accepts `locale` but callers never pass it
- To: `ReportService` resolves recipient locale and passes it through report rendering and localized subjects
- Reason: Docs promise localized reports
- Impact: Non-breaking behavior change when localization enabled

**String migration**
- From: English-only subjects, decision labels, aggregation warning headers, algorithm/score helpers
- To: Translated via `translate()` / `{{i18n}}` using existing locale dictionaries
- Reason: Partial localization is misleading
- Impact: Non-breaking

**Dictionary parity**
- From: `blended` / `blended_account` missing in nine non-English locales
- To: All locale dictionaries contain the full English key set
- Reason: Silent English fallback
- Impact: Non-breaking

**Tests**
- From: No tests for `normalizeLanguageCode`, `translate`, or localized email/report output
- To: Vitest coverage for resolver, config gating, and rendered Spanish output
- Reason: Prevent regression
- Impact: Test-only additions

## Capabilities

### New Capabilities

_(none — reuse existing specs)_

### Modified Capabilities

- `email-service`: Locale resolution SHALL honor `enableLocalization`, `defaultLanguage`, and `identityLanguageAttribute`; review email subjects and bodies SHALL localize when enabled.
- `report-service`: Report HTML and delivery subjects SHALL resolve and apply recipient locale when localization is enabled.

## Impact

- `src/services/emailService/localization.ts` — extend with config-aware resolver
- `src/services/emailService/emailService.ts` — gate and apply locale; localize subjects
- `src/services/emailService/messagingHandlebarsRegistration.ts` — localize remaining helper literals
- `src/services/emailService/helpers.ts` — migrate hardcoded aggregation header strings
- `src/services/emailService/locales.ts` — complete missing keys
- `src/services/reportService.ts` — pass locale through report render/delivery
- `src/model/config.ts` — no schema change (fields already exist)
- `src/services/emailService/__tests__/` — new localization tests
- `docs/configuration/matching.md` — clarify form UI localization deferred (if needed)
