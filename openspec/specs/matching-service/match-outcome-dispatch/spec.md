## ADDED Requirements

### Requirement: MatchOutcomeDispatcher is the single module for Match step outcome dispatch

The connector SHALL provide a `MatchOutcomeDispatcher` module in `src/services/matchingService/` that owns the entire Match outcome dispatch for managed source accounts: scoring identity and deferred candidates, resolving the outcome (exact match, partial match, deferred match, or non-match), and applying the resulting action.

#### Scenario: Match outcome dispatch is centralized
- **WHEN** an uncorrelated managed source account needs to be matched
- **THEN** `FusionService` SHALL delegate to `MatchOutcomeDispatcher.runMatchSweep()` rather than duplicating the resolution switch inside `FusionService`

#### Scenario: Match outcome dispatch is testable through one interface
- **WHEN** a test exercises the Match step
- **THEN** it SHALL drive `MatchOutcomeDispatcher` through `runMatchSweep()` with real `MatchingService` and mocked collaborators

---

### Requirement: MatchOutcomeDispatcher exposes `runMatchSweep` as its public interface

`MatchOutcomeDispatcher` SHALL expose a single public method `runMatchSweep(accounts, batchSize): MatchSweepResult` that scores the supplied accounts and dispatches each to its outcome. No other public method on `MatchOutcomeDispatcher` SHALL be required by callers to perform a managed-account matching sweep.

#### Scenario: FusionService invokes one verb
- **WHEN** `FusionService` processes a correlated or uncorrelated managed-account sweep
- **THEN** it SHALL call `matchOutcomeDispatcher.runMatchSweep(accounts, batchSize)` exactly once per sweep

#### Scenario: MatchSweepResult reports outcomes
- **WHEN** `runMatchSweep()` completes
- **THEN** it SHALL return `MatchSweepResult` containing `processed`, `matchScoringMs`, counts by resolution, and a `ResolvedMatch[]` list

---

### Requirement: MatchOutcomeDispatcher depends on real collaborators, not closures

`MatchOutcomeDispatcher` SHALL receive its dependencies through the ServiceRegistry as explicit constructor parameters: `FusionRun`, `FormService`, `CorrelationManager`, `DefinitionService`, `MatchingService`, the account-assembly module, `FusionConfig`, and `LogService`. It SHALL NOT receive closures over private methods of `FusionService`.

#### Scenario: Outcome dispatch uses FormService directly
- **WHEN** `MatchOutcomeDispatcher` handles a partial match
- **THEN** it SHALL call `formService.createFusionForm(...)` directly rather than a closure over a private `FusionService` method

#### Scenario: Outcome dispatch uses FusionRun directly
- **WHEN** `MatchOutcomeDispatcher` needs to queue a disable operation or remove a managed account from the work queue
- **THEN** it SHALL call `run.queueDisableOperation(...)` or `run.removeMatchAccount(...)` rather than a closure over `FusionService`

---

### Requirement: MatchOutcomeDispatcher applies the four Match outcomes

`MatchOutcomeDispatcher` SHALL route each scored account to exactly one of the four outcomes: exact match (automatic merge), partial match (review form), deferred match (claim for later), or non-match (register as new Fusion account). It SHALL apply the domain action associated with each outcome.

#### Scenario: Exact match triggers automatic merge
- **WHEN** a managed account scores above the automatic merge threshold with all mandatory rules passing
- **THEN** `MatchOutcomeDispatcher` SHALL mark the identity auto-merged, register a synthetic FusionDecision with `automaticMerge: true` via `FormService`, and apply the decision

#### Scenario: Partial match triggers a review form
- **WHEN** a managed account scores above the manual review threshold but below automatic merge
- **THEN** `MatchOutcomeDispatcher` SHALL create a Fusion review form via `FormService` with merge-with-existing-identity and create-new-identity options and clear the candidate references

#### Scenario: Deferred match defers identity creation
- **WHEN** the best candidate for a managed account is a deferred candidate from the same source
- **THEN** `MatchOutcomeDispatcher` SHALL claim the managed account for later comparison and log the deferred matches
- **AND** for each matched candidate that is still pending in the current sweep, SHALL register that candidate as a non-match Fusion account and remove it from the pending queue and deferred candidate pool
- **AND** SHALL NOT re-materialize persisted fusion anchors from prior runs

#### Scenario: Non-match registers a new Fusion account
- **WHEN** a managed account has no acceptable identity or deferred candidates against the current pool
- **THEN** `MatchOutcomeDispatcher` SHALL register the provisional Fusion account in `FusionRun`
- **AND** for authoritative deferred-enabled sources, SHALL register it as an anchor deferred candidate for subsequent pending accounts in the same sweep

---

### Requirement: MatchOutcomeDispatcher does not hold mutable run-scoped state

`MatchOutcomeDispatcher` SHALL be a stateless strategy object. All mutable data for the operation run SHALL be read from and written to `FusionRun`. `MatchOutcomeDispatcher` SHALL NOT maintain per-run caches, indexes, or accumulators internally.

