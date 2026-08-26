# report-service Delta

## ADDED Requirements

### Requirement: Report titles distinguish dry-run, Fusion, and aggregation reports
Rendered HTML and email subjects MUST use distinct titles for the **dry-run report**, **Fusion report**, and **aggregation report**. All three MUST use the same Handlebars template family and `FusionReportEmailData` shape. When localization is disabled, the dry-run report title MUST be `'Identity Fusion Dry Run Report'`, the Fusion report title MUST be `'Identity Fusion Report'`, and the aggregation report title MUST be `'Identity Fusion Aggregation Report'`. When localization is enabled, each title MUST use its own translation key.

#### Scenario: Aggregation report title is not the Fusion report title
- **GIVEN** localization is disabled
- **WHEN** an aggregation report email is delivered
- **THEN** the rendered title MUST be `'Identity Fusion Aggregation Report'`
- **AND** MUST NOT be `'Identity Fusion Report'`

#### Scenario: Fusion report title is Identity Fusion Report
- **GIVEN** localization is disabled
- **WHEN** a Fusion report email is delivered after the `report` action
- **THEN** the rendered title MUST be `'Identity Fusion Report'`

### Requirement: Fusion report is the same Match preview as the dry-run report
A Fusion report MUST use `includeNonMatches: false` (consolidated non-match counters) and MUST include the same Match preview slices as a dry-run report for the same in-memory tracker (identity matches, deferred matches, failed matching entries). Recipients MUST be global owners. The Fusion report MUST NOT persist Fusion outcomes.

#### Scenario: Fusion report and dry-run report share Match cards
- **GIVEN** the same Match tracker slices from a non-persistent preview run
- **WHEN** a Fusion report is rendered
- **THEN** potential-match account cards SHALL match a dry-run report built from that tracker
- **AND** non-matched accounts SHALL appear as consolidated counters, not per-account rows

## MODIFIED Requirements

### Requirement: Unified report building, rendering, and directory management

The Report module MUST provide a consolidated interface for creating report payloads, rendering report HTML outputs via `EmailService`, managing output directories (`mkdir`), resolving recipient identity owners via `IdentityService`, and delivering reports. Dry-run reports SHALL use `includeNonMatches: false` (consolidated counters only, matching the default aggregation report behavior) and SHALL render through the same Handlebars template and email delivery path. When localization is enabled, report rendering MUST resolve locale via `resolveEffectiveLocale` for the primary recipient (identity language attribute, then `defaultLanguage`, then `'en'`). Review forms are out of scope and continue to use `resolveFormLocale` (`defaultLanguage` only).

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
- **AND** the title SHALL remain distinct from the aggregation report title and the Fusion report title
