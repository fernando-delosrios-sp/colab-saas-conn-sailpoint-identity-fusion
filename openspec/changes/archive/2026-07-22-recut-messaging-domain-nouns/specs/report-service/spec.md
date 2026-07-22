# report-service Spec

## ADDED Requirements

### Requirement: Unified report building, rendering, and directory management
The Report module MUST provide a consolidated interface for creating report payloads, rendering report outputs (HTML/PDF), managing output directories (`mkdir`), and delivering reports.

#### Scenario: End-to-end report generation and directory creation
- **GIVEN** report target parameters and payload data
- **WHEN** `ReportService.generateReport` is called
- **THEN** the required destination directory is created if missing
- **AND** the report document is built and rendered to disk
- **AND** delivery metadata is returned

---

## MODIFIED Requirements

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
