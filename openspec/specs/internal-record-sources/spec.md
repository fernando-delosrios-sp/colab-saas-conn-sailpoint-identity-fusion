# internal-record-sources Specification

## Purpose

Defines how a headered internal-record dump is compiled into a versioned, stream-readable package and how those records are read with bounded memory. Benchmark evidence must record filesystem type and must not treat runtime filesystem storage as a way to reduce container memory.

## Requirements

### Requirement: Internal-record dumps SHALL compile into versioned stream-readable artifacts

The customizer package build SHALL parse each Internal-record dump named by the saved Internal Record configuration, using RFC 4180 commas and quotes, and emit a deterministic, versioned manifest and compact stream-readable record artifacts. The manifest SHALL identify the original file name, headers, record count, format version, and artifact locations. The deployable package SHALL NOT include the original dump. The Account ID field in the saved schema SHALL become `nativeIdentity`. The Account Name field SHALL become the account name, and an empty account name SHALL fall back to the Account ID. The build SHALL fail when an Account ID is blank or duplicated.

#### Scenario: Headered dump compiles deterministically
- **GIVEN** a dump with headers, quoted commas, embedded newlines, and empty cells
- **AND** a saved schema that chooses Account ID and Account Name columns
- **WHEN** the customizer package build runs twice with identical input
- **THEN** each build SHALL produce equivalent manifest metadata and record artifacts
- **AND** the record stream SHALL reconstruct the saved header-to-value associations
- **AND** neither deployable output SHALL contain the source CSV

#### Scenario: Invalid dump fails with file context
- **GIVEN** an internal-record dump with malformed CSV, duplicate headers, a blank Account ID, or a duplicate Account ID
- **WHEN** the customizer package build runs
- **THEN** it SHALL fail before packaging
- **AND** the error SHALL identify the file and the invalid header or row

### Requirement: Internal-record stream processing SHALL retain bounded account bodies

The internal-record reader SHALL decode records sequentially, apply the saved Internal Record schema, and apply the referenced attribute set before work-queue registration. It SHALL NOT load the full manifest payload, artifact, CSV text, or parsed record collection into a JavaScript object collection.

#### Scenario: Large artifact streams through bounded processing
- **GIVEN** an internal-record artifact with more records than one processing batch
- **WHEN** the connector fetches the Internal Record source
- **THEN** records SHALL be decoded and registered incrementally
- **AND** each registered record SHALL use the saved Account ID as `nativeIdentity` and the saved Account Name as the account name
- **AND** each registered record SHALL contain only referenced attributes and system fields
- **AND** the reader SHALL NOT retain all decoded account bodies after they are claimed

### Requirement: Packaging SHALL infer an Internal Record schema

The pack SHALL create one schema field per CSV header. A field SHALL start as multi-valued when any value contains an unquoted semicolon. A quoted semicolon SHALL NOT mark the field multi-valued. The operator SHALL be able to flip a field's multi-valued flag or edit the CSV and re-scan before the answers are saved. The connector SHALL use the saved flag and SHALL NOT scan the dump again.

#### Scenario: Unquoted semicolon marks a field multi-valued
- **GIVEN** a dump whose `AFFILS` column contains an unquoted semicolon in one row
- **WHEN** the pack infers the schema
- **THEN** `AFFILS` SHALL start as multi-valued

#### Scenario: Quoted semicolon stays a single value
- **GIVEN** a dump whose only semicolon in `NOTES` is inside quotes
- **WHEN** the pack infers the schema
- **THEN** `NOTES` SHALL start as single-valued
- **AND** the quoted semicolon SHALL remain part of that one value

#### Scenario: Operator override is what the connector uses
- **GIVEN** a field that started as multi-valued
- **AND** the operator saves it as single-valued
- **WHEN** the connector reads a cell in that field that still contains an unquoted semicolon
- **THEN** the cell SHALL remain one string

### Requirement: Multi-valued fields SHALL split on unquoted semicolons

When the saved schema marks a field multi-valued, the connector SHALL split each cell on unquoted semicolons into a list of strings. A quoted semicolon SHALL remain inside one list entry. Empty entries produced by the split SHALL be dropped.

#### Scenario: Unquoted semicolons become a list
- **GIVEN** a multi-valued field whose cell is `staff;faculty`
- **WHEN** the connector builds the account attribute
- **THEN** the attribute SHALL be the list `staff`, `faculty`

#### Scenario: Quoted semicolon remains one list entry
- **GIVEN** a multi-valued field whose cell quotes a semicolon
- **WHEN** the connector builds the account attribute
- **THEN** that quoted semicolon SHALL remain inside a single list entry

### Requirement: Internal-record performance evidence SHALL account for ramfs memory

The customizer SHALL provide a repeatable benchmark that compares streaming CSV input with the compiled internal-record artifact and records package bytes, records per second, elapsed time, heap usage, external memory, RSS, and available filesystem type information. Documentation SHALL state that a ramfs is not assumed to reduce runtime memory use.

#### Scenario: Benchmark reports comparable measurements
- **GIVEN** the benchmark fixture and both source and compiled formats
- **WHEN** the benchmark command completes
- **THEN** it SHALL report measurements for both readers in separate process runs
- **AND** each result SHALL include package size, elapsed time, throughput, heap, external memory, and RSS
- **AND** the report SHALL identify filesystem type when the platform exposes it
