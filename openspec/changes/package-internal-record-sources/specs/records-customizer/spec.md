## ADDED Requirements

### Requirement: Records Customizer packaging SHALL save Internal Record configuration

The Records Customizer pack SHALL read each headered CSV in `records/`. When `internal-record-configuration.json` has no entry for that file, an interactive pack SHALL prompt for the source name, Include record accounts in Match, the Accounts JMESPath filter, the Account ID field, and the Account Name field, and SHALL save the answers. A later pack SHALL reuse a saved entry without prompting. A non-interactive pack SHALL fail when any dump has no saved entry. The pack SHALL fail when two entries use the same source name. The saved file SHALL be copied into the deployable package. The original CSV SHALL NOT be included in that package.

#### Scenario: Missing configuration prompts and is saved
- **GIVEN** `records/Sample Records.csv` has no saved Internal Record configuration
- **AND** the pack is interactive
- **WHEN** the operator confirms the source name, Match flag, JMESPath filter, Account ID field, and Account Name field
- **THEN** the pack SHALL save those answers for that file
- **AND** a later pack of the same file SHALL reuse the saved answers without prompting

#### Scenario: Non-interactive pack refuses an unsaved dump
- **GIVEN** `records/Sample Records.csv` has no saved Internal Record configuration
- **AND** the pack has no interactive terminal
- **WHEN** the pack runs
- **THEN** it SHALL fail before producing a zip
- **AND** the error SHALL name the file

#### Scenario: Duplicate source name fails packaging
- **GIVEN** two dumps whose saved configuration uses the same source name
- **WHEN** the pack runs
- **THEN** it SHALL fail before producing a zip
- **AND** the error SHALL name that source

## MODIFIED Requirements

### Requirement: Records Customizer SHALL expose packaged internal records

The Records Customizer `beforeStdAccountList` hook SHALL provide the absolute location of the packaged Internal Record configuration, manifest, and artifacts when they are present. The hook SHALL NOT provide a unique-value index directory. A package with no Internal Record configuration SHALL remain valid.

#### Scenario: Hook provides the Internal Record package location
- **GIVEN** a customizer package containing an Internal Record configuration and manifest
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the returned input SHALL include the resolved Internal Record package location
- **AND** it SHALL NOT include a unique-value index directory

#### Scenario: Package without Internal Record artifacts remains valid
- **GIVEN** a customizer package with no Internal Record configuration
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the hook SHALL complete
- **AND** the connector SHALL NOT treat the absence of Internal Record artifacts as an error

## REMOVED Requirements

### Requirement: Records Customizer compiles attribute CSV files to sorted binary hash indexes

**Reason**: Internal Record sources reserve unique values through record registration. The single-column `values/` index is retired.

**Migration**: Replace each reserved-value list with an Internal-record dump that carries those values on a unique attribute, then pack that dump.

### Requirement: Records Customizer passes index directory path to connector

**Reason**: The connector no longer loads a Customizer Value Store from the package.

**Migration**: Stop reading `customizerIndicesDir`. Unique collisions come from values registered during the run.
