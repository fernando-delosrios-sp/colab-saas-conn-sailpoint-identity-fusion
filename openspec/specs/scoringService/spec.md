# scoringService Spec


## Requirements



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
