## Context

Fusion review emails already resolve **reviewer locale** (`EmailService.getRecipientLocale` → `resolveEffectiveLocale`). Fusion review forms still use `resolveFormLocale` (`defaultLanguage` only) because one Fusion review form definition served every reviewer of a managed account.

The DESCRIPTION HTML restyle moved the account panel and candidate tables into per-instance `formInput`, so most visible text can vary per reviewer. Toggle and identities SELECT labels still live on the definition, so a mixed-language form is worse than a consistent one. This design groups an account's reviewers by reviewer locale and issues one definition plus one instance set per **locale group**.

## Goals / Non-Goals

**Goals:**

- Review form definition labels and per-instance DESCRIPTION HTML use the same reviewer locale as the review email
- One Fusion review form definition per locale group; `buildFormName` already carries `[locale]` when localization is enabled
- Duplicate-review detection stays per reviewer across locale groups
- **Reset forms?** deletes every locale variant of an account's definitions
- Localization disabled stays English, one locale group, no name suffix

**Non-Goals:**

- Localizing emails or reports (already per recipient)
- New supported languages
- Per-reviewer form *content* differences beyond language (candidates, attributes, SEARCH_V2 query)
- Reissuing an in-flight instance when the reviewer's language attribute changes
- A tenant-wide shared form definition

## Decisions

### D1: Reuse `getRecipientLocale` for reviewer locale

- **Choice**: FormService resolves each reviewer's locale through `EmailService.getRecipientLocale` (hydrate identity, read attributes, `resolveEffectiveLocale`). Do not reimplement identity lookup in FormService. `resolveFormLocale` loses FormService as a caller; delete it once unused, or keep it only as a synonym of `resolveEffectiveLocale(config)` with no identity attributes.
- **Reason**: Discovery Q4 — same precedence as review email (identity language attribute, then `defaultLanguage`, then English).
- **Considered alternatives**: Copy `resolveEffectiveLocale` into FormService (duplicate hydration); keep `resolveFormLocale` as the form path (would still ignore identity language).

### D2: Full localization via locale groups, not instance-only HTML

- **Choice**: Group `createFusionForm` reviewers by reviewer locale. For each locale group, build one named definition (`buildFormName` + that locale) and one `formInput` HTML blob, then create instances only for reviewers in that group.
- **Reason**: Discovery Q1–Q2 — toggle/SELECT labels live on the definition; mixed French HTML + English controls is rejected.
- **Considered alternatives**: Instance-only HTML with `defaultLanguage` controls (inconsistent UI); one definition per reviewer (unnecessary API churn when several reviewers share a locale).

### D3: Existing `buildFormName` locale suffix is the collision scheme

- **Choice**: Pass the locale group's reviewer locale into `buildFormName`. When localization is enabled, names remain `… (accountKey) [locale]`. When disabled, no suffix and a single English group.
- **Reason**: Discovery Q3 / Q5 — the naming scheme already exists; it was always fed the same locale.
- **Considered alternatives**: Encode locale in description markers only (name collisions); per-reviewer unique names (definition explosion).

### D4: Duplicate-review detection is per reviewer across all locale groups of the account

- **Choice**: Before creating instances, collect `existingRecipientIds` from **every** Fusion review form definition for that managed account (all `[locale]` variants plus the unsuffixed name), not only the definition of the current locale group. A pending instance in any locale still counts as an existing review for that reviewer. Do not create a second instance if the reviewer already has one, even if their resolved locale changed.
- **Reason**: Discovery — French and German instances for two people are one review each; a language-attribute change must not reissue an in-flight review.
- **Considered alternatives**: Per-definition `existingRecipientIds` only (would reissue when locale changes or miss a reviewer on another variant); cancel and recreate on locale change (mutates in-flight reviews).

### D5: Stale localized-definition refresh is per locale group

- **Choice**: `shouldRefreshLocalizedFormDefinition` (and recreate/patch) evaluates each definition against **that group's** reviewer locale, not a single account-wide `formLocale`.
- **Reason**: A French definition must not be rewritten because `defaultLanguage` is German.
- **Considered alternatives**: One account-wide locale for refresh (would thrash definitions when groups differ).

### D6: Locale groups for one account are sequential

- **Choice**: Create or refresh locale-group definitions for one managed account sequentially. Parallelism across accounts is unchanged.
- **Reason**: `getOrCreateFormDefinition` already handles create-then-refetch 409 races; parallel groups for the same account would multiply that race without a measured win. Discovery deferred this; this is the apply default.
- **Considered alternatives**: Parallel `Promise.all` per locale group on one account (faster on multilingual accounts; more 409s). Revisit only if API latency shows up in tests.

### D7: Reset forms matches the name pattern, which already covers locale variants

- **Choice**: Keep `deleteExistingForms` on `findFormDefinitionsByName(fusionFormNamePattern)`. That search already returns `[locale]`-suffixed names that start with the pattern. Add an explicit test that a French and a German definition for the same account are both deleted. Do not switch to deleting only `buildFormName(..., defaultLanguage)`.
- **Reason**: Discovery — otherwise in-flight reviews in other languages survive a reset. Pattern search is already the right seam; the gap is the missing assertion once multiple locales exist, plus any future exact-name lookup.
- **Considered alternatives**: Delete only the `defaultLanguage` named definition (leaves other locales); enumerate supported locales and delete each exact name (misses unknown suffixes).

## Risks / Trade-offs

- [Risk] Extra Custom Forms API calls when an account's reviewers span N locales → Mitigation: N is bounded by supported locales (ten); sequential per account (D6); single-language tenants unchanged
- [Risk] `existingRecipientIds` scanned only on the current definition reissues reviews → Mitigation: D4 union across all account definition variants
- [Risk] Identity hydration for locale fails → Mitigation: `getRecipientLocale` already falls back to `resolveEffectiveLocale(config)` (defaultLanguage then English)
- [Trade-off] In-flight instance stays in the original language after an identity language change → Reason: do not mutate open reviews (same as restyle)
- [Trade-off] Sequential locale-group creates → Reason: keep 409 handling simple (D6)

## Migration Plan

1. Deploy connector. New Fusion reviews use reviewer locale and locale-group definitions. In-flight instances keep their original definition language until they complete or **Reset forms?** runs.
2. Operators who want a consistent inbox enable **Reset forms?** for one persistent aggregation. All locale variants of matching definitions are deleted; leftover instances are cancelled. Rematch creates locale-group instances.
3. Rollback: revert connector. Leftover `[locale]` definitions persist until Reset forms or stale cleanup. No schema/API migration.

Acceptance: two reviewers with different supported language attributes on one account get two definitions and two instances, each language-consistent end to end; missing language attribute falls back to `defaultLanguage` then English; localization disabled remains one English definition with no suffix; pending-review skip stays per reviewer; Reset forms deletes every locale variant for matching accounts.

## Open Questions

None blocking. Parallel locale-group creates (vs D6 sequential) may be revisited if Custom Forms latency on multilingual accounts is measured and unacceptable.
