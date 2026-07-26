## MODIFIED Requirements

### Requirement: MatchingService dispatches exact match → automatic assignment

When scoring produces an exact match (all evaluated rules score 100, none skipped) and automatic merge is enabled, MatchingService SHALL create a synthetic decision and merge the managed account into the matching Fusion identity without creating a review form.

#### Scenario: Exact match triggers automatic assignment
- **GIVEN** automatic merge is enabled and scoring produces an exact match
- **WHEN** MatchingService handles the outcome
- **THEN** a synthetic FusionDecision SHALL be created with `automaticMerge: true`
- **AND** the managed account SHALL be merged into the matching Fusion identity
- **AND** no review form SHALL be created

### Requirement: MatchingService dispatches identity match → partial match review

When scoring produces identity-candidate matches but no exact match (or automatic merge is disabled), MatchingService SHALL create a review form with the highest-scoring identity candidates presenting merge-with-existing-identity and create-new-identity options.

#### Scenario: Identity match creates review form
- **GIVEN** scoring produces identity-candidate matches with combined scores above threshold
- **WHEN** MatchingService handles the outcome
- **THEN** a review form SHALL be created via FormService
- **AND** the form SHALL include the top candidates up to maxCandidatesForForm
- **AND** the FusionAccount's identity references SHALL be cleared after form creation

### Requirement: MatchingService receives FusionRun for state access

MatchingService SHALL receive FusionRun at construction time and read/write all shared state through it. MatchingService SHALL NOT hold internal mutable state beyond configuration. The trigram index (`trigramIndexByAttribute`, `indexedMandatoryAttributes`, `trigramIndexBuilt`) and normalization caches (`normalizedCache`, `nameNormalizedCache`) SHALL live on FusionRun, not on MatchingService.

#### Scenario: MatchingService reads fusion identities from FusionRun
- **WHEN** MatchingService needs the set of existing fusion identities
- **THEN** it SHALL read from run.fusionIdentityMap, not from a service-local cache

#### Scenario: MatchingService writes match outcomes to FusionRun
- **WHEN** MatchingService creates a new Fusion account from a non-match
- **THEN** the account SHALL be written to run.fusionAccountMap
- **AND** auto-merged identity IDs SHALL be written to run.autoMergedIdentityIds

#### Scenario: MatchingService builds trigram index on FusionRun
- **WHEN** MatchingService.buildTrigramIndex is called
- **THEN** it SHALL populate run.trigramIndexByAttribute, run.indexedMandatoryAttributes, and run.trigramIndexBuilt
- **AND** there SHALL be no trigramIndexByAttribute, indexedMandatoryAttributes, or trigramIndexBuilt fields on MatchingService

#### Scenario: MatchingService uses normalization caches from FusionRun
- **WHEN** MatchingService normalizes a string value for scoring
- **THEN** it SHALL read and write run.normalizedCache and run.nameNormalizedCache
- **AND** there SHALL be no normalizedCache or nameNormalizedCache fields on MatchingService

### Requirement: Skipped threshold rules do not affect exact-match checks

The connector's exact-match automatic merge logic SHALL consider only non-skipped rules. A rule skipped due to `skipMatchIfThresholdNotMet` SHALL NOT be required to be an exact match for the candidate to qualify as an exact match.

#### Scenario: Exact-match auto-assignment ignores threshold-skipped rules
- **GIVEN** automatic merge is enabled
- **AND** one evaluated rule scores `100` and is an exact match
- **AND** a second rule has `skipMatchIfThresholdNotMet: true` and scores below its threshold
- **WHEN** the exact-match determination runs
- **THEN** the candidate may still be treated as an exact match based on the non-skipped rule
