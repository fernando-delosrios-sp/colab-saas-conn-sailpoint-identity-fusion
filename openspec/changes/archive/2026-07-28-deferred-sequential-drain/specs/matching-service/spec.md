## MODIFIED Requirements

### Requirement: MatchingService handles deferred candidate matching

When scoring produces deferred-candidate matches, MatchingService SHALL defer identity creation for the incoming managed account by not producing a new Fusion account for that account in the current run. When the incoming account matches only persisted fusion anchors from prior runs, MatchingService SHALL likewise defer the incoming account without re-materializing those anchors. When the incoming account deferred-matches a pending managed account from the same sweep that has not yet been materialized, MatchOutcomeDispatcher SHALL register that pending account as a non-match Fusion account and remove it from the pending sweep queue.

#### Scenario: Deferred match skips account
- **GIVEN** a managed account with deferred-candidate matches against candidates in the current deferred pool
- **WHEN** MatchOutcomeDispatcher handles the outcome
- **THEN** the incoming managed account SHALL be removed from the work queue
- **AND** no Fusion account SHALL be created for the incoming account in this run

#### Scenario: Deferred match materializes matched pending candidates
- **GIVEN** a managed account A that deferred-matches pending managed account B in the same sweep (B not yet materialized)
- **WHEN** MatchOutcomeDispatcher handles the deferred outcome for A
- **THEN** B SHALL be registered as a non-match Fusion account
- **AND** B SHALL be removed from the pending sweep queue and deferred candidate pool
- **AND** B SHALL not be evaluated again in this sweep

#### Scenario: Clique produces one anchor not all deferred
- **GIVEN** N managed accounts from the same deferred-enabled source with no persisted anchors and mutual deferred-match scores
- **WHEN** the deferred drain completes for that source
- **THEN** exactly one account SHALL become a non-match Fusion account anchor
- **AND** the remaining N−1 accounts SHALL be deferred

### Requirement: MatchingService owns the two-sweep matching runner

MatchingService SHALL orchestrate the two-sweep matching lifecycle (identity scoring sweep → deferred drain) via `MatchOutcomeDispatcher`. The identity sweep MAY score accounts in parallel batches. The deferred drain SHALL process pending accounts sequentially within each managed source in deterministic order, mutating the candidate pool after each account.

#### Scenario: Runner executes identity scoring sweep
- **WHEN** MatchingService processes uncorrelated managed accounts
- **THEN** MatchOutcomeDispatcher SHALL execute identity-phase scoring for all accounts (parallel batches permitted)
- **AND** results SHALL be classified as identity-match or deferred-pending

#### Scenario: Runner executes deferred scoring sweep
- **WHEN** the identity sweep completes with deferred-pending accounts for a source
- **THEN** MatchOutcomeDispatcher SHALL evaluate each pending account one at a time against the current per-source candidate pool
- **AND** the pool SHALL include persisted fusion anchors plus materialized non-match anchors from earlier steps in the same drain
- **AND** results SHALL be classified as deferred-match or non-match before advancing to the next pending account

### Requirement: MatchingService owns the CandidateRegistry

MatchingService SHALL create and manage the CandidateRegistry for per-source deferred candidate tracking across analysis sweeps. Persisted fusion accounts from prior runs SHALL be seeded into the registry before the deferred drain begins. Pending managed accounts SHALL NOT be bulk-registered before scoring; only materialized anchors and persisted seeds SHALL appear in the pool during drain.

#### Scenario: Candidates registered during identity sweep
- **WHEN** an authoritative account from a deferred-enabled source has no identity match during identity phase
- **THEN** the account SHALL be classified as deferred-pending
- **AND** it SHALL NOT be bulk-registered in CandidateRegistry before the deferred drain

#### Scenario: Persisted anchors seeded at sweep start
- **WHEN** managed account processing initializes for a deferred-enabled source with existing fusion accounts
- **THEN** those fusion accounts SHALL be registered as persisted deferred candidates for the managed source (using `originSource` bucketing)
- **AND** they SHALL be visible to the first pending account scored in the deferred drain

#### Scenario: Materialized anchor joins pool
- **WHEN** a pending account is classified as non-match during the deferred drain
- **THEN** its Fusion account SHALL be registered as an anchor deferred candidate for subsequent pending accounts in the same source during the same sweep
