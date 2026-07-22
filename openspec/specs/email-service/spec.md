# email-service Specification

## Purpose
TBD - created by archiving change decouple-messaging-domain-services. Update Purpose after archive.
## Requirements
### Requirement: Email Rendering and Delivery
The `EmailService` SHALL compile localized Handlebars templates and dispatch emails directly via `ClientService`.

#### Scenario: Send template-compiled localized email
- **WHEN** `sendEmail` is called with recipient addresses, template parameters, and locale
- **THEN** `EmailService` compiles the Handlebars template and delivers the email via `ClientService`

#### Scenario: Direct HTML email dispatch
- **WHEN** `sendEmail` is called with pre-rendered HTML body and recipient details
- **THEN** `EmailService` transmits the raw HTML email directly via `ClientService`

#### Scenario: Account attribute display truncation
- **WHEN** attribute values are rendered in email templates
- **THEN** `EmailService` applies cell-display truncation matching the ~270px left summary column layout without breaking glyph boundaries

