# matching-rule-threshold-skip Specification

## Purpose
TBD - created by archiving change skip-match-if-threshold-not-met. Update Purpose after archive.
## Requirements
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