#### Scenario: Scoring state lives in FusionRun
- **WHEN** `MatchOutcomeDispatcher` records match scoring duration
- **THEN** it SHALL write to `run.matchScoringMs` and not store the value in an instance field

#### Scenario: Candidate registry state lives in FusionRun
- **WHEN** deferred candidates are registered during a sweep
- **THEN** `FusionRun` SHALL own the candidate registry and `MatchOutcomeDispatcher` SHALL query it through `run.currentRunDeferredCandidatesForSource(...)`

---

### Requirement: Managed-account scoring concurrency is capped independently of batch size

`scoreManagedAccounts` SHALL limit concurrent identity-comparison scoring operations using `scoringMaxConcurrency` from developer settings. The effective concurrency for a batch MUST be `max(1, min(batchSize, scoringMaxConcurrency))`. Scoring MUST NOT use uncapped `Promise.all` over the full batch when the batch size exceeds the configured concurrency limit.

#### Scenario: Default concurrency caps scoring at 12
- **GIVEN** `managedAccountsBatchSize` is 100 and `scoringMaxConcurrency` is unset
- **WHEN** `scoreManagedAccounts` scores a batch of 100 accounts
- **THEN** at most 12 identity-comparison scoring operations SHALL run concurrently at any time
- **AND** all 100 accounts SHALL still be scored before the batch completes

#### Scenario: Explicit concurrency is honored within batch bounds
- **GIVEN** `scoringMaxConcurrency` is 5 and the current batch contains 50 accounts
- **WHEN** identity-phase scoring runs for that batch
- **THEN** at most 5 scoring operations SHALL run concurrently at any time
- **AND** all 50 accounts SHALL be scored

#### Scenario: Concurrency does not exceed batch slice size
- **GIVEN** `scoringMaxConcurrency` is 12 and the current batch contains 3 accounts
- **WHEN** identity-phase scoring runs for that batch
- **THEN** at most 3 scoring operations SHALL run concurrently

---

### Requirement: Deferred-phase scoring uses the same concurrency cap

The deferred-candidate drain SHALL evaluate pending accounts sequentially within each managed source. Identity-phase scoring SHALL continue to use the effective concurrency limit `max(1, min(batchSize, scoringMaxConcurrency))`. Deferred drain MAY run concurrently across different managed sources.

#### Scenario: Deferred scoring respects scoringMaxConcurrency
- **GIVEN** identity-phase scoring runs for a batch larger than `scoringMaxConcurrency`
- **WHEN** identity-phase scoring runs
- **THEN** at most `scoringMaxConcurrency` identity scoring operations SHALL run concurrently at any time
- **AND** all accounts in the batch SHALL be scored before the batch completes

#### Scenario: Deferred drain is sequential within a source
- **GIVEN** multiple pending accounts for the same deferred-enabled source
- **WHEN** the deferred drain executes
- **THEN** accounts SHALL be scored and dispatched one at a time in deterministic order
- **AND** the candidate pool SHALL reflect outcomes from earlier accounts before the next account is scored

---

### Requirement: scoringMaxConcurrency developer setting

The connector SHALL expose `scoringMaxConcurrency` as a developer setting with default 12. The resolved value MUST be clamped to the inclusive range 1–50. When the setting is omitted or null, the connector MUST use 12 and MUST NOT fall back to `managedAccountsBatchSize`.

#### Scenario: Default applies when setting omitted
- **GIVEN** developer settings omit `scoringMaxConcurrency`
- **WHEN** configuration is loaded
- **THEN** the effective `scoringMaxConcurrency` SHALL be 12

#### Scenario: Configured value is clamped to safe bounds
- **GIVEN** `scoringMaxConcurrency` is configured as 200
- **WHEN** configuration is resolved for scoring
- **THEN** the effective concurrency limit SHALL be 50

#### Scenario: Setting is surfaced in connector-spec
- **GIVEN** an operator views Developer Settings in connector-spec
- **WHEN** configuring scoring throughput
- **THEN** `scoringMaxConcurrency` SHALL be available as a numeric setting with default 12

### Requirement: Partial match SHALL claim the managed account after successful review form creation

When `MatchOutcomeDispatcher.handlePartialMatch` successfully creates or reuses a Fusion review form (`createFusionForm` returns `formDefinitionReady: true`), it SHALL remove the managed account from the work queue via `run.claimAccount` using the composite managed-account key and source account `identityId`, in addition to any existing match-tracker adjustments.

#### Scenario: Partial match claims account from work queue
- **GIVEN** a managed account on the work queue with composite key `sourceId::nativeIdentity`
- **WHEN** partial match handling creates or reuses a review form successfully
- **THEN** `run.claimAccount('sourceId::nativeIdentity', identityId)` SHALL be called
- **AND** the account SHALL not remain available to subsequent Match scoring in the same aggregation run

#### Scenario: Failed form creation does not claim the account
- **GIVEN** `createFusionForm` returns `formDefinitionReady: false` or throws
- **WHEN** partial match handling completes
- **THEN** `run.claimAccount` SHALL NOT be invoked for that account solely due to partial-match dispatch



