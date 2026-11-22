## MODIFIED Requirements

### Requirement: Records Customizer packaging SHALL save Internal Record configuration

The Records Customizer pack SHALL save an Internal Record configuration entry for each headered CSV in `records/`. An interactive pack SHALL prompt only when that file has no saved entry, and SHALL NOT prompt for matching/non-matching (`includeRecordAccountsInMatch`) settings. A non-interactive pack SHALL fail and name the file. Duplicate source names SHALL fail packaging. The saved file SHALL be copied into the deployable package, and the original CSV SHALL NOT be included.

#### Scenario: Missing configuration prompts and is saved

- **GIVEN** `records/Sample Records.csv` has no saved Internal Record configuration
- **AND** the pack is interactive
- **WHEN** the operator confirms the source name, JMESPath filter, Account ID field, and Account Name field
- **THEN** the pack SHALL save those answers for that file without prompting for or storing `includeRecordAccountsInMatch`
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
