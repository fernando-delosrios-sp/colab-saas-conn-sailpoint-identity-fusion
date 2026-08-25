## ADDED Requirements

### Requirement: Glossary defines Fetch population counter

The ubiquitous-language glossary SHALL define **Fetch population counter** as a Fetch-phase STATUS segment for one inventory (`fusion-accounts`, `managed-accounts`, or `identities`), independent of other inventories and distinct from the non-Fetch `progress=` slot.

#### Scenario: Glossary entry for Fetch population counter

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Fetch population counter** entry
- **AND** the entry SHALL state that Fetch STATUS MUST NOT use a single `fetched` or `ingested` `progress=` fraction for parallel inventories

---

## MODIFIED Requirements

### Requirement: Glossary defines bulk ingest terms

The ubiquitous-language glossary SHALL define **Bulk ingest** as CPU-bound cache registration after Fetch HTTP, distinct from HTTP Fetch and from identity hydration. It SHALL define **Ingested (progress unit)** as the historical name of that work. Fetch STATUS SHALL use **Fetch population counters**, not unit `ingested`, as the pipeline fraction. DETAIL ingest actions MAY still use `ingesting`.

#### Scenario: Glossary entry for Bulk ingest

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Bulk ingest** entry describing registration of already-fetched pages into run caches, distinct from HTTP Fetch and from identity hydration

#### Scenario: Glossary entry for Ingested progress unit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Ingested (progress unit)** entry
- **AND** the entry SHALL state that Fetch STATUS MUST NOT use `ingested` as the sole pipeline `progress=` unit

### Requirement: Documentation and logs use Bulk ingest and ingested

New documentation and DETAIL actions for bulk-ingest work SHALL use **Bulk ingest** and `ingesting` actions. They SHALL NOT call this stretch hydration, flush, or promise dump. Fetch STATUS examples SHALL use Fetch population counters, not `progress=… ingested`.

#### Scenario: DETAIL ingest start uses ingesting action

- **WHEN** Fetch emits a DETAIL line at the start of identity or fusion-account bulk ingest
- **THEN** the action SHALL use `ingesting` with subject `identities` or `fusion-accounts`
- **AND** the line SHALL NOT describe the work as hydration

#### Scenario: Fetch STATUS examples use population counters

- **WHEN** operator docs show a Fetch STATUS example with concurrent Fusion and managed loads
- **THEN** the example SHALL include `fusion-accounts=` and `managed-accounts=`
- **AND** the example SHALL NOT use a single Fetch `progress=` with unit `fetched` or `ingested`
