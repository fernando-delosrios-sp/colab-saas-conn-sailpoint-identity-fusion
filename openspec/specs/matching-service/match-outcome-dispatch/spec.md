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

`MatchOutcomeDispatcher` SHALL route each scored account to exactly one of the four outcomes: exact match (automatic assignment), partial match (review form), deferred match (claim for later), or non-match (register as new Fusion account). It SHALL apply the domain action associated with each outcome.

#### Scenario: Exact match triggers automatic assignment
- **WHEN** a managed account scores above the automatic assignment threshold with all mandatory rules passing
- **THEN** `MatchOutcomeDispatcher` SHALL mark the identity auto-assigned, register a synthetic FusionDecision via `FormService`, and apply the decision

#### Scenario: Partial match triggers a review form
- **WHEN** a managed account scores above the manual review threshold but below automatic assignment
- **THEN** `MatchOutcomeDispatcher` SHALL create a Fusion review form via `FormService` and clear the candidate references

#### Scenario: Deferred match defers identity creation
- **WHEN** the best candidate for a managed account is a deferred candidate from the same source
- **THEN** `MatchOutcomeDispatcher` SHALL claim the managed account for later comparison and log the deferred matches

#### Scenario: Non-match registers a new Fusion account
- **WHEN** a managed account has no acceptable identity or deferred candidates
- **THEN** `MatchOutcomeDispatcher` SHALL register the provisional Fusion account in `FusionRun` and, for authoritative sources, register it as a deferred candidate if deferred matching is enabled

---

### Requirement: MatchOutcomeDispatcher does not hold mutable run-scoped state

`MatchOutcomeDispatcher` SHALL be a stateless strategy object. All mutable data for the operation run SHALL be read from and written to `FusionRun`. `MatchOutcomeDispatcher` SHALL NOT maintain per-run caches, indexes, or accumulators internally.

#### Scenario: Scoring state lives in FusionRun
- **WHEN** `MatchOutcomeDispatcher` records match scoring duration
- **THEN** it SHALL write to `run.matchScoringMs` and not store the value in an instance field

#### Scenario: Candidate registry state lives in FusionRun
- **WHEN** deferred candidates are registered during a sweep
- **THEN** `FusionRun` SHALL own the candidate registry and `MatchOutcomeDispatcher` SHALL query it through `run.currentRunDeferredCandidatesForSource(...)`
