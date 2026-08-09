## REMOVED Requirements

### Requirement: MatchingService owns the two-sweep matching runner

**Reason:** Two-sweep orchestration (identity scoring sweep → deferred drain) is implemented by `MatchOutcomeDispatcher`, not a `ManagedAccountMatchingRunner` type on MatchingService.

**Migration:** See ADDED requirement "MatchOutcomeDispatcher owns the two-sweep match lifecycle" in `matching-service/match-outcome-dispatch` delta and ADDED boundary requirement in this delta.

---

## MODIFIED Requirements

### Requirement: MatchingService owns the CandidateRegistry

MatchingService SHALL NOT maintain a separate CandidateRegistry object. Deferred candidate pool state SHALL live on FusionRun. MatchOutcomeDispatcher SHALL read and mutate the deferred candidate pool through FusionRun APIs (`registerPersistedDeferredCandidate`, `registerFinalizedDeferredCandidate`, `currentRunDeferredCandidatesForSource`, and related run methods). FusionService SHALL seed persisted fusion anchors into the pool during `initializeManagedAccountProcessing` before uncorrelated sweep begins.

#### Scenario: Candidates registered during identity sweep

- **WHEN** an authoritative account from a deferred-enabled source has no identity match during identity phase
- **THEN** the account SHALL be classified as deferred-pending by MatchOutcomeDispatcher
- **AND** it SHALL NOT be bulk-registered in the deferred pool before the deferred drain

#### Scenario: Persisted anchors seeded at sweep start

- **WHEN** managed account processing initializes for a deferred-enabled source with existing fusion accounts
- **THEN** those fusion accounts SHALL be registered as persisted deferred candidates on FusionRun for the managed source (using `originSource` bucketing)
- **AND** they SHALL be visible to the first pending account scored in the deferred drain

#### Scenario: Materialized anchor joins pool

- **WHEN** a pending account is classified as non-match during the deferred drain
- **THEN** its Fusion account SHALL be registered as an anchor deferred candidate on FusionRun for subsequent pending accounts in the same source during the same sweep

### Requirement: Run-scoped captureBreakdown configuration on MatchingService

`MatchingService` SHALL expose `configureScoring({ captureBreakdown: boolean })` to configure whether full score breakdowns are required for identity-sweep comparisons regardless of match outcome. `FusionService` SHALL call `configureScoring` during `initializeManagedAccountProcessing` based on whether managed-account report data capture is enabled for the current run. When `captureBreakdown` is true, identity-sweep comparisons SHALL use the full breakdown path for every comparison (preserving report-capture behavior).

#### Scenario: Report capture run enables full breakdown

- **GIVEN** managed-account report data capture is enabled for the run
- **WHEN** `FusionService.initializeManagedAccountProcessing` completes
- **THEN** `MatchingService` SHALL have been configured with `captureBreakdown: true` via `configureScoring`
- **AND** identity-sweep comparisons SHALL allocate full score breakdowns as before the optimization

#### Scenario: Normal aggregation disables breakdown for identity sweep

- **GIVEN** managed-account report data capture is disabled for the run
- **WHEN** `FusionService.initializeManagedAccountProcessing` completes
- **THEN** `MatchingService` SHALL have been configured with `captureBreakdown: false` via `configureScoring`
- **AND** identity-sweep non-match comparisons SHALL use the fast path

#### Scenario: Deferred candidate comparisons always use full breakdown

- **GIVEN** `captureBreakdown` is false
- **AND** `candidateType` is `Deferred`
- **WHEN** `compareFusionAccounts` evaluates a deferred candidate pair
- **THEN** a full `ScoreReport[]` breakdown SHALL be built regardless of match outcome

---

## ADDED Requirements

### Requirement: MatchingService scope is scoring and trigram blocking

MatchingService SHALL provide weighted scoring algorithms, trigram index build and query, and normalization caches on FusionRun. MatchingService SHALL NOT expose `processUncorrelatedManagedAccounts` or own match sweep orchestration. Match outcome dispatch and the two-sweep lifecycle SHALL be owned by `MatchOutcomeDispatcher` in the same package.

#### Scenario: MatchingService has no sweep orchestration entry point

- **WHEN** a developer inspects the public API of MatchingService
- **THEN** there SHALL be no `processUncorrelatedManagedAccounts` method
- **AND** sweep orchestration SHALL be invoked through `MatchOutcomeDispatcher.runMatchSweep`

#### Scenario: Trigram and scoring prep remain on MatchingService

- **WHEN** FusionService prepares for managed-account matching during init
- **THEN** it SHALL call `MatchingService.buildTrigramIndex` and `MatchingService.configureScoring`
- **AND** those methods SHALL remain the scoring-prep entry points on MatchingService
