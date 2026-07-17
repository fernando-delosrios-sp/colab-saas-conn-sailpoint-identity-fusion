# messaging-service Spec

## Purpose

The messaging service (`src/services/messagingService/`) renders the email and report templates the connector sends when communicating changes to end users and operators. It owns the Handlebars helpers (`messagingHandlebarsRegistration.ts`), the cell-truncation logic for account-attribute cells (`accountAttributeValueDisplay.ts`), the locale and localization machinery, and the test fixtures. The truncation behavior in particular must stay in sync with the fixed ~270px left summary column in `fusion-*.hbs`. This spec defines the contract between the runtime values the template receives and the visible output.

## Requirements

### Requirement: Account attribute cells MUST be truncated to fit the fixed ~270px summary column

The messaging service MUST truncate account attribute values rendered in email and report templates to fit the fixed-width ~270px left summary column in `fusion-*.hbs`. Truncation MUST be applied via the cell-display helper, not by inline string manipulation in templates, and MUST respect locale-aware break points so multibyte text is not split mid-glyph.

#### Scenario: A long attribute value is truncated by the helper

- **GIVEN** an account attribute value that exceeds the summary column width when rendered
- **WHEN** the template renders the value through the cell-display helper
- **THEN** the rendered output fits within the column
- **AND** an ellipsis is appended to indicate truncation

#### Scenario: A short attribute value is rendered unchanged

- **GIVEN** an account attribute value that fits within the summary column width
- **WHEN** the template renders the value through the cell-display helper
- **THEN** the rendered output equals the original value verbatim
- **AND** no ellipsis is appended
