## ADDED Requirements

### Requirement: Match candidate projection indexing

MatchingService SHALL support indexing candidate identities as `MatchCandidateRecord` projections containing `identityId`, `identityName`, and the projected union of attributes needed for matching, review forms, and reporting (`matchingRules ∪ fusionFormAttributes ∪ reportAttributes`).

#### Scenario: Candidate roster indexes projected candidate records

- **GIVEN** a pool of candidate identities to index for matching
- **WHEN** `buildTrigramIndex` builds the blocking indexes and candidate roster
- **THEN** the blocking identity roster SHALL store `MatchCandidateRecord` projections rather than requiring full `FusionAccount` instances
- **AND** blocking indexes SHALL index values extracted from the projected candidate attributes

#### Scenario: Candidate records provide attributes for matching, forms, and reporting

- **GIVEN** an uncorrelated managed account being scored against candidate records
- **WHEN** a candidate record matches or passes the review threshold
- **THEN** the resulting `FusionMatch` SHALL expose the candidate's `identityId`, `identityName`, and projected `attributes`
- **AND** review forms and reports SHALL be generated from those projected attributes without initiating secondary API calls
