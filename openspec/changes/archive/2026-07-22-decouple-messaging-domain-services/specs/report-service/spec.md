## MODIFIED Requirements

### Requirement: Unified report building, rendering, and directory management
The Report module MUST provide a consolidated interface for creating report payloads, rendering report HTML outputs via `EmailService`, managing output directories (`mkdir`), resolving recipient identity owners via `IdentityService`, and delivering reports.

#### Scenario: End-to-end report generation and directory creation
- **GIVEN** report target parameters and payload data
- **WHEN** `ReportService.generateReport` or `deliverReport` is called
- **THEN** the required destination directory is created if missing
- **AND** the report document is built, rendered to HTML via `EmailService`, and saved to disk
- **AND** delivery email is dispatched to recipient owners
