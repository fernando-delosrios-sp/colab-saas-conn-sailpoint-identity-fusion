> **Archive note (2026-08-09):** Terminology in this delta reflects the change at archive time. Current canonical terms: **`MatchOutcomeDispatcher`** (replaces `ManagedAccountPassRunner` / `ManagedAccountMatchingRunner`); **`configureScoring({ captureBreakdown })`** (replaces `setCaptureBreakdown`). See `openspec/changes/archive/README.md` and living specs after `reconcile-matching-delegation-spec`.

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

