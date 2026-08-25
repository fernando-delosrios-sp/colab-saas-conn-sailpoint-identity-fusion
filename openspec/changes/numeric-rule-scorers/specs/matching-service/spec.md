## REMOVED Requirements

### Requirement: Run-scoped captureBreakdown configuration on MatchingService

**Reason**: Breakdown capture on non-matches was never stored in reports or forms; identity sweep reconstructs full breakdown on threshold pass without a run-scoped flag. Report slice capture remains on FusionService via `shouldCaptureManagedAccountReportData()`.

**Migration**: Remove `MatchingService.configureScoring`, `ScoringOptions`, and FusionService init call. Identity comparisons always use the numeric fast path; deferred comparisons use full breakdown by candidate type.

## MODIFIED Requirements

### Requirement: MatchingService scope is scoring and trigram blocking

MatchingService SHALL provide weighted scoring algorithms, trigram index build and query, and normalization caches on FusionRun. MatchingService SHALL NOT expose `processUncorrelatedManagedAccounts`, `configureScoring`, or own match sweep orchestration. Match outcome dispatch and the two-sweep lifecycle SHALL be owned by `MatchOutcomeDispatcher` in the same package. The public scoring-prep entry point during init SHALL be `buildTrigramIndex` only.

#### Scenario: MatchingService has no sweep orchestration entry point

- **WHEN** a developer inspects the public API of MatchingService
- **THEN** there SHALL be no `processUncorrelatedManagedAccounts` method
- **AND** there SHALL be no `configureScoring` method
- **AND** sweep orchestration SHALL be invoked through `MatchOutcomeDispatcher.runMatchSweep`

#### Scenario: Trigram and scoring prep remain on MatchingService

- **WHEN** FusionService prepares for managed-account matching during init
- **THEN** it SHALL call `MatchingService.buildTrigramIndex`
- **AND** it SHALL NOT call `MatchingService.configureScoring`

### Requirement: Non-match identity comparisons avoid score breakdown allocation

When comparing a managed account against an identity candidate during identity-sweep scoring (`MatchCandidateType.Identity`), `compareFusionAccounts` SHALL compute the combined score using running numeric rule totals without allocating individual per-rule `ScoreReport` objects. Full score breakdowns SHALL be materialized only when the combined score passes the threshold and a `FusionMatch` is stored, reconstructed from the numeric totals without re-invoking scorers. Deferred candidate comparisons (`MatchCandidateType.Deferred`) SHALL continue to build a full `ScoreReport[]` breakdown regardless of match outcome.

#### Scenario: Non-match comparison produces no stored match without breakdown allocation

- **GIVEN** `candidateType` is `Identity`
- **AND** a managed account and identity candidate produce a combined score below the manual review threshold
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** no `FusionMatch` SHALL be added to the fusion account
- **AND** the comparison SHALL NOT allocate individual per-rule `ScoreReport` objects

#### Scenario: Threshold-passing comparison stores full breakdown without re-scoring

- **GIVEN** `candidateType` is `Identity`
- **AND** a managed account and identity candidate produce a combined score at or above the manual review threshold with no failed mandatory rules
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** a `FusionMatch` SHALL be added with a complete `scores` breakdown including per-rule rows and the combined score row
- **AND** each configured scorer SHALL be invoked at most once for that pair
- **AND** match outcome behavior SHALL be identical to the pre-change full-path behavior

#### Scenario: Mandatory-failed comparison exits without stored match

- **GIVEN** `candidateType` is `Identity` and a mandatory rule fails during fast-path evaluation
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** no `FusionMatch` SHALL be stored
- **AND** the comparison SHALL NOT allocate per-rule `ScoreReport` objects for the non-match outcome

#### Scenario: Deferred candidate comparisons always use full breakdown

- **GIVEN** `candidateType` is `Deferred`
- **WHEN** `compareFusionAccounts` evaluates a deferred candidate pair
- **THEN** a full `ScoreReport[]` breakdown SHALL be built regardless of match outcome
