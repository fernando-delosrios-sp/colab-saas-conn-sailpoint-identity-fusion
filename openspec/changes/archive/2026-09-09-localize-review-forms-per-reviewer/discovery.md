# Discovery — localize-review-forms-per-reviewer

## Scope

In: resolve the Fusion review form locale per reviewer (identity language attribute, then `defaultLanguage`, then English) for both the per-instance DESCRIPTION HTML and the form definition labels, by grouping an account's reviewers by resolved locale and issuing one definition plus one instance set per locale group. Out: localizing anything outside review forms (emails and reports already resolve per recipient), adding new supported languages, and per-reviewer form *content* differences beyond language.

## Language

**Reviewer locale** (`promote`):
The supported locale resolved for one reviewer identity via `resolveEffectiveLocale` — identity language attribute first, then `defaultLanguage`, then English. It is the locale of everything that reviewer reads, in the review email and now in the review form.
_Avoid_: form locale (that is the account-wide, `defaultLanguage`-only value being replaced), recipient language, preferred language.

**Locale group** (`promote`):
The set of an account's reviewers sharing one reviewer locale. One locale group receives one Fusion review form definition and one review form instance per reviewer in the group.
_Avoid_: reviewer batch, language cohort.

**Fusion review form definition** (`conflicts-with-canonical`):
Canonically "the ISC Custom Forms definition named from `fusionFormNamePattern` plus the managed account's identity, used as the template for that account's Fusion review instance(s)." After this change an account has one definition **per locale group**, not one definition outright. The canonical entry needs the locale dimension added.

## Decisions

Context: before the DESCRIPTION HTML restyle, every localizable string lived in the form definition, and one definition serves all reviewers of a managed account. Per-reviewer language was therefore impossible, and `resolveFormLocale` was deliberately narrowed to `defaultLanguage` only (commit `e025b04`), with the constraint written into both `form-service` and `report-service` specs. The restyle moved the account panel and candidate score tables into per-instance `formInput` HTML, which removes that blocker for the bulk of the visible text.

- Q1: Does per-instance HTML alone solve it? No. The `newIdentity` TOGGLE label, its true/false labels and helpText, and the identities SELECT label and helpText still live in `formElements` on the definition.
- Q2: Instance-only localization (HTML per reviewer, controls on `defaultLanguage`) or full? **Full** — a form that mixes a French account panel with an English toggle is worse than either consistent option.
- Q3: How do multiple definitions per account avoid collisions? `buildFormName` already appends `[locale]` when localization is enabled, so the naming scheme carries the locale dimension today; it is simply always fed the same locale.
- Q4: Where does reviewer locale resolution live? `EmailService.getRecipientLocale` already does exactly this (hydrates the identity, reads attributes, calls `resolveEffectiveLocale`). Reuse rather than reimplement in `FormService`.
- Q5: What happens when localization is disabled? Everything stays English and every account collapses to a single locale group — the current behavior, unchanged.

## Open questions

- Deferred (implementation detail for apply): whether locale groups create their definitions sequentially or in parallel, given the existing create-then-refetch race handling in `getOrCreateFormDefinition`.

## Scenarios discussed

- Two reviewers with different language attributes on the same managed account → two definitions, two instances, each reviewer reads their own language end to end.
- Reviewer with no language attribute → falls back to `defaultLanguage`, then English.
- Localization disabled → one locale group, English, no extra definitions and no name suffix.
- **Reset forms?** must delete every `[locale]` variant for an account, not only the `defaultLanguage` one, or in-flight reviews survive the reset.
- Duplicate-review detection: a reviewer's French instance and another reviewer's German instance are the same review for two people, not two reviews — `existingRecipientIds` and pending-review analysis must stay per reviewer.
- A reviewer's language attribute changes between runs while a review is in flight → the pending instance is not reissued; the reviewer keeps the original language until the review closes.
- Stale-definition refresh (`shouldRefreshLocalizedFormDefinition`) evaluates each locale's definition against that locale, not against a single account-wide locale.
