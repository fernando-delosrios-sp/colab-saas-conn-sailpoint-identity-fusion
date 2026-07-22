# matching-service Spec

## Purpose

The match service (`src/services/matchingService/`) is the stateless service responsible for the Match step — comparing Fusion accounts against existing identities using weighted scoring rules and dispatching match outcomes (exact match, partial match, deferred match, non-match). It owns the CandidateRegistry and ManagedAccountMatchingRunner, and orchestrates the two-sweep matching lifecycle. All scoring algorithms from the former ScoringService remain in effect under the new name.
## Requirements
### Requirement: MatchingService dispatches exact match → automatic assignment

When scoring produces an exact match (all evaluated rules score 100, none skipped) and automatic assignment is enabled, MatchingService SHALL create a synthetic decision and assign the managed account to the matching identity without creating a review form.

#### Scenario: Exact match triggers automatic assignment
- **GIVEN** automatic assignment is enabled and scoring produces an exact match
- **WHEN** MatchingService handles the outcome
- **THEN** a synthetic FusionDecision SHALL be created with automaticAssignment: true
- **AND** the managed account SHALL be linked to the identity
- **AND** no review form SHALL be created

### Requirement: MatchingService dispatches identity match → partial match review

When scoring produces identity-candidate matches but no exact match (or automatic assignment is disabled), MatchingService SHALL create a review form with the highest-scoring identity candidates.

#### Scenario: Identity match creates review form
- **GIVEN** scoring produces identity-candidate matches with combined scores above threshold
- **WHEN** MatchingService handles the outcome
- **THEN** a review form SHALL be created via FormService
- **AND** the form SHALL include the top candidates up to maxCandidatesForForm
- **AND** the FusionAccount's identity references SHALL be cleared after form creation

### Requirement: MatchingService dispatches non-match per source type

When no identity candidates meet the threshold, MatchingService SHALL apply source-type-specific policies: authoritative accounts produce new Fusion accounts, record accounts register unique attributes only, orphan accounts may be disabled.

#### Scenario: Authoritative non-match creates new Fusion account
- **GIVEN** an authoritative managed account with no matches
- **WHEN** MatchingService handles the outcome
- **THEN** a new Fusion account SHALL be created and registered in FusionRun

#### Scenario: Record non-match registers unique attributes
- **GIVEN** a record-source managed account with no matches
- **WHEN** MatchingService handles the outcome
- **THEN** unique attributes SHALL be registered via DefinitionService
- **AND** no Fusion account SHALL be created

### Requirement: MatchingService handles deferred candidate matching

When scoring produces only deferred-candidate matches, MatchingService SHALL defer identity creation until the next aggregation run by not producing a new Fusion account.

#### Scenario: Deferred match skips account
- **GIVEN** a managed account with only deferred-candidate matches
- **WHEN** MatchingService handles the outcome
- **THEN** the account SHALL be removed from the work queue
- **AND** no Fusion account SHALL be created for this run

### Requirement: MatchingService owns the two-sweep matching runner

MatchingService SHALL instantiate and orchestrate ManagedAccountMatchingRunner for the two-sweep matching lifecycle (identity scoring sweep → deferred scoring sweep).

#### Scenario: Runner executes identity scoring sweep
- **WHEN** MatchingService processes uncorrelated managed accounts
- **THEN** ManagedAccountMatchingRunner SHALL execute identity-phase scoring for all accounts
- **AND** results SHALL be classified as identity-match, deferred-pending, or non-match

#### Scenario: Runner executes deferred scoring sweep
- **WHEN** the identity sweep completes with pending deferred candidates
- **THEN** ManagedAccountMatchingRunner SHALL execute deferred-phase scoring for pending accounts
- **AND** results SHALL be classified as deferred-match or non-match

### Requirement: MatchingService owns the CandidateRegistry

MatchingService SHALL create and manage the CandidateRegistry for per-source deferred candidate tracking across analysis sweeps.

#### Scenario: Candidates registered during identity sweep
- **WHEN** an authoritative account from a deferred-enabled source has no identity match
- **THEN** the account's managed key SHALL be registered in CandidateRegistry for its source
- **AND** it SHALL be available for deferred-phase scoring

### Requirement: MatchingService exposes scoring algorithms

