## ADDED Requirements

### Requirement: Localization configuration gating

The connector SHALL read `enableLocalization`, `defaultLanguage`, and `identityLanguageAttribute` from `FusionConfig` and SHALL apply them when resolving locale for user-facing communications.

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

---

### Requirement: Localized review email subjects

When localization is enabled, review email subjects MUST be rendered in the recipient's effective locale.

#### Scenario: Spanish review email subject

- **GIVEN** `enableLocalization` is `true`
- **AND** the primary recipient resolves to locale `'es'`
- **WHEN** `sendFusionEmail` dispatches a review notification
- **THEN** the email subject MUST use the Spanish translation for the review subject template
- **AND** MUST NOT contain the English-only default subject string

---

## MODIFIED Requirements

### Requirement: Email Rendering and Delivery

The `EmailService` SHALL compile localized Handlebars templates and dispatch emails directly via `ClientService`. When `enableLocalization` is enabled, `EmailService` SHALL resolve the recipient's effective locale from `FusionConfig` and identity attributes before template compilation.

#### Scenario: Send template-compiled localized email

- **GIVEN** `enableLocalization` is `true`
- **WHEN** `sendFusionEmail` is called for a recipient with a resolvable language attribute
- **THEN** `EmailService` MUST set `locale` on template data to the effective locale
- **AND** MUST compile Handlebars templates producing translated body content
- **AND** MUST deliver the email via `ClientService`

#### Scenario: Direct HTML email dispatch

- **WHEN** `sendEmail` is called with pre-rendered HTML body and recipient details
- **THEN** `EmailService` transmits the raw HTML email directly via `ClientService`

#### Scenario: Account attribute display truncation

- **WHEN** attribute values are rendered in email templates
- **THEN** `EmailService` applies cell-display truncation matching the ~270px left summary column layout without breaking glyph boundaries
