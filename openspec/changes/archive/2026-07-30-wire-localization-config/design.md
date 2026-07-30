## Context

Identity Fusion ships localization infrastructure (ten locale dictionaries, Handlebars `i18n` helper, `normalizeLanguageCode` / `translate`) and three connector settings documented in `docs/configuration/matching.md`. Runtime code only sets `emailData.locale` in `sendFusionEmail` via a hardcoded attribute probe; `enableLocalization`, `defaultLanguage`, and `identityLanguageAttribute` are defined in `FusionConfig` but never consumed. `ReportService.renderFusionReportHtml` accepts an optional `locale` parameter that no caller supplies.

Stakeholders: operators configuring multilingual tenants, reviewers receiving emails/reports, and maintainers of `EmailService` / `ReportService`.

## Goals / Non-Goals

**Goals:**

- Centralize config-aware locale resolution in `emailService/localization.ts`.
- Gate all localization behind `enableLocalization`.
- Apply resolved locale to review emails and aggregation/dry-run report rendering and subjects.
- Complete locale dictionary parity and migrate remaining hardcoded English strings in templates/helpers.
- Add Vitest tests covering resolver logic and end-to-end rendered output.

**Non-Goals:**

- Localizing ISC review form definition labels in `FormService` / `formBuilder.ts` (follow-up change).
- Adding new languages beyond the ten already in `locales.ts`.
- Changing ISC workflow or form API contracts.
- Removing `scripts/update-i18n.js` (optional cleanup, not blocking).

## Decisions

### D1: Shared locale resolver module

- **Choice**: Extend `localization.ts` with `resolveEffectiveLocale(config, identityAttributes?)` and `isLocalizationEnabled(config)`.
- **Reason**: Single source of truth for config gating and attribute precedence.
- **Considered alternatives**: Resolver methods on `EmailService` only (rejected: `ReportService` would duplicate logic).

### D2: Attribute precedence

- **Choice**: When enabled, read `config.identityLanguageAttribute` if set, else try `preferredLanguage`, `language`, `locale`, `userLanguage`, normalize via `normalizeLanguageCode`, fall back to `config.defaultLanguage`, then `'en'`.
- **Reason**: Honors configured attribute while preserving backward compatibility.
- **Considered alternatives**: Configured attribute only (rejected: breaks tenants using standard ISC attrs without reconfiguration).

### D3: Disabled localization behavior

- **Choice**: When `enableLocalization` is not strictly `true`, return `'en'` immediately without identity lookups.
- **Reason**: Explicit opt-in matches UI toggle semantics.
- **Considered alternatives**: Always resolve locale (rejected: inverts toggle meaning).

### D4: Report recipient locale

- **Choice**: Resolve locale from the first report recipient identity (same pattern as review emails).
- **Reason**: Consistent with existing `primaryRecipientId` pattern; report body is single HTML per send.
- **Considered alternatives**: Per-recipient HTML (rejected: requires multiple sends, larger change).

### D5: Subject localization

- **Choice**: Add translation keys for review email subject, report subject, and truncation notice; build subjects via `translate(key, locale, interpolations?)` or template strings in `locales.ts`.
- **Reason**: Subjects are user-visible and currently English-only.
- **Considered alternatives**: Leave subjects English (rejected: contradicts docs).

### D6: Helper literal migration

- **Choice**: Move `ALGORITHM_LABELS`, `formatScores` match/no-match text, and `'N/A'` defaults through `translate()` when locale is available in Handlebars context; phase names remain English (low visibility).
- **Reason**: High-visibility scoring table content appears in every review email.
- **Considered alternatives**: Full phase-name i18n (deferred).

## Risks / Trade-offs

- **[Risk] Multi-recipient reports use first recipient's language** → Mitigation: Document in config docs; matches current email pattern.
- **[Risk] `defaultLanguage` unset falls back to English** → Mitigation: Expected; connector-spec shows no default until operator selects one.
- **[Risk] Missing translation keys fall back to English silently** → Mitigation: Add dictionary parity test asserting all locales contain English keys.
- **[Trade-off] Form UI stays English** → Accepted: deferred to follow-up; docs updated if needed.

## Migration Plan

1. Deploy connector update; no config migration required.
2. Operators who want localization set `enableLocalization: true`, optionally `defaultLanguage` and `identityLanguageAttribute`.
3. Rollback: disable toggle — behavior reverts to English-only immediately.
4. Acceptance: Vitest green; manual spot-check Spanish review email and report with `preferredLanguage: es`.

## Open Questions

- Should `identityLanguageAttribute` default to `preferredLanguage` when empty (implicit default in resolver vs requiring explicit config)? **Proposed: implicit fallback chain without requiring the text field.**
- Should dry-run reports localize when `enableLocalization` is on? **Proposed: yes — same template path as aggregation reports.**