MatchingService SHALL expose the same scoring algorithms as the former ScoringService: binary, jaro-winkler, dice, double-metaphone, lig3, name-matcher, custom-velocity. All algorithm contracts from the former scoring-service spec remain in effect.

#### Scenario: Binary algorithm returns 100 for exact match
- **WHEN** binary algorithm compares "abc123" and "abc123"
- **THEN** score is 100 and isMatch is true

### Requirement: MatchingService builds and queries trigram blocking index

MatchingService SHALL build a trigram blocking index over fusion identities for mandatory matching attributes. The index SHALL be built on FusionRun. The index SHALL be queried to pre-filter identity candidates before running full similarity scoring.

#### Scenario: Trigram index pre-filters candidates
- **WHEN** buildTrigramIndex(run) is called with a set of fusion identities
- **THEN** per-attribute inverted trigram maps SHALL be built on run.trigramIndexByAttribute for each mandatory matching attribute
- **AND** getCandidates SHALL return only identities sharing at least one trigram with the account's attribute values

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
- **WHEN** MatchingService normalizes a string value for scoring
- **THEN** it SHALL read and write run.normalizedCache and run.nameNormalizedCache
- **AND** there SHALL be no normalizedCache or nameNormalizedCache fields on MatchingService

### Requirement: Binary algorithm produces a 100 score only for identical string values

The system SHALL, when the configured matching algorithm is `binary`, compute a score of 100 if and only if the account value and the candidate identity value are identical strings. All other comparisons SHALL produce a score of 0.

#### Scenario: Exact string match
- **WHEN** the account value is `"abc123"` and the candidate identity value is `"abc123"` and the rule algorithm is `binary`
- **THEN** the score is 100 and `isMatch` is true when the threshold is 100

#### Scenario: Different string values
- **WHEN** the account value is `"abc123"` and the candidate identity value is `"xyz789"` and the rule algorithm is `binary`
- **THEN** the score is 0 and `isMatch` is false

#### Scenario: Case-sensitive comparison
- **WHEN** the account value is `"ABC123"` and the candidate identity value is `"abc123"` and the rule algorithm is `binary`
- **THEN** the score is 0 and `isMatch` is false

#### Scenario: Whitespace-sensitive comparison
- **WHEN** the account value is `"abc123"` and the candidate identity value is `" abc123 "` and the rule algorithm is `binary`
- **THEN** the score is 0 and `isMatch` is false

### Requirement: Binary algorithm handles missing values as a non-match

The system SHALL produce a score of 0 for the `binary` algorithm when either the account value or the candidate identity value is missing, empty, or whitespace-only. Existing skip-on-missing configuration SHALL continue to apply unchanged.

#### Scenario: Account value is missing
- **WHEN** the account value is missing and the candidate identity value is `"abc123"` and the rule algorithm is `binary`
- **THEN** the score is 0 and the rule is skipped if `skipMatchIfMissing` is true

#### Scenario: Both values are missing
- **WHEN** both the account value and the candidate identity value are missing and the rule algorithm is `binary`
- **THEN** the score is 0 and the rule is skipped if `skipMatchIfMissing` is true

### Requirement: Binary algorithm is selectable in matching configuration

The system SHALL accept `binary` as a valid value for `MatchingConfig.algorithm` and expose it as a selectable option in `connector-spec.json`.

#### Scenario: Configuring a binary rule
- **WHEN** an administrator creates a matching rule with `algorithm: "binary"` and `fusionScore: 100`
- **THEN** the configuration is valid and the rule is evaluated using the binary exact-match scorer

### Requirement: Binary algorithm is labeled in forms and messages

The system SHALL display the friendly label "Binary (Exact Match)" wherever algorithm names are rendered in review forms and messaging helpers.

#### Scenario: Review form renders algorithm name
- **WHEN** a review form includes a score row produced by the `binary` algorithm
- **THEN** the rendered algorithm label is "Binary (Exact Match)"

### Requirement: Matching rules support a skip-if-threshold-not-met toggle

Each Fusion attribute match rule SHALL expose a `skipMatchIfThresholdNotMet` boolean option. When enabled, the rule SHALL be excluded from the weighted combined score whenever its computed similarity is strictly below the rule's configured minimum similarity (`fusionScore`).

