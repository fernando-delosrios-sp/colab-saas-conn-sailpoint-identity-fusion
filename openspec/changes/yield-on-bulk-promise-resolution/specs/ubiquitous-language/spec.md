## ADDED Requirements

### Requirement: Glossary defines bulk ingest terms

The ubiquitous-language glossary SHALL define **Bulk ingest** and **Ingested (progress unit)** as canonical terms for CPU-bound cache registration after Fetch HTTP and for STATUS progress during that work.

#### Scenario: Glossary entry for Bulk ingest

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Bulk ingest** entry describing registration of already-fetched pages into run caches, distinct from HTTP Fetch and from identity hydration

#### Scenario: Glossary entry for Ingested progress unit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Ingested (progress unit)** entry describing the STATUS `progress=` unit `ingested`
- **AND** the entry SHALL state that operators MUST NOT reuse `fetched` for post-HTTP cache registration

### Requirement: Documentation and logs use Bulk ingest and ingested

New documentation, STATUS progress units, and DETAIL actions for this work SHALL use **Bulk ingest** and unit **ingested**. They SHALL NOT call this stretch hydration, flush, or promise dump.

#### Scenario: DETAIL ingest start uses ingesting action

- **WHEN** Fetch emits a DETAIL line at the start of identity or fusion-account bulk ingest
- **THEN** the action SHALL use `ingesting` with subject `identities` or `fusion-accounts`
- **AND** the line SHALL NOT describe the work as hydration
