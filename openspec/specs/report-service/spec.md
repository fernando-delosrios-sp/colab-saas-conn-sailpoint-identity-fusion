# report-service Spec

## Purpose

The report service resolves account identifiers for report links, mapping Fusion accounts and managed account keys to their canonical ISC account IDs, and provides a unified interface for report generation, rendering, directory management, and email delivery.
## Requirements
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

### Requirement: Resolve report account ID from a FusionAccount
The `resolveReportAccountId` function SHALL return the ISC account ID to use in report links for a given `FusionAccount`, preferring the stored ISC id and falling back to resolving the managed account key via `SourceService`.

#### Scenario: FusionAccount has a stored ISC account id
- **WHEN** `fusionAccount.iscAccountId` is set
- **THEN** `resolveReportAccountId` MUST return that value without calling `SourceService`

#### Scenario: FusionAccount has no ISC account id but has a managed account key
- **WHEN** `fusionAccount.iscAccountId` is missing and `fusionAccount.managedAccountId` is present
- **THEN** `resolveReportAccountId` MUST call `SourceService.resolveIscAccountIdForManagedKey` with the managed key and return the resolved id

#### Scenario: FusionAccount has neither id
- **WHEN** both `fusionAccount.iscAccountId` and `fusionAccount.managedAccountId` are missing
- **THEN** `resolveReportAccountId` MUST return `undefined`

---

### Requirement: Resolve report account ID from a managed account key
The `resolveReportAccountIdValue` function SHALL resolve an arbitrary account id value to an ISC account id using `SourceService`, returning `undefined` for empty inputs.

#### Scenario: Raw value is a managed account key
- **WHEN** the input value is a non-empty managed account key
- **THEN** `resolveReportAccountIdValue` MUST call `SourceService.resolveIscAccountIdForManagedKey` and return the resolved id

#### Scenario: Raw value is empty
- **WHEN** the input value is `undefined` or empty
- **THEN** `resolveReportAccountIdValue` MUST return `undefined` without calling `SourceService`

