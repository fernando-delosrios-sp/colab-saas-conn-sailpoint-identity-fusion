## ADDED Requirements

### Requirement: Reports SHALL distinguish Internal Record references with an INTERNAL badge

Fusion reports, aggregation reports, dry-run reports, and Fusion review decision views SHALL display an `INTERNAL` badge wherever they display a source reference whose provenance is an Internal Record source. The badge SHALL accompany, rather than replace, the Record source-type label. Internal records SHALL NOT render an ISC account link.

#### Scenario: Internal source is marked in an account reference
- **GIVEN** a report row references an account from an Internal Record source
- **WHEN** the report HTML is rendered
- **THEN** the row SHALL display the Record source-type label
- **AND** it SHALL display an `INTERNAL` badge
- **AND** it SHALL not contain an ISC account link for that record

#### Scenario: Configured Record source has no INTERNAL badge
- **GIVEN** a report row references an account from a configured ISC Record source
- **WHEN** the report HTML is rendered
- **THEN** the row SHALL display the Record source-type label
- **AND** it SHALL not display an `INTERNAL` badge
