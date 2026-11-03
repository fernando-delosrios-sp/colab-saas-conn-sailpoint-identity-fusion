## ADDED Requirements

### Requirement: Documentation SHALL explain Historical Record source packaging and limits

The documentation site SHALL provide a dedicated Historical Record source guide that explains headered dump placement, package build output, Source Settings file selection, Record Match behavior, INTERNAL report badges, package compatibility, and the ramfs memory constraint. It SHALL state that benchmark results are environment-specific and that runtime filesystem storage is not assumed to reduce container memory.

#### Scenario: Administrator configures a packaged historical dump
- **GIVEN** an administrator has a headered historical-record dump
- **WHEN** they follow the Historical Record source guide
- **THEN** they SHALL be able to package it, configure its file name, choose Record Match behavior, and recognize its `INTERNAL` report references
- **AND** the guide SHALL explain missing-file and incompatible-format failures

#### Scenario: Administrator evaluates memory evidence
- **GIVEN** an administrator is sizing a historical-record package for deployment
- **WHEN** they read the performance and troubleshooting guidance
- **THEN** it SHALL identify package size, throughput, heap, external memory, and RSS benchmark results
- **AND** it SHALL state that ramfs-backed files may consume the runtime memory budget
