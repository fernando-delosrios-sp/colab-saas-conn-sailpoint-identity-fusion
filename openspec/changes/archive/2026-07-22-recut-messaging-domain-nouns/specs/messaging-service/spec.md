# messaging-service Spec

## ADDED Requirements

### Requirement: Email rendering MUST accept clean domain DTOs without coupling to form or match scoring internals
The email rendering component (`EmailRenderer` / refactored `MessagingService`) MUST render email templates, Handlebars helpers, and localized strings using dedicated domain DTOs, without importing match-scoring internal types or form-building structures.

#### Scenario: Rendering an email with domain DTO
- **GIVEN** an email rendering request with a standard email payload DTO
- **WHEN** `EmailRenderer.renderEmail` is called
- **THEN** HTML and text email contents are rendered successfully
- **AND** no dependencies on `FormService` structures or `MatchingService` scoring internals are required

---

## MODIFIED Requirements

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
