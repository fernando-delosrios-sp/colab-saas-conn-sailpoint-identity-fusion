## MODIFIED Requirements

### Requirement: FusionService delegates match outcome dispatch to MatchOutcomeDispatcher

FusionService SHALL delegate managed-account match outcome dispatch to `MatchOutcomeDispatcher.runMatchSweep()`. FusionService SHALL NOT call MatchOutcomeDispatcher scoring internals (for example `scoreIdentityPhase`, deferred drain helpers) or invoke `MatchingService` comparison methods directly to perform a sweep. FusionService MAY call `MatchingService.buildTrigramIndex` during `initializeManagedAccountProcessing`.

#### Scenario: Uncorrelated sweep delegates to MatchOutcomeDispatcher

- **WHEN** `processUncorrelatedManagedAccounts` drains the remaining work queue
- **THEN** FusionService SHALL call `matchOutcomeDispatcher.runMatchSweep(accounts, batchSize)` once with the full remaining queue
- **AND** FusionService SHALL NOT invoke `MatchingService.processUncorrelatedManagedAccounts`

#### Scenario: Single-account processing delegates to MatchOutcomeDispatcher

- **WHEN** `processManagedAccount` handles one managed account
- **THEN** FusionService SHALL call `matchOutcomeDispatcher.runMatchSweep([account], 1)`
- **AND** FusionService SHALL NOT implement its own outcome resolution switch for that account

#### Scenario: Scoring prep during init is permitted

- **WHEN** `initializeManagedAccountProcessing` completes
- **THEN** FusionService SHALL have called `matchingService.buildTrigramIndex` with the current fusion identity iterable
- **AND** FusionService SHALL NOT call `matchingService.configureScoring`
- **AND** FusionService SHALL have seeded deferred candidates and built the linked-account key index as part of the same init phase

#### Scenario: FusionService does not orchestrate sweep scoring internals

- **WHEN** a managed-account sweep runs
- **THEN** FusionService SHALL NOT call `scoreIdentityPhase` or deferred drain helpers directly
- **AND** those steps SHALL execute only inside `MatchOutcomeDispatcher.runMatchSweep`
