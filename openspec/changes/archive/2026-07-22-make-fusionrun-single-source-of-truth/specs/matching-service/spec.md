## MODIFIED Requirements

### Requirement: MatchingService receives FusionRun for state access

MatchingService SHALL receive FusionRun at construction time and read/write all shared state through it. MatchingService SHALL NOT hold internal mutable state beyond configuration. The trigram index (`trigramIndexByAttribute`, `indexedMandatoryAttributes`, `trigramIndexBuilt`) and normalization caches (`normalizedCache`, `nameNormalizedCache`) SHALL live on FusionRun, not on MatchingService.

#### Scenario: MatchingService reads fusion identities from FusionRun
- **WHEN** MatchingService needs the set of existing fusion identities
- **THEN** it SHALL read from run.fusionIdentityMap, not from a service-local cache

#### Scenario: MatchingService writes match outcomes to FusionRun
- **WHEN** MatchingService creates a new Fusion account from a non-match
- **THEN** the account SHALL be written to run.fusionAccountMap
- **AND** autoAssigned identity IDs SHALL be written to run.autoAssignedIdentityIds

#### Scenario: MatchingService builds trigram index on FusionRun
- **WHEN** MatchingService.buildTrigramIndex is called
- **THEN** it SHALL populate run.trigramIndexByAttribute, run.indexedMandatoryAttributes, and run.trigramIndexBuilt
- **AND** there SHALL be no trigramIndexByAttribute, indexedMandatoryAttributes, or trigramIndexBuilt fields on MatchingService

#### Scenario: MatchingService uses normalization caches from FusionRun
- **WHEN** MatchingService normalizes a string value
- **THEN** it SHALL read and write run.normalizedCache and run.nameNormalizedCache
- **AND** there SHALL be no normalizedCache or nameNormalizedCache fields on MatchingService

### Requirement: MatchingService builds and queries trigram blocking index

MatchingService SHALL build a trigram blocking index over fusion identities for mandatory matching attributes. The index SHALL be built on FusionRun. The index SHALL be queried to pre-filter identity candidates before running full similarity scoring.

#### Scenario: Trigram index pre-filters candidates
- **WHEN** buildTrigramIndex(run) is called with a set of fusion identities
- **THEN** per-attribute inverted trigram maps SHALL be built on run.trigramIndexByAttribute for each mandatory matching attribute
- **AND** getCandidates SHALL return only identities sharing at least one trigram with the account's attribute values

## REMOVED Requirements

None.
