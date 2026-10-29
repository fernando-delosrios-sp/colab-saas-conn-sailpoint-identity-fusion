# ubiquitous-language Spec

## ADDED Requirements

### Requirement: Glossary defines Customizer Value Store and Unique Values Customizer

The ubiquitous-language glossary SHALL define **Customizer Value Store** (a memory-efficient, binary-indexed store within Identity Fusion that loads pre-compiled 64-bit hash arrays from a linked customizer package to verify whether candidate attribute values conflict with existing reserved values without allocating string objects on the V8 heap) and **Unique Values Customizer** (a standalone SailPoint SaaS Connectivity customizer project containing single-column CSV files corresponding to unique attribute names, packaged with a build-time pre-compiler that converts values into sorted binary index files for consumption by Identity Fusion). Documentation and code SHALL NOT refer to the customizer value store as a "static cache" or "disk table".

#### Scenario: Customizer Value Store entry
- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up how pre-compiled customizer unique values are evaluated
- **THEN** a **Customizer Value Store** entry SHALL define it as a binary-indexed store in Identity Fusion that loads pre-compiled 64-bit hash arrays to check uniqueness without heap allocation

#### Scenario: Unique Values Customizer entry
- **GIVEN** a reader consults the ubiquitous-language spec glossary
- **WHEN** they look up the customizer package for reserved unique values
- **THEN** a **Unique Values Customizer** entry SHALL define it as a standalone customizer project compiling single-column CSVs into sorted binary indexes for Identity Fusion
