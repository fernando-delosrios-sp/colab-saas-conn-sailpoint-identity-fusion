## MODIFIED Requirements

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
