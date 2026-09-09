## ADDED Requirements

_(none)_

---

## MODIFIED Requirements

### Requirement: Localization configuration gating

The connector SHALL read `enableLocalization`, `defaultLanguage`, and `identityLanguageAttribute` from `FusionConfig`. **User communications** (review emails, report delivery, Fusion review forms, and other recipient-facing messages) MUST resolve locale via `resolveEffectiveLocale(config, identityAttributes?)` with this precedence when localization is enabled: (1) recipient identity language attribute (configured `identityLanguageAttribute`, then legacy fallbacks), (2) `defaultLanguage`, (3) `'en'`. Review forms MUST use **reviewer locale** from the same precedence (via `EmailService.getRecipientLocale`). When localization is disabled, all surfaces MUST use `'en'`.

#### Scenario: Localization disabled

- **GIVEN** `enableLocalization` is `false` or unset
- **WHEN** the connector renders a review email or report
- **THEN** the effective locale MUST be `'en'`
- **AND** identity language attributes MUST NOT be read

#### Scenario: Localization enabled with configured identity attribute

- **GIVEN** `enableLocalization` is `true`
- **AND** `identityLanguageAttribute` is set to a custom attribute name
- **WHEN** the recipient identity has that attribute set to a supported language code
- **THEN** the effective locale MUST be the normalized code from that attribute

#### Scenario: Localization enabled with fallback to default language

- **GIVEN** `enableLocalization` is `true`
- **AND** no identity language attribute resolves to a supported code
- **WHEN** `defaultLanguage` is configured
- **THEN** the effective locale MUST be the normalized `defaultLanguage` value

#### Scenario: Localization enabled with English ultimate fallback

- **GIVEN** `enableLocalization` is `true`
- **AND** neither identity attributes nor `defaultLanguage` resolve to a supported code
- **WHEN** a user communication is rendered
- **THEN** the effective locale MUST be `'en'`

#### Scenario: Review forms use reviewer locale

- **GIVEN** `enableLocalization` is `true` and `defaultLanguage` is `ja`
- **AND** the reviewer identity language attribute resolves to locale `en`
- **WHEN** `FormService` builds a review form definition for that reviewer
- **THEN** form labels MUST use locale `en`
- **AND** MUST NOT use `ja` solely because it is `defaultLanguage`

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
