## ADDED Requirements

### Requirement: Glossary defines Refreshed progress unit

The ubiquitous-language glossary SHALL define **Refreshed (progress unit)** as the canonical STATUS `progress=` unit while account-list Refresh walks Fusion accounts.

#### Scenario: Glossary entry for Refreshed progress unit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Refreshed (progress unit)** entry describing the STATUS `progress=` unit `refreshed`
- **AND** the entry SHALL state that Refresh STATUS MUST NOT reuse unit `processed` and MUST NOT emit a standalone `refreshed(N)` cumulative

### Requirement: Documentation and logs use refreshed for Refresh STATUS

New documentation and Refresh-phase STATUS progress SHALL use unit **refreshed**. They SHALL NOT describe Refresh pipeline throughput as unit `processed` or as a separate `refreshed(N)` token.

#### Scenario: Refresh STATUS examples use refreshed unit

- **WHEN** operator docs show a Refresh STATUS example
- **THEN** the progress segment SHALL use unit `refreshed`
- **AND** the example SHALL NOT include a standalone `refreshed(N)` segment
