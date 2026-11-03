## ADDED Requirements

### Requirement: Fusion service SHALL preserve Historical Record source provenance

Fusion service SHALL preserve internal provenance from a Historical Record source through managed-account processing, Match Candidate Records, Fusion review decisions, and report projections. It SHALL retain Record source semantics and SHALL NOT assign a synthetic ISC account ID to an internal record.

#### Scenario: Matched historical record retains provenance
- **GIVEN** a Historical Record source record matches a Fusion account
- **WHEN** the Match result and report projection are built
- **THEN** the source reference SHALL retain Record type and internal provenance
- **AND** its account identifier SHALL not be represented as an ISC account ID

#### Scenario: Historical record is not contributing
- **GIVEN** a Historical Record source record is attached to a Fusion account
- **WHEN** Fusion service evaluates contributing accounts
- **THEN** the historical record SHALL be treated as a Record source account
- **AND** it SHALL NOT keep the Fusion account from becoming an Orphan
