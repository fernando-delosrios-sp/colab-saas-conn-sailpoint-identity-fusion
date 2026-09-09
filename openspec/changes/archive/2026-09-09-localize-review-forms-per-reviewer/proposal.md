# Localize review forms per reviewer

## Why

A reviewer receives the Fusion review email in their own language, clicks through, and lands on a review form in the tenant's `defaultLanguage`. That split was a deliberate constraint, not an oversight: every localizable string lived in the form definition, and one definition serves all reviewers of a managed account.

The DESCRIPTION HTML restyle moved the account panel and candidate score tables into per-instance `formInput`, so the bulk of the form text is now built per reviewer. Closing the remaining gap makes the review experience consistent in one language end to end, and removes the documented exception that forms alone ignore reviewer language.

## What Changes

**Review form locale resolution**
- From: `resolveFormLocale(config)` — `defaultLanguage` only, identical for every reviewer of an account
- To: reviewer locale via `resolveEffectiveLocale` — identity language attribute, then `defaultLanguage`, then English
- Reason: reviewers already read every other Fusion communication in their own language
- Impact: non-breaking; with localization disabled or no language attributes set, behavior is unchanged

**Form definitions per managed account**
- From: one definition per account, named with the single configured `[locale]` suffix
- To: one definition per locale group — the reviewers of that account sharing a reviewer locale
- Reason: toggle and SELECT labels live in `formElements`, so they cannot vary per instance
- Impact: more definitions and API calls per account when reviewers span languages; unchanged for single-language tenants

**Reset forms**
- From: deletes definitions matching the account's form name for the configured locale
- To: deletes every locale variant of that account's definitions
- Reason: otherwise in-flight reviews in other languages survive a reset
- Impact: non-breaking; closes a gap that only appears once multiple locales exist

## Capabilities

### New Capabilities

None — this changes existing form service behavior rather than introducing a capability.

### Modified Capabilities

- `form-service`: replaces the requirement that review forms localize to `defaultLanguage` only; adds definition-per-locale-group, reviewer-locale resolution, per-locale stale-definition refresh, and locale-wide **Reset forms?** deletion
- `report-service`: drops the statement that review forms are out of scope for recipient-based locale resolution
- `documentation-site`: the review forms and reviewers Use guide must state that reviewers see forms in their own language
- `ubiquitous-language`: promotes **reviewer locale** and **locale group**; amends **Fusion review form definition** to carry the locale dimension

## Impact

- `src/services/formService/formService.ts`: `prepareFormCreationData` currently builds one form name, definition and `formInput` per account; `createFormInstancesForReviewers` fans that single payload out to all reviewers. Both must work per locale group.
- `src/services/formService/formLifecycle.ts`: definition lookup, refresh and deletion become locale-aware.
- `src/services/emailService/localization.ts`: `resolveFormLocale` loses its only caller or changes meaning.
- `src/services/emailService/emailService.ts`: `getRecipientLocale` becomes shared with `FormService` rather than email-only.
- `openspec/specs/form-service/spec.md`, `openspec/specs/report-service/spec.md`: existing requirements state the `defaultLanguage`-only rule explicitly.
- `docs/use-guides/configuration/review-forms-and-reviewers.md`: documents current localization behavior.
- No new dependencies. ISC Custom Forms API usage grows with the number of distinct reviewer locales per account.
