## ADDED Requirements

### Requirement: Fusion service SHALL preserve Internal Record source provenance

Fusion service SHALL preserve internal provenance from an Internal Record source through managed-account processing, Match Candidate Records, Fusion review decisions, and report projections. It SHALL retain Record source semantics and SHALL NOT assign a synthetic ISC account ID to an internal record.

#### Scenario: Matched internal record retains provenance
- **GIVEN** an Internal Record source record matches a Fusion account
- **WHEN** the Match result and report projection are built
- **THEN** the source reference SHALL retain Record type and internal provenance
- **AND** its account identifier SHALL not be represented as an ISC account ID

#### Scenario: Internal record is not contributing
- **GIVEN** an Internal Record source record is attached to a Fusion account
- **WHEN** Fusion service evaluates contributing accounts
- **THEN** the internal record SHALL be treated as a Record source account
- **AND** it SHALL NOT keep the Fusion account from becoming an Orphan
