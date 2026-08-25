## ADDED Requirements

### Requirement: FusionRun tracks mandatory-missing block count

FusionRun SHALL expose a run-scoped numeric field `mandatoryMissingBlockCount` initialized to zero at run start. MatchingService SHALL increment this field when getCandidates returns an empty candidate set because the managed account has no value for any indexable mandatory trigram attribute.

#### Scenario: Counter starts at zero
- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `mandatoryMissingBlockCount` SHALL be `0`

#### Scenario: Counter accumulates across multiple accounts
- **GIVEN** two managed accounts each triggering mandatory-missing block in the same run
- **WHEN** both are processed through getCandidates
- **THEN** `mandatoryMissingBlockCount` SHALL equal `2`

## MODIFIED Requirements

### Requirement: FusionRun tracks full-scan trigram fallback count

FusionRun SHALL expose a run-scoped numeric field `fullScanFallbackCount` initialized to zero at run start. MatchingService SHALL increment this field only when getCandidates returns undefined because trigram blocking was unavailable, not when returning an empty set for mandatory-missing accounts.

#### Scenario: Counter starts at zero
- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `fullScanFallbackCount` SHALL be `0`

#### Scenario: Counter accumulates across multiple accounts
- **GIVEN** two managed accounts each triggering full-scan fallback because trigram blocking was unavailable in the same run
- **WHEN** both are processed through `getCandidates`
- **THEN** `fullScanFallbackCount` SHALL equal `2`
