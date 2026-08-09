## REMOVED Requirements

### Requirement: FusionService delegates matching to MatchingService

**Reason:** Describes an incomplete July 2026 refactor target. Production code delegates match outcome dispatch to `MatchOutcomeDispatcher`, not `MatchingService.processUncorrelatedManagedAccounts`. MatchingService is the scoring engine, not the sweep orchestrator.

**Migration:** See ADDED requirements for pipeline phases and MatchOutcomeDispatcher delegation.

---

## ADDED Requirements

### Requirement: FusionService owns managed-account pipeline phases

FusionService SHALL orchestrate the managed-account Process-phase pipeline in order: (1) `initializeManagedAccountProcessing`, (2) correlated account sweep, (3) record unique registration, (4) uncorrelated sweep, followed by disable-operation drain and form reconciliation as defined elsewhere. FusionService SHALL NOT duplicate match outcome resolution logic inside private methods — all match dispatch for managed accounts SHALL go through `MatchOutcomeDispatcher.runMatchSweep()`.

#### Scenario: Process phase runs pipeline phases in order

- **WHEN** the account-list process phase executes managed-account processing
- **THEN** FusionService SHALL run managed-account init, correlated sweep, record unique registration, and uncorrelated sweep in that order
- **AND** each phase SHALL use the public methods defined on FusionService for that phase

#### Scenario: Correlated account sweep remains a FusionService pipeline phase

- **WHEN** `processCorrelatedManagedAccounts` runs
- **THEN** FusionService SHALL filter managed accounts with `uncorrelated === false`
- **AND** FusionService SHALL orchestrate per-account processing before the uncorrelated batch sweep
- **AND** the correlated account sweep SHALL NOT be classified as the identity-scoring or deferred-drain sweep owned by MatchOutcomeDispatcher

### Requirement: FusionService delegates match outcome dispatch to MatchOutcomeDispatcher

FusionService SHALL delegate managed-account match outcome dispatch to `MatchOutcomeDispatcher.runMatchSweep()`. FusionService SHALL NOT call MatchOutcomeDispatcher scoring internals (for example `scoreIdentityPhase`, deferred drain helpers) or invoke `MatchingService` comparison methods directly to perform a sweep. FusionService MAY call `MatchingService` scoring-prep methods (`buildTrigramIndex`, `configureScoring`) during `initializeManagedAccountProcessing`.

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
- **AND** FusionService SHALL have called `matchingService.configureScoring` with `captureBreakdown` derived from report-capture settings
- **AND** FusionService SHALL have seeded deferred candidates and built the linked-account key index as part of the same init phase

#### Scenario: FusionService does not orchestrate sweep scoring internals

- **WHEN** a managed-account sweep runs
- **THEN** FusionService SHALL NOT call `scoreIdentityPhase` or deferred drain helpers directly
- **AND** those steps SHALL execute only inside `MatchOutcomeDispatcher.runMatchSweep`
