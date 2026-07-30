## ADDED Requirements

### Requirement: Localized report rendering and delivery

When `enableLocalization` is enabled, `ReportService` MUST resolve the effective locale for report recipients and MUST pass that locale to report HTML rendering and email subjects.

#### Scenario: Aggregation report uses recipient locale

- **GIVEN** `enableLocalization` is `true`
- **AND** the primary report recipient identity resolves to locale `'es'`
- **WHEN** `ReportService` delivers an aggregation report email
- **THEN** `renderFusionReportHtml` MUST receive locale `'es'`
- **AND** the rendered HTML MUST contain Spanish translations for i18n template keys
- **AND** the email subject MUST be localized

#### Scenario: Dry-run report uses recipient locale

- **GIVEN** `enableLocalization` is `true`
- **AND** a dry-run report is generated with email delivery enabled
- **WHEN** the report HTML is rendered
- **THEN** the effective recipient locale MUST be applied the same way as aggregation reports

#### Scenario: Localization disabled for reports

- **GIVEN** `enableLocalization` is `false` or unset
- **WHEN** `ReportService` renders any report
- **THEN** the effective locale MUST be `'en'`

---

## MODIFIED Requirements

### Requirement: Unified report building, rendering, and directory management

The Report module MUST provide a consolidated interface for creating report payloads, rendering report HTML outputs via `EmailService`, managing output directories (`mkdir`), resolving recipient identity owners via `IdentityService`, and delivering reports. Dry-run reports SHALL use `includeNonMatches: false` (consolidated counters only, matching the default aggregation report behavior) and SHALL render through the same Handlebars template and email delivery path. When localization is enabled, report rendering MUST resolve and apply the primary recipient's effective locale.

#### Scenario: End-to-end report generation and directory creation

- **GIVEN** report target parameters and payload data
- **WHEN** `ReportService.generateReport` or `deliverReport` is called
- **THEN** the required destination directory is created if missing
- **AND** the report document is built, rendered to HTML via `EmailService` with the resolved locale when localization is enabled, and saved to disk
- **AND** delivery email is dispatched to recipient owners with a localized subject when localization is enabled

#### Scenario: Dry-run report uses aggregation report alignment

- **GIVEN** a dry-run mode execution has completed
- **WHEN** the dry-run report is generated
- **THEN** non-matched accounts SHALL appear as consolidated counters in the report stats, not as per-account rows
- **AND** the report SHALL use the same Handlebars template and `FusionReportEmailData` shape as the aggregation report
- **AND** the report title SHALL be `'Identity Fusion Dry Run Report'` when localization is disabled
- **AND** the report title MUST use the localized dry-run title when localization is enabled and a translation key exists
