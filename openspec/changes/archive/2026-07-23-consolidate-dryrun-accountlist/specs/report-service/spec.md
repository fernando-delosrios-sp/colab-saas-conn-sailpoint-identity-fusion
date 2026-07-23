## MODIFIED Requirements

### Requirement: Unified report building, rendering, and directory management
The Report module MUST provide a consolidated interface for creating report payloads, rendering report HTML outputs via `EmailService`, managing output directories (`mkdir`), resolving recipient identity owners via `IdentityService`, and delivering reports. Dry-run reports SHALL use `includeNonMatches: false` (consolidated counters only, matching the default aggregation report behavior) and SHALL render through the same Handlebars template and email delivery path.

#### Scenario: End-to-end report generation and directory creation
- **GIVEN** report target parameters and payload data
- **WHEN** `ReportService.generateReport` or `deliverReport` is called
- **THEN** the required destination directory is created if missing
- **AND** the report document is built, rendered to HTML via `EmailService`, and saved to disk
- **AND** delivery email is dispatched to recipient owners

#### Scenario: Dry-run report uses aggregation report alignment
- **GIVEN** a dry-run mode execution has completed
- **WHEN** the dry-run report is generated
- **THEN** non-matched accounts SHALL appear as consolidated counters in the report stats, not as per-account rows
- **AND** the report SHALL use the same Handlebars template and `FusionReportEmailData` shape as the aggregation report
- **AND** the report title SHALL be `'Identity Fusion Dry Run Report'`
