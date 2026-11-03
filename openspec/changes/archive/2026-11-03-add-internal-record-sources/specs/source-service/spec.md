## ADDED Requirements

### Requirement: Source service SHALL resolve configured Internal Record sources from the customizer package

When a Source Settings entry identifies an internal-record file, SourceService SHALL resolve it against the customizer manifest as an Internal Record source with Record type and internal provenance. It SHALL NOT require an ISC managed source or source ID for that entry, and it SHALL keep ISC discovery and fetch behavior unchanged for configured managed sources.

#### Scenario: Named packaged dump becomes an Internal Record source
- **GIVEN** Source Settings configures `Internal Records.csv` as an Internal Record source
- **AND** the attached customizer manifest contains that file
- **WHEN** source discovery completes
- **THEN** the source SHALL be available to the aggregation pipeline with Record type and internal provenance
- **AND** SourceService SHALL NOT call ISC source discovery or account listing for that source

#### Scenario: Configured internal file is absent
- **GIVEN** Source Settings configures `Internal Records.csv`
- **AND** the attached manifest does not contain that file
- **WHEN** Setup validates sources
- **THEN** Setup SHALL fail before Fetch
- **AND** the error SHALL name the configured file and customizer package requirement

### Requirement: Internal Record sources SHALL use existing Record-source processing controls

Internal Record sources SHALL honor the Record-source **Include record accounts in Match** setting. When enabled or omitted they SHALL enter Map, Define, and Match processing; when disabled they SHALL use selective Map and unique-attribute registration without Match scoring. In either case they SHALL NOT create a Fusion account solely because they are unmatched.

#### Scenario: Internal record enters Match by default
- **GIVEN** an Internal Record source with no explicit Include record accounts in Match value
- **WHEN** its record is processed
- **THEN** it SHALL follow the existing Record source Match path
- **AND** an unmatched record SHALL not create a Fusion account

#### Scenario: Internal record skips Match when configured
- **GIVEN** an Internal Record source with Include record accounts in Match disabled
- **WHEN** its record is processed
- **THEN** it SHALL register mapped unique attributes without Match scoring
- **AND** it SHALL be released from the work queue after registration
