# records-customizer Specification

## Purpose
Defines the structure, compilation, and execution behavior of the standalone Records Customizer project (`customizers/records/`).

## Requirements

### Requirement: Records Customizer compiles attribute CSV files to sorted binary hash indexes

The customizer packaging build script (`npm run pack-zip`) SHALL read all `<attributeName>.csv` files in the `values/` directory and compile each into a compact, sorted 64-bit binary hash index file named `<attributeName>.bin` placed in the customizer output directory.

#### Scenario: Single-column CSV compiled to sorted 64-bit binary hash file
- **GIVEN** a file `values/sAMAccountName.csv` containing lines with usernames
- **WHEN** the `build-indices` script runs during `pack-zip`
- **THEN** each non-empty trimmed line SHALL be hashed using 64-bit FNV-1a
- **AND** the 64-bit hashes SHALL be deduplicated and sorted in ascending order
- **AND** the sorted hashes SHALL be written as contiguous 8-byte integers into `data/sAMAccountName.bin`

#### Scenario: Empty or whitespace-only CSV handled gracefully
- **GIVEN** a file `values/employeeNumber.csv` containing no entries or only whitespace
- **WHEN** the `build-indices` script runs
- **THEN** an empty `data/employeeNumber.bin` SHALL be produced without error
- **AND** the compilation process SHALL log that 0 values were indexed

### Requirement: Records Customizer passes index directory path to connector

The customizer SHALL implement a `beforeStdAccountList` hook that resolves the local directory containing pre-compiled binary index files and returns it to Identity Fusion via the `input.customizerIndicesDir` property.

#### Scenario: Customizer hook provides directory path
- **GIVEN** a deployed customizer package containing compiled `.bin` files under `data/`
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the customizer hook SHALL return the input object with `customizerIndicesDir` set to the absolute path of the `data/` directory

### Requirement: Records Customizer SHALL expose packaged internal records

The Records Customizer `beforeStdAccountList` hook SHALL retain the existing `customizerIndicesDir` contract and SHALL additionally provide the absolute location of the internal-record manifest and artifacts when they are packaged. A package without internal records SHALL remain valid.

#### Scenario: Hook provides both optional customizer payloads
- **GIVEN** a customizer package containing unique-value indexes and an internal-record manifest
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the returned input SHALL include `customizerIndicesDir`
- **AND** it SHALL include the resolved internal-record package location

#### Scenario: Existing index-only package remains compatible
- **GIVEN** a customizer package containing only unique-value indexes
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the hook SHALL provide the index directory as before
- **AND** the connector SHALL not treat the absence of internal-record artifacts as an error