#### Scenario: Toggle defaults to disabled
- **GIVEN** a matching rule with no `skipMatchIfThresholdNotMet` value configured
- **WHEN** the rule is evaluated
- **THEN** the rule is treated as if `skipMatchIfThresholdNotMet` is false
- **AND** a below-threshold score still contributes its raw similarity to the combined score

#### Scenario: Toggle appears in connector-spec.json
- **GIVEN** the connector specification UI schema
- **WHEN** an administrator expands a Fusion attribute match rule
- **THEN** a toggle labeled **Skip match if threshold not met** is present
- **AND** its help text explains that below-threshold rules are excluded from the combined score

### Requirement: Below-threshold rules are skipped when the toggle is enabled

When `skipMatchIfThresholdNotMet` is true for a non-mandatory rule and the rule's computed similarity is below its `fusionScore`, the rule SHALL be recorded as skipped and SHALL NOT contribute weight or raw score to the weighted combined score.

#### Scenario: Passing rule still contributes normally
- **GIVEN** a non-mandatory rule with `fusionScore: 80`, `skipMatchIfThresholdNotMet: true`, and computed similarity `85`
- **WHEN** the combined score is calculated
- **THEN** the rule contributes its weight and raw score to the weighted combined score
- **AND** it is not marked as skipped

#### Scenario: Failing rule is skipped from combined score
- **GIVEN** a non-mandatory rule with `fusionScore: 80`, `skipMatchIfThresholdNotMet: true`, and computed similarity `60`
- **WHEN** the combined score is calculated
- **THEN** the rule is marked as skipped with a comment indicating the score was below threshold
- **AND** the rule contributes zero weight and zero raw score to the weighted combined score

#### Scenario: Combined score is recalculated without skipped threshold rules
- **GIVEN** two non-mandatory rules, both with `fusionScore: 80`
- **AND** the first rule has similarity `90` and `skipMatchIfThresholdNotMet: false`
- **AND** the second rule has similarity `60` and `skipMatchIfThresholdNotMet: true`
- **WHEN** the combined score is calculated
- **THEN** only the first rule's weight and raw score are used
- **AND** the combined score equals `90` (not a weighted blend of `90` and `60`)

### Requirement: Mandatory rules ignore the threshold-skip toggle

Mandatory rules SHALL always be evaluated against their minimum similarity. A mandatory rule with a below-threshold score SHALL fail and invalidate the candidate, regardless of the `skipMatchIfThresholdNotMet` value.

#### Scenario: Mandatory below-threshold rule fails even when skip is enabled
- **GIVEN** a mandatory rule with `fusionScore: 80` and `skipMatchIfThresholdNotMet: true`
- **AND** the rule's computed similarity is `60`
- **WHEN** the candidate is scored
- **THEN** the candidate is rejected
- **AND** the rule is recorded as not skipped and not a match

#### Scenario: Mandatory passing rule contributes normally
- **GIVEN** a mandatory rule with `fusionScore: 80` and `skipMatchIfThresholdNotMet: true`
- **AND** the rule's computed similarity is `90`
- **WHEN** the combined score is calculated
- **THEN** the rule contributes its weight and raw score to the combined score

### Requirement: Skipped threshold rules do not affect exact-match checks

The connector's exact-match automatic assignment logic SHALL consider only non-skipped rules. A rule skipped due to `skipMatchIfThresholdNotMet` SHALL NOT be required to be an exact match for the candidate to qualify as an exact match.

#### Scenario: Exact-match auto-assignment ignores threshold-skipped rules
- **GIVEN** automatic assignment is enabled
- **AND** one evaluated rule scores `100` and is an exact match
- **AND** a second rule has `skipMatchIfThresholdNotMet: true` and scores below its threshold
- **WHEN** the exact-match determination runs
- **THEN** the candidate may still be treated as an exact match based on the non-skipped rule

### Requirement: Matching iterations SHALL avoid array allocations

When iterating over multiple Set collections of account IDs during the identity matching evaluation, MatchingService SHALL iterate them sequentially using direct `for...of` loops rather than combining them via array spread syntax (`[...setA, ...setB]`), to avoid O(N) memory allocations per invocation on hot paths.

#### Scenario: Identity matching iterates candidate sets directly
- **WHEN** MatchingService evaluates identity candidates for a managed account
- **THEN** the matching loop iterates directly over `accountIdsSet` and `missingAccountIdsSet` without allocating an intermediate array

