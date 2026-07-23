## ADDED Requirements

### Requirement: Non-match identity comparisons avoid score breakdown allocation

When comparing a managed account against an identity candidate during identity-sweep scoring (`MatchCandidateType.Identity`) and run-scoped breakdown capture is disabled, `compareFusionAccounts` SHALL compute the combined score using running totals (`weightedSum`, `weightTotal`, `hasFailedMandatory`) without allocating a `ScoreReport[]` or individual per-rule `ScoreReport` objects. Full score breakdowns SHALL be materialized only when the combined score passes the threshold and a `FusionMatch` is stored, or when breakdown capture is required per the run-scoped flag or candidate type.

#### Scenario: Non-match comparison produces no stored match without breakdown allocation
- **GIVEN** `captureBreakdown` is false and `candidateType` is `Identity`
- **AND** a managed account and identity candidate produce a combined score below the manual review threshold
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** no `FusionMatch` SHALL be added to the fusion account
- **AND** the comparison SHALL NOT allocate a `ScoreReport[]` for the failed comparison

#### Scenario: Threshold-passing comparison stores full breakdown
- **GIVEN** `captureBreakdown` is false and `candidateType` is `Identity`
- **AND** a managed account and identity candidate produce a combined score at or above the manual review threshold with no failed mandatory rules
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** a `FusionMatch` SHALL be added with a complete `scores` breakdown including per-rule rows and the combined score row
- **AND** match outcome behavior SHALL be identical to the pre-optimization full-path behavior

#### Scenario: Mandatory-failed comparison exits without stored match
- **GIVEN** `captureBreakdown` is false and a mandatory rule fails during fast-path evaluation
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** no `FusionMatch` SHALL be stored
- **AND** the comparison SHALL NOT allocate per-rule `ScoreReport` objects for the non-match outcome

---

### Requirement: Run-scoped captureBreakdown configuration on MatchingService

`MatchingService` SHALL expose `setCaptureBreakdown(value: boolean)` to configure whether full score breakdowns are required for identity-sweep comparisons regardless of match outcome. `FusionService` SHALL set this flag during `initializeManagedAccountProcessing` based on whether managed-account report data capture is enabled for the current run. When `captureBreakdown` is true, identity-sweep comparisons SHALL use the full breakdown path for every comparison (preserving report-capture behavior).

#### Scenario: Report capture run enables full breakdown
- **GIVEN** managed-account report data capture is enabled for the run
- **WHEN** `FusionService.initializeManagedAccountProcessing` completes
- **THEN** `MatchingService` SHALL have `captureBreakdown` set to true
- **AND** identity-sweep comparisons SHALL allocate full score breakdowns as before the optimization

#### Scenario: Normal aggregation disables breakdown for identity sweep
- **GIVEN** managed-account report data capture is disabled for the run
- **WHEN** `FusionService.initializeManagedAccountProcessing` completes
- **THEN** `MatchingService` SHALL have `captureBreakdown` set to false
- **AND** identity-sweep non-match comparisons SHALL use the fast path

#### Scenario: Deferred candidate comparisons always use full breakdown
- **GIVEN** `captureBreakdown` is false
- **AND** `candidateType` is `Deferred`
- **WHEN** `compareFusionAccounts` evaluates a deferred candidate pair
- **THEN** a full `ScoreReport[]` breakdown SHALL be built regardless of match outcome
