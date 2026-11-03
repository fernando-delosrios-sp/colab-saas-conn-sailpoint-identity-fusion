# internal-record-sources Specification

## Purpose

Defines how a headered internal-record dump is compiled into a versioned, stream-readable package and how those records are read with bounded memory. Benchmark evidence must record filesystem type and must not treat runtime filesystem storage as a way to reduce container memory.

## Requirements

### Requirement: Internal-record dumps SHALL compile into versioned stream-readable artifacts

The customizer package build SHALL parse each configured headered internal-record dump with CSV-compliant quoting semantics and emit a deterministic, versioned manifest and compact stream-readable record artifacts. The manifest SHALL identify the original file name, headers, record count, format version, and artifact locations. The deployable package SHALL NOT include the original dump.

#### Scenario: Headered dump compiles deterministically
- **GIVEN** `Internal Records.csv` with headers, quoted commas, embedded newlines, and empty cells
- **WHEN** the customizer package build runs twice with identical input
- **THEN** each build SHALL produce equivalent manifest metadata and record artifacts
- **AND** the record stream SHALL reconstruct the original header-to-value associations
- **AND** neither deployable output SHALL contain the source CSV

#### Scenario: Invalid dump fails with file context
- **GIVEN** an internal-record dump with malformed CSV or duplicate headers
- **WHEN** the customizer package build runs
- **THEN** it SHALL fail before packaging
- **AND** the error SHALL identify the file and the invalid header or row

### Requirement: Internal-record stream processing SHALL retain bounded account bodies

The internal-record reader SHALL decode records sequentially and SHALL apply the referenced attribute set before work-queue registration. It SHALL NOT load the full manifest payload, artifact, CSV text, or parsed record collection into a JavaScript object collection.

#### Scenario: Large artifact streams through bounded processing
- **GIVEN** an internal-record artifact with more records than one processing batch
- **WHEN** the connector fetches the Internal Record source
- **THEN** records SHALL be decoded and registered incrementally
- **AND** each registered record SHALL contain only referenced attributes and system fields
- **AND** the reader SHALL NOT retain all decoded account bodies after they are claimed

### Requirement: Internal-record performance evidence SHALL account for ramfs memory

The customizer SHALL provide a repeatable benchmark that compares streaming CSV input with the compiled internal-record artifact and records package bytes, records per second, elapsed time, heap usage, external memory, RSS, and available filesystem type information. Documentation SHALL state that a ramfs is not assumed to reduce runtime memory use.

#### Scenario: Benchmark reports comparable measurements
- **GIVEN** the benchmark fixture and both source and compiled formats
- **WHEN** the benchmark command completes
- **THEN** it SHALL report measurements for both readers in separate process runs
- **AND** each result SHALL include package size, elapsed time, throughput, heap, external memory, and RSS
- **AND** the report SHALL identify filesystem type when the platform exposes it
