# unique-values-customizer Specification

## Purpose
Defines the structure, compilation, and execution behavior of the standalone Unique Values Customizer project (`customizers/unique-ids/`).

## Requirements

### Requirement: Unique Values Customizer compiles attribute CSV files to sorted binary hash indexes

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

### Requirement: Unique Values Customizer passes index directory path to connector

The customizer SHALL implement a `beforeStdAccountList` hook that resolves the local directory containing pre-compiled binary index files and returns it to Identity Fusion via the `input.customizerIndicesDir` property.

#### Scenario: Customizer hook provides directory path
- **GIVEN** a deployed customizer package containing compiled `.bin` files under `data/`
- **WHEN** Identity Security Cloud invokes `beforeStdAccountList`
- **THEN** the customizer hook SHALL return the input object with `customizerIndicesDir` set to the absolute path of the `data/` directory
