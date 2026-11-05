## ADDED Requirements

### Requirement: Source service SHALL reject an Internal Record source name that matches a configured source

When an Internal Record source name equals the name of a configured source, setup SHALL fail before Fetch. The error SHALL name the shared source. A configured source with no Internal Record entry of the same name SHALL keep its Identity Security Cloud account feed.

#### Scenario: Shared name fails setup
- **GIVEN** the packaged Internal Record configuration names a source `Sample Records`
- **AND** Source Settings contains a source named `Sample Records`
- **WHEN** setup resolves sources
- **THEN** setup SHALL fail before Fetch
- **AND** the error SHALL name `Sample Records`

#### Scenario: Distinct names keep the Identity Security Cloud feed
- **GIVEN** Source Settings contains `Workday`
- **AND** no Internal Record source is named `Workday`
- **WHEN** setup resolves sources
- **THEN** `Workday` SHALL be fetched from Identity Security Cloud

### Requirement: Internal Record sources SHALL apply the saved Accounts JMESPath filter

SourceService SHALL apply the Accounts JMESPath filter saved for an Internal Record source while streaming its accounts. An empty filter SHALL accept every account. An invalid expression SHALL fail packaging, before a zip is produced.

#### Scenario: Saved filter drops non-matching rows
- **GIVEN** an Internal Record source whose saved filter keeps only `department` equal to `Engineering`
- **WHEN** the connector streams that source
- **THEN** rows outside Engineering SHALL NOT be registered
- **AND** rows inside Engineering SHALL be registered

## MODIFIED Requirements

### Requirement: Source service SHALL resolve configured Internal Record sources from the customizer package

When the customizer package contains an Internal Record configuration, SourceService SHALL resolve each entry as an Internal Record source with Record type and internal provenance. The source name, Include record accounts in Match flag, and Accounts JMESPath filter SHALL come from that entry. SourceService SHALL NOT require an Identity Security Cloud managed source or source ID for that entry, and SHALL NOT read an internal-record file from Source Settings. It SHALL keep Identity Security Cloud discovery and fetch behavior unchanged for configured sources that do not share an Internal Record source name.

#### Scenario: Packaged configuration becomes an Internal Record source
- **GIVEN** the attached customizer contains a saved entry for `Sample Records.csv` named `Sample Records`
- **WHEN** source discovery completes
- **THEN** `Sample Records` SHALL be available to the aggregation pipeline with Record type and internal provenance
- **AND** SourceService SHALL NOT call Identity Security Cloud account listing for that source

#### Scenario: Packaged file is absent from the manifest
- **GIVEN** the Internal Record configuration names `Sample Records.csv`
- **AND** the attached manifest does not contain that file
- **WHEN** setup validates sources
- **THEN** setup SHALL fail before Fetch
- **AND** the error SHALL name `Sample Records.csv`

### Requirement: Internal Record sources SHALL use existing Record-source processing controls

Internal Record sources SHALL honor the Include record accounts in Match value saved in the Internal Record configuration. When that value is enabled they SHALL enter Map, Define, and Match processing. When it is disabled they SHALL use selective Map and unique-attribute registration without Match scoring. In either case they SHALL NOT create a Fusion account solely because they are unmatched.

#### Scenario: Saved Match flag scores the record
- **GIVEN** an Internal Record source whose saved Include record accounts in Match value is enabled
- **WHEN** its record is processed
- **THEN** it SHALL follow the existing Record source Match path
- **AND** an unmatched record SHALL NOT create a Fusion account

#### Scenario: Saved Match flag skips scoring
- **GIVEN** an Internal Record source whose saved Include record accounts in Match value is disabled
- **WHEN** its record is processed
- **THEN** it SHALL register mapped unique attributes without Match scoring
- **AND** it SHALL be released from the work queue after registration
