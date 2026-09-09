## ADDED Requirements

### Requirement: Review forms SHALL use one Fusion review form definition per locale group

When `enableLocalization` is true, FormService MUST group an account's reviewers by **reviewer locale** and MUST create or reuse one Fusion review form definition per locale group. The definition name MUST use `buildFormName` with that group's locale (`[locale]` suffix). Definition labels (toggle, SELECT) and per-instance DESCRIPTION HTML MUST both use that locale. When localization is disabled, FormService MUST use a single English locale group and MUST NOT append a locale suffix.

#### Scenario: Two reviewers with different language attributes get two definitions

- **GIVEN** `enableLocalization` is true
- **AND** two reviewers of one managed account have supported identity language attributes `fr` and `de`
- **WHEN** FormService creates Fusion reviews for that account
- **THEN** it MUST create or reuse two Fusion review form definitions named with `[fr]` and `[de]`
- **AND** the French reviewer MUST receive an instance whose definition labels and DESCRIPTION HTML are French
- **AND** the German reviewer MUST receive an instance whose definition labels and DESCRIPTION HTML are German

#### Scenario: Localization disabled uses one English definition with no suffix

- **GIVEN** `enableLocalization` is false
- **AND** reviewers have non-English identity language attributes
- **WHEN** FormService creates Fusion reviews for that account
- **THEN** it MUST create or reuse a single Fusion review form definition
- **AND** the definition name MUST NOT include a `[locale]` suffix
- **AND** form strings MUST be English

---

### Requirement: Pending Fusion reviews SHALL stay one per reviewer across locale groups

FormService MUST treat a reviewer as already having a Fusion review for a managed account when that reviewer is a recipient of a pending instance on **any** locale-group definition for that account. FormService MUST NOT create a second instance because the reviewer's locale differs from the pending instance's definition locale, including when the identity language attribute changed since the instance was created.

#### Scenario: Distinct reviewers on different locale groups are not duplicate reviews

- **GIVEN** a managed account with a pending French instance for reviewer A and a pending German instance for reviewer B
- **WHEN** FormService evaluates existing recipients before creating instances
- **THEN** reviewer A MUST be treated as already reviewed in French
- **AND** reviewer B MUST be treated as already reviewed in German
- **AND** FormService MUST NOT treat those two instances as two reviews for the same person

#### Scenario: Language attribute change does not reissue an in-flight review

- **GIVEN** a reviewer has a pending Fusion review instance on a French locale-group definition
- **AND** the reviewer's identity language attribute is now `de`
- **WHEN** FormService creates Fusion reviews for that account
- **THEN** FormService MUST NOT create a German instance for that reviewer
- **AND** the pending French instance MUST remain the in-flight review

---

### Requirement: Stale localized-definition refresh SHALL use the locale group's reviewer locale

When localization is enabled, FormService MUST evaluate `shouldRefreshLocalizedFormDefinition` (and any recreate or patch) for each Fusion review form definition against that definition's locale group locale. FormService MUST NOT refresh a definition solely because a different locale group or `defaultLanguage` differs from that definition's locale.

#### Scenario: French definition is not refreshed for a German defaultLanguage

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is `de`
- **AND** a French locale-group definition already has French labels matching locale `fr`
- **WHEN** FormService prepares the French locale group
- **THEN** it MUST NOT treat that definition as stale solely because `defaultLanguage` is `de`

---

### Requirement: Reset forms SHALL delete every locale variant of matching Fusion review form definitions

`deleteExistingForms` MUST delete every Fusion review form definition whose name matches `fusionFormNamePattern`, including `[locale]`-suffixed variants for the same managed account. It MUST NOT delete only the `defaultLanguage` named definition while leaving other locale variants.

#### Scenario: Reset forms deletes French and German variants for the same account

- **GIVEN** two Fusion review form definitions for one managed account named with `[fr]` and `[de]`
- **WHEN** `deleteExistingForms` runs
- **THEN** both definitions MUST be deleted
- **AND** leftover in-flight instances for those definitions MUST be cancelled or closed

---

## MODIFIED Requirements

### Requirement: Review forms SHALL localize to reviewer locale when localization is enabled

When `enableLocalization` is true, the form service MUST translate user-facing review form strings (section labels, descriptions, toggle labels, helpText, score display text) using `locales.ts` and `translate()`. The locale MUST be the **reviewer locale** from `EmailService.getRecipientLocale` (identity language attribute, then `defaultLanguage`, then English). Definition labels and per-instance DESCRIPTION HTML MUST use the same reviewer locale. When localization is disabled, forms MUST remain English. When no supported identity language or `defaultLanguage` is configured, forms MUST fall back to English.

#### Scenario: Localization enabled with French defaultLanguage

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is `fr`
- **AND** the reviewer has no supported identity language attribute
- **WHEN** `FormService` creates a fusion review form definition for that reviewer's locale group
- **THEN** translatable form field labels and helpText MUST be French from `locales.ts`

#### Scenario: Reviewer language attribute sets form locale

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is unset (English fallback)
- **AND** the reviewer identity has a supported language attribute set to `ja`
- **WHEN** `FormService` creates a fusion review form definition for that reviewer's locale group
- **THEN** form strings MUST be Japanese
- **AND** MUST NOT stay English solely because `defaultLanguage` is unset

#### Scenario: Recipient language does not override form locale

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is unset (English fallback)
- **AND** the reviewer identity has a supported language attribute set to `ja`
- **WHEN** `FormService` creates a fusion review form definition for that reviewer's locale group
- **THEN** form strings MUST be Japanese
- **AND** MUST NOT stay English solely because `defaultLanguage` is unset
- **AND** the Fusion review email for that reviewer MUST also be Japanese via the same reviewer locale

#### Scenario: Localization disabled

- **GIVEN** `enableLocalization` is false
- **WHEN** `FormService` creates a form definition
- **THEN** form strings MUST be English

#### Scenario: Unsupported defaultLanguage falls back to English

- **GIVEN** `enableLocalization` is true and `defaultLanguage` is unsupported
- **AND** the reviewer has no supported identity language attribute
- **WHEN** a form definition is built
- **THEN** strings MUST fall back to English via `translate()`

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

- FROM: `### Requirement: Review forms SHALL localize to defaultLanguage when localization is enabled`
- TO: `### Requirement: Review forms SHALL localize to reviewer locale when localization is enabled`
