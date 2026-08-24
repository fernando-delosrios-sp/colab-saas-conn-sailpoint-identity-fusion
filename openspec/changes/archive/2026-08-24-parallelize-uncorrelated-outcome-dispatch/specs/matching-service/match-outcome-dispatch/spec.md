## ADDED Requirements

### Requirement: Identity-phase outcome dispatch MAY overlap within the fusion parallel batch cap

After identity-phase scoring returns `identityResults`, `MatchOutcomeDispatcher.runMatchSweep` in Dispatch mode SHALL apply outcomes with bounded concurrency. Effective dispatch concurrency MUST be `getFusionParallelBatchSize` (`max(1, min(managedAccountsBatchSize, 12))`). Dispatch MUST NOT use uncapped `Promise.all` over the full `identityResults` array. Dispatch concurrency MUST be independent of `scoringMaxConcurrency`. Automatic merge application (`handleExactMatch` / `processFusionIdentityDecision`) MUST remain single-flight for the duration of that `runMatchSweep` invocation. Partial-match form creation and non-match registration MAY overlap. `MatchOutcomeDispatcher` MUST NOT store the exact-match serial gate as instance state; it MUST be local to the sweep invocation. Deferred drain sequential-within-source behavior is unchanged.

#### Scenario: Identity-phase non-match dispatch overlaps up to the fusion parallel cap

- **GIVEN** `managedAccountsBatchSize` is 100
- **AND** identity-phase scoring produced 40 authoritative non-match results with deferred matching disabled
- **WHEN** `runMatchSweep` applies those identity-phase outcomes
- **THEN** at most 12 outcome dispatches SHALL be in flight at once
- **AND** all 40 accounts SHALL still be counted in `MatchSweepResult.processed` and `nonMatch`

#### Scenario: Dispatch cap follows managedAccountsBatchSize when lower than 12

- **GIVEN** `managedAccountsBatchSize` is 3
- **AND** identity-phase scoring produced 10 non-match results
- **WHEN** identity-phase outcomes are dispatched
- **THEN** at most 3 outcome dispatches SHALL be in flight at once

#### Scenario: Exact-match application does not overlap

- **GIVEN** two identity-phase results that both resolve to automatic merge
- **WHEN** `runMatchSweep` applies those outcomes
- **THEN** `processFusionIdentityDecision` for the second merge SHALL NOT start until the first merge's `processFusionIdentityDecision` has settled
- **AND** both accounts SHALL still appear as exact matches in `MatchSweepResult`

#### Scenario: Partial-match form creation may overlap

- **GIVEN** `managedAccountsBatchSize` is 10
- **AND** identity-phase scoring produced 8 partial-match results that require review forms
- **WHEN** identity-phase outcomes are dispatched
- **THEN** more than one `createFusionForm` call MAY be in flight at the same time
- **AND** at most 10 such dispatches SHALL be in flight at once
- **AND** ISC form HTTP SHALL still go through FormService (and therefore ClientService `ApiQueue`)

#### Scenario: Scoring concurrency contract is unchanged

- **GIVEN** `scoringMaxConcurrency` is 5 and `managedAccountsBatchSize` is 100
- **WHEN** identity-phase scoring runs
- **THEN** at most 5 identity-comparison scoring operations SHALL run concurrently
- **AND** identity-phase outcome dispatch MAY still use the fusion parallel batch cap of 12

#### Scenario: Deferred drain remains sequential within a source

- **GIVEN** multiple pending accounts for the same deferred-enabled source
- **WHEN** the deferred drain executes
- **THEN** accounts SHALL still be scored and dispatched one at a time in deterministic order
- **AND** the candidate pool SHALL reflect outcomes from earlier accounts before the next account is scored
